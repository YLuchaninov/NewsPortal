from __future__ import annotations

import uuid
from collections.abc import Awaitable, Callable, Mapping, Sequence
from datetime import datetime
from typing import Any

import psycopg

from .runtime_json import coerce_text_list
from .scoring import parse_datetime

FetchArticleVectors = Callable[[Any, Any], Awaitable[dict[str, list[float]]]]
RebuildClusterState = Callable[..., Awaitable[bool]]
ComputeContentHash = Callable[[Mapping[str, Any]], str]
MixWeightedVectors = Callable[[list[tuple[float, Sequence[float]]]], list[float]]
UpsertEmbeddingRegistry = Callable[..., Awaitable[str]]
UpsertEventVectorRegistry = Callable[..., Awaitable[None]]


def _legacy_worker_main() -> Any:
    from . import main as legacy_main

    return legacy_main


async def fetch_cluster_event_vector(
    cursor: psycopg.AsyncCursor[Any],
    cluster_id: uuid.UUID,
) -> list[float]:
    await cursor.execute(
        """
        select er.embedding_json
        from event_vector_registry evr
        join embedding_registry er on er.embedding_id = evr.embedding_id
        where evr.entity_type = 'event_cluster'
          and evr.entity_id = %s
          and evr.vector_type = 'e_event'
          and evr.is_active = true
          and er.is_active = true
        order by evr.updated_at desc
        limit 1
        """,
        (cluster_id,),
    )
    row = await cursor.fetchone()
    if row is None:
        return []
    return [float(value) for value in row["embedding_json"]]


async def load_recent_cluster_candidates(
    cursor: psycopg.AsyncCursor[Any],
) -> list[dict[str, Any]]:
    await cursor.execute(
        """
        select
          cluster_id,
          article_count,
          primary_title,
          top_entities,
          top_places,
          min_published_at,
          max_published_at,
          centroid_embedding_id
        from event_clusters
        where max_published_at is null or max_published_at >= now() - interval '72 hours'
        order by coalesce(max_published_at, created_at) desc
        limit 200
        """
    )
    return list(await cursor.fetchall())


async def rebuild_cluster_state(
    cursor: psycopg.AsyncCursor[Any],
    *,
    cluster_id: uuid.UUID,
    vector_version: int,
    fetch_article_vectors_func: FetchArticleVectors | None = None,
    upsert_embedding_registry_func: UpsertEmbeddingRegistry | None = None,
    upsert_event_vector_registry_func: UpsertEventVectorRegistry | None = None,
    compute_content_hash_func: ComputeContentHash | None = None,
    mix_weighted_vectors_func: MixWeightedVectors | None = None,
    embedding_model_key: str | None = None,
) -> bool:
    if (
        fetch_article_vectors_func is None
        or upsert_embedding_registry_func is None
        or upsert_event_vector_registry_func is None
        or compute_content_hash_func is None
        or mix_weighted_vectors_func is None
        or embedding_model_key is None
    ):
        legacy_main = _legacy_worker_main()
        fetch_article_vectors_func = (
            fetch_article_vectors_func or legacy_main.fetch_article_vectors
        )
        upsert_embedding_registry_func = (
            upsert_embedding_registry_func or legacy_main.upsert_embedding_registry
        )
        upsert_event_vector_registry_func = (
            upsert_event_vector_registry_func or legacy_main.upsert_event_vector_registry
        )
        compute_content_hash_func = (
            compute_content_hash_func or legacy_main.compute_content_hash
        )
        mix_weighted_vectors_func = (
            mix_weighted_vectors_func or legacy_main.mix_weighted_vectors
        )
        embedding_model_key = embedding_model_key or str(
            legacy_main.EMBEDDING_PROVIDER.model_key
        )

    await cursor.execute(
        """
        select
          a.doc_id,
          a.title,
          a.published_at,
          af.entities,
          af.places
        from event_cluster_members ecm
        join articles a on a.doc_id = ecm.doc_id
        left join article_features af on af.doc_id = a.doc_id
        where ecm.cluster_id = %s
        order by a.published_at desc nulls last, ecm.created_at desc
        """,
        (cluster_id,),
    )
    member_rows = list(await cursor.fetchall())
    if not member_rows:
        await cursor.execute(
            """
            delete from event_vector_registry
            where entity_type = 'event_cluster'
              and entity_id = %s
            """,
            (cluster_id,),
        )
        await cursor.execute(
            """
            update embedding_registry
            set
              is_active = false,
              updated_at = now()
            where entity_type = 'event_cluster'
              and entity_id = %s
              and vector_type = 'e_event'
            """,
            (cluster_id,),
        )
        await cursor.execute(
            """
            delete from event_clusters
            where cluster_id = %s
            """,
            (cluster_id,),
        )
        return False

    weighted_vectors: list[tuple[float, Sequence[float]]] = []
    merged_entities: list[str] = []
    merged_places: list[str] = []
    published_values: list[datetime] = []
    member_doc_ids: list[str] = []
    primary_title = ""

    for member_row in member_rows:
        member_doc_id = member_row["doc_id"]
        member_doc_ids.append(str(member_doc_id))
        if not primary_title and str(member_row.get("title") or "").strip():
            primary_title = str(member_row.get("title") or "")
        published_at = parse_datetime(member_row.get("published_at"))
        if published_at is not None:
            published_values.append(published_at)
        merged_entities.extend(coerce_text_list(member_row.get("entities")))
        merged_places.extend(coerce_text_list(member_row.get("places")))

        article_vectors = await fetch_article_vectors_func(cursor, member_doc_id)
        event_vector = article_vectors.get("e_event")
        if event_vector:
            weighted_vectors.append((1.0, event_vector))

    centroid_embedding_id: str | None = None
    if weighted_vectors:
        centroid_vector = mix_weighted_vectors_func(weighted_vectors)
        centroid_embedding_id = await upsert_embedding_registry_func(
            cursor,
            entity_type="event_cluster",
            entity_id=cluster_id,
            vector_type="e_event",
            model_key=embedding_model_key,
            vector_version=vector_version,
            vector=centroid_vector,
            content_hash=compute_content_hash_func(
                {
                    "clusterId": str(cluster_id),
                    "vectorType": "e_event",
                    "memberDocIds": member_doc_ids,
                    "version": vector_version,
                }
            ),
        )
        await upsert_event_vector_registry_func(
            cursor,
            entity_type="event_cluster",
            entity_id=cluster_id,
            vector_type="e_event",
            embedding_id=centroid_embedding_id,
            vector_version=vector_version,
        )
    else:
        await cursor.execute(
            """
            delete from event_vector_registry
            where entity_type = 'event_cluster'
              and entity_id = %s
              and vector_type = 'e_event'
            """,
            (cluster_id,),
        )

    await cursor.execute(
        """
        update event_clusters
        set
          centroid_embedding_id = %s,
          article_count = %s,
          primary_title = %s,
          top_entities = %s,
          top_places = %s,
          min_published_at = %s,
          max_published_at = %s,
          updated_at = now()
        where cluster_id = %s
        """,
        (
            centroid_embedding_id,
            len(member_rows),
            primary_title or None,
            list(dict.fromkeys(merged_entities))[:10],
            list(dict.fromkeys(merged_places))[:10],
            min(published_values) if published_values else None,
            max(published_values) if published_values else None,
            cluster_id,
        ),
    )
    return True


async def create_or_update_cluster(
    cursor: psycopg.AsyncCursor[Any],
    *,
    article: Mapping[str, Any],
    vector_version: int,
    cluster_row: Mapping[str, Any] | None,
    rebuild_cluster_state_func: RebuildClusterState | None = None,
) -> tuple[uuid.UUID, bool]:
    if rebuild_cluster_state_func is None:
        rebuild_cluster_state_func = _legacy_worker_main().rebuild_cluster_state

    article_doc_id = article["doc_id"]
    cluster_id = uuid.uuid4() if cluster_row is None else cluster_row["cluster_id"]
    is_new_cluster = cluster_row is None

    await cursor.execute(
        """
        select cluster_id
        from event_cluster_members
        where doc_id = %s
        limit 1
        """,
        (article_doc_id,),
    )
    previous_membership = await cursor.fetchone()
    previous_cluster_id = (
        uuid.UUID(str(previous_membership["cluster_id"]))
        if previous_membership is not None
        else None
    )

    if is_new_cluster:
        await cursor.execute(
            """
            insert into event_clusters (
              cluster_id,
              article_count,
              created_at,
              updated_at
            )
            values (%s, 0, now(), now())
            on conflict (cluster_id) do nothing
            """,
            (cluster_id,),
        )

    await cursor.execute(
        """
        insert into event_cluster_members (cluster_id, doc_id)
        values (%s, %s)
        on conflict (doc_id) do update
        set cluster_id = excluded.cluster_id
        """,
        (cluster_id, article_doc_id),
    )
    await rebuild_cluster_state_func(
        cursor,
        cluster_id=cluster_id,
        vector_version=vector_version,
    )
    if previous_cluster_id is not None and previous_cluster_id != cluster_id:
        await rebuild_cluster_state_func(
            cursor,
            cluster_id=previous_cluster_id,
            vector_version=vector_version,
        )
    return cluster_id, is_new_cluster

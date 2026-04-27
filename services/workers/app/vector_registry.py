from __future__ import annotations

import uuid
from collections.abc import Sequence
from typing import Any

import psycopg
from psycopg.types.json import Json

from .lexical import build_lexical_tsquery
from .runtime_json import coerce_text_list, make_json_safe
from .scoring import normalize_fts_score

INTEREST_CENTROIDS_INDEX_NAME = "interest_centroids"


async def upsert_article_features(
    cursor: psycopg.AsyncCursor[Any],
    doc_id: uuid.UUID,
    *,
    numbers: Sequence[str],
    short_tokens: Sequence[str],
    places: Sequence[str],
    entities: Sequence[str],
    search_vector_version: int,
    feature_version: int,
) -> None:
    await cursor.execute(
        """
        insert into article_features (
          doc_id,
          numbers,
          short_tokens,
          places,
          entities,
          search_vector_version,
          feature_version
        )
        values (%s, %s, %s, %s, %s, %s, %s)
        on conflict (doc_id) do update
        set
          numbers = excluded.numbers,
          short_tokens = excluded.short_tokens,
          places = excluded.places,
          entities = excluded.entities,
          search_vector_version = excluded.search_vector_version,
          feature_version = excluded.feature_version,
          updated_at = now()
        """,
        (
            doc_id,
            list(numbers),
            list(short_tokens),
            list(places),
            list(entities),
            search_vector_version,
            feature_version,
        ),
    )


async def upsert_embedding_registry(
    cursor: psycopg.AsyncCursor[Any],
    *,
    entity_type: str,
    entity_id: uuid.UUID,
    vector_type: str,
    model_key: str,
    vector_version: int,
    vector: Sequence[float],
    content_hash: str,
) -> str:
    safe_vector = [float(value) for value in vector]
    await cursor.execute(
        """
        select embedding_id::text as embedding_id
        from embedding_registry
        where entity_type = %s
          and entity_id = %s
          and vector_type = %s
          and content_hash = %s
        limit 1
        """,
        (entity_type, entity_id, vector_type, content_hash),
    )
    existing = await cursor.fetchone()

    if existing is None:
        await cursor.execute(
            """
            insert into embedding_registry (
              entity_type,
              entity_id,
              vector_type,
              model_key,
              vector_version,
              dimensions,
              embedding_json,
              content_hash,
              is_active
            )
            values (%s, %s, %s, %s, %s, %s, %s::jsonb, %s, true)
            returning embedding_id::text as embedding_id
            """,
            (
                entity_type,
                entity_id,
                vector_type,
                model_key,
                vector_version,
                len(safe_vector),
                Json(safe_vector),
                content_hash,
            ),
        )
        existing = await cursor.fetchone()
    else:
        await cursor.execute(
            """
            update embedding_registry
            set
              model_key = %s,
              vector_version = %s,
              dimensions = %s,
              embedding_json = %s::jsonb,
              is_active = true,
              updated_at = now()
            where embedding_id = %s
            """,
            (
                model_key,
                vector_version,
                len(safe_vector),
                Json(safe_vector),
                existing["embedding_id"],
            ),
        )

    embedding_id = str(existing["embedding_id"])
    await cursor.execute(
        """
        update embedding_registry
        set
          is_active = (embedding_id = %s::uuid),
          updated_at = case when embedding_id = %s::uuid then now() else updated_at end
        where entity_type = %s
          and entity_id = %s
          and vector_type = %s
        """,
        (
            embedding_id,
            embedding_id,
            entity_type,
            entity_id,
            vector_type,
        ),
    )
    return embedding_id


async def upsert_article_vector_registry(
    cursor: psycopg.AsyncCursor[Any],
    *,
    doc_id: uuid.UUID,
    vector_type: str,
    embedding_id: str,
    vector_version: int,
) -> None:
    await cursor.execute(
        """
        insert into article_vector_registry (
          doc_id,
          vector_type,
          embedding_id,
          vector_version,
          is_active,
          updated_at
        )
        values (%s, %s, %s, %s, true, now())
        on conflict (doc_id, vector_type, vector_version) do update
        set
          embedding_id = excluded.embedding_id,
          is_active = true,
          updated_at = now()
        """,
        (doc_id, vector_type, embedding_id, vector_version),
    )


async def upsert_event_vector_registry(
    cursor: psycopg.AsyncCursor[Any],
    *,
    entity_type: str,
    entity_id: uuid.UUID,
    vector_type: str,
    embedding_id: str,
    vector_version: int,
    hnsw_index_name: str | None = None,
    hnsw_label: int | None = None,
) -> None:
    await cursor.execute(
        """
        insert into event_vector_registry (
          entity_type,
          entity_id,
          vector_type,
          embedding_id,
          hnsw_index_name,
          hnsw_label,
          vector_version,
          is_active,
          updated_at
        )
        values (%s, %s, %s, %s, %s, %s, %s, true, now())
        on conflict (entity_type, entity_id, vector_type, vector_version) do update
        set
          embedding_id = excluded.embedding_id,
          hnsw_index_name = excluded.hnsw_index_name,
          hnsw_label = excluded.hnsw_label,
          is_active = true,
          updated_at = now()
        """,
        (
            entity_type,
            entity_id,
            vector_type,
            embedding_id,
            hnsw_index_name,
            hnsw_label,
            vector_version,
        ),
    )


async def upsert_interest_vector_registry(
    cursor: psycopg.AsyncCursor[Any],
    *,
    interest_id: uuid.UUID,
    vector_type: str,
    embedding_id: str,
    vector_version: int,
    hnsw_index_name: str | None = None,
    hnsw_label: int | None = None,
) -> None:
    await cursor.execute(
        """
        update interest_vector_registry
        set
          is_active = false,
          updated_at = now()
        where interest_id = %s
          and vector_type = %s
          and vector_version <> %s
          and is_active = true
        """,
        (interest_id, vector_type, vector_version),
    )
    await cursor.execute(
        """
        insert into interest_vector_registry (
          interest_id,
          vector_type,
          embedding_id,
          hnsw_index_name,
          hnsw_label,
          vector_version,
          is_active,
          updated_at
        )
        values (%s, %s, %s, %s, %s, %s, true, now())
        on conflict (interest_id, vector_type, vector_version) do update
        set
          embedding_id = excluded.embedding_id,
          hnsw_index_name = excluded.hnsw_index_name,
          hnsw_label = excluded.hnsw_label,
          is_active = true,
          updated_at = now()
        """,
        (
            interest_id,
            vector_type,
            embedding_id,
            hnsw_index_name,
            hnsw_label,
            vector_version,
        ),
    )


async def resolve_interest_hnsw_label(
    cursor: psycopg.AsyncCursor[Any],
    *,
    interest_id: uuid.UUID,
    model_key: str,
    dimensions: int,
) -> int:
    await cursor.execute(
        """
        select hnsw_label
        from interest_vector_registry
        where interest_id = %s
          and vector_type = 'centroid'
          and hnsw_label is not null
        order by updated_at desc
        limit 1
        """,
        (interest_id,),
    )
    existing_label = await cursor.fetchone()
    if existing_label is not None and existing_label["hnsw_label"] is not None:
        return int(existing_label["hnsw_label"])

    await cursor.execute(
        """
        select last_assigned_label
        from hnsw_registry
        where index_name = %s
        for update
        """,
        (INTEREST_CENTROIDS_INDEX_NAME,),
    )
    registry_row = await cursor.fetchone()
    if registry_row is None:
        await cursor.execute(
            """
            insert into hnsw_registry (
              index_name,
              model_key,
              dimensions,
              vector_version,
              entry_count,
              last_assigned_label,
              is_dirty,
              metadata_json,
              created_at,
              updated_at
            )
            values (%s, %s, %s, 1, 0, 1, true, '{}'::jsonb, now(), now())
            """,
            (
                INTEREST_CENTROIDS_INDEX_NAME,
                model_key,
                dimensions,
            ),
        )
        return 1

    next_label = int(registry_row["last_assigned_label"] or 0) + 1
    await cursor.execute(
        """
        update hnsw_registry
        set
          last_assigned_label = %s,
          model_key = %s,
          dimensions = %s,
          is_dirty = true,
          updated_at = now()
        where index_name = %s
        """,
        (
            next_label,
            model_key,
            dimensions,
            INTEREST_CENTROIDS_INDEX_NAME,
        ),
    )
    return next_label


async def mark_interest_hnsw_dirty(
    cursor: psycopg.AsyncCursor[Any],
    *,
    model_key: str,
    dimensions: int,
) -> None:
    await cursor.execute(
        """
        insert into hnsw_registry (
          index_name,
          model_key,
          dimensions,
          vector_version,
          entry_count,
          last_assigned_label,
          is_dirty,
          metadata_json,
          created_at,
          updated_at
        )
        values (
          %s,
          %s,
          %s,
          1,
          0,
          0,
          true,
          '{}'::jsonb,
          now(),
          now()
        )
        on conflict (index_name) do update
        set
          model_key = excluded.model_key,
          dimensions = excluded.dimensions,
          is_dirty = true,
          updated_at = now()
        """,
        (
            INTEREST_CENTROIDS_INDEX_NAME,
            model_key,
            dimensions,
        ),
    )


async def upsert_interest_compiled_row(
    cursor: psycopg.AsyncCursor[Any],
    *,
    interest_id: uuid.UUID,
    source_version: int,
    compile_status: str,
    source_snapshot_json: dict[str, Any],
    compiled_json: dict[str, Any],
    centroid_embedding_id: str | None,
    error_text: str | None,
) -> None:
    compiled_at = "now()" if compile_status == "compiled" else "null"
    await cursor.execute(
        f"""
        insert into user_interests_compiled (
          interest_id,
          source_version,
          compile_status,
          source_snapshot_json,
          compiled_json,
          centroid_embedding_id,
          compiled_at,
          error_text,
          created_at,
          updated_at
        )
        values (%s, %s, %s, %s::jsonb, %s::jsonb, %s, {compiled_at}, %s, now(), now())
        on conflict (interest_id) do update
        set
          source_version = excluded.source_version,
          compile_status = excluded.compile_status,
          source_snapshot_json = excluded.source_snapshot_json,
          compiled_json = excluded.compiled_json,
          centroid_embedding_id = excluded.centroid_embedding_id,
          compiled_at = excluded.compiled_at,
          error_text = excluded.error_text,
          updated_at = now()
        """,
        (
            interest_id,
            source_version,
            compile_status,
            Json(make_json_safe(source_snapshot_json)),
            Json(make_json_safe(compiled_json)),
            centroid_embedding_id,
            error_text,
        ),
    )


async def upsert_criterion_compiled_row(
    cursor: psycopg.AsyncCursor[Any],
    *,
    criterion_id: uuid.UUID,
    source_version: int,
    compile_status: str,
    source_snapshot_json: dict[str, Any],
    compiled_json: dict[str, Any],
    centroid_embedding_id: str | None,
    error_text: str | None,
) -> None:
    compiled_at = "now()" if compile_status == "compiled" else "null"
    await cursor.execute(
        f"""
        insert into criteria_compiled (
          criterion_id,
          source_version,
          compile_status,
          source_snapshot_json,
          compiled_json,
          centroid_embedding_id,
          compiled_at,
          error_text,
          created_at,
          updated_at
        )
        values (%s, %s, %s, %s::jsonb, %s::jsonb, %s, {compiled_at}, %s, now(), now())
        on conflict (criterion_id) do update
        set
          source_version = excluded.source_version,
          compile_status = excluded.compile_status,
          source_snapshot_json = excluded.source_snapshot_json,
          compiled_json = excluded.compiled_json,
          centroid_embedding_id = excluded.centroid_embedding_id,
          compiled_at = excluded.compiled_at,
          error_text = excluded.error_text,
          updated_at = now()
        """,
        (
            criterion_id,
            source_version,
            compile_status,
            Json(make_json_safe(source_snapshot_json)),
            Json(make_json_safe(compiled_json)),
            centroid_embedding_id,
            error_text,
        ),
    )


async def update_interest_compile_status(
    cursor: psycopg.AsyncCursor[Any],
    *,
    interest_id: uuid.UUID,
    compiled: bool,
    compile_status: str,
) -> None:
    await cursor.execute(
        """
        update user_interests
        set
          compiled = %s,
          compile_status = %s,
          updated_at = now()
        where interest_id = %s
        """,
        (compiled, compile_status, interest_id),
    )


async def update_criterion_compile_status(
    cursor: psycopg.AsyncCursor[Any],
    *,
    criterion_id: uuid.UUID,
    compiled: bool,
    compile_status: str,
) -> None:
    await cursor.execute(
        """
        update criteria
        set
          compiled = %s,
          compile_status = %s,
          updated_at = now()
        where criterion_id = %s
        """,
        (compiled, compile_status, criterion_id),
    )



async def fetch_article_features_row(
    cursor: psycopg.AsyncCursor[Any],
    doc_id: uuid.UUID,
) -> dict[str, list[str]]:
    await cursor.execute(
        """
        select numbers, short_tokens, places, entities
        from article_features
        where doc_id = %s
        """,
        (doc_id,),
    )
    row = await cursor.fetchone()
    if row is None:
        return {
            "numbers": [],
            "short_tokens": [],
            "places": [],
            "entities": [],
        }
    return {
        "numbers": coerce_text_list(row.get("numbers")),
        "short_tokens": coerce_text_list(row.get("short_tokens")),
        "places": coerce_text_list(row.get("places")),
        "entities": coerce_text_list(row.get("entities")),
    }


async def fetch_article_vectors(
    cursor: psycopg.AsyncCursor[Any],
    doc_id: uuid.UUID,
) -> dict[str, list[float]]:
    await cursor.execute(
        """
        select
          avr.vector_type,
          er.embedding_json
        from article_vector_registry avr
        join embedding_registry er on er.embedding_id = avr.embedding_id
        where avr.doc_id = %s
          and avr.is_active = true
          and er.is_active = true
        """,
        (doc_id,),
    )
    rows = await cursor.fetchall()
    result: dict[str, list[float]] = {}
    for row in rows:
        result[str(row["vector_type"])] = [float(value) for value in row["embedding_json"]]
    return result


async def fetch_embedding_vectors_by_ids(
    cursor: psycopg.AsyncCursor[Any],
    embedding_ids: Sequence[str],
) -> list[list[float]]:
    if not embedding_ids:
        return []

    await cursor.execute(
        """
        select embedding_id::text as embedding_id, embedding_json
        from embedding_registry
        where embedding_id = any(%s::uuid[])
        order by array_position(%s::uuid[], embedding_id)
        """,
        (list(embedding_ids), list(embedding_ids)),
    )
    rows = await cursor.fetchall()
    vectors: list[list[float]] = []
    for row in rows:
        vectors.append([float(value) for value in row["embedding_json"]])
    return vectors


async def compute_lexical_score(
    cursor: psycopg.AsyncCursor[Any],
    doc_id: uuid.UUID,
    lexical_query: str,
) -> float:
    tsquery = build_lexical_tsquery(lexical_query)
    if not tsquery:
        return 0.0

    await cursor.execute(
        """
        select
          ts_rank_cd(
            search_vector,
            to_tsquery('simple', %s)
          ) as score
        from articles
        where doc_id = %s
        """,
        (tsquery, doc_id),
    )
    row = await cursor.fetchone()
    raw_score = float(row["score"] or 0.0) if row else 0.0
    return normalize_fts_score(raw_score)

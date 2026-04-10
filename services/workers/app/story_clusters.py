from __future__ import annotations

import re
import uuid
from typing import Any, Mapping, Sequence
from urllib.parse import urlparse

import psycopg
from psycopg.types.json import Json

from .scoring import (
    compute_cluster_same_event_score,
    cosine_similarity,
    decide_cluster,
    hours_between,
    overlap_ratio,
    parse_datetime,
)

_TITLE_TOKEN_RE = re.compile(r"[a-z0-9]+")


def extract_source_family_key(raw_url: str | None) -> str | None:
    if not raw_url:
        return None
    try:
        hostname = urlparse(str(raw_url)).hostname
    except ValueError:
        return None
    if not hostname:
        return None
    normalized = hostname.casefold()
    if normalized.startswith("www."):
        normalized = normalized[4:]
    return normalized or None


def coerce_text_list(value: Any) -> list[str]:
    if isinstance(value, (list, tuple)):
        return [str(item).strip() for item in value if str(item).strip()]
    return []


def title_token_set(value: str | None) -> set[str]:
    if not value:
        return set()
    return {token for token in _TITLE_TOKEN_RE.findall(str(value).casefold()) if token}


def compute_conflicting_signal_count(
    *,
    primary_title: str | None,
    primary_entities: Sequence[str],
    primary_places: Sequence[str],
    member_rows: Sequence[Mapping[str, Any]],
) -> int:
    primary_tokens = title_token_set(primary_title)
    primary_entity_set = {str(item).casefold() for item in primary_entities if str(item).strip()}
    primary_place_set = {str(item).casefold() for item in primary_places if str(item).strip()}

    conflicts = 0
    for row in member_rows:
        member_title = str(row.get("title") or "")
        if primary_title and member_title == primary_title:
            continue
        member_tokens = title_token_set(member_title)
        token_overlap = (
            len(primary_tokens & member_tokens) / max(len(primary_tokens), len(member_tokens))
            if primary_tokens and member_tokens
            else 0.0
        )
        member_entities = {
            str(item).casefold()
            for item in coerce_text_list(row.get("entities"))
            if str(item).strip()
        }
        member_places = {
            str(item).casefold()
            for item in coerce_text_list(row.get("places"))
            if str(item).strip()
        }
        if token_overlap >= 0.2:
            continue
        if primary_entity_set & member_entities:
            continue
        if primary_place_set & member_places:
            continue
        conflicts += 1
    return conflicts


def resolve_verification_state(
    *,
    canonical_document_count: int,
    source_family_count: int,
    corroboration_count: int,
    conflicting_signal_count: int,
) -> str:
    if conflicting_signal_count > 0 and canonical_document_count > 1:
        return "conflicting"
    if source_family_count >= 3 or (
        canonical_document_count >= 2 and source_family_count >= 2
    ):
        return "strong"
    if source_family_count >= 2 or corroboration_count >= 1:
        return "medium"
    return "weak"


def build_verification_rationale(
    *,
    canonical_document_count: int,
    observation_count: int,
    source_family_count: int,
    corroboration_count: int,
    conflicting_signal_count: int,
) -> dict[str, Any]:
    return {
        "canonicalDocumentCount": canonical_document_count,
        "observationCount": observation_count,
        "sourceFamilyCount": source_family_count,
        "corroborationCount": corroboration_count,
        "conflictingSignalCount": conflicting_signal_count,
    }


def mix_vectors(weighted_vectors: Sequence[tuple[float, Sequence[float]]]) -> list[float]:
    if not weighted_vectors:
        return []
    dimensions = len(weighted_vectors[0][1])
    totals = [0.0] * dimensions
    total_weight = 0.0
    for weight, vector in weighted_vectors:
        safe_weight = float(weight)
        total_weight += safe_weight
        for index, value in enumerate(vector):
            totals[index] += safe_weight * float(value)
    if total_weight <= 0:
        return [0.0] * dimensions
    return [value / total_weight for value in totals]


async def fetch_canonical_document_vector(
    cursor: psycopg.AsyncCursor[Any],
    canonical_document_id: uuid.UUID,
) -> list[float]:
    await cursor.execute(
        """
        select er.embedding_json
        from article_vector_registry avr
        join embedding_registry er on er.embedding_id = avr.embedding_id
        where avr.doc_id = %s
          and avr.vector_type = 'e_event'
          and avr.is_active = true
          and er.is_active = true
        order by avr.updated_at desc
        limit 1
        """,
        (canonical_document_id,),
    )
    row = await cursor.fetchone()
    if row is None:
        return []
    return [float(value) for value in row["embedding_json"]]


async def fetch_story_cluster_vector(
    cursor: psycopg.AsyncCursor[Any],
    story_cluster_id: uuid.UUID,
) -> list[float]:
    await cursor.execute(
        """
        select centroid_embedding_json
        from story_clusters
        where story_cluster_id = %s
        limit 1
        """,
        (story_cluster_id,),
    )
    row = await cursor.fetchone()
    if row is None:
        return []
    return [float(value) for value in row["centroid_embedding_json"]]


async def fetch_canonical_document_features(
    cursor: psycopg.AsyncCursor[Any],
    canonical_document_id: uuid.UUID,
) -> dict[str, Any]:
    await cursor.execute(
        """
        select
          cd.canonical_document_id,
          cd.canonical_url,
          cd.canonical_domain,
          cd.title,
          cd.published_at,
          af.entities,
          af.places
        from canonical_documents cd
        left join article_features af on af.doc_id = cd.canonical_document_id
        where cd.canonical_document_id = %s
        limit 1
        """,
        (canonical_document_id,),
    )
    row = await cursor.fetchone()
    if row is None:
        raise ValueError(
            f"Canonical document {canonical_document_id} was not found for story clustering."
        )
    return row


async def load_recent_story_cluster_candidates(
    cursor: psycopg.AsyncCursor[Any],
) -> list[dict[str, Any]]:
    await cursor.execute(
        """
        select
          story_cluster_id,
          primary_title,
          top_entities,
          top_places,
          max_published_at,
          verification_state
        from story_clusters
        where max_published_at is null or max_published_at >= now() - interval '72 hours'
        order by coalesce(max_published_at, created_at) desc
        limit 200
        """
    )
    return list(await cursor.fetchall())


async def fetch_story_cluster_membership(
    cursor: psycopg.AsyncCursor[Any],
    canonical_document_id: uuid.UUID,
) -> dict[str, Any] | None:
    await cursor.execute(
        """
        select story_cluster_id
        from story_cluster_members
        where canonical_document_id = %s
        limit 1
        """,
        (canonical_document_id,),
    )
    return await cursor.fetchone()


async def upsert_verification_result(
    cursor: psycopg.AsyncCursor[Any],
    *,
    target_type: str,
    target_id: uuid.UUID,
    verification_state: str,
    corroboration_count: int,
    source_family_count: int,
    observation_count: int,
    conflicting_signal_count: int,
    rationale_json: Mapping[str, Any],
) -> None:
    await cursor.execute(
        """
        insert into verification_results (
          target_type,
          target_id,
          verification_state,
          corroboration_count,
          source_family_count,
          observation_count,
          conflicting_signal_count,
          rationale_json
        )
        values (%s, %s, %s, %s, %s, %s, %s, %s::jsonb)
        on conflict (target_type, target_id) do update
        set
          verification_state = excluded.verification_state,
          corroboration_count = excluded.corroboration_count,
          source_family_count = excluded.source_family_count,
          observation_count = excluded.observation_count,
          conflicting_signal_count = excluded.conflicting_signal_count,
          rationale_json = excluded.rationale_json,
          updated_at = now()
        """,
        (
            target_type,
            target_id,
            verification_state,
            corroboration_count,
            source_family_count,
            observation_count,
            conflicting_signal_count,
            Json(dict(rationale_json)),
        ),
    )


async def refresh_canonical_document_verification(
    cursor: psycopg.AsyncCursor[Any],
    *,
    canonical_document_id: uuid.UUID,
) -> dict[str, Any]:
    await cursor.execute(
        """
        select
          cd.canonical_document_id,
          cd.canonical_domain,
          cd.canonical_url,
          obs.observed_url
        from canonical_documents cd
        left join document_observations obs on obs.canonical_document_id = cd.canonical_document_id
        where cd.canonical_document_id = %s
        """,
        (canonical_document_id,),
    )
    rows = list(await cursor.fetchall())
    if not rows:
        raise ValueError(
            f"Canonical document {canonical_document_id} is missing for verification."
        )

    families: set[str] = set()
    observation_count = 0
    canonical_domain = rows[0].get("canonical_domain") or extract_source_family_key(
        rows[0].get("canonical_url")
    )
    if canonical_domain:
        families.add(str(canonical_domain))
    for row in rows:
        observed_url = row.get("observed_url")
        if observed_url:
            observation_count += 1
            family = extract_source_family_key(str(observed_url))
            if family:
                families.add(family)

    corroboration_count = max(observation_count - 1, 0)
    verification_state = resolve_verification_state(
        canonical_document_count=1,
        source_family_count=len(families),
        corroboration_count=corroboration_count,
        conflicting_signal_count=0,
    )
    rationale_json = build_verification_rationale(
        canonical_document_count=1,
        observation_count=observation_count,
        source_family_count=len(families),
        corroboration_count=corroboration_count,
        conflicting_signal_count=0,
    )
    await upsert_verification_result(
        cursor,
        target_type="canonical_document",
        target_id=canonical_document_id,
        verification_state=verification_state,
        corroboration_count=corroboration_count,
        source_family_count=len(families),
        observation_count=observation_count,
        conflicting_signal_count=0,
        rationale_json=rationale_json,
    )
    return {
        "verificationState": verification_state,
        "sourceFamilyCount": len(families),
        "observationCount": observation_count,
        "corroborationCount": corroboration_count,
    }


async def rebuild_story_cluster_state(
    cursor: psycopg.AsyncCursor[Any],
    *,
    story_cluster_id: uuid.UUID,
    vector_version: int,
) -> dict[str, Any]:
    await cursor.execute(
        """
        select
          cd.canonical_document_id,
          cd.title,
          cd.published_at,
          cd.canonical_domain,
          af.entities,
          af.places
        from story_cluster_members scm
        join canonical_documents cd on cd.canonical_document_id = scm.canonical_document_id
        left join article_features af on af.doc_id = cd.canonical_document_id
        where scm.story_cluster_id = %s
        order by cd.published_at desc nulls last, scm.created_at desc
        """,
        (story_cluster_id,),
    )
    member_rows = list(await cursor.fetchall())
    if not member_rows:
        await cursor.execute(
            """
            delete from verification_results
            where target_type = 'story_cluster'
              and target_id = %s
            """,
            (story_cluster_id,),
        )
        await cursor.execute(
            """
            delete from story_clusters
            where story_cluster_id = %s
            """,
            (story_cluster_id,),
        )
        return {
            "storyClusterId": str(story_cluster_id),
            "verificationState": "weak",
            "canonicalDocumentCount": 0,
        }

    weighted_vectors: list[tuple[float, Sequence[float]]] = []
    member_doc_ids: list[str] = []
    merged_entities: list[str] = []
    merged_places: list[str] = []
    published_values = []
    primary_title = str(member_rows[0].get("title") or "") if member_rows else ""
    primary_entities = coerce_text_list(member_rows[0].get("entities")) if member_rows else []
    primary_places = coerce_text_list(member_rows[0].get("places")) if member_rows else []

    for member_row in member_rows:
        member_doc_id = uuid.UUID(str(member_row["canonical_document_id"]))
        member_doc_ids.append(str(member_doc_id))
        published_at = parse_datetime(member_row.get("published_at"))
        if published_at is not None:
            published_values.append(published_at)
        merged_entities.extend(coerce_text_list(member_row.get("entities")))
        merged_places.extend(coerce_text_list(member_row.get("places")))
        vector = await fetch_canonical_document_vector(cursor, member_doc_id)
        if vector:
            weighted_vectors.append((1.0, vector))

    await cursor.execute(
        """
        select obs.observed_url
        from story_cluster_members scm
        join document_observations obs on obs.canonical_document_id = scm.canonical_document_id
        where scm.story_cluster_id = %s
        """,
        (story_cluster_id,),
    )
    observation_rows = list(await cursor.fetchall())
    observation_count = len(observation_rows)
    source_families = {
        family
        for family in (
            extract_source_family_key(str(row.get("observed_url") or ""))
            for row in observation_rows
        )
        if family
    }
    for member_row in member_rows:
        family = str(member_row.get("canonical_domain") or "").strip()
        if family:
            source_families.add(family)

    conflicting_signal_count = compute_conflicting_signal_count(
        primary_title=primary_title,
        primary_entities=primary_entities,
        primary_places=primary_places,
        member_rows=member_rows[1:],
    )
    canonical_document_count = len(member_rows)
    corroboration_count = max(canonical_document_count - 1, 0)
    verification_state = resolve_verification_state(
        canonical_document_count=canonical_document_count,
        source_family_count=len(source_families),
        corroboration_count=corroboration_count,
        conflicting_signal_count=conflicting_signal_count,
    )
    rationale_json = build_verification_rationale(
        canonical_document_count=canonical_document_count,
        observation_count=observation_count,
        source_family_count=len(source_families),
        corroboration_count=corroboration_count,
        conflicting_signal_count=conflicting_signal_count,
    )
    centroid_vector = mix_vectors(weighted_vectors)
    await cursor.execute(
        """
        update story_clusters
        set
          centroid_embedding_json = %s::jsonb,
          centroid_vector_version = %s,
          canonical_document_count = %s,
          observation_count = %s,
          source_family_count = %s,
          corroboration_count = %s,
          conflicting_signal_count = %s,
          verification_state = %s,
          primary_title = %s,
          top_entities = %s,
          top_places = %s,
          min_published_at = %s,
          max_published_at = %s,
          updated_at = now()
        where story_cluster_id = %s
        """,
        (
            Json(centroid_vector),
            vector_version,
            canonical_document_count,
            observation_count,
            len(source_families),
            corroboration_count,
            conflicting_signal_count,
            verification_state,
            primary_title or None,
            list(dict.fromkeys(merged_entities))[:10],
            list(dict.fromkeys(merged_places))[:10],
            min(published_values) if published_values else None,
            max(published_values) if published_values else None,
            story_cluster_id,
        ),
    )
    await upsert_verification_result(
        cursor,
        target_type="story_cluster",
        target_id=story_cluster_id,
        verification_state=verification_state,
        corroboration_count=corroboration_count,
        source_family_count=len(source_families),
        observation_count=observation_count,
        conflicting_signal_count=conflicting_signal_count,
        rationale_json=rationale_json,
    )
    return {
        "storyClusterId": str(story_cluster_id),
        "verificationState": verification_state,
        "canonicalDocumentCount": canonical_document_count,
        "sourceFamilyCount": len(source_families),
        "observationCount": observation_count,
    }


async def create_or_update_story_cluster(
    cursor: psycopg.AsyncCursor[Any],
    *,
    canonical_document_id: uuid.UUID,
    vector_version: int,
    cluster_row: Mapping[str, Any] | None,
) -> tuple[uuid.UUID, bool, dict[str, Any]]:
    story_cluster_id = (
        uuid.uuid4() if cluster_row is None else uuid.UUID(str(cluster_row["story_cluster_id"]))
    )
    is_new_cluster = cluster_row is None

    await cursor.execute(
        """
        select story_cluster_id
        from story_cluster_members
        where canonical_document_id = %s
        limit 1
        """,
        (canonical_document_id,),
    )
    previous_membership = await cursor.fetchone()
    previous_story_cluster_id = (
        uuid.UUID(str(previous_membership["story_cluster_id"]))
        if previous_membership is not None
        else None
    )

    if is_new_cluster:
        await cursor.execute(
            """
            insert into story_clusters (
              story_cluster_id,
              centroid_embedding_json,
              centroid_vector_version,
              created_at,
              updated_at
            )
            values (%s, '[]'::jsonb, %s, now(), now())
            on conflict (story_cluster_id) do nothing
            """,
            (story_cluster_id, vector_version),
        )

    await cursor.execute(
        """
        insert into story_cluster_members (story_cluster_id, canonical_document_id)
        values (%s, %s)
        on conflict (canonical_document_id) do update
        set story_cluster_id = excluded.story_cluster_id
        """,
        (story_cluster_id, canonical_document_id),
    )

    rebuilt_cluster = await rebuild_story_cluster_state(
        cursor,
        story_cluster_id=story_cluster_id,
        vector_version=vector_version,
    )
    if (
        previous_story_cluster_id is not None
        and previous_story_cluster_id != story_cluster_id
    ):
        await rebuild_story_cluster_state(
            cursor,
            story_cluster_id=previous_story_cluster_id,
            vector_version=vector_version,
        )
    return story_cluster_id, is_new_cluster, rebuilt_cluster


async def sync_story_cluster_and_verification(
    cursor: psycopg.AsyncCursor[Any],
    *,
    article: Mapping[str, Any],
    vector_version: int,
) -> dict[str, Any]:
    canonical_document_id = uuid.UUID(
        str(article.get("canonical_doc_id") or article["doc_id"])
    )
    try:
        canonical_verification = await refresh_canonical_document_verification(
            cursor,
            canonical_document_id=canonical_document_id,
        )
    except ValueError as exc:
        if "is missing for verification" not in str(exc):
            raise
        return {
            "status": "skipped-missing-canonical-document",
            "canonicalDocumentId": str(canonical_document_id),
            "storyClusterId": None,
            "canonicalVerificationState": None,
            "storyVerificationState": None,
            "isNewStoryCluster": False,
        }
    membership = await fetch_story_cluster_membership(cursor, canonical_document_id)
    if uuid.UUID(str(article["doc_id"])) != canonical_document_id:
        cluster_result = None
        if membership is not None:
            cluster_result = await rebuild_story_cluster_state(
                cursor,
                story_cluster_id=uuid.UUID(str(membership["story_cluster_id"])),
                vector_version=vector_version,
            )
        return {
            "status": "duplicate-observation-synced",
            "canonicalDocumentId": str(canonical_document_id),
            "storyClusterId": None if cluster_result is None else cluster_result["storyClusterId"],
            "canonicalVerificationState": canonical_verification["verificationState"],
            "storyVerificationState": (
                None if cluster_result is None else cluster_result["verificationState"]
            ),
            "isNewStoryCluster": False,
        }

    canonical_features = await fetch_canonical_document_features(cursor, canonical_document_id)
    canonical_vector = await fetch_canonical_document_vector(cursor, canonical_document_id)
    if not canonical_vector:
        return {
            "status": "skipped-missing-canonical-vector",
            "canonicalDocumentId": str(canonical_document_id),
            "storyClusterId": None,
            "canonicalVerificationState": canonical_verification["verificationState"],
            "storyVerificationState": None,
            "isNewStoryCluster": False,
        }

    cluster_row: dict[str, Any] | None = membership
    if cluster_row is None:
        candidates = await load_recent_story_cluster_candidates(cursor)
        best_score = 0.0
        canonical_published_at = parse_datetime(canonical_features.get("published_at"))
        for candidate in candidates:
            candidate_vector = await fetch_story_cluster_vector(
                cursor, uuid.UUID(str(candidate["story_cluster_id"]))
            )
            if not candidate_vector:
                continue
            semantic_score = cosine_similarity(canonical_vector, candidate_vector)
            entity_score = overlap_ratio(
                coerce_text_list(canonical_features.get("entities")),
                coerce_text_list(candidate.get("top_entities")),
            )
            geo_score = overlap_ratio(
                coerce_text_list(canonical_features.get("places")),
                coerce_text_list(candidate.get("top_places")),
            )
            score_same_event = compute_cluster_same_event_score(
                semantic_score=semantic_score,
                entity_score=entity_score,
                geo_score=geo_score,
                delta_hours=hours_between(
                    canonical_published_at,
                    parse_datetime(candidate.get("max_published_at")),
                ),
            )
            if score_same_event > best_score and decide_cluster(score_same_event):
                best_score = score_same_event
                cluster_row = candidate

    story_cluster_id, is_new_cluster, rebuilt_cluster = await create_or_update_story_cluster(
        cursor,
        canonical_document_id=canonical_document_id,
        vector_version=vector_version,
        cluster_row=cluster_row,
    )
    return {
        "status": "story-clustered",
        "canonicalDocumentId": str(canonical_document_id),
        "storyClusterId": str(story_cluster_id),
        "canonicalVerificationState": canonical_verification["verificationState"],
        "storyVerificationState": rebuilt_cluster["verificationState"],
        "isNewStoryCluster": is_new_cluster,
    }

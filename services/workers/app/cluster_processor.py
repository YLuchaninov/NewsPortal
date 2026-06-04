from __future__ import annotations

import uuid
from collections.abc import Awaitable, Callable, Mapping
from dataclasses import dataclass
from typing import Any

import psycopg

from .signal_candidate_repository import fetch_signal_candidate_for_update as default_fetch_signal_candidate_for_update
from .runtime_json import coerce_text_list
from .runtime_values import coerce_positive_int
from .scoring import (
    compute_cluster_same_event_score,
    cosine_similarity,
    decide_cluster,
    hours_between,
    overlap_ratio,
    parse_datetime,
)
from .story_clusters import sync_story_cluster_and_verification as default_sync_story_cluster_and_verification
from .vector_registry import (
    fetch_signal_candidate_features_row as default_fetch_signal_candidate_features_row,
    fetch_signal_candidate_vectors as default_fetch_signal_candidate_vectors,
)
from .worker_events import (
    advance_processing_state as default_advance_processing_state,
    insert_outbox_event as default_insert_outbox_event,
    is_event_processed as default_is_event_processed,
    record_processed_event as default_record_processed_event,
    suppress_downstream_outbox as default_suppress_downstream_outbox,
)
from .worker_queues import (
    SIGNAL_CANDIDATE_CLUSTERED_EVENT,
    CLUSTER_CONSUMER,
    PROCESSING_STATE_ORDER,
)


@dataclass(frozen=True)
class SignalCandidateClusterProcessorDependencies:
    open_connection: Callable[[], Awaitable[Any]]
    fetch_signal_candidate_for_update: Callable[
        [psycopg.AsyncCursor[Any], str],
        Awaitable[dict[str, Any]],
    ]
    sync_story_cluster_and_verification: Callable[..., Awaitable[dict[str, Any]]]
    upsert_system_feed_result: Callable[..., Awaitable[dict[str, Any]]]
    fetch_signal_candidate_features_row: Callable[..., Awaitable[dict[str, Any]]]
    fetch_signal_candidate_vectors: Callable[..., Awaitable[dict[str, list[float]]]]
    fetch_cluster_event_vector: Callable[[psycopg.AsyncCursor[Any], uuid.UUID], Awaitable[list[float]]]
    load_recent_cluster_candidates: Callable[
        [psycopg.AsyncCursor[Any]],
        Awaitable[list[dict[str, Any]]],
    ]
    create_or_update_cluster: Callable[
        [psycopg.AsyncCursor[Any]],
        Awaitable[tuple[uuid.UUID, bool]],
    ]
    suppress_downstream_outbox: Callable[[Any], bool]
    is_event_processed: Callable[..., Awaitable[bool]]
    record_processed_event: Callable[..., Awaitable[None]]
    insert_outbox_event: Callable[..., Awaitable[None]]
    advance_processing_state: Callable[[Any, str], str]


def build_signal_candidate_cluster_processor_dependencies(
    *,
    open_connection: Callable[[], Awaitable[Any]] | None = None,
    fetch_signal_candidate_for_update: Callable[
        [psycopg.AsyncCursor[Any], str],
        Awaitable[dict[str, Any]],
    ] = default_fetch_signal_candidate_for_update,
    sync_story_cluster_and_verification: Callable[..., Awaitable[dict[str, Any]]]
    | None = default_sync_story_cluster_and_verification,
    upsert_system_feed_result: Callable[..., Awaitable[dict[str, Any]]] | None = None,
    fetch_signal_candidate_features_row: Callable[..., Awaitable[dict[str, Any]]]
    | None = default_fetch_signal_candidate_features_row,
    fetch_signal_candidate_vectors: Callable[..., Awaitable[dict[str, list[float]]]]
    | None = default_fetch_signal_candidate_vectors,
    fetch_cluster_event_vector: Callable[
        [psycopg.AsyncCursor[Any], uuid.UUID],
        Awaitable[list[float]],
    ]
    | None = None,
    load_recent_cluster_candidates: Callable[
        [psycopg.AsyncCursor[Any]],
        Awaitable[list[dict[str, Any]]],
    ]
    | None = None,
    create_or_update_cluster: Callable[..., Awaitable[tuple[uuid.UUID, bool]]] | None = None,
    suppress_downstream_outbox: Callable[[Any], bool] = default_suppress_downstream_outbox,
    is_event_processed: Callable[..., Awaitable[bool]] = default_is_event_processed,
    record_processed_event: Callable[..., Awaitable[None]] = default_record_processed_event,
    insert_outbox_event: Callable[..., Awaitable[None]] = default_insert_outbox_event,
    advance_processing_state: Callable[[Any, str], str] = default_advance_processing_state,
) -> SignalCandidateClusterProcessorDependencies:
    if open_connection is None:
        from .runtime_db import open_connection as default_open_connection

        open_connection = default_open_connection
    if (
        upsert_system_feed_result is None
        or fetch_cluster_event_vector is None
        or load_recent_cluster_candidates is None
        or create_or_update_cluster is None
    ):
        from . import main as legacy_main

        if upsert_system_feed_result is None:
            upsert_system_feed_result = legacy_main.upsert_system_feed_result
        if fetch_cluster_event_vector is None:
            fetch_cluster_event_vector = legacy_main.fetch_cluster_event_vector
        if load_recent_cluster_candidates is None:
            load_recent_cluster_candidates = legacy_main.load_recent_cluster_candidates
        if create_or_update_cluster is None:
            create_or_update_cluster = legacy_main.create_or_update_cluster

    return SignalCandidateClusterProcessorDependencies(
        open_connection=open_connection,
        fetch_signal_candidate_for_update=fetch_signal_candidate_for_update,
        sync_story_cluster_and_verification=sync_story_cluster_and_verification,
        upsert_system_feed_result=upsert_system_feed_result,
        fetch_signal_candidate_features_row=fetch_signal_candidate_features_row,
        fetch_signal_candidate_vectors=fetch_signal_candidate_vectors,
        fetch_cluster_event_vector=fetch_cluster_event_vector,
        load_recent_cluster_candidates=load_recent_cluster_candidates,
        create_or_update_cluster=create_or_update_cluster,
        suppress_downstream_outbox=suppress_downstream_outbox,
        is_event_processed=is_event_processed,
        record_processed_event=record_processed_event,
        insert_outbox_event=insert_outbox_event,
        advance_processing_state=advance_processing_state,
    )


async def process_cluster_with_dependencies(
    job: Any,
    _job_token: str,
    deps: SignalCandidateClusterProcessorDependencies,
) -> dict[str, Any]:
    event_id = str(job.data.get("eventId"))
    doc_id = str(job.data.get("docId"))
    vector_version = coerce_positive_int(job.data.get("version"), 1)
    suppress_pipeline_fanout = deps.suppress_downstream_outbox(job)

    if not event_id or event_id == "None" or not doc_id or doc_id == "None":
        raise ValueError("Cluster worker expected eventId and docId.")

    connection = await deps.open_connection()
    async with connection:
        async with connection.transaction():
            async with connection.cursor() as cursor:
                if await deps.is_event_processed(cursor, CLUSTER_CONSUMER, event_id):
                    return {"status": "duplicate-event", "docId": doc_id}

                signal_candidate = await deps.fetch_signal_candidate_for_update(cursor, doc_id)
                current_state = str(signal_candidate.get("processing_state") or "raw")
                if (
                    PROCESSING_STATE_ORDER.get(current_state, 0)
                    < PROCESSING_STATE_ORDER["embedded"]
                ):
                    raise ValueError(f"SignalCandidate {doc_id} must be embedded before clustering.")
                story_cluster_result = await deps.sync_story_cluster_and_verification(
                    cursor,
                    signal_candidate=signal_candidate,
                    vector_version=vector_version,
                )
                system_feed_result = await deps.upsert_system_feed_result(
                    cursor,
                    signal_candidate["doc_id"],
                )
                if system_feed_result is None or not bool(
                    system_feed_result.get(
                        "final_selection_selected",
                        system_feed_result.get("eligible_for_feed"),
                    )
                ):
                    await deps.record_processed_event(cursor, CLUSTER_CONSUMER, event_id)
                    return {
                        "status": "skipped-selection-gate",
                        "docId": doc_id,
                        "selectionSource": str(
                            system_feed_result.get("selection_source")
                            if system_feed_result is not None
                            else "pending"
                        ),
                        "selectionDecision": _resolve_selection_decision(system_feed_result),
                        "selectionSelected": _resolve_selection_selected(system_feed_result),
                        "storyClusterId": story_cluster_result.get("storyClusterId"),
                        "storyVerificationState": story_cluster_result.get(
                            "storyVerificationState"
                        ),
                        "canonicalVerificationState": story_cluster_result.get(
                            "canonicalVerificationState"
                        ),
                    }

                signal_candidate_features = await deps.fetch_signal_candidate_features_row(
                    cursor,
                    signal_candidate["doc_id"],
                )
                signal_candidate_vectors = await deps.fetch_signal_candidate_vectors(cursor, signal_candidate["doc_id"])
                event_vector = signal_candidate_vectors.get("e_event")
                if not event_vector:
                    raise ValueError(f"SignalCandidate {doc_id} is missing e_event embedding.")

                cluster_row: Mapping[str, Any] | None = None
                if signal_candidate.get("family_id") and signal_candidate.get("family_id") != signal_candidate["doc_id"]:
                    await cursor.execute(
                        """
                        select ec.*
                        from signal_candidates a
                        join event_clusters ec on ec.cluster_id = a.event_cluster_id
                        where a.doc_id = %s
                        limit 1
                        """,
                        (signal_candidate["family_id"],),
                    )
                    family_cluster = await cursor.fetchone()
                    if family_cluster is not None:
                        cluster_row = family_cluster

                if cluster_row is None:
                    cluster_row = await _select_cluster_candidate(
                        cursor,
                        signal_candidate=signal_candidate,
                        signal_candidate_features=signal_candidate_features,
                        event_vector=event_vector,
                        deps=deps,
                    )

                cluster_id, is_new_cluster = await deps.create_or_update_cluster(
                    cursor,
                    signal_candidate=signal_candidate,
                    vector_version=vector_version,
                    cluster_row=cluster_row,
                )
                next_state = deps.advance_processing_state(current_state, "clustered")
                await cursor.execute(
                    """
                    update signal_candidates
                    set
                      event_cluster_id = %s,
                      processing_state = %s,
                      updated_at = now()
                    where doc_id = %s
                    """,
                    (cluster_id, next_state, signal_candidate["doc_id"]),
                )
                if not suppress_pipeline_fanout:
                    await deps.insert_outbox_event(
                        cursor,
                        SIGNAL_CANDIDATE_CLUSTERED_EVENT,
                        "signal_candidate",
                        signal_candidate["doc_id"],
                        {"docId": str(signal_candidate["doc_id"]), "version": vector_version},
                    )
                await deps.record_processed_event(cursor, CLUSTER_CONSUMER, event_id)

    return {
        "status": "clustered",
        "docId": doc_id,
        "isNewCluster": is_new_cluster,
        "clusterId": str(cluster_id),
        "storyClusterId": story_cluster_result.get("storyClusterId"),
        "storyVerificationState": story_cluster_result.get("storyVerificationState"),
        "canonicalVerificationState": story_cluster_result.get(
            "canonicalVerificationState"
        ),
        "isNewStoryCluster": bool(story_cluster_result.get("isNewStoryCluster")),
    }


def _resolve_selection_decision(system_feed_result: Mapping[str, Any] | None) -> str:
    if system_feed_result is None:
        return ""
    return str(
        system_feed_result.get(
            "final_selection_decision",
            system_feed_result.get("decision"),
        )
        or ""
    )


def _resolve_selection_selected(system_feed_result: Mapping[str, Any] | None) -> bool:
    if system_feed_result is None:
        return False
    return bool(
        system_feed_result.get(
            "final_selection_selected",
            system_feed_result.get("eligible_for_feed"),
        )
    )


async def _select_cluster_candidate(
    cursor: psycopg.AsyncCursor[Any],
    *,
    signal_candidate: Mapping[str, Any],
    signal_candidate_features: Mapping[str, Any],
    event_vector: list[float],
    deps: SignalCandidateClusterProcessorDependencies,
) -> Mapping[str, Any] | None:
    candidates = await deps.load_recent_cluster_candidates(cursor)
    best_score = 0.0
    cluster_row: Mapping[str, Any] | None = None
    signal_candidate_published_at = parse_datetime(signal_candidate.get("published_at"))
    for candidate in candidates:
        candidate_vector = await deps.fetch_cluster_event_vector(
            cursor,
            candidate["cluster_id"],
        )
        if not candidate_vector:
            continue
        semantic_score = cosine_similarity(event_vector, candidate_vector)
        entity_score = overlap_ratio(
            signal_candidate_features.get("entities", []),
            coerce_text_list(candidate.get("top_entities")),
        )
        geo_score = overlap_ratio(
            signal_candidate_features.get("places", []),
            coerce_text_list(candidate.get("top_places")),
        )
        score_same_event = compute_cluster_same_event_score(
            semantic_score=semantic_score,
            entity_score=entity_score,
            geo_score=geo_score,
            delta_hours=hours_between(
                signal_candidate_published_at,
                parse_datetime(candidate.get("max_published_at")),
            ),
        )
        if score_same_event > best_score:
            best_score = score_same_event
            cluster_row = candidate if decide_cluster(score_same_event) else cluster_row
    return cluster_row


async def process_cluster(job: Any, job_token: str) -> dict[str, Any]:
    return await process_cluster_with_dependencies(
        job,
        job_token,
        build_signal_candidate_cluster_processor_dependencies(),
    )

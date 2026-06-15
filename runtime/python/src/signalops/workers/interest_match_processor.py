from __future__ import annotations

import uuid
from collections import defaultdict
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

from psycopg.types.json import Json

from .interest_filters import (
    build_interest_filter_explain,
    resolve_interest_filter_context,
    resolve_user_interest_filter_outcome,
    upsert_interest_filter_result,
)
from .matching_read_repository import list_compiled_interests
from .notification_runtime import compute_novelty_score
from .runtime_json import coerce_json_object, coerce_text_list, make_json_safe
from .runtime_values import coerce_bool, coerce_optional_string
from .runtime_db import open_connection
from .scoring import (
    compute_interest_final_score,
    compute_interest_meta_score,
    decide_interest,
    semantic_prototype_score,
)
from .selection_gate_repository import fetch_selection_gate_result_row
from .selection_runtime import passes_hard_filters
from .signal_candidate_repository import fetch_signal_candidate_for_update
from .vector_registry import (
    fetch_embedding_vectors_by_ids,
    fetch_signal_candidate_features_row,
    fetch_signal_candidate_vectors,
)
from .worker_events import (
    advance_processing_state,
    insert_outbox_event,
    is_event_processed,
    record_processed_event,
    suppress_downstream_outbox,
)
from .worker_queues import SIGNAL_CANDIDATE_INTERESTS_MATCHED_EVENT, INTEREST_MATCH_CONSUMER


@dataclass(frozen=True)
class InterestMatchProcessorDependencies:
    open_connection: Callable[[], Awaitable[Any]]
    suppress_downstream_outbox: Callable[[Any], bool]
    is_event_processed: Callable[..., Awaitable[bool]]
    fetch_signal_candidate_for_update: Callable[..., Awaitable[dict[str, Any]]]
    fetch_selection_gate_result_row: Callable[..., Awaitable[dict[str, Any] | None]]
    record_processed_event: Callable[..., Awaitable[None]]
    fetch_signal_candidate_features_row: Callable[..., Awaitable[dict[str, Any]]]
    fetch_signal_candidate_vectors: Callable[..., Awaitable[dict[str, list[float]]]]
    resolve_interest_filter_context: Callable[..., Awaitable[dict[str, Any]]]
    list_compiled_interests: Callable[..., Awaitable[list[dict[str, Any]]]]
    passes_hard_filters: Callable[..., tuple[bool, list[str], bool]]
    fetch_embedding_vectors_by_ids: Callable[..., Awaitable[list[list[float]]]]
    compute_novelty_score: Callable[..., Awaitable[tuple[float, bool]]]
    semantic_prototype_score: Callable[..., float]
    compute_interest_meta_score: Callable[..., tuple[float, dict[str, float]]]
    compute_interest_final_score: Callable[..., float]
    decide_interest: Callable[..., str]
    resolve_user_interest_filter_outcome: Callable[..., tuple[str, str]]
    upsert_interest_filter_result: Callable[..., Awaitable[None]]
    build_interest_filter_explain: Callable[..., dict[str, Any]]
    advance_processing_state: Callable[[Any, str], str]
    insert_outbox_event: Callable[..., Awaitable[None]]


def build_interest_match_processor_dependencies() -> InterestMatchProcessorDependencies:
    return InterestMatchProcessorDependencies(
        open_connection=open_connection,
        suppress_downstream_outbox=suppress_downstream_outbox,
        is_event_processed=is_event_processed,
        fetch_signal_candidate_for_update=fetch_signal_candidate_for_update,
        fetch_selection_gate_result_row=fetch_selection_gate_result_row,
        record_processed_event=record_processed_event,
        fetch_signal_candidate_features_row=fetch_signal_candidate_features_row,
        fetch_signal_candidate_vectors=fetch_signal_candidate_vectors,
        resolve_interest_filter_context=resolve_interest_filter_context,
        list_compiled_interests=list_compiled_interests,
        passes_hard_filters=passes_hard_filters,
        fetch_embedding_vectors_by_ids=fetch_embedding_vectors_by_ids,
        compute_novelty_score=compute_novelty_score,
        semantic_prototype_score=semantic_prototype_score,
        compute_interest_meta_score=compute_interest_meta_score,
        compute_interest_final_score=compute_interest_final_score,
        decide_interest=decide_interest,
        resolve_user_interest_filter_outcome=resolve_user_interest_filter_outcome,
        upsert_interest_filter_result=upsert_interest_filter_result,
        build_interest_filter_explain=build_interest_filter_explain,
        advance_processing_state=advance_processing_state,
        insert_outbox_event=insert_outbox_event,
    )


async def process_match_interests_with_dependencies(
    job: Any,
    _job_token: str,
    deps: InterestMatchProcessorDependencies,
) -> dict[str, Any]:
    event_id = str(job.data.get("eventId"))
    doc_id = str(job.data.get("docId"))
    historical_backfill = coerce_bool(job.data.get("historicalBackfill"))
    scoped_user_id = coerce_optional_string(job.data.get("userId"))
    scoped_interest_id = coerce_optional_string(job.data.get("interestId"))
    suppress_pipeline_fanout = deps.suppress_downstream_outbox(job)

    if not event_id or event_id == "None" or not doc_id or doc_id == "None":
        raise ValueError("Interest match worker expected eventId and docId.")

    connection = await deps.open_connection()
    async with connection:
        async with connection.transaction():
            async with connection.cursor() as cursor:
                if await deps.is_event_processed(cursor, INTEREST_MATCH_CONSUMER, event_id):
                    return {"status": "duplicate-event", "docId": doc_id}

                signal_candidate = await deps.fetch_signal_candidate_for_update(cursor, doc_id)
                selection_gate = await deps.fetch_selection_gate_result_row(
                    cursor,
                    signal_candidate["doc_id"],
                )
                if selection_gate is None or not bool(selection_gate.get("is_selected")):
                    await deps.record_processed_event(
                        cursor,
                        INTEREST_MATCH_CONSUMER,
                        event_id,
                    )
                    return {
                        "status": "skipped-selection-gate",
                        "docId": doc_id,
                        "interestCount": 0,
                        "selectionSource": str(
                            selection_gate.get("selection_source")
                            if selection_gate is not None
                            else "pending"
                        ),
                        "selectionDecision": str(
                            selection_gate.get("decision")
                            if selection_gate is not None
                            else ""
                        ),
                        "selectionSelected": bool(
                            selection_gate.get("is_selected")
                            if selection_gate is not None
                            else False
                        ),
                    }
                signal_candidate_features = await deps.fetch_signal_candidate_features_row(
                    cursor,
                    signal_candidate["doc_id"],
                )
                signal_candidate_vectors = await deps.fetch_signal_candidate_vectors(cursor, signal_candidate["doc_id"])
                filter_context = await deps.resolve_interest_filter_context(
                    cursor,
                    signal_candidate=signal_candidate,
                    prefer_story_cluster=True,
                )
                if scoped_user_id or scoped_interest_id:
                    cleanup_filters = ["doc_id = %s"]
                    cleanup_params: list[Any] = [signal_candidate["doc_id"]]
                    if scoped_user_id:
                        cleanup_filters.append("user_id = %s")
                        cleanup_params.append(scoped_user_id)
                    if scoped_interest_id:
                        cleanup_filters.append("interest_id = %s")
                        cleanup_params.append(scoped_interest_id)
                    await cursor.execute(
                        f"""
                        delete from interest_match_results
                        where {' and '.join(cleanup_filters)}
                        """,
                        tuple(cleanup_params),
                    )
                    interest_filter_cleanup_filters = [
                        "doc_id = %s",
                        "filter_scope = 'user_interest'",
                    ]
                    interest_filter_cleanup_params: list[Any] = [signal_candidate["doc_id"]]
                    if scoped_user_id:
                        interest_filter_cleanup_filters.append("user_id = %s")
                        interest_filter_cleanup_params.append(scoped_user_id)
                    if scoped_interest_id:
                        interest_filter_cleanup_filters.append("interest_id = %s")
                        interest_filter_cleanup_params.append(scoped_interest_id)
                    await cursor.execute(
                        f"""
                        delete from interest_filter_results
                        where {' and '.join(interest_filter_cleanup_filters)}
                        """,
                        tuple(interest_filter_cleanup_params),
                    )

                interest_rows = await deps.list_compiled_interests(
                    cursor,
                    user_id=scoped_user_id,
                    interest_id=scoped_interest_id,
                )
                pending_rows: list[dict[str, Any]] = []

                for interest in interest_rows:
                    compiled_json = coerce_json_object(interest.get("compiled_json"))
                    hard_constraints = coerce_json_object(
                        compiled_json.get("hard_constraints")
                    )
                    pass_filters, filter_reasons, _within_window = deps.passes_hard_filters(
                        signal_candidate=signal_candidate,
                        signal_candidate_features=signal_candidate_features,
                        hard_constraints=hard_constraints,
                    )
                    user_id = uuid.UUID(str(interest["user_id"]))
                    interest_id = uuid.UUID(str(interest["interest_id"]))
                    cluster_id = signal_candidate.get("event_cluster_id")
                    family_id = signal_candidate.get("family_id")

                    target_features = coerce_json_object(compiled_json.get("target_features"))
                    positive_vectors = await deps.fetch_embedding_vectors_by_ids(
                        cursor,
                        coerce_text_list(compiled_json.get("positive_embedding_ids")),
                    )
                    negative_vectors = await deps.fetch_embedding_vectors_by_ids(
                        cursor,
                        coerce_text_list(compiled_json.get("negative_embedding_ids")),
                    )
                    positive_score = 0.0
                    negative_score = 0.0
                    meta_score = 0.0
                    meta_components: dict[str, float] = {}
                    novelty_score = 0.0
                    major_update = False

                    if pass_filters:
                        novelty_score, major_update = await deps.compute_novelty_score(
                            cursor,
                            user_id=user_id,
                            interest_id=interest_id,
                            cluster_id=cluster_id,
                            family_id=family_id,
                            signal_candidate_features=signal_candidate_features,
                        )
                        positive_score = deps.semantic_prototype_score(
                            title_vector=signal_candidate_vectors.get("e_title", []),
                            lead_vector=signal_candidate_vectors.get("e_lead", []),
                            body_vector=signal_candidate_vectors.get("e_body", []),
                            prototypes=positive_vectors,
                            title_weight=0.45,
                            lead_weight=0.35,
                            body_weight=0.20,
                        )
                        negative_score = deps.semantic_prototype_score(
                            title_vector=signal_candidate_vectors.get("e_title", []),
                            lead_vector=signal_candidate_vectors.get("e_lead", []),
                            body_vector=signal_candidate_vectors.get("e_body", []),
                            prototypes=negative_vectors,
                            title_weight=0.45,
                            lead_weight=0.35,
                            body_weight=0.20,
                        )
                        allowed_languages = {
                            value.casefold()
                            for value in coerce_text_list(
                                hard_constraints.get("languages_allowed")
                            )
                        }
                        language_allowed = (
                            not allowed_languages
                            or str(signal_candidate.get("lang") or "").casefold()
                            in allowed_languages
                        )
                        meta_score, meta_components = deps.compute_interest_meta_score(
                            signal_candidate_features=signal_candidate_features,
                            target_features=target_features,
                            place_constraints=coerce_text_list(hard_constraints.get("places")),
                            language_allowed=language_allowed,
                        )

                    priority = float(
                        hard_constraints.get("priority") or interest.get("priority") or 1.0
                    )
                    score_interest = (
                        deps.compute_interest_final_score(
                            positive_score=positive_score,
                            negative_score=negative_score,
                            meta_score=meta_score,
                            novelty_score=novelty_score,
                            priority=priority,
                        )
                        if pass_filters
                        else 0.0
                    )
                    decision = (
                        deps.decide_interest(
                            score_interest,
                            novelty_score=novelty_score,
                            priority=priority,
                        )
                        if pass_filters
                        else "ignore"
                    )
                    pending_rows.append(
                        {
                            "doc_id": signal_candidate["doc_id"],
                            "user_id": user_id,
                            "interest_id": interest_id,
                            "cluster_id": cluster_id,
                            "pass_filters": pass_filters,
                            "score_pos": positive_score,
                            "score_neg": negative_score,
                            "score_meta": meta_score,
                            "score_novel": novelty_score,
                            "score_interest": score_interest,
                            "decision": decision,
                            "explain_json": {
                                "filterReasons": filter_reasons,
                                "majorUpdate": major_update,
                                "metaComponents": meta_components,
                                "S_pos": positive_score,
                                "S_neg": negative_score,
                                "S_meta": meta_score,
                                "S_novel": novelty_score,
                                "S_interest": score_interest,
                            },
                        }
                    )

                max_score_by_user: dict[uuid.UUID, float] = defaultdict(float)
                for row in pending_rows:
                    max_score_by_user[row["user_id"]] = max(
                        max_score_by_user[row["user_id"]],
                        float(row["score_interest"]),
                    )

                should_trigger_notify = False
                for row in pending_rows:
                    score_user = max_score_by_user[row["user_id"]]
                    row["score_user"] = score_user
                    if row["decision"] in {"notify", "gray_zone"}:
                        should_trigger_notify = True
                    await cursor.execute(
                        """
                        insert into interest_match_results (
                          doc_id,
                          user_id,
                          interest_id,
                          event_cluster_id,
                          score_pos,
                          score_neg,
                          score_meta,
                          score_novel,
                          score_interest,
                          score_user,
                          decision,
                          explain_json
                        )
                        values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb)
                        on conflict (doc_id, interest_id) do update
                        set
                          user_id = excluded.user_id,
                          event_cluster_id = excluded.event_cluster_id,
                          score_pos = excluded.score_pos,
                          score_neg = excluded.score_neg,
                          score_meta = excluded.score_meta,
                          score_novel = excluded.score_novel,
                          score_interest = excluded.score_interest,
                          score_user = excluded.score_user,
                          decision = excluded.decision,
                          explain_json = excluded.explain_json,
                          created_at = now()
                        """,
                        (
                            row["doc_id"],
                            row["user_id"],
                            row["interest_id"],
                            row["cluster_id"],
                            row["score_pos"],
                            row["score_neg"],
                            row["score_meta"],
                            row["score_novel"],
                            row["score_interest"],
                            row["score_user"],
                            row["decision"],
                            Json(make_json_safe(row["explain_json"])),
                        ),
                    )
                    (
                        technical_filter_state,
                        semantic_decision,
                    ) = deps.resolve_user_interest_filter_outcome(
                        pass_filters=bool(row.get("pass_filters")),
                        compat_decision=str(row["decision"]),
                    )
                    await deps.upsert_interest_filter_result(
                        cursor,
                        filter_scope="user_interest",
                        doc_id=uuid.UUID(str(row["doc_id"])),
                        canonical_document_id=filter_context["canonicalDocumentId"],
                        story_cluster_id=filter_context["storyClusterId"],
                        user_id=row["user_id"],
                        criterion_id=None,
                        interest_id=row["interest_id"],
                        technical_filter_state=technical_filter_state,
                        semantic_decision=semantic_decision,
                        compat_decision=str(row["decision"]),
                        verification_target_type=filter_context["verificationTargetType"],
                        verification_target_id=filter_context["verificationTargetId"],
                        verification_state=filter_context["verificationState"],
                        semantic_score=float(row["score_interest"]),
                        explain_json=deps.build_interest_filter_explain(
                            base_explain_json=make_json_safe(row["explain_json"]),
                            technical_filter_state=technical_filter_state,
                            semantic_decision=semantic_decision,
                            compat_decision=str(row["decision"]),
                            filter_scope="user_interest",
                            context=filter_context,
                        ),
                    )

                next_state = deps.advance_processing_state(
                    signal_candidate.get("processing_state"),
                    "matched",
                )
                await cursor.execute(
                    """
                    update signal_candidates
                    set
                      processing_state = %s,
                      updated_at = now()
                    where doc_id = %s
                    """,
                    (next_state, signal_candidate["doc_id"]),
                )
                if should_trigger_notify and not historical_backfill and not suppress_pipeline_fanout:
                    await deps.insert_outbox_event(
                        cursor,
                        SIGNAL_CANDIDATE_INTERESTS_MATCHED_EVENT,
                        "signal_candidate",
                        signal_candidate["doc_id"],
                        {"docId": str(signal_candidate["doc_id"]), "version": 1},
                    )
                await deps.record_processed_event(cursor, INTEREST_MATCH_CONSUMER, event_id)

    return {
        "status": "matched",
        "docId": doc_id,
        "interestCount": len(pending_rows),
    }


async def process_match_interests(job: Any, job_token: str) -> dict[str, Any]:
    return await process_match_interests_with_dependencies(
        job,
        job_token,
        build_interest_match_processor_dependencies(),
    )

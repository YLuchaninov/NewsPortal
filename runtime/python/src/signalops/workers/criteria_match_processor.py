from __future__ import annotations

import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

from psycopg.types.json import Json

from .criteria_review_policy import (
    build_runtime_review_state,
    is_candidate_recovery_protected,
    should_queue_criterion_llm_review,
)
from .runtime_json import coerce_json_object, coerce_text_list, make_json_safe
from .runtime_values import coerce_bool
from .worker_queues import (
    SIGNAL_CANDIDATE_CRITERIA_MATCHED_EVENT,
    CRITERIA_MATCH_CONSUMER,
    LLM_REVIEW_REQUESTED_EVENT,
)


@dataclass(frozen=True)
class CriteriaMatchProcessorDependencies:
    open_connection: Callable[[], Awaitable[Any]]
    suppress_downstream_outbox: Callable[[Any], bool]
    is_event_processed: Callable[..., Awaitable[bool]]
    fetch_signal_candidate_for_update: Callable[..., Awaitable[dict[str, Any]]]
    fetch_signal_candidate_features_row: Callable[..., Awaitable[dict[str, Any]]]
    fetch_signal_candidate_vectors: Callable[..., Awaitable[dict[str, list[float]]]]
    list_compiled_criteria: Callable[..., Awaitable[list[dict[str, Any]]]]
    find_prompt_template: Callable[..., Awaitable[dict[str, Any] | None]]
    get_llm_review_monthly_quota_snapshot: Callable[..., Awaitable[dict[str, Any]]]
    resolve_interest_filter_context: Callable[..., Awaitable[dict[str, Any]]]
    passes_hard_filters: Callable[..., tuple[bool, list[str], bool]]
    passes_allowed_content_kind: Callable[..., tuple[bool, str]]
    compute_lexical_score: Callable[..., Awaitable[float]]
    fetch_embedding_vectors_by_ids: Callable[..., Awaitable[list[list[float]]]]
    semantic_prototype_score: Callable[..., float]
    compute_criterion_meta_score: Callable[..., tuple[float, dict[str, float]]]
    compute_criterion_final_score: Callable[..., float]
    decide_criterion: Callable[[float], str]
    apply_document_candidate_signal_uplift: Callable[..., tuple[str, dict[str, Any] | None]]
    coerce_selection_profile_runtime: Callable[..., Any]
    build_selection_profile_runtime_explain: Callable[..., dict[str, Any]]
    selection_profile_allows_llm_review: Callable[[Any], bool]
    resolve_strict_candidate_signal_guard: Callable[..., dict[str, Any] | None]
    resolve_criterion_gray_zone_runtime_resolution: Callable[..., dict[str, Any] | None]
    build_llm_budget_gate_explain: Callable[..., dict[str, Any]]
    resolve_profile_gray_zone_decision: Callable[[Any], str]
    resolve_criterion_filter_outcome: Callable[..., tuple[str, str]]
    upsert_interest_filter_result: Callable[..., Awaitable[None]]
    build_interest_filter_explain: Callable[..., dict[str, Any]]
    find_reusable_criterion_llm_review: Callable[..., Awaitable[dict[str, Any] | None]]
    persist_criterion_review_resolution: Callable[..., Awaitable[dict[str, Any]]]
    insert_outbox_event: Callable[..., Awaitable[None]]
    upsert_system_feed_result: Callable[..., Awaitable[dict[str, Any]]]
    should_dispatch_clustering: Callable[[dict[str, Any]], bool]
    record_processed_event: Callable[..., Awaitable[None]]


def build_criteria_match_processor_dependencies() -> CriteriaMatchProcessorDependencies:
    from . import main as legacy_main

    return CriteriaMatchProcessorDependencies(
        open_connection=legacy_main.open_connection,
        suppress_downstream_outbox=legacy_main.suppress_downstream_outbox,
        is_event_processed=legacy_main.is_event_processed,
        fetch_signal_candidate_for_update=legacy_main.fetch_signal_candidate_for_update,
        fetch_signal_candidate_features_row=legacy_main.fetch_signal_candidate_features_row,
        fetch_signal_candidate_vectors=legacy_main.fetch_signal_candidate_vectors,
        list_compiled_criteria=legacy_main.list_compiled_criteria,
        find_prompt_template=legacy_main.find_prompt_template,
        get_llm_review_monthly_quota_snapshot=legacy_main.get_llm_review_monthly_quota_snapshot,
        resolve_interest_filter_context=legacy_main.resolve_interest_filter_context,
        passes_hard_filters=legacy_main.passes_hard_filters,
        passes_allowed_content_kind=legacy_main.passes_allowed_content_kind,
        compute_lexical_score=legacy_main.compute_lexical_score,
        fetch_embedding_vectors_by_ids=legacy_main.fetch_embedding_vectors_by_ids,
        semantic_prototype_score=legacy_main.semantic_prototype_score,
        compute_criterion_meta_score=legacy_main.compute_criterion_meta_score,
        compute_criterion_final_score=legacy_main.compute_criterion_final_score,
        decide_criterion=legacy_main.decide_criterion,
        apply_document_candidate_signal_uplift=legacy_main.apply_document_candidate_signal_uplift,
        coerce_selection_profile_runtime=legacy_main.coerce_selection_profile_runtime,
        build_selection_profile_runtime_explain=legacy_main.build_selection_profile_runtime_explain,
        selection_profile_allows_llm_review=legacy_main.selection_profile_allows_llm_review,
        resolve_strict_candidate_signal_guard=legacy_main.resolve_strict_candidate_signal_guard,
        resolve_criterion_gray_zone_runtime_resolution=legacy_main.resolve_criterion_gray_zone_runtime_resolution,
        build_llm_budget_gate_explain=legacy_main.build_llm_budget_gate_explain,
        resolve_profile_gray_zone_decision=legacy_main.resolve_profile_gray_zone_decision,
        resolve_criterion_filter_outcome=legacy_main.resolve_criterion_filter_outcome,
        upsert_interest_filter_result=legacy_main.upsert_interest_filter_result,
        build_interest_filter_explain=legacy_main.build_interest_filter_explain,
        find_reusable_criterion_llm_review=legacy_main.find_reusable_criterion_llm_review,
        persist_criterion_review_resolution=legacy_main.persist_criterion_review_resolution,
        insert_outbox_event=legacy_main.insert_outbox_event,
        upsert_system_feed_result=legacy_main.upsert_system_feed_result,
        should_dispatch_clustering=legacy_main.should_dispatch_clustering,
        record_processed_event=legacy_main.record_processed_event,
    )


async def process_match_criteria_with_dependencies(
    job: Any,
    _job_token: str,
    deps: CriteriaMatchProcessorDependencies,
) -> dict[str, Any]:
    event_id = str(job.data.get("eventId"))
    doc_id = str(job.data.get("docId"))
    historical_backfill = coerce_bool(job.data.get("historicalBackfill"))
    suppress_pipeline_fanout = deps.suppress_downstream_outbox(job)

    if not event_id or event_id == "None" or not doc_id or doc_id == "None":
        raise ValueError("Criteria match worker expected eventId and docId.")

    connection = await deps.open_connection()
    async with connection:
        async with connection.transaction():
            async with connection.cursor() as cursor:
                if await deps.is_event_processed(cursor, CRITERIA_MATCH_CONSUMER, event_id):
                    return {"status": "duplicate-event", "docId": doc_id}

                signal_candidate = await deps.fetch_signal_candidate_for_update(cursor, doc_id)
                signal_candidate_features = await deps.fetch_signal_candidate_features_row(cursor, signal_candidate["doc_id"])
                signal_candidate_vectors = await deps.fetch_signal_candidate_vectors(cursor, signal_candidate["doc_id"])
                criteria_rows = await deps.list_compiled_criteria(cursor)
                prompt_template = await deps.find_prompt_template(cursor, "criteria")
                llm_quota_snapshot = await deps.get_llm_review_monthly_quota_snapshot(cursor)
                filter_context = await deps.resolve_interest_filter_context(
                    cursor,
                    signal_candidate=signal_candidate,
                    prefer_story_cluster=False,
                )
                criteria_count = 0

                for criterion in criteria_rows:
                    compiled_json = coerce_json_object(criterion.get("compiled_json"))
                    hard_constraints = coerce_json_object(compiled_json.get("hard_constraints"))
                    base_pass_filters, filter_reasons, within_window = deps.passes_hard_filters(
                        signal_candidate=signal_candidate,
                        signal_candidate_features=signal_candidate_features,
                        hard_constraints=hard_constraints,
                    )
                    allowed_content_kinds = coerce_text_list(
                        criterion.get("allowed_content_kinds")
                    )
                    content_kind_allowed, signal_candidate_content_kind = deps.passes_allowed_content_kind(
                        signal_candidate=signal_candidate,
                        allowed_content_kinds=allowed_content_kinds,
                    )
                    if not content_kind_allowed:
                        filter_reasons = ["content_kind", *filter_reasons]
                    pass_filters = base_pass_filters and content_kind_allowed
                    lexical_score = await deps.compute_lexical_score(
                        cursor,
                        signal_candidate["doc_id"],
                        str(compiled_json.get("lexical_query") or ""),
                    )
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
                    if pass_filters:
                        positive_score = deps.semantic_prototype_score(
                            title_vector=signal_candidate_vectors.get("e_title", []),
                            lead_vector=signal_candidate_vectors.get("e_lead", []),
                            body_vector=signal_candidate_vectors.get("e_body", []),
                            prototypes=positive_vectors,
                            title_weight=0.50,
                            lead_weight=0.30,
                            body_weight=0.20,
                        )
                        negative_score = deps.semantic_prototype_score(
                            title_vector=signal_candidate_vectors.get("e_title", []),
                            lead_vector=signal_candidate_vectors.get("e_lead", []),
                            body_vector=signal_candidate_vectors.get("e_body", []),
                            prototypes=negative_vectors,
                            title_weight=0.50,
                            lead_weight=0.30,
                            body_weight=0.20,
                        )
                        meta_score, meta_components = deps.compute_criterion_meta_score(
                            signal_candidate_features=signal_candidate_features,
                            target_features=target_features,
                            place_constraints=coerce_text_list(hard_constraints.get("places")),
                            is_within_time_window=within_window,
                        )
                    score_final = (
                        deps.compute_criterion_final_score(
                            positive_score=positive_score,
                            negative_score=negative_score,
                            lexical_score=lexical_score,
                            meta_score=meta_score,
                        )
                        if pass_filters
                        else 0.0
                    )
                    decision = deps.decide_criterion(score_final) if pass_filters else "irrelevant"
                    decision, candidate_signal_explain = deps.apply_document_candidate_signal_uplift(
                        title=str(signal_candidate.get("title") or ""),
                        lead=str(signal_candidate.get("lead") or ""),
                        body=str(signal_candidate.get("body") or ""),
                        score_final=score_final,
                        positive_score=positive_score,
                        lexical_score=lexical_score,
                        canonical_document_id=(
                            str(filter_context.get("canonicalDocumentId") or "").strip()
                            or None
                        ),
                        story_cluster_id=(
                            str(filter_context.get("storyClusterId") or "").strip() or None
                        ),
                        verification_state=filter_context.get("verificationState"),
                        base_decision=decision,
                        candidate_signal_config=(
                            coerce_json_object(compiled_json.get("candidateSignals"))
                            or coerce_json_object(
                                coerce_json_object(
                                    criterion.get("selection_profile_definition_json")
                                ).get("candidateSignals")
                            )
                        ),
                    )
                    selection_profile_runtime = deps.coerce_selection_profile_runtime(criterion)
                    explain_json = {
                        "filterReasons": filter_reasons,
                        "contentKind": {
                            "signal_candidate": signal_candidate_content_kind,
                            "allowed": allowed_content_kinds,
                            "matched": content_kind_allowed,
                        },
                        "S_pos": positive_score,
                        "S_neg": negative_score,
                        "S_lex": lexical_score,
                        "S_meta": meta_score,
                        "S_final": score_final,
                        "metaComponents": meta_components,
                        "selectionProfile": deps.build_selection_profile_runtime_explain(
                            selection_profile_runtime
                        ),
                    }
                    if candidate_signal_explain is not None:
                        explain_json["candidateSignals"] = candidate_signal_explain
                    runtime_resolution = None
                    llm_review_allowed = deps.selection_profile_allows_llm_review(
                        selection_profile_runtime
                    )
                    if decision == "relevant":
                        strict_candidate_signal_guard = deps.resolve_strict_candidate_signal_guard(
                            selection_profile_runtime,
                            candidate_signal_explain,
                        )
                        if strict_candidate_signal_guard is not None:
                            decision = str(strict_candidate_signal_guard["finalDecision"])
                            explain_json["strictCandidateSignalGuard"] = strict_candidate_signal_guard
                    candidate_recovery_protected = is_candidate_recovery_protected(
                        candidate_signal_explain
                    )
                    if decision == "gray_zone":
                        if llm_review_allowed:
                            runtime_resolution = deps.resolve_criterion_gray_zone_runtime_resolution(
                                llm_quota_snapshot,
                                preserve_candidate_gray_zone=candidate_recovery_protected,
                            )
                            if runtime_resolution is not None:
                                decision = str(runtime_resolution["finalDecision"])
                                explain_json["llmBudgetGate"] = deps.build_llm_budget_gate_explain(
                                    quota_snapshot=llm_quota_snapshot,
                                    resolution=runtime_resolution,
                                )
                                if decision == "gray_zone":
                                    explain_json["grayZonePolicy"] = {
                                        "reason": "candidate_recovery_runtime_policy",
                                        "finalDecision": decision,
                                        "llmReviewQueued": False,
                                        "blockedBy": str(
                                            runtime_resolution.get("reason") or ""
                                        ),
                                    }
                        else:
                            decision = deps.resolve_profile_gray_zone_decision(
                                selection_profile_runtime
                            )
                            explain_json["grayZonePolicy"] = {
                                "reason": "selection_profile_runtime_policy",
                                "finalDecision": decision,
                                "llmReviewQueued": False,
                            }
                    llm_review_queued = should_queue_criterion_llm_review(
                        decision=decision,
                        runtime_resolution=runtime_resolution,
                        llm_review_allowed=llm_review_allowed,
                        historical_backfill=historical_backfill,
                    )
                    if decision == "gray_zone":
                        explain_json["runtimeReviewState"] = build_runtime_review_state(
                            llm_review_queued=llm_review_queued,
                            historical_backfill=historical_backfill,
                            llm_review_allowed=llm_review_allowed,
                            candidate_recovery_protected=candidate_recovery_protected,
                            gray_zone_policy=coerce_json_object(
                                explain_json.get("grayZonePolicy")
                            ),
                        )
                    await cursor.execute(
                        """
                        insert into criterion_match_results (
                          doc_id,
                          criterion_id,
                          score_pos,
                          score_neg,
                          score_lex,
                          score_meta,
                          score_final,
                          decision,
                          explain_json
                        )
                        values (%s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb)
                        on conflict (doc_id, criterion_id) do update
                        set
                          score_pos = excluded.score_pos,
                          score_neg = excluded.score_neg,
                          score_lex = excluded.score_lex,
                          score_meta = excluded.score_meta,
                          score_final = excluded.score_final,
                          decision = excluded.decision,
                          explain_json = excluded.explain_json,
                          created_at = now()
                        """,
                        (
                            signal_candidate["doc_id"],
                            criterion["criterion_id"],
                            positive_score,
                            negative_score,
                            lexical_score,
                            meta_score,
                            score_final,
                            decision,
                            Json(make_json_safe(explain_json)),
                        ),
                    )
                    technical_filter_state, semantic_decision = deps.resolve_criterion_filter_outcome(
                        pass_filters=pass_filters,
                        compat_decision=decision,
                    )
                    await deps.upsert_interest_filter_result(
                        cursor,
                        filter_scope="system_criterion",
                        doc_id=uuid.UUID(str(signal_candidate["doc_id"])),
                        canonical_document_id=filter_context["canonicalDocumentId"],
                        story_cluster_id=filter_context["storyClusterId"],
                        user_id=None,
                        criterion_id=uuid.UUID(str(criterion["criterion_id"])),
                        interest_id=None,
                        technical_filter_state=technical_filter_state,
                        semantic_decision=semantic_decision,
                        compat_decision=decision,
                        verification_target_type=filter_context["verificationTargetType"],
                        verification_target_id=filter_context["verificationTargetId"],
                        verification_state=filter_context["verificationState"],
                        semantic_score=score_final,
                        explain_json=deps.build_interest_filter_explain(
                            base_explain_json=make_json_safe(explain_json),
                            technical_filter_state=technical_filter_state,
                            semantic_decision=semantic_decision,
                            compat_decision=decision,
                            filter_scope="system_criterion",
                            context=filter_context,
                        ),
                    )
                    reused_review = None
                    if llm_review_queued:
                        reused_review = await deps.find_reusable_criterion_llm_review(
                            cursor,
                            doc_id=signal_candidate["doc_id"],
                            criterion_id=criterion["criterion_id"],
                            canonical_document_id=filter_context["canonicalDocumentId"],
                            prompt_template_id=(
                                str(prompt_template.get("prompt_template_id") or "").strip()
                                if prompt_template is not None
                                else None
                            ),
                            prompt_version=(
                                int(prompt_template.get("version"))
                                if prompt_template is not None
                                and prompt_template.get("version") is not None
                                else None
                            ),
                        )
                        if reused_review is not None:
                            await deps.persist_criterion_review_resolution(
                                cursor,
                                signal_candidate=signal_candidate,
                                criterion_id=criterion["criterion_id"],
                                review_context={"explain_json": explain_json},
                                provider_decision=str(
                                    reused_review.get("provider_decision") or "reject"
                                ),
                                provider_score=(
                                    float(reused_review.get("score"))
                                    if reused_review.get("score") is not None
                                    else None
                                ),
                                review_source="reused_canonical_llm_review",
                                review_id=str(reused_review.get("review_id") or "").strip()
                                or None,
                                reused_from_doc_id=str(
                                    reused_review.get("reviewed_doc_id") or ""
                                ).strip()
                                or None,
                                reused_canonical_document_id=str(
                                    reused_review.get("reviewed_canonical_document_id") or ""
                                ).strip()
                                or None,
                                prompt_template_id=str(
                                    reused_review.get("prompt_template_id") or ""
                                ).strip()
                                or None,
                                prompt_version=(
                                    int(reused_review.get("prompt_version"))
                                    if reused_review.get("prompt_version") is not None
                                    else None
                                ),
                                refresh_selection_gate=False,
                                historical_backfill=historical_backfill,
                                suppress_pipeline_fanout=suppress_pipeline_fanout,
                            )
                            llm_review_queued = False
                    if llm_review_queued:
                        await deps.insert_outbox_event(
                            cursor,
                            LLM_REVIEW_REQUESTED_EVENT,
                            "criterion",
                            uuid.UUID(criterion["criterion_id"]),
                            {
                                "docId": str(signal_candidate["doc_id"]),
                                "scope": "criterion",
                                "targetId": str(criterion["criterion_id"]),
                                "promptTemplateId": (
                                    str(prompt_template["prompt_template_id"])
                                    if prompt_template is not None
                                    else None
                                ),
                                "version": int(criterion.get("source_version") or 1),
                            },
                        )
                    criteria_count += 1

                system_feed_result = await deps.upsert_system_feed_result(cursor, signal_candidate["doc_id"])
                if (
                    deps.should_dispatch_clustering(system_feed_result)
                    and not historical_backfill
                    and not suppress_pipeline_fanout
                ):
                    await deps.insert_outbox_event(
                        cursor,
                        SIGNAL_CANDIDATE_CRITERIA_MATCHED_EVENT,
                        "signal_candidate",
                        signal_candidate["doc_id"],
                        {"docId": str(signal_candidate["doc_id"]), "version": 1},
                    )
                await deps.record_processed_event(cursor, CRITERIA_MATCH_CONSUMER, event_id)

    return {
        "status": "matched",
        "docId": doc_id,
        "criteriaCount": criteria_count,
    }


async def process_match_criteria(job: Any, job_token: str) -> dict[str, Any]:
    return await process_match_criteria_with_dependencies(
        job,
        job_token,
        build_criteria_match_processor_dependencies(),
    )

from __future__ import annotations

import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

from psycopg.types.json import Json

from .gemini import review_with_gemini
from .interest_filters import (
    build_interest_filter_explain,
    resolve_criterion_filter_outcome,
    resolve_interest_filter_context,
    resolve_user_interest_filter_outcome,
    upsert_interest_filter_result,
)
from .llm_budget import (
    build_llm_budget_gate_explain,
    get_llm_review_monthly_quota_snapshot,
    resolve_criterion_gray_zone_runtime_resolution,
)
from .matching_read_repository import find_prompt_template
from .prompting import render_llm_prompt_template
from .runtime_db import open_connection
from .runtime_json import coerce_json_object, make_json_safe
from .runtime_values import coerce_bool
from .selection_write_repository import (
    persist_criterion_review_resolution,
    should_dispatch_clustering,
    upsert_system_feed_result,
)
from .signal_candidate_repository import fetch_signal_candidate_for_update
from .worker_events import (
    insert_outbox_event,
    is_event_processed,
    record_processed_event,
    suppress_downstream_outbox,
)
from .worker_queues import (
    SIGNAL_CANDIDATE_CRITERIA_MATCHED_EVENT,
    SIGNAL_CANDIDATE_INTERESTS_MATCHED_EVENT,
    LLM_REVIEW_CONSUMER,
)


@dataclass(frozen=True)
class LlmReviewProcessorDependencies:
    open_connection: Callable[[], Awaitable[Any]]
    suppress_downstream_outbox: Callable[[Any], bool]
    is_event_processed: Callable[..., Awaitable[bool]]
    fetch_signal_candidate_for_update: Callable[..., Awaitable[dict[str, Any]]]
    find_prompt_template: Callable[..., Awaitable[dict[str, Any] | None]]
    get_llm_review_monthly_quota_snapshot: Callable[..., Awaitable[dict[str, Any]]]
    resolve_criterion_gray_zone_runtime_resolution: Callable[..., dict[str, Any] | None]
    build_llm_budget_gate_explain: Callable[..., dict[str, Any]]
    resolve_interest_filter_context: Callable[..., Awaitable[dict[str, Any]]]
    resolve_criterion_filter_outcome: Callable[..., tuple[str, str]]
    upsert_interest_filter_result: Callable[..., Awaitable[None]]
    build_interest_filter_explain: Callable[..., dict[str, Any]]
    upsert_system_feed_result: Callable[..., Awaitable[dict[str, Any]]]
    should_dispatch_clustering: Callable[[dict[str, Any]], bool]
    insert_outbox_event: Callable[..., Awaitable[None]]
    record_processed_event: Callable[..., Awaitable[None]]
    render_llm_prompt_template: Callable[..., str]
    review_with_gemini: Callable[..., Any]
    persist_criterion_review_resolution: Callable[..., Awaitable[dict[str, Any]]]
    resolve_user_interest_filter_outcome: Callable[..., tuple[str, str]]


def build_llm_review_processor_dependencies() -> LlmReviewProcessorDependencies:
    return LlmReviewProcessorDependencies(
        open_connection=open_connection,
        suppress_downstream_outbox=suppress_downstream_outbox,
        is_event_processed=is_event_processed,
        fetch_signal_candidate_for_update=fetch_signal_candidate_for_update,
        find_prompt_template=find_prompt_template,
        get_llm_review_monthly_quota_snapshot=get_llm_review_monthly_quota_snapshot,
        resolve_criterion_gray_zone_runtime_resolution=resolve_criterion_gray_zone_runtime_resolution,
        build_llm_budget_gate_explain=build_llm_budget_gate_explain,
        resolve_interest_filter_context=resolve_interest_filter_context,
        resolve_criterion_filter_outcome=resolve_criterion_filter_outcome,
        upsert_interest_filter_result=upsert_interest_filter_result,
        build_interest_filter_explain=build_interest_filter_explain,
        upsert_system_feed_result=upsert_system_feed_result,
        should_dispatch_clustering=should_dispatch_clustering,
        insert_outbox_event=insert_outbox_event,
        record_processed_event=record_processed_event,
        render_llm_prompt_template=render_llm_prompt_template,
        review_with_gemini=review_with_gemini,
        persist_criterion_review_resolution=persist_criterion_review_resolution,
        resolve_user_interest_filter_outcome=resolve_user_interest_filter_outcome,
    )


async def process_llm_review_with_dependencies(
    job: Any,
    _job_token: str,
    deps: LlmReviewProcessorDependencies,
) -> dict[str, Any]:
    event_id = str(job.data.get("eventId"))
    doc_id = str(job.data.get("docId"))
    scope = str(job.data.get("scope") or "interest")
    target_id = str(job.data.get("targetId"))
    historical_backfill = coerce_bool(job.data.get("historicalBackfill"))
    suppress_pipeline_fanout = deps.suppress_downstream_outbox(job)
    raw_prompt_template_id = job.data.get("promptTemplateId")
    prompt_template_id = str(raw_prompt_template_id).strip() if raw_prompt_template_id else None

    if not event_id or event_id == "None" or not doc_id or doc_id == "None" or not target_id:
        raise ValueError("LLM review worker expected eventId, docId, and targetId.")

    connection = await deps.open_connection()
    async with connection:
        async with connection.transaction():
            async with connection.cursor() as cursor:
                if await deps.is_event_processed(cursor, LLM_REVIEW_CONSUMER, event_id):
                    return {"status": "duplicate-event", "docId": doc_id, "scope": scope}

                signal_candidate = await deps.fetch_signal_candidate_for_update(cursor, doc_id)
                await cursor.execute(
                    """
                    select
                      prompt_template_id::text as prompt_template_id,
                      name,
                      purpose,
                      template_text,
                      version
                    from llm_prompt_templates
                    where prompt_template_id = %s
                      and purpose = 'selection_review'
                    """,
                    (prompt_template_id,),
                )
                prompt_template = await cursor.fetchone()
                if prompt_template is None:
                    prompt_template = await deps.find_prompt_template(
                        cursor,
                        "criteria" if scope == "criterion" else "interests",
                    )

                template_text = (
                    str(prompt_template.get("template_text"))
                    if prompt_template is not None
                    else (
                        "Review the signal match below and respond with JSON "
                        '{"decision":"approve|reject|uncertain","score":0.0,"reason":"..."}.\n'
                        "Title: {title}\nLead: {lead}\nBody: {body}\nContext: {context}"
                    )
                )
                review_context: dict[str, Any] = {}
                if scope == "criterion":
                    await cursor.execute(
                        """
                        select
                          cmr.criterion_match_id,
                          cmr.explain_json,
                          cmr.decision,
                          c.description as criterion_name
                        from criterion_match_results cmr
                        join criteria c on c.criterion_id = cmr.criterion_id
                        where cmr.doc_id = %s and cmr.criterion_id = %s
                        order by cmr.created_at desc
                        limit 1
                        """,
                        (signal_candidate["doc_id"], target_id),
                    )
                    review_context = await cursor.fetchone() or {}
                else:
                    await cursor.execute(
                        """
                        select
                          imr.interest_match_id,
                          imr.user_id,
                          imr.explain_json,
                          imr.decision,
                          ui.description as interest_name
                        from interest_match_results imr
                        join user_interests ui on ui.interest_id = imr.interest_id
                        where imr.doc_id = %s and imr.interest_id = %s
                        order by imr.created_at desc
                        limit 1
                        """,
                        (signal_candidate["doc_id"], target_id),
                    )
                    review_context = await cursor.fetchone() or {}

                if scope == "criterion":
                    llm_quota_snapshot = await deps.get_llm_review_monthly_quota_snapshot(
                        cursor
                    )
                    runtime_resolution = (
                        deps.resolve_criterion_gray_zone_runtime_resolution(
                            llm_quota_snapshot
                        )
                    )
                    if runtime_resolution is not None:
                        final_decision = str(runtime_resolution["finalDecision"])
                        llm_budget_gate_explain = deps.build_llm_budget_gate_explain(
                            quota_snapshot=llm_quota_snapshot,
                            resolution=runtime_resolution,
                        )
                        await cursor.execute(
                            """
                            update criterion_match_results
                            set
                              decision = %s,
                              explain_json = explain_json || %s::jsonb
                            where doc_id = %s and criterion_id = %s
                        """,
                            (
                                final_decision,
                                Json({"llmBudgetGate": llm_budget_gate_explain}),
                                signal_candidate["doc_id"],
                                target_id,
                            ),
                        )
                        filter_context = await deps.resolve_interest_filter_context(
                            cursor,
                            signal_candidate=signal_candidate,
                            prefer_story_cluster=False,
                        )
                        (
                            technical_filter_state,
                            semantic_decision,
                        ) = deps.resolve_criterion_filter_outcome(
                            pass_filters=True,
                            compat_decision=final_decision,
                        )
                        base_filter_explain = coerce_json_object(
                            review_context.get("explain_json")
                        )
                        base_filter_explain["llmBudgetGate"] = llm_budget_gate_explain
                        await deps.upsert_interest_filter_result(
                            cursor,
                            filter_scope="system_criterion",
                            doc_id=uuid.UUID(str(signal_candidate["doc_id"])),
                            canonical_document_id=filter_context["canonicalDocumentId"],
                            story_cluster_id=filter_context["storyClusterId"],
                            user_id=None,
                            criterion_id=uuid.UUID(str(target_id)),
                            interest_id=None,
                            technical_filter_state=technical_filter_state,
                            semantic_decision=semantic_decision,
                            compat_decision=final_decision,
                            verification_target_type=filter_context["verificationTargetType"],
                            verification_target_id=filter_context["verificationTargetId"],
                            verification_state=filter_context["verificationState"],
                            semantic_score=float(
                                coerce_json_object(review_context.get("explain_json")).get(
                                    "S_final"
                                )
                                or 0.0
                            ),
                            explain_json=deps.build_interest_filter_explain(
                                base_explain_json=make_json_safe(base_filter_explain),
                                technical_filter_state=technical_filter_state,
                                semantic_decision=semantic_decision,
                                compat_decision=final_decision,
                                filter_scope="system_criterion",
                                context=filter_context,
                            ),
                        )
                        system_feed_result = await deps.upsert_system_feed_result(
                            cursor,
                            signal_candidate["doc_id"],
                        )
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
                        await deps.record_processed_event(
                            cursor,
                            LLM_REVIEW_CONSUMER,
                            event_id,
                        )
                        return {
                            "status": "review-skipped-runtime-policy",
                            "docId": doc_id,
                            "scope": scope,
                            "decision": str(runtime_resolution["providerDecision"]),
                            "runtimePolicyReason": str(runtime_resolution["reason"]),
                        }

                prompt = deps.render_llm_prompt_template(
                    template_text,
                    signal_candidate=signal_candidate,
                    review_context=review_context,
                    scope=scope,
                )
                review_result = deps.review_with_gemini(prompt)
                await cursor.execute(
                    """
                    insert into llm_review_log (
                      doc_id,
                      scope,
                      target_id,
                      prompt_template_id,
                      prompt_version,
                      llm_model,
                      decision,
                      score,
                      provider_latency_ms,
                      prompt_tokens,
                      completion_tokens,
                      total_tokens,
                      cost_estimate_usd,
                      provider_usage_json,
                      response_json
                    )
                    values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s::jsonb)
                    returning review_id
                    """,
                    (
                        signal_candidate["doc_id"],
                        "criterion" if scope == "criterion" else "interest",
                        target_id,
                        prompt_template["prompt_template_id"] if prompt_template is not None else None,
                        int(prompt_template["version"]) if prompt_template is not None else 1,
                        review_result.model,
                        review_result.decision,
                        review_result.score,
                        review_result.provider_latency_ms,
                        review_result.prompt_tokens,
                        review_result.completion_tokens,
                        review_result.total_tokens,
                        review_result.cost_estimate_usd,
                        Json(make_json_safe(review_result.provider_usage_json)),
                        Json(make_json_safe(review_result.response_json)),
                    ),
                )
                review_row = await cursor.fetchone()

                if scope == "criterion":
                    await deps.persist_criterion_review_resolution(
                        cursor,
                        signal_candidate=signal_candidate,
                        criterion_id=target_id,
                        review_context=review_context,
                        provider_decision=review_result.decision,
                        provider_score=review_result.score,
                        review_source="fresh_llm_review",
                        review_id=str(review_row["review_id"]),
                        prompt_template_id=(
                            str(review_row.get("prompt_template_id") or "").strip() or None
                        ),
                        prompt_version=(
                            int(review_row.get("prompt_version"))
                            if review_row.get("prompt_version") is not None
                            else None
                        ),
                        refresh_selection_gate=True,
                        historical_backfill=historical_backfill,
                        suppress_pipeline_fanout=suppress_pipeline_fanout,
                    )
                else:
                    final_decision = "suppress"
                    if review_result.decision == "approve":
                        final_decision = "notify"
                    await cursor.execute(
                        """
                        update interest_match_results
                        set
                          decision = %s,
                          explain_json = explain_json || %s::jsonb
                        where doc_id = %s and interest_id = %s
                        """,
                        (
                            final_decision,
                            Json(
                                {
                                    "llmReview": {
                                        "reviewId": str(review_row["review_id"]),
                                        "decision": review_result.decision,
                                        "score": review_result.score,
                                    }
                                }
                            ),
                            signal_candidate["doc_id"],
                            target_id,
                        ),
                    )
                    filter_context = await deps.resolve_interest_filter_context(
                        cursor,
                        signal_candidate=signal_candidate,
                        prefer_story_cluster=True,
                    )
                    (
                        technical_filter_state,
                        semantic_decision,
                    ) = deps.resolve_user_interest_filter_outcome(
                        pass_filters=True,
                        compat_decision=final_decision,
                    )
                    base_filter_explain = coerce_json_object(review_context.get("explain_json"))
                    base_filter_explain["llmReview"] = {
                        "reviewId": str(review_row["review_id"]),
                        "decision": review_result.decision,
                        "score": review_result.score,
                    }
                    await deps.upsert_interest_filter_result(
                        cursor,
                        filter_scope="user_interest",
                        doc_id=uuid.UUID(str(signal_candidate["doc_id"])),
                        canonical_document_id=filter_context["canonicalDocumentId"],
                        story_cluster_id=filter_context["storyClusterId"],
                        user_id=uuid.UUID(str(review_context["user_id"])),
                        criterion_id=None,
                        interest_id=uuid.UUID(str(target_id)),
                        technical_filter_state=technical_filter_state,
                        semantic_decision=semantic_decision,
                        compat_decision=final_decision,
                        verification_target_type=filter_context["verificationTargetType"],
                        verification_target_id=filter_context["verificationTargetId"],
                        verification_state=filter_context["verificationState"],
                        semantic_score=float(base_filter_explain.get("S_interest") or 0.0),
                        explain_json=deps.build_interest_filter_explain(
                            base_explain_json=make_json_safe(base_filter_explain),
                            technical_filter_state=technical_filter_state,
                            semantic_decision=semantic_decision,
                            compat_decision=final_decision,
                            filter_scope="user_interest",
                            context=filter_context,
                        ),
                    )
                    if (
                        review_result.decision == "approve"
                        and not historical_backfill
                        and not suppress_pipeline_fanout
                    ):
                        await deps.insert_outbox_event(
                            cursor,
                            SIGNAL_CANDIDATE_INTERESTS_MATCHED_EVENT,
                            "signal_candidate",
                            signal_candidate["doc_id"],
                            {"docId": str(signal_candidate["doc_id"]), "version": 1},
                        )

                await deps.record_processed_event(cursor, LLM_REVIEW_CONSUMER, event_id)

    return {
        "status": "reviewed",
        "docId": doc_id,
        "scope": scope,
        "decision": review_result.decision,
    }


async def process_llm_review(job: Any, job_token: str) -> dict[str, Any]:
    return await process_llm_review_with_dependencies(
        job,
        job_token,
        build_llm_review_processor_dependencies(),
    )

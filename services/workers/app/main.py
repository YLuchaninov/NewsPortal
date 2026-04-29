from __future__ import annotations

import asyncio
import logging
import os as os
import sys
import uuid
from collections.abc import Mapping, Sequence
from datetime import datetime
from pathlib import Path
from typing import Any

SERVICES_ROOT = Path(__file__).resolve().parents[2]
if str(SERVICES_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICES_ROOT))

import psycopg
from bullmq import Job
from psycopg.types.json import Json

from .article_processors import (
    ArticleEmbedProcessorDependencies,
    ArticleProcessorDependencies,
    process_dedup_with_dependencies,
    process_embed_with_dependencies,
    process_normalize_with_dependencies,
)
from .article_repository import fetch_article_for_update
from .article_extraction_processor import (
    process_article_extract as process_article_extract_with_plugin,
)
from .cluster_processor import (
    ArticleClusterProcessorDependencies,
    process_cluster_with_dependencies,
)
from .compile_processors import (
    CriterionCompileProcessorDependencies,
    InterestCompileProcessorDependencies,
    process_criterion_compile_with_dependencies,
    process_interest_compile_with_dependencies,
)
from .criteria_match_processor import (
    CriteriaMatchProcessorDependencies,
    process_match_criteria_with_dependencies,
)
from .feedback_ingest_processor import (
    FeedbackIngestProcessorDependencies,
    process_feedback_ingest_with_dependencies,
)
from .interest_match_processor import (
    InterestMatchProcessorDependencies,
    process_match_interests_with_dependencies,
)
from .llm_review_processor import (
    LlmReviewProcessorDependencies,
    process_llm_review_with_dependencies,
)
from .notification_processor import (
    ArticleNotifyProcessorDependencies,
    process_notify_with_dependencies,
)
from .reindex_processor import (
    ReindexProcessorDependencies,
    process_reindex_with_dependencies,
)
from .reindex_backfill_runtime import (
    build_content_analysis_backfill_progress_patch,
    build_content_analysis_missing_clause,
    build_interest_auto_repair_job_options,
    count_content_analysis_backfill_targets,
    count_historical_backfill_snapshot_targets,
    find_current_prompt_template_id,
    list_content_analysis_backfill_targets,
    list_gray_zone_target_ids,
    list_historical_backfill_snapshot_batch,
    normalize_content_analysis_backfill_modules,
    normalize_content_analysis_backfill_subject_types,
    prepare_historical_backfill_snapshot,
    queue_interest_auto_repair_job,
    read_active_selection_profile_snapshot,
    read_reindex_job_context,
    replay_content_analysis,
    replay_content_analysis_subject,
    replay_gray_zone_reviews_for_doc,
    replay_historical_articles,
    update_reindex_job_options,
)
from .delivery import dispatch_channel_message
from indexer.app import InterestCentroidIndexer, load_indexer_config
from ml.app import (
    CriterionBaselineCompiler,
    HeuristicArticleFeatureExtractor,
    InterestBaselineCompiler,
    load_embedding_provider,
    mix_weighted_vectors,
    truncate_text_for_embedding,
)
from .canonical_documents import sync_article_canonical_document
from .final_selection import (
    apply_document_candidate_signal_uplift,
    summarize_final_selection_result,
)
from .interest_filters import (
    build_interest_filter_explain,
    resolve_criterion_filter_outcome,
    resolve_interest_filter_context,
    resolve_user_interest_filter_outcome,
    upsert_interest_filter_result,
)
from .gemini import review_with_gemini
from .llm_budget import (
    build_llm_budget_gate_explain,
    get_llm_review_monthly_quota_snapshot,
    resolve_criterion_gray_zone_runtime_resolution,
)
from .notification_preferences import is_channel_enabled_by_preferences
from .notification_runtime import (
    compute_novelty_score,
    fetch_recent_notification_history,
    fetch_user_notification_channels,
    fetch_user_notification_preferences,
    insert_notification_log_row,
    insert_notification_suppression,
    process_due_scheduled_digests,
    process_queued_manual_digests,
    update_notification_delivery_status,
)
from .prompting import render_llm_prompt_template
from .runtime_config import (
    legacy_queue_consumers_enabled,
    sequence_cron_poll_interval_seconds,
    sequence_cron_scheduler_enabled,
    sequence_runner_concurrency,
    sequence_runner_enabled,
    sequence_runner_lock_duration_ms,
    sequence_runner_stalled_interval_ms,
    user_digest_poll_interval_seconds,
    user_digest_scheduler_enabled,
)
from .runtime_db import (
    build_redis_connection_options,
    check_database,
    check_redis,
    open_connection,
)
from .runtime_json import coerce_json_object, coerce_text_list, make_json_safe
from .selection_runtime import (
    passes_allowed_content_kind,
    passes_hard_filters,
)
from .vector_registry import (
    compute_lexical_score,
    fetch_article_features_row,
    fetch_article_vectors,
    fetch_embedding_vectors_by_ids,
    mark_interest_hnsw_dirty,
    resolve_interest_hnsw_label,
    update_criterion_compile_status,
    update_interest_compile_status,
    upsert_article_features,
    upsert_article_vector_registry,
    upsert_criterion_compiled_row,
    upsert_embedding_registry,
    upsert_event_vector_registry,
    upsert_interest_compiled_row,
    upsert_interest_vector_registry,
)
from .scoring import (
    compute_criterion_final_score,
    compute_criterion_meta_score,
    compute_interest_final_score,
    compute_interest_meta_score,
    decide_criterion,
    decide_interest,
    parse_datetime,
    semantic_prototype_score,
)
from .selection_profiles import (
    build_selection_profile_runtime_explain,
    coerce_selection_profile_runtime,
    resolve_profile_gray_zone_decision,
    selection_profile_allows_llm_review,
)
from .story_clusters import sync_story_cluster_and_verification
from .system_feed import summarize_system_feed_result
from .task_engine import (
    configure_discovery_runtime,
    enqueue_sequence_run_job_async,
    PostgresSequenceRepository,
    SequenceCronScheduler,
    SequenceRunJobProcessor,
)
from .task_engine.adapters import build_live_discovery_runtime, discovery_enabled
from .worker_bootstrap import (
    build_worker_error_handler,
    run_user_digest_scheduler_until_stopped as run_user_digest_scheduler_runtime,
    run_workers as run_worker_runtime,
)
from .worker_events import (
    advance_processing_state,
    compute_content_hash,
    insert_outbox_event,
    is_event_processed,
    record_processed_event,
    suppress_downstream_outbox,
)
from .worker_queues import (
    ARTICLE_CRITERIA_MATCHED_EVENT,
    CLUSTER_QUEUE,
    CRITERIA_MATCH_QUEUE,
    CRITERION_COMPILE_CONSUMER,
    CRITERION_COMPILE_QUEUE,
    DEDUP_QUEUE,
    EMBED_QUEUE,
    FEEDBACK_INGEST_CONSUMER,
    FEEDBACK_INGEST_QUEUE,
    INTEREST_CENTROIDS_INDEX_NAME,
    INTEREST_COMPILE_CONSUMER,
    INTEREST_COMPILE_QUEUE,
    INTEREST_MATCH_QUEUE,
    LLM_REVIEW_CONSUMER,
    LLM_REVIEW_QUEUE,
    LLM_REVIEW_REQUESTED_EVENT,
    NORMALIZE_QUEUE,
    NOTIFY_QUEUE,
    REINDEX_CONSUMER,
    REINDEX_QUEUE,
    REINDEX_REQUESTED_EVENT,
    SEQUENCE_QUEUE,
)

LOGGER = logging.getLogger("newsportal.workers")

# Compatibility exports for worker smoke helpers that import queue consumer names from main.
WORKER_MAIN_COMPAT_EXPORTS = (
    build_content_analysis_backfill_progress_patch,
    build_content_analysis_missing_clause,
    build_interest_auto_repair_job_options,
    count_content_analysis_backfill_targets,
    count_historical_backfill_snapshot_targets,
    CRITERION_COMPILE_CONSUMER,
    FEEDBACK_INGEST_CONSUMER,
    find_current_prompt_template_id,
    INTEREST_COMPILE_CONSUMER,
    INTEREST_CENTROIDS_INDEX_NAME,
    list_content_analysis_backfill_targets,
    list_gray_zone_target_ids,
    list_historical_backfill_snapshot_batch,
    LLM_REVIEW_CONSUMER,
    LLM_REVIEW_REQUESTED_EVENT,
    normalize_content_analysis_backfill_modules,
    normalize_content_analysis_backfill_subject_types,
    prepare_historical_backfill_snapshot,
    queue_interest_auto_repair_job,
    read_active_selection_profile_snapshot,
    read_reindex_job_context,
    REINDEX_CONSUMER,
    REINDEX_REQUESTED_EVENT,
    replay_content_analysis,
    replay_content_analysis_subject,
    replay_gray_zone_reviews_for_doc,
    replay_historical_articles,
    update_reindex_job_options,
)

EMBEDDING_PROVIDER = load_embedding_provider()
FEATURE_EXTRACTOR = HeuristicArticleFeatureExtractor()
INTEREST_COMPILER = InterestBaselineCompiler()
CRITERION_COMPILER = CriterionBaselineCompiler()
INTEREST_INDEXER = InterestCentroidIndexer(load_indexer_config())


async def ensure_published_outbox_event(
    *,
    event_id: str,
    event_type: str,
    aggregate_type: str,
    aggregate_id: str,
    payload: dict[str, Any],
) -> None:
    async with await open_connection() as connection:
        async with connection.transaction():
            async with connection.cursor() as cursor:
                await cursor.execute(
                    """
                    insert into outbox_events (
                      event_id,
                      event_type,
                      aggregate_type,
                      aggregate_id,
                      payload_json,
                      status,
                      published_at,
                      attempt_count,
                      error_message
                    )
                    values (%s, %s, %s, %s, %s::jsonb, 'published', now(), 1, null)
                    on conflict (event_id) do update
                    set
                      event_type = excluded.event_type,
                      aggregate_type = excluded.aggregate_type,
                      aggregate_id = excluded.aggregate_id,
                      payload_json = excluded.payload_json,
                      status = 'published',
                      published_at = now(),
                      attempt_count = greatest(outbox_events.attempt_count, 1),
                      error_message = null
                    """,
                    (
                        event_id,
                        event_type,
                        aggregate_type,
                        aggregate_id,
                        Json(make_json_safe(payload)),
                    ),
                )


async def fetch_interest_for_update(
    cursor: psycopg.AsyncCursor[Any],
    interest_id: str,
) -> dict[str, Any]:
    await cursor.execute(
        """
        select *
        from user_interests
        where interest_id = %s
        for update
        """,
        (interest_id,),
    )
    interest = await cursor.fetchone()
    if interest is None:
        raise ValueError(f"Interest {interest_id} was not found.")
    return interest


async def fetch_criterion_for_update(
    cursor: psycopg.AsyncCursor[Any],
    criterion_id: str,
) -> dict[str, Any]:
    await cursor.execute(
        """
        select *
        from criteria
        where criterion_id = %s
        for update
        """,
        (criterion_id,),
    )
    criterion = await cursor.fetchone()
    if criterion is None:
        raise ValueError(f"Criterion {criterion_id} was not found.")
    return criterion


async def upsert_system_feed_result(
    cursor: psycopg.AsyncCursor[Any],
    doc_id: str | uuid.UUID,
) -> dict[str, Any]:
    article = await fetch_article_for_update(cursor, doc_id)
    final_selection_result = await upsert_final_selection_result(
        cursor,
        article=article,
    )
    previous_result = await fetch_system_feed_result_row(cursor, doc_id)
    total_criteria_count = int(final_selection_result["totalFilterCount"])
    relevant_criteria_count = int(final_selection_result["matchedFilterCount"])
    pending_llm_criteria_count = int(final_selection_result["llmReviewPendingFilterCount"])
    irrelevant_criteria_count = int(
        final_selection_result["noMatchFilterCount"]
    ) + int(final_selection_result["technicalFilteredOutCount"]) + int(
        final_selection_result["holdFilterCount"]
    )
    summary = summarize_system_feed_result(
        total_criteria_count=total_criteria_count,
        relevant_criteria_count=relevant_criteria_count,
        irrelevant_criteria_count=irrelevant_criteria_count,
        pending_llm_criteria_count=pending_llm_criteria_count,
    )
    compatibility_decision = str(final_selection_result["compatSystemFeedDecision"])
    compatibility_eligible = bool(final_selection_result["compatEligibleForFeed"])
    explain_json = {
        **coerce_json_object(summary.get("explain_json")),
        "source": "final_selection_results",
        "compatibilityProjection": True,
        "finalSelection": coerce_json_object(final_selection_result.get("explain_json")),
    }
    if compatibility_decision != str(summary.get("decision") or ""):
        explain_json["compatibilityDecisionOverride"] = compatibility_decision
    await cursor.execute(
        """
        insert into system_feed_results (
          doc_id,
          decision,
          eligible_for_feed,
          total_criteria_count,
          relevant_criteria_count,
          irrelevant_criteria_count,
          pending_llm_criteria_count,
          explain_json
        )
        values (%s, %s, %s, %s, %s, %s, %s, %s::jsonb)
        on conflict (doc_id) do update
        set
          decision = excluded.decision,
          eligible_for_feed = excluded.eligible_for_feed,
          total_criteria_count = excluded.total_criteria_count,
          relevant_criteria_count = excluded.relevant_criteria_count,
          irrelevant_criteria_count = excluded.irrelevant_criteria_count,
          pending_llm_criteria_count = excluded.pending_llm_criteria_count,
          explain_json = excluded.explain_json,
          updated_at = now()
        """,
        (
            doc_id,
            compatibility_decision,
            compatibility_eligible,
            total_criteria_count,
            relevant_criteria_count,
            irrelevant_criteria_count,
            pending_llm_criteria_count,
            Json(make_json_safe(explain_json)),
        ),
    )
    return {
        "selection_source": "final_selection_results",
        "decision": compatibility_decision,
        "eligible_for_feed": compatibility_eligible,
        "final_selection_decision": str(final_selection_result["decision"]),
        "final_selection_selected": bool(final_selection_result["isSelected"]),
        "previous_final_selection_decision": final_selection_result.get("previousDecision"),
        "previous_final_selection_selected": bool(
            final_selection_result.get("previousSelected")
        ),
        "previous_decision": (
            str(previous_result.get("decision") or "")
            if previous_result is not None
            else None
        ),
        "previous_eligible_for_feed": (
            bool(previous_result.get("eligible_for_feed"))
            if previous_result is not None
            else False
        ),
    }


async def fetch_final_selection_result_row(
    cursor: psycopg.AsyncCursor[Any],
    doc_id: str | uuid.UUID,
) -> dict[str, Any] | None:
    await cursor.execute(
        """
        select
          final_decision,
          is_selected,
          compat_system_feed_decision,
          verification_target_type,
          verification_target_id,
          verification_state,
          total_filter_count,
          matched_filter_count,
          no_match_filter_count,
          gray_zone_filter_count,
          technical_filtered_out_count,
          explain_json
        from final_selection_results
        where doc_id = %s
        """,
        (doc_id,),
    )
    return await cursor.fetchone()


async def find_reusable_criterion_llm_review(
    cursor: psycopg.AsyncCursor[Any],
    *,
    doc_id: str | uuid.UUID,
    criterion_id: str | uuid.UUID,
    canonical_document_id: str | uuid.UUID | None,
) -> dict[str, Any] | None:
    canonical_uuid = None
    if str(canonical_document_id or "").strip():
        try:
            canonical_uuid = uuid.UUID(str(canonical_document_id))
        except (TypeError, ValueError):
            canonical_uuid = None
    doc_uuid = uuid.UUID(str(doc_id))
    criterion_uuid = uuid.UUID(str(criterion_id))
    await cursor.execute(
        """
        select
          lrl.review_id::text as review_id,
          lrl.doc_id::text as reviewed_doc_id,
          reviewed_article.canonical_doc_id::text as reviewed_canonical_document_id,
          lrl.decision as provider_decision,
          lrl.score,
          lrl.prompt_template_id::text as prompt_template_id,
          lrl.prompt_version,
          lrl.created_at
        from llm_review_log lrl
        join articles reviewed_article on reviewed_article.doc_id = lrl.doc_id
        where lrl.scope = 'criterion'
          and lrl.target_id = %s
          and (
            (%s::uuid is not null and reviewed_article.canonical_doc_id = %s::uuid)
            or (%s::uuid is null and lrl.doc_id = %s)
          )
        order by lrl.created_at desc
        limit 1
        """,
        (
            criterion_uuid,
            canonical_uuid,
            canonical_uuid,
            canonical_uuid,
            doc_uuid,
        ),
    )
    return await cursor.fetchone()


def resolve_criterion_review_final_decision(provider_decision: str | None) -> str:
    normalized = str(provider_decision or "").strip()
    if normalized == "approve":
        return "relevant"
    if normalized == "uncertain":
        return "gray_zone"
    return "irrelevant"


async def persist_criterion_review_resolution(
    cursor: psycopg.AsyncCursor[Any],
    *,
    article: Mapping[str, Any],
    criterion_id: str | uuid.UUID,
    review_context: Mapping[str, Any],
    provider_decision: str,
    provider_score: float | None,
    review_source: str,
    review_id: str | None,
    reused_from_doc_id: str | None = None,
    reused_canonical_document_id: str | None = None,
    prompt_template_id: str | None = None,
    prompt_version: int | None = None,
    refresh_selection_gate: bool,
    historical_backfill: bool,
    suppress_pipeline_fanout: bool,
) -> dict[str, Any]:
    final_decision = resolve_criterion_review_final_decision(provider_decision)
    base_explain = coerce_json_object(review_context.get("explain_json"))
    runtime_review_state = coerce_json_object(base_explain.get("runtimeReviewState"))
    llm_review_payload: dict[str, Any] = {
        "decision": str(provider_decision),
        "score": provider_score,
        "source": review_source,
    }
    if review_id is not None:
        llm_review_payload["reviewId"] = str(review_id)
    if reused_from_doc_id is not None:
        llm_review_payload["reusedFromDocId"] = str(reused_from_doc_id)
    if reused_canonical_document_id is not None:
        llm_review_payload["reusedCanonicalDocumentId"] = str(reused_canonical_document_id)
    if prompt_template_id is not None:
        llm_review_payload["promptTemplateId"] = str(prompt_template_id)
    if prompt_version is not None:
        llm_review_payload["promptVersion"] = int(prompt_version)
    base_explain["llmReview"] = make_json_safe(llm_review_payload)
    base_explain["runtimeReviewState"] = {
        "reviewQueued": False,
        "reason": review_source,
        "candidateRecoveryProtected": bool(
            runtime_review_state.get("candidateRecoveryProtected")
        ),
        "resolvedByReview": True,
    }
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
            Json(
                {
                    "llmReview": llm_review_payload,
                    "runtimeReviewState": base_explain["runtimeReviewState"],
                }
            ),
            article["doc_id"],
            criterion_id,
        ),
    )
    filter_context = await resolve_interest_filter_context(
        cursor,
        article=article,
        prefer_story_cluster=False,
    )
    technical_filter_state, semantic_decision = resolve_criterion_filter_outcome(
        pass_filters=True,
        compat_decision=final_decision,
    )
    await upsert_interest_filter_result(
        cursor,
        filter_scope="system_criterion",
        doc_id=uuid.UUID(str(article["doc_id"])),
        canonical_document_id=filter_context["canonicalDocumentId"],
        story_cluster_id=filter_context["storyClusterId"],
        user_id=None,
        criterion_id=uuid.UUID(str(criterion_id)),
        interest_id=None,
        technical_filter_state=technical_filter_state,
        semantic_decision=semantic_decision,
        compat_decision=final_decision,
        verification_target_type=filter_context["verificationTargetType"],
        verification_target_id=filter_context["verificationTargetId"],
        verification_state=filter_context["verificationState"],
        semantic_score=float(base_explain.get("S_final") or 0.0),
        explain_json=build_interest_filter_explain(
            base_explain_json=make_json_safe(base_explain),
            technical_filter_state=technical_filter_state,
            semantic_decision=semantic_decision,
            compat_decision=final_decision,
            filter_scope="system_criterion",
            context=filter_context,
        ),
    )
    system_feed_result: dict[str, Any] | None = None
    if refresh_selection_gate:
        system_feed_result = await upsert_system_feed_result(cursor, article["doc_id"])
        if (
            should_dispatch_clustering(system_feed_result)
            and not historical_backfill
            and not suppress_pipeline_fanout
        ):
            await insert_outbox_event(
                cursor,
                ARTICLE_CRITERIA_MATCHED_EVENT,
                "article",
                article["doc_id"],
                {"docId": str(article["doc_id"]), "version": 1},
            )
    return {
        "finalDecision": final_decision,
        "reviewSource": review_source,
        "llmReview": llm_review_payload,
        "systemFeedResult": system_feed_result,
    }


async def upsert_final_selection_result(
    cursor: psycopg.AsyncCursor[Any],
    *,
    article: Mapping[str, Any],
) -> dict[str, Any]:
    doc_id = uuid.UUID(str(article["doc_id"]))
    previous_result = await fetch_final_selection_result_row(cursor, doc_id)
    selection_context = await resolve_interest_filter_context(
        cursor,
        article=article,
        prefer_story_cluster=True,
    )
    await cursor.execute(
        """
        select
          count(*)::int as total_filter_count,
          count(*) filter (where semantic_decision = 'match')::int as matched_filter_count,
          count(*) filter (where semantic_decision = 'no_match')::int as no_match_filter_count,
          count(*) filter (where semantic_decision = 'gray_zone')::int as gray_zone_filter_count,
          count(*) filter (
            where semantic_decision = 'gray_zone'
              and coalesce(
                (explain_json -> 'runtimeReviewState' ->> 'reviewQueued')::boolean,
                (explain_json -> 'selectionProfile' ->> 'llmReviewAllowed')::boolean,
                true
              )
          )::int as llm_review_pending_filter_count,
          count(*) filter (
            where semantic_decision = 'gray_zone'
              and coalesce(
                (explain_json -> 'runtimeReviewState' ->> 'reviewQueued')::boolean,
                (explain_json -> 'selectionProfile' ->> 'llmReviewAllowed')::boolean,
                true
              ) = false
          )::int as hold_filter_count,
          count(*) filter (
            where coalesce((explain_json -> 'candidateSignals' ->> 'upliftedToGrayZone')::boolean, false)
          )::int as candidate_signal_uplift_count,
          count(*) filter (
            where coalesce(explain_json -> 'llmReview' ->> 'source', '') = 'reused_canonical_llm_review'
          )::int as canonical_review_reused_count,
          count(*) filter (where technical_filter_state = 'filtered_out')::int as technical_filtered_out_count
        from interest_filter_results
        where doc_id = %s
          and filter_scope = 'system_criterion'
        """,
        (doc_id,),
    )
    counts = await cursor.fetchone() or {}
    await cursor.execute(
        """
        select explain_json -> 'filterReasons' as filter_reasons
        from interest_filter_results
        where doc_id = %s
          and filter_scope = 'system_criterion'
        """,
        (doc_id,),
    )
    filter_reason_rows = await cursor.fetchall() or []
    filter_reason_counts: dict[str, int] = {}
    for row in filter_reason_rows:
        raw_reasons = row.get("filter_reasons")
        if not isinstance(raw_reasons, list):
            continue
        for raw_reason in raw_reasons:
            reason = str(raw_reason or "").strip()
            if not reason:
                continue
            filter_reason_counts[reason] = filter_reason_counts.get(reason, 0) + 1
    duplicate_article_count = 1
    if selection_context.get("canonicalDocumentId") is not None:
        await cursor.execute(
            """
            select count(*)::int as duplicate_article_count
            from articles
            where canonical_doc_id = %s
            """,
            (selection_context["canonicalDocumentId"],),
        )
        duplicate_row = await cursor.fetchone() or {}
        duplicate_article_count = max(
            int(duplicate_row.get("duplicate_article_count") or 0),
            1,
        )
    summary = summarize_final_selection_result(
        total_filter_count=int(counts.get("total_filter_count") or 0),
        matched_filter_count=int(counts.get("matched_filter_count") or 0),
        no_match_filter_count=int(counts.get("no_match_filter_count") or 0),
        gray_zone_filter_count=int(counts.get("gray_zone_filter_count") or 0),
        llm_review_pending_filter_count=int(
            counts.get("llm_review_pending_filter_count") or 0
        ),
        hold_filter_count=int(counts.get("hold_filter_count") or 0),
        technical_filtered_out_count=int(counts.get("technical_filtered_out_count") or 0),
        verification_state=selection_context.get("verificationState"),
        candidate_signal_uplift_count=int(
            counts.get("candidate_signal_uplift_count") or 0
        ),
        filter_reason_counts=filter_reason_counts,
    )
    explain_json = coerce_json_object(summary.get("explain_json"))
    explain_json["candidateSignalUpliftCount"] = int(
        counts.get("candidate_signal_uplift_count") or 0
    )
    explain_json["canonicalReviewReused"] = bool(
        counts.get("canonical_review_reused_count") or 0
    )
    explain_json["canonicalReviewReusedCount"] = int(
        counts.get("canonical_review_reused_count") or 0
    )
    explain_json["duplicateArticleCountForCanonical"] = duplicate_article_count
    explain_json["canonicalSelectionReused"] = bool(
        duplicate_article_count > 1 and bool(summary["isSelected"])
    )
    explain_json["selectionReuseSource"] = (
        "canonical_reused"
        if duplicate_article_count > 1 and bool(summary["isSelected"])
        else "article_level"
    )
    explain_json["canonicalDocumentId"] = (
        None
        if selection_context.get("canonicalDocumentId") is None
        else str(selection_context["canonicalDocumentId"])
    )
    explain_json["storyClusterId"] = (
        None
        if selection_context.get("storyClusterId") is None
        else str(selection_context["storyClusterId"])
    )
    explain_json["verification"] = {
        "targetType": selection_context.get("verificationTargetType"),
        "targetId": (
            None
            if selection_context.get("verificationTargetId") is None
            else str(selection_context["verificationTargetId"])
        ),
        "state": selection_context.get("verificationState"),
    }
    await cursor.execute(
        """
        insert into final_selection_results (
          doc_id,
          canonical_document_id,
          story_cluster_id,
          verification_target_type,
          verification_target_id,
          verification_state,
          total_filter_count,
          matched_filter_count,
          no_match_filter_count,
          gray_zone_filter_count,
          technical_filtered_out_count,
          final_decision,
          is_selected,
          compat_system_feed_decision,
          explain_json
        )
        values (
          %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb
        )
        on conflict (doc_id) do update
        set
          canonical_document_id = excluded.canonical_document_id,
          story_cluster_id = excluded.story_cluster_id,
          verification_target_type = excluded.verification_target_type,
          verification_target_id = excluded.verification_target_id,
          verification_state = excluded.verification_state,
          total_filter_count = excluded.total_filter_count,
          matched_filter_count = excluded.matched_filter_count,
          no_match_filter_count = excluded.no_match_filter_count,
          gray_zone_filter_count = excluded.gray_zone_filter_count,
          technical_filtered_out_count = excluded.technical_filtered_out_count,
          final_decision = excluded.final_decision,
          is_selected = excluded.is_selected,
          compat_system_feed_decision = excluded.compat_system_feed_decision,
          explain_json = excluded.explain_json,
          updated_at = now()
        """,
        (
            doc_id,
            selection_context.get("canonicalDocumentId"),
            selection_context.get("storyClusterId"),
            selection_context.get("verificationTargetType"),
            selection_context.get("verificationTargetId"),
            selection_context.get("verificationState"),
            int(counts.get("total_filter_count") or 0),
            int(counts.get("matched_filter_count") or 0),
            int(counts.get("no_match_filter_count") or 0),
            int(counts.get("gray_zone_filter_count") or 0),
            int(counts.get("technical_filtered_out_count") or 0),
            str(summary["decision"]),
            bool(summary["isSelected"]),
            str(summary["compatSystemFeedDecision"]),
            Json(make_json_safe(explain_json)),
        ),
    )
    return {
        "decision": str(summary["decision"]),
        "isSelected": bool(summary["isSelected"]),
        "compatSystemFeedDecision": str(summary["compatSystemFeedDecision"]),
        "compatEligibleForFeed": bool(summary["compatEligibleForFeed"]),
        "selectionReason": str(summary["selectionReason"]),
        "verificationState": selection_context.get("verificationState"),
        "verificationTargetType": selection_context.get("verificationTargetType"),
        "verificationTargetId": selection_context.get("verificationTargetId"),
        "canonicalDocumentId": selection_context.get("canonicalDocumentId"),
        "storyClusterId": selection_context.get("storyClusterId"),
        "totalFilterCount": int(counts.get("total_filter_count") or 0),
        "matchedFilterCount": int(counts.get("matched_filter_count") or 0),
        "noMatchFilterCount": int(counts.get("no_match_filter_count") or 0),
        "grayZoneFilterCount": int(counts.get("gray_zone_filter_count") or 0),
        "llmReviewPendingFilterCount": int(
            counts.get("llm_review_pending_filter_count") or 0
        ),
        "holdFilterCount": int(counts.get("hold_filter_count") or 0),
        "candidateSignalUpliftCount": int(
            counts.get("candidate_signal_uplift_count") or 0
        ),
        "canonicalReviewReused": bool(counts.get("canonical_review_reused_count") or 0),
        "canonicalReviewReusedCount": int(
            counts.get("canonical_review_reused_count") or 0
        ),
        "duplicateArticleCountForCanonical": duplicate_article_count,
        "canonicalSelectionReused": bool(
            duplicate_article_count > 1 and bool(summary["isSelected"])
        ),
        "technicalFilteredOutCount": int(counts.get("technical_filtered_out_count") or 0),
        "previousDecision": (
            str(previous_result.get("final_decision") or "")
            if previous_result is not None
            else None
        ),
        "previousSelected": (
            bool(previous_result.get("is_selected"))
            if previous_result is not None
            else False
        ),
        "explain_json": explain_json,
    }


async def fetch_system_feed_result_row(
    cursor: psycopg.AsyncCursor[Any],
    doc_id: str | uuid.UUID,
) -> dict[str, Any] | None:
    await cursor.execute(
        """
        select
          decision,
          eligible_for_feed,
          total_criteria_count,
          relevant_criteria_count,
          irrelevant_criteria_count,
          pending_llm_criteria_count,
          explain_json
        from system_feed_results
        where doc_id = %s
        """,
        (doc_id,),
    )
    return await cursor.fetchone()


async def fetch_selection_gate_result_row(
    cursor: psycopg.AsyncCursor[Any],
    doc_id: str | uuid.UUID,
) -> dict[str, Any] | None:
    final_selection_result = await fetch_final_selection_result_row(cursor, doc_id)
    if final_selection_result is not None:
        return {
            "selection_source": "final_selection_results",
            "decision": str(final_selection_result.get("final_decision") or ""),
            "is_selected": bool(final_selection_result.get("is_selected")),
            "compat_system_feed_decision": str(
                final_selection_result.get("compat_system_feed_decision") or ""
            ),
            "verification_target_type": final_selection_result.get(
                "verification_target_type"
            ),
            "verification_target_id": final_selection_result.get("verification_target_id"),
            "verification_state": final_selection_result.get("verification_state"),
            "selection_reuse_source": "article_level",
        }

    await cursor.execute(
        """
        select canonical_doc_id
        from articles
        where doc_id = %s
        """,
        (doc_id,),
    )
    article_row = await cursor.fetchone() or {}
    canonical_document_id = article_row.get("canonical_doc_id")
    if canonical_document_id is not None:
        await cursor.execute(
            """
            select
              fsr.final_decision,
              fsr.is_selected,
              fsr.compat_system_feed_decision,
              fsr.verification_target_type,
              fsr.verification_target_id,
              fsr.verification_state
            from final_selection_results fsr
            where fsr.canonical_document_id = %s
            order by fsr.is_selected desc, fsr.updated_at desc, fsr.doc_id asc
            limit 1
            """,
            (canonical_document_id,),
        )
        canonical_final_selection = await cursor.fetchone()
        if canonical_final_selection is not None:
            return {
                "selection_source": "final_selection_results",
                "decision": str(canonical_final_selection.get("final_decision") or ""),
                "is_selected": bool(canonical_final_selection.get("is_selected")),
                "compat_system_feed_decision": str(
                    canonical_final_selection.get("compat_system_feed_decision") or ""
                ),
                "verification_target_type": canonical_final_selection.get(
                    "verification_target_type"
                ),
                "verification_target_id": canonical_final_selection.get(
                    "verification_target_id"
                ),
                "verification_state": canonical_final_selection.get("verification_state"),
                "selection_reuse_source": "canonical_reused",
            }

    system_feed_result = await fetch_system_feed_result_row(cursor, doc_id)
    if system_feed_result is None:
        if canonical_document_id is None:
            return None
        await cursor.execute(
            """
            select sfr.*
            from system_feed_results sfr
            join articles a on a.doc_id = sfr.doc_id
            where a.canonical_doc_id = %s
            order by coalesce(sfr.eligible_for_feed, false) desc, sfr.updated_at desc, sfr.doc_id asc
            limit 1
            """,
            (canonical_document_id,),
        )
        system_feed_result = await cursor.fetchone()
        if system_feed_result is None:
            return None

    return {
        "selection_source": "system_feed_results",
        "decision": str(system_feed_result.get("decision") or ""),
        "is_selected": bool(system_feed_result.get("eligible_for_feed")),
        "compat_system_feed_decision": str(system_feed_result.get("decision") or ""),
        "verification_target_type": None,
        "verification_target_id": None,
        "verification_state": None,
        "selection_reuse_source": (
            "canonical_reused" if canonical_document_id is not None else "article_level"
        ),
    }


def should_dispatch_clustering(system_feed_result: Mapping[str, Any]) -> bool:
    if (
        "final_selection_selected" in system_feed_result
        or "previous_final_selection_selected" in system_feed_result
    ):
        return bool(system_feed_result.get("final_selection_selected")) and not bool(
            system_feed_result.get("previous_final_selection_selected")
        )
    return bool(system_feed_result.get("eligible_for_feed")) and not bool(
        system_feed_result.get("previous_eligible_for_feed")
    )


async def is_article_eligible_for_personalization(
    *,
    doc_id: str,
) -> bool:
    async with await open_connection() as connection:
        async with connection.cursor() as cursor:
            result = await fetch_selection_gate_result_row(cursor, doc_id)
    return bool(result and result.get("is_selected"))


async def list_compiled_criteria(
    cursor: psycopg.AsyncCursor[Any],
) -> list[dict[str, Any]]:
    await cursor.execute(
        """
        select
          c.criterion_id::text as criterion_id,
          c.source_interest_template_id::text as source_interest_template_id,
          c.description,
          c.enabled,
          c.priority,
          cc.source_version,
          cc.compiled_json,
          cc.source_snapshot_json,
          coalesce(
            case
              when jsonb_typeof(coalesce(it.allowed_content_kinds, '[]'::jsonb)) = 'array'
              then coalesce(it.allowed_content_kinds, '[]'::jsonb)
              else null
            end,
            case
              when jsonb_typeof(coalesce(sp.bindings_json -> 'allowedContentKinds', '[]'::jsonb)) = 'array'
              then coalesce(sp.bindings_json -> 'allowedContentKinds', '[]'::jsonb)
              else null
            end,
            case
              when jsonb_typeof(coalesce(sp.policy_json -> 'allowedContentKinds', '[]'::jsonb)) = 'array'
              then coalesce(sp.policy_json -> 'allowedContentKinds', '[]'::jsonb)
              else null
            end,
            '[]'::jsonb
          ) as allowed_content_kinds,
          sp.selection_profile_id::text as selection_profile_id,
          sp.profile_family as selection_profile_family,
          sp.status as selection_profile_status,
          sp.version as selection_profile_version,
          sp.definition_json as selection_profile_definition_json,
          sp.policy_json as selection_profile_policy_json
        from criteria c
        join criteria_compiled cc on cc.criterion_id = c.criterion_id
        left join interest_templates it
          on it.interest_template_id = c.source_interest_template_id
        left join selection_profiles sp on sp.source_criterion_id = c.criterion_id
        where c.enabled = true
          and c.compiled = true
          and cc.compile_status = 'compiled'
        order by c.updated_at desc
        """
    )
    return list(await cursor.fetchall())


async def list_compiled_interests(
    cursor: psycopg.AsyncCursor[Any],
    *,
    user_id: str | None = None,
    interest_id: str | None = None,
) -> list[dict[str, Any]]:
    filters = [
        "ui.enabled = true",
        "ui.compiled = true",
        "uic.compile_status = 'compiled'",
    ]
    params: list[Any] = []
    if user_id:
        filters.append("ui.user_id = %s")
        params.append(user_id)
    if interest_id:
        filters.append("ui.interest_id = %s")
        params.append(interest_id)

    await cursor.execute(
        f"""
        select
          ui.interest_id::text as interest_id,
          ui.user_id::text as user_id,
          ui.description,
          ui.priority,
          ui.enabled,
          uic.source_version,
          uic.compiled_json,
          uic.source_snapshot_json
        from user_interests ui
        join user_interests_compiled uic on uic.interest_id = ui.interest_id
        where {' and '.join(filters)}
        order by ui.updated_at desc
        """,
        tuple(params),
    )
    return list(await cursor.fetchall())


async def find_prompt_template(
    cursor: psycopg.AsyncCursor[Any],
    scope: str,
) -> dict[str, Any] | None:
    await cursor.execute(
        """
        select
          prompt_template_id::text as prompt_template_id,
          name,
          scope,
          template_text,
          version
        from llm_prompt_templates
        where is_active = true
          and scope in (%s, 'global')
        order by case when scope = %s then 0 else 1 end, version desc, updated_at desc
        limit 1
        """,
        (scope, scope),
    )
    return await cursor.fetchone()


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
) -> bool:
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

        article_vectors = await fetch_article_vectors(cursor, member_doc_id)
        event_vector = article_vectors.get("e_event")
        if event_vector:
            weighted_vectors.append((1.0, event_vector))

    centroid_embedding_id: str | None = None
    if weighted_vectors:
        centroid_vector = mix_weighted_vectors(weighted_vectors)
        centroid_embedding_id = await upsert_embedding_registry(
            cursor,
            entity_type="event_cluster",
            entity_id=cluster_id,
            vector_type="e_event",
            model_key=EMBEDDING_PROVIDER.model_key,
            vector_version=vector_version,
            vector=centroid_vector,
            content_hash=compute_content_hash(
                {
                    "clusterId": str(cluster_id),
                    "vectorType": "e_event",
                    "memberDocIds": member_doc_ids,
                    "version": vector_version,
                }
            ),
        )
        await upsert_event_vector_registry(
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
) -> tuple[uuid.UUID, bool]:
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
    await rebuild_cluster_state(
        cursor,
        cluster_id=cluster_id,
        vector_version=vector_version,
    )
    if previous_cluster_id is not None and previous_cluster_id != cluster_id:
        await rebuild_cluster_state(
            cursor,
            cluster_id=previous_cluster_id,
            vector_version=vector_version,
        )
    return cluster_id, is_new_cluster


async def process_normalize(job: Job, _job_token: str) -> dict[str, Any]:
    return await process_normalize_with_dependencies(
        job,
        _job_token,
        ArticleProcessorDependencies(
            open_connection=open_connection,
            fetch_article_for_update=fetch_article_for_update,
            sync_article_canonical_document=sync_article_canonical_document,
        ),
    )


async def process_article_extract(job: Job, _job_token: str) -> dict[str, Any]:
    return await process_article_extract_with_plugin(job, _job_token)


async def process_dedup(job: Job, _job_token: str) -> dict[str, Any]:
    return await process_dedup_with_dependencies(
        job,
        _job_token,
        ArticleProcessorDependencies(
            open_connection=open_connection,
            fetch_article_for_update=fetch_article_for_update,
            sync_article_canonical_document=sync_article_canonical_document,
        ),
    )


async def process_embed(job: Job, _job_token: str) -> dict[str, Any]:
    return await process_embed_with_dependencies(
        job,
        _job_token,
        ArticleEmbedProcessorDependencies(
            open_connection=open_connection,
            fetch_article_for_update=fetch_article_for_update,
            embedding_provider=EMBEDDING_PROVIDER,
            feature_extractor=FEATURE_EXTRACTOR,
            truncate_text_for_embedding=truncate_text_for_embedding,
            mix_weighted_vectors=mix_weighted_vectors,
            upsert_article_features=upsert_article_features,
            upsert_embedding_registry=upsert_embedding_registry,
            upsert_article_vector_registry=upsert_article_vector_registry,
            upsert_event_vector_registry=upsert_event_vector_registry,
        ),
    )


async def process_cluster(job: Job, _job_token: str) -> dict[str, Any]:
    return await process_cluster_with_dependencies(
        job,
        _job_token,
        ArticleClusterProcessorDependencies(
            open_connection=open_connection,
            fetch_article_for_update=fetch_article_for_update,
            sync_story_cluster_and_verification=sync_story_cluster_and_verification,
            upsert_system_feed_result=upsert_system_feed_result,
            fetch_article_features_row=fetch_article_features_row,
            fetch_article_vectors=fetch_article_vectors,
            fetch_cluster_event_vector=fetch_cluster_event_vector,
            load_recent_cluster_candidates=load_recent_cluster_candidates,
            create_or_update_cluster=create_or_update_cluster,
            suppress_downstream_outbox=suppress_downstream_outbox,
            is_event_processed=is_event_processed,
            record_processed_event=record_processed_event,
            insert_outbox_event=insert_outbox_event,
            advance_processing_state=advance_processing_state,
        ),
    )


async def process_match_criteria(job: Job, _job_token: str) -> dict[str, Any]:
    return await process_match_criteria_with_dependencies(
        job,
        _job_token,
        CriteriaMatchProcessorDependencies(
            open_connection=open_connection,
            suppress_downstream_outbox=suppress_downstream_outbox,
            is_event_processed=is_event_processed,
            fetch_article_for_update=fetch_article_for_update,
            fetch_article_features_row=fetch_article_features_row,
            fetch_article_vectors=fetch_article_vectors,
            list_compiled_criteria=list_compiled_criteria,
            find_prompt_template=find_prompt_template,
            get_llm_review_monthly_quota_snapshot=get_llm_review_monthly_quota_snapshot,
            resolve_interest_filter_context=resolve_interest_filter_context,
            passes_hard_filters=passes_hard_filters,
            passes_allowed_content_kind=passes_allowed_content_kind,
            compute_lexical_score=compute_lexical_score,
            fetch_embedding_vectors_by_ids=fetch_embedding_vectors_by_ids,
            semantic_prototype_score=semantic_prototype_score,
            compute_criterion_meta_score=compute_criterion_meta_score,
            compute_criterion_final_score=compute_criterion_final_score,
            decide_criterion=decide_criterion,
            apply_document_candidate_signal_uplift=apply_document_candidate_signal_uplift,
            coerce_selection_profile_runtime=coerce_selection_profile_runtime,
            build_selection_profile_runtime_explain=build_selection_profile_runtime_explain,
            selection_profile_allows_llm_review=selection_profile_allows_llm_review,
            resolve_criterion_gray_zone_runtime_resolution=resolve_criterion_gray_zone_runtime_resolution,
            build_llm_budget_gate_explain=build_llm_budget_gate_explain,
            resolve_profile_gray_zone_decision=resolve_profile_gray_zone_decision,
            resolve_criterion_filter_outcome=resolve_criterion_filter_outcome,
            upsert_interest_filter_result=upsert_interest_filter_result,
            build_interest_filter_explain=build_interest_filter_explain,
            find_reusable_criterion_llm_review=find_reusable_criterion_llm_review,
            persist_criterion_review_resolution=persist_criterion_review_resolution,
            insert_outbox_event=insert_outbox_event,
            upsert_system_feed_result=upsert_system_feed_result,
            should_dispatch_clustering=should_dispatch_clustering,
            record_processed_event=record_processed_event,
        ),
    )


async def process_match_interests(job: Job, _job_token: str) -> dict[str, Any]:
    return await process_match_interests_with_dependencies(
        job,
        _job_token,
        InterestMatchProcessorDependencies(
            open_connection=open_connection,
            suppress_downstream_outbox=suppress_downstream_outbox,
            is_event_processed=is_event_processed,
            fetch_article_for_update=fetch_article_for_update,
            fetch_selection_gate_result_row=fetch_selection_gate_result_row,
            record_processed_event=record_processed_event,
            fetch_article_features_row=fetch_article_features_row,
            fetch_article_vectors=fetch_article_vectors,
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
        ),
    )


async def process_notify(job: Job, _job_token: str) -> dict[str, Any]:
    return await process_notify_with_dependencies(
        job,
        _job_token,
        ArticleNotifyProcessorDependencies(
            open_connection=open_connection,
            fetch_article_for_update=fetch_article_for_update,
            fetch_recent_notification_history=fetch_recent_notification_history,
            fetch_user_notification_preferences=fetch_user_notification_preferences,
            fetch_user_notification_channels=fetch_user_notification_channels,
            is_channel_enabled_by_preferences=is_channel_enabled_by_preferences,
            insert_notification_suppression=insert_notification_suppression,
            insert_notification_log_row=insert_notification_log_row,
            dispatch_channel_message=dispatch_channel_message,
            update_notification_delivery_status=update_notification_delivery_status,
        ),
    )


async def process_llm_review(job: Job, _job_token: str) -> dict[str, Any]:
    return await process_llm_review_with_dependencies(
        job,
        _job_token,
        LlmReviewProcessorDependencies(
            open_connection=open_connection,
            suppress_downstream_outbox=suppress_downstream_outbox,
            is_event_processed=is_event_processed,
            fetch_article_for_update=fetch_article_for_update,
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
        ),
    )


async def process_feedback_ingest(job: Job, _job_token: str) -> dict[str, Any]:
    return await process_feedback_ingest_with_dependencies(
        job,
        _job_token,
        FeedbackIngestProcessorDependencies(
            open_connection=open_connection,
            is_event_processed=is_event_processed,
            record_processed_event=record_processed_event,
        ),
    )


async def process_reindex(job: Job, _job_token: str) -> dict[str, Any]:
    return await process_reindex_with_dependencies(
        job,
        _job_token,
        ReindexProcessorDependencies(
            open_connection=open_connection,
            is_event_processed=is_event_processed,
            read_reindex_job_context=read_reindex_job_context,
            interest_indexer=INTEREST_INDEXER,
            read_active_selection_profile_snapshot=read_active_selection_profile_snapshot,
            replay_historical_articles=replay_historical_articles,
            normalize_content_analysis_backfill_modules=normalize_content_analysis_backfill_modules,
            normalize_content_analysis_backfill_subject_types=normalize_content_analysis_backfill_subject_types,
            replay_content_analysis=replay_content_analysis,
            record_processed_event=record_processed_event,
        ),
    )


async def process_interest_compile(job: Job, _job_token: str) -> dict[str, Any]:
    return await process_interest_compile_with_dependencies(
        job,
        _job_token,
        InterestCompileProcessorDependencies(
            open_connection=open_connection,
            is_event_processed=is_event_processed,
            fetch_interest_for_update=fetch_interest_for_update,
            interest_compiler=INTEREST_COMPILER,
            embedding_provider=EMBEDDING_PROVIDER,
            feature_extractor=FEATURE_EXTRACTOR,
            upsert_embedding_registry=upsert_embedding_registry,
            compute_content_hash=compute_content_hash,
            upsert_interest_vector_registry=upsert_interest_vector_registry,
            resolve_interest_hnsw_label=resolve_interest_hnsw_label,
            mark_interest_hnsw_dirty=mark_interest_hnsw_dirty,
            upsert_interest_compiled_row=upsert_interest_compiled_row,
            update_interest_compile_status=update_interest_compile_status,
            record_processed_event=record_processed_event,
            queue_interest_auto_repair_job=queue_interest_auto_repair_job,
            interest_indexer=INTEREST_INDEXER,
            logger=LOGGER,
        ),
    )


async def process_criterion_compile(job: Job, _job_token: str) -> dict[str, Any]:
    return await process_criterion_compile_with_dependencies(
        job,
        _job_token,
        CriterionCompileProcessorDependencies(
            open_connection=open_connection,
            is_event_processed=is_event_processed,
            fetch_criterion_for_update=fetch_criterion_for_update,
            criterion_compiler=CRITERION_COMPILER,
            embedding_provider=EMBEDDING_PROVIDER,
            feature_extractor=FEATURE_EXTRACTOR,
            upsert_embedding_registry=upsert_embedding_registry,
            compute_content_hash=compute_content_hash,
            upsert_criterion_compiled_row=upsert_criterion_compiled_row,
            update_criterion_compile_status=update_criterion_compile_status,
            record_processed_event=record_processed_event,
        ),
    )


def build_worker_runtime_deps() -> dict[str, Any]:
    return {
        "CLUSTER_QUEUE": CLUSTER_QUEUE,
        "CRITERIA_MATCH_QUEUE": CRITERIA_MATCH_QUEUE,
        "CRITERION_COMPILE_QUEUE": CRITERION_COMPILE_QUEUE,
        "DEDUP_QUEUE": DEDUP_QUEUE,
        "EMBED_QUEUE": EMBED_QUEUE,
        "FEEDBACK_INGEST_QUEUE": FEEDBACK_INGEST_QUEUE,
        "INTEREST_COMPILE_QUEUE": INTEREST_COMPILE_QUEUE,
        "INTEREST_MATCH_QUEUE": INTEREST_MATCH_QUEUE,
        "LLM_REVIEW_QUEUE": LLM_REVIEW_QUEUE,
        "NORMALIZE_QUEUE": NORMALIZE_QUEUE,
        "NOTIFY_QUEUE": NOTIFY_QUEUE,
        "REINDEX_QUEUE": REINDEX_QUEUE,
        "SEQUENCE_QUEUE": SEQUENCE_QUEUE,
        "PostgresSequenceRepository": PostgresSequenceRepository,
        "SequenceCronScheduler": SequenceCronScheduler,
        "SequenceRunJobProcessor": SequenceRunJobProcessor,
        "build_redis_connection_options": build_redis_connection_options,
        "enqueue_sequence_run_job_async": enqueue_sequence_run_job_async,
        "legacy_queue_consumers_enabled": legacy_queue_consumers_enabled,
        "process_cluster": process_cluster,
        "process_criterion_compile": process_criterion_compile,
        "process_dedup": process_dedup,
        "process_due_scheduled_digests": process_due_scheduled_digests,
        "process_embed": process_embed,
        "process_feedback_ingest": process_feedback_ingest,
        "process_interest_compile": process_interest_compile,
        "process_llm_review": process_llm_review,
        "process_match_criteria": process_match_criteria,
        "process_match_interests": process_match_interests,
        "process_normalize": process_normalize,
        "process_notify": process_notify,
        "process_queued_manual_digests": process_queued_manual_digests,
        "process_reindex": process_reindex,
        "sequence_cron_poll_interval_seconds": sequence_cron_poll_interval_seconds,
        "sequence_cron_scheduler_enabled": sequence_cron_scheduler_enabled,
        "sequence_runner_concurrency": sequence_runner_concurrency,
        "sequence_runner_enabled": sequence_runner_enabled,
        "sequence_runner_lock_duration_ms": sequence_runner_lock_duration_ms,
        "sequence_runner_stalled_interval_ms": sequence_runner_stalled_interval_ms,
        "user_digest_poll_interval_seconds": user_digest_poll_interval_seconds,
        "user_digest_scheduler_enabled": user_digest_scheduler_enabled,
    }


def on_worker_error(label: str):
    return build_worker_error_handler(label, LOGGER)


async def run_user_digest_scheduler_until_stopped(stop_event: asyncio.Event) -> None:
    await run_user_digest_scheduler_runtime(stop_event, build_worker_runtime_deps(), LOGGER)


async def run_workers() -> None:
    await run_worker_runtime(build_worker_runtime_deps(), LOGGER)


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    check_database()
    check_redis()
    if discovery_enabled():
        configure_discovery_runtime(build_live_discovery_runtime())
        LOGGER.info("Discovery runtime configured with live adapters.")
    else:
        LOGGER.info("Discovery runtime remains disabled; default unavailable adapters stay active.")
    asyncio.run(run_workers())


if __name__ == "__main__":
    main()

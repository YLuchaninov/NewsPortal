from __future__ import annotations

import asyncio
import logging
import os as os
import sys
from pathlib import Path
from typing import Any

SERVICES_ROOT = Path(__file__).resolve().parents[2]
if str(SERVICES_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICES_ROOT))

from bullmq import Job

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
from .cluster_repository import (
    create_or_update_cluster,
    fetch_cluster_event_vector,
    load_recent_cluster_candidates,
    rebuild_cluster_state,
)
from .compile_processors import (
    CriterionCompileProcessorDependencies,
    InterestCompileProcessorDependencies,
    process_criterion_compile_with_dependencies,
    process_interest_compile_with_dependencies,
)
from .compile_repository import fetch_criterion_for_update, fetch_interest_for_update
from .matching_read_repository import (
    find_prompt_template,
    list_compiled_criteria,
    list_compiled_interests,
)
from .selection_gate_repository import (
    fetch_final_selection_result_row,
    fetch_selection_gate_result_row,
    fetch_system_feed_result_row,
    is_article_eligible_for_personalization,
)
from .selection_write_repository import (
    find_reusable_criterion_llm_review,
    persist_criterion_review_resolution,
    resolve_criterion_review_final_decision,
    should_dispatch_clustering,
    upsert_final_selection_result,
    upsert_system_feed_result,
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
    is_reindex_job_cancel_requested,
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
from .final_selection import apply_document_candidate_signal_uplift
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
    semantic_prototype_score,
)
from .selection_profiles import (
    build_selection_profile_runtime_explain,
    coerce_selection_profile_runtime,
    resolve_profile_gray_zone_decision,
    resolve_strict_candidate_signal_guard,
    selection_profile_allows_llm_review,
)
from .story_clusters import sync_story_cluster_and_verification
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
    ensure_published_outbox_event,
    insert_outbox_event,
    is_event_processed,
    record_processed_event,
    suppress_downstream_outbox,
)
from .worker_queues import (
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
    ensure_published_outbox_event,
    FEEDBACK_INGEST_CONSUMER,
    fetch_final_selection_result_row,
    fetch_system_feed_result_row,
    find_current_prompt_template_id,
    INTEREST_COMPILE_CONSUMER,
    INTEREST_CENTROIDS_INDEX_NAME,
    is_article_eligible_for_personalization,
    list_content_analysis_backfill_targets,
    list_gray_zone_target_ids,
    list_historical_backfill_snapshot_batch,
    LLM_REVIEW_CONSUMER,
    LLM_REVIEW_REQUESTED_EVENT,
    normalize_content_analysis_backfill_modules,
    normalize_content_analysis_backfill_subject_types,
    prepare_historical_backfill_snapshot,
    queue_interest_auto_repair_job,
    is_reindex_job_cancel_requested,
    read_active_selection_profile_snapshot,
    read_reindex_job_context,
    REINDEX_CONSUMER,
    REINDEX_REQUESTED_EVENT,
    rebuild_cluster_state,
    resolve_criterion_review_final_decision,
    replay_content_analysis,
    replay_content_analysis_subject,
    replay_gray_zone_reviews_for_doc,
    replay_historical_articles,
    upsert_final_selection_result,
    update_reindex_job_options,
)

EMBEDDING_PROVIDER = load_embedding_provider()
FEATURE_EXTRACTOR = HeuristicArticleFeatureExtractor()
INTEREST_COMPILER = InterestBaselineCompiler()
CRITERION_COMPILER = CriterionBaselineCompiler()
INTEREST_INDEXER = InterestCentroidIndexer(load_indexer_config())


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
            resolve_strict_candidate_signal_guard=resolve_strict_candidate_signal_guard,
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

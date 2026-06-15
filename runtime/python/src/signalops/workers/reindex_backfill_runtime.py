from __future__ import annotations

from collections.abc import Sequence

from . import reindex_historical_replay_runtime as _historical_replay
from .cluster_processor import process_cluster
from .criteria_match_processor import process_match_criteria
from .interest_match_processor import process_match_interests
from .llm_review_processor import process_llm_review
from .matching_read_repository import find_prompt_template
from .reindex_content_analysis_backfill import (
    CONTENT_ANALYSIS_BACKFILL_MODULES,
    CONTENT_ANALYSIS_BACKFILL_SUBJECT_TYPES,
    DEFAULT_CONTENT_ANALYSIS_BACKFILL_MODULES,
    build_content_analysis_backfill_progress_patch,
    build_content_analysis_missing_clause,
    count_content_analysis_backfill_targets,
    list_content_analysis_backfill_targets,
    normalize_content_analysis_backfill_modules,
    normalize_content_analysis_backfill_subject_types,
    replay_content_analysis,
    replay_content_analysis_subject,
)
from .reindex_historical_replay_runtime import (
    HISTORICAL_REPLAY_LLM_REVIEW_TIMEOUT_SECONDS,
    count_historical_backfill_snapshot_targets,
    find_current_prompt_template_id,
    list_gray_zone_target_ids,
    list_historical_backfill_snapshot_batch,
    replay_historical_signal_candidates,
)
from .reindex_interest_auto_repair import (
    build_interest_auto_repair_job_options,
    queue_interest_auto_repair_job,
)
from .reindex_runtime_jobs import (
    REINDEX_BATCH_ONLY_OPTION_KEYS,
    REINDEX_RUNTIME_OPTION_KEYS,
    _normalize_reindex_cancellation_value,
    build_reindex_cancellation_key,
    is_reindex_job_cancel_requested,
    read_active_selection_profile_snapshot,
    read_reindex_job_context,
    update_reindex_job_options,
)
from .runtime_db import open_connection
from .selection_gate_repository import is_signal_candidate_eligible_for_personalization
from .signal_candidate_extraction_processor import process_signal_candidate_extract
from .signal_candidate_processors import process_dedup, process_embed, process_normalize
from .worker_events import ensure_published_outbox_event, insert_outbox_event


async def prepare_historical_backfill_snapshot(
    *,
    reindex_job_id: str,
    doc_ids: Sequence[str] | None = None,
    system_feed_only: bool = False,
    include_enrichment: bool = False,
    force_enrichment: bool = False,
) -> int:
    _historical_replay.count_historical_backfill_snapshot_targets = (
        count_historical_backfill_snapshot_targets
    )
    _historical_replay.open_connection = open_connection
    return await _historical_replay.prepare_historical_backfill_snapshot(
        reindex_job_id=reindex_job_id,
        doc_ids=doc_ids,
        system_feed_only=system_feed_only,
        include_enrichment=include_enrichment,
        force_enrichment=force_enrichment,
    )


async def replay_gray_zone_reviews_for_doc(
    *,
    doc_id: str,
    scope: str,
) -> dict[str, int]:
    _historical_replay.find_current_prompt_template_id = find_current_prompt_template_id
    _historical_replay.list_gray_zone_target_ids = list_gray_zone_target_ids
    _historical_replay.ensure_published_outbox_event = ensure_published_outbox_event
    _historical_replay.process_llm_review = process_llm_review
    return await _historical_replay.replay_gray_zone_reviews_for_doc(
        doc_id=doc_id,
        scope=scope,
    )


__all__ = [
    "CONTENT_ANALYSIS_BACKFILL_MODULES",
    "CONTENT_ANALYSIS_BACKFILL_SUBJECT_TYPES",
    "DEFAULT_CONTENT_ANALYSIS_BACKFILL_MODULES",
    "HISTORICAL_REPLAY_LLM_REVIEW_TIMEOUT_SECONDS",
    "REINDEX_BATCH_ONLY_OPTION_KEYS",
    "REINDEX_RUNTIME_OPTION_KEYS",
    "_normalize_reindex_cancellation_value",
    "build_content_analysis_backfill_progress_patch",
    "build_content_analysis_missing_clause",
    "build_interest_auto_repair_job_options",
    "build_reindex_cancellation_key",
    "count_content_analysis_backfill_targets",
    "count_historical_backfill_snapshot_targets",
    "ensure_published_outbox_event",
    "find_current_prompt_template_id",
    "find_prompt_template",
    "insert_outbox_event",
    "is_reindex_job_cancel_requested",
    "is_signal_candidate_eligible_for_personalization",
    "list_content_analysis_backfill_targets",
    "list_gray_zone_target_ids",
    "list_historical_backfill_snapshot_batch",
    "normalize_content_analysis_backfill_modules",
    "normalize_content_analysis_backfill_subject_types",
    "open_connection",
    "prepare_historical_backfill_snapshot",
    "process_cluster",
    "process_dedup",
    "process_embed",
    "process_llm_review",
    "process_match_criteria",
    "process_match_interests",
    "process_normalize",
    "process_signal_candidate_extract",
    "queue_interest_auto_repair_job",
    "read_active_selection_profile_snapshot",
    "read_reindex_job_context",
    "replay_content_analysis",
    "replay_content_analysis_subject",
    "replay_gray_zone_reviews_for_doc",
    "replay_historical_signal_candidates",
    "update_reindex_job_options",
]

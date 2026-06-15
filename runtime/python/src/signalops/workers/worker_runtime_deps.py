from __future__ import annotations

from dataclasses import dataclass, fields
from typing import Any


@dataclass(frozen=True)
class WorkerRuntimeDeps:
    CLUSTER_QUEUE: Any
    CRITERIA_MATCH_QUEUE: Any
    CRITERION_COMPILE_QUEUE: Any
    DEDUP_QUEUE: Any
    EMBED_QUEUE: Any
    FEEDBACK_INGEST_QUEUE: Any
    INTEREST_COMPILE_QUEUE: Any
    INTEREST_MATCH_QUEUE: Any
    LLM_REVIEW_QUEUE: Any
    NORMALIZE_QUEUE: Any
    NOTIFY_QUEUE: Any
    REINDEX_QUEUE: Any
    SEQUENCE_QUEUE: Any
    PostgresSequenceRepository: Any
    SequenceCronScheduler: Any
    SequenceRunJobProcessor: Any
    build_redis_connection_options: Any
    enqueue_sequence_run_job_async: Any
    process_cluster: Any
    process_criterion_compile: Any
    process_dedup: Any
    process_due_scheduled_digests: Any
    process_embed: Any
    process_feedback_ingest: Any
    process_interest_compile: Any
    process_llm_review: Any
    process_match_criteria: Any
    process_match_interests: Any
    process_normalize: Any
    process_notify: Any
    process_queued_manual_digests: Any
    process_reindex: Any
    sequence_cron_poll_interval_seconds: Any
    sequence_cron_scheduler_enabled: Any
    sequence_runner_concurrency: Any
    sequence_runner_enabled: Any
    sequence_runner_lock_duration_ms: Any
    sequence_runner_stalled_interval_ms: Any
    user_digest_poll_interval_seconds: Any
    user_digest_scheduler_enabled: Any


def worker_runtime_deps_to_dict(deps: WorkerRuntimeDeps) -> dict[str, Any]:
    return {field.name: getattr(deps, field.name) for field in fields(WorkerRuntimeDeps)}

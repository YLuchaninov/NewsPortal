from __future__ import annotations

from collections.abc import Mapping
from typing import Any


def build_worker_runtime_deps_from_namespace(namespace: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "CLUSTER_QUEUE": namespace["CLUSTER_QUEUE"],
        "CRITERIA_MATCH_QUEUE": namespace["CRITERIA_MATCH_QUEUE"],
        "CRITERION_COMPILE_QUEUE": namespace["CRITERION_COMPILE_QUEUE"],
        "DEDUP_QUEUE": namespace["DEDUP_QUEUE"],
        "EMBED_QUEUE": namespace["EMBED_QUEUE"],
        "FEEDBACK_INGEST_QUEUE": namespace["FEEDBACK_INGEST_QUEUE"],
        "INTEREST_COMPILE_QUEUE": namespace["INTEREST_COMPILE_QUEUE"],
        "INTEREST_MATCH_QUEUE": namespace["INTEREST_MATCH_QUEUE"],
        "LLM_REVIEW_QUEUE": namespace["LLM_REVIEW_QUEUE"],
        "NORMALIZE_QUEUE": namespace["NORMALIZE_QUEUE"],
        "NOTIFY_QUEUE": namespace["NOTIFY_QUEUE"],
        "REINDEX_QUEUE": namespace["REINDEX_QUEUE"],
        "SEQUENCE_QUEUE": namespace["SEQUENCE_QUEUE"],
        "PostgresSequenceRepository": namespace["PostgresSequenceRepository"],
        "SequenceCronScheduler": namespace["SequenceCronScheduler"],
        "SequenceRunJobProcessor": namespace["SequenceRunJobProcessor"],
        "build_redis_connection_options": namespace["build_redis_connection_options"],
        "enqueue_sequence_run_job_async": namespace["enqueue_sequence_run_job_async"],
        "process_cluster": namespace["process_cluster"],
        "process_criterion_compile": namespace["process_criterion_compile"],
        "process_dedup": namespace["process_dedup"],
        "process_due_scheduled_digests": namespace["process_due_scheduled_digests"],
        "process_embed": namespace["process_embed"],
        "process_feedback_ingest": namespace["process_feedback_ingest"],
        "process_interest_compile": namespace["process_interest_compile"],
        "process_llm_review": namespace["process_llm_review"],
        "process_match_criteria": namespace["process_match_criteria"],
        "process_match_interests": namespace["process_match_interests"],
        "process_normalize": namespace["process_normalize"],
        "process_notify": namespace["process_notify"],
        "process_queued_manual_digests": namespace["process_queued_manual_digests"],
        "process_reindex": namespace["process_reindex"],
        "sequence_cron_poll_interval_seconds": namespace["sequence_cron_poll_interval_seconds"],
        "sequence_cron_scheduler_enabled": namespace["sequence_cron_scheduler_enabled"],
        "sequence_runner_concurrency": namespace["sequence_runner_concurrency"],
        "sequence_runner_enabled": namespace["sequence_runner_enabled"],
        "sequence_runner_lock_duration_ms": namespace["sequence_runner_lock_duration_ms"],
        "sequence_runner_stalled_interval_ms": namespace["sequence_runner_stalled_interval_ms"],
        "user_digest_poll_interval_seconds": namespace["user_digest_poll_interval_seconds"],
        "user_digest_scheduler_enabled": namespace["user_digest_scheduler_enabled"],
    }

from __future__ import annotations

import asyncio
import logging
import signal
from collections.abc import Mapping
from typing import Any

from bullmq import Job, Worker


def build_worker_error_handler(label: str, logger: logging.Logger):
    def handler(*args: Any) -> None:
        logger.error("%s worker event: %s", label, args)

    return handler


async def run_user_digest_scheduler_until_stopped(
    stop_event: asyncio.Event,
    deps: dict[str, Any],
    logger: logging.Logger,
) -> None:
    poll_interval = deps["user_digest_poll_interval_seconds"]()
    while not stop_event.is_set():
        try:
            await deps["process_queued_manual_digests"]()
            await deps["process_due_scheduled_digests"]()
        except Exception as error:  # pragma: no cover - runtime/env dependent
            logger.error("User digest scheduler poll failed: %s", error)

        try:
            await asyncio.wait_for(stop_event.wait(), timeout=poll_interval)
        except TimeoutError:
            continue


async def run_workers(deps: dict[str, Any], logger: logging.Logger) -> None:
    enable_legacy_queue_consumers = deps["legacy_queue_consumers_enabled"]()
    enable_sequence_runner = deps["sequence_runner_enabled"]()
    enable_sequence_cron_scheduler = deps["sequence_cron_scheduler_enabled"]()
    enable_user_digest_scheduler = deps["user_digest_scheduler_enabled"]()
    legacy_workers: list[tuple[str, str, Worker]] = []
    if enable_legacy_queue_consumers:
        legacy_workers = [
            _build_worker(deps, "normalize", "NORMALIZE_QUEUE", "process_normalize", 4),
            _build_worker(deps, "dedup", "DEDUP_QUEUE", "process_dedup", 4),
            _build_worker(deps, "embed", "EMBED_QUEUE", "process_embed", 2),
            _build_worker(deps, "cluster", "CLUSTER_QUEUE", "process_cluster", 2),
            _build_worker(
                deps,
                "match.criteria",
                "CRITERIA_MATCH_QUEUE",
                "process_match_criteria",
                2,
            ),
            _build_worker(
                deps,
                "match.interests",
                "INTEREST_MATCH_QUEUE",
                "process_match_interests",
                2,
            ),
            _build_worker(deps, "notify", "NOTIFY_QUEUE", "process_notify", 2),
            _build_worker(deps, "llm.review", "LLM_REVIEW_QUEUE", "process_llm_review", 1),
            _build_worker(
                deps,
                "feedback.ingest",
                "FEEDBACK_INGEST_QUEUE",
                "process_feedback_ingest",
                2,
            ),
            _build_worker(deps, "reindex", "REINDEX_QUEUE", "process_reindex", 1),
            _build_worker(
                deps,
                "interest.compile",
                "INTEREST_COMPILE_QUEUE",
                "process_interest_compile",
                2,
            ),
            _build_worker(
                deps,
                "criterion.compile",
                "CRITERION_COMPILE_QUEUE",
                "process_criterion_compile",
                2,
            ),
        ]
    sequence_worker: Worker | None = None
    if enable_sequence_runner:
        sequence_repository = deps["PostgresSequenceRepository"]()
        sequence_job_processor = deps["SequenceRunJobProcessor"](
            repository=sequence_repository
        )

        async def process_sequence_queue_job(job: Job, _job_token: str) -> dict[str, Any]:
            payload = job.data if isinstance(job.data, Mapping) else {}
            return await sequence_job_processor.handle_payload(payload)

        sequence_worker = Worker(
            deps["SEQUENCE_QUEUE"],
            process_sequence_queue_job,
            {
                "connection": deps["build_redis_connection_options"](),
                "concurrency": deps["sequence_runner_concurrency"](),
                "lockDuration": deps["sequence_runner_lock_duration_ms"](),
                "stalledInterval": deps["sequence_runner_stalled_interval_ms"](),
            },
        )

    for label, _queue_name, worker in legacy_workers:
        worker.on("failed", build_worker_error_handler(label, logger))
    if sequence_worker is not None:
        sequence_worker.on("failed", build_worker_error_handler("sequence", logger))

    stop_event = asyncio.Event()
    loop = asyncio.get_running_loop()

    for signame in ("SIGINT", "SIGTERM"):
        signum = getattr(signal, signame)
        loop.add_signal_handler(signum, stop_event.set)

    sequence_scheduler_task: asyncio.Task[None] | None = None
    if enable_sequence_cron_scheduler:
        sequence_repository = deps["PostgresSequenceRepository"]()
        sequence_scheduler = deps["SequenceCronScheduler"](
            repository=sequence_repository,
            enqueue_run=deps["enqueue_sequence_run_job_async"],
            poll_interval_seconds=deps["sequence_cron_poll_interval_seconds"](),
        )
        sequence_scheduler_task = asyncio.create_task(
            sequence_scheduler.run_until_stopped(stop_event)
        )
    user_digest_scheduler_task: asyncio.Task[None] | None = None
    if enable_user_digest_scheduler:
        user_digest_scheduler_task = asyncio.create_task(
            run_user_digest_scheduler_until_stopped(stop_event, deps, logger)
        )

    consumed_queues = [queue_name for _label, queue_name, _worker in legacy_workers]
    if sequence_worker is not None:
        consumed_queues.append(deps["SEQUENCE_QUEUE"])

    logger.info(
        "Workers booted. Consuming %s.",
        ", ".join(consumed_queues) if consumed_queues else "<none>",
    )
    if enable_sequence_cron_scheduler:
        logger.info(
            "Sequence cron scheduler enabled with poll interval %.1fs.",
            deps["sequence_cron_poll_interval_seconds"](),
        )
    if enable_user_digest_scheduler:
        logger.info(
            "User digest scheduler enabled with poll interval %.1fs.",
            deps["user_digest_poll_interval_seconds"](),
        )
    if enable_legacy_queue_consumers:
        logger.warning("Legacy queue consumers are enabled alongside sequence runtime.")
    await stop_event.wait()
    logger.info("Worker shutdown requested. Closing BullMQ consumers.")
    if sequence_scheduler_task is not None:
        await sequence_scheduler_task
    if user_digest_scheduler_task is not None:
        await user_digest_scheduler_task
    for _label, _queue_name, worker in legacy_workers:
        await worker.close()
    if sequence_worker is not None:
        await sequence_worker.close()


def _build_worker(
    deps: dict[str, Any],
    label: str,
    queue_key: str,
    processor_key: str,
    concurrency: int,
) -> tuple[str, str, Worker]:
    queue_name = deps[queue_key]
    return (
        label,
        queue_name,
        Worker(
            queue_name,
            deps[processor_key],
            {
                "connection": deps["build_redis_connection_options"](),
                "concurrency": concurrency,
            },
        ),
    )

from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

from psycopg.types.json import Json

from .content_analysis import DEFAULT_CONTENT_FILTER_POLICY_KEY
from .runtime_json import coerce_text_list, make_json_safe
from .runtime_values import coerce_bool, coerce_optional_string, coerce_positive_int
from .worker_queues import (
    EVENT_CLUSTER_CENTROIDS_INDEX_NAME,
    INTEREST_CENTROIDS_INDEX_NAME,
    REINDEX_CONSUMER,
)


@dataclass(frozen=True)
class ReindexProcessorDependencies:
    open_connection: Callable[[], Awaitable[Any]]
    is_event_processed: Callable[..., Awaitable[bool]]
    read_reindex_job_context: Callable[..., Awaitable[tuple[str, dict[str, Any]]]]
    interest_indexer: Any
    read_active_selection_profile_snapshot: Callable[..., Awaitable[dict[str, Any]]]
    replay_historical_articles: Callable[..., Awaitable[dict[str, Any]]]
    normalize_content_analysis_backfill_modules: Callable[..., set[str]]
    normalize_content_analysis_backfill_subject_types: Callable[..., set[str]]
    replay_content_analysis: Callable[..., Awaitable[dict[str, Any]]]
    record_processed_event: Callable[..., Awaitable[None]]


def build_reindex_processor_dependencies() -> ReindexProcessorDependencies:
    from . import main as legacy_main

    return ReindexProcessorDependencies(
        open_connection=legacy_main.open_connection,
        is_event_processed=legacy_main.is_event_processed,
        read_reindex_job_context=legacy_main.read_reindex_job_context,
        interest_indexer=legacy_main.INTEREST_INDEXER,
        read_active_selection_profile_snapshot=legacy_main.read_active_selection_profile_snapshot,
        replay_historical_articles=legacy_main.replay_historical_articles,
        normalize_content_analysis_backfill_modules=legacy_main.normalize_content_analysis_backfill_modules,
        normalize_content_analysis_backfill_subject_types=legacy_main.normalize_content_analysis_backfill_subject_types,
        replay_content_analysis=legacy_main.replay_content_analysis,
        record_processed_event=legacy_main.record_processed_event,
    )


async def process_reindex_with_dependencies(
    job: Any,
    _job_token: str,
    deps: ReindexProcessorDependencies,
) -> dict[str, Any]:
    event_id = str(job.data.get("eventId"))
    reindex_job_id = str(job.data.get("reindexJobId"))
    index_name = str(job.data.get("indexName") or INTEREST_CENTROIDS_INDEX_NAME)

    if not event_id or event_id == "None" or not reindex_job_id:
        raise ValueError("Reindex worker expected eventId and reindexJobId.")

    connection = await deps.open_connection()
    job_kind = "rebuild"
    job_options: dict[str, Any] = {}
    async with connection:
        async with connection.transaction():
            async with connection.cursor() as cursor:
                if await deps.is_event_processed(cursor, REINDEX_CONSUMER, event_id):
                    return {"status": "duplicate-event", "reindexJobId": reindex_job_id}

                job_kind, job_options = await deps.read_reindex_job_context(
                    cursor,
                    reindex_job_id,
                )

                await cursor.execute(
                    """
                    update reindex_jobs
                    set status = 'running', started_at = now(), updated_at = now()
                    where reindex_job_id = %s
                    """,
                    (reindex_job_id,),
                )

    result: dict[str, Any]
    try:
        result = {"indexName": index_name, "jobKind": job_kind}
        if job_kind in {"rebuild", "backfill"}:
            if index_name == INTEREST_CENTROIDS_INDEX_NAME:
                result["rebuild"] = await deps.interest_indexer.rebuild_interest_centroids()
            elif index_name == EVENT_CLUSTER_CENTROIDS_INDEX_NAME:
                result["rebuild"] = (
                    await deps.interest_indexer.rebuild_event_cluster_centroids()
                )
            else:
                result["rebuild"] = {
                    "indexName": index_name,
                    "status": "skipped",
                    "reason": "unsupported_index",
                }
        elif job_kind == "repair":
            result["rebuild"] = {
                "indexName": index_name,
                "status": "skipped",
                "reason": "repair_job_skips_rebuild",
            }
        elif job_kind == "content_analysis":
            result["rebuild"] = {
                "indexName": index_name,
                "status": "skipped",
                "reason": "content_analysis_job_skips_index_rebuild",
            }
        else:
            raise ValueError(f"Unsupported reindex job kind: {job_kind}")

        if job_kind in {"backfill", "repair"}:
            batch_size = min(max(coerce_positive_int(job_options.get("batchSize"), 100), 1), 500)
            target_doc_ids = coerce_text_list(job_options.get("docIds"))
            target_user_id = coerce_optional_string(job_options.get("userId"))
            target_interest_id = coerce_optional_string(job_options.get("interestId"))
            system_feed_only = coerce_bool(job_options.get("systemFeedOnly"))
            include_enrichment = coerce_bool(job_options.get("includeEnrichment"))
            force_enrichment = coerce_bool(job_options.get("forceEnrichment"))
            selection_profile_snapshot = await deps.read_active_selection_profile_snapshot()
            result["backfill"] = await deps.replay_historical_articles(
                reindex_job_id=reindex_job_id,
                batch_size=batch_size,
                doc_ids=target_doc_ids or None,
                user_id=target_user_id,
                interest_id=target_interest_id,
                system_feed_only=system_feed_only,
                include_enrichment=include_enrichment,
                force_enrichment=force_enrichment,
            )
            if isinstance(result["backfill"], dict):
                result["backfill"]["selectionProfileSnapshot"] = (
                    selection_profile_snapshot
                )
        if job_kind == "content_analysis":
            batch_size = min(max(coerce_positive_int(job_options.get("batchSize"), 100), 1), 500)
            modules = deps.normalize_content_analysis_backfill_modules(
                job_options.get("modules")
            )
            subject_types = deps.normalize_content_analysis_backfill_subject_types(
                job_options.get("subjectTypes")
            )
            missing_only = coerce_bool(job_options.get("missingOnly"), True)
            policy_key = (
                coerce_optional_string(job_options.get("policyKey"))
                or DEFAULT_CONTENT_FILTER_POLICY_KEY
            )
            max_text_chars = min(
                max(coerce_positive_int(job_options.get("maxTextChars"), 50_000), 1_000),
                250_000,
            )
            result["contentAnalysis"] = await deps.replay_content_analysis(
                reindex_job_id=reindex_job_id,
                batch_size=batch_size,
                subject_types=subject_types,
                modules=modules,
                missing_only=missing_only,
                policy_key=policy_key,
                max_text_chars=max_text_chars,
                subject_ids=coerce_text_list(job_options.get("subjectIds")) or None,
            )
    except Exception as error:
        async with await deps.open_connection() as connection:
            async with connection.transaction():
                async with connection.cursor() as cursor:
                    await cursor.execute(
                        """
                        update reindex_jobs
                        set
                          status = 'failed',
                          finished_at = now(),
                          error_text = %s,
                          updated_at = now()
                        where reindex_job_id = %s
                        """,
                        (str(error), reindex_job_id),
                    )
                    await deps.record_processed_event(cursor, REINDEX_CONSUMER, event_id)
        return {
            "status": "failed",
            "reindexJobId": reindex_job_id,
            "error": str(error),
        }

    async with await deps.open_connection() as connection:
        async with connection.transaction():
            async with connection.cursor() as cursor:
                await cursor.execute(
                    """
                    update reindex_jobs
                    set
                      status = 'completed',
                      finished_at = now(),
                      error_text = null,
                      updated_at = now(),
                      options_json = options_json || %s::jsonb
                    where reindex_job_id = %s
                    """,
                    (Json(make_json_safe(result)), reindex_job_id),
                )
                await deps.record_processed_event(cursor, REINDEX_CONSUMER, event_id)

    return {
        "status": "completed",
        "reindexJobId": reindex_job_id,
        "result": result,
    }


async def process_reindex(job: Any, job_token: str) -> dict[str, Any]:
    return await process_reindex_with_dependencies(
        job,
        job_token,
        build_reindex_processor_dependencies(),
    )

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import uuid
from collections.abc import Mapping, Sequence
from types import SimpleNamespace
from typing import Any

import psycopg
from psycopg.types.json import Json

from .content_analysis import (
    load_content_subject,
    persist_category_analysis,
    persist_cluster_summary_analysis,
    persist_content_filter_result,
    persist_ner_analysis,
    persist_sentiment_analysis,
    persist_structured_extraction_analysis,
    project_system_interest_labels,
)
from .reindex_backfill import (
    HistoricalBackfillDependencies,
    replay_historical_signal_candidates as replay_historical_signal_candidates_with_snapshot,
)
from .runtime_json import coerce_json_object, coerce_text_list, make_json_safe
from .worker_queues import (
    INTEREST_CENTROIDS_INDEX_NAME,
    LLM_REVIEW_REQUESTED_EVENT,
    REINDEX_REQUESTED_EVENT,
)

LOGGER = logging.getLogger(__name__)
HISTORICAL_REPLAY_LLM_REVIEW_TIMEOUT_SECONDS = 45

REINDEX_RUNTIME_OPTION_KEYS = {
    "backfill",
    "contentAnalysis",
    "progress",
    "rebuild",
    "result",
    "selectionProfileSnapshot",
}
REINDEX_BATCH_ONLY_OPTION_KEYS = {"batchSize"}


def _worker_main() -> Any:
    from . import main as worker_main

    return worker_main


async def open_connection() -> Any:
    return await _worker_main().open_connection()


async def ensure_published_outbox_event(**kwargs: Any) -> None:
    await _worker_main().ensure_published_outbox_event(**kwargs)


def _normalize_reindex_cancellation_value(value: Any) -> Any:
    if isinstance(value, list):
        return sorted(
            (_normalize_reindex_cancellation_value(item) for item in value),
            key=lambda item: json.dumps(item, sort_keys=True, default=str),
        )
    if isinstance(value, dict):
        return {
            key: _normalize_reindex_cancellation_value(value[key])
            for key in sorted(value)
            if key not in REINDEX_RUNTIME_OPTION_KEYS
            and key not in REINDEX_BATCH_ONLY_OPTION_KEYS
        }
    return value


def build_reindex_cancellation_key(
    *,
    index_name: str,
    job_kind: str,
    options_json: dict[str, Any],
) -> str:
    normalized_options = json.dumps(
        _normalize_reindex_cancellation_value(options_json),
        sort_keys=True,
        separators=(",", ":"),
        default=str,
    )
    digest = hashlib.sha256(normalized_options.encode("utf-8")).hexdigest()
    return ":".join(
        [
            "reindex",
            index_name,
            job_kind,
            "sha256",
            digest,
        ]
    )


async def find_prompt_template(*args: Any, **kwargs: Any) -> dict[str, Any] | None:
    return await _worker_main().find_prompt_template(*args, **kwargs)


async def process_llm_review(job: Any, job_token: str) -> dict[str, Any]:
    return await _worker_main().process_llm_review(job, job_token)


async def process_signal_candidate_extract(job: Any, job_token: str) -> dict[str, Any]:
    return await _worker_main().process_signal_candidate_extract(job, job_token)


async def process_normalize(job: Any, job_token: str) -> dict[str, Any]:
    return await _worker_main().process_normalize(job, job_token)


async def process_dedup(job: Any, job_token: str) -> dict[str, Any]:
    return await _worker_main().process_dedup(job, job_token)


async def process_embed(job: Any, job_token: str) -> dict[str, Any]:
    return await _worker_main().process_embed(job, job_token)


async def process_cluster(job: Any, job_token: str) -> dict[str, Any]:
    return await _worker_main().process_cluster(job, job_token)


async def process_match_criteria(job: Any, job_token: str) -> dict[str, Any]:
    return await _worker_main().process_match_criteria(job, job_token)


async def process_match_interests(job: Any, job_token: str) -> dict[str, Any]:
    return await _worker_main().process_match_interests(job, job_token)


async def is_signal_candidate_eligible_for_personalization(*args: Any, **kwargs: Any) -> bool:
    return await _worker_main().is_signal_candidate_eligible_for_personalization(*args, **kwargs)


async def insert_outbox_event(*args: Any, **kwargs: Any) -> None:
    await _worker_main().insert_outbox_event(*args, **kwargs)


async def read_reindex_job_context(
    cursor: psycopg.AsyncCursor[Any],
    reindex_job_id: str,
) -> tuple[str, dict[str, Any], str]:
    await cursor.execute(
        """
        select job_kind, options_json, status
        from reindex_jobs
        where reindex_job_id = %s
        for update
        """,
        (reindex_job_id,),
    )
    row = await cursor.fetchone()
    if row is None:
        raise ValueError(f"Reindex job {reindex_job_id} was not found.")
    return (
        str(row.get("job_kind") or "rebuild"),
        coerce_json_object(row.get("options_json")),
        str(row.get("status") or "queued"),
    )


async def is_reindex_job_cancel_requested(reindex_job_id: str) -> bool:
    async with await open_connection() as connection:
        async with connection.cursor() as cursor:
            await cursor.execute(
                """
                select status
                from reindex_jobs
                where reindex_job_id = %s
                """,
                (reindex_job_id,),
            )
            row = await cursor.fetchone()
    return bool(row and str(row.get("status") or "") in {"cancel_requested", "cancelled"})


async def update_reindex_job_options(
    reindex_job_id: str,
    patch: dict[str, Any],
) -> None:
    async with await open_connection() as connection:
        async with connection.transaction():
            async with connection.cursor() as cursor:
                await cursor.execute(
                    """
                    update reindex_jobs
                    set
                      options_json = options_json || %s::jsonb,
                      updated_at = now()
                    where reindex_job_id = %s
                    """,
                    (Json(make_json_safe(patch)), reindex_job_id),
                )


async def count_historical_backfill_snapshot_targets(reindex_job_id: str) -> int:
    async with await open_connection() as connection:
        async with connection.cursor() as cursor:
            await cursor.execute(
                """
                select count(*)::int as total
                from reindex_job_targets
                where reindex_job_id = %s
                """,
                (reindex_job_id,),
            )
            row = await cursor.fetchone()
    return int(row["total"] or 0) if row else 0


async def prepare_historical_backfill_snapshot(
    *,
    reindex_job_id: str,
    doc_ids: Sequence[str] | None = None,
    system_feed_only: bool = False,
    include_enrichment: bool = False,
    force_enrichment: bool = False,
) -> int:
    existing_total = await count_historical_backfill_snapshot_targets(reindex_job_id)
    if existing_total > 0:
        return existing_total

    async with await open_connection() as connection:
        async with connection.transaction():
            async with connection.cursor() as cursor:
                # Selection replay targets must not be narrowed by enrichment eligibility.
                # The enrichment processor can skip already-enriched candidates, but
                # match_criteria/final selection still need to replay for every chosen doc.
                if doc_ids:
                    system_feed_clause = ""
                    if system_feed_only:
                        system_feed_clause = """
                          and signal_candidates.visibility_state = 'visible'
                          and (
                            exists (
                              select 1
                              from final_selection_results fsr
                              where fsr.doc_id = signal_candidates.doc_id
                                and fsr.is_selected = true
                            )
                            or (
                              not exists (
                                select 1
                                from final_selection_results fsr_missing
                                where fsr_missing.doc_id = signal_candidates.doc_id
                              )
                              and exists (
                                select 1
                                from system_feed_results sfr
                                where sfr.doc_id = signal_candidates.doc_id
                                  and coalesce(sfr.eligible_for_feed, false) = true
                              )
                            )
                          )
                        """
                    await cursor.execute(
                        f"""
                        insert into reindex_job_targets (
                          reindex_job_id,
                          target_position,
                          doc_id
                        )
                        select
                          %s,
                          row_number() over (order by signal_candidates.created_at asc, signal_candidates.doc_id asc),
                          signal_candidates.doc_id
                        from signal_candidates
                        where processing_state in ('embedded', 'clustered', 'matched', 'notified')
                          and doc_id = any(%s::uuid[])
                          {system_feed_clause}
                        on conflict do nothing
                        """,
                        (reindex_job_id, list(doc_ids)),
                    )
                else:
                    system_feed_clause = ""
                    if system_feed_only:
                        system_feed_clause = """
                          and signal_candidates.visibility_state = 'visible'
                          and (
                            exists (
                              select 1
                              from final_selection_results fsr
                              where fsr.doc_id = signal_candidates.doc_id
                                and fsr.is_selected = true
                            )
                            or (
                              not exists (
                                select 1
                                from final_selection_results fsr_missing
                                where fsr_missing.doc_id = signal_candidates.doc_id
                              )
                              and exists (
                                select 1
                                from system_feed_results sfr
                                where sfr.doc_id = signal_candidates.doc_id
                                  and coalesce(sfr.eligible_for_feed, false) = true
                              )
                            )
                          )
                        """
                    await cursor.execute(
                        f"""
                        insert into reindex_job_targets (
                          reindex_job_id,
                          target_position,
                          doc_id
                        )
                        select
                          %s,
                          row_number() over (order by signal_candidates.created_at asc, signal_candidates.doc_id asc),
                          signal_candidates.doc_id
                        from signal_candidates
                        where processing_state in ('embedded', 'clustered', 'matched', 'notified')
                          {system_feed_clause}
                        on conflict do nothing
                        """,
                        (reindex_job_id,),
                    )

    return await count_historical_backfill_snapshot_targets(reindex_job_id)


async def list_historical_backfill_snapshot_batch(
    *,
    reindex_job_id: str,
    batch_size: int,
    after_position: int,
) -> list[dict[str, Any]]:
    async with await open_connection() as connection:
        async with connection.cursor() as cursor:
            await cursor.execute(
                """
                select
                  target_position,
                  doc_id::text as doc_id
                from reindex_job_targets
                where reindex_job_id = %s
                  and target_position > %s
                order by target_position asc
                limit %s
                """,
                (reindex_job_id, after_position, batch_size),
            )
            rows = list(await cursor.fetchall())
    return rows


async def find_current_prompt_template_id(scope: str) -> str | None:
    prompt_scope = "criteria" if scope == "criterion" else "interests"
    async with await open_connection() as connection:
        async with connection.cursor() as cursor:
            prompt_template = await find_prompt_template(cursor, prompt_scope)
    if prompt_template is None:
        return None
    return str(prompt_template["prompt_template_id"])


async def list_gray_zone_target_ids(
    *,
    doc_id: str,
    scope: str,
) -> list[str]:
    table_name = "criterion_match_results" if scope == "criterion" else "interest_match_results"
    column_name = "criterion_id" if scope == "criterion" else "interest_id"
    async with await open_connection() as connection:
        async with connection.cursor() as cursor:
            await cursor.execute(
                f"""
                select {column_name}::text as target_id
                from {table_name}
                where doc_id = %s
                  and decision = 'gray_zone'
                order by created_at desc
                """,
                (doc_id,),
            )
            rows = list(await cursor.fetchall())
    return [str(row["target_id"]) for row in rows]


async def replay_gray_zone_reviews_for_doc(
    *,
    doc_id: str,
    scope: str,
) -> dict[str, int]:
    prompt_template_id = await find_current_prompt_template_id(scope)
    if prompt_template_id is None:
        return {"completed": 0, "failed": 0, "timedOut": 0}

    target_ids = await list_gray_zone_target_ids(doc_id=doc_id, scope=scope)
    replay_count = 0
    failed_count = 0
    timeout_count = 0
    for target_id in target_ids:
        review_event_id = str(uuid.uuid4())
        await ensure_published_outbox_event(
            event_id=review_event_id,
            event_type=LLM_REVIEW_REQUESTED_EVENT,
            aggregate_type="criterion" if scope == "criterion" else "interest",
            aggregate_id=target_id,
            payload={
                "docId": doc_id,
                "scope": scope,
                "targetId": target_id,
                "promptTemplateId": prompt_template_id,
                "historicalBackfill": True,
                "version": 1,
            },
        )
        review_job = SimpleNamespace(
            data={
                "eventId": review_event_id,
                "docId": doc_id,
                "scope": scope,
                "targetId": target_id,
                "promptTemplateId": prompt_template_id,
                "historicalBackfill": True,
            }
        )
        try:
            await asyncio.wait_for(
                process_llm_review(review_job, ""),
                timeout=HISTORICAL_REPLAY_LLM_REVIEW_TIMEOUT_SECONDS,
            )
            replay_count += 1
        except asyncio.TimeoutError:
            timeout_count += 1
            failed_count += 1
            LOGGER.warning(
                "Historical replay LLM review timed out.",
                extra={
                    "doc_id": doc_id,
                    "scope": scope,
                    "target_id": target_id,
                    "timeout_seconds": HISTORICAL_REPLAY_LLM_REVIEW_TIMEOUT_SECONDS,
                },
            )
        except Exception:
            failed_count += 1
            LOGGER.exception(
                "Historical replay LLM review failed softly.",
                extra={
                    "doc_id": doc_id,
                    "scope": scope,
                    "target_id": target_id,
                },
            )
    return {"completed": replay_count, "failed": failed_count, "timedOut": timeout_count}


async def replay_historical_signal_candidates(
    *,
    reindex_job_id: str,
    batch_size: int,
    doc_ids: Sequence[str] | None = None,
    user_id: str | None = None,
    interest_id: str | None = None,
    system_feed_only: bool = False,
    include_enrichment: bool = False,
    force_enrichment: bool = False,
) -> dict[str, Any]:
    return await replay_historical_signal_candidates_with_snapshot(
        reindex_job_id=reindex_job_id,
        batch_size=batch_size,
        doc_ids=list(doc_ids) if doc_ids is not None else None,
        user_id=user_id,
        interest_id=interest_id,
        system_feed_only=system_feed_only,
        include_enrichment=include_enrichment,
        force_enrichment=force_enrichment,
        dependencies=HistoricalBackfillDependencies(
            prepare_target_snapshot=prepare_historical_backfill_snapshot,
            list_target_batch=list_historical_backfill_snapshot_batch,
            update_job_options=update_reindex_job_options,
            publish_outbox_event=ensure_published_outbox_event,
            process_signal_candidate_extract=process_signal_candidate_extract,
            process_normalize=process_normalize,
            process_dedup=process_dedup,
            process_embed=process_embed,
            process_cluster=process_cluster,
            process_match_criteria=process_match_criteria,
            process_match_interests=process_match_interests,
            is_signal_candidate_eligible_for_personalization=is_signal_candidate_eligible_for_personalization,
            replay_gray_zone_reviews_for_doc=replay_gray_zone_reviews_for_doc,
            is_cancel_requested=is_reindex_job_cancel_requested,
        ),
    )


CONTENT_ANALYSIS_BACKFILL_MODULES = {
    "ner",
    "sentiment",
    "category",
    "cluster_summary",
    "structured_extraction",
    "system_interest_labels",
    "content_filter",
}
DEFAULT_CONTENT_ANALYSIS_BACKFILL_MODULES = CONTENT_ANALYSIS_BACKFILL_MODULES.difference(
    {"structured_extraction"}
)
CONTENT_ANALYSIS_BACKFILL_SUBJECT_TYPES = {"signal_candidate", "web_resource", "story_cluster"}


def normalize_content_analysis_backfill_modules(value: Any) -> set[str]:
    requested = set(coerce_text_list(value))
    if not requested:
        return set(DEFAULT_CONTENT_ANALYSIS_BACKFILL_MODULES)
    return requested.intersection(CONTENT_ANALYSIS_BACKFILL_MODULES) or set(
        DEFAULT_CONTENT_ANALYSIS_BACKFILL_MODULES
    )


def normalize_content_analysis_backfill_subject_types(value: Any) -> list[str]:
    requested = [
        item
        for item in coerce_text_list(value)
        if item in CONTENT_ANALYSIS_BACKFILL_SUBJECT_TYPES
    ]
    return requested or ["signal_candidate", "web_resource", "story_cluster"]


def build_content_analysis_backfill_progress_patch(
    *,
    processed_items: int,
    total_items: int,
) -> dict[str, Any]:
    return {
        "progress": {
            "processedContentItems": processed_items,
            "totalContentItems": total_items,
        }
    }


def build_content_analysis_missing_clause(
    *,
    subject_type: str,
    modules: set[str],
    policy_key: str,
    alias: str,
) -> tuple[str, list[Any]]:
    clauses: list[str] = []
    params: list[Any] = []
    if "ner" in modules:
        clauses.append(
            f"""
            not exists (
              select 1
              from content_analysis_results car
              where car.subject_type = %s
                and car.subject_id = {alias}
                and car.analysis_type = 'ner'
                and car.status = 'completed'
            )
            """
        )
        params.append(subject_type)
    if "sentiment" in modules:
        clauses.append(
            f"""
            not exists (
              select 1
              from content_analysis_results car
              where car.subject_type = %s
                and car.subject_id = {alias}
                and car.analysis_type = 'sentiment'
                and car.status = 'completed'
            )
            """
        )
        params.append(subject_type)
    if "category" in modules:
        clauses.append(
            f"""
            not exists (
              select 1
              from content_analysis_results car
              where car.subject_type = %s
                and car.subject_id = {alias}
                and car.analysis_type = 'category'
                and car.status = 'completed'
            )
            """
        )
        params.append(subject_type)
    if subject_type != "story_cluster" and "structured_extraction" in modules:
        clauses.append(
            f"""
            not exists (
              select 1
              from content_analysis_results car
              where car.subject_type = %s
                and car.subject_id = {alias}
                and car.analysis_type = 'structured_extraction'
                and car.status = 'completed'
            )
            """
        )
        params.append(subject_type)
    if subject_type == "story_cluster" and "cluster_summary" in modules:
        clauses.append(
            f"""
            not exists (
              select 1
              from content_analysis_results car
              where car.subject_type = 'story_cluster'
                and car.subject_id = {alias}
                and car.analysis_type = 'cluster_summary'
                and car.status = 'completed'
            )
            """
        )
    if subject_type == "signal_candidate" and "system_interest_labels" in modules:
        clauses.append(
            f"""
            not exists (
              select 1
              from content_labels cl
              where cl.subject_type = 'signal_candidate'
                and cl.subject_id = {alias}
                and cl.label_type = 'system_interest'
            )
            """
        )
    if "content_filter" in modules:
        clauses.append(
            f"""
            not exists (
              select 1
              from content_filter_results cfr
              where cfr.subject_type = %s
                and cfr.subject_id = {alias}
                and cfr.policy_key = %s
            )
            """
        )
        params.extend([subject_type, policy_key])
    if not clauses:
        return "", []
    return f"and ({' or '.join(clauses)})", params


async def count_content_analysis_backfill_targets(
    *,
    subject_type: str,
    modules: set[str],
    missing_only: bool,
    policy_key: str,
    subject_ids: Sequence[str] | None = None,
) -> int:
    subject_filter_clause = ""
    subject_filter_params: list[Any] = []
    if subject_type == "signal_candidate":
        if subject_ids:
            subject_filter_clause = "and a.doc_id = any(%s::uuid[])"
            subject_filter_params.append(list(subject_ids))
        missing_clause, missing_params = (
            build_content_analysis_missing_clause(
                subject_type=subject_type,
                modules=modules,
                policy_key=policy_key,
                alias="a.doc_id",
            )
            if missing_only
            else ("", [])
        )
        sql = f"""
            select count(*)::int as total
            from signal_candidates a
            where coalesce(a.visibility_state, 'visible') != 'blocked'
              and coalesce(a.title, '') || coalesce(a.lead, '') || coalesce(a.body, '') <> ''
              {subject_filter_clause}
              {missing_clause}
        """
    elif subject_type == "web_resource":
        resource_modules = modules.difference({"system_interest_labels"})
        if not resource_modules:
            return 0
        if subject_ids:
            subject_filter_clause = "and wr.resource_id = any(%s::uuid[])"
            subject_filter_params.append(list(subject_ids))
        missing_clause, missing_params = (
            build_content_analysis_missing_clause(
                subject_type=subject_type,
                modules=resource_modules,
                policy_key=policy_key,
                alias="wr.resource_id",
            )
            if missing_only
            else ("", [])
        )
        sql = f"""
            select count(*)::int as total
            from web_resources wr
            where coalesce(wr.title, '') || coalesce(wr.summary, '') || coalesce(wr.body, '') <> ''
              {subject_filter_clause}
              {missing_clause}
        """
    elif subject_type == "story_cluster":
        cluster_modules = modules.intersection({"cluster_summary"})
        if not cluster_modules:
            return 0
        if subject_ids:
            subject_filter_clause = "and sc.story_cluster_id = any(%s::uuid[])"
            subject_filter_params.append(list(subject_ids))
        missing_clause, missing_params = (
            build_content_analysis_missing_clause(
                subject_type=subject_type,
                modules=cluster_modules,
                policy_key=policy_key,
                alias="sc.story_cluster_id",
            )
            if missing_only
            else ("", [])
        )
        sql = f"""
            select count(*)::int as total
            from story_clusters sc
            where sc.canonical_document_count > 0
              {subject_filter_clause}
              {missing_clause}
        """
    else:
        return 0

    async with await open_connection() as connection:
        async with connection.cursor() as cursor:
            await cursor.execute(sql, tuple([*subject_filter_params, *missing_params]))
            row = await cursor.fetchone()
    return int(row["total"] or 0) if row else 0


async def list_content_analysis_backfill_targets(
    *,
    subject_type: str,
    modules: set[str],
    missing_only: bool,
    policy_key: str,
    batch_size: int,
    after_subject_id: str | None,
    subject_ids: Sequence[str] | None = None,
) -> list[str]:
    after_clause = ""
    after_params: list[Any] = []
    subject_filter_clause = ""
    subject_filter_params: list[Any] = []
    if subject_type == "signal_candidate":
        if subject_ids:
            subject_filter_clause = "and a.doc_id = any(%s::uuid[])"
            subject_filter_params.append(list(subject_ids))
        if after_subject_id:
            after_clause = "and a.doc_id::text > %s"
            after_params.append(after_subject_id)
        missing_clause, missing_params = (
            build_content_analysis_missing_clause(
                subject_type=subject_type,
                modules=modules,
                policy_key=policy_key,
                alias="a.doc_id",
            )
            if missing_only
            else ("", [])
        )
        sql = f"""
            select a.doc_id::text as subject_id
            from signal_candidates a
            where coalesce(a.visibility_state, 'visible') != 'blocked'
              and coalesce(a.title, '') || coalesce(a.lead, '') || coalesce(a.body, '') <> ''
              {subject_filter_clause}
              {after_clause}
              {missing_clause}
            order by a.doc_id::text asc
            limit %s
        """
    elif subject_type == "web_resource":
        resource_modules = modules.difference({"system_interest_labels"})
        if not resource_modules:
            return []
        if subject_ids:
            subject_filter_clause = "and wr.resource_id = any(%s::uuid[])"
            subject_filter_params.append(list(subject_ids))
        if after_subject_id:
            after_clause = "and wr.resource_id::text > %s"
            after_params.append(after_subject_id)
        missing_clause, missing_params = (
            build_content_analysis_missing_clause(
                subject_type=subject_type,
                modules=resource_modules,
                policy_key=policy_key,
                alias="wr.resource_id",
            )
            if missing_only
            else ("", [])
        )
        sql = f"""
            select wr.resource_id::text as subject_id
            from web_resources wr
            where coalesce(wr.title, '') || coalesce(wr.summary, '') || coalesce(wr.body, '') <> ''
              {subject_filter_clause}
              {after_clause}
              {missing_clause}
            order by wr.resource_id::text asc
            limit %s
        """
    elif subject_type == "story_cluster":
        cluster_modules = modules.intersection({"cluster_summary"})
        if not cluster_modules:
            return []
        if subject_ids:
            subject_filter_clause = "and sc.story_cluster_id = any(%s::uuid[])"
            subject_filter_params.append(list(subject_ids))
        if after_subject_id:
            after_clause = "and sc.story_cluster_id::text > %s"
            after_params.append(after_subject_id)
        missing_clause, missing_params = (
            build_content_analysis_missing_clause(
                subject_type=subject_type,
                modules=cluster_modules,
                policy_key=policy_key,
                alias="sc.story_cluster_id",
            )
            if missing_only
            else ("", [])
        )
        sql = f"""
            select sc.story_cluster_id::text as subject_id
            from story_clusters sc
            where sc.canonical_document_count > 0
              {subject_filter_clause}
              {after_clause}
              {missing_clause}
            order by sc.story_cluster_id::text asc
            limit %s
        """
    else:
        return []

    async with await open_connection() as connection:
        async with connection.cursor() as cursor:
            await cursor.execute(
                sql,
                tuple([*subject_filter_params, *after_params, *missing_params, batch_size]),
            )
            rows = list(await cursor.fetchall())
    return [str(row["subject_id"]) for row in rows]


async def replay_content_analysis_subject(
    *,
    subject_type: str,
    subject_id: str,
    modules: set[str],
    policy_key: str,
    max_text_chars: int,
) -> dict[str, Any]:
    result: dict[str, Any] = {"subjectType": subject_type, "subjectId": subject_id}
    subject = await asyncio.to_thread(load_content_subject, subject_type, subject_id)
    if subject is None:
        return {**result, "skipped": True, "reason": "subject_not_found"}
    if subject_type != "story_cluster" and "ner" in modules:
        result["ner"] = await asyncio.to_thread(
            persist_ner_analysis,
            subject,
            max_text_chars=max_text_chars,
        )
    if subject_type != "story_cluster" and "sentiment" in modules:
        result["sentiment"] = await asyncio.to_thread(
            persist_sentiment_analysis,
            subject,
            max_text_chars=max_text_chars,
        )
    if subject_type != "story_cluster" and "category" in modules:
        result["category"] = await asyncio.to_thread(
            persist_category_analysis,
            subject,
            max_text_chars=max_text_chars,
        )
    if subject_type != "story_cluster" and "structured_extraction" in modules:
        result["structuredExtraction"] = await asyncio.to_thread(
            persist_structured_extraction_analysis,
            subject,
            max_text_chars=max_text_chars,
        )
    if subject_type == "signal_candidate" and "system_interest_labels" in modules:
        result["systemInterestLabels"] = await asyncio.to_thread(
            project_system_interest_labels,
            subject_id,
        )
    if subject_type != "story_cluster" and "content_filter" in modules:
        result["contentFilter"] = await asyncio.to_thread(
            persist_content_filter_result,
            subject_type,
            subject_id,
            policy_key=policy_key,
        )
    if subject_type == "story_cluster" and "cluster_summary" in modules:
        result["clusterSummary"] = await asyncio.to_thread(
            persist_cluster_summary_analysis,
            subject_id,
        )
    return result


async def replay_content_analysis(
    *,
    reindex_job_id: str,
    batch_size: int,
    subject_types: list[str],
    modules: set[str],
    missing_only: bool,
    policy_key: str,
    max_text_chars: int,
    subject_ids: Sequence[str] | None = None,
) -> dict[str, Any]:
    requested_subject_ids = list(subject_ids or [])

    total_items = 0
    for subject_type in subject_types:
        total_items += await count_content_analysis_backfill_targets(
            subject_type=subject_type,
            modules=modules,
            missing_only=missing_only,
            policy_key=policy_key,
            subject_ids=requested_subject_ids or None,
        )

    processed_items = 0
    failed_items = 0
    skipped_items = 0
    ner_entities = 0
    sentiment_labels = 0
    category_labels = 0
    cluster_summaries = 0
    labels = 0
    filter_results = 0
    errors: list[dict[str, Any]] = []
    await update_reindex_job_options(
        reindex_job_id,
        build_content_analysis_backfill_progress_patch(
            processed_items=processed_items,
            total_items=total_items,
        ),
    )

    for subject_type in subject_types:
        last_subject_id: str | None = None
        while True:
            if await is_reindex_job_cancel_requested(reindex_job_id):
                return {
                    "status": "cancelled",
                    "mode": "content_analysis_backfill",
                    "processedContentItems": processed_items,
                    "totalContentItems": total_items,
                    "failedContentItems": failed_items,
                    "skippedContentItems": skipped_items,
                    "subjectTypes": subject_types,
                    "modules": sorted(modules),
                    "missingOnly": missing_only,
                    "policyKey": policy_key,
                    "maxTextChars": max_text_chars,
                    "retroNotifications": "skipped",
                }

            batch_subject_ids = await list_content_analysis_backfill_targets(
                subject_type=subject_type,
                modules=modules,
                missing_only=missing_only,
                policy_key=policy_key,
                batch_size=batch_size,
                after_subject_id=last_subject_id,
                subject_ids=requested_subject_ids or None,
            )
            if not batch_subject_ids:
                break
            for subject_id in batch_subject_ids:
                last_subject_id = subject_id
                try:
                    replay_result = await replay_content_analysis_subject(
                        subject_type=subject_type,
                        subject_id=subject_id,
                        modules=modules,
                        policy_key=policy_key,
                        max_text_chars=max_text_chars,
                    )
                    if replay_result.get("skipped"):
                        skipped_items += 1
                    ner_result = replay_result.get("ner")
                    if isinstance(ner_result, Mapping):
                        ner_entities += int(ner_result.get("entityCount") or 0)
                    sentiment_result = replay_result.get("sentiment")
                    if isinstance(sentiment_result, Mapping):
                        sentiment_labels += int(sentiment_result.get("labelCount") or 0)
                    category_result = replay_result.get("category")
                    if isinstance(category_result, Mapping):
                        category_labels += int(category_result.get("labelCount") or 0)
                    if isinstance(replay_result.get("clusterSummary"), Mapping):
                        cluster_summaries += 1
                    label_result = replay_result.get("systemInterestLabels")
                    if isinstance(label_result, Mapping):
                        labels += int(label_result.get("labelCount") or 0)
                    if "contentFilter" in replay_result:
                        filter_results += 1
                except Exception as error:
                    failed_items += 1
                    if len(errors) < 20:
                        errors.append(
                            {
                                "subjectType": subject_type,
                                "subjectId": subject_id,
                                "error": str(error),
                            }
                        )
                processed_items += 1
            await update_reindex_job_options(
                reindex_job_id,
                build_content_analysis_backfill_progress_patch(
                    processed_items=processed_items,
                    total_items=total_items,
                ),
            )

    return {
        "mode": "content_analysis_backfill",
        "processedContentItems": processed_items,
        "totalContentItems": total_items,
        "failedContentItems": failed_items,
        "skippedContentItems": skipped_items,
        "nerEntityCount": ner_entities,
        "sentimentLabelCount": sentiment_labels,
        "taxonomyLabelCount": category_labels,
        "clusterSummaryCount": cluster_summaries,
        "systemInterestLabelCount": labels,
        "contentFilterResultCount": filter_results,
        "subjectTypes": subject_types,
        "modules": sorted(modules),
        "missingOnly": missing_only,
        "policyKey": policy_key,
        "maxTextChars": max_text_chars,
        "retroNotifications": "skipped",
        "errors": errors,
    }


async def read_active_selection_profile_snapshot() -> dict[str, Any]:
    async with await open_connection() as connection:
        async with connection.cursor() as cursor:
            await cursor.execute(
                """
                select
                  count(*)::int as total_profiles,
                  count(*) filter (where status = 'active')::int as active_profiles,
                  count(*) filter (
                    where profile_family = 'compatibility_interest_template'
                  )::int as compatibility_profiles,
                  count(distinct source_interest_template_id)::int
                    as templates_with_profiles,
                  coalesce(max(version), 0)::int as max_version
                from selection_profiles
                """
            )
            row = await cursor.fetchone()

    snapshot = row or {}
    return {
        "totalProfiles": int(snapshot.get("total_profiles") or 0),
        "activeProfiles": int(snapshot.get("active_profiles") or 0),
        "compatibilityProfiles": int(snapshot.get("compatibility_profiles") or 0),
        "templatesWithProfiles": int(snapshot.get("templates_with_profiles") or 0),
        "maxVersion": int(snapshot.get("max_version") or 0),
    }


def build_interest_auto_repair_job_options(
    *,
    user_id: str,
    interest_id: str,
    source_version: int,
) -> dict[str, Any]:
    return {
        "batchSize": 100,
        "retroNotifications": "skip",
        "replayExistingSignalCandidates": True,
        "systemFeedOnly": True,
        "userId": user_id,
        "interestId": interest_id,
        "sourceVersion": source_version,
        "requestSource": "interest_compile",
    }


async def queue_interest_auto_repair_job(
    *,
    user_id: str,
    interest_id: str,
    source_version: int,
) -> dict[str, Any]:
    reindex_job_id = uuid.uuid4()
    options_json = build_interest_auto_repair_job_options(
        user_id=user_id,
        interest_id=interest_id,
        source_version=source_version,
    )
    cancellation_key = build_reindex_cancellation_key(
        index_name=INTEREST_CENTROIDS_INDEX_NAME,
        job_kind="repair",
        options_json=options_json,
    )

    async with await open_connection() as connection:
        async with connection.transaction():
            async with connection.cursor() as cursor:
                await cursor.execute(
                    "select pg_advisory_xact_lock(hashtext(%s))",
                    (cancellation_key,),
                )
                await cursor.execute(
                    """
                    insert into reindex_jobs (
                      reindex_job_id,
                      index_name,
                      job_kind,
                      options_json,
                      requested_by_user_id,
                      status,
                      cancellation_key
                    )
                    values (%s, %s, 'repair', %s::jsonb, %s, 'queued', %s)
                    """,
                    (
                        reindex_job_id,
                        INTEREST_CENTROIDS_INDEX_NAME,
                        Json(make_json_safe(options_json)),
                        user_id,
                        cancellation_key,
                    ),
                )
                await cursor.execute(
                    """
                    update reindex_jobs
                    set
                      status = 'cancelled',
                      finished_at = coalesce(finished_at, now()),
                      error_text = 'Cancelled because a newer same-lane reindex job was queued.',
                      superseded_by_reindex_job_id = %s,
                      updated_at = now()
                    where cancellation_key = %s
                      and reindex_job_id <> %s
                      and status = 'queued'
                    """,
                    (reindex_job_id, cancellation_key, reindex_job_id),
                )
                await cursor.execute(
                    """
                    update reindex_jobs
                    set
                      status = 'cancel_requested',
                      error_text = 'Cancellation requested because a newer same-lane reindex job was queued.',
                      superseded_by_reindex_job_id = %s,
                      updated_at = now()
                    where cancellation_key = %s
                      and reindex_job_id <> %s
                      and status in ('running', 'cancel_requested')
                    """,
                    (reindex_job_id, cancellation_key, reindex_job_id),
                )
                await insert_outbox_event(
                    cursor,
                    REINDEX_REQUESTED_EVENT,
                    "reindex_job",
                    reindex_job_id,
                    {
                        "reindexJobId": str(reindex_job_id),
                        "indexName": INTEREST_CENTROIDS_INDEX_NAME,
                        "jobKind": "repair",
                        "version": 1,
                    },
                )

    return {
        "status": "queued",
        "reindexJobId": str(reindex_job_id),
        "jobKind": "repair",
        "options": options_json,
        "cancellationKey": cancellation_key,
    }

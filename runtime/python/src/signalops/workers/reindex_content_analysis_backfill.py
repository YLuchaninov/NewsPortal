from __future__ import annotations

import asyncio
from collections.abc import Mapping, Sequence
from typing import Any

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
from .reindex_runtime_jobs import (
    is_reindex_job_cancel_requested,
    update_reindex_job_options,
)
from .runtime_db import open_connection
from .runtime_json import coerce_text_list

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

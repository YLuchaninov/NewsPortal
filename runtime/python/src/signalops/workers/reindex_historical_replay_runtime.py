from __future__ import annotations

import asyncio
import logging
import uuid
from collections.abc import Sequence
from types import SimpleNamespace
from typing import Any

from .cluster_processor import process_cluster
from .criteria_match_processor import process_match_criteria
from .interest_match_processor import process_match_interests
from .llm_review_processor import process_llm_review
from .matching_read_repository import find_prompt_template
from .reindex_backfill import (
    HistoricalBackfillDependencies,
    replay_historical_signal_candidates as replay_historical_signal_candidates_with_snapshot,
)
from .reindex_runtime_jobs import (
    is_reindex_job_cancel_requested,
    update_reindex_job_options,
)
from .runtime_db import open_connection
from .selection_gate_repository import is_signal_candidate_eligible_for_personalization
from .signal_candidate_extraction_processor import process_signal_candidate_extract
from .signal_candidate_processors import process_dedup, process_embed, process_normalize
from .worker_events import ensure_published_outbox_event
from .worker_queues import LLM_REVIEW_REQUESTED_EVENT

LOGGER = logging.getLogger(__name__)
HISTORICAL_REPLAY_LLM_REVIEW_TIMEOUT_SECONDS = 45


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

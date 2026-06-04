from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from time import monotonic
from types import SimpleNamespace
from typing import Any, Awaitable, Callable

HISTORICAL_BACKFILL_PROGRESS_DOC_INTERVAL = 5
HISTORICAL_BACKFILL_PROGRESS_SECONDS = 30.0


async def _never_cancel_requested(_reindex_job_id: str) -> bool:
    return False


@dataclass(frozen=True)
class HistoricalBackfillDependencies:
    prepare_target_snapshot: Callable[..., Awaitable[int]]
    list_target_batch: Callable[..., Awaitable[list[dict[str, Any]]]]
    update_job_options: Callable[[str, dict[str, Any]], Awaitable[None]]
    publish_outbox_event: Callable[..., Awaitable[None]]
    process_signal_candidate_extract: Callable[[Any, str], Awaitable[dict[str, Any]]]
    process_normalize: Callable[[Any, str], Awaitable[dict[str, Any]]]
    process_dedup: Callable[[Any, str], Awaitable[dict[str, Any]]]
    process_embed: Callable[[Any, str], Awaitable[dict[str, Any]]]
    process_cluster: Callable[[Any, str], Awaitable[dict[str, Any]]]
    process_match_criteria: Callable[[Any, str], Awaitable[dict[str, Any]]]
    process_match_interests: Callable[[Any, str], Awaitable[dict[str, Any]]]
    is_signal_candidate_eligible_for_personalization: Callable[..., Awaitable[bool]]
    replay_gray_zone_reviews_for_doc: Callable[..., Awaitable[int | dict[str, Any]]]
    is_cancel_requested: Callable[[str], Awaitable[bool]] = _never_cancel_requested


def build_historical_backfill_progress_patch(
    *,
    processed_signal_candidates: int,
    total_signal_candidates: int,
    phase: str = "historical_backfill",
    current_doc_id: str | None = None,
    criterion_llm_reviews: int = 0,
    interest_llm_reviews: int = 0,
    llm_review_failures: int = 0,
    started_at_monotonic: float | None = None,
) -> dict[str, Any]:
    now_iso = datetime.now(UTC).isoformat()
    elapsed_seconds = (
        max(monotonic() - started_at_monotonic, 0.0)
        if started_at_monotonic is not None
        else 0.0
    )
    return {
        "progress": {
            "phase": phase,
            "currentDocId": current_doc_id,
            "processedSignalCandidates": processed_signal_candidates,
            "totalSignalCandidates": total_signal_candidates,
            "criterionLlmReviews": criterion_llm_reviews,
            "interestLlmReviews": interest_llm_reviews,
            "llmReviewFailures": llm_review_failures,
            "lastProgressAt": now_iso,
            "lastHeartbeatAt": now_iso,
            "elapsedSeconds": round(elapsed_seconds, 3),
        }
    }


def _coerce_replay_review_result(value: int | dict[str, Any]) -> dict[str, int]:
    if isinstance(value, dict):
        completed = int(value.get("completed") or value.get("count") or 0)
        failed = int(value.get("failed") or 0)
        timed_out = int(value.get("timedOut") or value.get("timeoutFailures") or 0)
        return {
            "completed": max(completed, 0),
            "failed": max(failed, 0),
            "timedOut": max(timed_out, 0),
        }
    return {"completed": max(int(value or 0), 0), "failed": 0, "timedOut": 0}


async def replay_historical_signal_candidates(
    *,
    reindex_job_id: str,
    batch_size: int,
    doc_ids: list[str] | None,
    user_id: str | None,
    interest_id: str | None,
    system_feed_only: bool,
    include_enrichment: bool,
    force_enrichment: bool,
    dependencies: HistoricalBackfillDependencies,
) -> dict[str, Any]:
    total_signal_candidates = await dependencies.prepare_target_snapshot(
        reindex_job_id=reindex_job_id,
        doc_ids=doc_ids,
        system_feed_only=system_feed_only,
        include_enrichment=include_enrichment,
        force_enrichment=force_enrichment,
    )
    processed_signal_candidates = 0
    enrichment_processed = 0
    enrichment_enriched = 0
    enrichment_skipped = 0
    enrichment_failed = 0
    criteria_matches = 0
    interest_matches = 0
    criterion_llm_reviews = 0
    interest_llm_reviews = 0
    llm_review_failures = 0
    llm_review_timeouts = 0
    last_position = 0
    started_at_monotonic = monotonic()
    last_progress_monotonic = 0.0
    last_progress_processed = 0

    async def write_progress(*, phase: str, current_doc_id: str | None = None) -> None:
        nonlocal last_progress_monotonic, last_progress_processed
        await dependencies.update_job_options(
            reindex_job_id,
            build_historical_backfill_progress_patch(
                processed_signal_candidates=processed_signal_candidates,
                total_signal_candidates=total_signal_candidates,
                phase=phase,
                current_doc_id=current_doc_id,
                criterion_llm_reviews=criterion_llm_reviews,
                interest_llm_reviews=interest_llm_reviews,
                llm_review_failures=llm_review_failures,
                started_at_monotonic=started_at_monotonic,
            ),
        )
        last_progress_monotonic = monotonic()
        last_progress_processed = processed_signal_candidates

    async def maybe_write_progress(*, phase: str, current_doc_id: str | None = None) -> None:
        processed_delta = processed_signal_candidates - last_progress_processed
        elapsed_since_progress = monotonic() - last_progress_monotonic
        if (
            processed_delta >= HISTORICAL_BACKFILL_PROGRESS_DOC_INTERVAL
            or elapsed_since_progress >= HISTORICAL_BACKFILL_PROGRESS_SECONDS
        ):
            await write_progress(phase=phase, current_doc_id=current_doc_id)

    await write_progress(phase="snapshot_ready")

    while True:
        if await dependencies.is_cancel_requested(reindex_job_id):
            return {
                "status": "cancelled",
                "mode": "historical_backfill",
                "processedSignalCandidates": processed_signal_candidates,
                "totalSignalCandidates": total_signal_candidates,
                "retroNotifications": "skipped",
                "batchSize": batch_size,
            }

        batch_targets = await dependencies.list_target_batch(
            reindex_job_id=reindex_job_id,
            batch_size=batch_size,
            after_position=last_position,
        )
        if not batch_targets:
            break

        for target in batch_targets:
            doc_id = str(target["doc_id"])
            await maybe_write_progress(phase="processing_document", current_doc_id=doc_id)
            if include_enrichment:
                enrichment_event_id = str(uuid.uuid4())
                enrichment_processed += 1
                await dependencies.publish_outbox_event(
                    event_id=enrichment_event_id,
                    event_type="signal_candidate.ingest.requested",
                    aggregate_type="signal_candidate",
                    aggregate_id=doc_id,
                    payload={
                        "docId": doc_id,
                        "forceEnrichment": force_enrichment,
                        "historicalBackfill": True,
                        "version": 1,
                    },
                )
                enrichment_result = await dependencies.process_signal_candidate_extract(
                    SimpleNamespace(
                        data={
                            "eventId": enrichment_event_id,
                            "docId": doc_id,
                            "forceEnrichment": force_enrichment,
                        }
                    ),
                    "",
                )
                enrichment_status = str(enrichment_result.get("status") or "")
                if enrichment_status == "enriched":
                    enrichment_enriched += 1
                elif enrichment_status == "skipped":
                    enrichment_skipped += 1
                elif enrichment_status == "failed":
                    enrichment_failed += 1

                normalize_event_id = str(uuid.uuid4())
                await dependencies.publish_outbox_event(
                    event_id=normalize_event_id,
                    event_type="signal_candidate.ingest.requested",
                    aggregate_type="signal_candidate",
                    aggregate_id=doc_id,
                    payload={
                        "docId": doc_id,
                        "historicalBackfill": True,
                        "version": 1,
                    },
                )
                await dependencies.process_normalize(
                    SimpleNamespace(
                        data={
                            "eventId": normalize_event_id,
                            "docId": doc_id,
                            "sequenceRuntime": True,
                            "suppressDownstreamOutbox": True,
                        }
                    ),
                    "",
                )
                dedup_event_id = str(uuid.uuid4())
                await dependencies.publish_outbox_event(
                    event_id=dedup_event_id,
                    event_type="signal_candidate.normalized",
                    aggregate_type="signal_candidate",
                    aggregate_id=doc_id,
                    payload={
                        "docId": doc_id,
                        "historicalBackfill": True,
                        "version": 1,
                    },
                )
                await dependencies.process_dedup(
                    SimpleNamespace(
                        data={
                            "eventId": dedup_event_id,
                            "docId": doc_id,
                            "sequenceRuntime": True,
                            "suppressDownstreamOutbox": True,
                        }
                    ),
                    "",
                )
                embed_event_id = str(uuid.uuid4())
                await dependencies.publish_outbox_event(
                    event_id=embed_event_id,
                    event_type="signal_candidate.normalized",
                    aggregate_type="signal_candidate",
                    aggregate_id=doc_id,
                    payload={
                        "docId": doc_id,
                        "historicalBackfill": True,
                        "version": 1,
                    },
                )
                await dependencies.process_embed(
                    SimpleNamespace(
                        data={
                            "eventId": embed_event_id,
                            "docId": doc_id,
                            "version": 1,
                            "sequenceRuntime": True,
                            "suppressDownstreamOutbox": True,
                        }
                    ),
                    "",
                )

            criteria_event_id = str(uuid.uuid4())
            await dependencies.publish_outbox_event(
                event_id=criteria_event_id,
                event_type="signal_candidate.embedded",
                aggregate_type="signal_candidate",
                aggregate_id=doc_id,
                payload={
                    "docId": doc_id,
                    "historicalBackfill": True,
                    "version": 1,
                },
            )
            criteria_result = await dependencies.process_match_criteria(
                SimpleNamespace(
                    data={
                        "eventId": criteria_event_id,
                        "docId": doc_id,
                        "historicalBackfill": True,
                        "sequenceRuntime": True,
                        "suppressDownstreamOutbox": True,
                    }
                ),
                "",
            )
            criteria_matches += int(criteria_result.get("criteriaCount") or 0)
            criterion_review_result = _coerce_replay_review_result(
                await dependencies.replay_gray_zone_reviews_for_doc(
                    doc_id=doc_id,
                    scope="criterion",
                )
            )
            criterion_llm_reviews += criterion_review_result["completed"]
            llm_review_failures += criterion_review_result["failed"]
            llm_review_timeouts += criterion_review_result["timedOut"]
            if await dependencies.is_signal_candidate_eligible_for_personalization(doc_id=doc_id):
                cluster_event_id = str(uuid.uuid4())
                await dependencies.publish_outbox_event(
                    event_id=cluster_event_id,
                    event_type="signal_candidate.criteria.matched",
                    aggregate_type="signal_candidate",
                    aggregate_id=doc_id,
                    payload={
                        "docId": doc_id,
                        "historicalBackfill": True,
                        "version": 1,
                    },
                )
                await dependencies.process_cluster(
                    SimpleNamespace(
                        data={
                            "eventId": cluster_event_id,
                            "docId": doc_id,
                            "version": 1,
                            "sequenceRuntime": True,
                            "suppressDownstreamOutbox": True,
                        }
                    ),
                    "",
                )
                interests_event_id = str(uuid.uuid4())
                await dependencies.publish_outbox_event(
                    event_id=interests_event_id,
                    event_type="signal_candidate.clustered",
                    aggregate_type="signal_candidate",
                    aggregate_id=doc_id,
                    payload={
                        "docId": doc_id,
                        "historicalBackfill": True,
                        "userId": user_id,
                        "interestId": interest_id,
                        "version": 1,
                    },
                )
                interest_result = await dependencies.process_match_interests(
                    SimpleNamespace(
                        data={
                            "eventId": interests_event_id,
                            "docId": doc_id,
                            "historicalBackfill": True,
                            "userId": user_id,
                            "interestId": interest_id,
                            "sequenceRuntime": True,
                            "suppressDownstreamOutbox": True,
                        }
                    ),
                    "",
                )
                interest_matches += int(interest_result.get("interestCount") or 0)
            processed_signal_candidates += 1
            await maybe_write_progress(phase="processed_document", current_doc_id=doc_id)

        last_position = int(batch_targets[-1]["target_position"])
        await write_progress(phase="batch_completed")

    await write_progress(phase="completed")

    return {
        "mode": "historical_backfill",
        "includeEnrichment": include_enrichment,
        "forceEnrichment": force_enrichment,
        "processedSignalCandidates": processed_signal_candidates,
        "totalSignalCandidates": total_signal_candidates,
        "enrichmentProcessed": enrichment_processed,
        "enrichmentEnriched": enrichment_enriched,
        "enrichmentSkipped": enrichment_skipped,
        "enrichmentFailed": enrichment_failed,
        "criteriaMatches": criteria_matches,
        "interestMatches": interest_matches,
        "criterionLlmReviews": criterion_llm_reviews,
        "interestLlmReviews": interest_llm_reviews,
        "llmReviewFailures": llm_review_failures,
        "llmReviewTimeouts": llm_review_timeouts,
        "retroNotifications": "skipped",
        "batchSize": batch_size,
    }

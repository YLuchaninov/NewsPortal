from __future__ import annotations

import uuid
from dataclasses import dataclass
from types import SimpleNamespace
from typing import Any, Awaitable, Callable


@dataclass(frozen=True)
class HistoricalBackfillDependencies:
    prepare_target_snapshot: Callable[..., Awaitable[int]]
    list_target_batch: Callable[..., Awaitable[list[dict[str, Any]]]]
    update_job_options: Callable[[str, dict[str, Any]], Awaitable[None]]
    publish_outbox_event: Callable[..., Awaitable[None]]
    process_cluster: Callable[[Any, str], Awaitable[dict[str, Any]]]
    process_match_criteria: Callable[[Any, str], Awaitable[dict[str, Any]]]
    process_match_interests: Callable[[Any, str], Awaitable[dict[str, Any]]]
    is_article_eligible_for_personalization: Callable[..., Awaitable[bool]]
    replay_gray_zone_reviews_for_doc: Callable[..., Awaitable[int]]


def build_historical_backfill_progress_patch(
    *,
    processed_articles: int,
    total_articles: int,
) -> dict[str, Any]:
    return {
        "progress": {
            "processedArticles": processed_articles,
            "totalArticles": total_articles,
        }
    }


async def replay_historical_articles(
    *,
    reindex_job_id: str,
    batch_size: int,
    doc_ids: list[str] | None,
    user_id: str | None,
    interest_id: str | None,
    system_feed_only: bool,
    dependencies: HistoricalBackfillDependencies,
) -> dict[str, Any]:
    total_articles = await dependencies.prepare_target_snapshot(
        reindex_job_id=reindex_job_id,
        doc_ids=doc_ids,
        system_feed_only=system_feed_only,
    )
    processed_articles = 0
    criteria_matches = 0
    interest_matches = 0
    criterion_llm_reviews = 0
    interest_llm_reviews = 0
    last_position = 0

    await dependencies.update_job_options(
        reindex_job_id,
        build_historical_backfill_progress_patch(
            processed_articles=processed_articles,
            total_articles=total_articles,
        ),
    )

    while True:
        batch_targets = await dependencies.list_target_batch(
            reindex_job_id=reindex_job_id,
            batch_size=batch_size,
            after_position=last_position,
        )
        if not batch_targets:
            break

        for target in batch_targets:
            doc_id = str(target["doc_id"])
            criteria_event_id = str(uuid.uuid4())
            await dependencies.publish_outbox_event(
                event_id=criteria_event_id,
                event_type="article.embedded",
                aggregate_type="article",
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
                    }
                ),
                "",
            )
            criteria_matches += int(criteria_result.get("criteriaCount") or 0)
            criterion_llm_reviews += await dependencies.replay_gray_zone_reviews_for_doc(
                doc_id=doc_id,
                scope="criterion",
            )
            if await dependencies.is_article_eligible_for_personalization(doc_id=doc_id):
                cluster_event_id = str(uuid.uuid4())
                await dependencies.publish_outbox_event(
                    event_id=cluster_event_id,
                    event_type="article.criteria.matched",
                    aggregate_type="article",
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
                            "historicalBackfill": True,
                            "version": 1,
                        }
                    ),
                    "",
                )
                interests_event_id = str(uuid.uuid4())
                await dependencies.publish_outbox_event(
                    event_id=interests_event_id,
                    event_type="article.clustered",
                    aggregate_type="article",
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
                        }
                    ),
                    "",
                )
                interest_matches += int(interest_result.get("interestCount") or 0)
            processed_articles += 1

        last_position = int(batch_targets[-1]["target_position"])
        await dependencies.update_job_options(
            reindex_job_id,
            build_historical_backfill_progress_patch(
                processed_articles=processed_articles,
                total_articles=total_articles,
            ),
        )

    return {
        "mode": "historical_backfill",
        "processedArticles": processed_articles,
        "totalArticles": total_articles,
        "criteriaMatches": criteria_matches,
        "interestMatches": interest_matches,
        "criterionLlmReviews": criterion_llm_reviews,
        "interestLlmReviews": interest_llm_reviews,
        "retroNotifications": "skipped",
        "batchSize": batch_size,
    }

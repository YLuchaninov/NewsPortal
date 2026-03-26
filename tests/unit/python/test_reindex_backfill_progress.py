import unittest
from unittest.mock import AsyncMock, call

from services.workers.app import reindex_backfill


class ReindexBackfillProgressTests(unittest.IsolatedAsyncioTestCase):
    async def test_replay_historical_articles_uses_snapshot_batches_and_stable_progress(self) -> None:
        list_snapshot_batch = AsyncMock(
            side_effect=[
                [{"target_position": 1, "doc_id": "doc-1"}],
                [{"target_position": 2, "doc_id": "doc-2"}],
                [],
            ]
        )
        replay_reviews = AsyncMock(side_effect=[1, 0, 0, 2])
        update_job_options = AsyncMock()
        dependencies = reindex_backfill.HistoricalBackfillDependencies(
            prepare_target_snapshot=AsyncMock(return_value=2),
            list_target_batch=list_snapshot_batch,
            update_job_options=update_job_options,
            publish_outbox_event=AsyncMock(),
            process_match_criteria=AsyncMock(return_value={"criteriaCount": 1}),
            process_match_interests=AsyncMock(return_value={"interestCount": 2}),
            is_article_eligible_for_personalization=AsyncMock(return_value=True),
            replay_gray_zone_reviews_for_doc=replay_reviews,
        )
        result = await reindex_backfill.replay_historical_articles(
            reindex_job_id="job-1",
            batch_size=1,
            doc_ids=None,
            dependencies=dependencies,
        )

        self.assertEqual(
            list_snapshot_batch.await_args_list,
            [
                call(reindex_job_id="job-1", batch_size=1, after_position=0),
                call(reindex_job_id="job-1", batch_size=1, after_position=1),
                call(reindex_job_id="job-1", batch_size=1, after_position=2),
            ],
        )
        self.assertEqual(
            update_job_options.await_args_list,
            [
                call("job-1", {"progress": {"processedArticles": 0, "totalArticles": 2}}),
                call("job-1", {"progress": {"processedArticles": 1, "totalArticles": 2}}),
                call("job-1", {"progress": {"processedArticles": 2, "totalArticles": 2}}),
            ],
        )
        self.assertEqual(result["processedArticles"], 2)
        self.assertEqual(result["totalArticles"], 2)
        self.assertEqual(result["criteriaMatches"], 2)
        self.assertEqual(result["interestMatches"], 4)
        self.assertEqual(result["criterionLlmReviews"], 1)
        self.assertEqual(result["interestLlmReviews"], 0)

    async def test_replay_historical_articles_records_zero_progress_for_empty_snapshot(self) -> None:
        list_snapshot_batch = AsyncMock(return_value=[])
        ensure_event = AsyncMock()
        match_criteria = AsyncMock()
        match_interests = AsyncMock()
        replay_reviews = AsyncMock()
        update_job_options = AsyncMock()

        dependencies = reindex_backfill.HistoricalBackfillDependencies(
            prepare_target_snapshot=AsyncMock(return_value=0),
            list_target_batch=list_snapshot_batch,
            update_job_options=update_job_options,
            publish_outbox_event=ensure_event,
            process_match_criteria=match_criteria,
            process_match_interests=match_interests,
            is_article_eligible_for_personalization=AsyncMock(return_value=False),
            replay_gray_zone_reviews_for_doc=replay_reviews,
        )

        result = await reindex_backfill.replay_historical_articles(
            reindex_job_id="job-empty",
            batch_size=50,
            doc_ids=["doc-1"],
            dependencies=dependencies,
        )

        list_snapshot_batch.assert_awaited_once_with(
            reindex_job_id="job-empty",
            batch_size=50,
            after_position=0,
        )
        update_job_options.assert_awaited_once_with(
            "job-empty",
            {"progress": {"processedArticles": 0, "totalArticles": 0}},
        )
        ensure_event.assert_not_awaited()
        match_criteria.assert_not_awaited()
        match_interests.assert_not_awaited()
        replay_reviews.assert_not_awaited()
        self.assertEqual(result["processedArticles"], 0)
        self.assertEqual(result["totalArticles"], 0)
        self.assertEqual(result["criteriaMatches"], 0)
        self.assertEqual(result["interestMatches"], 0)


if __name__ == "__main__":
    unittest.main()

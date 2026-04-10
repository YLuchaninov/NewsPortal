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
        publish_outbox_event = AsyncMock()
        process_article_extract = AsyncMock()
        process_normalize = AsyncMock()
        process_dedup = AsyncMock()
        process_embed = AsyncMock()
        process_cluster = AsyncMock(return_value={"status": "clustered"})
        dependencies = reindex_backfill.HistoricalBackfillDependencies(
            prepare_target_snapshot=AsyncMock(return_value=2),
            list_target_batch=list_snapshot_batch,
            update_job_options=update_job_options,
            publish_outbox_event=publish_outbox_event,
            process_article_extract=process_article_extract,
            process_normalize=process_normalize,
            process_dedup=process_dedup,
            process_embed=process_embed,
            process_cluster=process_cluster,
            process_match_criteria=AsyncMock(return_value={"criteriaCount": 1}),
            process_match_interests=AsyncMock(return_value={"interestCount": 2}),
            is_article_eligible_for_personalization=AsyncMock(return_value=True),
            replay_gray_zone_reviews_for_doc=replay_reviews,
        )
        result = await reindex_backfill.replay_historical_articles(
            reindex_job_id="job-1",
            batch_size=1,
            doc_ids=None,
            user_id=None,
            interest_id=None,
            system_feed_only=False,
            include_enrichment=False,
            force_enrichment=False,
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
        self.assertEqual(result["enrichmentProcessed"], 0)
        process_article_extract.assert_not_awaited()
        process_normalize.assert_not_awaited()
        process_dedup.assert_not_awaited()
        process_embed.assert_not_awaited()
        self.assertEqual(publish_outbox_event.await_count, 6)
        self.assertEqual(process_cluster.await_count, 2)

    async def test_replay_historical_articles_records_zero_progress_for_empty_snapshot(self) -> None:
        list_snapshot_batch = AsyncMock(return_value=[])
        process_article_extract = AsyncMock()
        process_normalize = AsyncMock()
        process_dedup = AsyncMock()
        process_embed = AsyncMock()
        publish_outbox_event = AsyncMock()
        process_cluster = AsyncMock()
        match_criteria = AsyncMock()
        match_interests = AsyncMock()
        replay_reviews = AsyncMock()
        update_job_options = AsyncMock()

        dependencies = reindex_backfill.HistoricalBackfillDependencies(
            prepare_target_snapshot=AsyncMock(return_value=0),
            list_target_batch=list_snapshot_batch,
            update_job_options=update_job_options,
            publish_outbox_event=publish_outbox_event,
            process_article_extract=process_article_extract,
            process_normalize=process_normalize,
            process_dedup=process_dedup,
            process_embed=process_embed,
            process_cluster=process_cluster,
            process_match_criteria=match_criteria,
            process_match_interests=match_interests,
            is_article_eligible_for_personalization=AsyncMock(return_value=False),
            replay_gray_zone_reviews_for_doc=replay_reviews,
        )

        result = await reindex_backfill.replay_historical_articles(
            reindex_job_id="job-empty",
            batch_size=50,
            doc_ids=["doc-1"],
            user_id=None,
            interest_id=None,
            system_feed_only=False,
            include_enrichment=True,
            force_enrichment=False,
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
        process_article_extract.assert_not_awaited()
        process_normalize.assert_not_awaited()
        process_dedup.assert_not_awaited()
        process_embed.assert_not_awaited()
        publish_outbox_event.assert_not_awaited()
        process_cluster.assert_not_awaited()
        match_criteria.assert_not_awaited()
        match_interests.assert_not_awaited()
        replay_reviews.assert_not_awaited()
        self.assertEqual(result["processedArticles"], 0)
        self.assertEqual(result["totalArticles"], 0)
        self.assertEqual(result["enrichmentProcessed"], 0)
        self.assertEqual(result["criteriaMatches"], 0)
        self.assertEqual(result["interestMatches"], 0)

    async def test_replay_historical_articles_forwards_scoped_interest_filters(self) -> None:
        process_article_extract = AsyncMock()
        process_normalize = AsyncMock()
        process_dedup = AsyncMock()
        process_embed = AsyncMock()
        publish_outbox_event = AsyncMock()
        process_cluster = AsyncMock(return_value={"status": "clustered"})
        process_match_interests = AsyncMock(return_value={"interestCount": 1})
        dependencies = reindex_backfill.HistoricalBackfillDependencies(
            prepare_target_snapshot=AsyncMock(return_value=1),
            list_target_batch=AsyncMock(
                side_effect=[
                    [{"target_position": 1, "doc_id": "doc-7"}],
                    [],
                ]
            ),
            update_job_options=AsyncMock(),
            publish_outbox_event=publish_outbox_event,
            process_article_extract=process_article_extract,
            process_normalize=process_normalize,
            process_dedup=process_dedup,
            process_embed=process_embed,
            process_cluster=process_cluster,
            process_match_criteria=AsyncMock(return_value={"criteriaCount": 1}),
            process_match_interests=process_match_interests,
            is_article_eligible_for_personalization=AsyncMock(return_value=True),
            replay_gray_zone_reviews_for_doc=AsyncMock(return_value=0),
        )

        await reindex_backfill.replay_historical_articles(
            reindex_job_id="job-scope",
            batch_size=25,
            doc_ids=None,
            user_id="user-1",
            interest_id="interest-1",
            system_feed_only=True,
            include_enrichment=False,
            force_enrichment=False,
            dependencies=dependencies,
        )

        dependencies.prepare_target_snapshot.assert_awaited_once_with(
            reindex_job_id="job-scope",
            doc_ids=None,
            system_feed_only=True,
            include_enrichment=False,
            force_enrichment=False,
        )
        self.assertEqual(publish_outbox_event.await_count, 3)
        scoped_job = process_match_interests.await_args.args[0]
        self.assertEqual(scoped_job.data["userId"], "user-1")
        self.assertEqual(scoped_job.data["interestId"], "interest-1")
        self.assertTrue(scoped_job.data["historicalBackfill"])

    async def test_replay_historical_articles_runs_enrichment_pipeline_before_matching(self) -> None:
        call_order: list[str] = []

        def track(name: str, result: dict[str, int | str] | None = None):
            async def _inner(*args, **kwargs):
                del args, kwargs
                call_order.append(name)
                return result or {"status": name}

            return _inner

        dependencies = reindex_backfill.HistoricalBackfillDependencies(
            prepare_target_snapshot=AsyncMock(return_value=1),
            list_target_batch=AsyncMock(
                side_effect=[
                    [{"target_position": 1, "doc_id": "doc-enrich"}],
                    [],
                ]
            ),
            update_job_options=AsyncMock(),
            publish_outbox_event=AsyncMock(),
            process_article_extract=AsyncMock(side_effect=track("extract", {"status": "skipped"})),
            process_normalize=AsyncMock(side_effect=track("normalize")),
            process_dedup=AsyncMock(side_effect=track("dedup")),
            process_embed=AsyncMock(side_effect=track("embed")),
            process_cluster=AsyncMock(side_effect=track("cluster", {"status": "clustered"})),
            process_match_criteria=AsyncMock(side_effect=track("criteria", {"criteriaCount": 2})),
            process_match_interests=AsyncMock(side_effect=track("interests", {"interestCount": 3})),
            is_article_eligible_for_personalization=AsyncMock(return_value=True),
            replay_gray_zone_reviews_for_doc=AsyncMock(return_value=0),
        )

        result = await reindex_backfill.replay_historical_articles(
            reindex_job_id="job-enrichment",
            batch_size=10,
            doc_ids=["doc-enrich"],
            user_id=None,
            interest_id=None,
            system_feed_only=False,
            include_enrichment=True,
            force_enrichment=False,
            dependencies=dependencies,
        )

        self.assertEqual(
            call_order,
            ["extract", "normalize", "dedup", "embed", "criteria", "cluster", "interests"],
        )
        self.assertEqual(result["enrichmentProcessed"], 1)
        self.assertEqual(result["enrichmentSkipped"], 1)
        self.assertEqual(result["enrichmentEnriched"], 0)
        self.assertEqual(result["enrichmentFailed"], 0)
        self.assertEqual(result["criteriaMatches"], 2)
        self.assertEqual(result["interestMatches"], 3)


if __name__ == "__main__":
    unittest.main()

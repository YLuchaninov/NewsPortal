import unittest

from services.workers.app.source_scoring import (
    compute_source_recall_quality_snapshot,
    compute_source_interest_score,
    summarize_channel_quality_metrics,
)


class ChannelQualityMetricsTests(unittest.TestCase):
    def test_summarize_channel_quality_metrics_uses_generic_intake_signals(self) -> None:
        metrics = summarize_channel_quality_metrics(
            {
                "total_articles_period": 20,
                "unique_articles_period": 14,
                "duplicate_articles_period": 6,
                "fresh_articles_period": 8,
                "fetch_runs_period": 10,
                "successful_fetch_runs_period": 8,
                "new_content_fetch_runs_period": 4,
                "degraded_fetch_runs_period": 2,
                "duplicate_suppressed_period": 5,
                "new_articles_from_fetch_period": 12,
                "effective_poll_interval_seconds": 3600,
                "consecutive_failures": 1,
                "avg_article_delay_seconds": 7200,
                "last_result_kind": "new_content",
            }
        )

        self.assertEqual(metrics["metric_source"], "generic_channel_quality")
        self.assertGreater(metrics["yield_score"], 0.0)
        self.assertGreater(metrics["lead_time_score"], 0.0)
        self.assertGreater(metrics["duplication_score"], 0.0)
        self.assertEqual(metrics["unique_articles_period"], 14)
        self.assertEqual(metrics["duplicate_articles_period"], 6)

    def test_summarize_channel_quality_metrics_defaults_without_history(self) -> None:
        metrics = summarize_channel_quality_metrics({})

        self.assertEqual(metrics["metric_source"], "generic_channel_quality")
        self.assertEqual(metrics["yield_score"], 0.5)
        self.assertEqual(metrics["lead_time_score"], 0.5)
        self.assertEqual(metrics["duplication_score"], 0.15)

    def test_compute_source_interest_score_captures_generic_channel_metrics_in_breakdown(self) -> None:
        channel_metrics = summarize_channel_quality_metrics(
            {
                "total_articles_period": 12,
                "unique_articles_period": 9,
                "duplicate_articles_period": 3,
                "fresh_articles_period": 6,
                "fetch_runs_period": 8,
                "successful_fetch_runs_period": 7,
                "new_content_fetch_runs_period": 4,
                "effective_poll_interval_seconds": 3600,
                "avg_article_delay_seconds": 1800,
            }
        )

        score = compute_source_interest_score(
            mission_graph={
                "core_topic": "EU AI",
                "subtopics": ["regulation"],
                "source_types": ["news", "blog"],
            },
            profile={
                "source_type": "news",
                "source_linking_quality": 0.7,
                "spam_signals": 0.1,
                "extraction_data": {},
            },
            candidate={
                "url": "https://fresh.example.com/feed.xml",
                "title": "EU AI regulation updates",
                "description": "Original reporting and official links",
                "relevance_score": 0.72,
                "llm_assessment": {"quality_signals": ["official", "analysis"]},
            },
            channel_metrics=channel_metrics,
        )

        breakdown = score["scoring_breakdown"]["channelMetrics"]
        self.assertEqual(breakdown["metricSource"], "generic_channel_quality")
        self.assertEqual(breakdown["totalArticlesPeriod"], 12)
        self.assertEqual(breakdown["uniqueArticlesPeriod"], 9)
        self.assertNotIn("usefulArticlesPeriod", breakdown)

    def test_compute_source_recall_quality_snapshot_stays_interest_independent(self) -> None:
        channel_metrics = summarize_channel_quality_metrics(
            {
                "total_articles_period": 18,
                "unique_articles_period": 15,
                "duplicate_articles_period": 3,
                "fresh_articles_period": 9,
                "fetch_runs_period": 10,
                "successful_fetch_runs_period": 9,
                "new_content_fetch_runs_period": 5,
                "effective_poll_interval_seconds": 1800,
                "avg_article_delay_seconds": 900,
            }
        )

        snapshot = compute_source_recall_quality_snapshot(
            profile={
                "canonical_domain": "signals.example.com",
                "source_type": "rss",
                "trust_score": 0.74,
                "source_linking_quality": 0.68,
                "technical_quality": 0.82,
                "historical_stability": 0.71,
                "spam_signals": 0.08,
            },
            candidate={
                "url": "https://signals.example.com/feed.xml",
                "final_url": "https://signals.example.com/feed.xml",
                "title": "Signals feed",
                "provider_type": "rss",
            },
            channel_metrics=channel_metrics,
        )

        self.assertEqual(snapshot["quality_source"], "generic_recall_quality")
        self.assertGreater(snapshot["recall_score"], 0.0)
        self.assertEqual(
            snapshot["scoring_breakdown"]["channelMetrics"]["metricSource"],
            "generic_channel_quality",
        )
        self.assertIn("sourceProfile", snapshot["scoring_breakdown"])
        self.assertNotIn("graphTokens", snapshot["scoring_breakdown"])


if __name__ == "__main__":
    unittest.main()

import unittest
from datetime import datetime, timedelta, timezone

from tests.unit.python.support.stubs import install_worker_runtime_import_stubs

install_worker_runtime_import_stubs()

from services.workers.app import main as worker_main


class WorkerHardFilterTests(unittest.TestCase):
    def _make_article(self, *, title: str, lead: str = "", body: str = "") -> dict[str, str]:
        return {
            "title": title,
            "lead": lead,
            "body": body,
            "lang": "en",
            "published_at": datetime.now(timezone.utc).isoformat(),
        }

    def test_must_have_terms_pass_when_any_term_matches(self) -> None:
        passes, reasons, within_window = worker_main.passes_hard_filters(
            article=self._make_article(
                title="Enterprise launches vendor selection for ERP implementation partner"
            ),
            article_features={"places": [], "short_tokens": [], "entities": [], "numbers": []},
            hard_constraints={
                "must_have_terms": ["rfp", "vendor selection"],
                "time_window_hours": 168,
            },
        )

        self.assertTrue(passes)
        self.assertEqual(reasons, [])
        self.assertTrue(within_window)

    def test_must_have_terms_fail_only_when_no_term_matches(self) -> None:
        passes, reasons, within_window = worker_main.passes_hard_filters(
            article=self._make_article(
                title="Company announces new internal platform roadmap"
            ),
            article_features={"places": [], "short_tokens": [], "entities": [], "numbers": []},
            hard_constraints={
                "must_have_terms": ["rfp", "vendor selection"],
                "time_window_hours": 168,
            },
        )

        self.assertFalse(passes)
        self.assertEqual(reasons, ["must_have_any"])
        self.assertTrue(within_window)

    def test_blank_time_window_behaves_as_no_age_limit(self) -> None:
        article = self._make_article(title="Old but still relevant")
        article["published_at"] = (
            datetime.now(timezone.utc) - timedelta(days=365)
        ).isoformat()

        passes, reasons, within_window = worker_main.passes_hard_filters(
            article=article,
            article_features={"places": [], "short_tokens": [], "entities": [], "numbers": []},
            hard_constraints={},
        )

        self.assertTrue(passes)
        self.assertEqual(reasons, [])
        self.assertTrue(within_window)

    def test_rejects_wrapper_directory_noise_without_direct_request_signal(self) -> None:
        passes, reasons, within_window = worker_main.passes_hard_filters(
            article=self._make_article(
                title="Cold Calling Freelance Jobs: Work Remote & Earn Online",
                body=(
                    "Browse by Category. Hire freelancers. Find work. "
                    "Search buyers can search offers to buy now."
                ),
            ),
            article_features={"places": [], "short_tokens": [], "entities": [], "numbers": []},
            hard_constraints={},
        )

        self.assertFalse(passes)
        self.assertIn("wrapper_directory_noise", reasons)
        self.assertTrue(within_window)

    def test_keeps_buyer_request_page_even_with_marketplace_wrapper_text(self) -> None:
        passes, reasons, within_window = worker_main.passes_hard_filters(
            article=self._make_article(
                title="Looking for Developer Support on Ongoing Technical Projects",
                body=(
                    "Post Project. Browse by Category. Hire freelancers. "
                    "Search freelancers to request a proposal."
                ),
            ),
            article_features={"places": [], "short_tokens": [], "entities": [], "numbers": []},
            hard_constraints={},
        )

        self.assertTrue(passes)
        self.assertNotIn("wrapper_directory_noise", reasons)
        self.assertTrue(within_window)

    def test_content_analysis_backfill_defaults_are_safe(self) -> None:
        self.assertEqual(
            worker_main.normalize_content_analysis_backfill_subject_types(None),
            ["article", "web_resource", "story_cluster"],
        )
        self.assertEqual(
            worker_main.normalize_content_analysis_backfill_modules(None),
            {
                "ner",
                "sentiment",
                "category",
                "cluster_summary",
                "system_interest_labels",
                "content_filter",
            },
        )
        self.assertEqual(
            worker_main.normalize_content_analysis_backfill_modules(["structured_extraction"]),
            {"structured_extraction"},
        )
        self.assertEqual(
            worker_main.build_content_analysis_backfill_progress_patch(
                processed_items=3,
                total_items=9,
            ),
            {"progress": {"processedContentItems": 3, "totalContentItems": 9}},
        )

    def test_content_analysis_missing_clause_tracks_policy_key_for_gate(self) -> None:
        clause, params = worker_main.build_content_analysis_missing_clause(
            subject_type="web_resource",
            modules={"content_filter"},
            policy_key="recent_gate",
            alias="wr.resource_id",
        )

        self.assertIn("content_filter_results", clause)
        self.assertEqual(params, ["web_resource", "recent_gate"])

    def test_content_analysis_missing_clause_supports_story_cluster_summary(self) -> None:
        clause, params = worker_main.build_content_analysis_missing_clause(
            subject_type="story_cluster",
            modules={"cluster_summary"},
            policy_key="recent_gate",
            alias="sc.story_cluster_id",
        )

        self.assertIn("analysis_type = 'cluster_summary'", clause)
        self.assertEqual(params, [])

    def test_content_analysis_missing_clause_supports_structured_extraction(self) -> None:
        clause, params = worker_main.build_content_analysis_missing_clause(
            subject_type="article",
            modules={"structured_extraction"},
            policy_key="recent_gate",
            alias="a.doc_id",
        )

        self.assertIn("analysis_type = 'structured_extraction'", clause)
        self.assertEqual(params, ["article"])


if __name__ == "__main__":
    unittest.main()

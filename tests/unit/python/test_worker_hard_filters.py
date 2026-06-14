import unittest
from datetime import datetime, timedelta, timezone

from tests.unit.python.support.stubs import install_worker_runtime_import_stubs

install_worker_runtime_import_stubs()

from signalops.workers import main as worker_main
from signalops.workers import reindex_backfill_runtime


class WorkerHardFilterTests(unittest.TestCase):
    def _make_signal_candidate(
        self,
        *,
        title: str,
        lead: str = "",
        body: str = "",
        url: str = "",
    ) -> dict[str, str]:
        return {
            "title": title,
            "lead": lead,
            "body": body,
            "url": url,
            "lang": "en",
            "published_at": datetime.now(timezone.utc).isoformat(),
        }

    def test_must_have_terms_pass_when_any_term_matches(self) -> None:
        passes, reasons, within_window = worker_main.passes_hard_filters(
            signal_candidate=self._make_signal_candidate(
                title="Enterprise launches vendor selection for ERP implementation partner"
            ),
            signal_candidate_features={"places": [], "short_tokens": [], "entities": [], "numbers": []},
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
            signal_candidate=self._make_signal_candidate(
                title="Company announces new internal platform roadmap"
            ),
            signal_candidate_features={"places": [], "short_tokens": [], "entities": [], "numbers": []},
            hard_constraints={
                "must_have_terms": ["rfp", "vendor selection"],
                "time_window_hours": 168,
            },
        )

        self.assertFalse(passes)
        self.assertEqual(reasons, ["must_have_any"])
        self.assertTrue(within_window)

    def test_blank_time_window_behaves_as_no_age_limit(self) -> None:
        signal_candidate = self._make_signal_candidate(title="Old but still relevant")
        signal_candidate["published_at"] = (
            datetime.now(timezone.utc) - timedelta(days=365)
        ).isoformat()

        passes, reasons, within_window = worker_main.passes_hard_filters(
            signal_candidate=signal_candidate,
            signal_candidate_features={"places": [], "short_tokens": [], "entities": [], "numbers": []},
            hard_constraints={},
        )

        self.assertTrue(passes)
        self.assertEqual(reasons, [])
        self.assertTrue(within_window)

    def test_global_place_constraint_behaves_as_worldwide_wildcard(self) -> None:
        passes, reasons, within_window = worker_main.passes_hard_filters(
            signal_candidate=self._make_signal_candidate(
                title="Netherlands software development tender notice"
            ),
            signal_candidate_features={"places": ["Netherlands"], "short_tokens": [], "entities": [], "numbers": []},
            hard_constraints={
                "places": ["global"],
                "time_window_hours": 168,
            },
        )

        self.assertTrue(passes)
        self.assertEqual(reasons, [])
        self.assertTrue(within_window)

    def test_rejects_wrapper_directory_noise_without_direct_request_signal(self) -> None:
        passes, reasons, within_window = worker_main.passes_hard_filters(
            signal_candidate=self._make_signal_candidate(
                title="Cold Calling Remote Jobs: Work Remote & Earn Online",
                body=(
                    "Browse by Category. Browse profiles. Find work. "
                    "Search buyers can search offers to buy now."
                ),
            ),
            signal_candidate_features={"places": [], "short_tokens": [], "entities": [], "numbers": []},
            hard_constraints={},
        )

        self.assertFalse(passes)
        self.assertIn("wrapper_directory_noise", reasons)
        self.assertTrue(within_window)

    def test_keeps_buyer_request_page_even_with_marketplace_wrapper_text(self) -> None:
        passes, reasons, within_window = worker_main.passes_hard_filters(
            signal_candidate=self._make_signal_candidate(
                title="Looking for Developer Support on Ongoing Technical Projects",
                body=(
                    "Post Project. Browse by Category. Browse profiles. "
                    "Search providers to request a proposal."
                ),
            ),
            signal_candidate_features={"places": [], "short_tokens": [], "entities": [], "numbers": []},
            hard_constraints={},
        )

        self.assertTrue(passes)
        self.assertNotIn("wrapper_directory_noise", reasons)
        self.assertTrue(within_window)

    def test_rejects_marketplace_category_url_without_project_id(self) -> None:
        passes, reasons, within_window = worker_main.passes_hard_filters(
            signal_candidate=self._make_signal_candidate(
                title="ERP/CRM Development",
                url="https://www.peopleperhour.com/freelance-jobs/technology-programming/erp-crm-development",
            ),
            signal_candidate_features={"places": [], "short_tokens": [], "entities": [], "numbers": []},
            hard_constraints={},
        )

        self.assertFalse(passes)
        self.assertIn("wrapper_directory_noise", reasons)
        self.assertTrue(within_window)

    def test_keeps_marketplace_project_detail_url_with_project_id(self) -> None:
        passes, reasons, within_window = worker_main.passes_hard_filters(
            signal_candidate=self._make_signal_candidate(
                title="Need Shopify POS custom app developer",
                url="https://www.peopleperhour.com/freelance-jobs/technology-programming/shopify-pos-custom-app-987654",
            ),
            signal_candidate_features={"places": [], "short_tokens": [], "entities": [], "numbers": []},
            hard_constraints={},
        )

        self.assertTrue(passes)
        self.assertNotIn("wrapper_directory_noise", reasons)
        self.assertTrue(within_window)

    def test_rejects_search_ad_click_url(self) -> None:
        passes, reasons, within_window = worker_main.passes_hard_filters(
            signal_candidate=self._make_signal_candidate(
                title="Hubspot developer - Contact Us & Get Started - 4.9/5 on Clutch",
                url="https://www.bing.com/aclick?u=https%3A%2F%2Fvendor.example%2Fservices",
            ),
            signal_candidate_features={"places": [], "short_tokens": [], "entities": [], "numbers": []},
            hard_constraints={},
        )

        self.assertFalse(passes)
        self.assertIn("wrapper_directory_noise", reasons)
        self.assertTrue(within_window)

    def test_rejects_generic_advice_without_buyer_request(self) -> None:
        passes, reasons, within_window = worker_main.passes_hard_filters(
            signal_candidate=self._make_signal_candidate(
                title="How to Hire Dedicated Node.js Developers for Your Team",
                url="https://www.linkedin.com/pulse/how-hire-dedicated-nodejs-developers",
            ),
            signal_candidate_features={"places": [], "short_tokens": [], "entities": [], "numbers": []},
            hard_constraints={},
        )

        self.assertFalse(passes)
        self.assertIn("wrapper_directory_noise", reasons)
        self.assertTrue(within_window)

    def test_rejects_professional_network_pulse_even_when_title_says_looking_for(self) -> None:
        passes, reasons, within_window = worker_main.passes_hard_filters(
            signal_candidate=self._make_signal_candidate(
                title="Looking for a talented developer with automation experience",
                url="https://www.linkedin.com/pulse/looking-talented-developer-knack-automation",
            ),
            signal_candidate_features={"places": [], "short_tokens": [], "entities": [], "numbers": []},
            hard_constraints={},
        )

        self.assertFalse(passes)
        self.assertIn("wrapper_directory_noise", reasons)
        self.assertTrue(within_window)

    def test_rejects_professional_network_job_posts_as_selection_noise(self) -> None:
        passes, reasons, within_window = worker_main.passes_hard_filters(
            signal_candidate=self._make_signal_candidate(
                title="Senior ServiceNow Developer - Full Remote Contractor in USD",
                url="https://www.linkedin.com/jobs/view/senior-servicenow-developer",
            ),
            signal_candidate_features={"places": [], "short_tokens": [], "entities": [], "numbers": []},
            hard_constraints={},
        )

        self.assertFalse(passes)
        self.assertIn("wrapper_directory_noise", reasons)
        self.assertTrue(within_window)

    def test_keeps_non_job_social_post_with_project_proposal_markers(self) -> None:
        passes, reasons, within_window = worker_main.passes_hard_filters(
            signal_candidate=self._make_signal_candidate(
                title="Looking for developer partner for fixed-price CRM integration proposal",
                url="https://www.linkedin.com/posts/example-looking-for-developer",
            ),
            signal_candidate_features={"places": [], "short_tokens": [], "entities": [], "numbers": []},
            hard_constraints={},
        )

        self.assertTrue(passes)
        self.assertNotIn("wrapper_directory_noise", reasons)
        self.assertTrue(within_window)

    def test_rejects_tag_filter_pages(self) -> None:
        passes, reasons, within_window = worker_main.passes_hard_filters(
            signal_candidate=self._make_signal_candidate(
                title="on hand | Odoo",
                url="https://www.odoo.com/forum/help-1/tag/on-hand-11883/questions?filters=tag",
            ),
            signal_candidate_features={"places": [], "short_tokens": [], "entities": [], "numbers": []},
            hard_constraints={},
        )

        self.assertFalse(passes)
        self.assertIn("wrapper_directory_noise", reasons)
        self.assertTrue(within_window)

    def test_content_analysis_backfill_defaults_are_safe(self) -> None:
        self.assertEqual(
            worker_main.normalize_content_analysis_backfill_subject_types(None),
            ["signal_candidate", "web_resource", "story_cluster"],
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

    def test_reindex_cancellation_key_hashes_large_bounded_chunks(self) -> None:
        first = reindex_backfill_runtime.build_reindex_cancellation_key(
            index_name="interest_centroids",
            job_kind="backfill",
            options_json={
                "batchSize": 50,
                "progress": {"processedSignalCandidates": 1},
                "docIds": ["b", "a"],
                "includeEnrichment": False,
            },
        )
        second = reindex_backfill_runtime.build_reindex_cancellation_key(
            index_name="interest_centroids",
            job_kind="backfill",
            options_json={
                "batchSize": 500,
                "backfill": {"processedSignalCandidates": 99},
                "docIds": ["a", "b"],
                "includeEnrichment": False,
            },
        )
        large = reindex_backfill_runtime.build_reindex_cancellation_key(
            index_name="interest_centroids",
            job_kind="backfill",
            options_json={
                "docIds": [f"doc-{index:04d}" for index in range(500)],
                "includeEnrichment": False,
            },
        )

        self.assertEqual(first, second)
        self.assertRegex(first, r"^reindex:interest_centroids:backfill:sha256:[a-f0-9]{64}$")
        self.assertEqual(
            len(large),
            len("reindex:interest_centroids:backfill:sha256:") + 64,
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
            subject_type="signal_candidate",
            modules={"structured_extraction"},
            policy_key="recent_gate",
            alias="a.doc_id",
        )

        self.assertIn("analysis_type = 'structured_extraction'", clause)
        self.assertEqual(params, ["signal_candidate"])


if __name__ == "__main__":
    unittest.main()

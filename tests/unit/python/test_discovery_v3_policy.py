import unittest

from services.workers.app.discovery_v3_actions import decide_action
from services.workers.app.discovery_v3_endpoint_classification import (
    classify_endpoint_kind,
    infer_provider_type,
)
from services.workers.app.discovery_v3_provider_capabilities import (
    provider_allows_promotion,
    provider_compliance_score,
    provider_requires_config,
    provider_supports_signal_mode,
    require_provider_card,
)
from services.workers.app.discovery_v3_scoring import (
    compute_adversarial_confidence,
    compute_endpoint_total_score,
    compute_hidden_signal_confidence,
    coverage_gap_score,
)


class DiscoveryV3PolicyTests(unittest.TestCase):
    def test_endpoint_classifier_maps_role_specific_patterns(self) -> None:
        self.assertEqual(
            classify_endpoint_kind("https://example.com/feed.xml"),
            "rss_feed",
        )
        self.assertEqual(
            classify_endpoint_kind("https://example.com/release-notes"),
            "release_notes",
        )
        self.assertEqual(
            classify_endpoint_kind("https://example.com/security/advisories"),
            "security_advisory",
        )
        self.assertEqual(
            classify_endpoint_kind("https://example.gov/przetargi"),
            "procurement",
        )
        self.assertEqual(
            classify_endpoint_kind("https://example.de/vergaben"),
            "procurement",
        )
        self.assertEqual(
            classify_endpoint_kind("https://sam.gov/content/opportunities"),
            "procurement",
        )
        self.assertEqual(
            classify_endpoint_kind("https://www.find-tender.service.gov.uk/Search"),
            "procurement",
        )
        self.assertEqual(
            classify_endpoint_kind("https://ezamowienia.gov.pl/mp-client/search/list/ocds-148610"),
            "procurement",
        )
        self.assertEqual(
            classify_endpoint_kind("https://www.service.bund.de/Content/DE/Ausschreibungen/Suche/Formular.html"),
            "procurement",
        )
        self.assertEqual(
            classify_endpoint_kind("https://example.com/openapi.json"),
            "api_openapi",
        )
        self.assertEqual(
            classify_endpoint_kind("https://example.eu/policies"),
            "regulatory_policy",
        )
        self.assertEqual(
            classify_endpoint_kind("https://example.gov/guidance/ai-risk"),
            "regulatory_policy",
        )
        self.assertEqual(
            classify_endpoint_kind("https://example.org/standards"),
            "regulatory_policy",
        )

    def test_provider_inference_keeps_ingestion_family_separate_from_social(self) -> None:
        self.assertEqual(infer_provider_type("rss_feed", "https://example.com/rss.xml"), "rss")
        self.assertEqual(infer_provider_type("api_openapi", "https://example.com/openapi.json"), "api")
        self.assertEqual(infer_provider_type("unknown", "https://www.youtube.com/@example"), "youtube")
        self.assertEqual(infer_provider_type("unknown", "https://reddit.com/r/sysadmin"), "forum")

    def test_provider_registry_blocks_unknown_and_marks_restricted_config(self) -> None:
        self.assertEqual(require_provider_card("rss")["promotionMode"], "auto_or_manual")
        self.assertTrue(provider_supports_signal_mode("reddit", "hidden"))
        self.assertTrue(provider_allows_promotion("website"))
        self.assertFalse(provider_allows_promotion("reddit"))
        self.assertTrue(provider_requires_config("youtube"))
        self.assertLess(provider_compliance_score("meta_content_library", "manual_promote"), 0.5)
        self.assertGreaterEqual(provider_compliance_score("meta_content_library", "monitor"), 0.5)

    def test_endpoint_total_score_uses_resilient_weights(self) -> None:
        score = compute_endpoint_total_score(
            {
                "interest_fit_score": 1,
                "evidence_score": 1,
                "quality_score": 1,
                "yield_score": 1,
                "freshness_score": 1,
                "extraction_ready_score": 1,
                "coverage_gap_score": 1,
                "compliance_score": 1,
                "adversarial_confidence_score": 1,
            }
        )
        self.assertEqual(score, 1.0)
        self.assertEqual(coverage_gap_score("missing"), 1.0)
        self.assertEqual(coverage_gap_score("weak"), 0.75)
        self.assertEqual(coverage_gap_score("saturated"), 0.1)

    def test_hidden_signal_and_adversarial_scores_penalize_risk(self) -> None:
        hidden = compute_hidden_signal_confidence(
            {
                "need_score": 0.9,
                "evidence_count_score": 0.8,
                "independent_source_score": 0.8,
                "unique_author_score": 0.8,
                "burst_score": 0.7,
                "novelty_score": 0.7,
                "cross_provider_score": 0.6,
                "spam_risk": 0.9,
                "campaign_risk": 0.8,
            }
        )
        self.assertLess(hidden, 0.6)

        adversarial = compute_adversarial_confidence(
            {
                "explorer_confidence": 0.8,
                "max_critique_severity": 0.2,
                "repair_quality_score": 0.7,
                "evidence_alignment_score": 0.9,
            }
        )
        self.assertGreater(adversarial, 0.75)

    def test_action_policy_promotes_only_evidence_bounded_rss(self) -> None:
        action, reason = decide_action(
            {
                "provider_id": "rss",
                "provider_type": "rss",
                "signal_mode": "direct",
                "total_score": 0.91,
                "evidence_score": 0.82,
                "extraction_ready_score": 0.95,
                "compliance_score": 0.98,
                "novelty_score": 1.0,
                "valid_feed": True,
                "sample_entries": 4,
            }
        )
        self.assertEqual((action, reason), ("auto_promote", "strong_rss_evidence"))

    def test_action_policy_treats_missing_novelty_as_new_candidate(self) -> None:
        action, reason = decide_action(
            {
                "provider_id": "website",
                "provider_type": "website",
                "signal_mode": "direct",
                "total_score": 0.60,
                "evidence_score": 0.50,
                "extraction_ready_score": 0.45,
                "compliance_score": 0.95,
            }
        )
        self.assertEqual((action, reason), ("review", "medium_website_candidate"))

    def test_action_policy_never_promotes_hidden_or_social_by_default(self) -> None:
        hidden_action, _ = decide_action(
            {
                "provider_id": "rss",
                "provider_type": "rss",
                "signal_mode": "hidden",
                "total_score": 0.95,
                "evidence_score": 0.95,
                "extraction_ready_score": 1.0,
                "compliance_score": 1.0,
                "novelty_score": 1.0,
                "valid_feed": True,
                "sample_entries": 10,
            }
        )
        self.assertEqual(hidden_action, "monitor")

        social_action, social_reason = decide_action(
            {
                "provider_id": "reddit",
                "provider_type": "forum",
                "signal_mode": "direct",
                "total_score": 0.95,
                "evidence_score": 0.95,
                "extraction_ready_score": 1.0,
                "compliance_score": 1.0,
                "novelty_score": 1.0,
            }
        )
        self.assertEqual((social_action, social_reason), ("monitor", "social_or_video_provider_monitor_only"))

    def test_action_policy_routes_api_to_needs_config(self) -> None:
        action, reason = decide_action(
            {
                "provider_id": "custom_api",
                "provider_type": "api",
                "signal_mode": "direct",
                "total_score": 0.75,
                "evidence_score": 0.7,
                "extraction_ready_score": 0.4,
                "compliance_score": 0.8,
                "novelty_score": 1.0,
            }
        )
        self.assertEqual((action, reason), ("needs_config", "api_requires_operator_config"))


if __name__ == "__main__":
    unittest.main()

import unittest

from services.workers.app.rare_signal_source_prior import build_rare_signal_source_prior


class RareSignalSourcePriorTests(unittest.TestCase):
    def test_high_prior_extends_observation_without_selection_impact(self) -> None:
        prior = build_rare_signal_source_prior(
            target={"policy_json": {}},
            mission_graph={
                "sourceRoleTargets": {
                    "procurement_signal": {"target": 5},
                    "community_early_signal": {"target": 3},
                }
            },
            candidate={
                "title": "Regional procurement opportunities feed",
                "url": "https://example.gov/procurement/rss",
                "provider_type": "rss",
                "endpoint_kind": "procurement",
                "source_role": "procurement_signal",
                "relevance_score": 0.82,
            },
            profile={"trust_score": 0.62},
            source_score={
                "fit_score": 0.72,
                "contextual_score": 0.70,
                "final_review_score": 0.71,
                "role_labels": ["early_signal", "primary_source"],
            },
            channel_metrics={
                "fetch_health_score": 0.84,
                "successful_fetch_runs_period": 2,
                "total_articles_period": 20,
                "fetch_runs_period": 2,
            },
            negative_evidence=[],
        )

        self.assertEqual(prior["tier"], "high")
        self.assertEqual(prior["priorState"], "rare_signal_probation")
        self.assertEqual(prior["observationBudget"]["windowDays"], 30)
        self.assertEqual(prior["coverageContribution"], 0.0)
        self.assertEqual(prior["downstreamWeight"], 0.0)
        self.assertFalse(prior["selectionGuardrails"]["priorCanSelectArticle"])
        self.assertFalse(prior["selectionGuardrails"]["priorCanRankArticle"])
        self.assertFalse(prior["selectionGuardrails"]["priorCanEscalateArticle"])
        self.assertTrue(prior["selectionGuardrails"]["articleFromSourceSelectionEligible"])
        self.assertEqual(prior["selectionGuardrails"]["selectedContentImpact"], "none_from_prior")

    def test_medium_prior_is_monitor_only(self) -> None:
        prior = build_rare_signal_source_prior(
            target={"policy_json": {}},
            mission_graph={"sourceRoleTargets": {"industry_niche": {"target": 5}}},
            candidate={
                "provider_type": "website",
                "endpoint_kind": "rss_feed",
                "source_role": "industry_niche",
                "relevance_score": 0.58,
            },
            profile={"trust_score": 0.40},
            source_score={
                "fit_score": 0.56,
                "contextual_score": 0.55,
                "final_review_score": 0.55,
                "role_labels": ["niche_specialist"],
            },
            channel_metrics={"fetch_health_score": 0.40},
            negative_evidence=[],
        )

        self.assertEqual(prior["tier"], "medium")
        self.assertEqual(prior["priorState"], "monitor_only")
        self.assertEqual(prior["observationBudget"]["minObservedItems"], 100)
        self.assertEqual(prior["explorationContribution"], 0.15)

    def test_severe_negative_evidence_blocks_probation(self) -> None:
        prior = build_rare_signal_source_prior(
            target={"policy_json": {}},
            mission_graph={"sourceRoleTargets": {"procurement_signal": {"target": 5}}},
            candidate={
                "provider_type": "rss",
                "endpoint_kind": "procurement",
                "source_role": "procurement_signal",
                "relevance_score": 0.90,
            },
            profile={"trust_score": 0.80},
            source_score={
                "fit_score": 0.90,
                "contextual_score": 0.88,
                "final_review_score": 0.87,
                "role_labels": ["early_signal"],
            },
            channel_metrics={"fetch_health_score": 0.90},
            negative_evidence=[
                {
                    "negative_evidence_id": "neg-1",
                    "failure_mode": "blocked_domain",
                    "severity": 0.91,
                }
            ],
        )

        self.assertEqual(prior["tier"], "blocked")
        self.assertEqual(prior["priorState"], "negative_evidence_review")
        self.assertEqual(prior["negativeEvidence"]["severeCount"], 1)
        self.assertEqual(prior["explorationContribution"], 0.0)

    def test_provider_errors_do_not_poison_source_prior(self) -> None:
        prior = build_rare_signal_source_prior(
            target={"policy_json": {}},
            mission_graph={"sourceRoleTargets": {"procurement_signal": {"target": 5}}},
            candidate={
                "provider_type": "rss",
                "endpoint_kind": "procurement",
                "source_role": "procurement_signal",
                "relevance_score": 0.80,
            },
            profile={"trust_score": 0.60},
            source_score={
                "fit_score": 0.72,
                "contextual_score": 0.70,
                "final_review_score": 0.70,
                "role_labels": ["early_signal"],
            },
            channel_metrics={"fetch_health_score": 0.70},
            negative_evidence=[
                {
                    "negative_evidence_id": "neg-2",
                    "failure_mode": "rate_limited",
                    "severity": 0.95,
                }
            ],
        )

        self.assertEqual(prior["tier"], "high")
        self.assertEqual(prior["negativeEvidence"]["severeCount"], 0)


if __name__ == "__main__":
    unittest.main()

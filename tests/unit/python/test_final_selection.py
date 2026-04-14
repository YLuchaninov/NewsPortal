import unittest

from services.workers.app.final_selection import (
    apply_document_candidate_signal_uplift,
    summarize_final_selection_result,
)


class FinalSelectionLogicTests(unittest.TestCase):
    def test_marks_pass_through_articles_as_selected_when_no_system_filters_exist(self) -> None:
        summary = summarize_final_selection_result(
            total_filter_count=0,
            matched_filter_count=0,
            no_match_filter_count=0,
            gray_zone_filter_count=0,
            llm_review_pending_filter_count=0,
            hold_filter_count=0,
            technical_filtered_out_count=0,
            verification_state="weak",
        )

        self.assertEqual(summary["decision"], "selected")
        self.assertTrue(summary["isSelected"])
        self.assertEqual(summary["compatSystemFeedDecision"], "pass_through")

    def test_marks_semantic_gray_zone_as_non_selected_pending_projection(self) -> None:
        summary = summarize_final_selection_result(
            total_filter_count=2,
            matched_filter_count=1,
            no_match_filter_count=0,
            gray_zone_filter_count=1,
            llm_review_pending_filter_count=1,
            hold_filter_count=0,
            technical_filtered_out_count=0,
            verification_state="medium",
        )

        self.assertEqual(summary["decision"], "gray_zone")
        self.assertFalse(summary["isSelected"])
        self.assertEqual(summary["compatSystemFeedDecision"], "pending_llm")

    def test_marks_profile_hold_gray_zone_as_filtered_out_compatibility(self) -> None:
        summary = summarize_final_selection_result(
            total_filter_count=2,
            matched_filter_count=1,
            no_match_filter_count=0,
            gray_zone_filter_count=1,
            llm_review_pending_filter_count=0,
            hold_filter_count=1,
            technical_filtered_out_count=0,
            verification_state="medium",
        )

        self.assertEqual(summary["decision"], "gray_zone")
        self.assertFalse(summary["isSelected"])
        self.assertEqual(summary["compatSystemFeedDecision"], "filtered_out")
        self.assertEqual(summary["selectionReason"], "semantic_hold")

    def test_marks_conflicting_verification_as_gray_zone_even_with_match(self) -> None:
        summary = summarize_final_selection_result(
            total_filter_count=1,
            matched_filter_count=1,
            no_match_filter_count=0,
            gray_zone_filter_count=0,
            llm_review_pending_filter_count=0,
            hold_filter_count=0,
            technical_filtered_out_count=0,
            verification_state="conflicting",
        )

        self.assertEqual(summary["decision"], "gray_zone")
        self.assertFalse(summary["isSelected"])
        self.assertEqual(summary["compatSystemFeedDecision"], "filtered_out")

    def test_marks_unmatched_articles_as_rejected(self) -> None:
        summary = summarize_final_selection_result(
            total_filter_count=3,
            matched_filter_count=0,
            no_match_filter_count=2,
            gray_zone_filter_count=0,
            llm_review_pending_filter_count=0,
            hold_filter_count=0,
            technical_filtered_out_count=1,
            verification_state="weak",
        )

        self.assertEqual(summary["decision"], "rejected")
        self.assertFalse(summary["isSelected"])
        self.assertEqual(summary["compatSystemFeedDecision"], "filtered_out")

    def test_marks_candidate_signal_gray_zone_reason_when_uplifted_rows_exist(self) -> None:
        summary = summarize_final_selection_result(
            total_filter_count=3,
            matched_filter_count=0,
            no_match_filter_count=2,
            gray_zone_filter_count=1,
            llm_review_pending_filter_count=1,
            hold_filter_count=0,
            technical_filtered_out_count=0,
            verification_state="weak",
            candidate_signal_uplift_count=1,
        )

        self.assertEqual(summary["decision"], "gray_zone")
        self.assertEqual(summary["selectionReason"], "candidate_signal_gray_zone")
        self.assertEqual(
            summary["explain_json"]["candidateSignalUpliftCount"],
            1,
        )

    def test_candidate_signal_uplift_promotes_near_threshold_request_to_gray_zone(self) -> None:
        decision, explain = apply_document_candidate_signal_uplift(
            title="Looking for an ERP implementation partner",
            lead="Migration support needed for an enterprise platform replacement.",
            body="",
            score_final=0.445,
            positive_score=0.28,
            lexical_score=0.23,
            canonical_document_id=None,
            story_cluster_id=None,
            verification_state="medium",
            base_decision="irrelevant",
        )

        self.assertEqual(decision, "gray_zone")
        self.assertIsNotNone(explain)
        self.assertTrue(explain["upliftedToGrayZone"])
        self.assertEqual(explain["upliftPath"], "document_only")
        self.assertGreaterEqual(explain["positiveSignalCount"], 2)

    def test_candidate_signal_uplift_promotes_story_cluster_backed_candidate_to_gray_zone(self) -> None:
        decision, explain = apply_document_candidate_signal_uplift(
            title="ERP implementation roadmap",
            lead="Migration plan for an enterprise stack.",
            body="",
            score_final=0.405,
            positive_score=0.27,
            lexical_score=0.21,
            canonical_document_id=None,
            story_cluster_id="cluster-1",
            verification_state="medium",
            base_decision="irrelevant",
        )

        self.assertEqual(decision, "gray_zone")
        self.assertIsNotNone(explain)
        self.assertTrue(explain["upliftedToGrayZone"])
        self.assertTrue(explain["contextBackedUplift"])
        self.assertEqual(explain["upliftPath"], "context_backed")
        self.assertEqual(
            explain["reason"],
            "context_backed_candidate_signal_uplift",
        )

    def test_candidate_signal_uplift_requires_stronger_context_than_canonical_only_medium(self) -> None:
        decision, explain = apply_document_candidate_signal_uplift(
            title="ERP implementation roadmap",
            lead="Migration plan for an enterprise stack.",
            body="",
            score_final=0.405,
            positive_score=0.27,
            lexical_score=0.21,
            canonical_document_id="canonical-1",
            story_cluster_id=None,
            verification_state="medium",
            base_decision="irrelevant",
        )

        self.assertEqual(decision, "irrelevant")
        self.assertIsNotNone(explain)
        self.assertFalse(explain["upliftedToGrayZone"])
        self.assertFalse(explain["contextBackedUplift"])

    def test_candidate_signal_uplift_promotes_multi_group_canonical_medium_candidate(self) -> None:
        decision, explain = apply_document_candidate_signal_uplift(
            title="ERP implementation partner sees rising demand",
            lead="Migration partner demand is growing across enterprise replacements.",
            body="",
            score_final=0.29,
            positive_score=0.0,
            lexical_score=0.91,
            canonical_document_id="canonical-1",
            story_cluster_id=None,
            verification_state="medium",
            base_decision="irrelevant",
        )

        self.assertEqual(decision, "gray_zone")
        self.assertIsNotNone(explain)
        self.assertTrue(explain["upliftedToGrayZone"])
        self.assertTrue(explain["contextBackedUplift"])
        self.assertGreaterEqual(explain["positiveSignalCount"], 2)

    def test_candidate_signal_uplift_rejects_marketplace_partner_noise(self) -> None:
        decision, explain = apply_document_candidate_signal_uplift(
            title="Operations Partner for IT Agency",
            lead="Content Writing & SEO Projects for $15-25 USD / hour. Open posted 7 minutes ago.",
            body="Ends in 6 days with freelancer-style proposals.",
            score_final=0.33,
            positive_score=0.0,
            lexical_score=0.96,
            canonical_document_id="canonical-1",
            story_cluster_id=None,
            verification_state="weak",
            base_decision="irrelevant",
        )

        self.assertEqual(decision, "irrelevant")
        self.assertIsNotNone(explain)
        self.assertFalse(explain["upliftedToGrayZone"])
        self.assertGreaterEqual(explain["noiseSignalCount"], 1)

    def test_candidate_signal_uplift_ignores_near_threshold_noise_request(self) -> None:
        decision, explain = apply_document_candidate_signal_uplift(
            title="Looking for contributors on an open source project",
            lead="Seeking feedback from collaborators and testers.",
            body="",
            score_final=0.445,
            positive_score=0.28,
            lexical_score=0.21,
            canonical_document_id=None,
            story_cluster_id=None,
            verification_state="medium",
            base_decision="irrelevant",
        )

        self.assertEqual(decision, "irrelevant")
        self.assertIsNotNone(explain)
        self.assertFalse(explain["upliftedToGrayZone"])
        self.assertGreaterEqual(explain["noiseSignalCount"], 1)

    def test_candidate_signal_uplift_does_not_treat_vendor_words_as_generic_runtime_truth(self) -> None:
        decision, explain = apply_document_candidate_signal_uplift(
            title="Trusted implementation partner for enterprise delivery",
            lead="Your external consultant for software modernization.",
            body="",
            score_final=0.445,
            positive_score=0.28,
            lexical_score=0.21,
            canonical_document_id=None,
            story_cluster_id=None,
            verification_state="medium",
            base_decision="irrelevant",
        )

        self.assertEqual(decision, "irrelevant")
        self.assertIsNotNone(explain)
        self.assertEqual(explain["signalSource"], "generic_fallback")
        self.assertFalse(explain["upliftedToGrayZone"])

    def test_candidate_signal_uplift_supports_profile_defined_vendor_cues(self) -> None:
        decision, explain = apply_document_candidate_signal_uplift(
            title="Trusted implementation partner for enterprise delivery",
            lead="Looking for an implementation partner for a migration programme.",
            body="Need an outside systems integrator to support the rollout.",
            score_final=0.445,
            positive_score=0.28,
            lexical_score=0.21,
            canonical_document_id=None,
            story_cluster_id=None,
            verification_state="medium",
            base_decision="irrelevant",
            candidate_signal_config={
                "positiveGroups": [
                    {
                        "name": "external_delivery",
                        "cues": ["implementation partner", "systems integrator"],
                    },
                    {
                        "name": "request_search",
                        "cues": ["looking for", "need an outside"],
                    },
                ],
                "negativeGroups": [],
            },
        )

        self.assertEqual(decision, "gray_zone")
        self.assertIsNotNone(explain)
        self.assertEqual(explain["signalSource"], "selection_profile_definition")
        self.assertTrue(explain["upliftedToGrayZone"])

    def test_candidate_signal_uplift_does_not_treat_top_vendor_listicles_as_generic_positive_signal(self) -> None:
        decision, explain = apply_document_candidate_signal_uplift(
            title="Top 10 implementation partners in 2026",
            lead="Our picks and options worth your time.",
            body="Comparison article for market awareness.",
            score_final=0.44,
            positive_score=0.28,
            lexical_score=0.21,
            canonical_document_id=None,
            story_cluster_id=None,
            verification_state="medium",
            base_decision="irrelevant",
        )

        self.assertEqual(decision, "irrelevant")
        self.assertIsNotNone(explain)
        self.assertEqual(explain["signalSource"], "generic_fallback")
        self.assertLessEqual(explain["positiveSignalCount"], 1)
        self.assertFalse(explain["upliftedToGrayZone"])



if __name__ == "__main__":
    unittest.main()

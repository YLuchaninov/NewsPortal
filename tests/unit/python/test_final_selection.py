import unittest

from services.workers.app.final_selection import (
    apply_document_candidate_signal_uplift,
    summarize_final_selection_result,
)


class FinalSelectionLogicTests(unittest.TestCase):
    def test_rejects_signal_candidates_when_no_system_filters_exist(self) -> None:
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

        self.assertEqual(summary["decision"], "rejected")
        self.assertFalse(summary["isSelected"])
        self.assertEqual(summary["compatSystemFeedDecision"], "filtered_out")
        self.assertEqual(summary["selectionReason"], "missing_interest_filter_results")

    def test_marks_semantic_gray_zone_as_non_selected_pending_projection(self) -> None:
        summary = summarize_final_selection_result(
            total_filter_count=2,
            matched_filter_count=0,
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
            matched_filter_count=0,
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

    def test_match_selects_when_item_level_project_evidence_is_present(self) -> None:
        summary = summarize_final_selection_result(
            total_filter_count=3,
            matched_filter_count=1,
            no_match_filter_count=1,
            gray_zone_filter_count=1,
            llm_review_pending_filter_count=1,
            hold_filter_count=0,
            technical_filtered_out_count=0,
            verification_state="medium",
            candidate_signal_eligible_count=1,
            candidate_signal_strong_match_count=1,
            candidate_signal_tier="project_intent",
            candidate_signal_tier_counts={"project_intent": 1},
        )

        self.assertEqual(summary["decision"], "selected")
        self.assertTrue(summary["isSelected"])
        self.assertEqual(summary["compatSystemFeedDecision"], "eligible")
        self.assertEqual(summary["selectionReason"], "item_level_semantic_match")

    def test_match_with_weak_candidate_evidence_stays_hold(self) -> None:
        summary = summarize_final_selection_result(
            total_filter_count=3,
            matched_filter_count=1,
            no_match_filter_count=1,
            gray_zone_filter_count=1,
            llm_review_pending_filter_count=0,
            hold_filter_count=0,
            technical_filtered_out_count=0,
            verification_state="medium",
            candidate_signal_eligible_count=1,
            candidate_signal_tier="project_intent",
            candidate_signal_tier_counts={"project_intent": 1},
        )

        self.assertEqual(summary["decision"], "gray_zone")
        self.assertFalse(summary["isSelected"])
        self.assertEqual(summary["selectionReason"], "item_level_evidence_required")

    def test_match_without_item_level_evidence_stays_hold(self) -> None:
        summary = summarize_final_selection_result(
            total_filter_count=3,
            matched_filter_count=1,
            no_match_filter_count=1,
            gray_zone_filter_count=1,
            llm_review_pending_filter_count=0,
            hold_filter_count=0,
            technical_filtered_out_count=0,
            verification_state="medium",
        )

        self.assertEqual(summary["decision"], "gray_zone")
        self.assertFalse(summary["isSelected"])
        self.assertEqual(summary["compatSystemFeedDecision"], "filtered_out")
        self.assertEqual(summary["selectionReason"], "item_level_evidence_required")
        self.assertEqual(
            summary["explain_json"]["downstreamLossBucket"],
            "context_candidate_not_selected",
        )

    def test_document_level_wrapper_noise_vetoes_matches(self) -> None:
        summary = summarize_final_selection_result(
            total_filter_count=3,
            matched_filter_count=2,
            no_match_filter_count=0,
            gray_zone_filter_count=0,
            llm_review_pending_filter_count=0,
            hold_filter_count=0,
            technical_filtered_out_count=1,
            verification_state="weak",
            filter_reason_counts={"wrapper_directory_noise": 3},
        )

        self.assertEqual(summary["decision"], "rejected")
        self.assertFalse(summary["isSelected"])

    def test_document_level_repo_internal_noise_vetoes_candidate_matches(self) -> None:
        summary = summarize_final_selection_result(
            total_filter_count=3,
            matched_filter_count=1,
            no_match_filter_count=2,
            gray_zone_filter_count=0,
            llm_review_pending_filter_count=0,
            hold_filter_count=0,
            technical_filtered_out_count=0,
            verification_state="weak",
            candidate_signal_eligible_count=1,
            candidate_signal_strong_match_count=1,
            candidate_signal_tier="project_intent",
            candidate_signal_tier_counts={"project_intent": 1},
            filter_reason_counts={"repo_internal_change_noise": 3},
        )

        self.assertEqual(summary["decision"], "rejected")
        self.assertFalse(summary["isSelected"])
        self.assertEqual(summary["selectionReason"], "document_level_technical_filter")
        self.assertEqual(summary["compatSystemFeedDecision"], "filtered_out")
        self.assertEqual(summary["selectionReason"], "document_level_technical_filter")
        self.assertEqual(
            summary["explain_json"]["selectionBlockerStage"],
            "technical_filter",
        )

    def test_candidate_signal_uplift_ignores_generic_advice_titles(self) -> None:
        decision, explain = apply_document_candidate_signal_uplift(
            title="How to hire dedicated Node.js developers for your team",
            lead="This guide explains vendor selection and developer costs.",
            body=(
                "Looking for developer help, integration, migration, budget, "
                "timeline, contractor, agency, consultant."
            ),
            score_final=0.1,
            positive_score=0.1,
            lexical_score=0.1,
            canonical_document_id="doc-1",
            story_cluster_id="cluster-1",
            verification_state="weak",
            base_decision="irrelevant",
            candidate_signal_config={
                "positiveGroups": [
                    {"name": "buyer_ask", "terms": ["looking for", "help"]},
                    {"name": "project_object", "terms": ["developer", "integration"]},
                    {"name": "deliverable_scope", "terms": ["migration"]},
                    {"name": "budget_timeline", "terms": ["budget", "timeline"]},
                    {"name": "vendor_partner", "terms": ["contractor", "agency"]},
                ],
                "negativeGroups": [],
            },
        )

        self.assertEqual(decision, "irrelevant")
        self.assertIsNotNone(explain)
        self.assertTrue(explain["genericAdviceNoise"])
        self.assertFalse(explain["upliftedToGrayZone"])

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

    def test_marks_unmatched_signal_candidates_as_rejected(self) -> None:
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

    def test_configured_candidate_signal_profiles_keep_zero_hit_explain(self) -> None:
        decision, explain = apply_document_candidate_signal_uplift(
            title="General AI update",
            lead="A broad update without buyer evidence.",
            body="No configured cue is present.",
            score_final=0.9,
            positive_score=0.8,
            lexical_score=0.8,
            canonical_document_id=None,
            story_cluster_id=None,
            verification_state="weak",
            base_decision="relevant",
            candidate_signal_config={
                "positiveGroups": [
                    {"name": "buyer", "cues": ["procurement buyer"]},
                    {"name": "project", "cues": ["contract award"]},
                ],
                "negativeGroups": [],
            },
        )

        self.assertEqual(decision, "relevant")
        self.assertIsNotNone(explain)
        assert explain is not None
        self.assertEqual(explain["signalSource"], "selection_profile_definition")
        self.assertEqual(explain["positiveSignalCount"], 0)

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

    def test_strong_gray_zone_consensus_without_item_level_signal_stays_hold(self) -> None:
        summary = summarize_final_selection_result(
            total_filter_count=5,
            matched_filter_count=0,
            no_match_filter_count=1,
            gray_zone_filter_count=4,
            llm_review_pending_filter_count=0,
            hold_filter_count=4,
            technical_filtered_out_count=0,
            verification_state="weak",
        )

        self.assertEqual(summary["decision"], "gray_zone")
        self.assertFalse(summary["isSelected"])
        self.assertEqual(summary["selectionReason"], "semantic_hold")
        self.assertEqual(summary["compatSystemFeedDecision"], "filtered_out")
        self.assertEqual(
            summary["explain_json"]["downstreamLossBucket"],
            "gray_zone_hold",
        )

    def test_promotes_project_intent_gray_zone_consensus_to_selected(self) -> None:
        summary = summarize_final_selection_result(
            total_filter_count=5,
            matched_filter_count=0,
            no_match_filter_count=1,
            gray_zone_filter_count=4,
            llm_review_pending_filter_count=0,
            hold_filter_count=4,
            technical_filtered_out_count=0,
            verification_state="weak",
            candidate_signal_uplift_count=1,
            candidate_signal_tier="project_intent",
            candidate_signal_tier_counts={"project_intent": 1},
        )

        self.assertEqual(summary["decision"], "selected")
        self.assertTrue(summary["isSelected"])
        self.assertEqual(summary["selectionReason"], "strong_gray_zone_consensus")
        self.assertEqual(
            summary["explain_json"]["downstreamLossBucket"],
            "selected_useful_evidence_present",
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
            body="Ends in 6 days with marketplace-style proposals.",
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
        self.assertEqual(explain["candidateSignalTier"], "project_intent")

    def test_candidate_signal_evidence_led_uplift_supports_short_project_listing(self) -> None:
        decision, explain = apply_document_candidate_signal_uplift(
            title="Build custom integration between CRM and accounting system",
            lead=(
                "We are looking for an API integration developer to connect our CRM "
                "with accounting software. Fixed-price project with timeline and budget."
            ),
            body="",
            score_final=0.24,
            positive_score=0.16,
            lexical_score=0.18,
            canonical_document_id="canonical-1",
            story_cluster_id=None,
            verification_state="weak",
            base_decision="irrelevant",
            candidate_signal_config={
                "positiveGroups": [
                    {
                        "name": "buyer_ask",
                        "cues": ["we are looking for", "developer"],
                    },
                    {
                        "name": "project_object",
                        "cues": ["api integration", "connect", "crm"],
                    },
                    {
                        "name": "delivery_scope",
                        "cues": ["fixed-price project", "timeline", "budget"],
                    },
                ],
                "negativeGroups": [
                    {
                        "name": "seller_authored",
                        "cues": ["our services", "available for hire"],
                    }
                ],
            },
        )

        self.assertEqual(decision, "gray_zone")
        self.assertIsNotNone(explain)
        assert explain is not None
        self.assertTrue(explain["upliftedToGrayZone"])
        self.assertTrue(explain["evidenceLedUplift"])
        self.assertEqual(explain["upliftPath"], "evidence_led")
        self.assertEqual(explain["candidateSignalTier"], "project_intent")

    def test_candidate_signal_evidence_led_uplift_requires_no_noise(self) -> None:
        decision, explain = apply_document_candidate_signal_uplift(
            title="Top CRM integrations guide for agencies",
            lead=(
                "We are looking at API integration options to connect CRM and accounting "
                "software. This guide compares fixed-price project examples and budgets."
            ),
            body="",
            score_final=0.24,
            positive_score=0.16,
            lexical_score=0.18,
            canonical_document_id="canonical-1",
            story_cluster_id=None,
            verification_state="weak",
            base_decision="irrelevant",
            candidate_signal_config={
                "positiveGroups": [
                    {
                        "name": "buyer_ask",
                        "cues": ["we are looking", "integration"],
                    },
                    {
                        "name": "project_object",
                        "cues": ["api integration", "connect", "crm"],
                    },
                    {
                        "name": "delivery_scope",
                        "cues": ["fixed-price project", "budget"],
                    },
                ],
                "negativeGroups": [
                    {
                        "name": "generic_advice",
                        "cues": ["guide", "compares"],
                    }
                ],
            },
        )

        self.assertEqual(decision, "irrelevant")
        self.assertIsNotNone(explain)
        assert explain is not None
        self.assertFalse(explain["upliftedToGrayZone"])
        self.assertFalse(explain["evidenceLedUplift"])
        self.assertGreaterEqual(explain["noiseSignalCount"], 1)

    def test_context_only_candidate_signal_does_not_uplift_to_gray_zone(self) -> None:
        decision, explain = apply_document_candidate_signal_uplift(
            title="Small business growth budget update",
            lead="A nearby context signal_candidate with no buyer ask or project scope.",
            body="The signal_candidate mentions business growth and local apps in general.",
            score_final=0.445,
            positive_score=0.28,
            lexical_score=0.21,
            canonical_document_id="canonical-1",
            story_cluster_id="cluster-1",
            verification_state="medium",
            base_decision="irrelevant",
            candidate_signal_config={
                "positiveGroups": [
                    {
                        "name": "business_context",
                        "tier": "context",
                        "cues": ["small business", "growth", "apps"],
                    }
                ],
                "negativeGroups": [],
            },
        )

        self.assertEqual(decision, "irrelevant")
        self.assertIsNotNone(explain)
        assert explain is not None
        self.assertEqual(explain["candidateSignalTier"], "context")
        self.assertTrue(explain["contextOnly"])
        self.assertFalse(explain["candidateSelectionEligible"])
        self.assertFalse(explain["upliftedToGrayZone"])

    def test_project_intent_candidate_hold_gets_specific_residual_bucket(self) -> None:
        summary = summarize_final_selection_result(
            total_filter_count=3,
            matched_filter_count=0,
            no_match_filter_count=2,
            gray_zone_filter_count=1,
            llm_review_pending_filter_count=0,
            hold_filter_count=1,
            technical_filtered_out_count=0,
            verification_state="medium",
            candidate_signal_uplift_count=1,
            candidate_signal_tier="project_intent",
            candidate_signal_tier_counts={"project_intent": 1},
        )

        self.assertEqual(summary["selectionReason"], "candidate_signal_hold")
        self.assertEqual(summary["explain_json"]["downstreamLossBucket"], "project_intent_hold")
        self.assertEqual(
            summary["explain_json"]["semanticSignalSummary"]["candidateSignalTier"],
            "project_intent",
        )

    def test_strong_item_level_project_candidate_signal_selects_without_semantic_match(self) -> None:
        summary = summarize_final_selection_result(
            total_filter_count=15,
            matched_filter_count=0,
            no_match_filter_count=13,
            gray_zone_filter_count=2,
            llm_review_pending_filter_count=0,
            hold_filter_count=2,
            technical_filtered_out_count=0,
            verification_state="medium",
            candidate_signal_uplift_count=2,
            candidate_signal_eligible_count=4,
            candidate_signal_tier="project_intent",
            candidate_signal_tier_counts={"project_intent": 4},
        )

        self.assertEqual(summary["decision"], "selected")
        self.assertTrue(summary["isSelected"])
        self.assertEqual(summary["compatSystemFeedDecision"], "eligible")
        self.assertEqual(summary["selectionReason"], "strong_item_level_candidate_signal")

    def test_candidate_signal_consensus_still_respects_document_level_veto(self) -> None:
        summary = summarize_final_selection_result(
            total_filter_count=13,
            matched_filter_count=0,
            no_match_filter_count=0,
            gray_zone_filter_count=2,
            llm_review_pending_filter_count=0,
            hold_filter_count=2,
            technical_filtered_out_count=13,
            verification_state="medium",
            candidate_signal_uplift_count=2,
            candidate_signal_eligible_count=4,
            candidate_signal_tier="project_intent",
            candidate_signal_tier_counts={"project_intent": 4},
            filter_reason_counts={"wrapper_directory_noise": 13},
        )

        self.assertEqual(summary["decision"], "rejected")
        self.assertFalse(summary["isSelected"])
        self.assertEqual(summary["selectionReason"], "document_level_technical_filter")

    def test_candidate_signal_uplift_does_not_treat_top_vendor_listicles_as_generic_positive_signal(self) -> None:
        decision, explain = apply_document_candidate_signal_uplift(
            title="Top 10 implementation partners in 2026",
            lead="Our picks and options worth your time.",
            body="Comparison signal_candidate for market awareness.",
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

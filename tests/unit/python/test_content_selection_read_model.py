import unittest

from tests.unit.python.support.stubs import install_psycopg_stub

install_psycopg_stub()

from services.api.app import content_selection_read_model as read_model


class ContentSelectionReadModelTests(unittest.TestCase):
    def test_signal_candidate_selection_payload_prefers_final_selection_truth(self) -> None:
        payload = read_model.apply_signal_candidate_selection_payload(
            {
                "doc_id": "00000000-0000-4000-8000-000000000001",
                "final_selection_decision": "selected",
                "final_selection_selected": True,
                "final_selection_reason": "semantic_match",
                "final_selection_hold_count": 0,
                "final_selection_llm_review_pending_count": 0,
                "final_selection_canonical_review_reused": True,
                "final_selection_canonical_review_reused_count": 2,
                "final_selection_duplicate_signal_candidate_count_for_canonical": 4,
                "final_selection_reuse_source": "canonical_reused",
                "system_feed_decision": "filtered_out",
                "system_feed_eligible": False,
            },
            interest_filter_results=[
                {
                    "filter_scope": "system_criterion",
                    "semantic_decision": "match",
                    "technical_filter_state": "passed",
                }
            ],
            llm_reviews=[],
            notifications=[{"notification_id": "notification-1"}],
        )

        self.assertEqual(payload["selection_source"], "final_selection_results")
        self.assertEqual(payload["selection_decision"], "selected")
        self.assertEqual(payload["selection_mode"], "selected")
        self.assertEqual(payload["selection_summary"], "Selected by final-selection policy")
        self.assertEqual(payload["selection_guidance"]["tone"], "positive")
        self.assertEqual(payload["selection_canonical_review_reused"], True)
        self.assertEqual(payload["selection_canonical_review_reused_count"], 2)
        self.assertEqual(payload["selection_duplicate_signal_candidate_count_for_canonical"], 4)
        self.assertEqual(payload["selection_reuse_source"], "canonical_reused")
        diagnostics = payload["selection_diagnostics"]
        self.assertEqual(diagnostics["source"], "final_selection_results")
        self.assertEqual(diagnostics["selectionMode"], "selected")
        self.assertEqual(diagnostics["systemCriterionRows"], 1)
        self.assertEqual(diagnostics["matchedRows"], 1)
        self.assertEqual(diagnostics["notificationRows"], 1)

    def test_fallback_blocker_and_guidance_payloads_keep_hold_shape(self) -> None:
        diagnostics = read_model.build_selection_diagnostics_payload_from_counts(
            selection_explain={
                "source": "final_selection_results",
                "decision": "gray_zone",
                "selectionMode": "hold",
                "selectionSummary": "Gray zone held by profile policy",
                "selectionReason": "semantic_hold",
                "holdCount": 1,
            },
            system_criterion_rows=2,
            user_interest_rows=0,
            matched_rows=0,
            no_match_rows=0,
            gray_zone_rows=1,
            technical_filtered_out_rows=0,
            llm_review_rows=0,
            notification_rows=0,
        )
        guidance = read_model.build_selection_guidance_payload(
            selection_explain={
                "source": "final_selection_results",
                "selectionMode": "hold",
                "candidateSignalUpliftCount": 0,
            }
        )

        self.assertEqual(diagnostics["downstreamLossBucket"], "gray_zone_hold")
        self.assertEqual(diagnostics["selectionBlockerStage"], "hold_policy")
        self.assertEqual(diagnostics["selectionBlockerReason"], "semantic_hold")
        self.assertEqual(diagnostics["holdReason"], "semantic_hold")
        self.assertEqual(diagnostics["grayZoneRows"], 1)
        self.assertEqual(guidance["tone"], "warning")

    def test_resource_selection_payload_and_content_item_ids_keep_public_shape(self) -> None:
        resource = read_model.apply_resource_selection_payload(
            {
                "resource_id": "00000000-0000-4000-8000-000000000002",
                "content_item_ready": True,
                "resource_kind": "document",
            },
            interest_filter_results=[],
            llm_reviews=[],
            notifications=[],
        )

        self.assertEqual(resource["selection_source"], "system_interest_content_kind")
        self.assertEqual(resource["selection_decision"], "kind_enabled")
        self.assertEqual(resource["selection_mode"], "selected")
        self.assertEqual(resource["selection_guidance"]["tone"], "positive")
        self.assertEqual(resource["selection_diagnostics"]["selectionMode"], "selected")

        content_item_id = read_model.build_content_item_id(
            "signal_candidate", "00000000-0000-4000-8000-000000000003"
        )
        self.assertEqual(
            read_model.parse_content_item_id(content_item_id),
            ("signal_candidate", "00000000-0000-4000-8000-000000000003"),
        )
        with self.assertRaises(read_model.HTTPException) as raised:
            read_model.parse_content_item_id("signal_candidate:not-a-uuid")
        self.assertEqual(raised.exception.status_code, 404)


if __name__ == "__main__":
    unittest.main()

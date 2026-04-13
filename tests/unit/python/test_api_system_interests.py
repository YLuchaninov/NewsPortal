import sys
import types
import unittest
from unittest.mock import patch

if "psycopg" not in sys.modules:
    psycopg_stub = types.ModuleType("psycopg")
    psycopg_stub.connect = lambda *args, **kwargs: None
    sys.modules["psycopg"] = psycopg_stub

if "psycopg.rows" not in sys.modules:
    psycopg_rows_stub = types.ModuleType("psycopg.rows")
    psycopg_rows_stub.dict_row = object()
    sys.modules["psycopg.rows"] = psycopg_rows_stub

if "psycopg.types" not in sys.modules:
    sys.modules["psycopg.types"] = types.ModuleType("psycopg.types")

if "psycopg.types.json" not in sys.modules:
    psycopg_types_json_stub = types.ModuleType("psycopg.types.json")
    psycopg_types_json_stub.Json = lambda value: value
    sys.modules["psycopg.types.json"] = psycopg_types_json_stub

from services.api.app import main as api_main


class ApiSystemInterestsTests(unittest.TestCase):
    def test_selection_explain_marks_recovered_candidate_waiting_for_review(self) -> None:
        payload = api_main.build_selection_explain_payload(
            selection_like={
                "final_selection_decision": "gray_zone",
                "system_feed_decision": "pending_llm",
            },
            final_selection_result={
                "explain_json": {
                    "selectionReason": "candidate_signal_gray_zone",
                    "filterCounts": {
                        "llmReviewPending": 1,
                        "hold": 0,
                    },
                    "candidateSignalUpliftCount": 1,
                }
            },
            system_feed_result={"decision": "pending_llm"},
        )

        self.assertEqual(payload["selectionMode"], "llm_review_pending")
        self.assertEqual(payload["selectionSummary"], "Recovered candidate waiting for LLM review")
        self.assertEqual(payload["candidateSignalUpliftCount"], 1)
        self.assertEqual(payload["candidateRecoveryState"], "review_pending")
        self.assertIn("waiting for LLM review", payload["candidateRecoverySummary"])

    def test_selection_explain_marks_absent_recovered_candidate_explicitly(self) -> None:
        payload = api_main.build_selection_explain_payload(
            selection_like={},
            final_selection_result=None,
            system_feed_result=None,
        )

        self.assertEqual(payload["candidateSignalUpliftCount"], 0)
        self.assertEqual(payload["candidateRecoveryState"], "absent")
        self.assertIn("have not materialized", payload["candidateRecoverySummary"])

    def test_selection_guidance_calls_out_recovered_candidate_hold(self) -> None:
        guidance = api_main.build_selection_guidance_payload(
            selection_explain={
                "selectionMode": "hold",
                "candidateSignalUpliftCount": 1,
            }
        )

        self.assertEqual(guidance["tone"], "warning")
        self.assertIn("recovered candidate", guidance["summary"])

    def test_list_system_interests_exposes_selection_profile_policy_fields(self) -> None:
        with (
            patch.object(api_main, "query_count", return_value=1) as query_count,
            patch.object(
                api_main,
                "query_all",
                return_value=[
                    {
                        "interest_template_id": "template-1",
                        "selection_profile_status": "active",
                        "selection_profile_family": "compatibility_interest_template",
                        "selection_profile_policy_json": {
                            "strictness": "balanced",
                            "unresolvedDecision": "hold",
                        },
                    }
                ],
            ) as query_all,
        ):
            result = api_main.list_system_interests(page=1, page_size=8)

        self.assertEqual(result["total"], 1)
        self.assertEqual(result["items"][0]["interest_template_id"], "template-1")
        self.assertEqual(
            result["items"][0]["selection_profile_policy_json"]["llmReviewMode"],
            "always",
        )
        items_sql = query_all.call_args.args[0]
        self.assertIn("left join selection_profiles sp", items_sql)
        self.assertIn("sp.selection_profile_id::text as selection_profile_id", items_sql)
        self.assertIn("sp.policy_json as selection_profile_policy_json", items_sql)
        count_sql = query_count.call_args.args[0]
        self.assertIn("from interest_templates it", count_sql)

    def test_get_system_interest_exposes_selection_profile_policy_fields(self) -> None:
        with patch.object(
            api_main,
            "query_one",
            return_value={
                "interest_template_id": "template-1",
                "selection_profile_id": "profile-1",
                "selection_profile_status": "active",
                "selection_profile_version": 3,
                "selection_profile_family": "compatibility_interest_template",
                "selection_profile_policy_json": {
                    "strictness": "balanced",
                    "unresolvedDecision": "hold",
                    "llmReviewMode": "optional_high_value_only",
                },
            },
        ) as query_one:
            result = api_main.get_system_interest("template-1")

        self.assertEqual(result["selection_profile_id"], "profile-1")
        self.assertEqual(result["selection_profile_policy_json"]["unresolvedDecision"], "hold")
        self.assertEqual(result["selection_profile_policy_json"]["llmReviewMode"], "always")
        sql = query_one.call_args.args[0]
        self.assertIn("left join selection_profiles sp", sql)
        self.assertIn("sp.profile_family as selection_profile_family", sql)
        self.assertIn("sp.version as selection_profile_version", sql)

    def test_non_compatibility_profiles_keep_persisted_policy_mode(self) -> None:
        with patch.object(
            api_main,
            "query_one",
            return_value={
                "interest_template_id": "template-2",
                "selection_profile_id": "profile-2",
                "selection_profile_family": "custom_profile",
                "selection_profile_policy_json": {
                    "llmReviewMode": "optional_high_value_only",
                },
            },
        ):
            result = api_main.get_system_interest("template-2")

        self.assertEqual(result["selection_profile_policy_json"]["llmReviewMode"], "optional_high_value_only")


if __name__ == "__main__":
    unittest.main()

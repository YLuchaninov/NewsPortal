import sys
import types
import unittest
import uuid

if "psycopg" not in sys.modules:
    psycopg_stub = types.ModuleType("psycopg")

    class _AsyncCursor:
        def __class_getitem__(cls, _item):
            return cls

    psycopg_stub.AsyncCursor = _AsyncCursor
    sys.modules["psycopg"] = psycopg_stub

if "psycopg.types" not in sys.modules:
    sys.modules["psycopg.types"] = types.ModuleType("psycopg.types")

if "psycopg.types.json" not in sys.modules:
    psycopg_types_json_stub = types.ModuleType("psycopg.types.json")
    psycopg_types_json_stub.Json = lambda value: value
    sys.modules["psycopg.types.json"] = psycopg_types_json_stub

from services.workers.app.interest_filters import (
    build_interest_filter_explain,
    build_interest_filter_key,
    resolve_criterion_filter_outcome,
    resolve_user_interest_filter_outcome,
)


class InterestFilterLogicTests(unittest.TestCase):
    def test_build_interest_filter_key_uses_scope_specific_prefixes(self) -> None:
        criterion_id = uuid.UUID("11111111-1111-1111-1111-111111111111")
        interest_id = uuid.UUID("22222222-2222-2222-2222-222222222222")

        self.assertEqual(
            build_interest_filter_key("system_criterion", criterion_id=criterion_id),
            f"criterion:{criterion_id}",
        )
        self.assertEqual(
            build_interest_filter_key("user_interest", interest_id=interest_id),
            f"interest:{interest_id}",
        )

    def test_resolve_criterion_filter_outcome_splits_technical_and_semantic_states(self) -> None:
        self.assertEqual(
            resolve_criterion_filter_outcome(pass_filters=False, compat_decision="irrelevant"),
            ("filtered_out", "not_evaluated"),
        )
        self.assertEqual(
            resolve_criterion_filter_outcome(pass_filters=True, compat_decision="relevant"),
            ("passed", "match"),
        )
        self.assertEqual(
            resolve_criterion_filter_outcome(pass_filters=True, compat_decision="gray_zone"),
            ("passed", "gray_zone"),
        )
        self.assertEqual(
            resolve_criterion_filter_outcome(pass_filters=True, compat_decision="irrelevant"),
            ("passed", "no_match"),
        )

    def test_resolve_user_interest_filter_outcome_preserves_gray_zone_without_notify_bias(self) -> None:
        self.assertEqual(
            resolve_user_interest_filter_outcome(pass_filters=False, compat_decision="ignore"),
            ("filtered_out", "not_evaluated"),
        )
        self.assertEqual(
            resolve_user_interest_filter_outcome(pass_filters=True, compat_decision="notify"),
            ("passed", "match"),
        )
        self.assertEqual(
            resolve_user_interest_filter_outcome(pass_filters=True, compat_decision="gray_zone"),
            ("passed", "gray_zone"),
        )
        self.assertEqual(
            resolve_user_interest_filter_outcome(pass_filters=True, compat_decision="suppress"),
            ("passed", "no_match"),
        )

    def test_build_interest_filter_explain_adds_split_fields_and_verification_snapshot(self) -> None:
        explain = build_interest_filter_explain(
            base_explain_json={"S_interest": 0.88},
            technical_filter_state="passed",
            semantic_decision="match",
            compat_decision="notify",
            filter_scope="user_interest",
            context={
                "canonicalDocumentId": uuid.UUID("33333333-3333-3333-3333-333333333333"),
                "storyClusterId": uuid.UUID("44444444-4444-4444-4444-444444444444"),
                "verificationTargetType": "story_cluster",
                "verificationTargetId": uuid.UUID("44444444-4444-4444-4444-444444444444"),
                "verificationState": "strong",
            },
        )

        self.assertEqual(explain["filterScope"], "user_interest")
        self.assertEqual(explain["technicalFilterState"], "passed")
        self.assertEqual(explain["semanticDecision"], "match")
        self.assertEqual(explain["compatDecision"], "notify")
        self.assertEqual(
            explain["verification"],
            {
                "targetType": "story_cluster",
                "targetId": "44444444-4444-4444-4444-444444444444",
                "state": "strong",
            },
        )


if __name__ == "__main__":
    unittest.main()

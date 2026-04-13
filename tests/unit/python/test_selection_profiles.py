import unittest

from services.workers.app.selection_profiles import (
    build_selection_profile_runtime_explain,
    coerce_selection_profile_runtime,
    resolve_profile_gray_zone_decision,
    selection_profile_allows_llm_review,
)


class SelectionProfileRuntimeTests(unittest.TestCase):
    def test_legacy_runtime_defaults_to_always_review(self) -> None:
        runtime = coerce_selection_profile_runtime(None)

        self.assertEqual(runtime["runtimeMode"], "legacy_criterion")
        self.assertEqual(runtime["unresolvedDecision"], "hold")
        self.assertEqual(runtime["llmReviewMode"], "always")
        self.assertTrue(selection_profile_allows_llm_review(runtime))
        self.assertEqual(resolve_profile_gray_zone_decision(runtime), "gray_zone")

    def test_selection_profile_runtime_defaults_to_always_review_for_synced_profiles(self) -> None:
        runtime = coerce_selection_profile_runtime(
            {
                "selection_profile_id": "profile-1",
                "selection_profile_version": 3,
                "selection_profile_status": "active",
                "selection_profile_family": "compatibility_interest_template",
                "selection_profile_policy_json": {},
            }
        )

        self.assertEqual(runtime["runtimeMode"], "selection_profile")
        self.assertEqual(runtime["llmReviewMode"], "always")
        self.assertTrue(selection_profile_allows_llm_review(runtime))
        self.assertEqual(resolve_profile_gray_zone_decision(runtime), "gray_zone")

        explain = build_selection_profile_runtime_explain(runtime)
        self.assertEqual(explain["selectionProfileId"], "profile-1")
        self.assertTrue(explain["llmReviewAllowed"])

    def test_selection_profile_runtime_supports_explicit_reject_and_high_value_review(self) -> None:
        runtime = coerce_selection_profile_runtime(
            {
                "selection_profile_id": "profile-2",
                "selection_profile_policy_json": {
                    "llmReviewMode": "optional_high_value_only",
                    "highValue": True,
                    "unresolvedDecision": "reject",
                    "strictness": "strict",
                },
            }
        )

        self.assertEqual(runtime["strictness"], "strict")
        self.assertTrue(selection_profile_allows_llm_review(runtime))
        self.assertEqual(resolve_profile_gray_zone_decision(runtime), "irrelevant")

    def test_non_compatibility_profiles_keep_cheap_hold_default(self) -> None:
        runtime = coerce_selection_profile_runtime(
            {
                "selection_profile_id": "profile-3",
                "selection_profile_family": "custom_profile",
                "selection_profile_policy_json": {},
            }
        )

        self.assertEqual(runtime["llmReviewMode"], "optional_high_value_only")
        self.assertFalse(selection_profile_allows_llm_review(runtime))


if __name__ == "__main__":
    unittest.main()

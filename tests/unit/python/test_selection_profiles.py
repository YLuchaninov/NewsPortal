import unittest

from signalops.workers.selection_profiles import (
    build_selection_profile_runtime_explain,
    coerce_selection_profile_runtime,
    resolve_profile_gray_zone_decision,
    resolve_strict_candidate_signal_guard,
    selection_profile_allows_llm_review,
)


class SelectionProfileRuntimeTests(unittest.TestCase):
    def test_legacy_runtime_defaults_to_always_review(self) -> None:
        runtime = coerce_selection_profile_runtime(None)

        self.assertEqual(runtime["runtimeMode"], "legacy_criterion")
        self.assertEqual(runtime["unresolvedDecision"], "hold")
        self.assertEqual(runtime["llmReviewMode"], "always")
        self.assertEqual(runtime["autoSelectMode"], "disabled")
        self.assertEqual(runtime["signalVisibility"], "unknown")
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
        self.assertEqual(runtime["autoSelectMode"], "disabled")
        self.assertTrue(selection_profile_allows_llm_review(runtime))
        self.assertEqual(resolve_profile_gray_zone_decision(runtime), "gray_zone")

        explain = build_selection_profile_runtime_explain(runtime)
        self.assertEqual(explain["selectionProfileId"], "profile-1")
        self.assertTrue(explain["llmReviewAllowed"])
        self.assertEqual(explain["autoSelectMode"], "disabled")
        self.assertEqual(explain["autoSelectMinPositiveGroups"], 3)
        self.assertEqual(explain["autoSelectMinCueHits"], 4)

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

    def test_broad_hold_profile_accepts_gray_zone_as_relevant(self) -> None:
        runtime = coerce_selection_profile_runtime(
            {
                "selection_profile_id": "profile-broad",
                "selection_profile_family": "compatibility_interest_template",
                "selection_profile_policy_json": {
                    "llmReviewMode": "disabled",
                    "unresolvedDecision": "hold",
                    "strictness": "broad",
                },
            }
        )

        self.assertFalse(selection_profile_allows_llm_review(runtime))
        self.assertEqual(resolve_profile_gray_zone_decision(runtime), "relevant")

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

    def test_explicit_marker_visibility_defaults_to_evidence_or_llm_auto_select(self) -> None:
        runtime = coerce_selection_profile_runtime(
            {
                "selection_profile_id": "profile-explicit",
                "selection_profile_policy_json": {
                    "signalVisibility": "explicit_marker",
                },
            }
        )

        self.assertEqual(runtime["signalVisibility"], "explicit_marker")
        self.assertEqual(runtime["autoSelectMode"], "evidence_or_llm")

    def test_hidden_intent_visibility_defaults_to_llm_approved_auto_select(self) -> None:
        runtime = coerce_selection_profile_runtime(
            {
                "selection_profile_id": "profile-hidden",
                "selection_profile_policy_json": {
                    "signalVisibility": "hidden_intent",
                },
            }
        )

        self.assertEqual(runtime["signalVisibility"], "hidden_intent")
        self.assertEqual(runtime["autoSelectMode"], "llm_approved")

    def test_auto_select_policy_accepts_explicit_thresholds_and_veto_flags(self) -> None:
        runtime = coerce_selection_profile_runtime(
            {
                "selection_profile_id": "profile-autoselect",
                "selection_profile_policy_json": {
                    "autoSelectMode": "evidence_led",
                    "signalVisibility": "mixed",
                    "autoSelectMinPositiveGroups": "4",
                    "autoSelectMinCueHits": "6",
                    "autoSelectRequiresNoNoise": False,
                    "autoSelectRequiresNoTechnicalVeto": "false",
                },
            }
        )

        self.assertEqual(runtime["autoSelectMode"], "evidence_led")
        self.assertEqual(runtime["signalVisibility"], "mixed")
        self.assertEqual(runtime["autoSelectMinPositiveGroups"], 4)
        self.assertEqual(runtime["autoSelectMinCueHits"], 6)
        self.assertFalse(runtime["autoSelectRequiresNoNoise"])
        self.assertFalse(runtime["autoSelectRequiresNoTechnicalVeto"])

    def test_strict_candidate_signal_guard_demotes_weak_configured_matches(self) -> None:
        runtime = coerce_selection_profile_runtime(
            {
                "selection_profile_id": "profile-strict",
                "selection_profile_policy_json": {
                    "strictness": "strict",
                    "unresolvedDecision": "hold",
                },
            }
        )

        guard = resolve_strict_candidate_signal_guard(
            runtime,
            {
                "signalSource": "selection_profile_definition",
                "positiveSignalCount": 1,
                "noiseSignalCount": 0,
            },
        )

        self.assertIsNotNone(guard)
        assert guard is not None
        self.assertEqual(guard["finalDecision"], "gray_zone")
        self.assertEqual(guard["reason"], "strict_candidate_signal_guard")
        self.assertTrue(guard["missingPositiveGroups"])

    def test_strict_candidate_signal_guard_allows_multiple_clean_groups(self) -> None:
        runtime = coerce_selection_profile_runtime(
            {
                "selection_profile_id": "profile-strict",
                "selection_profile_policy_json": {"strictness": "strict"},
            }
        )

        guard = resolve_strict_candidate_signal_guard(
            runtime,
            {
                "signalSource": "selection_profile_definition",
                "positiveSignalCount": 2,
                "noiseSignalCount": 0,
            },
        )

        self.assertIsNone(guard)


if __name__ == "__main__":
    unittest.main()

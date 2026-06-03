import unittest

from services.workers.app.criteria_review_policy import (
    build_runtime_review_state,
    is_candidate_recovery_protected,
    should_queue_criterion_llm_review,
)


class CriteriaReviewPolicyTests(unittest.TestCase):
    def test_should_queue_review_only_for_live_allowed_unresolved_gray_zone(self) -> None:
        self.assertTrue(
            should_queue_criterion_llm_review(
                decision="gray_zone",
                runtime_resolution=None,
                llm_review_allowed=True,
                historical_backfill=False,
            )
        )
        self.assertFalse(
            should_queue_criterion_llm_review(
                decision="gray_zone",
                runtime_resolution={"finalDecision": "rejected"},
                llm_review_allowed=True,
                historical_backfill=False,
            )
        )
        self.assertFalse(
            should_queue_criterion_llm_review(
                decision="gray_zone",
                runtime_resolution=None,
                llm_review_allowed=True,
                historical_backfill=True,
            )
        )

    def test_candidate_recovery_protection_uses_uplift_marker(self) -> None:
        self.assertTrue(is_candidate_recovery_protected({"upliftedToGrayZone": True}))
        self.assertFalse(is_candidate_recovery_protected({"upliftedToGrayZone": False}))
        self.assertFalse(is_candidate_recovery_protected(None))

    def test_runtime_review_state_keeps_reason_priority(self) -> None:
        queued = build_runtime_review_state(
            llm_review_queued=True,
            historical_backfill=True,
            llm_review_allowed=True,
            candidate_recovery_protected=True,
            gray_zone_policy={"reason": "selection_profile_runtime_policy"},
        )
        self.assertEqual(queued["reason"], "queued")
        self.assertTrue(queued["reviewQueued"])
        self.assertTrue(queued["candidateRecoveryProtected"])

        backfill = build_runtime_review_state(
            llm_review_queued=False,
            historical_backfill=True,
            llm_review_allowed=True,
            candidate_recovery_protected=False,
            gray_zone_policy={"reason": "selection_profile_runtime_policy"},
        )
        self.assertEqual(backfill["reason"], "historical_backfill_skip")

        policy = build_runtime_review_state(
            llm_review_queued=False,
            historical_backfill=False,
            llm_review_allowed=False,
            candidate_recovery_protected=False,
            gray_zone_policy={"reason": "selection_profile_runtime_policy"},
        )
        self.assertEqual(policy["reason"], "selection_profile_runtime_policy")


if __name__ == "__main__":
    unittest.main()

import unittest

from services.workers.app.selection_signal_summary import build_candidate_signal_tier_summary


class SelectionSignalSummaryTests(unittest.TestCase):
    def test_candidate_signal_tier_is_none_when_all_counts_are_zero(self) -> None:
        tier, counts = build_candidate_signal_tier_summary({})

        self.assertIsNone(tier)
        self.assertEqual(
            counts,
            {
                "context": 0,
                "buyer_intent": 0,
                "project_intent": 0,
            },
        )

    def test_candidate_signal_tier_prefers_highest_count(self) -> None:
        tier, counts = build_candidate_signal_tier_summary(
            {
                "candidate_signal_context_count": 4,
                "candidate_signal_buyer_intent_count": 2,
                "candidate_signal_project_intent_count": 1,
            }
        )

        self.assertEqual(tier, "context")
        self.assertEqual(counts["context"], 4)

    def test_candidate_signal_tier_prefers_stronger_tier_on_tie(self) -> None:
        tier, counts = build_candidate_signal_tier_summary(
            {
                "candidate_signal_context_count": 2,
                "candidate_signal_buyer_intent_count": 2,
                "candidate_signal_project_intent_count": 2,
            }
        )

        self.assertEqual(tier, "project_intent")
        self.assertEqual(counts["project_intent"], 2)


if __name__ == "__main__":
    unittest.main()

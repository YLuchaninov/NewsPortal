import unittest

from signalops.api.content_selection_summary import (
    ABSENT_CANDIDATE_RECOVERY_SUMMARY,
    resolve_candidate_recovery_summary,
)


class ContentSelectionSummaryTest(unittest.TestCase):
    def test_absent_candidate_recovery_summary_is_shared(self) -> None:
        state, summary = resolve_candidate_recovery_summary(
            selection_mode="pending",
            candidate_signal_uplift_count=0,
        )

        self.assertEqual(state, "absent")
        self.assertEqual(summary, ABSENT_CANDIDATE_RECOVERY_SUMMARY)


if __name__ == "__main__":
    unittest.main()

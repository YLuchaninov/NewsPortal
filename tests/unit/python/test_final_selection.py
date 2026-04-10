import unittest

from services.workers.app.final_selection import summarize_final_selection_result


class FinalSelectionLogicTests(unittest.TestCase):
    def test_marks_pass_through_articles_as_selected_when_no_system_filters_exist(self) -> None:
        summary = summarize_final_selection_result(
            total_filter_count=0,
            matched_filter_count=0,
            no_match_filter_count=0,
            gray_zone_filter_count=0,
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
            technical_filtered_out_count=0,
            verification_state="medium",
        )

        self.assertEqual(summary["decision"], "gray_zone")
        self.assertFalse(summary["isSelected"])
        self.assertEqual(summary["compatSystemFeedDecision"], "pending_llm")

    def test_marks_conflicting_verification_as_gray_zone_even_with_match(self) -> None:
        summary = summarize_final_selection_result(
            total_filter_count=1,
            matched_filter_count=1,
            no_match_filter_count=0,
            gray_zone_filter_count=0,
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
            technical_filtered_out_count=1,
            verification_state="weak",
        )

        self.assertEqual(summary["decision"], "rejected")
        self.assertFalse(summary["isSelected"])
        self.assertEqual(summary["compatSystemFeedDecision"], "filtered_out")


if __name__ == "__main__":
    unittest.main()

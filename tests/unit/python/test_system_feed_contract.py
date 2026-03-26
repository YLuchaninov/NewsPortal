import unittest

from services.workers.app.system_feed import summarize_system_feed_result


class SystemFeedContractTests(unittest.TestCase):
    def test_marks_article_as_pass_through_when_no_criteria_were_evaluated(self) -> None:
        summary = summarize_system_feed_result(
            total_criteria_count=0,
            relevant_criteria_count=0,
            irrelevant_criteria_count=0,
            pending_llm_criteria_count=0,
        )

        self.assertEqual(summary["decision"], "pass_through")
        self.assertTrue(summary["eligible_for_feed"])

    def test_marks_article_as_pending_when_any_criterion_is_waiting_for_llm(self) -> None:
        summary = summarize_system_feed_result(
            total_criteria_count=3,
            relevant_criteria_count=1,
            irrelevant_criteria_count=1,
            pending_llm_criteria_count=1,
        )

        self.assertEqual(summary["decision"], "pending_llm")
        self.assertFalse(summary["eligible_for_feed"])

    def test_marks_article_as_eligible_when_at_least_one_criterion_survives(self) -> None:
        summary = summarize_system_feed_result(
            total_criteria_count=2,
            relevant_criteria_count=1,
            irrelevant_criteria_count=1,
            pending_llm_criteria_count=0,
        )

        self.assertEqual(summary["decision"], "eligible")
        self.assertTrue(summary["eligible_for_feed"])

    def test_marks_article_as_filtered_out_when_all_criteria_are_irrelevant(self) -> None:
        summary = summarize_system_feed_result(
            total_criteria_count=2,
            relevant_criteria_count=0,
            irrelevant_criteria_count=2,
            pending_llm_criteria_count=0,
        )

        self.assertEqual(summary["decision"], "filtered_out")
        self.assertFalse(summary["eligible_for_feed"])


if __name__ == "__main__":
    unittest.main()

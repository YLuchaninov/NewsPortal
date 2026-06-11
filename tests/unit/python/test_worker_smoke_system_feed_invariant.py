import unittest

from infra.scripts.workers.smoke import verify_system_feed_result_consistency


class WorkerSmokeSystemFeedInvariantTests(unittest.TestCase):
    def test_accepts_explicit_compatibility_projection_override(self) -> None:
        verify_system_feed_result_consistency(
            {
                "total_criteria_count": 1,
                "relevant_criteria_count": 0,
                "irrelevant_criteria_count": 1,
                "pending_llm_criteria_count": 0,
                "decision": "eligible",
                "eligible_for_feed": True,
                "explain_json": {
                    "source": "final_selection_results",
                    "compatibilityProjection": True,
                    "compatibilityDecisionOverride": "eligible",
                },
            },
            require_criteria_counts=True,
        )

    def test_rejects_unexplained_decision_drift(self) -> None:
        with self.assertRaisesRegex(RuntimeError, "stored decision drifted"):
            verify_system_feed_result_consistency(
                {
                    "total_criteria_count": 1,
                    "relevant_criteria_count": 0,
                    "irrelevant_criteria_count": 1,
                    "pending_llm_criteria_count": 0,
                    "decision": "eligible",
                    "eligible_for_feed": True,
                    "explain_json": {
                        "source": "criteria",
                    },
                },
                require_criteria_counts=True,
            )


if __name__ == "__main__":
    unittest.main()

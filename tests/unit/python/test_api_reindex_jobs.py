import unittest
from unittest.mock import patch

from tests.unit.python.support.stubs import install_psycopg_stub

install_psycopg_stub()

from services.api.app import main as api_main


class ApiReindexJobsTests(unittest.TestCase):
    def test_list_reindex_jobs_without_page_uses_limit_and_projection(self) -> None:
        with (
            patch.object(
                api_main,
                "query_all",
                return_value=[
                    {
                        "reindex_job_id": "job-1",
                        "result_json": {},
                    }
                ],
            ) as query_all,
            patch.object(
                api_main,
                "apply_reindex_selection_profile_payload",
                side_effect=lambda item: dict(item, projected=True),
            ) as apply_payload,
        ):
            result = api_main.list_reindex_jobs(limit=7, page=None, page_size=None)

        query_sql, query_params = query_all.call_args.args
        self.assertIn("from reindex_jobs", query_sql)
        self.assertIn("order by requested_at desc", query_sql)
        self.assertIn("limit %s", query_sql)
        self.assertEqual(query_params, (7,))
        apply_payload.assert_called_once()
        self.assertEqual(result[0]["reindex_job_id"], "job-1")
        self.assertEqual(result[0]["projected"], True)

    def test_list_reindex_jobs_projects_selection_profile_snapshot_summary(self) -> None:
        with (
            patch.object(api_main, "query_count", return_value=1),
            patch.object(
                api_main,
                "query_all",
                return_value=[
                    {
                        "reindex_job_id": "job-1",
                        "result_json": {
                            "backfill": {
                                "selectionProfileSnapshot": {
                                    "totalProfiles": 4,
                                    "activeProfiles": 3,
                                    "compatibilityProfiles": 3,
                                    "templatesWithProfiles": 3,
                                    "maxVersion": 7,
                                },
                                "selectionReplayTargetCount": 25,
                                "selectionReplayedCount": 25,
                                "enrichmentTargetCount": 8,
                                "enrichmentProcessedCount": 7,
                                "skippedSelectionDueToEnrichmentState": 0,
                            }
                        },
                    }
                ],
            ),
        ):
            result = api_main.list_reindex_jobs(page=1, page_size=20)

        item = result["items"][0]
        self.assertEqual(item["selection_profile_snapshot"]["activeProfiles"], 3)
        self.assertEqual(item["selection_profile_snapshot"]["maxVersion"], 7)
        self.assertEqual(
            item["selection_profile_summary"],
            "3/4 active | 3 compatibility | 3 template-bound | max v7",
        )
        self.assertEqual(item["selection_replay"]["selectionReplayTargetCount"], 25)
        self.assertEqual(item["selection_replay"]["selectionReplayedCount"], 25)
        self.assertEqual(item["selection_replay"]["enrichmentTargetCount"], 8)
        self.assertEqual(item["selection_replay"]["enrichmentProcessedCount"], 7)
        self.assertTrue(item["selection_replay"]["selectionReplayComplete"])
        self.assertEqual(item["selectionReplay"], item["selection_replay"])


if __name__ == "__main__":
    unittest.main()

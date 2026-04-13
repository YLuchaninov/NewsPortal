import sys
import types
import unittest
from unittest.mock import patch

if "psycopg" not in sys.modules:
    psycopg_stub = types.ModuleType("psycopg")
    psycopg_stub.connect = lambda *args, **kwargs: None
    sys.modules["psycopg"] = psycopg_stub

if "psycopg.rows" not in sys.modules:
    psycopg_rows_stub = types.ModuleType("psycopg.rows")
    psycopg_rows_stub.dict_row = object()
    sys.modules["psycopg.rows"] = psycopg_rows_stub

if "psycopg.types" not in sys.modules:
    sys.modules["psycopg.types"] = types.ModuleType("psycopg.types")

if "psycopg.types.json" not in sys.modules:
    psycopg_types_json_stub = types.ModuleType("psycopg.types.json")
    psycopg_types_json_stub.Json = lambda value: value
    sys.modules["psycopg.types.json"] = psycopg_types_json_stub

from services.api.app import main as api_main


class ApiReindexJobsTests(unittest.TestCase):
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
                                }
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


if __name__ == "__main__":
    unittest.main()

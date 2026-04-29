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


class ApiClusterReadModelTests(unittest.TestCase):
    def test_list_clusters_without_page_uses_limit_and_member_projection(self) -> None:
        items = [{"cluster_id": "cluster-1", "doc_ids": ["doc-1"]}]
        with patch.object(api_main, "query_all", return_value=items) as query_all:
            result = api_main.list_clusters(limit=7, page=None, page_size=None)

        query_sql, query_params = query_all.call_args.args
        self.assertIn("from event_clusters ec", query_sql)
        self.assertIn("from event_cluster_members ecm", query_sql)
        self.assertIn("order by ec.max_published_at desc nulls last", query_sql)
        self.assertIn("limit %s", query_sql)
        self.assertEqual(query_params, (7,))
        self.assertEqual(result, items)

    def test_list_clusters_page_counts_event_clusters(self) -> None:
        items = [{"cluster_id": "cluster-2", "doc_ids": ["doc-2"]}]
        with (
            patch.object(api_main, "query_count", return_value=5) as query_count,
            patch.object(api_main, "query_all", return_value=items) as query_all,
        ):
            result = api_main.list_clusters(limit=20, page=2, page_size=2)

        count_sql = query_count.call_args.args[0]
        self.assertIn("from event_clusters", count_sql)
        query_sql, query_params = query_all.call_args.args
        self.assertIn("from event_clusters ec", query_sql)
        self.assertEqual(query_params, (2, 2))
        self.assertEqual(result["items"], items)
        self.assertEqual(result["page"], 2)
        self.assertEqual(result["pageSize"], 2)
        self.assertEqual(result["total"], 5)


if __name__ == "__main__":
    unittest.main()

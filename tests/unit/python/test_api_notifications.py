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


class ApiNotificationReadModelTests(unittest.TestCase):
    def test_list_user_notifications_without_page_uses_limit_and_article_join(
        self,
    ) -> None:
        items = [{"notification_id": "notification-1", "article_title": "Title"}]
        with patch.object(api_main, "query_all", return_value=items) as query_all:
            result = api_main.list_user_notifications(
                "user-1", limit=7, page=None, page_size=None
            )

        query_sql, query_params = query_all.call_args.args
        self.assertIn("from notification_log nl", query_sql)
        self.assertIn("join articles a", query_sql)
        self.assertIn("where nl.user_id = %s", query_sql)
        self.assertIn("order by nl.created_at desc", query_sql)
        self.assertIn("limit %s", query_sql)
        self.assertEqual(query_params, ("user-1", 7))
        self.assertEqual(result, items)

    def test_list_user_notifications_page_counts_user_notifications(self) -> None:
        items = [{"notification_id": "notification-2", "article_lead": "Lead"}]
        with (
            patch.object(api_main, "query_count", return_value=5) as query_count,
            patch.object(api_main, "query_all", return_value=items) as query_all,
        ):
            result = api_main.list_user_notifications(
                "user-2", limit=20, page=2, page_size=2
            )

        count_sql, count_params = query_count.call_args.args
        self.assertIn("from notification_log", count_sql)
        self.assertIn("where user_id = %s", count_sql)
        self.assertEqual(count_params, ("user-2",))

        query_sql, query_params = query_all.call_args.args
        self.assertIn("from notification_log nl", query_sql)
        self.assertEqual(query_params, ("user-2", 2, 2))
        self.assertEqual(result["items"], items)
        self.assertEqual(result["page"], 2)
        self.assertEqual(result["pageSize"], 2)
        self.assertEqual(result["total"], 5)


if __name__ == "__main__":
    unittest.main()

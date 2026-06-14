import unittest
from unittest.mock import patch

from tests.unit.python.support.stubs import install_psycopg_stub

install_psycopg_stub()

from signalops.api import main as api_main


class ApiUserInterestsTests(unittest.TestCase):
    def test_list_user_interests_without_page_returns_plain_rows(self) -> None:
        rows = [{"interest_id": "interest-1", "compiled_json": {"terms": ["ai"]}}]
        with patch.object(api_main, "query_all", return_value=rows) as query_all:
            result = api_main.list_user_interests(
                "user-1", page=None, page_size=None
            )

        self.assertEqual(result, rows)
        sql, params = query_all.call_args.args
        self.assertIn("from user_interests ui", sql)
        self.assertIn(
            "left join user_interests_compiled uic on uic.interest_id = ui.interest_id",
            sql,
        )
        self.assertNotIn("limit %s", sql)
        self.assertEqual(params, ("user-1",))

    def test_list_user_interests_page_counts_and_offsets(self) -> None:
        rows = [{"interest_id": "interest-2", "compiled_at": "2026-04-28"}]
        with (
            patch.object(api_main, "query_count", return_value=7) as query_count,
            patch.object(api_main, "query_all", return_value=rows) as query_all,
        ):
            result = api_main.list_user_interests(
                "user-2", page=2, page_size=3
            )

        self.assertEqual(result["items"], rows)
        self.assertEqual(result["page"], 2)
        self.assertEqual(result["pageSize"], 3)
        self.assertEqual(result["total"], 7)

        count_sql, count_params = query_count.call_args.args
        self.assertIn("from user_interests", count_sql)
        self.assertEqual(count_params, ("user-2",))

        items_sql, items_params = query_all.call_args.args
        self.assertIn("order by ui.updated_at desc", items_sql)
        self.assertIn("limit %s", items_sql)
        self.assertIn("offset %s", items_sql)
        self.assertEqual(items_params, ("user-2", 3, 3))


if __name__ == "__main__":
    unittest.main()

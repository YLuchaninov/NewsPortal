import unittest
from unittest.mock import patch

from tests.unit.python.support.stubs import install_psycopg_stub

install_psycopg_stub()

from signalops.api import main as api_main


class ApiNotificationReadModelTests(unittest.TestCase):
    def test_list_user_notifications_without_page_uses_limit_and_signal_candidate_join(
        self,
    ) -> None:
        items = [{"notification_id": "notification-1", "signal_candidate_title": "Title"}]
        with patch.object(api_main, "query_all", return_value=items) as query_all:
            result = api_main.list_user_notifications(
                "user-1", limit=7, page=None, page_size=None
            )

        query_sql, query_params = query_all.call_args.args
        self.assertIn("from notification_log nl", query_sql)
        self.assertIn("join signal_candidates a", query_sql)
        self.assertIn("where nl.user_id = %s", query_sql)
        self.assertIn("order by nl.created_at desc", query_sql)
        self.assertIn("limit %s", query_sql)
        self.assertEqual(query_params, ("user-1", 7))
        self.assertEqual(result, items)

    def test_list_user_notifications_page_counts_user_notifications(self) -> None:
        items = [{"notification_id": "notification-2", "signal_candidate_lead": "Lead"}]
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

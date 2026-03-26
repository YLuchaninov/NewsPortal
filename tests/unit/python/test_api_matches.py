import unittest
import sys
import types
from unittest.mock import patch

if "psycopg" not in sys.modules:
    psycopg_stub = types.ModuleType("psycopg")
    psycopg_stub.connect = lambda *args, **kwargs: None
    sys.modules["psycopg"] = psycopg_stub

if "psycopg.rows" not in sys.modules:
    psycopg_rows_stub = types.ModuleType("psycopg.rows")
    psycopg_rows_stub.dict_row = object()
    sys.modules["psycopg.rows"] = psycopg_rows_stub

from services.api.app import main as api_main


class ApiMatchesTests(unittest.TestCase):
    def test_list_user_matches_uses_ranked_dedup_query(self) -> None:
        items = [
            {
                "doc_id": "doc-1",
                "title": "AI policy update",
                "matched_interest_id": "interest-1",
                "matched_interest_description": "AI policy",
                "interest_match_score": 0.91,
                "interest_match_decision": "notify",
            }
        ]
        with (
            patch.object(api_main, "query_count", return_value=3) as query_count,
            patch.object(api_main, "query_all", return_value=items) as query_all,
        ):
            result = api_main.list_user_matches("user-1", page=2, page_size=10)

        self.assertEqual(result["total"], 3)
        self.assertEqual(result["page"], 2)
        self.assertEqual(result["pageSize"], 10)
        self.assertEqual(result["items"], items)

        count_sql, count_params = query_count.call_args.args
        self.assertIn("select distinct coalesce(a.canonical_doc_id, a.doc_id) as family_doc_id", count_sql)
        self.assertIn("imr.decision = 'notify'", count_sql)
        self.assertIn("coalesce(sfr.eligible_for_feed, false) = true", count_sql)
        self.assertEqual(count_params, ("user-1",))

        items_sql, items_params = query_all.call_args.args
        self.assertIn("partition by coalesce(a.canonical_doc_id, a.doc_id)", items_sql)
        self.assertIn("matched.family_rank = 1", items_sql)
        self.assertIn("order by matched.published_at desc nulls last, matched.ingested_at desc", items_sql)
        self.assertEqual(items_params, ("user-1", 10, 10))

    def test_list_user_matches_non_paginated_returns_plain_rows(self) -> None:
        items = [{"doc_id": "doc-7", "matched_interest_id": "interest-9"}]
        with patch.object(api_main, "query_all", return_value=items) as query_all:
            result = api_main.list_user_matches("user-9", limit=5, page=None, page_size=None)

        self.assertEqual(result, items)
        sql, params = query_all.call_args.args
        self.assertIn("partition by coalesce(a.canonical_doc_id, a.doc_id)", sql)
        self.assertIn("matched.family_rank = 1", sql)
        self.assertIn("imr.decision = 'notify'", sql)
        self.assertEqual(params, ("user-9", 5))


if __name__ == "__main__":
    unittest.main()

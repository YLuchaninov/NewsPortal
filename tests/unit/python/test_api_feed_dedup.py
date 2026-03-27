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

from services.api.app import main as api_main


class ApiFeedDedupTests(unittest.TestCase):
    def test_processed_article_clause_includes_final_system_gate_rows(self) -> None:
        clause = api_main.processed_article_clause("articles")

        self.assertIn("articles.processing_state in ('matched', 'notified')", clause)
        self.assertIn("from system_feed_results sfr_processed", clause)
        self.assertIn("sfr_processed.doc_id = articles.doc_id", clause)
        self.assertIn(
            "sfr_processed.decision in ('pass_through', 'eligible', 'filtered_out')",
            clause,
        )

    def test_list_feed_articles_uses_canonical_family_dedup(self) -> None:
        items = [{"doc_id": "doc-1", "title": "One copy only"}]
        with (
            patch.object(api_main, "query_one", return_value={"total": 2}) as query_one,
            patch.object(api_main, "query_all", return_value=items) as query_all,
        ):
            result = api_main.list_feed_articles(page=2, page_size=5)

        self.assertEqual(result["total"], 2)
        self.assertEqual(result["page"], 2)
        self.assertEqual(result["pageSize"], 5)
        self.assertEqual(result["items"], items)

        count_sql = query_one.call_args.args[0]
        self.assertIn(
            "select distinct coalesce(a.canonical_doc_id, a.doc_id) as family_doc_id",
            count_sql,
        )
        self.assertIn("coalesce(sfr.eligible_for_feed, false) = true", count_sql)

        items_sql, items_params = query_all.call_args.args
        self.assertIn("partition by coalesce(a.canonical_doc_id, a.doc_id)", items_sql)
        self.assertIn("where ranked.family_rank = 1", items_sql)
        self.assertIn(
            "order by ranked.published_at desc nulls last, ranked.ingested_at desc, ranked.doc_id",
            items_sql,
        )
        self.assertEqual(items_params, (5, 5))

    def test_dashboard_summary_counts_canonical_feed_families(self) -> None:
        summary = {
            "active_news": 7,
            "processed_total": 0,
            "processed_today": 0,
            "total_users": 0,
            "active_channels": 0,
            "queued_reindex_jobs": 0,
            "overdue_channels": 0,
            "adapted_channels": 0,
            "attention_channels": 0,
            "fetch_median_duration_ms_24h": 0,
            "llm_review_pending": 0,
            "llm_review_uncertain": 0,
        }
        with patch.object(api_main, "query_one", return_value=summary) as query_one:
            result = api_main.get_dashboard_summary()

        self.assertEqual(result, summary)
        sql = query_one.call_args.args[0]
        self.assertIn(
            "select distinct coalesce(a.canonical_doc_id, a.doc_id) as family_doc_id",
            sql,
        )
        self.assertIn("coalesce(sfr.eligible_for_feed, false) = true", sql)
        self.assertIn("from system_feed_results sfr_processed", sql)


if __name__ == "__main__":
    unittest.main()

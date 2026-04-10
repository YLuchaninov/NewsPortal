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


class ApiFeedDedupTests(unittest.TestCase):
    def test_processed_article_clause_includes_final_system_gate_rows(self) -> None:
        clause = api_main.processed_article_clause("articles")

        self.assertIn("articles.processing_state in ('matched', 'notified')", clause)
        self.assertIn("from final_selection_results fsr_processed", clause)
        self.assertIn("from system_feed_results sfr_processed", clause)
        self.assertIn("sfr_processed.doc_id = articles.doc_id", clause)
        self.assertIn(
            "fsr_processed.final_decision in ('selected', 'rejected', 'gray_zone')",
            clause,
        )
        self.assertIn(
            "sfr_processed.decision in ('pass_through', 'eligible', 'filtered_out')",
            clause,
        )

    def test_list_system_selected_content_items_uses_canonical_family_dedup(self) -> None:
        items = [{"content_item_id": "editorial:doc-1", "title": "One copy only"}]
        with (
            patch.object(api_main, "query_one", return_value={"total": 2}) as query_one,
            patch.object(api_main, "query_all", return_value=items) as query_all,
        ):
            result = api_main.list_system_selected_content_items_page(page=2, page_size=5)

        self.assertEqual(result["total"], 2)
        self.assertEqual(result["page"], 2)
        self.assertEqual(result["pageSize"], 5)
        self.assertEqual(result["items"], items)

        count_sql = query_one.call_args.args[0]
        self.assertIn("select count(*)::int as total from (", count_sql)
        self.assertIn("partition by coalesce(a.canonical_doc_id, a.doc_id)", count_sql)
        self.assertIn(
            "coalesce(fsr.is_selected, coalesce(sfr.eligible_for_feed, false)) = true",
            count_sql,
        )
        self.assertIn("where ranked.family_rank = 1", count_sql)

        items_sql, items_params = query_all.call_args.args
        self.assertIn("partition by coalesce(a.canonical_doc_id, a.doc_id)", items_sql)
        self.assertIn("left join final_selection_results fsr on fsr.doc_id = a.doc_id", items_sql)
        self.assertIn("where ranked.family_rank = 1", items_sql)
        self.assertIn(
            "order by published_at desc nulls last, ingested_at desc nulls last, content_item_id",
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

        self.assertEqual(
            result,
            {
                **summary,
                "llm_review_enabled": True,
                "llm_monthly_budget_cents": 0,
                "llm_month_to_date_cost_usd": 0.0,
                "llm_month_to_date_cost_cents": 0,
                "llm_remaining_monthly_budget_cents": None,
                "llm_monthly_quota_reached": False,
                "llm_accept_gray_zone_on_budget_exhaustion": False,
            },
        )
        self.assertEqual(query_one.call_count, 2)
        sql = query_one.call_args_list[0].args[0]
        self.assertIn(
            "select distinct coalesce(a.canonical_doc_id, a.doc_id) as family_doc_id",
            sql,
        )
        self.assertIn(
            "coalesce(fsr.is_selected, coalesce(sfr.eligible_for_feed, false)) = true",
            sql,
        )
        self.assertIn("from final_selection_results fsr_processed", api_main.processed_article_clause("a"))
        self.assertIn("from system_feed_results sfr_processed", sql)
        budget_sql = query_one.call_args_list[1].args[0]
        self.assertIn("from llm_review_log", budget_sql)
        self.assertIn("scope = 'criterion'", budget_sql)


if __name__ == "__main__":
    unittest.main()

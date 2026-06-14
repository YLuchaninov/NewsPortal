import unittest
from unittest.mock import patch

from tests.unit.python.support.stubs import install_psycopg_stub

install_psycopg_stub()

from signalops.api import main as api_main


class ApiFeedDedupTests(unittest.TestCase):
    def test_processed_signal_candidate_clause_includes_final_system_gate_rows(self) -> None:
        clause = api_main.processed_signal_candidate_clause("signal_candidates")

        self.assertIn("signal_candidates.processing_state in ('matched', 'notified')", clause)
        self.assertIn("from final_selection_results fsr_processed", clause)
        self.assertIn("from system_feed_results sfr_processed", clause)
        self.assertIn("sfr_processed.doc_id = signal_candidates.doc_id", clause)
        self.assertIn(
            "fsr_processed.final_decision in ('selected', 'rejected', 'gray_zone')",
            clause,
        )
        self.assertIn(
            "sfr_processed.decision in ('pass_through', 'eligible', 'filtered_out')",
            clause,
        )

    def test_list_system_selected_content_items_uses_canonical_family_dedup(self) -> None:
        items = [{"content_item_id": "signal_candidate:doc-1", "title": "One copy only"}]
        with (
            patch.object(api_main, "query_one", return_value={"total": 2}) as query_one,
            patch.object(api_main, "query_all", return_value=items) as query_all,
        ):
            result = api_main.list_system_selected_content_items_page(page=2, page_size=5)

        self.assertEqual(result["total"], 2)
        self.assertEqual(result["page"], 2)
        self.assertEqual(result["pageSize"], 5)
        self.assertEqual(result["items"], items)

        count_sql, count_params = query_one.call_args.args
        self.assertIn("select count(*)::int as total from (", count_sql)
        self.assertIn("partition by coalesce(a.canonical_doc_id, a.doc_id)", count_sql)
        self.assertIn(
            "when fsr.doc_id is not null then coalesce(fsr.is_selected, false)",
            count_sql,
        )
        self.assertIn("else coalesce(sfr.eligible_for_feed, false)", count_sql)
        self.assertIn("where ranked.family_rank = 1", count_sql)
        self.assertEqual(count_params, ())

        items_sql, items_params = query_all.call_args.args
        self.assertIn("partition by coalesce(a.canonical_doc_id, a.doc_id)", items_sql)
        self.assertIn("left join final_selection_results fsr on fsr.doc_id = a.doc_id", items_sql)
        self.assertIn("where ranked.family_rank = 1", items_sql)
        self.assertIn(
            "order by content_items.published_at desc nulls last, content_items.ingested_at desc nulls last, content_items.content_item_id",
            items_sql,
        )
        self.assertEqual(items_params, (5, 5))

    def test_resource_content_items_require_projected_final_selection(self) -> None:
        sql = api_main.resource_content_select_sql(include_internal_fields=True)

        self.assertIn("join signal_candidates pa on pa.doc_id = wr.projected_signal_candidate_id", sql)
        self.assertIn("join final_selection_results fsr on fsr.doc_id = pa.doc_id", sql)
        self.assertIn("and pa.visibility_state = 'visible'", sql)
        self.assertIn("and coalesce(fsr.is_selected, false) = true", sql)
        self.assertIn("fsr.final_decision as system_selection_decision", sql)
        self.assertNotIn("'kind_enabled'::text as system_selection_decision", sql)

    def test_resource_content_item_detail_requires_projected_final_selection(self) -> None:
        with patch.object(api_main, "query_one", return_value=None) as query_one:
            with self.assertRaises(Exception) as caught:
                api_main.get_resource_content_item(
                    "00000000-0000-4000-8000-000000000001"
                )

        self.assertEqual(getattr(caught.exception, "status_code", None), 404)
        sql, params = query_one.call_args.args
        self.assertIn("join signal_candidates pa on pa.doc_id = wr.projected_signal_candidate_id", sql)
        self.assertIn("join final_selection_results fsr on fsr.doc_id = pa.doc_id", sql)
        self.assertIn("and pa.visibility_state = 'visible'", sql)
        self.assertIn("and coalesce(fsr.is_selected, false) = true", sql)
        self.assertIn("from interest_templates it", sql)
        self.assertIn("fsr.final_decision as system_selection_decision", sql)
        self.assertEqual(params, ("00000000-0000-4000-8000-000000000001",))

    def test_invalid_public_content_item_id_returns_404_before_query(self) -> None:
        with patch.object(api_main, "query_one") as query_one:
            with self.assertRaises(api_main.HTTPException) as caught:
                api_main.get_content_item("signal_candidate:not-a-uuid")

        self.assertEqual(caught.exception.status_code, 404)
        query_one.assert_not_called()

    def test_list_system_selected_content_items_supports_search_and_title_sort(self) -> None:
        with (
            patch.object(api_main, "query_one", return_value={"total": 1}) as query_one,
            patch.object(api_main, "query_all", return_value=[]) as query_all,
        ):
            api_main.list_system_selected_content_items_page(
                page=1,
                page_size=20,
                sort="title_asc",
                q="AI policy",
            )

        count_sql, count_params = query_one.call_args.args
        self.assertIn(
            "where coalesce(content_items._search_text, '') ilike %s escape '\\'",
            count_sql,
        )
        self.assertEqual(count_params, ("%AI policy%",))

        items_sql, items_params = query_all.call_args.args
        self.assertIn(
            "where coalesce(content_items._search_text, '') ilike %s escape '\\'",
            items_sql,
        )
        self.assertIn(
            "order by content_items._normalized_title asc nulls last",
            items_sql,
        )
        self.assertEqual(items_params, ("%AI policy%", 20, 0))

    def test_system_selected_signal_candidates_are_visible_final_selected_search_items(self) -> None:
        with (
            patch.object(api_main, "query_one", return_value={"total": 1}) as query_one,
            patch.object(api_main, "query_all", return_value=[]) as query_all,
        ):
            api_main.list_system_selected_content_items_page(
                page=1,
                page_size=100,
                q="Deterministic selected title",
            )

        count_sql, count_params = query_one.call_args.args
        self.assertIn("'signal_candidate:' || a.doc_id::text as content_item_id", count_sql)
        self.assertIn("from signal_candidates a", count_sql)
        self.assertIn("join source_channels sc on sc.channel_id = a.channel_id", count_sql)
        self.assertIn("left join final_selection_results fsr on fsr.doc_id = a.doc_id", count_sql)
        self.assertIn("a.visibility_state = 'visible'", count_sql)
        self.assertIn("when fsr.doc_id is not null then coalesce(fsr.is_selected, false)", count_sql)
        self.assertIn("= true", count_sql)
        self.assertIn(
            "where coalesce(content_items._search_text, '') ilike %s escape '\\'",
            count_sql,
        )
        self.assertEqual(count_params, ("%Deterministic selected title%",))

        items_sql, items_params = query_all.call_args.args
        self.assertIn("'signal_candidate:' || a.doc_id::text as content_item_id", items_sql)
        self.assertIn("a.visibility_state = 'visible'", items_sql)
        self.assertIn("when fsr.doc_id is not null then coalesce(fsr.is_selected, false)", items_sql)
        self.assertIn("= true", items_sql)
        self.assertEqual(items_params, ("%Deterministic selected title%", 100, 0))

    def test_list_system_selected_content_items_supports_channel_filter(self) -> None:
        channel_id = "00000000-0000-4000-8000-000000000002"
        with (
            patch.object(api_main, "query_one", return_value={"total": 1}) as query_one,
            patch.object(api_main, "query_all", return_value=[]) as query_all,
        ):
            api_main.list_system_selected_content_items_page(
                page=1,
                page_size=20,
                q="advisory",
                channel_id=channel_id,
            )

        count_sql, count_params = query_one.call_args.args
        self.assertIn("content_items._channel_id = %s", count_sql)
        self.assertEqual(count_params, ("%advisory%", channel_id))

        items_sql, items_params = query_all.call_args.args
        self.assertIn("content_items._channel_id = %s", items_sql)
        self.assertEqual(items_params, ("%advisory%", channel_id, 20, 0))

    def test_dashboard_summary_counts_canonical_feed_families(self) -> None:
        summary = {
            "active_signals": 7,
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
            "when fsr.doc_id is not null then coalesce(fsr.is_selected, false)",
            sql,
        )
        self.assertIn("else coalesce(sfr.eligible_for_feed, false)", sql)
        self.assertIn("from final_selection_results fsr_processed", api_main.processed_signal_candidate_clause("a"))
        self.assertIn("from system_feed_results sfr_processed", sql)
        budget_sql = query_one.call_args_list[1].args[0]
        self.assertIn("from llm_review_log", budget_sql)
        self.assertIn("scope = 'criterion'", budget_sql)


if __name__ == "__main__":
    unittest.main()

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

if "services.workers.app.gemini" not in sys.modules:
    gemini_stub = types.ModuleType("services.workers.app.gemini")
    gemini_stub.review_with_gemini = lambda *args, **kwargs: None
    gemini_stub.DEFAULT_PRICE_CARD = {
        "default": {
            "input_cost_per_million_tokens_usd": 0.10,
            "output_cost_per_million_tokens_usd": 0.40,
        }
    }
    gemini_stub.PRICE_CARD_VERSION = "test"
    sys.modules["services.workers.app.gemini"] = gemini_stub

from services.api.app import main as api_main


class ApiSequenceManagementTests(unittest.TestCase):
    def test_sequence_maintenance_routes_are_registered(self) -> None:
        paths = {route.path for route in api_main.app.routes}

        self.assertIn("/maintenance/articles/{doc_id}/enrichment/retry", paths)
        self.assertIn("/maintenance/articles", paths)
        self.assertIn("/maintenance/articles/{doc_id}", paths)
        self.assertIn("/maintenance/articles/{doc_id}/explain", paths)
        self.assertIn("/maintenance/llm-budget-summary", paths)
        self.assertIn("/collections/system-selected", paths)
        self.assertIn("/content-items", paths)
        self.assertIn("/content-items/{content_item_id}", paths)
        self.assertIn("/content-items/{content_item_id}/explain", paths)
        self.assertIn("/system-interests", paths)
        self.assertIn("/system-interests/{interest_template_id}", paths)
        self.assertIn("/maintenance/sequences", paths)
        self.assertIn("/maintenance/sequences/{sequence_id}", paths)
        self.assertIn("/maintenance/sequences/{sequence_id}/runs", paths)
        self.assertIn("/maintenance/sequence-runs/{run_id}", paths)
        self.assertIn("/maintenance/sequence-runs/{run_id}/task-runs", paths)
        self.assertIn("/maintenance/sequence-runs/{run_id}/cancel", paths)
        self.assertIn("/maintenance/sequence-runs/{run_id}/retry", paths)
        self.assertIn("/maintenance/sequence-plugins", paths)

    def test_list_sequences_delegates_to_paginated_helper(self) -> None:
        expected = {"items": [{"sequence_id": "sequence-1"}], "total": 1}

        with patch.object(api_main, "list_sequences_page", return_value=expected) as helper:
            result = api_main.list_sequences(limit=25, page=2, page_size=5)

        self.assertEqual(result, expected)
        helper.assert_called_once_with(limit=25, page=2, page_size=5)

    def test_list_sequences_page_uses_sequence_select_and_pagination(self) -> None:
        items = [{"sequence_id": "sequence-1", "title": "Sequence 1"}]
        with (
            patch.object(api_main, "query_count", return_value=3) as query_count,
            patch.object(api_main, "query_all", return_value=items) as query_all,
        ):
            result = api_main.list_sequences_page(limit=20, page=2, page_size=4)

        self.assertEqual(result["total"], 3)
        self.assertEqual(result["page"], 2)
        self.assertEqual(result["pageSize"], 4)
        self.assertEqual(result["items"], items)

        count_sql = query_count.call_args.args[0]
        self.assertIn("from sequences", count_sql)

        items_sql, items_params = query_all.call_args.args
        self.assertIn("from sequences", items_sql)
        self.assertIn("order by updated_at desc, created_at desc", items_sql)
        self.assertEqual(items_params, (4, 4))

    def test_get_sequence_route_maps_missing_sequence_to_404(self) -> None:
        with patch.object(
            api_main,
            "get_sequence_definition",
            side_effect=api_main.SequenceNotFoundError("Sequence missing."),
        ):
            with self.assertRaises(api_main.HTTPException) as error:
                api_main.get_sequence("sequence-missing")

        self.assertEqual(error.exception.status_code, 404)
        self.assertEqual(error.exception.detail, "Sequence missing.")

    def test_create_sequence_route_returns_created_definition(self) -> None:
        payload = api_main.SequenceCreatePayload.model_validate(
            {
                "title": "Sequence 1",
                "editorState": {"viewport": {"x": 0, "y": 0, "zoom": 1}},
                "taskGraph": [
                    {
                        "key": "normalize",
                        "module": "article.normalize",
                        "options": {},
                    }
                ],
                "status": "draft",
            }
        )
        created = {
            "sequence_id": "sequence-1",
            "title": "Sequence 1",
            "status": "draft",
        }

        with patch.object(api_main, "create_sequence_definition", return_value=created) as create:
            result = api_main.create_sequence(payload)

        self.assertEqual(result, created)
        create.assert_called_once_with(payload)

    def test_create_sequence_route_maps_validation_to_422(self) -> None:
        payload = api_main.SequenceCreatePayload.model_validate(
            {
                "title": "Broken sequence",
                "taskGraph": [],
            }
        )

        with patch.object(
            api_main,
            "create_sequence_definition",
            side_effect=api_main.SequenceValidationError(["task_graph must not be empty."]),
        ):
            with self.assertRaises(api_main.HTTPException) as error:
                api_main.create_sequence(payload)

        self.assertEqual(error.exception.status_code, 422)
        self.assertEqual(error.exception.detail, ["task_graph must not be empty."])

    def test_update_sequence_route_maps_not_found_to_404(self) -> None:
        payload = api_main.SequenceUpdatePayload.model_validate(
            {
                "status": "active",
            }
        )

        with patch.object(
            api_main,
            "update_sequence_definition",
            side_effect=api_main.SequenceNotFoundError("Sequence missing."),
        ):
            with self.assertRaises(api_main.HTTPException) as error:
                api_main.update_sequence("sequence-missing", payload)

        self.assertEqual(error.exception.status_code, 404)
        self.assertEqual(error.exception.detail, "Sequence missing.")

    def test_update_sequence_route_rejects_null_for_non_nullable_fields(self) -> None:
        payload = api_main.SequenceUpdatePayload.model_validate({"taskGraph": None})

        with self.assertRaises(api_main.SequenceValidationError) as error:
            api_main.update_sequence_definition("sequence-1", payload)

        self.assertEqual(error.exception.errors, ["task_graph cannot be null."])

    def test_validate_sequence_editor_state_rejects_non_object(self) -> None:
        with self.assertRaises(api_main.SequenceValidationError) as error:
            api_main.validate_sequence_editor_state("bad-state")  # type: ignore[arg-type]

        self.assertEqual(error.exception.errors, ["editor_state must be an object."])

    def test_delete_sequence_route_archives_sequence(self) -> None:
        archived = {
            "sequence_id": "sequence-1",
            "status": "archived",
        }

        with patch.object(api_main, "archive_sequence_definition", return_value=archived) as archive:
            result = api_main.delete_sequence("sequence-1")

        self.assertEqual(result, archived)
        archive.assert_called_once_with("sequence-1")

    def test_get_sequence_plugins_returns_builtin_modules(self) -> None:
        result = api_main.get_sequence_plugins()
        modules = {item["module"] for item in result}

        self.assertIn("enrichment.article_extract", modules)
        self.assertIn("article.normalize", modules)
        self.assertIn("article.notify", modules)
        self.assertIn("maintenance.reindex", modules)

    def test_request_article_enrichment_retry_reuses_active_article_sequence(self) -> None:
        with (
            patch.object(
                api_main,
                "query_one",
                side_effect=[
                    {"doc_id": "doc-1"},
                    {"sequence_id": "sequence-article", "status": "active"},
                ],
            ) as query_one,
            patch.object(
                api_main,
                "create_sequence_run_request_for_trigger",
                return_value={"run_id": "run-1", "status": "pending"},
            ) as create_run,
            patch.object(api_main, "ensure_published_article_retry_event") as ensure_event,
        ):
            result = api_main.request_article_enrichment_retry(
                "doc-1",
                api_main.ArticleEnrichmentRetryPayload.model_validate(
                    {"requestedBy": "operator-1"}
                ),
            )

        self.assertEqual(result, {"run_id": "run-1", "status": "pending"})
        self.assertEqual(query_one.call_count, 2)
        create_run.assert_called_once()
        ensure_event.assert_called_once()
        event_id = ensure_event.call_args.kwargs["event_id"]
        self.assertEqual(ensure_event.call_args.kwargs["doc_id"], "doc-1")
        args = create_run.call_args.kwargs
        self.assertEqual(args["context_json"]["doc_id"], "doc-1")
        self.assertEqual(args["context_json"]["event_id"], event_id)
        self.assertTrue(args["context_json"]["force_enrichment"])
        self.assertEqual(args["trigger_meta"]["requestedBy"], "operator-1")
        self.assertEqual(args["trigger_meta"]["source"], "maintenance_article_enrichment_retry")
        self.assertEqual(args["trigger_type"], "manual")

    def test_llm_budget_summary_uses_precise_usd_comparison(self) -> None:
        with (
            patch.object(api_main, "query_one", return_value={"month_to_date_cost_usd": "0.995"}),
            patch.dict(
                api_main.os.environ,
                {
                    "LLM_REVIEW_ENABLED": "1",
                    "LLM_REVIEW_MONTHLY_BUDGET_CENTS": "100",
                    "LLM_REVIEW_BUDGET_EXHAUST_ACCEPT_GRAY_ZONE": "1",
                },
                clear=False,
            ),
        ):
            summary = api_main.get_llm_budget_summary()

        self.assertFalse(summary["monthlyQuotaReached"])
        self.assertEqual(summary["monthToDateCostCents"], 100)
        self.assertEqual(summary["remainingMonthlyBudgetCents"], 1)
        self.assertTrue(summary["acceptGrayZoneOnBudgetExhaustion"])

    def test_request_content_item_enrichment_retry_reuses_editorial_retry_flow(self) -> None:
        with patch.object(
            api_main,
            "request_article_enrichment_retry_route",
            return_value={"run_id": "run-2", "status": "pending"},
        ) as request_retry:
            result = api_main.request_content_item_enrichment_retry_route(
                "editorial:doc-2",
                api_main.ArticleEnrichmentRetryPayload.model_validate({"requestedBy": "operator-1"}),
            )

        self.assertEqual(result, {"run_id": "run-2", "status": "pending"})
        request_retry.assert_called_once()
        self.assertEqual(request_retry.call_args.args[0], "doc-2")

    def test_request_content_item_enrichment_retry_rejects_non_editorial_items(self) -> None:
        with self.assertRaises(api_main.HTTPException) as error:
            api_main.request_content_item_enrichment_retry_route("resource:item-2")

        self.assertEqual(error.exception.status_code, 409)

    def test_request_sequence_run_route_maps_dispatch_failure_to_503(self) -> None:
        payload = api_main.SequenceManualRunPayload.model_validate(
            {
                "contextJson": {"doc_id": "doc-1"},
                "triggerMeta": {"sourceEventId": "event-1"},
                "requestedBy": "operator@example.com",
            }
        )

        with patch.object(
            api_main,
            "create_sequence_run_request",
            side_effect=api_main.SequenceDispatchError("BullMQ transport is unavailable."),
        ):
            with self.assertRaises(api_main.HTTPException) as error:
                api_main.request_sequence_run("sequence-1", payload)

        self.assertEqual(error.exception.status_code, 503)
        self.assertEqual(error.exception.detail, "BullMQ transport is unavailable.")

    def test_get_sequence_run_task_runs_uses_parent_run_guard(self) -> None:
        task_runs = [{"task_run_id": "task-run-1", "task_key": "normalize"}]
        with (
            patch.object(api_main, "get_sequence_run", return_value={"run_id": "run-1"}) as get_run,
            patch.object(api_main, "query_all", return_value=task_runs) as query_all,
        ):
            result = api_main.list_sequence_task_runs("run-1")

        self.assertEqual(result, task_runs)
        get_run.assert_called_once_with("run-1")

        sql, params = query_all.call_args.args
        self.assertIn("from sequence_task_runs", sql)
        self.assertIn("order by task_index asc, created_at asc", sql)
        self.assertEqual(params, ("run-1",))

    def test_cancel_sequence_run_route_uses_optional_reason(self) -> None:
        payload = api_main.SequenceCancelPayload.model_validate({"reason": "Operator requested stop."})
        cancelled = {"run_id": "run-1", "status": "cancelled"}

        with patch.object(api_main, "cancel_sequence_run_request", return_value=cancelled) as cancel:
            result = api_main.cancel_sequence_run("run-1", payload)

        self.assertEqual(result, cancelled)
        cancel.assert_called_once_with("run-1", reason="Operator requested stop.")

    def test_retry_sequence_run_route_uses_retry_helper(self) -> None:
        payload = api_main.SequenceRetryRunPayload.model_validate(
            {
                "requestedBy": "operator-1",
                "contextOverrides": {"force": True},
                "triggerMeta": {"sourceEventId": "run-1"},
            }
        )
        retried = {
            "run_id": "run-2",
            "status": "pending",
            "retry_of_run_id": "run-1",
        }

        with patch.object(api_main, "retry_sequence_run_request", return_value=retried) as retry:
            result = api_main.retry_sequence_run("run-1", payload)

        self.assertEqual(result, retried)
        retry.assert_called_once_with("run-1", payload)

    def test_retry_sequence_run_request_reuses_failed_run_context(self) -> None:
        payload = api_main.SequenceRetryRunPayload.model_validate(
            {
                "requestedBy": "operator-1",
                "contextOverrides": {"force": True},
                "triggerMeta": {"sourceEventId": "run-1"},
            }
        )
        existing_run = {
            "run_id": "run-1",
            "sequence_id": "sequence-1",
            "status": "failed",
            "context_json": {"doc_id": "doc-9"},
            "trigger_type": "manual",
            "trigger_meta": {"source": "maintenance_api"},
        }

        with (
            patch.object(api_main, "get_sequence_run", return_value=existing_run),
            patch.object(
                api_main,
                "create_sequence_run_request_for_trigger",
                return_value={"run_id": "run-2", "status": "pending"},
            ) as create_run,
        ):
            result = api_main.retry_sequence_run_request("run-1", payload)

        self.assertEqual(result, {"run_id": "run-2", "status": "pending"})
        create_run.assert_called_once()
        kwargs = create_run.call_args.kwargs
        self.assertEqual(kwargs["retry_of_run_id"], "run-1")
        self.assertEqual(kwargs["context_json"]["doc_id"], "doc-9")
        self.assertTrue(kwargs["context_json"]["force"])
        self.assertEqual(kwargs["trigger_meta"]["retryOfRunId"], "run-1")
        self.assertEqual(kwargs["trigger_meta"]["requestedBy"], "operator-1")


if __name__ == "__main__":
    unittest.main()

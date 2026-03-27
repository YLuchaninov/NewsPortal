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


class ApiSequenceManagementTests(unittest.TestCase):
    def test_sequence_maintenance_routes_are_registered(self) -> None:
        paths = {route.path for route in api_main.app.routes}

        self.assertIn("/maintenance/sequences", paths)
        self.assertIn("/maintenance/sequences/{sequence_id}", paths)
        self.assertIn("/maintenance/sequences/{sequence_id}/runs", paths)
        self.assertIn("/maintenance/sequence-runs/{run_id}", paths)
        self.assertIn("/maintenance/sequence-runs/{run_id}/task-runs", paths)
        self.assertIn("/maintenance/sequence-runs/{run_id}/cancel", paths)
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

        self.assertIn("article.normalize", modules)
        self.assertIn("article.notify", modules)
        self.assertIn("maintenance.reindex", modules)

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


if __name__ == "__main__":
    unittest.main()

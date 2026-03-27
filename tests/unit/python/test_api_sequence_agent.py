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


class ApiSequenceAgentTests(unittest.TestCase):
    def test_agent_sequence_routes_are_registered(self) -> None:
        paths = {route.path for route in api_main.app.routes}

        self.assertIn("/maintenance/agent/sequence-tools", paths)
        self.assertIn("/maintenance/agent/sequences", paths)

    def test_agent_sequence_tools_wrap_plugin_catalog(self) -> None:
        result = api_main.get_agent_sequence_tools()

        self.assertEqual(result["sequenceDefaults"]["status"], "draft")
        self.assertEqual(result["sequenceDefaults"]["triggerType"], "agent")
        modules = {item["module"] for item in result["availablePlugins"]}
        self.assertIn("article.normalize", modules)
        self.assertIn("discovery.web_search", modules)

    def test_normalize_sequence_cron_accepts_valid_expression(self) -> None:
        self.assertEqual(api_main.normalize_sequence_cron("*/15 * * * *"), "*/15 * * * *")

    def test_normalize_sequence_cron_rejects_invalid_expression(self) -> None:
        with self.assertRaises(api_main.SequenceValidationError) as error:
            api_main.normalize_sequence_cron("bad cron")

        self.assertEqual(error.exception.errors, ["cron is invalid: Cron expression must contain exactly five fields."])

    def test_create_agent_sequence_request_forces_draft_sequence(self) -> None:
        payload = api_main.AgentSequenceCreatePayload.model_validate(
            {
                "title": "Agent discovery",
                "taskGraph": [
                    {
                        "key": "search",
                        "module": "discovery.web_search",
                        "options": {"query": "ukraine tech"},
                    }
                ],
                "runNow": False,
            }
        )
        created_sequence = {
            "sequence_id": "sequence-agent-1",
            "status": "draft",
        }

        with (
            patch.object(api_main, "create_sequence_definition", return_value=created_sequence) as create,
            patch.object(api_main, "create_sequence_run_request_for_trigger") as run_helper,
        ):
            result = api_main.create_agent_sequence_request(payload)

        self.assertEqual(result, {"sequence": created_sequence, "run": None})
        create_payload = create.call_args.args[0]
        self.assertEqual(create_payload.status, "draft")
        self.assertEqual(create_payload.created_by, "agent")
        run_helper.assert_not_called()

    def test_create_agent_sequence_request_can_create_and_run(self) -> None:
        payload = api_main.AgentSequenceCreatePayload.model_validate(
            {
                "title": "Agent discovery",
                "taskGraph": [
                    {
                        "key": "search",
                        "module": "discovery.web_search",
                        "options": {"query": "ukraine tech"},
                    }
                ],
                "contextJson": {"hypothesis": "Look for startup blogs"},
                "triggerMeta": {"conversationId": "conv-1"},
                "createdBy": "agent:planner",
                "runNow": True,
            }
        )
        created_sequence = {
            "sequence_id": "sequence-agent-2",
            "status": "draft",
        }
        run = {
            "run_id": "run-agent-1",
            "status": "pending",
        }

        with (
            patch.object(api_main, "create_sequence_definition", return_value=created_sequence),
            patch.object(api_main, "create_sequence_run_request_for_trigger", return_value=run) as run_helper,
        ):
            result = api_main.create_agent_sequence_request(payload)

        self.assertEqual(result, {"sequence": created_sequence, "run": run})
        _, kwargs = run_helper.call_args
        self.assertEqual(kwargs["context_json"], {"hypothesis": "Look for startup blogs"})
        self.assertEqual(kwargs["trigger_type"], "agent")
        self.assertEqual(kwargs["trigger_meta"]["source"], "agent_api")
        self.assertEqual(kwargs["trigger_meta"]["createdSequenceId"], "sequence-agent-2")
        self.assertEqual(kwargs["trigger_meta"]["requestedBy"], "agent:planner")

    def test_create_agent_sequence_route_maps_dispatch_failure_to_503(self) -> None:
        payload = api_main.AgentSequenceCreatePayload.model_validate(
            {
                "title": "Agent discovery",
                "taskGraph": [
                    {
                        "key": "search",
                        "module": "discovery.web_search",
                        "options": {"query": "ukraine tech"},
                    }
                ],
            }
        )

        with patch.object(
            api_main,
            "create_agent_sequence_request",
            side_effect=api_main.SequenceDispatchError("BullMQ transport is unavailable."),
        ):
            with self.assertRaises(api_main.HTTPException) as error:
                api_main.create_agent_sequence(payload)

        self.assertEqual(error.exception.status_code, 503)
        self.assertEqual(error.exception.detail, "BullMQ transport is unavailable.")


if __name__ == "__main__":
    unittest.main()

import json
import os
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

from services.workers.app.task_engine.adapters.llm_analyzer import (
    GeminiLlmAnalyzerAdapter,
)


class _FakeHttpResponse:
    def __init__(self, payload: dict[str, object]) -> None:
        self._payload = payload

    def __enter__(self) -> "_FakeHttpResponse":
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        return None

    def read(self) -> bytes:
        return json.dumps(self._payload).encode("utf-8")


class DiscoveryLlmAdapterTests(unittest.TestCase):
    def test_adapter_uses_discovery_model_fallback_and_zero_cost_without_api_key(self) -> None:
        adapter = GeminiLlmAnalyzerAdapter()

        with patch.dict(
            os.environ,
            {
                "GEMINI_MODEL": "gemini-legacy",
                "DISCOVERY_GEMINI_MODEL": "gemini-discovery",
            },
            clear=False,
        ):
            result = adapter.analyze(
                prompt=None,
                task="discovery_plan_hypotheses",
                payload={"topics": ["AI"], "target_provider_types": ["rss"]},
                model=None,
                temperature=0.0,
                output_schema=None,
            )

        self.assertEqual(result["meta"]["model"], "gemini-discovery")
        self.assertEqual(result["meta"]["request_count"], 0)
        self.assertEqual(result["meta"]["cost_usd"], 0.0)
        self.assertTrue(result["meta"]["deterministic_fallback"])
        self.assertIn("not configured", str(result["meta"]["error"]))
        self.assertTrue(str(result["result"][0]["search_query"]))
        self.assertIn("class_key", result["result"][0])

    def test_adapter_uses_discovery_tariff_envs_for_provider_cost_metadata(self) -> None:
        adapter = GeminiLlmAnalyzerAdapter()
        captured_urls: list[str] = []

        def fake_urlopen(request, timeout: int = 30):  # type: ignore[no-untyped-def]
            del timeout
            captured_urls.append(str(request.full_url))
            return _FakeHttpResponse(
                {
                    "candidates": [
                        {
                            "content": {
                                "parts": [
                                    {
                                        "text": json.dumps({"ok": True}),
                                    }
                                ]
                            }
                        }
                    ],
                    "usageMetadata": {
                        "promptTokenCount": 1000,
                        "candidatesTokenCount": 500,
                        "totalTokenCount": 1500,
                    },
                }
            )

        with (
            patch.dict(
                os.environ,
                {
                    "DISCOVERY_GEMINI_API_KEY": "discovery-key",
                    "DISCOVERY_GEMINI_MODEL": "gemini-discovery",
                    "DISCOVERY_GEMINI_BASE_URL": "https://example.test/v1beta",
                    "DISCOVERY_LLM_INPUT_COST_PER_MILLION_USD": "0.50",
                    "DISCOVERY_LLM_OUTPUT_COST_PER_MILLION_USD": "1.50",
                },
                clear=False,
            ),
            patch(
                "services.workers.app.task_engine.adapters.llm_analyzer.urlopen",
                side_effect=fake_urlopen,
            ),
        ):
            result = adapter.analyze(
                prompt="Return JSON",
                task="generic",
                payload={"topic": "AI"},
                model=None,
                temperature=0.2,
                output_schema=None,
            )

        self.assertEqual(result["result"], {"ok": True})
        self.assertEqual(result["meta"]["provider"], "gemini")
        self.assertEqual(result["meta"]["model"], "gemini-discovery")
        self.assertEqual(result["meta"]["request_count"], 1)
        self.assertEqual(result["meta"]["prompt_tokens"], 1000)
        self.assertEqual(result["meta"]["completion_tokens"], 500)
        self.assertEqual(result["meta"]["price_card_source"], "discovery_env_override")
        self.assertAlmostEqual(result["meta"]["cost_usd"], 0.00125, places=6)
        self.assertIn(
            "https://example.test/v1beta/models/gemini-discovery:generateContent?key=discovery-key",
            captured_urls[0],
        )


if __name__ == "__main__":
    unittest.main()

import json
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest.mock import patch

from services.workers.app.gemini import (
    _estimate_cost_usd,
    _read_usage_metadata,
    _resolve_price_card,
    review_with_gemini,
)


class _FakeGeminiHandler(BaseHTTPRequestHandler):
    response_payload: dict[str, object] = {}
    request_paths: list[str] = []

    def do_POST(self) -> None:  # noqa: N802 - stdlib handler contract
        content_length = int(self.headers.get("Content-Length", "0") or 0)
        if content_length > 0:
            self.rfile.read(content_length)
        type(self).request_paths.append(self.path)
        encoded = json.dumps(type(self).response_payload, ensure_ascii=True).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def log_message(self, format: str, *args: object) -> None:  # noqa: A003 - stdlib signature
        return None


class GeminiTests(unittest.TestCase):
    def test_read_usage_metadata_parses_provider_usage_fields(self) -> None:
        prompt_tokens, completion_tokens, total_tokens, usage = _read_usage_metadata(
            {
                "usageMetadata": {
                    "promptTokenCount": "123",
                    "candidatesTokenCount": 45,
                    "totalTokenCount": "168",
                }
            }
        )

        self.assertEqual(prompt_tokens, 123)
        self.assertEqual(completion_tokens, 45)
        self.assertEqual(total_tokens, 168)
        self.assertEqual(usage["promptTokenCount"], "123")

    def test_estimate_cost_usd_uses_versioned_price_card(self) -> None:
        self.assertEqual(_estimate_cost_usd("gemini-2.0-flash", 1000, 500), 0.0003)
        self.assertIsNone(_estimate_cost_usd("gemini-2.0-flash", None, None))

    def test_estimate_cost_usd_prefers_env_overrides(self) -> None:
        with patch.dict(
            "os.environ",
            {
                "LLM_INPUT_COST_PER_MILLION_USD": "1.5",
                "LLM_OUTPUT_COST_PER_MILLION_USD": "2.5",
            },
            clear=False,
        ):
            self.assertEqual(_estimate_cost_usd("gemini-2.0-flash", 1000, 500), 0.00275)

    def test_resolve_price_card_keeps_default_when_env_invalid(self) -> None:
        with patch.dict(
            "os.environ",
            {
                "LLM_INPUT_COST_PER_MILLION_USD": "oops",
                "LLM_OUTPUT_COST_PER_MILLION_USD": "-1",
            },
            clear=False,
        ):
            price_card, metadata = _resolve_price_card("gemini-2.0-flash")

        self.assertEqual(
            price_card,
            {
                "input_cost_per_million_tokens_usd": 0.10,
                "output_cost_per_million_tokens_usd": 0.40,
            },
        )
        self.assertEqual(metadata["priceCardSource"], "default_with_invalid_env")
        self.assertEqual(len(metadata["priceCardWarnings"]), 2)

    def test_review_with_gemini_returns_usage_unavailable_without_api_key(self) -> None:
        with patch.dict("os.environ", {}, clear=True):
            result = review_with_gemini("review this article")

        self.assertEqual(result.decision, "uncertain")
        self.assertEqual(result.provider_latency_ms, None)
        self.assertEqual(result.prompt_tokens, None)
        self.assertEqual(result.completion_tokens, None)
        self.assertEqual(result.total_tokens, None)
        self.assertEqual(result.cost_estimate_usd, None)
        self.assertEqual(result.provider_usage_json, {})

    def test_review_with_gemini_parses_usage_metadata_from_provider_response(self) -> None:
        class Handler(_FakeGeminiHandler):
            pass

        Handler.response_payload = {
            "candidates": [
                {
                    "content": {
                        "parts": [
                            {
                                "text": '{"decision":"approve","score":0.75,"reason":"provider test"}'
                            }
                        ]
                    }
                }
            ],
            "usageMetadata": {
                "promptTokenCount": 200,
                "candidatesTokenCount": 100,
                "totalTokenCount": 300,
            },
        }
        Handler.request_paths = []
        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with patch.dict(
                "os.environ",
                {
                    "GEMINI_API_KEY": "local-proof-key",
                    "GEMINI_MODEL": "gemini-2.0-flash",
                    "GEMINI_BASE_URL": f"http://127.0.0.1:{server.server_port}",
                    "LLM_INPUT_COST_PER_MILLION_USD": "0.10",
                    "LLM_OUTPUT_COST_PER_MILLION_USD": "0.40",
                },
                clear=False,
            ):
                result = review_with_gemini("review this article")
        finally:
            server.shutdown()
            thread.join(timeout=5)
            server.server_close()

        self.assertEqual(result.decision, "approve")
        self.assertEqual(result.prompt_tokens, 200)
        self.assertEqual(result.completion_tokens, 100)
        self.assertEqual(result.total_tokens, 300)
        self.assertEqual(result.cost_estimate_usd, 0.00006)
        self.assertEqual(result.provider_usage_json["priceCardSource"], "env_override")
        self.assertEqual(
            result.provider_usage_json["usageMetadata"]["totalTokenCount"],
            300,
        )
        self.assertEqual(len(Handler.request_paths), 1)
        self.assertIn("/models/gemini-2.0-flash:generateContent", Handler.request_paths[0])


if __name__ == "__main__":
    unittest.main()

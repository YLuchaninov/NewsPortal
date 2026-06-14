import json
import unittest
import sys
from unittest.mock import patch

if "signalops.workers.gemini" in sys.modules and not hasattr(
    sys.modules["signalops.workers.gemini"],
    "_estimate_cost_usd",
):
    del sys.modules["signalops.workers.gemini"]

from signalops.workers.gemini import (
    _estimate_cost_usd,
    _read_usage_metadata,
    _resolve_price_card,
    review_with_gemini,
)


class _FakeGeminiResponse:
    def __init__(self, payload: dict[str, object]) -> None:
        self._payload = payload

    def __enter__(self) -> "_FakeGeminiResponse":
        return self

    def __exit__(self, *_args: object) -> None:
        return None

    def read(self) -> bytes:
        return json.dumps(self._payload, ensure_ascii=True).encode("utf-8")


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
        self.assertEqual(_estimate_cost_usd("gemini-3.1-flash-lite", 1000, 500), 0.001)
        self.assertEqual(_estimate_cost_usd("gemini-3.5-flash", 1000, 500), 0.006)
        self.assertIsNone(_estimate_cost_usd("gemini-3.1-flash-lite", None, None))

    def test_estimate_cost_usd_prefers_env_overrides(self) -> None:
        with patch.dict(
            "os.environ",
            {
                "LLM_INPUT_COST_PER_MILLION_USD": "1.5",
                "LLM_OUTPUT_COST_PER_MILLION_USD": "2.5",
            },
            clear=False,
        ):
            self.assertEqual(_estimate_cost_usd("gemini-3.1-flash-lite", 1000, 500), 0.00275)

    def test_resolve_price_card_keeps_default_when_env_invalid(self) -> None:
        with patch.dict(
            "os.environ",
            {
                "LLM_INPUT_COST_PER_MILLION_USD": "oops",
                "LLM_OUTPUT_COST_PER_MILLION_USD": "-1",
            },
            clear=False,
        ):
            price_card, metadata = _resolve_price_card("gemini-3.1-flash-lite")

        self.assertEqual(
            price_card,
            {
                "input_cost_per_million_tokens_usd": 0.25,
                "output_cost_per_million_tokens_usd": 1.50,
            },
        )
        self.assertEqual(metadata["priceCardSource"], "default_with_invalid_env")
        self.assertEqual(len(metadata["priceCardWarnings"]), 2)

    def test_review_with_gemini_returns_usage_unavailable_without_api_key(self) -> None:
        with patch.dict("os.environ", {}, clear=True):
            result = review_with_gemini("review this signal candidate")

        self.assertEqual(result.decision, "uncertain")
        self.assertEqual(result.provider_latency_ms, None)
        self.assertEqual(result.prompt_tokens, None)
        self.assertEqual(result.completion_tokens, None)
        self.assertEqual(result.total_tokens, None)
        self.assertEqual(result.cost_estimate_usd, None)
        self.assertEqual(result.provider_usage_json, {})

    def test_review_with_gemini_parses_usage_metadata_from_provider_response(self) -> None:
        response_payload: dict[str, object] = {
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
        request_urls: list[str] = []

        def fake_urlopen(request: object, timeout: int = 30) -> _FakeGeminiResponse:
            request_urls.append(getattr(request, "full_url"))
            self.assertEqual(timeout, 30)
            return _FakeGeminiResponse(response_payload)

        with patch("signalops.workers.gemini.urlopen", fake_urlopen):
            with patch.dict(
                "os.environ",
                {
                    "GEMINI_API_KEY": "local-proof-key",
                    "GEMINI_MODEL": "gemini-3.1-flash-lite",
                    "GEMINI_BASE_URL": "http://gemini.local.test",
                    "LLM_INPUT_COST_PER_MILLION_USD": "0.10",
                    "LLM_OUTPUT_COST_PER_MILLION_USD": "0.40",
                },
                clear=False,
            ):
                result = review_with_gemini("review this signal candidate")

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
        self.assertEqual(len(request_urls), 1)
        self.assertIn("/models/gemini-3.1-flash-lite:generateContent", request_urls[0])

    def test_review_with_gemini_accepts_provider_json_array_response(self) -> None:
        response_payload: dict[str, object] = {
            "candidates": [
                {
                    "content": {
                        "parts": [
                            {
                                "text": '[{"decision":"reject","score":"0.2","reason":"array shape"}]'
                            }
                        ]
                    }
                }
            ],
            "usageMetadata": {
                "promptTokenCount": 10,
                "candidatesTokenCount": 5,
                "totalTokenCount": 15,
            },
        }

        def fake_urlopen(_request: object, timeout: int = 30) -> _FakeGeminiResponse:
            self.assertEqual(timeout, 30)
            return _FakeGeminiResponse(response_payload)

        with patch("signalops.workers.gemini.urlopen", fake_urlopen):
            with patch.dict(
                "os.environ",
                {
                    "GEMINI_API_KEY": "local-proof-key",
                    "GEMINI_BASE_URL": "http://gemini.local.test",
                },
                clear=False,
            ):
                result = review_with_gemini("review this signal candidate")

        self.assertEqual(result.decision, "reject")
        self.assertEqual(result.score, 0.2)
        self.assertEqual(
            result.response_json["parsed"]["_providerShapeWarning"],
            "review_json_array_first_object_used",
        )


if __name__ == "__main__":
    unittest.main()

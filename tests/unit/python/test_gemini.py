import unittest
from unittest.mock import patch

from services.workers.app.gemini import (
    _estimate_cost_usd,
    _read_usage_metadata,
    _resolve_price_card,
    review_with_gemini,
)


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


if __name__ == "__main__":
    unittest.main()

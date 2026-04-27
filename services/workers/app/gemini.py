from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


@dataclass(frozen=True)
class GeminiReviewResult:
    decision: str
    score: float
    response_json: dict[str, Any]
    model: str
    provider_latency_ms: int | None
    prompt_tokens: int | None
    completion_tokens: int | None
    total_tokens: int | None
    cost_estimate_usd: float | None
    provider_usage_json: dict[str, Any]


PRICE_CARD_VERSION = "gemini-2026-03"
ENV_INPUT_COST_PER_MILLION_USD = "LLM_INPUT_COST_PER_MILLION_USD"
ENV_OUTPUT_COST_PER_MILLION_USD = "LLM_OUTPUT_COST_PER_MILLION_USD"
DEFAULT_PRICE_CARD = {
    "default": {
        "input_cost_per_million_tokens_usd": 0.10,
        "output_cost_per_million_tokens_usd": 0.40,
    },
    "gemini-2.0-flash": {
        "input_cost_per_million_tokens_usd": 0.10,
        "output_cost_per_million_tokens_usd": 0.40,
    },
}


def _read_non_negative_float_env(name: str) -> tuple[float | None, str | None]:
    raw_value = os.getenv(name)
    if raw_value is None:
        return None, None

    candidate = raw_value.strip()
    if not candidate:
        return None, None

    try:
        parsed = float(candidate)
    except ValueError:
        return None, f"{name} must be a non-negative number."

    if parsed < 0:
        return None, f"{name} must be a non-negative number."
    return parsed, None


def _read_text_part(payload: dict[str, Any]) -> str:
    candidates = payload.get("candidates")
    if not isinstance(candidates, list) or not candidates:
        return ""
    first_candidate = candidates[0]
    if not isinstance(first_candidate, dict):
        return ""
    content = first_candidate.get("content")
    if not isinstance(content, dict):
        return ""
    parts = content.get("parts")
    if not isinstance(parts, list):
        return ""
    for part in parts:
        if isinstance(part, dict) and isinstance(part.get("text"), str):
            return str(part["text"])
    return ""


def _parse_json_fragment(value: str) -> dict[str, Any] | None:
    candidate = value.strip()
    if not candidate:
        return None
    try:
        return json.loads(candidate)
    except json.JSONDecodeError:
        pass

    start = candidate.find("{")
    end = candidate.rfind("}")
    if start >= 0 and end > start:
        try:
            return json.loads(candidate[start : end + 1])
        except json.JSONDecodeError:
            return None
    return None


def _normalize_decision(value: Any) -> str:
    normalized = str(value or "").strip().lower()
    if normalized in {"approve", "approved"}:
        return "approve"
    if normalized in {"reject", "rejected"}:
        return "reject"
    return "uncertain"


def _read_usage_metadata(payload: dict[str, Any]) -> tuple[int | None, int | None, int | None, dict[str, Any]]:
    usage_metadata = payload.get("usageMetadata")
    if not isinstance(usage_metadata, dict):
        return None, None, None, {}

    def read_token_count(key: str) -> int | None:
        raw_value = usage_metadata.get(key)
        if isinstance(raw_value, int) and raw_value >= 0:
            return raw_value
        if isinstance(raw_value, str):
            try:
                parsed = int(raw_value)
            except ValueError:
                return None
            return parsed if parsed >= 0 else None
        return None

    return (
        read_token_count("promptTokenCount"),
        read_token_count("candidatesTokenCount"),
        read_token_count("totalTokenCount"),
        usage_metadata,
    )


def _resolve_price_card(model: str) -> tuple[dict[str, float], dict[str, Any]]:
    model_key = model if model in DEFAULT_PRICE_CARD else "default"
    price_card = dict(DEFAULT_PRICE_CARD[model_key])
    warnings: list[str] = []

    input_override, input_warning = _read_non_negative_float_env(ENV_INPUT_COST_PER_MILLION_USD)
    output_override, output_warning = _read_non_negative_float_env(ENV_OUTPUT_COST_PER_MILLION_USD)
    if input_warning:
        warnings.append(input_warning)
    if output_warning:
        warnings.append(output_warning)

    if input_override is not None:
        price_card["input_cost_per_million_tokens_usd"] = input_override
    if output_override is not None:
        price_card["output_cost_per_million_tokens_usd"] = output_override

    if input_override is not None and output_override is not None:
        source = "env_override"
    elif input_override is not None or output_override is not None:
        source = "env_partial_override"
    else:
        source = "default"

    if warnings:
        source = f"{source}_with_invalid_env"

    return price_card, {
        "priceCardVersion": PRICE_CARD_VERSION,
        "priceCardSource": source,
        "priceCardModelKey": model_key,
        "priceCardWarnings": warnings,
    }


def _estimate_cost_usd(
    model: str,
    prompt_tokens: int | None,
    completion_tokens: int | None,
    price_card: dict[str, float] | None = None,
) -> float | None:
    if prompt_tokens is None and completion_tokens is None:
        return None

    resolved_price_card = price_card
    if resolved_price_card is None:
        resolved_price_card, _ = _resolve_price_card(model)
    input_cost = float(prompt_tokens or 0) / 1_000_000 * float(
        resolved_price_card["input_cost_per_million_tokens_usd"]
    )
    output_cost = float(completion_tokens or 0) / 1_000_000 * float(
        resolved_price_card["output_cost_per_million_tokens_usd"]
    )
    return round(input_cost + output_cost, 6)


def review_with_gemini(
    prompt: str,
    *,
    model_override: str | None = None,
    temperature: float = 0.1,
) -> GeminiReviewResult:
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    model = (model_override or os.getenv("GEMINI_MODEL", "gemini-2.0-flash")).strip() or "gemini-2.0-flash"
    base_url = (
        os.getenv("GEMINI_BASE_URL", "https://generativelanguage.googleapis.com/v1beta")
        .rstrip("/")
    )

    if not api_key:
        return GeminiReviewResult(
            decision="uncertain",
            score=0.0,
            response_json={"error": "GEMINI_API_KEY is not configured."},
            model=model,
            provider_latency_ms=None,
            prompt_tokens=None,
            completion_tokens=None,
            total_tokens=None,
            cost_estimate_usd=None,
            provider_usage_json={},
        )

    url = f"{base_url}/models/{model}:generateContent?key={api_key}"
    body = {
        "contents": [
            {
                "role": "user",
                "parts": [{"text": prompt}],
            }
        ],
        "generationConfig": {
            "temperature": temperature,
            "responseMimeType": "application/json",
        },
    }
    request = Request(
        url,
        data=json.dumps(body, ensure_ascii=True).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        started_at = time.perf_counter()
        with urlopen(request, timeout=30) as response:
            payload = json.loads(response.read().decode("utf-8"))
        provider_latency_ms = int((time.perf_counter() - started_at) * 1000)
    except (HTTPError, URLError, TimeoutError) as error:
        return GeminiReviewResult(
            decision="uncertain",
            score=0.0,
            response_json={"error": str(error)},
            model=model,
            provider_latency_ms=None,
            prompt_tokens=None,
            completion_tokens=None,
            total_tokens=None,
            cost_estimate_usd=None,
            provider_usage_json={},
        )

    text_part = _read_text_part(payload)
    parsed = _parse_json_fragment(text_part) or {}
    prompt_tokens, completion_tokens, total_tokens, usage_metadata = _read_usage_metadata(payload)
    price_card, price_card_metadata = _resolve_price_card(model)
    cost_estimate_usd = _estimate_cost_usd(
        model,
        prompt_tokens,
        completion_tokens,
        price_card=price_card,
    )
    score = 0.0
    raw_score = parsed.get("score")
    if isinstance(raw_score, (int, float)):
        score = float(raw_score)
    elif isinstance(raw_score, str):
        try:
            score = float(raw_score)
        except ValueError:
            score = 0.0

    return GeminiReviewResult(
        decision=_normalize_decision(parsed.get("decision")),
        score=score,
        response_json={
            "providerResponse": payload,
            "parsed": parsed,
        },
        model=model,
        provider_latency_ms=provider_latency_ms,
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        total_tokens=total_tokens,
        cost_estimate_usd=cost_estimate_usd,
        provider_usage_json={
            **price_card_metadata,
            "priceCard": price_card,
            "usageMetadata": usage_metadata,
        },
    )

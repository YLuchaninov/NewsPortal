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


def _resolve_price_card(model: str) -> dict[str, float]:
    return DEFAULT_PRICE_CARD.get(model, DEFAULT_PRICE_CARD["default"])


def _estimate_cost_usd(
    model: str,
    prompt_tokens: int | None,
    completion_tokens: int | None,
) -> float | None:
    if prompt_tokens is None and completion_tokens is None:
        return None

    price_card = _resolve_price_card(model)
    input_cost = float(prompt_tokens or 0) / 1_000_000 * float(
        price_card["input_cost_per_million_tokens_usd"]
    )
    output_cost = float(completion_tokens or 0) / 1_000_000 * float(
        price_card["output_cost_per_million_tokens_usd"]
    )
    return round(input_cost + output_cost, 6)


def review_with_gemini(prompt: str) -> GeminiReviewResult:
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    model = os.getenv("GEMINI_MODEL", "gemini-2.0-flash").strip() or "gemini-2.0-flash"
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
            "temperature": 0.1,
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
    cost_estimate_usd = _estimate_cost_usd(model, prompt_tokens, completion_tokens)
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
            "priceCardVersion": PRICE_CARD_VERSION,
            "priceCard": _resolve_price_card(model),
            "usageMetadata": usage_metadata,
        },
    )

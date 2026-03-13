from __future__ import annotations

import json
import os
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
        with urlopen(request, timeout=30) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError, TimeoutError) as error:
        return GeminiReviewResult(
            decision="uncertain",
            score=0.0,
            response_json={"error": str(error)},
            model=model,
        )

    text_part = _read_text_part(payload)
    parsed = _parse_json_fragment(text_part) or {}
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
    )

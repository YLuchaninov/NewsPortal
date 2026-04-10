from __future__ import annotations

import json
import os
import time
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from ...gemini import DEFAULT_PRICE_CARD, PRICE_CARD_VERSION


DISCOVERY_GEMINI_API_KEY = "DISCOVERY_GEMINI_API_KEY"
DISCOVERY_GEMINI_MODEL = "DISCOVERY_GEMINI_MODEL"
DISCOVERY_GEMINI_BASE_URL = "DISCOVERY_GEMINI_BASE_URL"
DISCOVERY_LLM_INPUT_COST_ENV = "DISCOVERY_LLM_INPUT_COST_PER_MILLION_USD"
DISCOVERY_LLM_OUTPUT_COST_ENV = "DISCOVERY_LLM_OUTPUT_COST_PER_MILLION_USD"
FALLBACK_GEMINI_API_KEY = "GEMINI_API_KEY"
FALLBACK_GEMINI_MODEL = "GEMINI_MODEL"
FALLBACK_GEMINI_BASE_URL = "GEMINI_BASE_URL"
FALLBACK_LLM_INPUT_COST_ENV = "LLM_INPUT_COST_PER_MILLION_USD"
FALLBACK_LLM_OUTPUT_COST_ENV = "LLM_OUTPUT_COST_PER_MILLION_USD"
_ZERO = Decimal("0")
_USD_TO_CENTS = Decimal("100")
DEFAULT_DISCOVERY_PROVIDER_TYPES = ["rss", "website", "api", "email_imap", "youtube"]


def _iter_text(value: Any) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        return " ".join(_iter_text(item) for item in value)
    if isinstance(value, dict):
        return " ".join(_iter_text(item) for item in value.values())
    return str(value)


def _normalize_text_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        values = [str(item).strip() for item in value if str(item).strip()]
    else:
        values = [str(value).strip()] if str(value).strip() else []
    deduped: list[str] = []
    seen: set[str] = set()
    for item in values:
        normalized = item.lower()
        if normalized in seen:
            continue
        seen.add(normalized)
        deduped.append(item)
    return deduped


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


def _read_env(primary_name: str, fallback_name: str, default: str = "") -> str:
    primary = os.getenv(primary_name)
    if primary is not None and primary.strip():
        return primary.strip()
    fallback = os.getenv(fallback_name)
    if fallback is not None and fallback.strip():
        return fallback.strip()
    return default


def _coerce_non_negative_decimal(value: Any) -> Decimal | None:
    if value is None:
        return None
    try:
        parsed = Decimal(str(value).strip())
    except (InvalidOperation, AttributeError):
        return None
    if parsed < _ZERO:
        return None
    return parsed


def _read_cost_override(primary_name: str, fallback_name: str) -> tuple[Decimal | None, str | None]:
    primary_value = os.getenv(primary_name)
    if primary_value is not None and primary_value.strip():
        parsed = _coerce_non_negative_decimal(primary_value)
        if parsed is None:
            return None, f"{primary_name} must be a non-negative number."
        return parsed, None

    fallback_value = os.getenv(fallback_name)
    if fallback_value is not None and fallback_value.strip():
        parsed = _coerce_non_negative_decimal(fallback_value)
        if parsed is None:
            return None, f"{fallback_name} must be a non-negative number."
        return parsed, None
    return None, None


def _resolve_price_card(model: str) -> tuple[dict[str, Decimal], dict[str, Any]]:
    model_key = model if model in DEFAULT_PRICE_CARD else "default"
    price_card = {
        "input_cost_per_million_tokens_usd": Decimal(
            str(DEFAULT_PRICE_CARD[model_key]["input_cost_per_million_tokens_usd"])
        ),
        "output_cost_per_million_tokens_usd": Decimal(
            str(DEFAULT_PRICE_CARD[model_key]["output_cost_per_million_tokens_usd"])
        ),
    }
    warnings: list[str] = []

    input_override, input_warning = _read_cost_override(
        DISCOVERY_LLM_INPUT_COST_ENV,
        FALLBACK_LLM_INPUT_COST_ENV,
    )
    output_override, output_warning = _read_cost_override(
        DISCOVERY_LLM_OUTPUT_COST_ENV,
        FALLBACK_LLM_OUTPUT_COST_ENV,
    )
    if input_warning:
        warnings.append(input_warning)
    if output_warning:
        warnings.append(output_warning)

    if input_override is not None:
        price_card["input_cost_per_million_tokens_usd"] = input_override
    if output_override is not None:
        price_card["output_cost_per_million_tokens_usd"] = output_override

    if input_override is not None and output_override is not None:
        source = "discovery_env_override"
    elif input_override is not None or output_override is not None:
        source = "discovery_env_partial_override"
    elif os.getenv(FALLBACK_LLM_INPUT_COST_ENV) or os.getenv(FALLBACK_LLM_OUTPUT_COST_ENV):
        source = "fallback_llm_env"
    else:
        source = "default"
    if warnings:
        source = f"{source}_with_invalid_env"

    return price_card, {
        "price_card_version": PRICE_CARD_VERSION,
        "price_card_source": source,
        "price_card_model_key": model_key,
        "price_card_warnings": warnings,
    }


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


def _estimate_cost_usd(
    prompt_tokens: int | None,
    completion_tokens: int | None,
    price_card: dict[str, Decimal],
) -> Decimal:
    if prompt_tokens is None and completion_tokens is None:
        return _ZERO
    input_cost = (Decimal(prompt_tokens or 0) / Decimal("1000000")) * price_card[
        "input_cost_per_million_tokens_usd"
    ]
    output_cost = (Decimal(completion_tokens or 0) / Decimal("1000000")) * price_card[
        "output_cost_per_million_tokens_usd"
    ]
    return (input_cost + output_cost).quantize(Decimal("0.000001"))


def _usd_to_cents(cost_usd: Decimal) -> int:
    return int((cost_usd * _USD_TO_CENTS).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def unwrap_llm_analyzer_output(value: Any) -> tuple[Any, dict[str, Any]]:
    if isinstance(value, dict) and "result" in value:
        meta = value.get("meta")
        return value.get("result"), dict(meta) if isinstance(meta, dict) else {}
    return value, {}


class GeminiLlmAnalyzerAdapter:
    def analyze(
        self,
        *,
        prompt: str | None,
        task: str | None,
        payload: Any,
        model: str | None,
        temperature: float,
        output_schema: dict[str, Any] | None,
    ) -> dict[str, Any]:
        del output_schema
        resolved_model = model or _read_env(
            DISCOVERY_GEMINI_MODEL,
            FALLBACK_GEMINI_MODEL,
            "gemini-2.0-flash",
        )
        fallback_result = self._fallback_result(task=task, prompt=prompt, payload=payload)
        api_key = _read_env(DISCOVERY_GEMINI_API_KEY, FALLBACK_GEMINI_API_KEY)
        if api_key and (prompt or task):
            provider_result = self._call_gemini_json(
                prompt=prompt or self._build_generic_prompt(task=task, payload=payload),
                model=resolved_model,
                temperature=temperature,
                api_key=api_key,
            )
            if provider_result is not None:
                result, meta = provider_result
                return {"result": result, "meta": meta}

        return {
            "result": fallback_result,
            "meta": {
                "provider": "gemini",
                "model": resolved_model,
                "result_source": "deterministic_fallback",
                "deterministic_fallback": True,
                "provider_latency_ms": None,
                "prompt_tokens": None,
                "completion_tokens": None,
                "total_tokens": None,
                "cost_usd": 0.0,
                "cost_cents": 0,
                "request_count": 0,
                "provider_usage_json": {},
                "price_card_version": PRICE_CARD_VERSION,
                "price_card_source": "not_called",
                "price_card_model_key": resolved_model if resolved_model in DEFAULT_PRICE_CARD else "default",
                "price_card_warnings": [],
                "error": None if api_key else "Discovery Gemini API key is not configured.",
            },
        }

    def _fallback_result(self, *, task: str | None, prompt: str | None, payload: Any) -> Any:
        if task == "discovery_compile_interest_graph":
            return self._compile_interest_graph(payload)
        if task == "discovery_plan_hypotheses":
            return self._plan_hypotheses(payload)
        if task in {"discovery_source_evaluation", "discovery_website_evaluation"}:
            return self._evaluate_sources(payload, task=task)
        return {
            "task": task,
            "prompt": prompt,
            "summary": _iter_text(payload)[:4000],
        }

    def _compile_interest_graph(self, payload: Any) -> dict[str, Any]:
        mission = payload if isinstance(payload, dict) else {}
        seed_topics = _normalize_text_list(mission.get("seed_topics") or mission.get("topics"))
        seed_languages = _normalize_text_list(mission.get("seed_languages") or mission.get("languages"))
        seed_regions = _normalize_text_list(mission.get("seed_regions") or mission.get("regions"))
        provider_types = _normalize_text_list(
            mission.get("target_provider_types") or mission.get("targetProviderTypes")
        )
        core_topic = seed_topics[0] if seed_topics else str(mission.get("title") or "content discovery").strip() or "content discovery"
        subtopics = seed_topics[1:6] if len(seed_topics) > 1 else []
        return {
            "core_topic": core_topic,
            "subtopics": subtopics,
            "entities": [],
            "people": [],
            "organizations": [],
            "geos": seed_regions,
            "languages": seed_languages,
            "source_types": provider_types or list(DEFAULT_DISCOVERY_PROVIDER_TYPES),
            "event_types": [],
            "positive_signals": seed_topics[:4],
            "negative_signals": [],
            "exclusions": [],
            "freshness_horizon_days": 14,
            "ambiguities": [],
            "known_good_sources": _normalize_text_list(mission.get("known_good_sources") or mission.get("knownGoodSources"))[:10],
            "known_bad_sources": [],
        }

    def _plan_hypotheses(self, payload: Any) -> list[dict[str, Any]]:
        mission = payload if isinstance(payload, dict) else {}
        seed_hypotheses = [
            dict(item)
            for item in mission.get("seed_hypotheses", mission.get("seedHypotheses", []))
            if isinstance(item, dict)
        ]
        if seed_hypotheses:
            return seed_hypotheses

        graph = mission.get("interest_graph") if isinstance(mission.get("interest_graph"), dict) else {}
        core_topic = str(graph.get("core_topic") or mission.get("title") or "content").strip() or "content"
        class_rows = [
            dict(item)
            for item in mission.get("classes", [])
            if isinstance(item, dict)
        ]
        max_hypotheses = int(mission.get("max_hypotheses", mission.get("maxHypotheses", 6)) or 6)
        hypotheses: list[dict[str, Any]] = []
        for class_row in class_rows or [{"class_key": "facet", "default_provider_types": ["website"]}]:
            class_key = str(class_row.get("class_key") or "facet").strip()
            provider_types = _normalize_text_list(class_row.get("default_provider_types")) or list(DEFAULT_DISCOVERY_PROVIDER_TYPES)
            provider_type = "website" if "website" in provider_types else provider_types[0]
            tactic_key = "default"
            query = f"{core_topic} {class_key} source"
            if class_key == "lexical":
                tactic_key = "synonym"
                query = f"{core_topic} alternative terms source"
            elif class_key == "actor":
                tactic_key = "entity"
                entity = _normalize_text_list(graph.get("entities"))[:1]
                query = f"{(entity[0] if entity else core_topic)} official updates"
            elif class_key == "source_type":
                tactic_key = "source"
                source_types = _normalize_text_list(graph.get("source_types"))[:1]
                query = f"{core_topic} {(source_types[0] if source_types else 'source')} source"
            elif class_key == "evidence_chain":
                tactic_key = "primary"
                query = f"{core_topic} original source press release"
            elif class_key == "contrarian":
                tactic_key = "early_signal"
                query = f"{core_topic} niche early signal source"
            hypotheses.append(
                {
                    "class_key": class_key,
                    "tactic_key": tactic_key,
                    "search_query": query,
                    "target_urls": [],
                    "target_provider_type": provider_type,
                    "generation_context": {"origin": "deterministic_fallback"},
                    "expected_value": f"{class_key}:{tactic_key}",
                }
            )
            if len(hypotheses) >= max_hypotheses:
                break
        return hypotheses[:max_hypotheses]

    def _evaluate_sources(self, payload: Any, *, task: str) -> list[dict[str, Any]]:
        items = payload if isinstance(payload, list) else []
        assessments: list[dict[str, Any]] = []
        for item in items:
            if not isinstance(item, dict):
                continue
            text = _iter_text(item).lower()
            score = 0.8 if any(
                token in text
                for token in ("official", "api", "dataset", "report", "document", "directory", "listing", "research")
            ) else 0.6
            assessments.append(
                {
                    "source_url": item.get("source_url") or item.get("url"),
                    "verdict": "approve" if score >= 0.65 else "maybe",
                    "relevance": score,
                    "quality_signals": ["deterministic-fallback"],
                    "topics_covered": [],
                    "reasoning": f"Deterministic {task} fallback scored the source at {score:.2f}.",
                    "classification": item.get("classification") if isinstance(item.get("classification"), dict) else {},
                    "capabilities": item.get("capabilities") if isinstance(item.get("capabilities"), dict) else {},
                    "is_news_site": bool(item.get("is_news_site", score >= 0.65)),
                    "has_hidden_rss": bool(item.get("has_hidden_rss", False)),
                    "hidden_rss_url": item.get("hidden_rss_url") or (item.get("hidden_rss_urls") or [None])[0],
                }
            )
        return assessments

    def _build_generic_prompt(self, *, task: str | None, payload: Any) -> str:
        return (
            "Return valid JSON only.\n"
            f"Task: {task or 'generic'}\n"
            f"Payload:\n{json.dumps(payload, ensure_ascii=True)}"
        )

    def _call_gemini_json(
        self,
        *,
        prompt: str,
        model: str,
        temperature: float,
        api_key: str,
    ) -> tuple[Any, dict[str, Any]] | None:
        base_url = _read_env(
            DISCOVERY_GEMINI_BASE_URL,
            FALLBACK_GEMINI_BASE_URL,
            "https://generativelanguage.googleapis.com/v1beta",
        ).rstrip("/")
        body = {
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": {
                "temperature": temperature,
                "responseMimeType": "application/json",
            },
        }
        request = Request(
            f"{base_url}/models/{model}:generateContent?key={api_key}",
            data=json.dumps(body, ensure_ascii=True).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            started_at = time.perf_counter()
            with urlopen(request, timeout=30) as response:  # pragma: no cover - provider dependent
                payload = json.loads(response.read().decode("utf-8"))
            provider_latency_ms = int((time.perf_counter() - started_at) * 1000)
        except (HTTPError, URLError, TimeoutError, json.JSONDecodeError):  # pragma: no cover
            return None

        text_part = _read_text_part(payload)
        if not text_part.strip():
            return None
        try:
            result = json.loads(text_part)
        except json.JSONDecodeError:  # pragma: no cover - provider dependent
            return None

        prompt_tokens, completion_tokens, total_tokens, usage_metadata = _read_usage_metadata(payload)
        price_card, price_card_metadata = _resolve_price_card(model)
        cost_usd = _estimate_cost_usd(prompt_tokens, completion_tokens, price_card)
        return result, {
            "provider": "gemini",
            "model": model,
            "result_source": "provider",
            "deterministic_fallback": False,
            "provider_latency_ms": provider_latency_ms,
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "total_tokens": total_tokens,
            "cost_usd": float(cost_usd),
            "cost_cents": _usd_to_cents(cost_usd),
            "request_count": 1,
            "provider_usage_json": {
                **price_card_metadata,
                "usageMetadata": usage_metadata,
            },
            **price_card_metadata,
            "error": None,
        }


__all__ = [
    "GeminiLlmAnalyzerAdapter",
    "unwrap_llm_analyzer_output",
]

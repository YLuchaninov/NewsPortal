from __future__ import annotations

import asyncio
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from math import sqrt
from typing import Any
from urllib.parse import urlparse

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Json

from .source_scoring import (
    build_gap_filling_hypotheses,
    build_portfolio_snapshot,
    build_source_profile,
    canonical_domain,
    clamp_score,
    compute_source_recall_quality_snapshot,
    compute_source_interest_score,
    summarize_channel_quality_metrics,
)
from .task_engine.adapters.common import normalize_url
from .task_engine.adapters.llm_analyzer import unwrap_llm_analyzer_output
from .task_engine.adapters.web_search import unwrap_web_search_output
from .task_engine.discovery_runtime import get_discovery_runtime, resolve_runtime_call
from .task_engine.executor import SequenceExecutor
from .task_engine.plugins import TASK_REGISTRY
from .task_engine.repository import PostgresSequenceRepository, build_database_url


DISCOVERY_ORCHESTRATOR_SEQUENCE_ID = "0a8e8ec5-6cab-4d8b-9c28-0a1d6245bf17"
DISCOVERY_RSS_PIPELINE_SEQUENCE_ID = "1cb1bfec-d42b-4607-a8f0-8e3f671f0978"
DISCOVERY_WEBSITE_PIPELINE_SEQUENCE_ID = "c7e0a3a2-8f0c-4a76-bf35-fd7d1f44774d"
DEFAULT_DISCOVERY_CRON = "0 */6 * * *"
_ZERO_USD = Decimal("0")
_USD_TO_CENTS = Decimal("100")
DEFAULT_DISCOVERY_PROVIDER_TYPES = ["rss", "website", "api", "email_imap", "youtube"]


def _read_int_env(name: str, default: int) -> int:
    raw_value = os.getenv(name)
    if raw_value is None:
        return default
    try:
        return max(0, int(raw_value))
    except ValueError:
        return default


def _read_optional_probability_env(name: str) -> float | None:
    raw_value = os.getenv(name)
    if raw_value is None or not raw_value.strip():
        return None
    try:
        parsed = float(raw_value)
    except ValueError:
        return None
    if parsed < 0 or parsed > 1:
        return None
    return parsed


def _read_text_env(primary_name: str, fallback_name: str, default: str) -> str:
    primary = os.getenv(primary_name)
    if primary is not None and primary.strip():
        return primary.strip()
    fallback = os.getenv(fallback_name)
    if fallback is not None and fallback.strip():
        return fallback.strip()
    return default


def coerce_discovery_cost_usd(value: Any) -> Decimal:
    if value is None:
        return _ZERO_USD
    if isinstance(value, Decimal):
        return value if value >= _ZERO_USD else _ZERO_USD
    try:
        parsed = Decimal(str(value).strip())
    except (InvalidOperation, AttributeError):
        return _ZERO_USD
    return parsed if parsed >= _ZERO_USD else _ZERO_USD


def discovery_cost_usd_to_cents(value: Any) -> int:
    normalized = coerce_discovery_cost_usd(value)
    return int((normalized * _USD_TO_CENTS).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def discovery_month_start_utc(now: datetime | None = None) -> datetime:
    current = now.astimezone(timezone.utc) if now is not None else datetime.now(timezone.utc)
    return current.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


@dataclass(frozen=True)
class DiscoverySettings:
    cron: str = DEFAULT_DISCOVERY_CRON
    default_budget_cents: int = 500
    default_auto_approve_threshold: float | None = None
    max_hypotheses_per_run: int = 20
    default_max_sources: int = 20
    search_provider: str = "ddgs"
    monthly_budget_cents: int = 0
    ddgs_backend: str = "auto"
    ddgs_region: str = "us-en"
    ddgs_safesearch: str = "moderate"
    llm_provider: str = "gemini"
    llm_model: str = "gemini-2.0-flash"


def load_discovery_settings() -> DiscoverySettings:
    return DiscoverySettings(
        cron=os.getenv("DISCOVERY_CRON", DEFAULT_DISCOVERY_CRON).strip() or DEFAULT_DISCOVERY_CRON,
        default_budget_cents=_read_int_env("DISCOVERY_BUDGET_CENTS_DEFAULT", 500),
        default_auto_approve_threshold=_read_optional_probability_env(
            "DISCOVERY_AUTO_APPROVE_THRESHOLD"
        ),
        max_hypotheses_per_run=max(1, _read_int_env("DISCOVERY_MAX_HYPOTHESES_PER_RUN", 20)),
        default_max_sources=max(1, _read_int_env("DISCOVERY_MAX_SOURCES_DEFAULT", 20)),
        search_provider=(os.getenv("DISCOVERY_SEARCH_PROVIDER", "ddgs").strip() or "ddgs"),
        monthly_budget_cents=_read_int_env("DISCOVERY_MONTHLY_BUDGET_CENTS", 0),
        ddgs_backend=os.getenv("DISCOVERY_DDGS_BACKEND", "auto").strip() or "auto",
        ddgs_region=os.getenv("DISCOVERY_DDGS_REGION", "us-en").strip() or "us-en",
        ddgs_safesearch=os.getenv("DISCOVERY_DDGS_SAFESEARCH", "moderate").strip() or "moderate",
        llm_provider="gemini",
        llm_model=_read_text_env(
            "DISCOVERY_GEMINI_MODEL",
            "GEMINI_MODEL",
            "gemini-2.0-flash",
        ),
    )


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


def _tokenize(value: Any) -> set[str]:
    if isinstance(value, str):
        text = value
    elif isinstance(value, list):
        text = " ".join(str(item) for item in value)
    elif isinstance(value, dict):
        text = " ".join(str(item) for item in value.values())
    else:
        text = str(value)
    tokens: set[str] = set()
    for raw in text.lower().replace("/", " ").replace("-", " ").split():
        token = "".join(ch for ch in raw if ch.isalnum() or ch == "_").strip()
        if len(token) >= 2:
            tokens.add(token)
    return tokens


def _coerce_mapping_list(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    rows: list[dict[str, Any]] = []
    for item in value:
        if isinstance(item, dict):
            rows.append(dict(item))
    return rows


def _meta_request_count(meta: dict[str, Any]) -> int:
    try:
        return max(0, int(meta.get("request_count") or 0))
    except (TypeError, ValueError):
        return 0


def _meta_input_tokens(meta: dict[str, Any]) -> int | None:
    try:
        parsed = int(meta.get("prompt_tokens"))
    except (TypeError, ValueError):
        return None
    return parsed if parsed >= 0 else None


def _meta_output_tokens(meta: dict[str, Any]) -> int | None:
    try:
        parsed = int(meta.get("completion_tokens"))
    except (TypeError, ValueError):
        return None
    return parsed if parsed >= 0 else None


def _meta_cost_usd(meta: dict[str, Any]) -> Decimal:
    return coerce_discovery_cost_usd(meta.get("cost_usd"))


def _should_log_external_call(meta: dict[str, Any]) -> bool:
    return (
        _meta_request_count(meta) > 0
        or _meta_cost_usd(meta) > _ZERO_USD
        or _meta_input_tokens(meta) is not None
        or _meta_output_tokens(meta) is not None
    )


def _monthly_quota_reached(*, settings: DiscoverySettings, month_to_date_cost_usd: Decimal) -> bool:
    if settings.monthly_budget_cents <= 0:
        return False
    return month_to_date_cost_usd >= (Decimal(settings.monthly_budget_cents) / _USD_TO_CENTS)


def _mission_budget_exhausted(*, budget_cents: int, spent_usd: Decimal) -> bool:
    if budget_cents <= 0:
        return False
    return spent_usd >= (Decimal(budget_cents) / _USD_TO_CENTS)


def _validate_interest_graph(candidate: Any) -> dict[str, Any]:
    graph = dict(candidate) if isinstance(candidate, dict) else {}
    core_topic = str(graph.get("core_topic") or graph.get("coreTopic") or "").strip()
    if not core_topic:
        raise ValueError("interest_graph must contain core_topic.")
    normalized = {
        "core_topic": core_topic,
        "subtopics": _normalize_text_list(graph.get("subtopics")),
        "entities": _normalize_text_list(graph.get("entities")),
        "people": _normalize_text_list(graph.get("people")),
        "organizations": _normalize_text_list(graph.get("organizations")),
        "geos": _normalize_text_list(graph.get("geos")),
        "languages": _normalize_text_list(graph.get("languages")),
        "source_types": _normalize_text_list(graph.get("source_types") or graph.get("sourceTypes")),
        "event_types": _normalize_text_list(graph.get("event_types") or graph.get("eventTypes")),
        "positive_signals": _normalize_text_list(graph.get("positive_signals") or graph.get("positiveSignals")),
        "negative_signals": _normalize_text_list(graph.get("negative_signals") or graph.get("negativeSignals")),
        "exclusions": _normalize_text_list(graph.get("exclusions")),
        "freshness_horizon_days": max(
            1,
            int(graph.get("freshness_horizon_days") or graph.get("freshnessHorizonDays") or 14),
        ),
        "ambiguities": [
            dict(item)
            for item in (graph.get("ambiguities") or [])
            if isinstance(item, dict)
        ],
        "known_good_sources": _normalize_text_list(graph.get("known_good_sources") or graph.get("knownGoodSources")),
        "known_bad_sources": _normalize_text_list(graph.get("known_bad_sources") or graph.get("knownBadSources")),
    }
    return normalized


def _default_interest_graph(mission: dict[str, Any], existing_urls: set[str] | None = None) -> dict[str, Any]:
    title = str(mission.get("title") or "").strip()
    description = str(mission.get("description") or "").strip()
    seed_topics = _normalize_text_list(mission.get("seed_topics") or mission.get("topics"))
    seed_languages = _normalize_text_list(mission.get("seed_languages") or mission.get("languages"))
    seed_regions = _normalize_text_list(mission.get("seed_regions") or mission.get("regions"))
    provider_types = _normalize_text_list(mission.get("target_provider_types"))
    core_topic = seed_topics[0] if seed_topics else title or "news discovery"
    subtopics = seed_topics[1:6] if len(seed_topics) > 1 else ([title] if title and title != core_topic else [])
    exclusions = []
    if description:
        lowered = description.lower()
        if "not " in lowered or "exclude" in lowered:
            exclusions.append(description)
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
        "exclusions": exclusions,
        "freshness_horizon_days": 14,
        "ambiguities": [],
        "known_good_sources": sorted(existing_urls or [])[:10],
        "known_bad_sources": [],
    }


def _build_generation_seed(
    *,
    class_row: dict[str, Any],
    graph: dict[str, Any],
    stats_map: dict[tuple[str, str], dict[str, Any]],
) -> list[dict[str, Any]]:
    class_key = str(class_row.get("class_key") or "").strip()
    seed_rules = dict(class_row.get("seed_rules_json") or {})
    tactics = _normalize_text_list(seed_rules.get("tactics")) or ["default"]
    max_per_mission = max(1, int(class_row.get("max_per_mission") or 3))
    provider_types = _normalize_text_list(class_row.get("default_provider_types")) or list(DEFAULT_DISCOVERY_PROVIDER_TYPES)
    provider_type = "website" if "website" in provider_types else provider_types[0]
    core_topic = str(graph.get("core_topic") or "content").strip() or "content"
    subtopics = _normalize_text_list(graph.get("subtopics"))
    entities = _normalize_text_list(graph.get("entities")) or _normalize_text_list(graph.get("organizations"))
    geos = _normalize_text_list(graph.get("geos"))
    source_types = _normalize_text_list(graph.get("source_types"))
    exclusions = _normalize_text_list(graph.get("exclusions"))

    seeds: list[dict[str, Any]] = []
    for tactic_key in tactics:
        selection_score = 0.5
        stat_key = (class_key, tactic_key)
        if stat_key in stats_map:
            stat = stats_map[stat_key]
            alpha = float(stat.get("alpha") or 1)
            beta = float(stat.get("beta") or 1)
            trials = int(stat.get("trials") or 0)
            selection_score = (alpha / max(alpha + beta, 1.0)) + (1 / sqrt(trials + 1))

        if class_key == "lexical":
            term = subtopics[0] if subtopics else core_topic
            query = f"{term} {tactic_key} source"
        elif class_key == "facet":
            facet_seed = (subtopics[0] if subtopics else core_topic)
            query = f"{facet_seed} {tactic_key} updates"
        elif class_key == "actor":
            actor = entities[0] if entities else core_topic
            query = f"{actor} {tactic_key} official blog"
        elif class_key == "source_type":
            source_type = source_types[0] if source_types else "source"
            query = f"{core_topic} {source_type} {tactic_key}".strip()
        elif class_key == "evidence_chain":
            query = f"{core_topic} {tactic_key} original source"
        elif class_key == "contrarian":
            exclusion = exclusions[0] if exclusions else core_topic
            geo = geos[0] if geos else ""
            query = f"{core_topic} {tactic_key} {exclusion} {geo}".strip()
        else:
            query = f"{core_topic} {tactic_key}".strip()
        seeds.append(
            {
                "class_key": class_key,
                "tactic_key": tactic_key,
                "search_query": " ".join(query.split()),
                "target_provider_type": provider_type,
                "expected_value": f"{class_row.get('display_name') or class_key} / {tactic_key}",
                "generation_context": {
                    "origin": "registry_seed",
                    "selection_score": round(selection_score, 4),
                    "provider_types": provider_types,
                },
            }
        )

    seeds.sort(
        key=lambda item: float(item.get("generation_context", {}).get("selection_score") or 0),
        reverse=True,
    )
    return seeds[:max_per_mission]


def _build_default_hypotheses_from_graph(
    *,
    graph: dict[str, Any],
    class_rows: list[dict[str, Any]],
    stats_rows: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    stats_map = {
        (str(row.get("class_key") or ""), str(row.get("tactic_key") or "")): dict(row)
        for row in stats_rows
    }
    hypotheses: list[dict[str, Any]] = []
    for class_row in class_rows:
        hypotheses.extend(
            _build_generation_seed(
                class_row=class_row,
                graph=graph,
                stats_map=stats_map,
            )
        )
    return hypotheses


def _dedup_hypotheses(
    hypotheses: list[dict[str, Any]],
    recent_hypotheses: list[dict[str, Any]],
    *,
    max_hypotheses: int,
) -> list[dict[str, Any]]:
    seen: set[tuple[str, str, str]] = set()
    for item in recent_hypotheses:
        seen.add(
            (
                str(item.get("class_key") or "").strip(),
                str(item.get("tactic_key") or "").strip(),
                " ".join(str(item.get("search_query") or "").lower().split()),
            )
        )
    filtered: list[dict[str, Any]] = []
    for hypothesis in hypotheses:
        normalized_key = (
            str(hypothesis.get("class_key") or "").strip(),
            str(hypothesis.get("tactic_key") or "").strip(),
            " ".join(str(hypothesis.get("search_query") or "").lower().split()),
        )
        if not normalized_key[0] or not normalized_key[1] or not normalized_key[2]:
            continue
        if normalized_key in seen:
            continue
        seen.add(normalized_key)
        filtered.append(
            {
                "class_key": normalized_key[0],
                "tactic_key": normalized_key[1],
                "search_query": str(hypothesis.get("search_query") or "").strip(),
                "target_urls": _normalize_text_list(hypothesis.get("target_urls")),
                "target_provider_type": str(hypothesis.get("target_provider_type") or "rss"),
                "generation_context": dict(hypothesis.get("generation_context") or {}),
                "expected_value": str(hypothesis.get("expected_value") or "").strip() or None,
            }
        )
        if len(filtered) >= max_hypotheses:
            break
    return filtered


class DiscoveryCoordinatorRepository:
    def __init__(self, database_url: str | None = None) -> None:
        self._database_url = database_url or build_database_url()

    def _connect(self) -> Any:
        return psycopg.connect(self._database_url, row_factory=dict_row)

    async def ensure_interest_template_missions(
        self,
        *,
        settings: DiscoverySettings,
    ) -> list[str]:
        return await asyncio.to_thread(self._ensure_interest_template_missions, settings)

    async def list_runnable_missions(self, *, mission_id: str | None = None) -> list[dict[str, Any]]:
        return await asyncio.to_thread(self._list_runnable_missions, mission_id)

    async def get_mission(self, mission_id: str) -> dict[str, Any] | None:
        return await asyncio.to_thread(self._get_mission, mission_id)

    async def list_runnable_recall_missions(
        self,
        *,
        recall_mission_id: str | None = None,
    ) -> list[dict[str, Any]]:
        return await asyncio.to_thread(self._list_runnable_recall_missions, recall_mission_id)

    async def get_recall_mission(self, recall_mission_id: str) -> dict[str, Any] | None:
        return await asyncio.to_thread(self._get_recall_mission, recall_mission_id)

    async def list_active_hypothesis_classes(
        self,
        *,
        class_keys: list[str] | None = None,
    ) -> list[dict[str, Any]]:
        return await asyncio.to_thread(
            self._list_active_hypothesis_classes,
            class_keys,
        )

    async def list_strategy_stats(self, mission_id: str) -> list[dict[str, Any]]:
        return await asyncio.to_thread(self._list_strategy_stats, mission_id)

    async def list_existing_source_urls(self) -> set[str]:
        return await asyncio.to_thread(self._list_existing_source_urls)

    async def list_recent_hypotheses(self, mission_id: str) -> list[dict[str, Any]]:
        return await asyncio.to_thread(self._list_recent_hypotheses, mission_id)

    async def upsert_interest_graph(
        self,
        *,
        mission_id: str,
        interest_graph: dict[str, Any],
        status: str,
        error_text: str | None = None,
    ) -> dict[str, Any] | None:
        return await asyncio.to_thread(
            self._upsert_interest_graph,
            mission_id,
            interest_graph,
            status,
            error_text,
        )

    async def insert_hypotheses(
        self,
        *,
        mission_id: str,
        hypotheses: list[dict[str, Any]],
    ) -> list[str]:
        return await asyncio.to_thread(self._insert_hypotheses, mission_id, hypotheses)

    async def list_pending_hypotheses(
        self,
        *,
        mission_id: str | None,
        limit: int,
    ) -> list[dict[str, Any]]:
        return await asyncio.to_thread(self._list_pending_hypotheses, mission_id, limit)

    async def mark_hypothesis_running(
        self,
        *,
        hypothesis_id: str,
        sequence_run_id: str,
    ) -> None:
        await asyncio.to_thread(self._mark_hypothesis_running, hypothesis_id, sequence_run_id)

    async def mark_hypothesis_completed(
        self,
        *,
        hypothesis_id: str,
        sources_found: int,
        sources_approved: int,
        execution_cost_cents: int,
        execution_cost_usd: Decimal,
    ) -> None:
        await asyncio.to_thread(
            self._mark_hypothesis_completed,
            hypothesis_id,
            sources_found,
            sources_approved,
            execution_cost_cents,
            execution_cost_usd,
        )

    async def mark_hypothesis_failed(self, *, hypothesis_id: str, error_text: str) -> None:
        await asyncio.to_thread(self._mark_hypothesis_failed, hypothesis_id, error_text)

    async def mark_hypothesis_skipped(self, *, hypothesis_id: str, error_text: str) -> None:
        await asyncio.to_thread(self._mark_hypothesis_skipped, hypothesis_id, error_text)

    async def upsert_candidates(self, candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return await asyncio.to_thread(self._upsert_candidates, candidates)

    async def upsert_recall_candidates(
        self,
        candidates: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        return await asyncio.to_thread(self._upsert_recall_candidates, candidates)

    async def link_candidate_profile(
        self,
        *,
        candidate_id: str,
        source_profile_id: str,
    ) -> None:
        await asyncio.to_thread(self._link_candidate_profile, candidate_id, source_profile_id)

    async def link_recall_candidate_profile(
        self,
        *,
        recall_candidate_id: str,
        source_profile_id: str,
    ) -> None:
        await asyncio.to_thread(
            self._link_recall_candidate_profile,
            recall_candidate_id,
            source_profile_id,
        )

    async def update_candidate_registration(
        self,
        *,
        candidate_id: str,
        status: str,
        channel_id: str | None,
        rejection_reason: str | None,
    ) -> None:
        await asyncio.to_thread(
            self._update_candidate_registration,
            candidate_id,
            status,
            channel_id,
            rejection_reason,
        )

    async def list_hypothesis_candidate_stats(self, hypothesis_ids: list[str]) -> list[dict[str, Any]]:
        return await asyncio.to_thread(self._list_hypothesis_candidate_stats, hypothesis_ids)

    async def update_hypothesis_effectiveness(
        self,
        *,
        hypothesis_id: str,
        effectiveness: float,
        sources_approved: int,
    ) -> None:
        await asyncio.to_thread(
            self._update_hypothesis_effectiveness,
            hypothesis_id,
            effectiveness,
            sources_approved,
        )

    async def refresh_mission_stats(self, mission_ids: list[str]) -> None:
        await asyncio.to_thread(self._refresh_mission_stats, mission_ids)

    async def get_month_to_date_cost_usd(self, month_start: datetime) -> Decimal:
        return await asyncio.to_thread(self._get_month_to_date_cost_usd, month_start)

    async def log_cost(
        self,
        *,
        mission_id: str,
        hypothesis_id: str | None,
        operation: str,
        provider: str,
        cost_usd: Decimal,
        cost_cents: int,
        input_tokens: int | None,
        output_tokens: int | None,
        request_count: int,
        metadata: dict[str, Any],
    ) -> None:
        await asyncio.to_thread(
            self._log_cost,
            mission_id,
            hypothesis_id,
            operation,
            provider,
            cost_usd,
            cost_cents,
            input_tokens,
            output_tokens,
            request_count,
            metadata,
        )

    async def upsert_source_profile(self, *, candidate_id: str, profile: dict[str, Any]) -> dict[str, Any]:
        return await asyncio.to_thread(self._upsert_source_profile, candidate_id, profile)

    async def upsert_source_profile_for_recall_candidate(
        self,
        *,
        profile: dict[str, Any],
    ) -> dict[str, Any]:
        return await asyncio.to_thread(self._upsert_source_profile_for_recall_candidate, profile)

    async def upsert_source_interest_score(
        self,
        *,
        mission_id: str,
        source_profile_id: str,
        channel_id: str | None,
        score_row: dict[str, Any],
    ) -> dict[str, Any]:
        return await asyncio.to_thread(
            self._upsert_source_interest_score,
            mission_id,
            source_profile_id,
            channel_id,
            score_row,
        )

    async def upsert_source_quality_snapshot(
        self,
        *,
        source_profile_id: str,
        channel_id: str | None,
        snapshot_reason: str,
        snapshot_row: dict[str, Any],
    ) -> dict[str, Any]:
        return await asyncio.to_thread(
            self._upsert_source_quality_snapshot,
            source_profile_id,
            channel_id,
            snapshot_reason,
            snapshot_row,
        )

    async def replace_portfolio_snapshot(
        self,
        *,
        mission_id: str,
        snapshot_reason: str,
        ranked_sources: list[dict[str, Any]],
        gaps: list[dict[str, Any]],
        summary: dict[str, Any],
    ) -> dict[str, Any]:
        return await asyncio.to_thread(
            self._replace_portfolio_snapshot,
            mission_id,
            snapshot_reason,
            ranked_sources,
            gaps,
            summary,
        )

    async def list_mission_candidate_profiles(self, mission_id: str) -> list[dict[str, Any]]:
        return await asyncio.to_thread(self._list_mission_candidate_profiles, mission_id)

    async def list_feedback_events(self, mission_id: str) -> list[dict[str, Any]]:
        return await asyncio.to_thread(self._list_feedback_events, mission_id)

    async def upsert_strategy_stat(
        self,
        *,
        mission_id: str,
        class_key: str,
        tactic_key: str,
        success: bool,
        effectiveness: float | None,
    ) -> None:
        await asyncio.to_thread(
            self._upsert_strategy_stat,
            mission_id,
            class_key,
            tactic_key,
            success,
            effectiveness,
        )

    async def get_channel_metrics(self, channel_id: str | None) -> dict[str, Any]:
        return await asyncio.to_thread(self._get_channel_metrics, channel_id)

    async def insert_gap_hypotheses(
        self,
        *,
        mission_id: str,
        hypotheses: list[dict[str, Any]],
    ) -> list[str]:
        return await asyncio.to_thread(self._insert_hypotheses, mission_id, hypotheses)

    async def refresh_recall_mission_stats(self, recall_mission_ids: list[str]) -> None:
        await asyncio.to_thread(self._refresh_recall_mission_stats, recall_mission_ids)

    def _ensure_interest_template_missions(self, settings: DiscoverySettings) -> list[str]:
        created_ids: list[str] = []
        with self._connect() as connection:
            with connection.transaction():
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        select
                          interest_template_id::text as interest_template_id,
                          name,
                          positive_texts,
                          languages_allowed
                        from interest_templates
                        where is_active = true
                        order by priority desc, created_at desc
                        """
                    )
                    templates = cursor.fetchall()
                    for template in templates:
                        template_id = str(template["interest_template_id"])
                        cursor.execute(
                            """
                            select mission_id::text as mission_id
                            from discovery_missions
                            where source_kind = 'interest_template'
                              and source_ref_id = %s
                              and status in ('planned', 'active', 'paused')
                            order by created_at desc
                            limit 1
                            """,
                            (template_id,),
                        )
                        if cursor.fetchone() is not None:
                            continue
                        seed_topics = [str(template["name"]).strip(), *_normalize_text_list(template["positive_texts"])][:8]
                        seed_languages = _normalize_text_list(template["languages_allowed"])
                        cursor.execute(
                            """
                            insert into discovery_missions (
                              title,
                              description,
                              source_kind,
                              source_ref_id,
                              seed_topics,
                              seed_languages,
                              target_provider_types,
                              max_hypotheses,
                              max_sources,
                              budget_cents,
                              status,
                              created_by
                            )
                            values (
                              %s,
                              %s,
                              'interest_template',
                              %s,
                              %s::text[],
                              %s::text[],
                              '{rss,website,api,email_imap,youtube}'::text[],
                              %s,
                              %s,
                              %s,
                              'active',
                              'discovery:auto'
                            )
                            returning mission_id::text as mission_id
                            """,
                            (
                                f"Interest template: {template['name']}",
                                f"Adaptive discovery mission for interest template {template['name']}.",
                                template_id,
                                seed_topics,
                                seed_languages,
                                min(12, settings.max_hypotheses_per_run),
                                settings.default_max_sources,
                                settings.default_budget_cents,
                            ),
                        )
                        row = cursor.fetchone()
                        if row is not None:
                            created_ids.append(str(row["mission_id"]))
        return created_ids

    def _list_runnable_missions(self, mission_id: str | None) -> list[dict[str, Any]]:
        where_clauses = ["status in ('planned', 'active')"]
        params: list[Any] = []
        if mission_id is not None:
            where_clauses.append("mission_id = %s")
            params.append(mission_id)
        sql = f"""
            select
              mission_id::text as mission_id,
              title,
              description,
              source_kind,
              source_ref_id::text as source_ref_id,
              seed_topics,
              seed_languages,
              seed_regions,
              target_provider_types,
              interest_graph,
              interest_graph_status,
              interest_graph_version,
              interest_graph_compiled_at,
              interest_graph_error_text,
              max_hypotheses,
              max_sources,
              budget_cents,
              spent_cents,
              status,
              priority,
              run_count,
              last_run_at,
              latest_portfolio_snapshot_id::text as latest_portfolio_snapshot_id,
              created_by
            from discovery_missions
            where {' and '.join(where_clauses)}
            order by priority desc, created_at asc
        """
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(sql, tuple(params))
                return [dict(row) for row in cursor.fetchall()]

    def _list_runnable_recall_missions(self, recall_mission_id: str | None) -> list[dict[str, Any]]:
        where_clauses = ["status in ('planned', 'active')"]
        params: list[Any] = []
        if recall_mission_id is not None:
            where_clauses.append("recall_mission_id = %s")
            params.append(recall_mission_id)
        sql = f"""
            select
              recall_mission_id::text as recall_mission_id,
              title,
              description,
              mission_kind,
              seed_domains,
              seed_urls,
              seed_queries,
              target_provider_types,
              scope_json,
              status,
              max_candidates,
              created_by,
              created_at,
              updated_at
            from discovery_recall_missions
            where {' and '.join(where_clauses)}
            order by updated_at desc, created_at asc
        """
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(sql, tuple(params))
                return [dict(row) for row in cursor.fetchall()]

    def _get_mission(self, mission_id: str) -> dict[str, Any] | None:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    select
                      mission_id::text as mission_id,
                      title,
                      description,
                      source_kind,
                      source_ref_id::text as source_ref_id,
                      seed_topics,
                      seed_languages,
                      seed_regions,
                      target_provider_types,
                      interest_graph,
                      interest_graph_status,
                      interest_graph_version,
                      interest_graph_compiled_at,
                      interest_graph_error_text,
                      max_hypotheses,
                      max_sources,
                      budget_cents,
                      spent_cents,
                      status,
                      priority,
                      run_count,
                      last_run_at,
                      latest_portfolio_snapshot_id::text as latest_portfolio_snapshot_id,
                      created_by,
                      created_at,
                      updated_at
                    from discovery_missions
                    where mission_id = %s
                    """,
                    (mission_id,),
                )
                row = cursor.fetchone()
        return dict(row) if row is not None else None

    def _get_recall_mission(self, recall_mission_id: str) -> dict[str, Any] | None:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    select
                      recall_mission_id::text as recall_mission_id,
                      title,
                      description,
                      mission_kind,
                      seed_domains,
                      seed_urls,
                      seed_queries,
                      target_provider_types,
                      scope_json,
                      status,
                      max_candidates,
                      created_by,
                      created_at,
                      updated_at
                    from discovery_recall_missions
                    where recall_mission_id = %s
                    """,
                    (recall_mission_id,),
                )
                row = cursor.fetchone()
        return dict(row) if row is not None else None

    def _list_active_hypothesis_classes(
        self,
        class_keys: list[str] | None = None,
    ) -> list[dict[str, Any]]:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                if class_keys:
                    cursor.execute(
                        """
                        select
                          class_key,
                          display_name,
                          description,
                          status,
                          generation_backend,
                          default_provider_types,
                          prompt_instructions,
                          seed_rules_json,
                          max_per_mission,
                          sort_order,
                          config_json,
                          created_at,
                          updated_at
                        from discovery_hypothesis_classes
                        where status = 'active'
                          and class_key = any(%s::text[])
                        order by sort_order asc, class_key asc
                        """,
                        (class_keys,),
                    )
                else:
                    cursor.execute(
                        """
                        select
                          class_key,
                          display_name,
                          description,
                          status,
                          generation_backend,
                          default_provider_types,
                          prompt_instructions,
                          seed_rules_json,
                          max_per_mission,
                          sort_order,
                          config_json,
                          created_at,
                          updated_at
                        from discovery_hypothesis_classes
                        where status = 'active'
                        order by sort_order asc, class_key asc
                        """
                    )
                return [dict(row) for row in cursor.fetchall()]

    def _list_strategy_stats(self, mission_id: str) -> list[dict[str, Any]]:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    select
                      mission_id::text as mission_id,
                      class_key,
                      tactic_key,
                      trials,
                      successes,
                      alpha,
                      beta,
                      last_effectiveness,
                      last_selected_at,
                      updated_at
                    from discovery_strategy_stats
                    where mission_id = %s
                    order by class_key asc, tactic_key asc
                    """,
                    (mission_id,),
                )
                return [dict(row) for row in cursor.fetchall()]

    def _list_existing_source_urls(self) -> set[str]:
        urls: set[str] = set()
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    select fetch_url, homepage_url
                    from source_channels
                    where fetch_url is not null or homepage_url is not null
                    """
                )
                for row in cursor.fetchall():
                    for candidate in (row["fetch_url"], row["homepage_url"]):
                        if isinstance(candidate, str) and candidate.strip():
                            urls.add(normalize_url(candidate))
        return urls

    def _list_recent_hypotheses(self, mission_id: str) -> list[dict[str, Any]]:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    select
                      hypothesis_id::text as hypothesis_id,
                      class_key,
                      tactic_key,
                      search_query,
                      target_provider_type,
                      created_at
                    from discovery_hypotheses
                    where mission_id = %s
                    order by created_at desc
                    limit 50
                    """,
                    (mission_id,),
                )
                return [dict(row) for row in cursor.fetchall()]

    def _upsert_interest_graph(
        self,
        mission_id: str,
        interest_graph: dict[str, Any],
        status: str,
        error_text: str | None,
    ) -> dict[str, Any] | None:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    update discovery_missions
                    set
                      interest_graph = %s::jsonb,
                      interest_graph_status = %s,
                      interest_graph_version = interest_graph_version + 1,
                      interest_graph_compiled_at = case when %s = 'compiled' then now() else interest_graph_compiled_at end,
                      interest_graph_error_text = %s,
                      updated_at = now()
                    where mission_id = %s
                    returning
                      mission_id::text as mission_id,
                      interest_graph,
                      interest_graph_status,
                      interest_graph_version,
                      interest_graph_compiled_at,
                      interest_graph_error_text
                    """,
                    (Json(interest_graph), status, status, error_text, mission_id),
                )
                row = cursor.fetchone()
        return dict(row) if row is not None else None

    def _insert_hypotheses(self, mission_id: str, hypotheses: list[dict[str, Any]]) -> list[str]:
        created_ids: list[str] = []
        if not hypotheses:
            return created_ids
        with self._connect() as connection:
            with connection.transaction():
                with connection.cursor() as cursor:
                    for hypothesis in hypotheses:
                        cursor.execute(
                            """
                            insert into discovery_hypotheses (
                              mission_id,
                              class_key,
                              tactic_key,
                              search_query,
                              target_urls,
                              target_provider_type,
                              generation_context,
                              expected_value,
                              status
                            )
                            values (%s, %s, %s, %s, %s::text[], %s, %s::jsonb, %s, 'pending')
                            on conflict (mission_id, class_key, tactic_key, search_query)
                            do nothing
                            returning hypothesis_id::text as hypothesis_id
                            """,
                            (
                                mission_id,
                                hypothesis["class_key"],
                                hypothesis["tactic_key"],
                                hypothesis.get("search_query"),
                                hypothesis.get("target_urls") or [],
                                hypothesis.get("target_provider_type") or "rss",
                                Json(hypothesis.get("generation_context") or {}),
                                hypothesis.get("expected_value"),
                            ),
                        )
                        row = cursor.fetchone()
                        if row is not None:
                            created_ids.append(str(row["hypothesis_id"]))
        return created_ids

    def _list_pending_hypotheses(self, mission_id: str | None, limit: int) -> list[dict[str, Any]]:
        where_clauses = ["h.status = 'pending'", "m.status in ('planned', 'active')"]
        params: list[Any] = []
        if mission_id is not None:
            where_clauses.append("m.mission_id = %s")
            params.append(mission_id)
        params.append(limit)
        sql = f"""
            select
              h.hypothesis_id::text as hypothesis_id,
              h.mission_id::text as mission_id,
              h.class_key,
              h.tactic_key,
              h.search_query,
              h.target_urls,
              h.target_provider_type,
              h.generation_context,
              h.expected_value,
              m.interest_graph,
              m.budget_cents,
              (
                select coalesce(sum(cost_usd), 0)
                from discovery_cost_log dcl
                where dcl.mission_id = m.mission_id
              ) as spent_usd
            from discovery_hypotheses h
            join discovery_missions m on m.mission_id = h.mission_id
            where {' and '.join(where_clauses)}
            order by m.priority desc, h.created_at asc
            limit %s
        """
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(sql, tuple(params))
                return [dict(row) for row in cursor.fetchall()]

    def _mark_hypothesis_running(self, hypothesis_id: str, sequence_run_id: str) -> None:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    update discovery_hypotheses
                    set
                      status = 'running',
                      sequence_run_id = %s,
                      started_at = now(),
                      error_text = null
                    where hypothesis_id = %s
                    """,
                    (sequence_run_id, hypothesis_id),
                )

    def _mark_hypothesis_completed(
        self,
        hypothesis_id: str,
        sources_found: int,
        sources_approved: int,
        execution_cost_cents: int,
        execution_cost_usd: Decimal,
    ) -> None:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    update discovery_hypotheses
                    set
                      status = 'completed',
                      sources_found = %s,
                      sources_approved = %s,
                      execution_cost_cents = %s,
                      execution_cost_usd = %s,
                      finished_at = now(),
                      error_text = null
                    where hypothesis_id = %s
                    """,
                    (
                        max(0, sources_found),
                        max(0, sources_approved),
                        max(0, execution_cost_cents),
                        coerce_discovery_cost_usd(execution_cost_usd),
                        hypothesis_id,
                    ),
                )

    def _mark_hypothesis_failed(self, hypothesis_id: str, error_text: str) -> None:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    update discovery_hypotheses
                    set
                      status = 'failed',
                      finished_at = now(),
                      error_text = %s
                    where hypothesis_id = %s
                    """,
                    (error_text, hypothesis_id),
                )

    def _mark_hypothesis_skipped(self, hypothesis_id: str, error_text: str) -> None:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    update discovery_hypotheses
                    set
                      status = 'skipped',
                      finished_at = now(),
                      error_text = %s
                    where hypothesis_id = %s
                    """,
                    (error_text, hypothesis_id),
                )

    def _upsert_candidates(self, candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
        stored_rows: list[dict[str, Any]] = []
        if not candidates:
            return stored_rows
        with self._connect() as connection:
            with connection.transaction():
                with connection.cursor() as cursor:
                    for candidate in candidates:
                        cursor.execute(
                            """
                            insert into discovery_candidates (
                              hypothesis_id,
                              mission_id,
                              url,
                              final_url,
                              title,
                              description,
                              provider_type,
                              is_valid,
                              relevance_score,
                              evaluation_json,
                              llm_assessment,
                              sample_data,
                              status,
                              rejection_reason
                            )
                            values (
                              %s,
                              %s,
                              %s,
                              %s,
                              %s,
                              %s,
                              %s,
                              %s,
                              %s,
                              %s::jsonb,
                              %s::jsonb,
                              %s::jsonb,
                              %s,
                              %s
                            )
                            on conflict (url, mission_id)
                            do update
                            set
                              hypothesis_id = excluded.hypothesis_id,
                              final_url = excluded.final_url,
                              title = excluded.title,
                              description = excluded.description,
                              provider_type = excluded.provider_type,
                              is_valid = excluded.is_valid,
                              relevance_score = excluded.relevance_score,
                              evaluation_json = excluded.evaluation_json,
                              llm_assessment = excluded.llm_assessment,
                              sample_data = excluded.sample_data,
                              status = excluded.status,
                              rejection_reason = excluded.rejection_reason
                            returning
                              candidate_id::text as candidate_id,
                              mission_id::text as mission_id,
                              hypothesis_id::text as hypothesis_id,
                              source_profile_id::text as source_profile_id,
                              registered_channel_id::text as registered_channel_id,
                              url,
                              final_url,
                              title,
                              description,
                              provider_type,
                              is_valid,
                              relevance_score,
                              evaluation_json,
                              llm_assessment,
                              sample_data,
                              status
                            """,
                            (
                                candidate["hypothesis_id"],
                                candidate["mission_id"],
                                candidate["url"],
                                candidate.get("final_url"),
                                candidate.get("title"),
                                candidate.get("description"),
                                candidate.get("provider_type") or "rss",
                                candidate.get("is_valid"),
                                candidate.get("relevance_score"),
                                Json(candidate.get("evaluation_json") or {}),
                                Json(candidate.get("llm_assessment") or {}),
                                Json(candidate.get("sample_data") or []),
                                candidate.get("status") or "pending",
                                candidate.get("rejection_reason"),
                            ),
                        )
                        row = cursor.fetchone()
                        if row is not None:
                            stored_rows.append(dict(row))
        return stored_rows

    def _upsert_recall_candidates(self, candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
        stored_rows: list[dict[str, Any]] = []
        if not candidates:
            return stored_rows
        with self._connect() as connection:
            with connection.transaction():
                with connection.cursor() as cursor:
                    for candidate in candidates:
                        cursor.execute(
                            """
                            insert into discovery_recall_candidates (
                              recall_mission_id,
                              source_profile_id,
                              canonical_domain,
                              url,
                              final_url,
                              title,
                              description,
                              provider_type,
                              status,
                              quality_signal_source,
                              evaluation_json,
                              rejection_reason,
                              created_by
                            )
                            values (
                              %s,
                              %s,
                              %s,
                              %s,
                              %s,
                              %s,
                              %s,
                              %s,
                              %s,
                              %s,
                              %s::jsonb,
                              %s,
                              %s
                            )
                            on conflict (recall_mission_id, url)
                            do update
                            set
                              source_profile_id = coalesce(discovery_recall_candidates.source_profile_id, excluded.source_profile_id),
                              canonical_domain = excluded.canonical_domain,
                              final_url = excluded.final_url,
                              title = excluded.title,
                              description = excluded.description,
                              provider_type = excluded.provider_type,
                              status = excluded.status,
                              quality_signal_source = excluded.quality_signal_source,
                              evaluation_json = excluded.evaluation_json,
                              rejection_reason = excluded.rejection_reason,
                              updated_at = now()
                            returning
                              recall_candidate_id::text as recall_candidate_id,
                              recall_mission_id::text as recall_mission_id,
                              source_profile_id::text as source_profile_id,
                              canonical_domain,
                              url,
                              final_url,
                              title,
                              description,
                              provider_type,
                              status,
                              quality_signal_source,
                              evaluation_json,
                              rejection_reason,
                              created_by,
                              reviewed_by,
                              reviewed_at,
                              created_at,
                              updated_at
                            """,
                            (
                                candidate["recall_mission_id"],
                                candidate.get("source_profile_id"),
                                candidate["canonical_domain"],
                                candidate["url"],
                                candidate.get("final_url"),
                                candidate.get("title"),
                                candidate.get("description"),
                                candidate.get("provider_type") or "rss",
                                candidate.get("status") or "pending",
                                candidate.get("quality_signal_source") or "recall_acquisition",
                                Json(candidate.get("evaluation_json") or {}),
                                candidate.get("rejection_reason"),
                                candidate.get("created_by") or "independent_recall:agent",
                            ),
                        )
                        row = cursor.fetchone()
                        if row is not None:
                            stored_rows.append(dict(row))
        return stored_rows

    def _link_candidate_profile(self, candidate_id: str, source_profile_id: str) -> None:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    update discovery_candidates
                    set source_profile_id = %s
                    where candidate_id = %s
                    """,
                    (source_profile_id, candidate_id),
                )

    def _link_recall_candidate_profile(self, recall_candidate_id: str, source_profile_id: str) -> None:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    update discovery_recall_candidates
                    set source_profile_id = %s, updated_at = now()
                    where recall_candidate_id = %s
                    """,
                    (source_profile_id, recall_candidate_id),
                )

    def _update_candidate_registration(
        self,
        candidate_id: str,
        status: str,
        channel_id: str | None,
        rejection_reason: str | None,
    ) -> None:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    update discovery_candidates
                    set
                      status = %s,
                      registered_channel_id = %s,
                      rejection_reason = %s,
                      reviewed_at = now()
                    where candidate_id = %s
                    """,
                    (status, channel_id, rejection_reason, candidate_id),
                )

    def _list_hypothesis_candidate_stats(self, hypothesis_ids: list[str]) -> list[dict[str, Any]]:
        if not hypothesis_ids:
            return []
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    select
                      h.hypothesis_id::text as hypothesis_id,
                      h.mission_id::text as mission_id,
                      h.class_key,
                      h.tactic_key,
                      count(c.candidate_id)::int as sources_found,
                      count(c.candidate_id) filter (
                        where c.status in ('approved', 'auto_approved')
                      )::int as sources_approved
                    from discovery_hypotheses h
                    left join discovery_candidates c on c.hypothesis_id = h.hypothesis_id
                    where h.hypothesis_id = any(%s::uuid[])
                    group by h.hypothesis_id, h.mission_id, h.class_key, h.tactic_key
                    """,
                    (hypothesis_ids,),
                )
                return [dict(row) for row in cursor.fetchall()]

    def _update_hypothesis_effectiveness(
        self,
        hypothesis_id: str,
        effectiveness: float,
        sources_approved: int,
    ) -> None:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    update discovery_hypotheses
                    set
                      effectiveness = %s,
                      sources_approved = %s
                    where hypothesis_id = %s
                    """,
                    (effectiveness, max(0, sources_approved), hypothesis_id),
                )

    def _refresh_mission_stats(self, mission_ids: list[str]) -> None:
        if not mission_ids:
            return
        with self._connect() as connection:
            with connection.transaction():
                with connection.cursor() as cursor:
                    for mission_id in mission_ids:
                        cursor.execute(
                            """
                            select
                              count(*) filter (where status in ('approved', 'auto_approved'))::int as approved_count
                            from discovery_candidates
                            where mission_id = %s
                            """,
                            (mission_id,),
                        )
                        approved_count = int((cursor.fetchone() or {}).get("approved_count") or 0)
                        cursor.execute(
                            """
                            select coalesce(sum(cost_usd), 0) as spent_usd
                            from discovery_cost_log
                            where mission_id = %s
                            """,
                            (mission_id,),
                        )
                        spent_usd = coerce_discovery_cost_usd((cursor.fetchone() or {}).get("spent_usd"))
                        spent_cents = discovery_cost_usd_to_cents(spent_usd)
                        cursor.execute(
                            """
                            select max_sources, budget_cents, status
                            from discovery_missions
                            where mission_id = %s
                            """,
                            (mission_id,),
                        )
                        mission = cursor.fetchone()
                        if mission is None:
                            continue
                        status = "active"
                        if approved_count >= int(mission["max_sources"] or 0):
                            status = "completed"
                        elif int(mission["budget_cents"] or 0) > 0 and spent_usd >= (
                            Decimal(int(mission["budget_cents"] or 0)) / _USD_TO_CENTS
                        ):
                            status = "completed"
                        elif str(mission["status"]) == "paused":
                            status = "paused"
                        cursor.execute(
                            """
                            update discovery_missions
                            set
                              spent_cents = %s,
                              run_count = run_count + 1,
                              last_run_at = now(),
                              status = %s,
                              updated_at = now()
                            where mission_id = %s
                            """,
                            (spent_cents, status, mission_id),
                        )

    def _refresh_recall_mission_stats(self, recall_mission_ids: list[str]) -> None:
        if not recall_mission_ids:
            return
        with self._connect() as connection:
            with connection.transaction():
                with connection.cursor() as cursor:
                    for recall_mission_id in recall_mission_ids:
                        cursor.execute(
                            """
                            select
                              count(*)::int as candidate_count
                            from discovery_recall_candidates
                            where recall_mission_id = %s
                            """,
                            (recall_mission_id,),
                        )
                        candidate_count = int((cursor.fetchone() or {}).get("candidate_count") or 0)
                        cursor.execute(
                            """
                            select max_candidates, status
                            from discovery_recall_missions
                            where recall_mission_id = %s
                            """,
                            (recall_mission_id,),
                        )
                        mission = cursor.fetchone()
                        if mission is None:
                            continue
                        status = "completed" if candidate_count >= int(mission.get("max_candidates") or 0) else "active"
                        if str(mission.get("status") or "") == "paused":
                            status = "paused"
                        cursor.execute(
                            """
                            update discovery_recall_missions
                            set
                              status = %s,
                              updated_at = now()
                            where recall_mission_id = %s
                            """,
                            (status, recall_mission_id),
                        )

    def _get_month_to_date_cost_usd(self, month_start: datetime) -> Decimal:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    select coalesce(sum(cost_usd), 0) as month_to_date_cost_usd
                    from discovery_cost_log
                    where created_at >= %s
                    """,
                    (month_start,),
                )
                row = cursor.fetchone() or {}
        return coerce_discovery_cost_usd(row.get("month_to_date_cost_usd"))

    def _log_cost(
        self,
        mission_id: str,
        hypothesis_id: str | None,
        operation: str,
        provider: str,
        cost_usd: Decimal,
        cost_cents: int,
        input_tokens: int | None,
        output_tokens: int | None,
        request_count: int,
        metadata: dict[str, Any],
    ) -> None:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    insert into discovery_cost_log (
                      mission_id,
                      hypothesis_id,
                      operation,
                      provider,
                      cost_usd,
                      cost_cents,
                      input_tokens,
                      output_tokens,
                      request_count,
                      metadata
                    )
                    values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb)
                    """,
                    (
                        mission_id,
                        hypothesis_id,
                        operation,
                        provider,
                        coerce_discovery_cost_usd(cost_usd),
                        max(0, cost_cents),
                        input_tokens if input_tokens is None or input_tokens >= 0 else None,
                        output_tokens if output_tokens is None or output_tokens >= 0 else None,
                        max(0, request_count),
                        Json(metadata),
                    ),
                )

    def _upsert_source_profile(self, candidate_id: str, profile: dict[str, Any]) -> dict[str, Any]:
        with self._connect() as connection:
            with connection.transaction():
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        insert into discovery_source_profiles (
                          candidate_id,
                          canonical_domain,
                          source_type,
                          org_name,
                          country,
                          languages,
                          ownership_transparency,
                          author_accountability,
                          source_linking_quality,
                          historical_stability,
                          technical_quality,
                          spam_signals,
                          trust_score,
                          extraction_data
                        )
                        values (
                          %s,
                          %s,
                          %s,
                          %s,
                          %s,
                          %s::text[],
                          %s,
                          %s,
                          %s,
                          %s,
                          %s,
                          %s,
                          %s,
                          %s::jsonb
                        )
                        on conflict (canonical_domain)
                        do update
                        set
                          candidate_id = excluded.candidate_id,
                          source_type = excluded.source_type,
                          org_name = excluded.org_name,
                          country = excluded.country,
                          languages = excluded.languages,
                          ownership_transparency = excluded.ownership_transparency,
                          author_accountability = excluded.author_accountability,
                          source_linking_quality = excluded.source_linking_quality,
                          historical_stability = excluded.historical_stability,
                          technical_quality = excluded.technical_quality,
                          spam_signals = excluded.spam_signals,
                          trust_score = excluded.trust_score,
                          extraction_data = excluded.extraction_data,
                          updated_at = now()
                        returning
                          source_profile_id::text as source_profile_id,
                          candidate_id::text as candidate_id,
                          channel_id::text as channel_id,
                          canonical_domain,
                          source_type,
                          trust_score,
                          extraction_data
                        """,
                        (
                            candidate_id,
                            profile["canonical_domain"],
                            profile.get("source_type") or "unknown",
                            profile.get("org_name"),
                            profile.get("country"),
                            profile.get("languages") or [],
                            clamp_score(profile.get("ownership_transparency")),
                            clamp_score(profile.get("author_accountability")),
                            clamp_score(profile.get("source_linking_quality")),
                            clamp_score(profile.get("historical_stability")),
                            clamp_score(profile.get("technical_quality")),
                            clamp_score(profile.get("spam_signals")),
                            clamp_score(profile.get("trust_score")),
                            Json(profile.get("extraction_data") or {}),
                        ),
                    )
                    row = cursor.fetchone()
        return dict(row or {})

    def _upsert_source_profile_for_recall_candidate(self, profile: dict[str, Any]) -> dict[str, Any]:
        with self._connect() as connection:
            with connection.transaction():
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        insert into discovery_source_profiles (
                          candidate_id,
                          canonical_domain,
                          source_type,
                          org_name,
                          country,
                          languages,
                          ownership_transparency,
                          author_accountability,
                          source_linking_quality,
                          historical_stability,
                          technical_quality,
                          spam_signals,
                          trust_score,
                          extraction_data
                        )
                        values (
                          null,
                          %s,
                          %s,
                          %s,
                          %s,
                          %s::text[],
                          %s,
                          %s,
                          %s,
                          %s,
                          %s,
                          %s,
                          %s,
                          %s::jsonb
                        )
                        on conflict (canonical_domain)
                        do update
                        set
                          candidate_id = coalesce(discovery_source_profiles.candidate_id, excluded.candidate_id),
                          channel_id = coalesce(discovery_source_profiles.channel_id, excluded.channel_id),
                          source_type = excluded.source_type,
                          org_name = coalesce(discovery_source_profiles.org_name, excluded.org_name),
                          country = coalesce(discovery_source_profiles.country, excluded.country),
                          languages = excluded.languages,
                          ownership_transparency = excluded.ownership_transparency,
                          author_accountability = excluded.author_accountability,
                          source_linking_quality = excluded.source_linking_quality,
                          historical_stability = excluded.historical_stability,
                          technical_quality = excluded.technical_quality,
                          spam_signals = excluded.spam_signals,
                          trust_score = excluded.trust_score,
                          extraction_data = excluded.extraction_data,
                          updated_at = now()
                        returning
                          source_profile_id::text as source_profile_id,
                          candidate_id::text as candidate_id,
                          channel_id::text as channel_id,
                          canonical_domain,
                          source_type,
                          trust_score,
                          extraction_data
                        """,
                        (
                            profile["canonical_domain"],
                            profile.get("source_type") or "unknown",
                            profile.get("org_name"),
                            profile.get("country"),
                            profile.get("languages") or [],
                            clamp_score(profile.get("ownership_transparency")),
                            clamp_score(profile.get("author_accountability")),
                            clamp_score(profile.get("source_linking_quality")),
                            clamp_score(profile.get("historical_stability")),
                            clamp_score(profile.get("technical_quality")),
                            clamp_score(profile.get("spam_signals")),
                            clamp_score(profile.get("trust_score")),
                            Json(profile.get("extraction_data") or {}),
                        ),
                    )
                    row = cursor.fetchone()
        return dict(row or {})

    def _upsert_source_interest_score(
        self,
        mission_id: str,
        source_profile_id: str,
        channel_id: str | None,
        score_row: dict[str, Any],
    ) -> dict[str, Any]:
        with self._connect() as connection:
            with connection.transaction():
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        insert into discovery_source_interest_scores (
                          source_profile_id,
                          channel_id,
                          mission_id,
                          topic_coverage,
                          specificity,
                          audience_fit,
                          evidence_depth,
                          signal_to_noise,
                          fit_score,
                          novelty_score,
                          lead_time_score,
                          yield_score,
                          duplication_score,
                          contextual_score,
                          role_labels,
                          scoring_breakdown
                        )
                        values (
                          %s,
                          %s,
                          %s,
                          %s,
                          %s,
                          %s,
                          %s,
                          %s,
                          %s,
                          %s,
                          %s,
                          %s,
                          %s,
                          %s,
                          %s::text[],
                          %s::jsonb
                        )
                        on conflict (mission_id, source_profile_id)
                        do update
                        set
                          channel_id = excluded.channel_id,
                          topic_coverage = excluded.topic_coverage,
                          specificity = excluded.specificity,
                          audience_fit = excluded.audience_fit,
                          evidence_depth = excluded.evidence_depth,
                          signal_to_noise = excluded.signal_to_noise,
                          fit_score = excluded.fit_score,
                          novelty_score = excluded.novelty_score,
                          lead_time_score = excluded.lead_time_score,
                          yield_score = excluded.yield_score,
                          duplication_score = excluded.duplication_score,
                          contextual_score = excluded.contextual_score,
                          role_labels = excluded.role_labels,
                          scoring_breakdown = excluded.scoring_breakdown,
                          scored_at = now(),
                          updated_at = now()
                        returning
                          score_id::text as score_id,
                          source_profile_id::text as source_profile_id,
                          mission_id::text as mission_id,
                          contextual_score,
                          role_labels,
                          scoring_breakdown
                        """,
                        (
                            source_profile_id,
                            channel_id,
                            mission_id,
                            clamp_score(score_row.get("topic_coverage")),
                            clamp_score(score_row.get("specificity")),
                            clamp_score(score_row.get("audience_fit")),
                            clamp_score(score_row.get("evidence_depth")),
                            clamp_score(score_row.get("signal_to_noise")),
                            clamp_score(score_row.get("fit_score")),
                            clamp_score(score_row.get("novelty_score")),
                            clamp_score(score_row.get("lead_time_score")),
                            clamp_score(score_row.get("yield_score")),
                            clamp_score(score_row.get("duplication_score")),
                            clamp_score(score_row.get("contextual_score")),
                            score_row.get("role_labels") or [],
                            Json(score_row.get("scoring_breakdown") or {}),
                        ),
                    )
                    row = cursor.fetchone()
        return dict(row or {})

    def _upsert_source_quality_snapshot(
        self,
        source_profile_id: str,
        channel_id: str | None,
        snapshot_reason: str,
        snapshot_row: dict[str, Any],
    ) -> dict[str, Any]:
        with self._connect() as connection:
            with connection.transaction():
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        insert into discovery_source_quality_snapshots (
                          source_profile_id,
                          channel_id,
                          snapshot_reason,
                          trust_score,
                          extraction_quality_score,
                          stability_score,
                          independence_score,
                          freshness_score,
                          lead_time_score,
                          yield_score,
                          duplication_score,
                          recall_score,
                          scoring_breakdown
                        )
                        values (
                          %s,
                          %s,
                          %s,
                          %s,
                          %s,
                          %s,
                          %s,
                          %s,
                          %s,
                          %s,
                          %s,
                          %s,
                          %s::jsonb
                        )
                        on conflict (source_profile_id)
                        do update
                        set
                          channel_id = excluded.channel_id,
                          snapshot_reason = excluded.snapshot_reason,
                          trust_score = excluded.trust_score,
                          extraction_quality_score = excluded.extraction_quality_score,
                          stability_score = excluded.stability_score,
                          independence_score = excluded.independence_score,
                          freshness_score = excluded.freshness_score,
                          lead_time_score = excluded.lead_time_score,
                          yield_score = excluded.yield_score,
                          duplication_score = excluded.duplication_score,
                          recall_score = excluded.recall_score,
                          scoring_breakdown = excluded.scoring_breakdown,
                          scored_at = now(),
                          updated_at = now()
                        returning
                          snapshot_id::text as snapshot_id,
                          source_profile_id::text as source_profile_id,
                          channel_id::text as channel_id,
                          snapshot_reason,
                          recall_score,
                          scoring_breakdown,
                          scored_at
                        """,
                        (
                            source_profile_id,
                            channel_id,
                            snapshot_reason,
                            clamp_score(snapshot_row.get("trust_score")),
                            clamp_score(snapshot_row.get("extraction_quality_score")),
                            clamp_score(snapshot_row.get("stability_score")),
                            clamp_score(snapshot_row.get("independence_score")),
                            clamp_score(snapshot_row.get("freshness_score")),
                            clamp_score(snapshot_row.get("lead_time_score")),
                            clamp_score(snapshot_row.get("yield_score")),
                            clamp_score(snapshot_row.get("duplication_score")),
                            clamp_score(snapshot_row.get("recall_score")),
                            Json(snapshot_row.get("scoring_breakdown") or {}),
                        ),
                    )
                    row = cursor.fetchone()
        return dict(row or {})

    def _replace_portfolio_snapshot(
        self,
        mission_id: str,
        snapshot_reason: str,
        ranked_sources: list[dict[str, Any]],
        gaps: list[dict[str, Any]],
        summary: dict[str, Any],
    ) -> dict[str, Any]:
        with self._connect() as connection:
            with connection.transaction():
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        insert into discovery_portfolio_snapshots (
                          mission_id,
                          snapshot_reason,
                          ranked_sources,
                          gaps_json,
                          summary_json
                        )
                        values (%s, %s, %s::jsonb, %s::jsonb, %s::jsonb)
                        returning
                          snapshot_id::text as snapshot_id,
                          mission_id::text as mission_id,
                          snapshot_reason,
                          ranked_sources,
                          gaps_json,
                          summary_json,
                          created_at
                        """,
                        (
                            mission_id,
                            snapshot_reason,
                            Json(ranked_sources),
                            Json(gaps),
                            Json(summary),
                        ),
                    )
                    row = cursor.fetchone()
                    if row is not None:
                        cursor.execute(
                            """
                            update discovery_missions
                            set latest_portfolio_snapshot_id = %s, updated_at = now()
                            where mission_id = %s
                            """,
                            (row["snapshot_id"], mission_id),
                        )
        return dict(row or {})

    def _list_mission_candidate_profiles(self, mission_id: str) -> list[dict[str, Any]]:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    select
                      c.candidate_id::text as candidate_id,
                      c.mission_id::text as mission_id,
                      c.hypothesis_id::text as hypothesis_id,
                      c.source_profile_id::text as source_profile_id,
                      c.registered_channel_id::text as registered_channel_id,
                      c.url,
                      c.final_url,
                      c.title,
                      c.description,
                      c.provider_type,
                      c.is_valid,
                      c.relevance_score,
                      c.llm_assessment,
                      c.sample_data,
                      c.status,
                      h.class_key,
                      h.tactic_key,
                      m.interest_graph,
                      sp.canonical_domain,
                      sp.source_type,
                      sp.source_linking_quality,
                      sp.historical_stability,
                      sp.technical_quality,
                      sp.spam_signals,
                      sp.trust_score,
                      sp.extraction_data
                    from discovery_candidates c
                    join discovery_hypotheses h on h.hypothesis_id = c.hypothesis_id
                    join discovery_missions m on m.mission_id = c.mission_id
                    left join discovery_source_profiles sp on sp.source_profile_id = c.source_profile_id
                    where c.mission_id = %s
                    order by c.created_at desc
                    """,
                    (mission_id,),
                )
                return [dict(row) for row in cursor.fetchall()]

    def _list_feedback_events(self, mission_id: str) -> list[dict[str, Any]]:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    select
                      feedback_event_id::text as feedback_event_id,
                      mission_id::text as mission_id,
                      candidate_id::text as candidate_id,
                      source_profile_id::text as source_profile_id,
                      feedback_type,
                      feedback_value,
                      notes,
                      created_by,
                      created_at
                    from discovery_feedback_events
                    where mission_id = %s
                    order by created_at desc
                    """,
                    (mission_id,),
                )
                return [dict(row) for row in cursor.fetchall()]

    def _upsert_strategy_stat(
        self,
        mission_id: str,
        class_key: str,
        tactic_key: str,
        success: bool,
        effectiveness: float | None,
    ) -> None:
        with self._connect() as connection:
            with connection.transaction():
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        insert into discovery_strategy_stats (
                          mission_id,
                          class_key,
                          tactic_key,
                          trials,
                          successes,
                          alpha,
                          beta,
                          last_effectiveness,
                          last_selected_at
                        )
                        values (
                          %s,
                          %s,
                          %s,
                          1,
                          %s,
                          %s,
                          %s,
                          %s,
                          now()
                        )
                        on conflict (mission_id, class_key, tactic_key)
                        do update
                        set
                          trials = discovery_strategy_stats.trials + 1,
                          successes = discovery_strategy_stats.successes + %s,
                          alpha = discovery_strategy_stats.alpha + %s,
                          beta = discovery_strategy_stats.beta + %s,
                          last_effectiveness = %s,
                          last_selected_at = now(),
                          updated_at = now()
                        """,
                        (
                            mission_id,
                            class_key,
                            tactic_key,
                            1 if success else 0,
                            2 if success else 1,
                            1 if success else 2,
                            effectiveness,
                            1 if success else 0,
                            1 if success else 0,
                            0 if success else 1,
                            effectiveness,
                        ),
                    )

    def _get_channel_metrics(self, channel_id: str | None) -> dict[str, Any]:
        if not channel_id:
            return summarize_channel_quality_metrics()
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    with recent_articles as (
                      select
                        doc_id,
                        canonical_doc_id,
                        published_at,
                        ingested_at
                      from articles
                      where channel_id = %s
                        and coalesce(published_at, ingested_at) >= now() - interval '30 days'
                    ),
                    article_metrics as (
                      select
                        count(*)::int as total_articles_period,
                        count(distinct coalesce(canonical_doc_id, doc_id))::int as unique_articles_period,
                        greatest(
                          count(*)::int - count(distinct coalesce(canonical_doc_id, doc_id))::int,
                          0
                        )::int as duplicate_articles_period,
                        count(*) filter (
                          where coalesce(published_at, ingested_at) >= now() - interval '7 days'
                        )::int as fresh_articles_period,
                        avg(
                          greatest(
                            extract(epoch from (coalesce(ingested_at, now()) - published_at)),
                            0
                          )
                        ) filter (
                          where published_at is not null
                            and ingested_at is not null
                        ) as avg_article_delay_seconds
                      from recent_articles
                    ),
                    recent_fetch_runs as (
                      select
                        outcome_kind,
                        new_article_count,
                        duplicate_suppressed_count
                      from channel_fetch_runs
                      where channel_id = %s
                        and started_at >= now() - interval '30 days'
                    ),
                    fetch_metrics as (
                      select
                        count(*)::int as fetch_runs_period,
                        count(*) filter (
                          where outcome_kind in ('new_content', 'no_change')
                        )::int as successful_fetch_runs_period,
                        count(*) filter (
                          where outcome_kind = 'new_content'
                        )::int as new_content_fetch_runs_period,
                        count(*) filter (
                          where outcome_kind in ('transient_failure', 'hard_failure', 'rate_limited')
                        )::int as degraded_fetch_runs_period,
                        coalesce(sum(duplicate_suppressed_count), 0)::int as duplicate_suppressed_period,
                        coalesce(sum(new_article_count), 0)::int as new_articles_from_fetch_period
                      from recent_fetch_runs
                    )
                    select
                      am.total_articles_period,
                      am.unique_articles_period,
                      am.duplicate_articles_period,
                      am.fresh_articles_period,
                      am.avg_article_delay_seconds,
                      fm.fetch_runs_period,
                      fm.successful_fetch_runs_period,
                      fm.new_content_fetch_runs_period,
                      fm.degraded_fetch_runs_period,
                      fm.duplicate_suppressed_period,
                      fm.new_articles_from_fetch_period,
                      scrs.effective_poll_interval_seconds,
                      scrs.consecutive_failures,
                      scrs.last_result_kind
                    from article_metrics am
                    cross join fetch_metrics fm
                    left join source_channel_runtime_state scrs
                      on scrs.channel_id = %s
                    """,
                    (channel_id, channel_id, channel_id),
                )
                row = cursor.fetchone() or {}
        return summarize_channel_quality_metrics(dict(row))


async def compile_interest_graph_for_mission(
    *,
    mission: dict[str, Any],
    repository: DiscoveryCoordinatorRepository,
) -> dict[str, Any]:
    existing_graph = mission.get("interest_graph")
    if isinstance(existing_graph, dict):
        try:
            graph = _validate_interest_graph(existing_graph)
            await repository.upsert_interest_graph(
                mission_id=str(mission["mission_id"]),
                interest_graph=graph,
                status="compiled",
                error_text=None,
            )
            return graph
        except Exception:
            pass

    runtime = get_discovery_runtime()
    existing_urls = await repository.list_existing_source_urls()
    fallback_graph = _default_interest_graph(mission, existing_urls)
    llm_meta: dict[str, Any] = {}
    try:
        raw_graph = await resolve_runtime_call(
            runtime.llm_analyzer.analyze(
                prompt=None,
                task="discovery_compile_interest_graph",
                payload={
                    "title": mission.get("title"),
                    "description": mission.get("description"),
                    "seed_topics": _normalize_text_list(mission.get("seed_topics")),
                    "seed_languages": _normalize_text_list(mission.get("seed_languages")),
                    "seed_regions": _normalize_text_list(mission.get("seed_regions")),
                    "target_provider_types": _normalize_text_list(mission.get("target_provider_types")),
                    "known_good_sources": fallback_graph["known_good_sources"],
                },
                model=None,
                temperature=0.0,
                output_schema=None,
            )
        )
        graph_result, llm_meta = unwrap_llm_analyzer_output(raw_graph)
        graph = _validate_interest_graph(graph_result)
    except Exception:
        graph = fallback_graph
    await repository.upsert_interest_graph(
        mission_id=str(mission["mission_id"]),
        interest_graph=graph,
        status="compiled",
        error_text=None,
    )
    if _should_log_external_call(llm_meta):
        llm_cost_usd = _meta_cost_usd(llm_meta)
        await repository.log_cost(
            mission_id=str(mission["mission_id"]),
            hypothesis_id=None,
            operation="mission_graph_compile_llm",
            provider=str(llm_meta.get("provider") or "gemini"),
            cost_usd=llm_cost_usd,
            cost_cents=discovery_cost_usd_to_cents(llm_cost_usd),
            input_tokens=_meta_input_tokens(llm_meta),
            output_tokens=_meta_output_tokens(llm_meta),
            request_count=_meta_request_count(llm_meta),
            metadata={**llm_meta, "task": "discovery_compile_interest_graph"},
        )
    return graph


def _assessment_map(llm_analysis: Any) -> dict[str, dict[str, Any]]:
    mapping: dict[str, dict[str, Any]] = {}
    for item in _coerce_mapping_list(llm_analysis):
        source_url = item.get("source_url") or item.get("url")
        if isinstance(source_url, str) and source_url.strip():
            mapping[source_url.strip()] = dict(item)
    return mapping


def _candidate_rows_from_context(
    *,
    mission_id: str,
    hypothesis_id: str,
    provider_type: str,
    context: dict[str, Any],
    existing_source_urls: set[str],
) -> list[dict[str, Any]]:
    scored_sources = {
        str(item.get("source_url") or ""): dict(item)
        for item in _coerce_mapping_list(context.get("scored_sources"))
    }
    sampled_content = {
        str(item.get("source_url") or ""): dict(item)
        for item in _coerce_mapping_list(context.get("sampled_content"))
    }
    llm_assessments = _assessment_map(context.get("llm_analysis"))
    base_rows = context.get("probed_feeds") if provider_type == "rss" else context.get("probed_websites")
    if not isinstance(base_rows, list):
        return []

    candidates: list[dict[str, Any]] = []
    for row in base_rows:
        if not isinstance(row, dict):
            continue
        source_url = str(
            row.get("feed_url")
            or row.get("url")
            or row.get("final_url")
            or ""
        ).strip()
        if not source_url:
            continue
        scored = scored_sources.get(source_url, {})
        llm = llm_assessments.get(source_url, {})
        discovered_feed_urls = row.get("discovered_feed_urls") or row.get("hidden_rss_urls") or []
        classification = row.get("classification") if isinstance(row.get("classification"), dict) else {}
        capabilities = row.get("capabilities") if isinstance(row.get("capabilities"), dict) else {}
        browser_assisted_recommended = bool(row.get("browser_assisted_recommended"))
        challenge_kind = str(row.get("challenge_kind") or "").strip() or None
        effective_url = source_url
        effective_provider = provider_type
        normalized = normalize_url(effective_url)
        status = "duplicate" if normalized in existing_source_urls else "pending"
        candidates.append(
            {
                "mission_id": mission_id,
                "hypothesis_id": hypothesis_id,
                "url": effective_url,
                "final_url": str(row.get("final_url") or source_url or effective_url),
                "title": str(row.get("feed_title") or row.get("title") or ""),
                "description": str(llm.get("reasoning") or ""),
                "provider_type": effective_provider,
                "is_valid": bool(
                    row.get(
                        "is_valid_rss",
                        False if row.get("error_text") else True,
                    )
                ),
                "relevance_score": clamp_score(
                    llm.get("relevance")
                    or scored.get("relevance_score")
                    or 0.0
                ),
                "evaluation_json": {
                    "matched_terms": scored.get("matched_terms") or [],
                    "passes_threshold": bool(scored.get("passes_threshold", False)),
                    "classification": classification,
                    "capabilities": capabilities,
                    "discovered_feed_urls": [
                        item for item in discovered_feed_urls if isinstance(item, str) and item.strip()
                    ],
                    "browser_assisted_recommended": browser_assisted_recommended,
                    "challenge_kind": challenge_kind,
                },
                "llm_assessment": llm,
                "sample_data": (
                    row.get("sample_entries")
                    or row.get("sample_resources")
                    or row.get("sample_articles")
                    or sampled_content.get(source_url, {}).get("articles")
                    or []
                ),
                "status": status,
                "rejection_reason": "already_known_source" if status == "duplicate" else None,
            }
        )
    return candidates


def _canonical_origin_url(url: str) -> str:
    raw = str(url or "").strip()
    if not raw:
        return ""
    parsed = urlparse(raw if "://" in raw else f"https://{raw}")
    hostname = (parsed.netloc or parsed.path or "").strip().lower()
    if not hostname:
        return ""
    return f"{parsed.scheme or 'https'}://{hostname}"


def _normalize_domain_seed(value: Any) -> str:
    raw = str(value or "").strip()
    if not raw:
        return ""
    if "://" in raw:
        return canonical_domain(raw)
    candidate = raw.lower().strip().strip("/")
    if candidate.startswith("www."):
        candidate = candidate[4:]
    return candidate


def _build_recall_search_plans(
    *,
    mission: dict[str, Any],
    provider_type: str,
    max_plans: int,
) -> list[dict[str, str]]:
    plans: list[dict[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for seed_query in _normalize_text_list(mission.get("seed_queries")):
        query = seed_query if provider_type == "website" else f"{seed_query} rss"
        key = ("seed_query", query.lower())
        if key in seen:
            continue
        seen.add(key)
        plans.append(
            {
                "query": query,
                "quality_signal_source": "seed_query_search",
                "seed_type": "seed_query",
                "seed_value": seed_query,
            }
        )
        if len(plans) >= max_plans:
            return plans
    for seed_domain in _normalize_text_list(mission.get("seed_domains")):
        domain = _normalize_domain_seed(seed_domain)
        if not domain:
            continue
        query = f"site:{domain}" if provider_type == "website" else f"site:{domain} rss"
        key = ("seed_domain", query.lower())
        if key in seen:
            continue
        seen.add(key)
        plans.append(
            {
                "query": query,
                "quality_signal_source": "seed_domain_search",
                "seed_type": "seed_domain",
                "seed_value": domain,
            }
        )
        if len(plans) >= max_plans:
            return plans
    return plans


def _seed_probe_targets_for_recall_mission(
    *,
    mission: dict[str, Any],
    provider_type: str,
) -> dict[str, dict[str, Any]]:
    targets: dict[str, dict[str, Any]] = {}
    for seed_url in _normalize_text_list(mission.get("seed_urls")):
        probe_url = _canonical_origin_url(seed_url) if provider_type == "website" else str(seed_url).strip()
        if not probe_url:
            continue
        targets[normalize_url(probe_url)] = {
            "probe_url": probe_url,
            "quality_signal_source": "seed_url_probe",
            "seed_type": "seed_url",
            "seed_value": seed_url,
        }
    if provider_type == "website":
        for seed_domain in _normalize_text_list(mission.get("seed_domains")):
            domain = _normalize_domain_seed(seed_domain)
            if not domain:
                continue
            probe_url = _canonical_origin_url(domain)
            if not probe_url:
                continue
            targets.setdefault(
                normalize_url(probe_url),
                {
                    "probe_url": probe_url,
                    "quality_signal_source": "seed_domain_probe",
                    "seed_type": "seed_domain",
                    "seed_value": domain,
                },
            )
    return targets


def _recall_candidate_rows_from_probe_results(
    *,
    recall_mission_id: str,
    provider_type: str,
    probe_rows: list[dict[str, Any]],
    probe_targets: dict[str, dict[str, Any]],
    existing_source_urls: set[str],
) -> list[dict[str, Any]]:
    candidates: list[dict[str, Any]] = []
    for row in probe_rows:
        if not isinstance(row, dict):
            continue
        probe_input_url = str(row.get("url") or row.get("feed_url") or row.get("final_url") or "").strip()
        resolved_url = str(
            row.get("feed_url")
            or row.get("final_url")
            or row.get("url")
            or ""
        ).strip()
        candidate_url = (
            _canonical_origin_url(resolved_url or probe_input_url)
            if provider_type == "website"
            else (resolved_url or probe_input_url)
        )
        if not candidate_url:
            continue
        canonical_domain_value = canonical_domain(candidate_url)
        if canonical_domain_value == "unknown":
            continue
        target_meta = probe_targets.get(normalize_url(probe_input_url)) or probe_targets.get(
            normalize_url(candidate_url)
        ) or {}
        sample_data = (
            row.get("sample_entries")
            or row.get("sample_resources")
            or row.get("sample_articles")
            or []
        )
        is_valid = bool(
            row.get("is_valid_rss")
            if provider_type == "rss"
            else not row.get("error_text")
        )
        status = "duplicate" if normalize_url(candidate_url) in existing_source_urls else (
            "pending" if is_valid else "rejected"
        )
        rejection_reason = None
        if status == "duplicate":
            rejection_reason = "already_known_source"
        elif not is_valid:
            rejection_reason = "invalid_feed" if provider_type == "rss" else "probe_failed"
        discovered_feed_urls = row.get("discovered_feed_urls") or row.get("hidden_rss_urls") or []
        evaluation_json = {
            "classification": row.get("classification") if isinstance(row.get("classification"), dict) else {},
            "capabilities": row.get("capabilities") if isinstance(row.get("capabilities"), dict) else {},
            "discovered_feed_urls": [
                item for item in discovered_feed_urls if isinstance(item, str) and item.strip()
            ],
            "browser_assisted_recommended": bool(row.get("browser_assisted_recommended")),
            "challenge_kind": str(row.get("challenge_kind") or "").strip() or None,
            "error_text": str(row.get("error_text") or "").strip() or None,
            "is_valid": is_valid,
            "sample_data": sample_data if isinstance(sample_data, list) else [],
            "probe_input_url": probe_input_url or candidate_url,
            "seed_type": target_meta.get("seed_type"),
            "seed_value": target_meta.get("seed_value"),
            "search_query": target_meta.get("search_query"),
            "search_result_title": target_meta.get("search_result_title"),
            "search_snippet": target_meta.get("search_snippet"),
        }
        title = str(row.get("feed_title") or row.get("title") or target_meta.get("search_result_title") or "")
        description = str(
            target_meta.get("search_snippet")
            or row.get("error_text")
            or ""
        )
        candidates.append(
            {
                "recall_mission_id": recall_mission_id,
                "canonical_domain": canonical_domain_value,
                "url": candidate_url,
                "final_url": str(row.get("final_url") or resolved_url or candidate_url),
                "title": title,
                "description": description,
                "provider_type": provider_type,
                "status": status,
                "quality_signal_source": target_meta.get("quality_signal_source") or "recall_acquisition",
                "evaluation_json": evaluation_json,
                "rejection_reason": rejection_reason,
                "created_by": "independent_recall:agent",
            }
        )
    return candidates


async def plan_hypotheses(
    *,
    mission_id: str | None,
    settings: DiscoverySettings,
    repository: DiscoveryCoordinatorRepository,
    class_keys: list[str] | None = None,
) -> dict[str, Any]:
    await repository.ensure_interest_template_missions(settings=settings)
    existing_source_urls = await repository.list_existing_source_urls()
    runtime = get_discovery_runtime()
    month_to_date_cost_usd = await repository.get_month_to_date_cost_usd(
        discovery_month_start_utc()
    )
    class_rows = await repository.list_active_hypothesis_classes(class_keys=class_keys)
    planned_hypothesis_ids: list[str] = []
    planned_mission_ids: list[str] = []

    for mission in await repository.list_runnable_missions(mission_id=mission_id):
        if _monthly_quota_reached(
            settings=settings,
            month_to_date_cost_usd=month_to_date_cost_usd,
        ):
            break
        graph = mission.get("interest_graph")
        if not isinstance(graph, dict) or mission.get("interest_graph_status") != "compiled":
            graph = await compile_interest_graph_for_mission(mission=mission, repository=repository)
        recent = await repository.list_recent_hypotheses(str(mission["mission_id"]))
        stats_rows = await repository.list_strategy_stats(str(mission["mission_id"]))
        seed_hypotheses = _build_default_hypotheses_from_graph(
            graph=graph,
            class_rows=class_rows,
            stats_rows=stats_rows,
        )
        raw_hypotheses = await resolve_runtime_call(
            runtime.llm_analyzer.analyze(
                prompt=None,
                task="discovery_plan_hypotheses",
                payload={
                    "mission_id": mission["mission_id"],
                    "interest_graph": graph,
                    "classes": class_rows,
                    "seed_hypotheses": seed_hypotheses,
                    "recent_hypotheses": recent,
                    "known_good_sources": sorted(existing_source_urls)[:200],
                },
                model=None,
                temperature=0.0,
                output_schema=None,
            )
        )
        llm_hypotheses, llm_meta = unwrap_llm_analyzer_output(raw_hypotheses)
        if _should_log_external_call(llm_meta):
            llm_cost_usd = _meta_cost_usd(llm_meta)
            await repository.log_cost(
                mission_id=str(mission["mission_id"]),
                hypothesis_id=None,
                operation="mission_planning_llm",
                provider=str(llm_meta.get("provider") or settings.llm_provider),
                cost_usd=llm_cost_usd,
                cost_cents=discovery_cost_usd_to_cents(llm_cost_usd),
                input_tokens=_meta_input_tokens(llm_meta),
                output_tokens=_meta_output_tokens(llm_meta),
                request_count=_meta_request_count(llm_meta),
                metadata={**llm_meta, "task": "discovery_plan_hypotheses"},
            )
            month_to_date_cost_usd += llm_cost_usd

        hypotheses = _coerce_mapping_list(llm_hypotheses) or seed_hypotheses
        filtered = _dedup_hypotheses(
            hypotheses,
            recent,
            max_hypotheses=min(
                int(mission.get("max_hypotheses") or settings.max_hypotheses_per_run),
                settings.max_hypotheses_per_run,
            ),
        )
        inserted_ids = await repository.insert_hypotheses(
            mission_id=str(mission["mission_id"]),
            hypotheses=filtered,
        )
        if inserted_ids:
            planned_mission_ids.append(str(mission["mission_id"]))
            planned_hypothesis_ids.extend(inserted_ids)

    return {
        "discovery_planned_mission_ids": planned_mission_ids,
        "discovery_planned_hypothesis_ids": planned_hypothesis_ids,
        "discovery_planned_count": len(planned_hypothesis_ids),
    }


async def execute_hypotheses(
    *,
    mission_id: str | None,
    settings: DiscoverySettings,
    repository: DiscoveryCoordinatorRepository,
    sequence_repository: PostgresSequenceRepository,
) -> dict[str, Any]:
    pending_hypotheses = await repository.list_pending_hypotheses(
        mission_id=mission_id,
        limit=settings.max_hypotheses_per_run,
    )
    existing_source_urls = await repository.list_existing_source_urls()
    runtime = get_discovery_runtime()
    executor = SequenceExecutor(repository=sequence_repository, registry=TASK_REGISTRY)
    month_to_date_cost_usd = await repository.get_month_to_date_cost_usd(
        discovery_month_start_utc()
    )
    mission_spend_usd_map: dict[str, Decimal] = {}

    executed_ids: list[str] = []
    candidate_count = 0
    score_count = 0
    quality_snapshot_count = 0
    for hypothesis in pending_hypotheses:
        mission_id_text = str(hypothesis["mission_id"])
        hypothesis_id_text = str(hypothesis["hypothesis_id"])
        mission_budget_cents = int(hypothesis.get("budget_cents") or 0)
        mission_spent_usd = mission_spend_usd_map.get(
            mission_id_text,
            coerce_discovery_cost_usd(hypothesis.get("spent_usd")),
        )
        if _monthly_quota_reached(
            settings=settings,
            month_to_date_cost_usd=month_to_date_cost_usd,
        ):
            await repository.mark_hypothesis_skipped(
                hypothesis_id=hypothesis_id_text,
                error_text="Monthly discovery quota exhausted before execution.",
            )
            continue
        if _mission_budget_exhausted(
            budget_cents=mission_budget_cents,
            spent_usd=mission_spent_usd,
        ):
            await repository.mark_hypothesis_skipped(
                hypothesis_id=hypothesis_id_text,
                error_text="Mission budget exhausted before execution.",
            )
            continue

        sequence_id = (
            DISCOVERY_RSS_PIPELINE_SEQUENCE_ID
            if str(hypothesis.get("target_provider_type") or "rss") == "rss"
            else DISCOVERY_WEBSITE_PIPELINE_SEQUENCE_ID
        )
        graph = hypothesis.get("interest_graph") if isinstance(hypothesis.get("interest_graph"), dict) else {}
        run_context = {
            "mission_id": mission_id_text,
            "hypothesis_id": hypothesis_id_text,
            "search_query": str(hypothesis.get("search_query") or "").strip(),
            "target_topics": [graph.get("core_topic"), *(_normalize_text_list(graph.get("subtopics"))[:4])],
            "target_urls": _normalize_text_list(hypothesis.get("target_urls")),
            "target_provider_type": str(hypothesis.get("target_provider_type") or "rss"),
            "class_key": str(hypothesis.get("class_key") or ""),
            "tactic_key": str(hypothesis.get("tactic_key") or ""),
        }
        run_id = await sequence_repository.create_pending_run(
            sequence_id=sequence_id,
            context_json=run_context,
            trigger_type="agent",
            trigger_meta={
                "source": "adaptive_discovery_orchestrator",
                "missionId": mission_id_text,
                "hypothesisId": hypothesis_id_text,
                "classKey": str(hypothesis.get("class_key") or ""),
                "tacticKey": str(hypothesis.get("tactic_key") or ""),
            },
        )
        await repository.mark_hypothesis_running(
            hypothesis_id=hypothesis_id_text,
            sequence_run_id=run_id,
        )

        try:
            run_result = await executor.execute_run(run_id)
        except Exception as error:
            await repository.mark_hypothesis_failed(
                hypothesis_id=hypothesis_id_text,
                error_text=str(error),
            )
            continue

        context = dict(run_result.get("context") or {})
        candidates = _candidate_rows_from_context(
            mission_id=mission_id_text,
            hypothesis_id=hypothesis_id_text,
            provider_type=str(hypothesis.get("target_provider_type") or "rss"),
            context=context,
            existing_source_urls=existing_source_urls,
        )
        stored_candidates = await repository.upsert_candidates(candidates)
        approved_count = 0
        threshold = settings.default_auto_approve_threshold
        scored_sources: list[dict[str, Any]] = []
        for stored_candidate in stored_candidates:
            candidate_id = str(stored_candidate["candidate_id"])
            profile_input = build_source_profile(stored_candidate)
            stored_profile = await repository.upsert_source_profile(
                candidate_id=candidate_id,
                profile=profile_input,
            )
            source_profile_id = str(stored_profile.get("source_profile_id") or "")
            if source_profile_id:
                await repository.link_candidate_profile(
                    candidate_id=candidate_id,
                    source_profile_id=source_profile_id,
                )
            channel_metrics = await repository.get_channel_metrics(
                str(stored_candidate.get("registered_channel_id") or "") or None
            )
            if source_profile_id:
                quality_snapshot = compute_source_recall_quality_snapshot(
                    profile={**profile_input, **stored_profile},
                    candidate=stored_candidate,
                    channel_metrics=channel_metrics,
                )
                await repository.upsert_source_quality_snapshot(
                    source_profile_id=source_profile_id,
                    channel_id=str(stored_candidate.get("registered_channel_id") or "") or None,
                    snapshot_reason="discovery_execution",
                    snapshot_row=quality_snapshot,
                )
                quality_snapshot_count += 1
            score_input = compute_source_interest_score(
                mission_graph=graph,
                profile={**profile_input, **stored_profile},
                candidate=stored_candidate,
                channel_metrics=channel_metrics,
            )
            await repository.upsert_source_interest_score(
                mission_id=mission_id_text,
                source_profile_id=source_profile_id,
                channel_id=str(stored_candidate.get("registered_channel_id") or "") or None,
                score_row=score_input,
            )
            score_count += 1
            ranked_source = {
                "candidate_id": candidate_id,
                "source_profile_id": source_profile_id,
                "canonical_domain": stored_profile.get("canonical_domain") or canonical_domain(str(stored_candidate.get("url") or "")),
                "trust_score": clamp_score(stored_profile.get("trust_score")),
                "contextual_score": clamp_score(score_input.get("contextual_score")),
                "fit_score": clamp_score(score_input.get("fit_score")),
                "novelty_score": clamp_score(score_input.get("novelty_score")),
                "lead_time_score": clamp_score(score_input.get("lead_time_score")),
                "yield_score": clamp_score(score_input.get("yield_score")),
                "duplication_score": clamp_score(score_input.get("duplication_score")),
                "role_labels": score_input.get("role_labels") or [],
                "title": stored_candidate.get("title"),
                "url": stored_candidate.get("url"),
            }
            scored_sources.append(ranked_source)

            contextual_score = clamp_score(score_input.get("contextual_score"))
            if stored_candidate.get("status") == "duplicate":
                continue
            if threshold is not None and contextual_score >= float(threshold):
                source_payload = dict(stored_candidate)
                source_payload["relevance_score"] = contextual_score
                registrations = await resolve_runtime_call(
                    runtime.source_registrar.register_sources(
                        sources=[source_payload],
                        enabled=True,
                        dry_run=False,
                        created_by="adaptive_discovery:agent",
                        tags=["discovery", "adaptive"],
                        provider_type=str(source_payload.get("provider_type") or "rss"),
                    )
                )
                registration = registrations[0] if isinstance(registrations, list) and registrations else {}
                status = "auto_approved"
                channel_id = registration.get("channel_id") if isinstance(registration, dict) else None
                rejection_reason = None
                if isinstance(registration, dict) and registration.get("status") == "duplicate":
                    status = "duplicate"
                    rejection_reason = "already_registered"
                await repository.update_candidate_registration(
                    candidate_id=candidate_id,
                    status=status,
                    channel_id=str(channel_id) if channel_id else None,
                    rejection_reason=rejection_reason,
                )
                if status == "auto_approved":
                    approved_count += 1
            elif stored_candidate.get("status") in {"approved", "auto_approved"}:
                approved_count += 1

        portfolio = build_portfolio_snapshot(
            mission_graph=graph,
            scored_sources=scored_sources,
        )
        await repository.replace_portfolio_snapshot(
            mission_id=mission_id_text,
            snapshot_reason="execution",
            ranked_sources=portfolio["ranked_sources"],
            gaps=portfolio["gaps"],
            summary=portfolio["summary"],
        )
        gap_hypotheses = build_gap_filling_hypotheses(
            mission_graph=graph,
            gaps=portfolio["gaps"],
            class_rows=await repository.list_active_hypothesis_classes(),
        )
        await repository.insert_gap_hypotheses(
            mission_id=mission_id_text,
            hypotheses=gap_hypotheses,
        )

        search_meta = dict(context.get("search_meta") or {}) if isinstance(context.get("search_meta"), dict) else {}
        llm_meta = dict(context.get("llm_analysis_meta") or {}) if isinstance(context.get("llm_analysis_meta"), dict) else {}
        search_cost_usd = _meta_cost_usd(search_meta)
        llm_cost_usd = _meta_cost_usd(llm_meta)
        if _should_log_external_call(search_meta):
            await repository.log_cost(
                mission_id=mission_id_text,
                hypothesis_id=hypothesis_id_text,
                operation="hypothesis_search",
                provider=str(search_meta.get("provider") or settings.search_provider),
                cost_usd=search_cost_usd,
                cost_cents=discovery_cost_usd_to_cents(search_cost_usd),
                input_tokens=None,
                output_tokens=None,
                request_count=_meta_request_count(search_meta),
                metadata={**search_meta, "sequenceRunId": run_id, "sequenceId": sequence_id},
            )
        if _should_log_external_call(llm_meta):
            await repository.log_cost(
                mission_id=mission_id_text,
                hypothesis_id=hypothesis_id_text,
                operation="hypothesis_llm_analysis",
                provider=str(llm_meta.get("provider") or settings.llm_provider),
                cost_usd=llm_cost_usd,
                cost_cents=discovery_cost_usd_to_cents(llm_cost_usd),
                input_tokens=_meta_input_tokens(llm_meta),
                output_tokens=_meta_output_tokens(llm_meta),
                request_count=_meta_request_count(llm_meta),
                metadata={**llm_meta, "sequenceRunId": run_id, "sequenceId": sequence_id},
            )
        execution_cost_usd = search_cost_usd + llm_cost_usd
        execution_cost_cents = discovery_cost_usd_to_cents(execution_cost_usd)
        await repository.mark_hypothesis_completed(
            hypothesis_id=hypothesis_id_text,
            sources_found=len(stored_candidates),
            sources_approved=approved_count,
            execution_cost_cents=execution_cost_cents,
            execution_cost_usd=execution_cost_usd,
        )
        month_to_date_cost_usd += execution_cost_usd
        mission_spend_usd_map[mission_id_text] = mission_spent_usd + execution_cost_usd
        executed_ids.append(hypothesis_id_text)
        candidate_count += len(stored_candidates)

    return {
        "discovery_executed_hypothesis_ids": executed_ids,
        "discovery_executed_count": len(executed_ids),
        "discovery_candidate_count": candidate_count,
        "discovery_source_interest_score_count": score_count,
        "discovery_source_quality_snapshot_count": quality_snapshot_count,
    }


async def acquire_recall_missions(
    *,
    recall_mission_id: str | None,
    settings: DiscoverySettings,
    repository: DiscoveryCoordinatorRepository,
) -> dict[str, Any]:
    runtime = get_discovery_runtime()
    existing_source_urls = await repository.list_existing_source_urls()
    executed_mission_ids: list[str] = []
    candidate_count = 0
    source_profile_count = 0
    quality_snapshot_count = 0
    search_request_count = 0
    probe_count = 0
    provider_breakdown: dict[str, int] = {}

    for mission in await repository.list_runnable_recall_missions(
        recall_mission_id=recall_mission_id
    ):
        recall_mission_id_text = str(mission["recall_mission_id"])
        max_candidates = max(1, int(mission.get("max_candidates") or settings.default_max_sources))
        mission_candidates: list[dict[str, Any]] = []
        supported_provider_types = [
            provider
            for provider in _normalize_text_list(mission.get("target_provider_types"))
            if provider in {"rss", "website"}
        ]
        if not supported_provider_types:
            continue

        for provider_type in supported_provider_types:
            remaining_capacity = max_candidates - len(mission_candidates)
            if remaining_capacity <= 0:
                break
            probe_targets = _seed_probe_targets_for_recall_mission(
                mission=mission,
                provider_type=provider_type,
            )
            search_plans = _build_recall_search_plans(
                mission=mission,
                provider_type=provider_type,
                max_plans=min(max_candidates, 8),
            )
            for search_plan in search_plans:
                if len(probe_targets) >= max_candidates:
                    break
                raw_results = await resolve_runtime_call(
                    runtime.web_search.search(
                        query=str(search_plan["query"]),
                        count=min(remaining_capacity, 5),
                        result_type="text",
                        time_range="month",
                    )
                )
                search_results, search_meta = unwrap_web_search_output(raw_results)
                search_request_count += max(1, _meta_request_count(search_meta))
                for result in search_results:
                    result_url = str(result.get("url") or "").strip()
                    if not result_url:
                        continue
                    probe_url = (
                        _canonical_origin_url(result_url)
                        if provider_type == "website"
                        else result_url
                    )
                    if not probe_url:
                        continue
                    normalized_probe_url = normalize_url(probe_url)
                    probe_targets.setdefault(
                        normalized_probe_url,
                        {
                            "probe_url": probe_url,
                            "quality_signal_source": search_plan["quality_signal_source"],
                            "seed_type": search_plan["seed_type"],
                            "seed_value": search_plan["seed_value"],
                            "search_query": search_plan["query"],
                            "search_result_title": str(result.get("title") or ""),
                            "search_snippet": str(result.get("snippet") or ""),
                        },
                    )
                    if len(probe_targets) >= max_candidates:
                        break

            probe_urls = [
                item["probe_url"]
                for item in list(probe_targets.values())[:remaining_capacity]
                if isinstance(item.get("probe_url"), str) and item["probe_url"].strip()
            ]
            if not probe_urls:
                continue

            if provider_type == "rss":
                raw_probe_rows = await resolve_runtime_call(
                    runtime.rss_probe.probe_feeds(urls=probe_urls, sample_count=3)
                )
            else:
                raw_probe_rows = await resolve_runtime_call(
                    runtime.website_probe.probe_websites(urls=probe_urls, sample_count=3)
                )
            probe_rows = _coerce_mapping_list(raw_probe_rows)
            probe_count += len(probe_urls)
            provider_breakdown[provider_type] = provider_breakdown.get(provider_type, 0) + len(
                probe_rows
            )
            mission_candidates.extend(
                _recall_candidate_rows_from_probe_results(
                    recall_mission_id=recall_mission_id_text,
                    provider_type=provider_type,
                    probe_rows=probe_rows,
                    probe_targets=probe_targets,
                    existing_source_urls=existing_source_urls,
                )
            )

        stored_candidates = await repository.upsert_recall_candidates(
            mission_candidates[:max_candidates]
        )
        for stored_candidate in stored_candidates:
            evaluation_json = (
                dict(stored_candidate.get("evaluation_json") or {})
                if isinstance(stored_candidate.get("evaluation_json"), dict)
                else {}
            )
            if stored_candidate.get("status") == "rejected" and stored_candidate.get(
                "rejection_reason"
            ) in {"invalid_feed", "probe_failed"}:
                continue
            profile_input = build_source_profile(
                {
                    **stored_candidate,
                    "is_valid": bool(evaluation_json.get("is_valid", True)),
                    "sample_data": (
                        evaluation_json.get("sample_data")
                        if isinstance(evaluation_json.get("sample_data"), list)
                        else []
                    ),
                    "llm_assessment": {},
                }
            )
            stored_profile = await repository.upsert_source_profile_for_recall_candidate(
                profile=profile_input
            )
            source_profile_id = str(stored_profile.get("source_profile_id") or "")
            if source_profile_id:
                await repository.link_recall_candidate_profile(
                    recall_candidate_id=str(stored_candidate["recall_candidate_id"]),
                    source_profile_id=source_profile_id,
                )
                quality_snapshot = compute_source_recall_quality_snapshot(
                    profile={**profile_input, **stored_profile},
                    candidate={
                        **stored_candidate,
                        "is_valid": bool(evaluation_json.get("is_valid", True)),
                    },
                    channel_metrics=await repository.get_channel_metrics(None),
                )
                await repository.upsert_source_quality_snapshot(
                    source_profile_id=source_profile_id,
                    channel_id=None,
                    snapshot_reason="recall_acquisition",
                    snapshot_row=quality_snapshot,
                )
                source_profile_count += 1
                quality_snapshot_count += 1
            if str(stored_candidate.get("url") or "").strip():
                existing_source_urls.add(normalize_url(str(stored_candidate["url"])))

        await repository.refresh_recall_mission_stats([recall_mission_id_text])
        executed_mission_ids.append(recall_mission_id_text)
        candidate_count += len(stored_candidates)

    return {
        "discovery_recall_executed_mission_ids": executed_mission_ids,
        "discovery_recall_executed_count": len(executed_mission_ids),
        "discovery_recall_candidate_count": candidate_count,
        "discovery_recall_source_profile_count": source_profile_count,
        "discovery_recall_source_quality_snapshot_count": quality_snapshot_count,
        "discovery_recall_search_request_count": search_request_count,
        "discovery_recall_probe_count": probe_count,
        "discovery_recall_provider_breakdown": provider_breakdown,
    }


async def evaluate_hypotheses(
    *,
    hypothesis_ids: list[str],
    repository: DiscoveryCoordinatorRepository,
) -> dict[str, Any]:
    stats = await repository.list_hypothesis_candidate_stats(hypothesis_ids)
    mission_ids: set[str] = set()
    for row in stats:
        sources_found = int(row.get("sources_found") or 0)
        sources_approved = int(row.get("sources_approved") or 0)
        effectiveness = round(sources_approved / max(sources_found, 1), 4)
        await repository.update_hypothesis_effectiveness(
            hypothesis_id=str(row["hypothesis_id"]),
            effectiveness=effectiveness,
            sources_approved=sources_approved,
        )
        await repository.upsert_strategy_stat(
            mission_id=str(row["mission_id"]),
            class_key=str(row.get("class_key") or ""),
            tactic_key=str(row.get("tactic_key") or ""),
            success=sources_approved > 0,
            effectiveness=effectiveness,
        )
        mission_ids.add(str(row.get("mission_id") or ""))
    if mission_ids:
        mission_ids.difference_update({""})
        await repository.refresh_mission_stats(sorted(mission_ids))
    return {
        "discovery_evaluated_hypothesis_ids": hypothesis_ids,
        "discovery_evaluated_count": len(hypothesis_ids),
    }


async def re_evaluate_sources(
    *,
    mission_id: str | None,
    repository: DiscoveryCoordinatorRepository,
) -> dict[str, Any]:
    target_mission_ids: list[str]
    if mission_id:
        target_mission_ids = [mission_id]
    else:
        target_mission_ids = [str(item["mission_id"]) for item in await repository.list_runnable_missions()]

    portfolio_count = 0
    feedback_count = 0
    quality_snapshot_count = 0
    class_rows = await repository.list_active_hypothesis_classes()
    for mission_id_text in target_mission_ids:
        mission = await repository.get_mission(mission_id_text)
        if mission is None:
            continue
        graph = mission.get("interest_graph") if isinstance(mission.get("interest_graph"), dict) else {}
        if not graph:
            graph = await compile_interest_graph_for_mission(mission=mission, repository=repository)
        feedback_rows = await repository.list_feedback_events(mission_id_text)
        feedback_count += len(feedback_rows)
        feedback_by_profile: dict[str, list[dict[str, Any]]] = {}
        for row in feedback_rows:
            profile_id = str(row.get("source_profile_id") or "")
            if not profile_id:
                continue
            feedback_by_profile.setdefault(profile_id, []).append(row)

        scored_sources: list[dict[str, Any]] = []
        for row in await repository.list_mission_candidate_profiles(mission_id_text):
            source_profile_id = str(row.get("source_profile_id") or "")
            if not source_profile_id:
                continue
            channel_metrics = await repository.get_channel_metrics(
                str(row.get("registered_channel_id") or "") or None
            )
            if source_profile_id:
                quality_snapshot = compute_source_recall_quality_snapshot(
                    profile={
                        "source_profile_id": source_profile_id,
                        "canonical_domain": row.get("canonical_domain"),
                        "source_type": row.get("source_type"),
                        "trust_score": row.get("trust_score"),
                        "source_linking_quality": row.get("source_linking_quality"),
                        "technical_quality": row.get("technical_quality"),
                        "historical_stability": row.get("historical_stability"),
                        "spam_signals": row.get("spam_signals"),
                        "extraction_data": row.get("extraction_data") or {},
                    },
                    candidate=row,
                    channel_metrics=channel_metrics,
                )
                await repository.upsert_source_quality_snapshot(
                    source_profile_id=source_profile_id,
                    channel_id=str(row.get("registered_channel_id") or "") or None,
                    snapshot_reason="discovery_re_evaluate",
                    snapshot_row=quality_snapshot,
                )
                quality_snapshot_count += 1
            score_row = compute_source_interest_score(
                mission_graph=graph,
                profile={
                    "source_profile_id": source_profile_id,
                    "canonical_domain": row.get("canonical_domain"),
                    "source_type": row.get("source_type"),
                    "trust_score": row.get("trust_score"),
                    "source_linking_quality": row.get("source_linking_quality"),
                    "technical_quality": row.get("technical_quality"),
                    "historical_stability": row.get("historical_stability"),
                    "spam_signals": row.get("spam_signals"),
                    "extraction_data": row.get("extraction_data") or {},
                },
                candidate=row,
                channel_metrics=channel_metrics,
            )
            profile_feedback = feedback_by_profile.get(source_profile_id, [])
            if profile_feedback:
                positive = sum(
                    1
                    for item in profile_feedback
                    if str(item.get("feedback_type") or "") in {"valuable_source", "early_signal", "keep"}
                )
                negative = sum(
                    1
                    for item in profile_feedback
                    if str(item.get("feedback_type") or "") in {"too_noisy", "duplicate_source", "reject"}
                )
                adjusted = clamp_score(
                    clamp_score(score_row.get("contextual_score")) + positive * 0.05 - negative * 0.07
                )
                score_row["contextual_score"] = adjusted
            await repository.upsert_source_interest_score(
                mission_id=mission_id_text,
                source_profile_id=source_profile_id,
                channel_id=str(row.get("registered_channel_id") or "") or None,
                score_row=score_row,
            )
            scored_sources.append(
                {
                    "candidate_id": row.get("candidate_id"),
                    "source_profile_id": source_profile_id,
                    "canonical_domain": row.get("canonical_domain"),
                    "trust_score": clamp_score(row.get("trust_score")),
                    "contextual_score": clamp_score(score_row.get("contextual_score")),
                    "fit_score": clamp_score(score_row.get("fit_score")),
                    "novelty_score": clamp_score(score_row.get("novelty_score")),
                    "lead_time_score": clamp_score(score_row.get("lead_time_score")),
                    "yield_score": clamp_score(score_row.get("yield_score")),
                    "duplication_score": clamp_score(score_row.get("duplication_score")),
                    "role_labels": score_row.get("role_labels") or [],
                    "title": row.get("title"),
                    "url": row.get("url"),
                }
            )

        portfolio = build_portfolio_snapshot(
            mission_graph=graph,
            scored_sources=scored_sources,
        )
        await repository.replace_portfolio_snapshot(
            mission_id=mission_id_text,
            snapshot_reason="re_evaluate",
            ranked_sources=portfolio["ranked_sources"],
            gaps=portfolio["gaps"],
            summary=portfolio["summary"],
        )
        portfolio_count += 1
        await repository.insert_gap_hypotheses(
            mission_id=mission_id_text,
            hypotheses=build_gap_filling_hypotheses(
                mission_graph=graph,
                gaps=portfolio["gaps"],
                class_rows=class_rows,
            ),
        )

    return {
        "discovery_re_evaluated_mission_ids": target_mission_ids,
        "discovery_re_evaluated_count": len(target_mission_ids),
        "discovery_portfolio_snapshot_count": portfolio_count,
        "discovery_feedback_row_count": feedback_count,
        "discovery_source_quality_snapshot_count": quality_snapshot_count,
    }

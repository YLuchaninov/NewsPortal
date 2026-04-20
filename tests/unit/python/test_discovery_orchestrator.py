import sys
import types
import unittest
from decimal import Decimal
from typing import Any
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

from services.workers.app.discovery_orchestrator import (
    DISCOVERY_RSS_PIPELINE_SEQUENCE_ID,
    DISCOVERY_WEBSITE_PIPELINE_SEQUENCE_ID,
    DiscoverySettings,
    _recall_candidate_rows_from_probe_results,
    acquire_recall_missions,
    compile_interest_graph_for_mission,
    evaluate_hypotheses,
    execute_hypotheses,
    plan_hypotheses,
    re_evaluate_sources,
)


class _FakeLlmAnalyzer:
    def __init__(self, responses: dict[str, Any]) -> None:
        self.responses = dict(responses)
        self.calls: list[dict[str, Any]] = []

    def analyze(
        self,
        *,
        prompt: str | None,
        task: str | None,
        payload: Any,
        model: str | None,
        temperature: float,
        output_schema: dict[str, Any] | None,
    ) -> Any:
        self.calls.append(
            {
                "prompt": prompt,
                "task": task,
                "payload": payload,
                "model": model,
                "temperature": temperature,
                "output_schema": output_schema,
            }
        )
        return self.responses.get(str(task or ""), {"result": [], "meta": {"request_count": 0}})


class _FailingLlmAnalyzer:
    def __init__(self, error: Exception) -> None:
        self.error = error
        self.calls: list[dict[str, Any]] = []

    def analyze(
        self,
        *,
        prompt: str | None,
        task: str | None,
        payload: Any,
        model: str | None,
        temperature: float,
        output_schema: dict[str, Any] | None,
    ) -> Any:
        self.calls.append(
            {
                "prompt": prompt,
                "task": task,
                "payload": payload,
                "model": model,
                "temperature": temperature,
                "output_schema": output_schema,
            }
        )
        raise self.error


class _FakeSourceRegistrar:
    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []

    def register_sources(
        self,
        *,
        sources: list[dict[str, Any]],
        enabled: bool,
        dry_run: bool,
        created_by: str | None,
        tags: list[str],
        provider_type: str,
    ) -> list[dict[str, Any]]:
        self.calls.append(
            {
                "sources": sources,
                "enabled": enabled,
                "dry_run": dry_run,
                "created_by": created_by,
                "tags": tags,
                "provider_type": provider_type,
            }
        )
        return [
            {
                "channel_id": "channel-1",
                "status": "registered",
                "provider_type": provider_type,
            }
        ]


class _FakeWebSearchAdapter:
    def __init__(self, responses: dict[str, Any]) -> None:
        self.responses = dict(responses)
        self.calls: list[dict[str, Any]] = []

    def search(
        self,
        *,
        query: str,
        count: int,
        result_type: str,
        time_range: str | None,
    ) -> dict[str, Any]:
        self.calls.append(
            {
                "query": query,
                "count": count,
                "result_type": result_type,
                "time_range": time_range,
            }
        )
        return dict(
            self.responses.get(
                query,
                {
                    "results": [],
                    "meta": {
                        "provider": "stub",
                        "request_count": 0,
                        "cost_usd": 0.0,
                    },
                },
            )
        )


class _FakeRssProbeAdapter:
    def __init__(self, responses: dict[str, dict[str, Any]] | None = None) -> None:
        self.responses = dict(responses or {})
        self.calls: list[dict[str, Any]] = []

    def probe_feeds(self, *, urls: list[str], sample_count: int) -> list[dict[str, Any]]:
        self.calls.append({"urls": list(urls), "sample_count": sample_count})
        rows: list[dict[str, Any]] = []
        for url in urls:
            rows.append(
                dict(
                    self.responses.get(
                        url,
                        {
                            "url": url,
                            "feed_url": url,
                            "is_valid_rss": True,
                            "feed_title": url,
                            "sample_entries": [],
                            "error_text": None,
                        },
                    )
                )
            )
        return rows


class _FakeWebsiteProbeAdapter:
    def __init__(self, responses: dict[str, dict[str, Any]] | None = None) -> None:
        self.responses = dict(responses or {})
        self.calls: list[dict[str, Any]] = []

    def probe_websites(self, *, urls: list[str], sample_count: int) -> list[dict[str, Any]]:
        self.calls.append({"urls": list(urls), "sample_count": sample_count})
        rows: list[dict[str, Any]] = []
        for url in urls:
            rows.append(
                dict(
                    self.responses.get(
                        url,
                        {
                            "url": url,
                            "final_url": url,
                            "title": url,
                            "classification": {"kind": "editorial", "confidence": 0.8},
                            "capabilities": {"supports_collection_discovery": True},
                            "sample_resources": [],
                            "error_text": None,
                        },
                    )
                )
            )
        return rows


class _FakeRuntime:
    def __init__(self, responses: dict[str, Any]) -> None:
        self.llm_analyzer = _FakeLlmAnalyzer(responses)
        self.source_registrar = _FakeSourceRegistrar()
        self.web_search = _FakeWebSearchAdapter(
            responses.get("web_search", {}) if isinstance(responses.get("web_search"), dict) else {}
        )
        self.rss_probe = _FakeRssProbeAdapter(
            responses.get("rss_probe", {}) if isinstance(responses.get("rss_probe"), dict) else {}
        )
        self.website_probe = _FakeWebsiteProbeAdapter(
            responses.get("website_probe", {}) if isinstance(responses.get("website_probe"), dict) else {}
        )


class _FakeDiscoveryRepository:
    def __init__(self) -> None:
        self.mission = {
            "mission_id": "mission-1",
            "title": "EU AI discovery",
            "description": "Track European AI regulation and ecosystem signals.",
            "seed_topics": ["EU AI", "regulation"],
            "seed_languages": ["en"],
            "seed_regions": ["EU"],
            "target_provider_types": ["rss", "website"],
            "interest_graph": {
                "core_topic": "EU AI",
                "subtopics": ["regulation"],
                "entities": ["EU Commission"],
                "people": [],
                "organizations": ["European Commission"],
                "geos": ["EU"],
                "languages": ["en"],
                "source_types": ["news", "blog"],
                "event_types": ["policy"],
                "positive_signals": ["compliance"],
                "negative_signals": [],
                "exclusions": [],
                "freshness_horizon_days": 14,
                "ambiguities": [],
                "known_good_sources": [],
                "known_bad_sources": [],
            },
            "interest_graph_status": "compiled",
            "interest_graph_version": 1,
            "max_hypotheses": 4,
            "max_sources": 10,
            "budget_cents": 500,
            "spent_cents": 0,
            "status": "active",
            "priority": 2,
            "run_count": 0,
        }
        self.recall_mission = {
            "recall_mission_id": "recall-mission-1",
            "title": "Independent recall for AI compliance domains",
            "description": "Find broad recall candidates without relying on interest_graph.",
            "mission_kind": "domain_seed",
            "seed_domains": ["independent.example.com"],
            "seed_urls": ["https://independent.example.com/feed.xml"],
            "seed_queries": ["AI compliance newsroom"],
            "target_provider_types": ["rss", "website"],
            "scope_json": {"freshness_days": 30},
            "status": "active",
            "max_candidates": 4,
            "created_by": "test",
        }
        self.class_rows = [
            {
                "class_key": "lexical",
                "display_name": "Lexical",
                "status": "active",
                "generation_backend": "graph_seed_llm",
                "default_provider_types": ["website"],
                "seed_rules_json": {"tactics": ["synonym"]},
                "max_per_mission": 1,
                "sort_order": 10,
                "config_json": {},
            }
        ]
        self.strategy_rows: list[dict[str, Any]] = []
        self.month_to_date_cost_usd = Decimal("0")
        self.mission_spent_usd = Decimal("0")
        self.hypotheses: list[dict[str, Any]] = []
        self.candidates: list[dict[str, Any]] = []
        self.cost_rows: list[dict[str, Any]] = []
        self.effectiveness_updates: list[dict[str, Any]] = []
        self.refreshed_mission_ids: list[str] = []
        self.running_updates: list[tuple[str, str]] = []
        self.completed_updates: list[dict[str, Any]] = []
        self.skipped_updates: list[dict[str, Any]] = []
        self.failed_updates: list[dict[str, Any]] = []
        self.linked_profiles: list[dict[str, str]] = []
        self.linked_recall_profiles: list[dict[str, str]] = []
        self.source_profiles: list[dict[str, Any]] = []
        self.source_quality_snapshots: list[dict[str, Any]] = []
        self.source_interest_scores: list[dict[str, Any]] = []
        self.portfolio_snapshots: list[dict[str, Any]] = []
        self.gap_hypotheses: list[dict[str, Any]] = []
        self.strategy_updates: list[dict[str, Any]] = []
        self.feedback_events: list[dict[str, Any]] = []
        self.recall_candidates: list[dict[str, Any]] = []
        self.refreshed_recall_mission_ids: list[str] = []

    async def ensure_interest_template_missions(self, *, settings: DiscoverySettings) -> list[str]:
        del settings
        return []

    async def list_runnable_missions(self, *, mission_id: str | None = None) -> list[dict[str, Any]]:
        if mission_id and mission_id != self.mission["mission_id"]:
            return []
        return [dict(self.mission)]

    async def get_mission(self, mission_id: str) -> dict[str, Any] | None:
        if mission_id != self.mission["mission_id"]:
            return None
        return dict(self.mission)

    async def list_runnable_recall_missions(
        self,
        *,
        recall_mission_id: str | None = None,
    ) -> list[dict[str, Any]]:
        if recall_mission_id and recall_mission_id != self.recall_mission["recall_mission_id"]:
            return []
        return [dict(self.recall_mission)]

    async def get_recall_mission(self, recall_mission_id: str) -> dict[str, Any] | None:
        if recall_mission_id != self.recall_mission["recall_mission_id"]:
            return None
        return dict(self.recall_mission)

    async def list_active_hypothesis_classes(
        self,
        *,
        class_keys: list[str] | None = None,
    ) -> list[dict[str, Any]]:
        allowed = set(class_keys or [])
        rows = [dict(item) for item in self.class_rows if item["status"] == "active"]
        if not allowed:
            return rows
        return [item for item in rows if str(item.get("class_key") or "") in allowed]

    async def list_strategy_stats(self, mission_id: str) -> list[dict[str, Any]]:
        del mission_id
        return [dict(item) for item in self.strategy_rows]

    async def list_existing_source_channels(self) -> dict[str, str]:
        return {"https://known.example.com/feed.xml": "channel-known"}

    async def list_existing_source_urls(self) -> set[str]:
        return set((await self.list_existing_source_channels()).keys())

    async def list_recent_hypotheses(self, mission_id: str) -> list[dict[str, Any]]:
        del mission_id
        return []

    async def upsert_interest_graph(
        self,
        *,
        mission_id: str,
        interest_graph: dict[str, Any],
        status: str,
        error_text: str | None = None,
    ) -> dict[str, Any] | None:
        if mission_id != self.mission["mission_id"]:
            return None
        self.mission["interest_graph"] = dict(interest_graph)
        self.mission["interest_graph_status"] = status
        self.mission["interest_graph_version"] = int(self.mission.get("interest_graph_version") or 0) + 1
        self.mission["interest_graph_error_text"] = error_text
        return {
            "mission_id": mission_id,
            "interest_graph": dict(interest_graph),
            "interest_graph_status": status,
            "interest_graph_version": self.mission["interest_graph_version"],
        }

    async def insert_hypotheses(self, *, mission_id: str, hypotheses: list[dict[str, Any]]) -> list[str]:
        ids: list[str] = []
        for hypothesis in hypotheses:
            hypothesis_id = f"hypothesis-{len(self.hypotheses) + 1}"
            stored = {
                **dict(hypothesis),
                "hypothesis_id": hypothesis_id,
                "mission_id": mission_id,
                "interest_graph": dict(self.mission["interest_graph"]),
                "budget_cents": self.mission["budget_cents"],
                "spent_usd": self.mission_spent_usd,
                "status": "pending",
            }
            self.hypotheses.append(stored)
            ids.append(hypothesis_id)
        return ids

    async def list_pending_hypotheses(self, *, mission_id: str | None, limit: int) -> list[dict[str, Any]]:
        rows = [
            {
                **dict(hypothesis),
                "spent_usd": self.mission_spent_usd,
                "budget_cents": self.mission["budget_cents"],
                "interest_graph": dict(self.mission["interest_graph"]),
            }
            for hypothesis in self.hypotheses
            if hypothesis["status"] == "pending"
            and (mission_id is None or hypothesis["mission_id"] == mission_id)
        ]
        return rows[:limit]

    async def mark_hypothesis_running(self, *, hypothesis_id: str, sequence_run_id: str) -> None:
        self.running_updates.append((hypothesis_id, sequence_run_id))
        for hypothesis in self.hypotheses:
            if hypothesis["hypothesis_id"] == hypothesis_id:
                hypothesis["status"] = "running"
                hypothesis["sequence_run_id"] = sequence_run_id

    async def mark_hypothesis_completed(
        self,
        *,
        hypothesis_id: str,
        sources_found: int,
        sources_approved: int,
        execution_cost_cents: int,
        execution_cost_usd: Decimal,
    ) -> None:
        self.completed_updates.append(
            {
                "hypothesis_id": hypothesis_id,
                "sources_found": sources_found,
                "sources_approved": sources_approved,
                "execution_cost_cents": execution_cost_cents,
                "execution_cost_usd": execution_cost_usd,
            }
        )
        for hypothesis in self.hypotheses:
            if hypothesis["hypothesis_id"] == hypothesis_id:
                hypothesis["status"] = "completed"
                hypothesis["sources_found"] = sources_found
                hypothesis["sources_approved"] = sources_approved
                hypothesis["execution_cost_cents"] = execution_cost_cents
                hypothesis["execution_cost_usd"] = execution_cost_usd

    async def mark_hypothesis_failed(self, *, hypothesis_id: str, error_text: str) -> None:
        self.failed_updates.append({"hypothesis_id": hypothesis_id, "error_text": error_text})

    async def mark_hypothesis_skipped(self, *, hypothesis_id: str, error_text: str) -> None:
        self.skipped_updates.append({"hypothesis_id": hypothesis_id, "error_text": error_text})
        for hypothesis in self.hypotheses:
            if hypothesis["hypothesis_id"] == hypothesis_id:
                hypothesis["status"] = "skipped"

    async def upsert_candidates(self, candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
        stored_rows: list[dict[str, Any]] = []
        for candidate in candidates:
            stored = dict(candidate)
            stored["candidate_id"] = f"candidate-{len(self.candidates) + 1}"
            self.candidates.append(stored)
            stored_rows.append(dict(stored))
        return stored_rows

    async def upsert_recall_candidates(self, candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
        stored_rows: list[dict[str, Any]] = []
        for candidate in candidates:
            stored = dict(candidate)
            stored["recall_candidate_id"] = f"recall-candidate-{len(self.recall_candidates) + 1}"
            self.recall_candidates.append(stored)
            stored_rows.append(dict(stored))
        return stored_rows

    async def upsert_source_profile(self, *, candidate_id: str, profile: dict[str, Any]) -> dict[str, Any]:
        stored = {
            **dict(profile),
            "source_profile_id": f"profile-{len(self.source_profiles) + 1}",
            "candidate_id": candidate_id,
        }
        self.source_profiles.append(stored)
        return dict(stored)

    async def upsert_source_profile_for_recall_candidate(
        self,
        *,
        profile: dict[str, Any],
    ) -> dict[str, Any]:
        canonical_domain = str(profile.get("canonical_domain") or "")
        existing = next(
            (
                item
                for item in self.source_profiles
                if item.get("canonical_domain") == canonical_domain and canonical_domain
            ),
            None,
        )
        if existing is not None:
            existing.update(dict(profile))
            return dict(existing)
        stored = {
            **dict(profile),
            "source_profile_id": f"profile-{len(self.source_profiles) + 1}",
            "candidate_id": None,
            "channel_id": None,
        }
        self.source_profiles.append(stored)
        return dict(stored)

    async def link_candidate_profile(self, *, candidate_id: str, source_profile_id: str) -> None:
        self.linked_profiles.append(
            {"candidate_id": candidate_id, "source_profile_id": source_profile_id}
        )
        for candidate in self.candidates:
            if candidate["candidate_id"] == candidate_id:
                candidate["source_profile_id"] = source_profile_id

    async def link_recall_candidate_profile(
        self,
        *,
        recall_candidate_id: str,
        source_profile_id: str,
    ) -> None:
        self.linked_recall_profiles.append(
            {
                "recall_candidate_id": recall_candidate_id,
                "source_profile_id": source_profile_id,
            }
        )
        for candidate in self.recall_candidates:
            if candidate["recall_candidate_id"] == recall_candidate_id:
                candidate["source_profile_id"] = source_profile_id

    async def update_candidate_registration(
        self,
        *,
        candidate_id: str,
        status: str,
        channel_id: str | None,
        rejection_reason: str | None,
    ) -> None:
        for candidate in self.candidates:
            if candidate["candidate_id"] == candidate_id:
                candidate["status"] = status
                candidate["registered_channel_id"] = channel_id
                candidate["rejection_reason"] = rejection_reason

    async def list_hypothesis_candidate_stats(self, hypothesis_ids: list[str]) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        for hypothesis in self.hypotheses:
            if hypothesis["hypothesis_id"] not in hypothesis_ids:
                continue
            related = [
                candidate
                for candidate in self.candidates
                if candidate["hypothesis_id"] == hypothesis["hypothesis_id"]
            ]
            approved_count = sum(
                1 for candidate in related if candidate.get("status") in {"approved", "auto_approved"}
            )
            rows.append(
                {
                    "hypothesis_id": hypothesis["hypothesis_id"],
                    "mission_id": hypothesis["mission_id"],
                    "class_key": hypothesis.get("class_key"),
                    "tactic_key": hypothesis.get("tactic_key"),
                    "sources_found": len(related),
                    "sources_approved": approved_count,
                }
            )
        return rows

    async def update_hypothesis_effectiveness(
        self,
        *,
        hypothesis_id: str,
        effectiveness: float,
        sources_approved: int,
    ) -> None:
        self.effectiveness_updates.append(
            {
                "hypothesis_id": hypothesis_id,
                "effectiveness": effectiveness,
                "sources_approved": sources_approved,
            }
        )

    async def refresh_mission_stats(self, mission_ids: list[str]) -> None:
        self.refreshed_mission_ids = list(mission_ids)

    async def refresh_recall_mission_stats(self, recall_mission_ids: list[str]) -> None:
        self.refreshed_recall_mission_ids = list(recall_mission_ids)
        if self.recall_mission["recall_mission_id"] not in recall_mission_ids:
            return
        if self.recall_mission["status"] == "paused":
            return
        candidate_count = sum(
            1
            for candidate in self.recall_candidates
            if candidate["recall_mission_id"] == self.recall_mission["recall_mission_id"]
        )
        self.recall_mission["status"] = (
            "completed"
            if candidate_count >= int(self.recall_mission.get("max_candidates") or 0)
            else "active"
        )

    async def get_month_to_date_cost_usd(self, month_start: Any) -> Decimal:
        del month_start
        return self.month_to_date_cost_usd

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
        self.cost_rows.append(
            {
                "mission_id": mission_id,
                "hypothesis_id": hypothesis_id,
                "operation": operation,
                "provider": provider,
                "cost_usd": cost_usd,
                "cost_cents": cost_cents,
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
                "request_count": request_count,
                "metadata": metadata,
            }
        )

    async def upsert_source_interest_score(
        self,
        *,
        mission_id: str,
        source_profile_id: str,
        channel_id: str | None,
        score_row: dict[str, Any],
    ) -> dict[str, Any]:
        stored = {
            **dict(score_row),
            "score_id": f"score-{len(self.source_interest_scores) + 1}",
            "mission_id": mission_id,
            "source_profile_id": source_profile_id,
            "channel_id": channel_id,
        }
        self.source_interest_scores.append(stored)
        return dict(stored)

    async def upsert_source_quality_snapshot(
        self,
        *,
        source_profile_id: str,
        channel_id: str | None,
        snapshot_reason: str,
        snapshot_row: dict[str, Any],
    ) -> dict[str, Any]:
        stored = {
            **dict(snapshot_row),
            "snapshot_id": f"quality-{len(self.source_quality_snapshots) + 1}",
            "source_profile_id": source_profile_id,
            "channel_id": channel_id,
            "snapshot_reason": snapshot_reason,
        }
        self.source_quality_snapshots.append(stored)
        return dict(stored)

    async def replace_portfolio_snapshot(
        self,
        *,
        mission_id: str,
        snapshot_reason: str,
        ranked_sources: list[dict[str, Any]],
        gaps: list[dict[str, Any]],
        summary: dict[str, Any],
    ) -> dict[str, Any]:
        snapshot = {
            "snapshot_id": f"snapshot-{len(self.portfolio_snapshots) + 1}",
            "mission_id": mission_id,
            "snapshot_reason": snapshot_reason,
            "ranked_sources": list(ranked_sources),
            "gaps": list(gaps),
            "summary": dict(summary),
        }
        self.portfolio_snapshots.append(snapshot)
        return dict(snapshot)

    async def list_mission_candidate_profiles(self, mission_id: str) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        for candidate in self.candidates:
            if candidate["mission_id"] != mission_id or not candidate.get("source_profile_id"):
                continue
            profile = next(
                item
                for item in self.source_profiles
                if item["source_profile_id"] == candidate["source_profile_id"]
            )
            rows.append({**dict(candidate), **dict(profile)})
        return rows

    async def list_feedback_events(self, mission_id: str) -> list[dict[str, Any]]:
        return [dict(item) for item in self.feedback_events if item.get("mission_id") == mission_id]

    async def upsert_strategy_stat(
        self,
        *,
        mission_id: str,
        class_key: str,
        tactic_key: str,
        success: bool,
        effectiveness: float | None,
    ) -> None:
        self.strategy_updates.append(
            {
                "mission_id": mission_id,
                "class_key": class_key,
                "tactic_key": tactic_key,
                "success": success,
                "effectiveness": effectiveness,
            }
        )

    async def get_channel_metrics(self, channel_id: str | None) -> dict[str, Any]:
        del channel_id
        return {
            "metric_source": "generic_channel_quality",
            "total_articles_period": 12,
            "unique_articles_period": 9,
            "duplicate_articles_period": 3,
            "fresh_articles_period": 6,
            "fetch_runs_period": 10,
            "successful_fetch_runs_period": 8,
            "new_content_fetch_runs_period": 4,
            "degraded_fetch_runs_period": 2,
            "duplicate_suppressed_period": 3,
            "new_articles_from_fetch_period": 9,
            "yield_score": 0.69,
            "lead_time_score": 0.62,
            "duplication_score": 0.27,
            "fetch_health_score": 0.8,
            "freshness_score": 0.5,
            "uniqueness_score": 0.75,
            "activity_score": 0.4,
        }

    async def insert_gap_hypotheses(
        self,
        *,
        mission_id: str,
        hypotheses: list[dict[str, Any]],
    ) -> list[str]:
        self.gap_hypotheses.extend({**dict(item), "mission_id": mission_id} for item in hypotheses)
        return [f"gap-{index}" for index, _item in enumerate(hypotheses, start=1)]


class _FakeSequenceRepository:
    def __init__(self) -> None:
        self.created_runs: list[dict[str, Any]] = []

    async def create_pending_run(
        self,
        *,
        sequence_id: str,
        context_json: dict[str, Any],
        trigger_type: str,
        trigger_meta: dict[str, Any],
    ) -> str:
        run_id = f"run-{len(self.created_runs) + 1}"
        self.created_runs.append(
            {
                "run_id": run_id,
                "sequence_id": sequence_id,
                "context_json": dict(context_json),
                "trigger_type": trigger_type,
                "trigger_meta": dict(trigger_meta),
            }
        )
        return run_id


class DiscoveryOrchestratorTests(unittest.IsolatedAsyncioTestCase):
    async def test_compile_interest_graph_reuses_manual_graph_without_llm_runtime(self) -> None:
        repository = _FakeDiscoveryRepository()
        runtime = _FakeRuntime({})
        runtime.llm_analyzer = _FailingLlmAnalyzer(
            RuntimeError("LLM analyzer adapter is not configured for the Universal Task Engine runtime.")
        )

        with patch(
            "services.workers.app.discovery_orchestrator.get_discovery_runtime",
            return_value=runtime,
        ):
            result = await compile_interest_graph_for_mission(
                mission=dict(repository.mission),
                repository=repository,
            )

        self.assertEqual(result["core_topic"], "EU AI")
        self.assertEqual(repository.mission["interest_graph_status"], "compiled")
        self.assertEqual(runtime.llm_analyzer.calls, [])
        self.assertEqual(repository.cost_rows, [])

    async def test_compile_interest_graph_falls_back_when_llm_runtime_is_unavailable(self) -> None:
        repository = _FakeDiscoveryRepository()
        repository.mission["interest_graph"] = None
        repository.mission["interest_graph_status"] = "pending"
        runtime = _FakeRuntime({})
        runtime.llm_analyzer = _FailingLlmAnalyzer(
            RuntimeError("LLM analyzer adapter is not configured for the Universal Task Engine runtime.")
        )

        with patch(
            "services.workers.app.discovery_orchestrator.get_discovery_runtime",
            return_value=runtime,
        ):
            result = await compile_interest_graph_for_mission(
                mission=dict(repository.mission),
                repository=repository,
            )

        self.assertEqual(result["core_topic"], "EU AI")
        self.assertEqual(repository.mission["interest_graph_status"], "compiled")
        self.assertEqual(repository.mission["interest_graph"]["known_good_sources"], ["https://known.example.com/feed.xml"])
        self.assertEqual(len(runtime.llm_analyzer.calls), 1)
        self.assertEqual(repository.cost_rows, [])

    async def test_plan_hypotheses_falls_back_to_registry_seeds_without_cost_logging(self) -> None:
        repository = _FakeDiscoveryRepository()
        runtime = _FakeRuntime({"discovery_plan_hypotheses": {"not": "a-list"}})

        with patch(
            "services.workers.app.discovery_orchestrator.get_discovery_runtime",
            return_value=runtime,
        ):
            result = await plan_hypotheses(
                mission_id="mission-1",
                settings=DiscoverySettings(max_hypotheses_per_run=5),
                repository=repository,
            )

        self.assertEqual(result["discovery_planned_count"], 1)
        self.assertEqual(result["discovery_planned_mission_ids"], ["mission-1"])
        self.assertEqual(repository.hypotheses[0]["class_key"], "lexical")
        self.assertEqual(repository.hypotheses[0]["tactic_key"], "synonym")
        self.assertIn("regulation", repository.hypotheses[0]["search_query"])
        self.assertEqual(repository.cost_rows, [])

    async def test_plan_hypotheses_logs_mission_level_llm_spend_before_hypotheses_exist(self) -> None:
        repository = _FakeDiscoveryRepository()
        runtime = _FakeRuntime(
            {
                "discovery_plan_hypotheses": {
                    "result": [
                        {
                            "class_key": "lexical",
                            "tactic_key": "synonym",
                            "search_query": "EU AI official bulletin",
                            "target_provider_type": "rss",
                            "generation_context": {"origin": "llm"},
                            "expected_value": "Lexical / synonym",
                        }
                    ],
                    "meta": {
                        "provider": "gemini",
                        "model": "gemini-2.5-pro",
                        "request_count": 1,
                        "prompt_tokens": 120,
                        "completion_tokens": 40,
                        "cost_usd": 0.015,
                    },
                }
            }
        )

        with patch(
            "services.workers.app.discovery_orchestrator.get_discovery_runtime",
            return_value=runtime,
        ):
            await plan_hypotheses(
                mission_id="mission-1",
                settings=DiscoverySettings(max_hypotheses_per_run=5),
                repository=repository,
            )

        self.assertEqual(len(repository.cost_rows), 1)
        self.assertIsNone(repository.cost_rows[0]["hypothesis_id"])
        self.assertEqual(repository.cost_rows[0]["operation"], "mission_planning_llm")
        self.assertEqual(repository.cost_rows[0]["provider"], "gemini")
        self.assertEqual(repository.cost_rows[0]["cost_usd"], Decimal("0.015"))
        self.assertEqual(repository.cost_rows[0]["input_tokens"], 120)
        self.assertEqual(repository.cost_rows[0]["output_tokens"], 40)
        self.assertEqual(repository.cost_rows[0]["request_count"], 1)
        self.assertEqual(repository.hypotheses[0]["class_key"], "lexical")

    async def test_plan_hypotheses_supports_custom_registry_classes_without_code_changes(self) -> None:
        repository = _FakeDiscoveryRepository()
        repository.class_rows = [
            {
                "class_key": "regional_watch",
                "display_name": "Regional Watch",
                "status": "active",
                "generation_backend": "graph_seed_only",
                "default_provider_types": ["website"],
                "seed_rules_json": {"tactics": ["local_watch"]},
                "max_per_mission": 1,
                "sort_order": 10,
                "config_json": {},
            }
        ]
        runtime = _FakeRuntime({"discovery_plan_hypotheses": {"result": [], "meta": {"request_count": 0}}})

        with patch(
            "services.workers.app.discovery_orchestrator.get_discovery_runtime",
            return_value=runtime,
        ):
            result = await plan_hypotheses(
                mission_id="mission-1",
                settings=DiscoverySettings(max_hypotheses_per_run=5),
                repository=repository,
            )

        self.assertEqual(result["discovery_planned_count"], 1)
        self.assertEqual(repository.hypotheses[0]["class_key"], "regional_watch")
        self.assertEqual(repository.hypotheses[0]["tactic_key"], "local_watch")
        self.assertEqual(repository.hypotheses[0]["target_provider_type"], "website")
        self.assertEqual(repository.hypotheses[0]["search_query"], "EU AI local_watch")

    async def test_plan_hypotheses_can_be_restricted_to_specific_registry_classes(self) -> None:
        repository = _FakeDiscoveryRepository()
        repository.class_rows = [
            {
                "class_key": "live_example_b_website",
                "display_name": "Live Example Website",
                "status": "active",
                "generation_backend": "graph_seed_only",
                "default_provider_types": ["website"],
                "seed_rules_json": {"tactics": ["live_watch"]},
                "max_per_mission": 1,
                "sort_order": -100,
                "config_json": {},
            },
            {
                "class_key": "adaptive_smoke_fixture",
                "display_name": "Adaptive Smoke",
                "status": "active",
                "generation_backend": "graph_seed_only",
                "default_provider_types": ["website"],
                "seed_rules_json": {"tactics": ["signal"]},
                "max_per_mission": 1,
                "sort_order": 1,
                "config_json": {},
            },
        ]
        runtime = _FakeRuntime({"discovery_plan_hypotheses": {"result": [], "meta": {"request_count": 0}}})

        with patch(
            "services.workers.app.discovery_orchestrator.get_discovery_runtime",
            return_value=runtime,
        ):
            result = await plan_hypotheses(
                mission_id="mission-1",
                settings=DiscoverySettings(max_hypotheses_per_run=5),
                repository=repository,
                class_keys=["adaptive_smoke_fixture"],
            )

        self.assertEqual(result["discovery_planned_count"], 1)
        self.assertEqual(repository.hypotheses[0]["class_key"], "adaptive_smoke_fixture")
        self.assertEqual(repository.hypotheses[0]["tactic_key"], "signal")
        self.assertEqual(repository.hypotheses[0]["target_provider_type"], "website")

    async def test_execute_hypotheses_dispatches_child_run_auto_approves_and_logs_precise_costs(self) -> None:
        repository = _FakeDiscoveryRepository()
        inserted = await repository.insert_hypotheses(
            mission_id="mission-1",
            hypotheses=[
                {
                    "class_key": "lexical",
                    "tactic_key": "synonym",
                    "search_query": "EU AI official bulletin",
                    "target_urls": [],
                    "target_provider_type": "rss",
                    "generation_context": {"origin": "seed"},
                    "expected_value": "Lexical / synonym",
                }
            ],
        )
        self.assertEqual(inserted, ["hypothesis-1"])
        runtime = _FakeRuntime({})
        sequence_repository = _FakeSequenceRepository()

        async def fake_execute_run(self, run_id: str) -> dict[str, Any]:
            del self, run_id
            return {
                "status": "completed",
                "context": {
                    "probed_feeds": [
                        {
                            "url": "https://fresh.example.com/feed.xml",
                            "feed_title": "Fresh feed",
                            "is_valid_rss": True,
                            "sample_entries": [{"title": "Fresh story"}],
                        },
                        {
                            "url": "https://known.example.com/feed.xml",
                            "feed_title": "Known feed",
                            "is_valid_rss": True,
                            "sample_entries": [{"title": "Known story"}],
                        },
                    ],
                    "scored_sources": [
                        {
                            "source_url": "https://fresh.example.com/feed.xml",
                            "relevance_score": 0.92,
                        },
                        {
                            "source_url": "https://known.example.com/feed.xml",
                            "relevance_score": 0.45,
                        },
                    ],
                    "llm_analysis": [
                        {
                            "source_url": "https://fresh.example.com/feed.xml",
                            "relevance": 0.94,
                            "reasoning": "Strong newsroom fit",
                        }
                    ],
                    "search_meta": {
                        "provider": "ddgs",
                        "backend": "auto",
                        "request_count": 1,
                        "cost_usd": 0.0,
                    },
                    "llm_analysis_meta": {
                        "provider": "gemini",
                        "model": "gemini-2.0-flash",
                        "request_count": 1,
                        "prompt_tokens": 300,
                        "completion_tokens": 100,
                        "cost_usd": 0.0125,
                    },
                },
            }

        with (
            patch(
                "services.workers.app.discovery_orchestrator.get_discovery_runtime",
                return_value=runtime,
            ),
            patch(
                "services.workers.app.discovery_orchestrator.SequenceExecutor.execute_run",
                new=fake_execute_run,
            ),
        ):
            result = await execute_hypotheses(
                mission_id="mission-1",
                settings=DiscoverySettings(
                    max_hypotheses_per_run=5,
                    search_provider="ddgs",
                    default_auto_approve_threshold=0.4,
                ),
                repository=repository,
                sequence_repository=sequence_repository,  # type: ignore[arg-type]
            )

        self.assertEqual(result["discovery_executed_count"], 1)
        self.assertEqual(result["discovery_candidate_count"], 2)
        self.assertEqual(result["discovery_source_interest_score_count"], 2)
        self.assertEqual(result["discovery_source_quality_snapshot_count"], 2)
        self.assertEqual(sequence_repository.created_runs[0]["sequence_id"], DISCOVERY_RSS_PIPELINE_SEQUENCE_ID)
        self.assertEqual(repository.running_updates, [("hypothesis-1", "run-1")])
        self.assertEqual(repository.completed_updates[0]["sources_found"], 2)
        self.assertEqual(repository.completed_updates[0]["sources_approved"], 1)
        self.assertEqual(repository.completed_updates[0]["execution_cost_cents"], 1)
        self.assertEqual(repository.completed_updates[0]["execution_cost_usd"], Decimal("0.0125"))
        self.assertEqual(runtime.source_registrar.calls[0]["provider_type"], "rss")
        fresh_candidate = next(
            candidate for candidate in repository.candidates if candidate["url"] == "https://fresh.example.com/feed.xml"
        )
        known_candidate = next(
            candidate for candidate in repository.candidates if candidate["url"] == "https://known.example.com/feed.xml"
        )
        self.assertEqual(fresh_candidate["status"], "auto_approved")
        self.assertEqual(fresh_candidate["registered_channel_id"], "channel-1")
        self.assertEqual(known_candidate["status"], "duplicate")
        self.assertEqual(known_candidate["registered_channel_id"], "channel-known")
        self.assertEqual(len(repository.source_profiles), 2)
        self.assertEqual(len(repository.source_quality_snapshots), 2)
        self.assertEqual(len(repository.source_interest_scores), 2)
        self.assertEqual(
            repository.source_quality_snapshots[0]["scoring_breakdown"]["channelMetrics"]["metricSource"],
            "generic_channel_quality",
        )
        self.assertEqual(
            repository.source_quality_snapshots[0]["quality_source"],
            "generic_recall_quality",
        )
        channel_metrics = repository.source_interest_scores[0]["scoring_breakdown"]["channelMetrics"]
        self.assertEqual(channel_metrics["metricSource"], "generic_channel_quality")
        self.assertEqual(channel_metrics["totalArticlesPeriod"], 12)
        self.assertEqual(channel_metrics["uniqueArticlesPeriod"], 9)
        self.assertNotIn("usefulArticlesPeriod", channel_metrics)
        self.assertEqual(len(repository.portfolio_snapshots), 1)
        self.assertEqual(
            [row["operation"] for row in repository.cost_rows],
            ["hypothesis_search", "hypothesis_llm_analysis"],
        )
        self.assertEqual(repository.cost_rows[0]["provider"], "ddgs")
        self.assertEqual(repository.cost_rows[0]["cost_usd"], Decimal("0.0"))
        self.assertEqual(repository.cost_rows[1]["provider"], "gemini")
        self.assertEqual(repository.cost_rows[1]["cost_usd"], Decimal("0.0125"))
        self.assertEqual(repository.cost_rows[1]["input_tokens"], 300)
        self.assertEqual(repository.cost_rows[1]["output_tokens"], 100)

    async def test_execute_hypotheses_keeps_website_candidates_as_website_when_hidden_feeds_exist(self) -> None:
        repository = _FakeDiscoveryRepository()
        inserted = await repository.insert_hypotheses(
            mission_id="mission-1",
            hypotheses=[
                {
                    "class_key": "lexical",
                    "tactic_key": "localized",
                    "search_query": "EU AI oversight site",
                    "target_provider_type": "website",
                    "confidence": 0.8,
                    "reasoning": "Need direct website monitoring",
                    "expected_value": "lexical:localized",
                }
            ],
        )
        self.assertEqual(inserted, ["hypothesis-1"])

        async def _list_existing_source_urls() -> set[str]:
            return {"https://known.example.com"}

        repository.list_existing_source_urls = _list_existing_source_urls  # type: ignore[method-assign]
        runtime = _FakeRuntime({})
        sequence_repository = _FakeSequenceRepository()

        async def fake_execute_run(self, run_id: str) -> dict[str, Any]:
            del self, run_id
            return {
                "status": "completed",
                "context": {
                    "probed_websites": [
                        {
                            "url": "https://fresh.example.com",
                            "final_url": "https://fresh.example.com",
                            "title": "Fresh site",
                            "browser_assisted_recommended": True,
                            "challenge_kind": None,
                            "classification": {
                                "kind": "editorial",
                                "confidence": 0.84,
                                "reasons": ["detail:editorial", "hint:feed"],
                            },
                            "capabilities": {
                                "supports_feed_discovery": True,
                                "supports_collection_discovery": True,
                            },
                            "discovered_feed_urls": ["https://fresh.example.com/feed.xml"],
                            "sample_resources": [{"title": "Fresh story", "url": "https://fresh.example.com/story"}],
                        },
                        {
                            "url": "https://known.example.com",
                            "final_url": "https://known.example.com",
                            "title": "Known site",
                            "classification": {
                                "kind": "listing",
                                "confidence": 0.72,
                                "reasons": ["layout:listing"],
                            },
                            "capabilities": {
                                "supports_feed_discovery": False,
                                "supports_collection_discovery": True,
                            },
                            "discovered_feed_urls": ["https://known.example.com/feed.xml"],
                            "sample_resources": [{"title": "Known story", "url": "https://known.example.com/story"}],
                        },
                    ],
                    "scored_sources": [
                        {
                            "source_url": "https://fresh.example.com",
                            "relevance_score": 0.92,
                        },
                        {
                            "source_url": "https://known.example.com",
                            "relevance_score": 0.45,
                        },
                    ],
                    "llm_analysis": [
                        {
                            "source_url": "https://fresh.example.com",
                            "relevance": 0.94,
                            "reasoning": "Strong site fit",
                        }
                    ],
                },
            }

        with (
            patch(
                "services.workers.app.discovery_orchestrator.get_discovery_runtime",
                return_value=runtime,
            ),
            patch(
                "services.workers.app.discovery_orchestrator.SequenceExecutor.execute_run",
                new=fake_execute_run,
            ),
        ):
            result = await execute_hypotheses(
                mission_id="mission-1",
                settings=DiscoverySettings(
                    max_hypotheses_per_run=5,
                    search_provider="ddgs",
                    default_auto_approve_threshold=0.4,
                ),
                repository=repository,
                sequence_repository=sequence_repository,  # type: ignore[arg-type]
            )

        self.assertEqual(result["discovery_executed_count"], 1)
        self.assertEqual(sequence_repository.created_runs[0]["sequence_id"], DISCOVERY_WEBSITE_PIPELINE_SEQUENCE_ID)
        self.assertEqual(runtime.source_registrar.calls[0]["provider_type"], "website")
        fresh_candidate = next(
            candidate for candidate in repository.candidates if candidate["url"] == "https://fresh.example.com"
        )
        self.assertEqual(fresh_candidate["provider_type"], "website")
        self.assertEqual(
            fresh_candidate["evaluation_json"]["discovered_feed_urls"],
            ["https://fresh.example.com/feed.xml"],
        )
        self.assertTrue(
            fresh_candidate["evaluation_json"]["browser_assisted_recommended"]
        )

    async def test_acquire_recall_missions_persists_neutral_candidates_without_source_registration(self) -> None:
        repository = _FakeDiscoveryRepository()
        repository.recall_mission = {
            "recall_mission_id": "recall-mission-1",
            "title": "Neutral recall",
            "description": "Find sources broadly without interest-graph coupling.",
            "mission_kind": "manual",
            "seed_domains": ["press.example.com"],
            "seed_urls": [],
            "seed_queries": ["AI compliance source"],
            "target_provider_types": ["rss", "website"],
            "scope_json": {},
            "status": "active",
            "max_candidates": 4,
            "created_by": "test",
        }
        runtime = _FakeRuntime(
            {
                "web_search": {
                    "AI compliance source rss": {
                        "results": [
                            {
                                "url": "https://search-rss.example.com/feed.xml",
                                "title": "Search-discovered feed",
                                "snippet": "Independent reporting feed",
                            }
                        ],
                        "meta": {"provider": "stub", "request_count": 1},
                    },
                    "AI compliance source": {
                        "results": [],
                        "meta": {"provider": "stub", "request_count": 1},
                    },
                    "site:press.example.com rss": {
                        "results": [
                            {
                                "url": "https://press.example.com/feed.xml",
                                "title": "Press feed",
                                "snippet": "Official feed",
                            }
                        ],
                        "meta": {"provider": "stub", "request_count": 1},
                    },
                    "site:press.example.com": {
                        "results": [
                            {
                                "url": "https://press.example.com/news/update-1",
                                "title": "Press room",
                                "snippet": "Official updates and releases",
                            }
                        ],
                        "meta": {"provider": "stub", "request_count": 1},
                    },
                },
                "rss_probe": {
                    "https://search-rss.example.com/feed.xml": {
                        "url": "https://search-rss.example.com/feed.xml",
                        "feed_url": "https://search-rss.example.com/feed.xml",
                        "is_valid_rss": True,
                        "feed_title": "Search feed",
                        "sample_entries": [{"title": "Search story"}],
                        "error_text": None,
                    },
                    "https://press.example.com/feed.xml": {
                        "url": "https://press.example.com/feed.xml",
                        "feed_url": "https://press.example.com/feed.xml",
                        "is_valid_rss": True,
                        "feed_title": "Press feed",
                        "sample_entries": [{"title": "Press story"}],
                        "error_text": None,
                    },
                },
                "website_probe": {
                    "https://press.example.com": {
                        "url": "https://press.example.com",
                        "final_url": "https://press.example.com/news",
                        "title": "Press website",
                        "classification": {"kind": "editorial", "confidence": 0.9},
                        "capabilities": {"supports_collection_discovery": True},
                        "sample_resources": [
                            {"title": "Press story", "url": "https://press.example.com/news/story-1"}
                        ],
                        "error_text": None,
                    }
                },
            }
        )

        with patch(
            "services.workers.app.discovery_orchestrator.get_discovery_runtime",
            return_value=runtime,
        ):
            result = await acquire_recall_missions(
                recall_mission_id="recall-mission-1",
                settings=DiscoverySettings(default_max_sources=5),
                repository=repository,  # type: ignore[arg-type]
            )

        self.assertEqual(result["discovery_recall_executed_mission_ids"], ["recall-mission-1"])
        self.assertEqual(result["discovery_recall_executed_count"], 1)
        self.assertEqual(result["discovery_recall_candidate_count"], 3)
        self.assertEqual(result["discovery_recall_source_profile_count"], 3)
        self.assertEqual(result["discovery_recall_source_quality_snapshot_count"], 3)
        self.assertEqual(result["discovery_recall_search_request_count"], 4)
        self.assertEqual(result["discovery_recall_probe_count"], 3)
        self.assertEqual(
            result["discovery_recall_provider_breakdown"],
            {"rss": 2, "website": 1},
        )
        self.assertEqual(runtime.source_registrar.calls, [])
        self.assertEqual(
            repository.refreshed_recall_mission_ids,
            ["recall-mission-1"],
        )
        self.assertEqual(repository.recall_mission["status"], "active")
        self.assertEqual(len(repository.recall_candidates), 3)
        self.assertEqual(len(repository.linked_recall_profiles), 3)
        self.assertEqual(len(repository.source_profiles), 2)
        self.assertEqual(len(repository.source_quality_snapshots), 3)
        website_candidate = next(
            candidate
            for candidate in repository.recall_candidates
            if candidate["provider_type"] == "website"
        )
        self.assertEqual(website_candidate["url"], "https://press.example.com")
        self.assertEqual(
            website_candidate["quality_signal_source"],
            "seed_domain_probe",
        )
        self.assertEqual(
            repository.source_quality_snapshots[0]["snapshot_reason"],
            "recall_acquisition",
        )

    async def test_acquire_recall_missions_canonicalizes_search_results_to_single_origin_probe(self) -> None:
        repository = _FakeDiscoveryRepository()
        repository.recall_mission = {
            "recall_mission_id": "recall-mission-1",
            "title": "Website-only recall",
            "description": "Collapse noisy search hits to canonical origins.",
            "mission_kind": "query_seed",
            "seed_domains": [],
            "seed_urls": [],
            "seed_queries": ["signal operations"],
            "target_provider_types": ["website"],
            "scope_json": {},
            "status": "active",
            "max_candidates": 2,
            "created_by": "test",
        }
        runtime = _FakeRuntime(
            {
                "web_search": {
                    "signal operations": {
                        "results": [
                            {
                                "url": "https://signal.example.com/news/one",
                                "title": "Signal one",
                                "snippet": "Story one",
                            },
                            {
                                "url": "https://signal.example.com/news/two",
                                "title": "Signal two",
                                "snippet": "Story two",
                            },
                            {
                                "url": "https://signal.example.com/about",
                                "title": "Signal about",
                                "snippet": "About page",
                            },
                        ],
                        "meta": {"provider": "stub", "request_count": 1},
                    }
                },
                "website_probe": {
                    "https://signal.example.com": {
                        "url": "https://signal.example.com",
                        "final_url": "https://signal.example.com/blog",
                        "title": "Signal site",
                        "classification": {"kind": "editorial", "confidence": 0.82},
                        "capabilities": {"supports_collection_discovery": True},
                        "sample_resources": [{"title": "Signal story"}],
                        "error_text": None,
                    }
                },
            }
        )

        with patch(
            "services.workers.app.discovery_orchestrator.get_discovery_runtime",
            return_value=runtime,
        ):
            result = await acquire_recall_missions(
                recall_mission_id="recall-mission-1",
                settings=DiscoverySettings(default_max_sources=5),
                repository=repository,  # type: ignore[arg-type]
            )

        self.assertEqual(result["discovery_recall_candidate_count"], 1)
        self.assertEqual(result["discovery_recall_search_request_count"], 1)
        self.assertEqual(result["discovery_recall_probe_count"], 1)
        self.assertEqual(
            runtime.website_probe.calls,
            [{"urls": ["https://signal.example.com"], "sample_count": 3}],
        )
        self.assertEqual(len(repository.recall_candidates), 1)
        self.assertEqual(repository.recall_candidates[0]["url"], "https://signal.example.com")
        self.assertEqual(
            repository.recall_candidates[0]["evaluation_json"]["search_query"],
            "signal operations",
        )
        self.assertEqual(
            repository.recall_candidates[0]["quality_signal_source"],
            "seed_query_search",
        )

    async def test_acquire_recall_missions_skips_non_feed_urls_in_rss_lane(self) -> None:
        repository = _FakeDiscoveryRepository()
        repository.recall_mission = {
            "recall_mission_id": "recall-mission-1",
            "title": "Procurement recall",
            "description": "Avoid probing HTML procurement pages as rss candidates.",
            "mission_kind": "query_seed",
            "seed_domains": [],
            "seed_urls": [],
            "seed_queries": ["site:sam.gov software procurement"],
            "target_provider_types": ["rss", "website"],
            "scope_json": {},
            "status": "active",
            "max_candidates": 4,
            "created_by": "test",
        }
        runtime = _FakeRuntime(
            {
                "web_search": {
                    "site:sam.gov software procurement rss": {
                        "results": [
                            {
                                "url": "https://sam.gov/opp/123/view",
                                "title": "Procurement page",
                                "snippet": "HTML notice page",
                            },
                            {
                                "url": "https://sam.gov/notices/feed.xml",
                                "title": "Feed page",
                                "snippet": "RSS notice feed",
                            },
                        ],
                        "meta": {"provider": "stub", "request_count": 1},
                    },
                    "site:sam.gov software procurement": {
                        "results": [
                            {
                                "url": "https://sam.gov/opp/123/view",
                                "title": "Procurement page",
                                "snippet": "HTML notice page",
                            }
                        ],
                        "meta": {"provider": "stub", "request_count": 1},
                    },
                },
                "rss_probe": {
                    "https://sam.gov/notices/feed.xml": {
                        "url": "https://sam.gov/notices/feed.xml",
                        "feed_url": "https://sam.gov/notices/feed.xml",
                        "is_valid_rss": True,
                        "feed_title": "SAM feed",
                        "sample_entries": [{"title": "SAM story"}],
                        "error_text": None,
                    }
                },
                "website_probe": {
                    "https://sam.gov": {
                        "url": "https://sam.gov",
                        "final_url": "https://sam.gov/opp/123/view",
                        "title": "SAM.gov",
                        "classification": {"kind": "procurement_portal", "confidence": 0.92},
                        "capabilities": {"supports_collection_discovery": True},
                        "sample_resources": [{"title": "Opp 123"}],
                        "error_text": None,
                    }
                },
            }
        )

        with patch(
            "services.workers.app.discovery_orchestrator.get_discovery_runtime",
            return_value=runtime,
        ):
            result = await acquire_recall_missions(
                recall_mission_id="recall-mission-1",
                settings=DiscoverySettings(default_max_sources=5),
                repository=repository,  # type: ignore[arg-type]
            )

        self.assertEqual(result["discovery_recall_candidate_count"], 2)
        self.assertEqual(
            runtime.rss_probe.calls,
            [{"urls": ["https://sam.gov/notices/feed.xml"], "sample_count": 3}],
        )
        self.assertEqual(
            runtime.website_probe.calls,
            [{"urls": ["https://sam.gov"], "sample_count": 3}],
        )
        self.assertEqual(
            sorted(candidate["provider_type"] for candidate in repository.recall_candidates),
            ["rss", "website"],
        )

    async def test_acquire_recall_missions_treats_search_no_results_as_empty_batch(self) -> None:
        repository = _FakeDiscoveryRepository()
        repository.recall_mission = {
            "recall_mission_id": "recall-mission-1",
            "title": "Recall no-results",
            "description": "Search no-results should not fail acquisition.",
            "mission_kind": "query_seed",
            "seed_domains": [],
            "seed_urls": [],
            "seed_queries": ["missing procurement"],
            "target_provider_types": ["website"],
            "scope_json": {},
            "status": "active",
            "max_candidates": 4,
            "created_by": "test",
        }
        runtime = _FakeRuntime({})

        def _raise_no_results(**_: Any) -> dict[str, Any]:
            raise RuntimeError("No results found.")

        with (
            patch(
                "services.workers.app.discovery_orchestrator.get_discovery_runtime",
                return_value=runtime,
            ),
            patch.object(runtime.web_search, "search", side_effect=_raise_no_results),
        ):
            result = await acquire_recall_missions(
                recall_mission_id="recall-mission-1",
                settings=DiscoverySettings(default_max_sources=5),
                repository=repository,  # type: ignore[arg-type]
            )

        self.assertEqual(result["discovery_recall_executed_count"], 1)
        self.assertEqual(result["discovery_recall_candidate_count"], 0)
        self.assertEqual(repository.recall_candidates, [])

    def test_recall_duplicate_candidates_keep_existing_channel_id(self) -> None:
        rows = _recall_candidate_rows_from_probe_results(
            recall_mission_id="recall-mission-1",
            provider_type="website",
            probe_rows=[
                {
                    "url": "https://known.example.com/feed.xml",
                    "final_url": "https://known.example.com/feed.xml",
                    "title": "Known source",
                }
            ],
            probe_targets={
                "https://known.example.com/feed.xml": {
                    "probe_url": "https://known.example.com/feed.xml",
                    "quality_signal_source": "seed_query_search",
                    "seed_type": "seed_query",
                    "seed_value": "known source",
                    "search_query": "known source",
                }
            },
            existing_source_channels={"https://known.example.com/": "channel-known"},
        )

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["status"], "duplicate")
        self.assertEqual(rows[0]["registered_channel_id"], "channel-known")
        self.assertEqual(rows[0]["rejection_reason"], "already_known_source")

    async def test_acquire_recall_missions_treats_probe_timeout_as_rejected_candidate(self) -> None:
        repository = _FakeDiscoveryRepository()
        repository.recall_mission = {
            "recall_mission_id": "recall-mission-1",
            "title": "Recall probe timeout",
            "description": "Website probe timeouts should not fail acquisition.",
            "mission_kind": "query_seed",
            "seed_domains": [],
            "seed_urls": [],
            "seed_queries": ["procurement portal"],
            "target_provider_types": ["website"],
            "scope_json": {},
            "status": "active",
            "max_candidates": 4,
            "created_by": "test",
        }
        runtime = _FakeRuntime(
            {
                "web_search": {
                    "procurement portal": {
                        "results": [
                            {
                                "url": "https://portal.example.com/notices/1",
                                "title": "Procurement portal",
                                "snippet": "Software procurement notices",
                            }
                        ],
                        "meta": {"provider": "stub", "request_count": 1},
                    }
                }
            }
        )

        with (
            patch(
                "services.workers.app.discovery_orchestrator.get_discovery_runtime",
                return_value=runtime,
            ),
            patch.object(runtime.website_probe, "probe_websites", side_effect=TimeoutError("Internal Server Error")),
        ):
            result = await acquire_recall_missions(
                recall_mission_id="recall-mission-1",
                settings=DiscoverySettings(default_max_sources=5),
                repository=repository,  # type: ignore[arg-type]
            )

        self.assertEqual(result["discovery_recall_executed_count"], 1)
        self.assertEqual(result["discovery_recall_candidate_count"], 1)
        self.assertEqual(result["discovery_recall_probe_count"], 1)
        self.assertEqual(len(repository.recall_candidates), 1)
        candidate = repository.recall_candidates[0]
        self.assertEqual(candidate["status"], "rejected")
        self.assertEqual(candidate["rejection_reason"], "probe_failed")
        self.assertEqual(candidate["evaluation_json"]["error_text"], "Internal Server Error")
        self.assertEqual(candidate["url"], "https://portal.example.com")

    async def test_execute_hypotheses_skips_when_mission_budget_is_exhausted_from_precise_spend(self) -> None:
        repository = _FakeDiscoveryRepository()
        repository.mission["budget_cents"] = 100
        repository.mission_spent_usd = Decimal("1.00")
        await repository.insert_hypotheses(
            mission_id="mission-1",
            hypotheses=[
                {
                    "class_key": "lexical",
                    "tactic_key": "synonym",
                    "search_query": "EU AI official bulletin",
                    "target_urls": [],
                    "target_provider_type": "rss",
                    "generation_context": {"origin": "seed"},
                    "expected_value": "Lexical / synonym",
                }
            ],
        )

        with patch(
            "services.workers.app.discovery_orchestrator.get_discovery_runtime",
            return_value=_FakeRuntime({}),
        ):
            result = await execute_hypotheses(
                mission_id="mission-1",
                settings=DiscoverySettings(max_hypotheses_per_run=5),
                repository=repository,
                sequence_repository=_FakeSequenceRepository(),  # type: ignore[arg-type]
            )

        self.assertEqual(result["discovery_executed_count"], 0)
        self.assertEqual(repository.skipped_updates[0]["hypothesis_id"], "hypothesis-1")
        self.assertIn("Mission budget exhausted", repository.skipped_updates[0]["error_text"])

    async def test_execute_hypotheses_skips_when_monthly_quota_is_exhausted(self) -> None:
        repository = _FakeDiscoveryRepository()
        repository.month_to_date_cost_usd = Decimal("1.00")
        await repository.insert_hypotheses(
            mission_id="mission-1",
            hypotheses=[
                {
                    "class_key": "lexical",
                    "tactic_key": "synonym",
                    "search_query": "EU AI official bulletin",
                    "target_urls": [],
                    "target_provider_type": "rss",
                    "generation_context": {"origin": "seed"},
                    "expected_value": "Lexical / synonym",
                }
            ],
        )

        with patch(
            "services.workers.app.discovery_orchestrator.get_discovery_runtime",
            return_value=_FakeRuntime({}),
        ):
            result = await execute_hypotheses(
                mission_id="mission-1",
                settings=DiscoverySettings(max_hypotheses_per_run=5, monthly_budget_cents=100),
                repository=repository,
                sequence_repository=_FakeSequenceRepository(),  # type: ignore[arg-type]
            )

        self.assertEqual(result["discovery_executed_count"], 0)
        self.assertEqual(repository.skipped_updates[0]["hypothesis_id"], "hypothesis-1")
        self.assertIn("Monthly discovery quota exhausted", repository.skipped_updates[0]["error_text"])

    async def test_evaluate_hypotheses_updates_effectiveness_refreshes_missions_and_strategy_stats(self) -> None:
        repository = _FakeDiscoveryRepository()
        repository.hypotheses = [
            {
                "hypothesis_id": "hypothesis-1",
                "mission_id": "mission-1",
                "class_key": "lexical",
                "tactic_key": "synonym",
            },
            {
                "hypothesis_id": "hypothesis-2",
                "mission_id": "mission-1",
                "class_key": "lexical",
                "tactic_key": "localized",
            },
        ]
        repository.candidates = [
            {"candidate_id": "candidate-1", "hypothesis_id": "hypothesis-1", "status": "auto_approved"},
            {"candidate_id": "candidate-2", "hypothesis_id": "hypothesis-1", "status": "pending"},
            {"candidate_id": "candidate-3", "hypothesis_id": "hypothesis-2", "status": "approved"},
        ]

        result = await evaluate_hypotheses(
            hypothesis_ids=["hypothesis-1", "hypothesis-2"],
            repository=repository,
        )

        self.assertEqual(result["discovery_evaluated_count"], 2)
        self.assertEqual(
            repository.effectiveness_updates,
            [
                {"hypothesis_id": "hypothesis-1", "effectiveness": 0.5, "sources_approved": 1},
                {"hypothesis_id": "hypothesis-2", "effectiveness": 1.0, "sources_approved": 1},
            ],
        )
        self.assertEqual(repository.refreshed_mission_ids, ["mission-1"])
        self.assertEqual(
            repository.strategy_updates,
            [
                {
                    "mission_id": "mission-1",
                    "class_key": "lexical",
                    "tactic_key": "synonym",
                    "success": True,
                    "effectiveness": 0.5,
                },
                {
                    "mission_id": "mission-1",
                    "class_key": "lexical",
                    "tactic_key": "localized",
                    "success": True,
                    "effectiveness": 1.0,
                },
            ],
        )

    async def test_re_evaluate_sources_recomputes_scores_and_portfolio_with_feedback(self) -> None:
        repository = _FakeDiscoveryRepository()
        repository.candidates = [
            {
                "candidate_id": "candidate-1",
                "mission_id": "mission-1",
                "hypothesis_id": "hypothesis-1",
                "source_profile_id": "profile-1",
                "url": "https://fresh.example.com/feed.xml",
                "title": "Fresh feed",
                "registered_channel_id": "channel-1",
                "status": "auto_approved",
            }
        ]
        repository.source_profiles = [
            {
                "source_profile_id": "profile-1",
                "candidate_id": "candidate-1",
                "canonical_domain": "fresh.example.com",
                "source_type": "rss",
                "trust_score": 0.7,
                "source_linking_quality": 0.6,
                "author_accountability": 0.6,
                "technical_quality": 0.7,
                "historical_stability": 0.6,
                "spam_signals": 0.0,
                "extraction_data": {},
            }
        ]
        repository.feedback_events = [
            {
                "feedback_event_id": "feedback-1",
                "mission_id": "mission-1",
                "source_profile_id": "profile-1",
                "feedback_type": "valuable_source",
            }
        ]

        result = await re_evaluate_sources(
            mission_id="mission-1",
            repository=repository,
        )

        self.assertEqual(result["discovery_re_evaluated_count"], 1)
        self.assertEqual(result["discovery_portfolio_snapshot_count"], 1)
        self.assertEqual(result["discovery_feedback_row_count"], 1)
        self.assertEqual(result["discovery_source_quality_snapshot_count"], 1)
        self.assertEqual(len(repository.source_quality_snapshots), 1)
        self.assertEqual(len(repository.source_interest_scores), 1)
        self.assertEqual(
            repository.source_interest_scores[0]["scoring_breakdown"]["channelMetrics"]["metricSource"],
            "generic_channel_quality",
        )
        self.assertEqual(len(repository.portfolio_snapshots), 1)


if __name__ == "__main__":
    unittest.main()

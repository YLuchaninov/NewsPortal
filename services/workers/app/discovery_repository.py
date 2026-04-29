from __future__ import annotations

import asyncio
from datetime import datetime
from decimal import Decimal
from typing import Any

import psycopg
from psycopg.rows import dict_row

from .discovery_runtime_settings import DiscoverySettings
from .discovery_repository_candidates import DiscoveryCandidateRepositoryMixin
from .discovery_repository_mission_hypotheses import DiscoveryMissionHypothesisRepositoryMixin
from .discovery_repository_source_quality import DiscoverySourceQualityRepositoryMixin
from .task_engine.repository import build_database_url


class DiscoveryCoordinatorRepository(
    DiscoveryMissionHypothesisRepositoryMixin,
    DiscoveryCandidateRepositoryMixin,
    DiscoverySourceQualityRepositoryMixin,
):
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

    async def list_existing_source_channels(self) -> dict[str, str]:
        return await asyncio.to_thread(self._list_existing_source_channels)

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

    async def update_candidate_review(
        self,
        *,
        candidate_id: str,
        evaluation_json: dict[str, Any],
        status: str | None = None,
        rejection_reason: str | None = None,
    ) -> None:
        await asyncio.to_thread(
            self._update_candidate_review,
            candidate_id,
            evaluation_json,
            status,
            rejection_reason,
        )

    async def update_recall_candidate_review(
        self,
        *,
        recall_candidate_id: str,
        evaluation_json: dict[str, Any],
        status: str | None = None,
        rejection_reason: str | None = None,
    ) -> None:
        await asyncio.to_thread(
            self._update_recall_candidate_review,
            recall_candidate_id,
            evaluation_json,
            status,
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


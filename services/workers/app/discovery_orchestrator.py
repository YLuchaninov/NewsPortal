from __future__ import annotations

from typing import Any

from . import discovery_execution_runtime as _discovery_execution_runtime
from . import discovery_evaluation_runtime as _discovery_evaluation_runtime
from . import discovery_graph_planning_runtime as _discovery_graph_planning_runtime
from . import discovery_planning as _discovery_planning
from . import discovery_recall_orchestration as _discovery_recall_orchestration
from . import discovery_recall_runtime as _discovery_recall_runtime
from .discovery_repository import DiscoveryCoordinatorRepository
from .discovery_runtime_settings import (
    DEFAULT_DISCOVERY_CRON as _DEFAULT_DISCOVERY_CRON,
    DiscoverySettings,
    coerce_discovery_cost_usd,
    discovery_cost_usd_to_cents,
    discovery_month_start_utc as _discovery_month_start_utc,
    load_discovery_settings as _load_discovery_settings,
    read_int_env,
    read_optional_probability_env,
    read_text_env,
)
from .task_engine.discovery_runtime import get_discovery_runtime, resolve_runtime_call
from .task_engine.executor import SequenceExecutor
from .task_engine.plugins import TASK_REGISTRY
from .task_engine.repository import PostgresSequenceRepository


DISCOVERY_ORCHESTRATOR_SEQUENCE_ID = "0a8e8ec5-6cab-4d8b-9c28-0a1d6245bf17"
DISCOVERY_RSS_PIPELINE_SEQUENCE_ID = "1cb1bfec-d42b-4607-a8f0-8e3f671f0978"
DISCOVERY_WEBSITE_PIPELINE_SEQUENCE_ID = "c7e0a3a2-8f0c-4a76-bf35-fd7d1f44774d"
DEFAULT_DISCOVERY_CRON = _DEFAULT_DISCOVERY_CRON
discovery_month_start_utc = _discovery_month_start_utc
_read_int_env = read_int_env
_read_optional_probability_env = read_optional_probability_env
_read_text_env = read_text_env
DEFAULT_DISCOVERY_PROVIDER_TYPES = _discovery_planning.DEFAULT_DISCOVERY_PROVIDER_TYPES
DISCOVERY_QUERY_FAMILY_TERMS = _discovery_planning.DISCOVERY_QUERY_FAMILY_TERMS
PROCUREMENT_QUERY_FAMILIES = _discovery_planning.PROCUREMENT_QUERY_FAMILIES
LEAD_SIGNAL_QUERY_FAMILIES = _discovery_planning.LEAD_SIGNAL_QUERY_FAMILIES
_normalize_text_list = _discovery_planning.normalize_text_list
_tokenize = _discovery_planning.tokenize
_coerce_mapping_list = _discovery_planning.coerce_mapping_list
_assessment_map = _discovery_planning.assessment_map
_validate_interest_graph = _discovery_planning.validate_interest_graph
_default_interest_graph = _discovery_planning.default_interest_graph
_normalize_query_family_key = _discovery_planning.normalize_query_family_key
_ordered_query_families = _discovery_planning.ordered_query_families
_build_generation_seed = _discovery_planning.build_generation_seed
_build_default_hypotheses_from_graph = _discovery_planning.build_default_hypotheses_from_graph
_dedup_hypotheses = _discovery_planning.dedup_hypotheses
_canonical_origin_url = _discovery_recall_runtime.canonical_origin_url
_looks_like_feed_candidate_url = _discovery_recall_runtime.looks_like_feed_candidate_url
_build_recall_search_plans = _discovery_recall_runtime.build_recall_search_plans
_seed_probe_targets_for_recall_mission = (
    _discovery_recall_runtime.seed_probe_targets_for_recall_mission
)
_probe_failure_rows = _discovery_recall_runtime.probe_failure_rows
_recall_candidate_rows_from_probe_results = (
    _discovery_recall_runtime.recall_candidate_rows_from_probe_results
)


def load_discovery_settings() -> DiscoverySettings:
    return _load_discovery_settings()


__all__ = [
    "DEFAULT_DISCOVERY_CRON",
    "DiscoveryCoordinatorRepository",
    "DiscoverySettings",
    "acquire_recall_missions",
    "coerce_discovery_cost_usd",
    "compile_interest_graph_for_mission",
    "discovery_cost_usd_to_cents",
    "discovery_month_start_utc",
    "evaluate_hypotheses",
    "execute_hypotheses",
    "load_discovery_settings",
    "plan_hypotheses",
    "re_evaluate_sources",
]


async def compile_interest_graph_for_mission(
    *,
    mission: dict[str, Any],
    repository: DiscoveryCoordinatorRepository,
) -> dict[str, Any]:
    return await _discovery_graph_planning_runtime.compile_interest_graph_for_mission(
        mission=mission,
        repository=repository,
        get_discovery_runtime_func=get_discovery_runtime,
        resolve_runtime_call_func=resolve_runtime_call,
    )


async def plan_hypotheses(
    *,
    mission_id: str | None,
    settings: DiscoverySettings,
    repository: DiscoveryCoordinatorRepository,
    class_keys: list[str] | None = None,
) -> dict[str, Any]:
    return await _discovery_graph_planning_runtime.plan_hypotheses(
        mission_id=mission_id,
        settings=settings,
        repository=repository,
        class_keys=class_keys,
        get_discovery_runtime_func=get_discovery_runtime,
        resolve_runtime_call_func=resolve_runtime_call,
        compile_interest_graph_for_mission_func=compile_interest_graph_for_mission,
    )


async def execute_hypotheses(
    *,
    mission_id: str | None,
    settings: DiscoverySettings,
    repository: DiscoveryCoordinatorRepository,
    sequence_repository: PostgresSequenceRepository,
) -> dict[str, Any]:
    return await _discovery_execution_runtime.execute_hypotheses(
        mission_id=mission_id,
        settings=settings,
        repository=repository,
        sequence_repository=sequence_repository,
        rss_pipeline_sequence_id=DISCOVERY_RSS_PIPELINE_SEQUENCE_ID,
        website_pipeline_sequence_id=DISCOVERY_WEBSITE_PIPELINE_SEQUENCE_ID,
        get_discovery_runtime_func=get_discovery_runtime,
        resolve_runtime_call_func=resolve_runtime_call,
        executor_class=SequenceExecutor,
        task_registry=TASK_REGISTRY,
    )


async def acquire_recall_missions(
    *,
    recall_mission_id: str | None,
    settings: DiscoverySettings,
    repository: DiscoveryCoordinatorRepository,
) -> dict[str, Any]:
    return await _discovery_recall_orchestration.acquire_recall_missions(
        recall_mission_id=recall_mission_id,
        settings=settings,
        repository=repository,
        get_discovery_runtime_func=get_discovery_runtime,
        resolve_runtime_call_func=resolve_runtime_call,
    )


async def evaluate_hypotheses(
    *,
    hypothesis_ids: list[str],
    repository: DiscoveryCoordinatorRepository,
) -> dict[str, Any]:
    return await _discovery_evaluation_runtime.evaluate_hypotheses(
        hypothesis_ids=hypothesis_ids,
        repository=repository,
    )


async def re_evaluate_sources(
    *,
    mission_id: str | None,
    repository: DiscoveryCoordinatorRepository,
) -> dict[str, Any]:
    return await _discovery_evaluation_runtime.re_evaluate_sources(
        mission_id=mission_id,
        repository=repository,
        compile_interest_graph_for_mission_func=compile_interest_graph_for_mission,
    )

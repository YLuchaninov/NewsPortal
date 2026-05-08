from __future__ import annotations

from typing import Any

from .discovery_v3_orchestrator import (
    bootstrap_system_interest_targets,
    expand_existing_source,
    refresh_coverage,
    start_discovery_run,
)
from .discovery_v3_settings import DiscoveryV3Settings


DISCOVERY_ORCHESTRATOR_SEQUENCE_ID = "resilient-discovery-v3-cutover"
DISCOVERY_RSS_PIPELINE_SEQUENCE_ID = "resilient-discovery-v3-rss"
DISCOVERY_WEBSITE_PIPELINE_SEQUENCE_ID = "resilient-discovery-v3-website"
DEFAULT_DISCOVERY_CRON = "*/30 * * * *"
DiscoverySettings = DiscoveryV3Settings


class LegacyDiscoveryRuntimeRemoved(RuntimeError):
    """Raised when a removed mission/recall discovery runtime path is called."""


class DiscoveryCoordinatorRepository:
    def __init__(self, *_: Any, **__: Any) -> None:
        raise LegacyDiscoveryRuntimeRemoved(
            "Legacy mission/recall DiscoveryCoordinatorRepository was removed by resilient discovery v3 cutover. "
            "Use DiscoveryV3Repository and discovery_v3_orchestrator instead."
        )


def load_discovery_settings() -> DiscoveryV3Settings:
    return DiscoveryV3Settings()


def _removed(name: str) -> LegacyDiscoveryRuntimeRemoved:
    return LegacyDiscoveryRuntimeRemoved(
        f"Legacy discovery_orchestrator.{name} was removed by resilient discovery v3 cutover. "
        "Use targets/runs/coverage/endpoints/contracts v3 APIs instead."
    )


async def compile_interest_graph_for_mission(*_: Any, **__: Any) -> dict[str, Any]:
    raise _removed("compile_interest_graph_for_mission")


async def plan_hypotheses(*_: Any, **__: Any) -> dict[str, Any]:
    raise _removed("plan_hypotheses")


async def execute_hypotheses(*_: Any, **__: Any) -> dict[str, Any]:
    raise _removed("execute_hypotheses")


async def acquire_recall_missions(*_: Any, **__: Any) -> dict[str, Any]:
    raise _removed("acquire_recall_missions")


async def execute_discovery_runs(*_: Any, **__: Any) -> dict[str, Any]:
    raise _removed("execute_discovery_runs")


async def evaluate_hypotheses(*_: Any, **__: Any) -> dict[str, Any]:
    raise _removed("evaluate_hypotheses")


async def promote_endpoint(*_: Any, **__: Any) -> dict[str, Any]:
    raise _removed("promote_endpoint")


async def reject_endpoint(*_: Any, **__: Any) -> dict[str, Any]:
    raise _removed("reject_endpoint")


async def re_evaluate_sources(*_: Any, **__: Any) -> dict[str, Any]:
    raise _removed("re_evaluate_sources")


def _recall_candidate_rows_from_probe_results(*_: Any, **__: Any) -> list[dict[str, Any]]:
    raise _removed("_recall_candidate_rows_from_probe_results")


__all__ = [
    "DEFAULT_DISCOVERY_CRON",
    "DISCOVERY_ORCHESTRATOR_SEQUENCE_ID",
    "DISCOVERY_RSS_PIPELINE_SEQUENCE_ID",
    "DISCOVERY_WEBSITE_PIPELINE_SEQUENCE_ID",
    "DiscoveryCoordinatorRepository",
    "DiscoverySettings",
    "LegacyDiscoveryRuntimeRemoved",
    "acquire_recall_missions",
    "bootstrap_system_interest_targets",
    "compile_interest_graph_for_mission",
    "evaluate_hypotheses",
    "execute_discovery_runs",
    "execute_hypotheses",
    "expand_existing_source",
    "load_discovery_settings",
    "plan_hypotheses",
    "promote_endpoint",
    "refresh_coverage",
    "reject_endpoint",
    "re_evaluate_sources",
    "start_discovery_run",
]

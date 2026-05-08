from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from services.workers.app.source_scoring import canonical_domain
from services.workers.app.task_engine import configure_discovery_runtime
from services.workers.app.task_engine.adapters import build_live_discovery_runtime, discovery_enabled
from services.workers.app.task_engine.adapters.source_registrar import PostgresSourceRegistrarAdapter


DISCOVERY_ORCHESTRATOR_SEQUENCE_ID = "resilient-discovery-v3-cutover"


class LegacyDiscoveryRuntimeRemoved(RuntimeError):
    """Raised if a removed mission/recall discovery helper is called after v3 cutover."""


@dataclass(frozen=True)
class DiscoveryV3CompatSettings:
    max_hypotheses_per_run: int = 120
    default_max_sources: int = 700
    default_budget_cents: int = 0
    monthly_budget_usd: float = 0.0


class DiscoveryCoordinatorRepository:
    def __init__(self, *_: Any, **__: Any) -> None:
        raise LegacyDiscoveryRuntimeRemoved(
            "Legacy mission/recall discovery repository was removed by resilient discovery v3 cutover."
        )


def configure_api_discovery_runtime() -> None:
    if discovery_enabled():
        configure_discovery_runtime(build_live_discovery_runtime())


def load_discovery_settings() -> DiscoveryV3CompatSettings:
    return DiscoveryV3CompatSettings()


def coerce_discovery_cost_usd(value: Any) -> float:
    try:
        return max(0.0, float(value or 0))
    except (TypeError, ValueError):
        return 0.0


def discovery_cost_usd_to_cents(value: Any) -> int:
    return int(round(coerce_discovery_cost_usd(value) * 100))


def discovery_month_start_utc(now: datetime | None = None) -> datetime:
    effective = now or datetime.now(UTC)
    return effective.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


async def acquire_recall_missions(*_: Any, **__: Any) -> dict[str, Any]:
    raise LegacyDiscoveryRuntimeRemoved(
        "Legacy discovery recall acquisition is removed. Use discovery.v3.run or the v3 API/MCP routes."
    )


async def compile_interest_graph_for_mission(*_: Any, **__: Any) -> dict[str, Any]:
    raise LegacyDiscoveryRuntimeRemoved(
        "Legacy discovery mission graph compilation is removed. Use discovery v3 target graph compilation."
    )


async def re_evaluate_sources(*_: Any, **__: Any) -> dict[str, Any]:
    raise LegacyDiscoveryRuntimeRemoved(
        "Legacy discovery source re-evaluation is removed. Use discovery v3 coverage refresh and contract evaluation."
    )


__all__ = [
    "DISCOVERY_ORCHESTRATOR_SEQUENCE_ID",
    "DiscoveryCoordinatorRepository",
    "LegacyDiscoveryRuntimeRemoved",
    "PostgresSourceRegistrarAdapter",
    "acquire_recall_missions",
    "canonical_domain",
    "coerce_discovery_cost_usd",
    "compile_interest_graph_for_mission",
    "configure_api_discovery_runtime",
    "discovery_cost_usd_to_cents",
    "discovery_month_start_utc",
    "load_discovery_settings",
    "re_evaluate_sources",
]

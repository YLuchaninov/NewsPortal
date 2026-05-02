from __future__ import annotations

from services.workers.app.discovery_orchestrator import (
    DISCOVERY_ORCHESTRATOR_SEQUENCE_ID,
    DiscoveryCoordinatorRepository,
    acquire_recall_missions,
    compile_interest_graph_for_mission,
    coerce_discovery_cost_usd,
    discovery_cost_usd_to_cents,
    discovery_month_start_utc,
    load_discovery_settings,
    re_evaluate_sources,
)
from services.workers.app.source_scoring import canonical_domain
from services.workers.app.task_engine import configure_discovery_runtime
from services.workers.app.task_engine.adapters import (
    build_live_discovery_runtime,
    discovery_enabled,
)
from services.workers.app.task_engine.adapters.source_registrar import (
    PostgresSourceRegistrarAdapter,
)


def configure_api_discovery_runtime() -> None:
    if discovery_enabled():
        configure_discovery_runtime(build_live_discovery_runtime())


__all__ = [
    "DISCOVERY_ORCHESTRATOR_SEQUENCE_ID",
    "DiscoveryCoordinatorRepository",
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

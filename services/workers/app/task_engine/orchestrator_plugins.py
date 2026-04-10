from __future__ import annotations

from typing import Any

from .plugins import TASK_REGISTRY, TaskPlugin, TaskPluginRegistry


def _load_orchestrator_dependencies() -> tuple[Any, Any, Any, Any, Any, Any, Any]:
    from ..discovery_orchestrator import (
        DiscoveryCoordinatorRepository,
        evaluate_hypotheses,
        execute_hypotheses,
        load_discovery_settings,
        plan_hypotheses,
        re_evaluate_sources,
    )
    from .repository import PostgresSequenceRepository

    return (
        DiscoveryCoordinatorRepository,
        evaluate_hypotheses,
        execute_hypotheses,
        load_discovery_settings,
        plan_hypotheses,
        re_evaluate_sources,
        PostgresSequenceRepository,
    )


class PlanHypothesesPlugin(TaskPlugin):
    name = "discovery.plan_hypotheses"
    description = "Plan discovery hypotheses from missions and strategy memory."
    category = "discovery"

    async def execute(
        self,
        options: dict[str, Any],
        context: dict[str, Any],
    ) -> dict[str, Any]:
        (
            DiscoveryCoordinatorRepository,
            _evaluate_hypotheses,
            _execute_hypotheses,
            load_discovery_settings,
            plan_hypotheses,
            _re_evaluate_sources,
            _PostgresSequenceRepository,
        ) = _load_orchestrator_dependencies()
        mission_id = str(context.get("mission_id") or options.get("mission_id") or "").strip() or None
        return await plan_hypotheses(
            mission_id=mission_id,
            settings=load_discovery_settings(),
            repository=DiscoveryCoordinatorRepository(),
        )


class ExecuteHypothesesPlugin(TaskPlugin):
    name = "discovery.execute_hypotheses"
    description = "Execute pending discovery hypotheses through persisted child sequences."
    category = "discovery"

    async def execute(
        self,
        options: dict[str, Any],
        context: dict[str, Any],
    ) -> dict[str, Any]:
        (
            DiscoveryCoordinatorRepository,
            _evaluate_hypotheses,
            execute_hypotheses,
            load_discovery_settings,
            _plan_hypotheses,
            _re_evaluate_sources,
            PostgresSequenceRepository,
        ) = _load_orchestrator_dependencies()
        mission_id = str(context.get("mission_id") or options.get("mission_id") or "").strip() or None
        return await execute_hypotheses(
            mission_id=mission_id,
            settings=load_discovery_settings(),
            repository=DiscoveryCoordinatorRepository(),
            sequence_repository=PostgresSequenceRepository(),
        )


class EvaluateResultsPlugin(TaskPlugin):
    name = "discovery.evaluate_results"
    description = "Evaluate completed discovery hypotheses and update mission memory/stats."
    category = "discovery"

    async def execute(
        self,
        options: dict[str, Any],
        context: dict[str, Any],
    ) -> dict[str, Any]:
        (
            DiscoveryCoordinatorRepository,
            evaluate_hypotheses,
            _execute_hypotheses,
            _load_discovery_settings,
            _plan_hypotheses,
            _re_evaluate_sources,
            _PostgresSequenceRepository,
        ) = _load_orchestrator_dependencies()
        del options
        hypothesis_ids = context.get("discovery_executed_hypothesis_ids") or []
        if not isinstance(hypothesis_ids, list):
            hypothesis_ids = []
        return await evaluate_hypotheses(
            hypothesis_ids=[str(item) for item in hypothesis_ids if str(item).strip()],
            repository=DiscoveryCoordinatorRepository(),
        )


class ReEvaluateSourcesPlugin(TaskPlugin):
    name = "discovery.re_evaluate_sources"
    description = "Re-score mission sources, rebuild portfolio snapshots and queue gap-filling hypotheses."
    category = "discovery"

    async def execute(
        self,
        options: dict[str, Any],
        context: dict[str, Any],
    ) -> dict[str, Any]:
        (
            DiscoveryCoordinatorRepository,
            _evaluate_hypotheses,
            _execute_hypotheses,
            _load_discovery_settings,
            _plan_hypotheses,
            re_evaluate_sources,
            _PostgresSequenceRepository,
        ) = _load_orchestrator_dependencies()
        mission_id = str(context.get("mission_id") or options.get("mission_id") or "").strip() or None
        return await re_evaluate_sources(
            mission_id=mission_id,
            repository=DiscoveryCoordinatorRepository(),
        )


ORCHESTRATOR_PLUGIN_CLASSES = (
    PlanHypothesesPlugin,
    ExecuteHypothesesPlugin,
    EvaluateResultsPlugin,
    ReEvaluateSourcesPlugin,
)


def register_orchestrator_plugins(
    registry: TaskPluginRegistry | None = None,
) -> TaskPluginRegistry:
    target_registry = registry or TASK_REGISTRY
    for plugin_class in ORCHESTRATOR_PLUGIN_CLASSES:
        target_registry.register(plugin_class)
    return target_registry

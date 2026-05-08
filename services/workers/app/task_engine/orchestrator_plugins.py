from __future__ import annotations

from typing import Any

from .plugins import TASK_REGISTRY, TaskPlugin, TaskPluginRegistry


def _v3_repository() -> Any:
    from ..discovery_v3_repository import DiscoveryV3Repository

    return DiscoveryV3Repository()


class DiscoveryV3BootstrapTargetsPlugin(TaskPlugin):
    name = "discovery.v3.bootstrap_targets"
    description = "Bootstrap resilient discovery v3 targets from active system interests."
    category = "discovery"

    async def execute(self, options: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
        del options, context
        from ..discovery_v3_orchestrator import bootstrap_system_interest_targets

        targets = await bootstrap_system_interest_targets(repository=_v3_repository())
        return {"discovery_v3_bootstrapped_target_count": len(targets), "targets": targets}


class DiscoveryV3RefreshCoveragePlugin(TaskPlugin):
    name = "discovery.v3.refresh_coverage"
    description = "Refresh resilient discovery v3 coverage for a target."
    category = "discovery"

    async def execute(self, options: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
        target_id = str(context.get("target_id") or options.get("target_id") or options.get("targetId") or "").strip()
        if not target_id:
            raise ValueError("target_id is required for discovery.v3.refresh_coverage.")
        run_id = str(context.get("run_id") or options.get("run_id") or options.get("runId") or "").strip() or None
        from ..discovery_v3_orchestrator import refresh_coverage

        return await refresh_coverage(target_id=target_id, run_id=run_id, repository=_v3_repository())


class DiscoveryV3RunPlugin(TaskPlugin):
    name = "discovery.v3.run"
    description = "Execute a queued resilient discovery v3 run."
    category = "discovery"

    async def execute(self, options: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
        run_id = str(context.get("run_id") or options.get("run_id") or options.get("runId") or "").strip()
        if not run_id:
            raise ValueError("run_id is required for discovery.v3.run.")
        from ..discovery_v3_orchestrator import run_discovery

        return await run_discovery(run_id=run_id, repository=_v3_repository())


class DiscoveryV3ExpandExistingSourcePlugin(TaskPlugin):
    name = "discovery.v3.expand_existing_source"
    description = "Queue resilient discovery v3 expansion for an existing source channel."
    category = "discovery"

    async def execute(self, options: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
        target_id = str(context.get("target_id") or options.get("target_id") or options.get("targetId") or "").strip()
        channel_id = str(context.get("channel_id") or options.get("channel_id") or options.get("channelId") or "").strip()
        if not target_id or not channel_id:
            raise ValueError("target_id and channel_id are required for discovery.v3.expand_existing_source.")
        from ..discovery_v3_orchestrator import expand_existing_source

        return await expand_existing_source(target_id=target_id, channel_id=channel_id, repository=_v3_repository())


ORCHESTRATOR_PLUGIN_CLASSES = (
    DiscoveryV3BootstrapTargetsPlugin,
    DiscoveryV3RefreshCoveragePlugin,
    DiscoveryV3RunPlugin,
    DiscoveryV3ExpandExistingSourcePlugin,
)


def register_orchestrator_plugins(registry: TaskPluginRegistry | None = None) -> TaskPluginRegistry:
    target_registry = registry or TASK_REGISTRY
    for plugin_class in ORCHESTRATOR_PLUGIN_CLASSES:
        target_registry.register(plugin_class)
    return target_registry


register_orchestrator_plugins(TASK_REGISTRY)

from __future__ import annotations

from .plugins import TASK_REGISTRY, TaskPluginRegistry


ORCHESTRATOR_PLUGIN_CLASSES: tuple[type, ...] = ()


def register_orchestrator_plugins(registry: TaskPluginRegistry | None = None) -> TaskPluginRegistry:
    return registry or TASK_REGISTRY


register_orchestrator_plugins(TASK_REGISTRY)

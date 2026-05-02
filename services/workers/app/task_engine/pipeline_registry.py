from __future__ import annotations

from .pipeline_article_plugins import (
    ARTICLE_PIPELINE_PLUGIN_CLASSES,
)
from .pipeline_enrichment_plugins import (
    ENRICHMENT_PIPELINE_PLUGIN_CLASSES,
)
from .pipeline_maintenance_plugins import (
    CriterionCompilePlugin,
    FeedbackIngestPlugin,
    InterestCompilePlugin,
    ReindexPlugin,
)
from .plugins import TASK_REGISTRY, TaskPluginRegistry

CORE_PIPELINE_PLUGIN_CLASSES = (
    ENRICHMENT_PIPELINE_PLUGIN_CLASSES + ARTICLE_PIPELINE_PLUGIN_CLASSES
)

MAINTENANCE_PLUGIN_CLASSES = (
    InterestCompilePlugin,
    CriterionCompilePlugin,
    FeedbackIngestPlugin,
    ReindexPlugin,
)

BUILTIN_PLUGIN_CLASSES = CORE_PIPELINE_PLUGIN_CLASSES + MAINTENANCE_PLUGIN_CLASSES


def register_core_pipeline_plugins(
    registry: TaskPluginRegistry | None = None,
) -> TaskPluginRegistry:
    target_registry = registry or TASK_REGISTRY
    for plugin_class in CORE_PIPELINE_PLUGIN_CLASSES:
        target_registry.register(plugin_class)
    return target_registry


def register_maintenance_plugins(
    registry: TaskPluginRegistry | None = None,
) -> TaskPluginRegistry:
    target_registry = registry or TASK_REGISTRY
    for plugin_class in MAINTENANCE_PLUGIN_CLASSES:
        target_registry.register(plugin_class)
    return target_registry


def register_builtin_plugins(
    registry: TaskPluginRegistry | None = None,
) -> TaskPluginRegistry:
    target_registry = registry or TASK_REGISTRY
    for plugin_class in BUILTIN_PLUGIN_CLASSES:
        target_registry.register(plugin_class)
    return target_registry


register_builtin_plugins(TASK_REGISTRY)

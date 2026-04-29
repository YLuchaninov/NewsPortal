from __future__ import annotations

from typing import Any

from . import discovery_runtime as _discovery_runtime
from .discovery_enrichment_plugins import ArticleEnricherPlugin, ArticleLoaderPlugin
from .discovery_llm_plugins import LlmAnalyzerPlugin
from .discovery_probe_plugins import RssProbePlugin, UrlValidatorPlugin, WebsiteProbePlugin
from .discovery_registration_plugins import SourceRegistrarPlugin
from .discovery_sampling_plugins import ContentSamplerPlugin
from .discovery_scoring_plugins import RelevanceScorerPlugin
from .discovery_search_plugins import WebSearchPlugin
from .discovery_storage_plugins import DbStorePlugin
from .plugins import TASK_REGISTRY, TaskPluginRegistry


def get_discovery_runtime() -> Any:
    return _discovery_runtime.get_discovery_runtime()


DISCOVERY_PLUGIN_CLASSES = (
    WebSearchPlugin,
    UrlValidatorPlugin,
    RssProbePlugin,
    WebsiteProbePlugin,
    ContentSamplerPlugin,
    RelevanceScorerPlugin,
    LlmAnalyzerPlugin,
    SourceRegistrarPlugin,
)

UTILITY_PLUGIN_CLASSES = (DbStorePlugin,)

ENRICHMENT_PLUGIN_CLASSES = (
    ArticleLoaderPlugin,
    ArticleEnricherPlugin,
)

DISCOVERY_ENRICHMENT_PLUGIN_CLASSES = (
    DISCOVERY_PLUGIN_CLASSES + UTILITY_PLUGIN_CLASSES + ENRICHMENT_PLUGIN_CLASSES
)


def register_discovery_plugins(
    registry: TaskPluginRegistry | None = None,
) -> TaskPluginRegistry:
    target_registry = registry or TASK_REGISTRY
    for plugin_class in DISCOVERY_PLUGIN_CLASSES:
        target_registry.register(plugin_class)
    return target_registry


def register_utility_plugins(
    registry: TaskPluginRegistry | None = None,
) -> TaskPluginRegistry:
    target_registry = registry or TASK_REGISTRY
    for plugin_class in UTILITY_PLUGIN_CLASSES:
        target_registry.register(plugin_class)
    return target_registry


def register_enrichment_plugins(
    registry: TaskPluginRegistry | None = None,
) -> TaskPluginRegistry:
    target_registry = registry or TASK_REGISTRY
    for plugin_class in ENRICHMENT_PLUGIN_CLASSES:
        target_registry.register(plugin_class)
    return target_registry


def register_discovery_enrichment_plugins(
    registry: TaskPluginRegistry | None = None,
) -> TaskPluginRegistry:
    target_registry = registry or TASK_REGISTRY
    register_discovery_plugins(target_registry)
    register_utility_plugins(target_registry)
    register_enrichment_plugins(target_registry)
    return target_registry


register_discovery_enrichment_plugins(TASK_REGISTRY)

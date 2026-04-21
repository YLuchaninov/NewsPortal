from __future__ import annotations

import os

from ..discovery_runtime import DiscoveryRuntime
from .article_enricher import PostgresArticleEnricherAdapter
from .article_loader import PostgresArticleLoaderAdapter
from .content_sampler import HttpxContentSamplerAdapter
from .db_store import PostgresDbStoreAdapter
from .llm_analyzer import GeminiLlmAnalyzerAdapter
from .rss_probe import FeedparserRssProbeAdapter
from .source_registrar import PostgresSourceRegistrarAdapter
from .url_validator import HttpxUrlValidatorAdapter
from .web_search import (
    BraveWebSearchAdapter,
    DdgsWebSearchAdapter,
    SerperWebSearchAdapter,
    StubWebSearchAdapter,
)
from .website_probe import FetchersWebsiteProbeAdapter


def discovery_enabled() -> bool:
    return os.getenv("DISCOVERY_ENABLED", "0").strip().lower() in {"1", "true", "yes", "on"}


def resolve_discovery_search_provider() -> str:
    return os.getenv("DISCOVERY_SEARCH_PROVIDER", "ddgs").strip().lower() or "ddgs"


def build_discovery_web_search_adapter() -> object:
    provider = resolve_discovery_search_provider()
    if provider == "stub":
        return StubWebSearchAdapter()
    if provider == "ddgs":
        return DdgsWebSearchAdapter()
    if provider == "brave":
        return BraveWebSearchAdapter()
    if provider == "serper":
        return SerperWebSearchAdapter()
    raise RuntimeError(f"Unsupported discovery search provider {provider!r}.")


def build_live_discovery_runtime() -> DiscoveryRuntime:
    return DiscoveryRuntime(
        web_search=build_discovery_web_search_adapter(),
        url_validator=HttpxUrlValidatorAdapter(),
        rss_probe=FeedparserRssProbeAdapter(),
        content_sampler=HttpxContentSamplerAdapter(),
        llm_analyzer=GeminiLlmAnalyzerAdapter(),
        source_registrar=PostgresSourceRegistrarAdapter(),
        db_store=PostgresDbStoreAdapter(),
        article_loader=PostgresArticleLoaderAdapter(),
        article_enricher=PostgresArticleEnricherAdapter(),
        website_probe=FetchersWebsiteProbeAdapter(),
    )


__all__ = [
    "build_discovery_web_search_adapter",
    "build_live_discovery_runtime",
    "discovery_enabled",
    "resolve_discovery_search_provider",
]

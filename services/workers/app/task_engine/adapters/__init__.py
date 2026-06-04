from __future__ import annotations

from ..discovery_runtime import DiscoveryRuntime
from .signal_candidate_enricher import PostgresSignalCandidateEnricherAdapter
from .signal_candidate_loader import PostgresSignalCandidateLoaderAdapter
from .content_sampler import FetchersContentSamplerAdapter
from .db_store import PostgresDbStoreAdapter
from .fetchers_rss_probe import FetchersRssProbeAdapter
from .llm_analyzer import GeminiLlmAnalyzerAdapter
from .search_fanout import SearchFanoutAdapter
from .source_registrar import PostgresSourceRegistrarAdapter
from .url_validator import FetchersUrlValidatorAdapter
from .web_search import (
    BraveWebSearchAdapter,
    DdgsWebSearchAdapter,
    SerperWebSearchAdapter,
    StubWebSearchAdapter,
)
from .website_probe import FetchersWebsiteProbeAdapter


def discovery_enabled() -> bool:
    import os

    return os.getenv("DISCOVERY_ENABLED", "0").strip().lower() in {"1", "true", "yes", "on"}


def resolve_discovery_search_provider() -> str:
    import os

    return os.getenv("DISCOVERY_SEARCH_PROVIDER", "ddgs").strip().lower() or "ddgs"


def build_discovery_web_search_adapter() -> object:
    import os

    providers_value = os.getenv("DISCOVERY_SEARCH_PROVIDERS", "").strip().lower()
    if providers_value:
        adapters: dict[str, object] = {}
        for provider_name in [item.strip() for item in providers_value.split(",") if item.strip()]:
            adapters[provider_name] = _build_single_search_adapter(provider_name)
        if len(adapters) > 1:
            return SearchFanoutAdapter(adapters)
        if len(adapters) == 1:
            return next(iter(adapters.values()))
    provider = resolve_discovery_search_provider()
    return _build_single_search_adapter(provider)


def _build_single_search_adapter(provider: str) -> object:
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
    rss_probe_adapter = FetchersRssProbeAdapter()
    return DiscoveryRuntime(
        web_search=build_discovery_web_search_adapter(),
        url_validator=FetchersUrlValidatorAdapter(),
        rss_probe=rss_probe_adapter,
        content_sampler=FetchersContentSamplerAdapter(rss_probe=rss_probe_adapter),
        llm_analyzer=GeminiLlmAnalyzerAdapter(),
        source_registrar=PostgresSourceRegistrarAdapter(),
        db_store=PostgresDbStoreAdapter(),
        signal_candidate_loader=PostgresSignalCandidateLoaderAdapter(),
        signal_candidate_enricher=PostgresSignalCandidateEnricherAdapter(),
        website_probe=FetchersWebsiteProbeAdapter(),
    )


__all__ = [
    "build_discovery_web_search_adapter",
    "build_live_discovery_runtime",
    "discovery_enabled",
    "resolve_discovery_search_provider",
]

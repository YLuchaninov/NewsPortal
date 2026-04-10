from __future__ import annotations

import inspect
from dataclasses import dataclass, field
from typing import Any, Protocol


class WebSearchAdapter(Protocol):
    def search(
        self,
        *,
        query: str,
        count: int,
        result_type: str,
        time_range: str | None,
    ) -> Any: ...


class UrlValidatorAdapter(Protocol):
    def validate_urls(self, *, urls: list[str]) -> Any: ...


class RssProbeAdapter(Protocol):
    def probe_feeds(self, *, urls: list[str], sample_count: int) -> Any: ...


class ContentSamplerAdapter(Protocol):
    def sample_content(
        self,
        *,
        source_urls: list[str],
        article_count: int,
        max_chars: int,
    ) -> Any: ...


class LlmAnalyzerAdapter(Protocol):
    def analyze(
        self,
        *,
        prompt: str | None,
        task: str | None,
        payload: Any,
        model: str | None,
        temperature: float,
        output_schema: dict[str, Any] | None,
    ) -> Any: ...


class SourceRegistrarAdapter(Protocol):
    def register_sources(
        self,
        *,
        sources: list[dict[str, Any]],
        enabled: bool,
        dry_run: bool,
        created_by: str | None,
        tags: list[str],
        provider_type: str,
    ) -> Any: ...


class DbStoreAdapter(Protocol):
    def store(
        self,
        *,
        record_key: str,
        payload: Any,
        namespace: str | None,
    ) -> Any: ...


class ArticleLoaderAdapter(Protocol):
    def load_articles(
        self,
        *,
        filters: dict[str, Any],
        limit: int,
        include_blocked: bool,
    ) -> Any: ...


class ArticleEnricherAdapter(Protocol):
    def enrich_articles(
        self,
        *,
        articles: list[dict[str, Any]],
        enrichment: Any,
        mode: str,
        target_field: str | None,
    ) -> Any: ...


class WebsiteProbeAdapter(Protocol):
    def probe_websites(
        self,
        *,
        urls: list[str],
        sample_count: int,
    ) -> Any: ...


class _UnavailableAdapter:
    capability = "discovery runtime"

    def _raise(self) -> Any:
        raise RuntimeError(
            f"{self.capability} is not configured for the Universal Task Engine runtime."
        )


class UnavailableWebSearchAdapter(_UnavailableAdapter):
    capability = "web search adapter"

    def search(
        self,
        *,
        query: str,
        count: int,
        result_type: str,
        time_range: str | None,
    ) -> Any:
        return self._raise()


class UnavailableUrlValidatorAdapter(_UnavailableAdapter):
    capability = "URL validator adapter"

    def validate_urls(self, *, urls: list[str]) -> Any:
        return self._raise()


class UnavailableRssProbeAdapter(_UnavailableAdapter):
    capability = "RSS probe adapter"

    def probe_feeds(self, *, urls: list[str], sample_count: int) -> Any:
        return self._raise()


class UnavailableContentSamplerAdapter(_UnavailableAdapter):
    capability = "content sampler adapter"

    def sample_content(
        self,
        *,
        source_urls: list[str],
        article_count: int,
        max_chars: int,
    ) -> Any:
        return self._raise()


class UnavailableLlmAnalyzerAdapter(_UnavailableAdapter):
    capability = "LLM analyzer adapter"

    def analyze(
        self,
        *,
        prompt: str | None,
        task: str | None,
        payload: Any,
        model: str | None,
        temperature: float,
        output_schema: dict[str, Any] | None,
    ) -> Any:
        return self._raise()


class UnavailableSourceRegistrarAdapter(_UnavailableAdapter):
    capability = "source registrar adapter"

    def register_sources(
        self,
        *,
        sources: list[dict[str, Any]],
        enabled: bool,
        dry_run: bool,
        created_by: str | None,
        tags: list[str],
        provider_type: str,
    ) -> Any:
        return self._raise()


class UnavailableDbStoreAdapter(_UnavailableAdapter):
    capability = "db store adapter"

    def store(
        self,
        *,
        record_key: str,
        payload: Any,
        namespace: str | None,
    ) -> Any:
        return self._raise()


class UnavailableArticleLoaderAdapter(_UnavailableAdapter):
    capability = "article loader adapter"

    def load_articles(
        self,
        *,
        filters: dict[str, Any],
        limit: int,
        include_blocked: bool,
    ) -> Any:
        return self._raise()


class UnavailableArticleEnricherAdapter(_UnavailableAdapter):
    capability = "article enricher adapter"

    def enrich_articles(
        self,
        *,
        articles: list[dict[str, Any]],
        enrichment: Any,
        mode: str,
        target_field: str | None,
    ) -> Any:
        return self._raise()


class UnavailableWebsiteProbeAdapter(_UnavailableAdapter):
    capability = "website probe adapter"

    def probe_websites(self, *, urls: list[str], sample_count: int) -> Any:
        return self._raise()


@dataclass
class DiscoveryRuntime:
    web_search: WebSearchAdapter = field(default_factory=UnavailableWebSearchAdapter)
    url_validator: UrlValidatorAdapter = field(default_factory=UnavailableUrlValidatorAdapter)
    rss_probe: RssProbeAdapter = field(default_factory=UnavailableRssProbeAdapter)
    content_sampler: ContentSamplerAdapter = field(
        default_factory=UnavailableContentSamplerAdapter
    )
    llm_analyzer: LlmAnalyzerAdapter = field(default_factory=UnavailableLlmAnalyzerAdapter)
    source_registrar: SourceRegistrarAdapter = field(
        default_factory=UnavailableSourceRegistrarAdapter
    )
    db_store: DbStoreAdapter = field(default_factory=UnavailableDbStoreAdapter)
    article_loader: ArticleLoaderAdapter = field(default_factory=UnavailableArticleLoaderAdapter)
    article_enricher: ArticleEnricherAdapter = field(
        default_factory=UnavailableArticleEnricherAdapter
    )
    website_probe: WebsiteProbeAdapter = field(default_factory=UnavailableWebsiteProbeAdapter)


_DISCOVERY_RUNTIME = DiscoveryRuntime()


def get_discovery_runtime() -> DiscoveryRuntime:
    return _DISCOVERY_RUNTIME


def configure_discovery_runtime(runtime: DiscoveryRuntime) -> DiscoveryRuntime:
    global _DISCOVERY_RUNTIME
    _DISCOVERY_RUNTIME = runtime
    return _DISCOVERY_RUNTIME


def reset_discovery_runtime() -> DiscoveryRuntime:
    return configure_discovery_runtime(DiscoveryRuntime())


async def resolve_runtime_call(value: Any) -> Any:
    if inspect.isawaitable(value):
        return await value
    return value


__all__ = [
    "ArticleEnricherAdapter",
    "ArticleLoaderAdapter",
    "configure_discovery_runtime",
    "ContentSamplerAdapter",
    "DbStoreAdapter",
    "DiscoveryRuntime",
    "get_discovery_runtime",
    "LlmAnalyzerAdapter",
    "reset_discovery_runtime",
    "resolve_runtime_call",
    "RssProbeAdapter",
    "SourceRegistrarAdapter",
    "UrlValidatorAdapter",
    "WebSearchAdapter",
    "WebsiteProbeAdapter",
]

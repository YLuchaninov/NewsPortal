from __future__ import annotations

from typing import Any

from .discovery_plugin_common import (
    ContextTaskPlugin,
    _coerce_mapping_list,
    _extract_url_candidates,
    _unique_preserving_order,
)
from .discovery_runtime import resolve_runtime_call


def _get_discovery_runtime() -> Any:
    from . import discovery_plugins as _registry_owner

    return _registry_owner.get_discovery_runtime()


class ContentSamplerPlugin(ContextTaskPlugin):
    name = "discovery.content_sampler"
    description = "Sample full article content from candidate sources."
    category = "discovery"

    async def execute(
        self,
        options: dict[str, Any],
        context: dict[str, Any],
    ) -> dict[str, Any]:
        sources_field = self._resolve_optional_string(
            options=options,
            context=context,
            key="sources_field",
            aliases=("sourcesField",),
        ) or "probed_feeds"
        article_count = self._resolve_positive_int(
            options=options,
            context=context,
            key="article_count",
            aliases=("articleCount",),
            default=3,
        )
        max_chars = self._resolve_positive_int(
            options=options,
            context=context,
            key="max_chars",
            aliases=("maxChars",),
            default=4_000,
        )

        explicit_urls = self._resolve_string_list(
            options=options,
            context=context,
            key="source_urls",
            aliases=("sourceUrls",),
            default=[],
        )
        candidate_value = explicit_urls or context.get(sources_field)
        urls = explicit_urls or _extract_url_candidates(candidate_value)

        runtime = _get_discovery_runtime()
        raw_results = await resolve_runtime_call(
            runtime.content_sampler.sample_content(
                source_urls=_unique_preserving_order(urls),
                article_count=article_count,
                max_chars=max_chars,
            )
        )
        results = _coerce_mapping_list(raw_results, field_name="sampled_content")

        normalized_results: list[dict[str, Any]] = []
        for item in results:
            normalized_results.append(
                {
                    "source_url": str(item.get("source_url") or item.get("url") or ""),
                    "articles": _coerce_mapping_list(
                        item.get("articles") or [],
                        field_name="articles",
                    ),
                }
            )

        return {"sampled_content": normalized_results}

    def validate_options(self, options: dict[str, Any]) -> list[str]:
        errors: list[str] = []
        self._validate_optional_non_empty_string(
            options,
            errors,
            option_key="sources_field",
            aliases=("sourcesField",),
        )
        self._validate_optional_positive_int(
            options,
            errors,
            option_key="article_count",
            aliases=("articleCount",),
        )
        self._validate_optional_positive_int(
            options,
            errors,
            option_key="max_chars",
            aliases=("maxChars",),
        )
        self._validate_optional_string_list(
            options,
            errors,
            option_key="source_urls",
            aliases=("sourceUrls",),
        )
        return errors

    def describe_inputs(self) -> dict[str, str]:
        return {
            "sources_field": "Context field containing feed or source URLs.",
            "source_urls": "Explicit list of source URLs.",
            "article_count": "Number of articles to sample per source.",
            "max_chars": "Maximum content length to keep per sampled article.",
        }

    def describe_outputs(self) -> dict[str, str]:
        return {
            "sampled_content": "Sampled source content grouped by source URL.",
        }

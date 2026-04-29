from __future__ import annotations

from typing import Any, Mapping

from .discovery_plugin_common import (
    ContextTaskPlugin,
    _MISSING,
    _coerce_mapping_list,
    _lookup_from_mapping,
)
from .discovery_runtime import resolve_runtime_call

_VALID_ENRICHMENT_MODES = {"merge", "replace"}


def _get_discovery_runtime() -> Any:
    from . import discovery_plugins as _registry_owner

    return _registry_owner.get_discovery_runtime()


class ArticleLoaderPlugin(ContextTaskPlugin):
    name = "enrichment.article_loader"
    description = "Load articles for enrichment through a pluggable data adapter."
    category = "enrichment"

    async def execute(
        self,
        options: dict[str, Any],
        context: dict[str, Any],
    ) -> dict[str, Any]:
        filters = self._resolve_json_object(
            options=options,
            context=context,
            key="filters",
            default={},
        )
        filters_field = self._resolve_optional_string(
            options=options,
            context=context,
            key="filters_field",
            aliases=("filtersField",),
        )
        if filters_field is not None:
            filters = self._resolve_json_object(
                options={},
                context=context,
                key=filters_field,
            )
        limit = self._resolve_positive_int(
            options=options,
            context=context,
            key="limit",
            default=50,
        )
        include_blocked = self._resolve_bool(
            options=options,
            context=context,
            key="include_blocked",
            aliases=("includeBlocked",),
            default=False,
        )

        runtime = _get_discovery_runtime()
        raw_results = await resolve_runtime_call(
            runtime.article_loader.load_articles(
                filters=filters,
                limit=limit,
                include_blocked=include_blocked,
            )
        )
        articles = _coerce_mapping_list(raw_results, field_name="articles")
        return {"articles": articles}

    def validate_options(self, options: dict[str, Any]) -> list[str]:
        errors: list[str] = []
        self._validate_optional_non_empty_string(
            options,
            errors,
            option_key="filters_field",
            aliases=("filtersField",),
        )
        self._validate_optional_positive_int(options, errors, option_key="limit")
        self._validate_optional_boolean_like(
            options,
            errors,
            option_key="include_blocked",
            aliases=("includeBlocked",),
        )
        return errors

    def describe_inputs(self) -> dict[str, str]:
        return {
            "filters": "Direct article loader filters.",
            "filters_field": "Context field containing the loader filters.",
            "limit": "Maximum number of articles to load.",
            "include_blocked": "Whether blocked articles may be included.",
        }

    def describe_outputs(self) -> dict[str, str]:
        return {
            "articles": "Loaded article rows for later enrichment tasks.",
        }


class ArticleEnricherPlugin(ContextTaskPlugin):
    name = "enrichment.article_enricher"
    description = "Persist enrichment results back to articles through a pluggable adapter."
    category = "enrichment"

    async def execute(
        self,
        options: dict[str, Any],
        context: dict[str, Any],
    ) -> dict[str, Any]:
        articles_field = self._resolve_optional_string(
            options=options,
            context=context,
            key="articles_field",
            aliases=("articlesField",),
        ) or "articles"
        articles = _coerce_mapping_list(context.get(articles_field) or [], field_name=articles_field)

        enrichment_field = self._resolve_optional_string(
            options=options,
            context=context,
            key="enrichment_field",
            aliases=("enrichmentField",),
        )
        enrichment = (
            context.get(enrichment_field)
            if enrichment_field
            else options.get("enrichment", context.get("llm_analysis"))
        )
        mode = self._resolve_optional_string(
            options=options,
            context=context,
            key="mode",
        ) or "merge"
        if mode not in _VALID_ENRICHMENT_MODES:
            raise ValueError(
                f"{self.name} expected mode to be one of {sorted(_VALID_ENRICHMENT_MODES)}."
            )
        target_field = self._resolve_optional_string(
            options=options,
            context=context,
            key="target_field",
            aliases=("targetField",),
        )

        runtime = _get_discovery_runtime()
        raw_result = await resolve_runtime_call(
            runtime.article_enricher.enrich_articles(
                articles=articles,
                enrichment=enrichment,
                mode=mode,
                target_field=target_field,
            )
        )

        updated_articles = articles
        enriched_count = len(articles)
        if isinstance(raw_result, Mapping):
            if raw_result.get("articles") is not None:
                updated_articles = _coerce_mapping_list(
                    raw_result.get("articles"),
                    field_name="articles",
                )
            if raw_result.get("enriched_count") is not None:
                enriched_count = int(raw_result["enriched_count"])
        elif isinstance(raw_result, list):
            updated_articles = _coerce_mapping_list(raw_result, field_name="articles")
            enriched_count = len(updated_articles)
        elif isinstance(raw_result, int):
            enriched_count = raw_result

        return {
            "articles": updated_articles,
            "enriched_count": max(0, int(enriched_count)),
        }

    def validate_options(self, options: dict[str, Any]) -> list[str]:
        errors: list[str] = []
        self._validate_optional_non_empty_string(
            options,
            errors,
            option_key="articles_field",
            aliases=("articlesField",),
        )
        self._validate_optional_non_empty_string(
            options,
            errors,
            option_key="enrichment_field",
            aliases=("enrichmentField",),
        )
        self._validate_optional_non_empty_string(
            options,
            errors,
            option_key="target_field",
            aliases=("targetField",),
        )
        mode = _lookup_from_mapping(options, "mode")
        if mode is not _MISSING and mode is not None and mode not in _VALID_ENRICHMENT_MODES:
            errors.append(f"mode must be one of {sorted(_VALID_ENRICHMENT_MODES)} when provided.")
        return errors

    def describe_inputs(self) -> dict[str, str]:
        return {
            "articles_field": "Context field containing articles to enrich.",
            "enrichment_field": "Context field containing enrichment payload.",
            "mode": "How to apply enrichment: merge or replace.",
            "target_field": "Optional article field to update through the adapter.",
        }

    def describe_outputs(self) -> dict[str, str]:
        return {
            "articles": "Updated article rows after enrichment.",
            "enriched_count": "Number of articles acknowledged by the enricher adapter.",
        }

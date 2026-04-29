from __future__ import annotations

from typing import Any

from .adapters.web_search import unwrap_web_search_output
from .discovery_plugin_common import (
    ContextTaskPlugin,
    _MISSING,
    _coerce_mapping_list,
    _lookup_from_mapping,
)
from .discovery_runtime import resolve_runtime_call

_VALID_SEARCH_TYPES = {"web", "news"}
_VALID_TIME_RANGES = {"day", "week", "month", "year"}


def _get_discovery_runtime() -> Any:
    from . import discovery_plugins as _registry_owner

    return _registry_owner.get_discovery_runtime()


class WebSearchPlugin(ContextTaskPlugin):
    name = "discovery.web_search"
    description = "Search the web or news sources through a pluggable adapter."
    category = "discovery"

    async def execute(
        self,
        options: dict[str, Any],
        context: dict[str, Any],
    ) -> dict[str, Any]:
        query = self._resolve_optional_string(
            options=options,
            context=context,
            key="query",
        )
        if query is None:
            query_field = self._resolve_required_string(
                options=options,
                context=context,
                key="query_field",
                aliases=("queryField",),
            )
            query = self._resolve_required_string(
                options={},
                context=context,
                key=query_field,
            )

        count = self._resolve_positive_int(
            options=options,
            context=context,
            key="count",
            default=20,
        )
        result_type = self._resolve_optional_string(
            options=options,
            context=context,
            key="type",
        ) or "web"
        if result_type not in _VALID_SEARCH_TYPES:
            raise ValueError(f"{self.name} expected type to be one of {sorted(_VALID_SEARCH_TYPES)}.")

        time_range = self._resolve_optional_string(
            options=options,
            context=context,
            key="time",
        )
        if time_range is not None and time_range not in _VALID_TIME_RANGES:
            raise ValueError(
                f"{self.name} expected time to be one of {sorted(_VALID_TIME_RANGES)} when provided."
            )

        runtime = _get_discovery_runtime()
        raw_output = await resolve_runtime_call(
            runtime.web_search.search(
                query=query,
                count=count,
                result_type=result_type,
                time_range=time_range,
            )
        )
        raw_results, search_meta = unwrap_web_search_output(raw_output)
        results = _coerce_mapping_list(raw_results, field_name="search_results")

        normalized_results: list[dict[str, Any]] = []
        for item in results:
            url = next(
                (
                    str(candidate).strip()
                    for candidate in (
                        item.get("url"),
                        item.get("link"),
                    )
                    if isinstance(candidate, str) and candidate.strip()
                ),
                None,
            )
            if url is None:
                continue
            normalized_results.append(
                {
                    "url": url,
                    "title": str(item.get("title") or ""),
                    "snippet": str(item.get("snippet") or item.get("description") or ""),
                    "source": str(item.get("source") or "") or None,
                }
            )

        return {
            "search_query": query,
            "search_results": normalized_results,
            "search_meta": {
                **search_meta,
                "search_query": query,
                "requested_count": count,
                "returned_count": len(normalized_results),
                "result_type": result_type,
                "time_range": time_range,
            },
        }

    def validate_options(self, options: dict[str, Any]) -> list[str]:
        errors: list[str] = []
        self._validate_optional_non_empty_string(options, errors, option_key="query")
        self._validate_optional_non_empty_string(
            options,
            errors,
            option_key="query_field",
            aliases=("queryField",),
        )
        self._validate_optional_positive_int(options, errors, option_key="count")

        query = _lookup_from_mapping(options, "query")
        query_field = _lookup_from_mapping(options, "query_field", "queryField")
        if (query is _MISSING or query is None) and (query_field is _MISSING or query_field is None):
            errors.append("Either query or query_field must be provided.")

        result_type = _lookup_from_mapping(options, "type")
        if result_type is not _MISSING and result_type is not None and result_type not in _VALID_SEARCH_TYPES:
            errors.append(f"type must be one of {sorted(_VALID_SEARCH_TYPES)} when provided.")

        time_range = _lookup_from_mapping(options, "time")
        if time_range is not _MISSING and time_range is not None and time_range not in _VALID_TIME_RANGES:
            errors.append(f"time must be one of {sorted(_VALID_TIME_RANGES)} when provided.")
        return errors

    def describe_inputs(self) -> dict[str, str]:
        return {
            "query": "Direct search query string.",
            "query_field": "Context field name holding the search query.",
            "count": "Maximum number of results to request.",
            "type": "Search type: web or news.",
            "time": "Optional recency window: day, week, month or year.",
        }

    def describe_outputs(self) -> dict[str, str]:
        return {
            "search_query": "Resolved search query used for the adapter call.",
            "search_results": "Normalized search results with url, title and snippet.",
            "search_meta": "Provider/backend metadata for the search request and normalized result count.",
        }

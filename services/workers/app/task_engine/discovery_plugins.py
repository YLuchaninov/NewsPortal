from __future__ import annotations

import re
from typing import Any, Final, Iterable, Mapping
from urllib.parse import urlparse

from .adapters.llm_analyzer import unwrap_llm_analyzer_output
from .adapters.web_search import unwrap_web_search_output
from .context import RESERVED_CONTEXT_KEYS
from .discovery_runtime import get_discovery_runtime, resolve_runtime_call
from .plugins import TASK_REGISTRY, TaskPlugin, TaskPluginRegistry

_MISSING: Final = object()
_BOOLEAN_TRUE_VALUES = {"1", "true", "yes", "on"}
_BOOLEAN_FALSE_VALUES = {"0", "false", "no", "off"}
_TOKEN_RE = re.compile(r"[a-z0-9]+")
_VALID_SEARCH_TYPES = {"web", "news"}
_VALID_TIME_RANGES = {"day", "week", "month", "year"}
_VALID_ENRICHMENT_MODES = {"merge", "replace"}
_VALID_DISCOVERY_PROVIDER_TYPES = {"rss", "website", "api", "email_imap", "youtube"}


def _lookup_from_mapping(source: Mapping[str, Any], *keys: str) -> Any:
    for key in keys:
        if key in source:
            return source[key]
    return _MISSING


def _lookup_value(
    options: Mapping[str, Any],
    context: Mapping[str, Any],
    *keys: str,
) -> Any:
    for source in (options, context):
        value = _lookup_from_mapping(source, *keys)
        if value is not _MISSING:
            return value
    return _MISSING


def _iter_text_fragments(value: Any) -> Iterable[str]:
    if value is None:
        return
    if isinstance(value, str):
        text = value.strip()
        if text:
            yield text
        return
    if isinstance(value, Mapping):
        for key in (
            "title",
            "snippet",
            "description",
            "summary",
            "feed_title",
            "content",
            "body",
            "query",
            "topic",
            "source_name",
        ):
            if key in value:
                yield from _iter_text_fragments(value[key])
        for key in ("sample_entries", "articles", "matched_terms", "topics", "tags"):
            if key in value:
                yield from _iter_text_fragments(value[key])
        return
    if isinstance(value, list):
        for item in value:
            yield from _iter_text_fragments(item)


def _tokenize(value: Any) -> list[str]:
    text = " ".join(_iter_text_fragments(value)).lower()
    return _TOKEN_RE.findall(text)


def _unique_preserving_order(values: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    unique_values: list[str] = []
    for value in values:
        normalized = value.strip()
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        unique_values.append(normalized)
    return unique_values


def _extract_url_candidates(value: Any) -> list[str]:
    urls: list[str] = []
    if isinstance(value, str):
        return [value]
    if isinstance(value, Mapping):
        for key in ("url", "source_url", "feed_url", "final_url", "link"):
            candidate = value.get(key)
            if isinstance(candidate, str) and candidate.strip():
                urls.append(candidate.strip())
        return urls
    if isinstance(value, list):
        for item in value:
            urls.extend(_extract_url_candidates(item))
    return urls


def _is_http_url(value: str) -> bool:
    parsed = urlparse(value)
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def _looks_like_rss_candidate(url: str, content_type: str | None = None) -> bool:
    lowered_url = url.casefold()
    lowered_type = content_type.casefold() if isinstance(content_type, str) else ""
    if any(
        hint in lowered_type
        for hint in ("application/rss+xml", "application/atom+xml", "xml", "rss", "atom")
    ):
        return True
    return any(hint in lowered_url for hint in ("/feed", "/rss", ".rss", ".xml", "atom"))


def _coerce_mapping_list(value: Any, *, field_name: str) -> list[dict[str, Any]]:
    if value is None:
        return []
    if not isinstance(value, list):
        raise TypeError(f"{field_name} must be a list of objects.")

    items: list[dict[str, Any]] = []
    for index, item in enumerate(value):
        if not isinstance(item, Mapping):
            raise TypeError(f"{field_name}[{index}] must be an object.")
        items.append(dict(item))
    return items


def _non_reserved_context(context: Mapping[str, Any]) -> dict[str, Any]:
    return {
        key: value
        for key, value in context.items()
        if key not in RESERVED_CONTEXT_KEYS and not key.startswith("_")
    }


class ContextTaskPlugin(TaskPlugin):
    def _resolve_required_string(
        self,
        *,
        options: Mapping[str, Any],
        context: Mapping[str, Any],
        key: str,
        aliases: tuple[str, ...] = (),
    ) -> str:
        value = _lookup_value(options, context, key, *aliases)
        if not isinstance(value, str) or not value.strip():
            raise ValueError(f"{self.name} expected {key}.")
        return value.strip()

    def _resolve_optional_string(
        self,
        *,
        options: Mapping[str, Any],
        context: Mapping[str, Any],
        key: str,
        aliases: tuple[str, ...] = (),
    ) -> str | None:
        value = _lookup_value(options, context, key, *aliases)
        if value is _MISSING or value is None:
            return None
        if not isinstance(value, str) or not value.strip():
            raise ValueError(f"{self.name} expected {key} to be a non-empty string when provided.")
        return value.strip()

    def _resolve_positive_int(
        self,
        *,
        options: Mapping[str, Any],
        context: Mapping[str, Any],
        key: str,
        aliases: tuple[str, ...] = (),
        default: int,
    ) -> int:
        value = _lookup_value(options, context, key, *aliases)
        if value is _MISSING or value is None:
            return default
        try:
            normalized = int(value)
        except (TypeError, ValueError) as error:
            raise ValueError(f"{self.name} expected {key} to be a positive integer.") from error
        if normalized < 1:
            raise ValueError(f"{self.name} expected {key} to be a positive integer.")
        return normalized

    def _resolve_probability(
        self,
        *,
        options: Mapping[str, Any],
        context: Mapping[str, Any],
        key: str,
        aliases: tuple[str, ...] = (),
        default: float,
    ) -> float:
        value = _lookup_value(options, context, key, *aliases)
        if value is _MISSING or value is None:
            return default
        try:
            normalized = float(value)
        except (TypeError, ValueError) as error:
            raise ValueError(f"{self.name} expected {key} to be a float between 0 and 1.") from error
        if normalized < 0 or normalized > 1:
            raise ValueError(f"{self.name} expected {key} to be a float between 0 and 1.")
        return normalized

    def _resolve_bool(
        self,
        *,
        options: Mapping[str, Any],
        context: Mapping[str, Any],
        key: str,
        aliases: tuple[str, ...] = (),
        default: bool = False,
    ) -> bool:
        value = _lookup_value(options, context, key, *aliases)
        if value is _MISSING or value is None:
            return default
        if isinstance(value, bool):
            return value
        if isinstance(value, int) and value in {0, 1}:
            return bool(value)
        if isinstance(value, str):
            lowered = value.strip().casefold()
            if lowered in _BOOLEAN_TRUE_VALUES:
                return True
            if lowered in _BOOLEAN_FALSE_VALUES:
                return False
        raise ValueError(f"{self.name} expected {key} to be boolean-like.")

    def _resolve_json_object(
        self,
        *,
        options: Mapping[str, Any],
        context: Mapping[str, Any],
        key: str,
        aliases: tuple[str, ...] = (),
        default: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        value = _lookup_value(options, context, key, *aliases)
        if value is _MISSING or value is None:
            return dict(default or {})
        if not isinstance(value, Mapping):
            raise ValueError(f"{self.name} expected {key} to be an object.")
        return dict(value)

    def _resolve_string_list(
        self,
        *,
        options: Mapping[str, Any],
        context: Mapping[str, Any],
        key: str,
        aliases: tuple[str, ...] = (),
        default: list[str] | None = None,
    ) -> list[str]:
        value = _lookup_value(options, context, key, *aliases)
        if value is _MISSING or value is None:
            return list(default or [])
        if isinstance(value, str):
            return [value.strip()] if value.strip() else []
        if not isinstance(value, list):
            raise ValueError(f"{self.name} expected {key} to be a list of strings.")

        items: list[str] = []
        for item in value:
            if not isinstance(item, str) or not item.strip():
                raise ValueError(f"{self.name} expected {key} to contain only non-empty strings.")
            items.append(item.strip())
        return items

    def _validate_optional_non_empty_string(
        self,
        options: Mapping[str, Any],
        errors: list[str],
        *,
        option_key: str,
        aliases: tuple[str, ...] = (),
    ) -> None:
        value = _lookup_from_mapping(options, option_key, *aliases)
        if value is _MISSING or value is None:
            return
        if not isinstance(value, str) or not value.strip():
            errors.append(f"{option_key} must be a non-empty string when provided.")

    def _validate_optional_positive_int(
        self,
        options: Mapping[str, Any],
        errors: list[str],
        *,
        option_key: str,
        aliases: tuple[str, ...] = (),
    ) -> None:
        value = _lookup_from_mapping(options, option_key, *aliases)
        if value is _MISSING or value is None:
            return
        try:
            normalized = int(value)
        except (TypeError, ValueError):
            errors.append(f"{option_key} must be a positive integer when provided.")
            return
        if normalized < 1:
            errors.append(f"{option_key} must be a positive integer when provided.")

    def _validate_optional_probability(
        self,
        options: Mapping[str, Any],
        errors: list[str],
        *,
        option_key: str,
        aliases: tuple[str, ...] = (),
    ) -> None:
        value = _lookup_from_mapping(options, option_key, *aliases)
        if value is _MISSING or value is None:
            return
        try:
            normalized = float(value)
        except (TypeError, ValueError):
            errors.append(f"{option_key} must be a float between 0 and 1 when provided.")
            return
        if normalized < 0 or normalized > 1:
            errors.append(f"{option_key} must be a float between 0 and 1 when provided.")

    def _validate_optional_boolean_like(
        self,
        options: Mapping[str, Any],
        errors: list[str],
        *,
        option_key: str,
        aliases: tuple[str, ...] = (),
    ) -> None:
        value = _lookup_from_mapping(options, option_key, *aliases)
        if value is _MISSING or value is None:
            return
        try:
            self._resolve_bool(options=options, context={}, key=option_key, aliases=aliases)
        except ValueError:
            errors.append(f"{option_key} must be boolean-like when provided.")

    def _validate_optional_string_list(
        self,
        options: Mapping[str, Any],
        errors: list[str],
        *,
        option_key: str,
        aliases: tuple[str, ...] = (),
    ) -> None:
        value = _lookup_from_mapping(options, option_key, *aliases)
        if value is _MISSING or value is None:
            return
        if isinstance(value, str):
            if not value.strip():
                errors.append(f"{option_key} must not be blank when provided as a string.")
            return
        if not isinstance(value, list):
            errors.append(f"{option_key} must be a list of strings when provided.")
            return
        for item in value:
            if not isinstance(item, str) or not item.strip():
                errors.append(f"{option_key} must contain only non-empty strings.")
                return

    def _validate_regex_list(
        self,
        options: Mapping[str, Any],
        errors: list[str],
        *,
        option_key: str,
    ) -> None:
        value = _lookup_from_mapping(options, option_key)
        if value is _MISSING or value is None:
            return
        if not isinstance(value, list):
            errors.append(f"{option_key} must be a list of regex strings when provided.")
            return
        for item in value:
            if not isinstance(item, str) or not item.strip():
                errors.append(f"{option_key} must contain only non-empty regex strings.")
                return
            try:
                re.compile(item)
            except re.error:
                errors.append(f"{option_key} contains invalid regex {item!r}.")
                return


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

        runtime = get_discovery_runtime()
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


class UrlValidatorPlugin(ContextTaskPlugin):
    name = "discovery.url_validator"
    description = "Validate candidate URLs through a pluggable adapter and RSS heuristics."
    category = "discovery"

    async def execute(
        self,
        options: dict[str, Any],
        context: dict[str, Any],
    ) -> dict[str, Any]:
        urls_field = self._resolve_optional_string(
            options=options,
            context=context,
            key="urls_field",
            aliases=("urlsField",),
        ) or "search_results"
        explicit_urls = self._resolve_string_list(
            options=options,
            context=context,
            key="urls",
            default=[],
        )
        limit = self._resolve_positive_int(
            options=options,
            context=context,
            key="limit",
            default=50,
        )
        require_https = self._resolve_bool(
            options=options,
            context=context,
            key="require_https",
            aliases=("requireHttps",),
            default=False,
        )
        allow_patterns = [
            re.compile(pattern)
            for pattern in self._resolve_string_list(
                options=options,
                context=context,
                key="allow_patterns",
                aliases=("allowPatterns",),
                default=[],
            )
        ]
        deny_patterns = [
            re.compile(pattern)
            for pattern in self._resolve_string_list(
                options=options,
                context=context,
                key="deny_patterns",
                aliases=("denyPatterns",),
                default=[],
            )
        ]

        candidate_urls = explicit_urls
        if not candidate_urls:
            candidate_urls = _extract_url_candidates(context.get(urls_field))

        filtered_urls: list[str] = []
        for url in _unique_preserving_order(candidate_urls):
            if not _is_http_url(url):
                continue
            if require_https and not url.startswith("https://"):
                continue
            if allow_patterns and not any(pattern.search(url) for pattern in allow_patterns):
                continue
            if any(pattern.search(url) for pattern in deny_patterns):
                continue
            filtered_urls.append(url)
            if len(filtered_urls) >= limit:
                break

        runtime = get_discovery_runtime()
        raw_results = await resolve_runtime_call(
            runtime.url_validator.validate_urls(urls=filtered_urls)
        )
        results = _coerce_mapping_list(raw_results, field_name="validated_urls")

        normalized_results: list[dict[str, Any]] = []
        for item in results:
            url = next(
                (
                    str(candidate).strip()
                    for candidate in (
                        item.get("url"),
                        item.get("final_url"),
                        item.get("finalUrl"),
                    )
                    if isinstance(candidate, str) and candidate.strip()
                ),
                None,
            )
            if url is None:
                continue

            content_type = (
                str(item.get("content_type"))
                if isinstance(item.get("content_type"), str)
                else str(item.get("contentType"))
                if isinstance(item.get("contentType"), str)
                else None
            )
            status = item.get("status")
            normalized_results.append(
                {
                    "url": url,
                    "status": int(status) if isinstance(status, (int, float)) else status,
                    "content_type": content_type,
                    "final_url": (
                        str(item.get("final_url"))
                        if isinstance(item.get("final_url"), str)
                        else str(item.get("finalUrl"))
                        if isinstance(item.get("finalUrl"), str)
                        else url
                    ),
                    "is_rss_candidate": bool(item.get("is_rss_candidate"))
                    or _looks_like_rss_candidate(url, content_type),
                    "is_website_candidate": bool(item.get("is_website_candidate"))
                    or ("text/html" in (content_type or "").lower()),
                    "source_type_hint": (
                        str(item.get("source_type_hint")).strip()
                        if isinstance(item.get("source_type_hint"), str)
                        and str(item.get("source_type_hint")).strip()
                        else "rss"
                        if bool(item.get("is_rss_candidate")) or _looks_like_rss_candidate(url, content_type)
                        else "website"
                        if "text/html" in (content_type or "").lower()
                        else "unknown"
                    ),
                }
            )

        return {"validated_urls": normalized_results}

    def validate_options(self, options: dict[str, Any]) -> list[str]:
        errors: list[str] = []
        self._validate_optional_non_empty_string(
            options,
            errors,
            option_key="urls_field",
            aliases=("urlsField",),
        )
        self._validate_optional_string_list(options, errors, option_key="urls")
        self._validate_optional_positive_int(options, errors, option_key="limit")
        self._validate_optional_boolean_like(
            options,
            errors,
            option_key="require_https",
            aliases=("requireHttps",),
        )
        self._validate_regex_list(options, errors, option_key="allow_patterns")
        self._validate_regex_list(options, errors, option_key="deny_patterns")
        return errors

    def describe_inputs(self) -> dict[str, str]:
        return {
            "urls": "Explicit list of URLs to validate.",
            "urls_field": "Context field containing URLs or objects with URL fields.",
            "allow_patterns": "Optional regex allowlist applied before validation.",
            "deny_patterns": "Optional regex denylist applied before validation.",
            "require_https": "Whether to keep only HTTPS URLs.",
        }

    def describe_outputs(self) -> dict[str, str]:
        return {
            "validated_urls": "Normalized validation results with status, content type, RSS candidacy, website candidacy and source type hints.",
        }


class RssProbePlugin(ContextTaskPlugin):
    name = "discovery.rss_probe"
    description = "Probe candidate URLs as RSS or Atom feeds."
    category = "discovery"

    async def execute(
        self,
        options: dict[str, Any],
        context: dict[str, Any],
    ) -> dict[str, Any]:
        urls_field = self._resolve_optional_string(
            options=options,
            context=context,
            key="urls_field",
            aliases=("urlsField",),
        ) or "validated_urls"
        sample_count = self._resolve_positive_int(
            options=options,
            context=context,
            key="sample_count",
            aliases=("sampleCount",),
            default=3,
        )
        only_rss_candidates = self._resolve_bool(
            options=options,
            context=context,
            key="only_rss_candidates",
            aliases=("onlyRssCandidates",),
            default=True,
        )

        explicit_urls = self._resolve_string_list(
            options=options,
            context=context,
            key="urls",
            default=[],
        )
        candidate_value = explicit_urls or context.get(urls_field)
        candidate_rows = _coerce_mapping_list(candidate_value, field_name=urls_field) if isinstance(candidate_value, list) and candidate_value and isinstance(candidate_value[0], Mapping) else []

        urls = explicit_urls
        if not urls:
            if candidate_rows:
                urls = [
                    row["url"]
                    for row in candidate_rows
                    if isinstance(row.get("url"), str)
                    and row["url"].strip()
                    and (not only_rss_candidates or bool(row.get("is_rss_candidate")))
                ]
            else:
                urls = _extract_url_candidates(candidate_value)

        runtime = get_discovery_runtime()
        raw_results = await resolve_runtime_call(
            runtime.rss_probe.probe_feeds(
                urls=_unique_preserving_order(urls),
                sample_count=sample_count,
            )
        )
        results = _coerce_mapping_list(raw_results, field_name="probed_feeds")

        normalized_results: list[dict[str, Any]] = []
        for item in results:
            normalized_results.append(
                {
                    "url": str(item.get("url") or item.get("feed_url") or ""),
                    "is_valid_rss": bool(item.get("is_valid_rss", item.get("isValidRss"))),
                    "feed_title": str(item.get("feed_title") or item.get("feedTitle") or ""),
                    "sample_entries": _coerce_mapping_list(
                        item.get("sample_entries") or item.get("sampleEntries") or [],
                        field_name="sample_entries",
                    ),
                }
            )

        return {"probed_feeds": normalized_results}

    def validate_options(self, options: dict[str, Any]) -> list[str]:
        errors: list[str] = []
        self._validate_optional_non_empty_string(
            options,
            errors,
            option_key="urls_field",
            aliases=("urlsField",),
        )
        self._validate_optional_positive_int(
            options,
            errors,
            option_key="sample_count",
            aliases=("sampleCount",),
        )
        self._validate_optional_boolean_like(
            options,
            errors,
            option_key="only_rss_candidates",
            aliases=("onlyRssCandidates",),
        )
        self._validate_optional_string_list(options, errors, option_key="urls")
        return errors

    def describe_inputs(self) -> dict[str, str]:
        return {
            "urls": "Explicit list of feed URLs to probe.",
            "urls_field": "Context field holding validated URLs.",
            "sample_count": "Maximum number of sample entries to extract from each feed.",
            "only_rss_candidates": "Whether to keep only URLs already marked as RSS candidates.",
        }

    def describe_outputs(self) -> dict[str, str]:
        return {
            "probed_feeds": "RSS probe results with feed validity and sample entries.",
        }


class WebsiteProbePlugin(ContextTaskPlugin):
    name = "discovery.website_probe"
    description = "Probe candidate URLs as HTML websites and surface generic capability, feed, listing, detail, and document signals."
    category = "discovery"

    async def execute(
        self,
        options: dict[str, Any],
        context: dict[str, Any],
    ) -> dict[str, Any]:
        urls_field = self._resolve_optional_string(
            options=options,
            context=context,
            key="urls_field",
            aliases=("urlsField",),
        ) or "validated_urls"
        sample_count = self._resolve_positive_int(
            options=options,
            context=context,
            key="sample_count",
            aliases=("sampleCount",),
            default=5,
        )
        explicit_urls = self._resolve_string_list(
            options=options,
            context=context,
            key="urls",
            default=[],
        )
        candidate_value = explicit_urls or context.get(urls_field)
        candidate_rows = (
            _coerce_mapping_list(candidate_value, field_name=urls_field)
            if isinstance(candidate_value, list)
            and candidate_value
            and isinstance(candidate_value[0], Mapping)
            else []
        )

        urls = explicit_urls
        if not urls:
            if candidate_rows:
                urls = [
                    row["url"]
                    for row in candidate_rows
                    if isinstance(row.get("url"), str)
                    and row["url"].strip()
                    and (
                        bool(row.get("is_website_candidate"))
                        or str(row.get("source_type_hint") or "").strip() == "website"
                    )
                ]
            else:
                urls = _extract_url_candidates(candidate_value)

        runtime = get_discovery_runtime()
        raw_results = await resolve_runtime_call(
            runtime.website_probe.probe_websites(
                urls=_unique_preserving_order(urls),
                sample_count=sample_count,
            )
        )
        results = _coerce_mapping_list(raw_results, field_name="probed_websites")
        normalized_results: list[dict[str, Any]] = []
        for item in results:
            normalized_results.append(
                {
                    "url": str(item.get("url") or item.get("final_url") or ""),
                    "final_url": str(item.get("final_url") or item.get("url") or ""),
                    "title": str(item.get("title") or ""),
                    "classification": self._resolve_json_object(
                        options={"classification": item.get("classification") or {}},
                        context={},
                        key="classification",
                        default={},
                    ),
                    "capabilities": self._resolve_json_object(
                        options={"capabilities": item.get("capabilities") or {}},
                        context={},
                        key="capabilities",
                        default={},
                    ),
                    "discovered_feed_urls": self._resolve_string_list(
                        options={"discovered_feed_urls": item.get("discovered_feed_urls") or item.get("hidden_rss_urls") or []},
                        context={},
                        key="discovered_feed_urls",
                        default=[],
                    ),
                    "listing_urls": self._resolve_string_list(
                        options={"listing_urls": item.get("listing_urls") or item.get("category_urls") or []},
                        context={},
                        key="listing_urls",
                        default=[],
                    ),
                    "document_urls": self._resolve_string_list(
                        options={"document_urls": item.get("document_urls") or []},
                        context={},
                        key="document_urls",
                        default=[],
                    ),
                    "detail_count_estimate": int(item.get("detail_count_estimate") or item.get("article_count_estimate") or 0),
                    "listing_count_estimate": int(item.get("listing_count_estimate") or 0),
                    "document_count_estimate": int(item.get("document_count_estimate") or 0),
                    "sample_resources": _coerce_mapping_list(
                        item.get("sample_resources") or [],
                        field_name="sample_resources",
                    ),
                    "is_news_site": bool(item.get("is_news_site")),
                    "has_hidden_rss": bool(item.get("has_hidden_rss")),
                    "hidden_rss_urls": self._resolve_string_list(
                        options={"hidden_rss_urls": item.get("hidden_rss_urls") or []},
                        context={},
                        key="hidden_rss_urls",
                        default=[],
                    ),
                    "article_count_estimate": int(item.get("article_count_estimate") or 0),
                    "freshness": str(item.get("freshness") or "unknown"),
                    "date_patterns_found": bool(item.get("date_patterns_found")),
                    "category_urls": self._resolve_string_list(
                        options={"category_urls": item.get("category_urls") or []},
                        context={},
                        key="category_urls",
                        default=[],
                    ),
                    "sample_articles": _coerce_mapping_list(
                        item.get("sample_articles") or [],
                        field_name="sample_articles",
                    ),
                    "browser_assisted_recommended": bool(
                        item.get("browser_assisted_recommended")
                    ),
                    "challenge_kind": (
                        str(item.get("challenge_kind") or "").strip() or None
                    ),
                }
            )
        return {"probed_websites": normalized_results}

    def validate_options(self, options: dict[str, Any]) -> list[str]:
        errors: list[str] = []
        self._validate_optional_non_empty_string(
            options,
            errors,
            option_key="urls_field",
            aliases=("urlsField",),
        )
        self._validate_optional_positive_int(
            options,
            errors,
            option_key="sample_count",
            aliases=("sampleCount",),
        )
        self._validate_optional_string_list(options, errors, option_key="urls")
        return errors

    def describe_inputs(self) -> dict[str, str]:
        return {
            "urls": "Explicit list of website URLs to probe.",
            "urls_field": "Context field holding validated URL rows.",
            "sample_count": "Maximum number of sample resource links to keep per site.",
        }

    def describe_outputs(self) -> dict[str, str]:
        return {
            "probed_websites": "Website probe results with generic classification, capability signals, discovered feeds, compatibility hints, and browser-assistance recommendation metadata.",
        }


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

        runtime = get_discovery_runtime()
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


class RelevanceScorerPlugin(ContextTaskPlugin):
    name = "discovery.relevance_scorer"
    description = "Deterministically score candidate sources against target topics."
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
        )
        threshold = self._resolve_probability(
            options=options,
            context=context,
            key="threshold",
            default=0.35,
        )
        max_sources = self._resolve_positive_int(
            options=options,
            context=context,
            key="max_sources",
            aliases=("maxSources",),
            default=100,
        )

        target_topics = self._resolve_string_list(
            options=options,
            context=context,
            key="target_topics",
            aliases=("targetTopics",),
            default=[],
        )
        if not target_topics:
            topics_field = self._resolve_optional_string(
                options=options,
                context=context,
                key="target_topics_field",
                aliases=("targetTopicsField",),
            )
            if topics_field:
                target_topics = self._resolve_string_list(
                    options={},
                    context=context,
                    key=topics_field,
                )
        if not target_topics:
            search_query = self._resolve_optional_string(
                options=options,
                context=context,
                key="search_query",
                aliases=("searchQuery",),
            ) or (
                str(context.get("search_query")).strip()
                if isinstance(context.get("search_query"), str)
                else ""
            )
            if search_query:
                target_topics = [search_query]

        source_candidates = context.get(sources_field) if sources_field else (
            context.get("sampled_content")
            or context.get("probed_feeds")
            or context.get("validated_urls")
            or context.get("search_results")
            or []
        )
        sources = _coerce_mapping_list(source_candidates, field_name="sources")

        target_tokens = set(_tokenize(target_topics))
        scored_sources: list[dict[str, Any]] = []

        for source in sources[:max_sources]:
            source_url = next(
                (
                    str(candidate).strip()
                    for candidate in (
                        source.get("source_url"),
                        source.get("url"),
                        source.get("final_url"),
                    )
                    if isinstance(candidate, str) and candidate.strip()
                ),
                None,
            )
            if source_url is None:
                continue

            source_tokens = set(_tokenize(source))
            matched_terms = sorted(target_tokens.intersection(source_tokens))
            score = round(
                len(matched_terms) / len(target_tokens),
                4,
            ) if target_tokens else 0.0
            scored_sources.append(
                {
                    "source_url": source_url,
                    "relevance_score": score,
                    "passes_threshold": score >= threshold,
                    "matched_terms": matched_terms,
                }
            )

        return {"scored_sources": scored_sources}

    def validate_options(self, options: dict[str, Any]) -> list[str]:
        errors: list[str] = []
        self._validate_optional_non_empty_string(
            options,
            errors,
            option_key="sources_field",
            aliases=("sourcesField",),
        )
        self._validate_optional_probability(options, errors, option_key="threshold")
        self._validate_optional_positive_int(
            options,
            errors,
            option_key="max_sources",
            aliases=("maxSources",),
        )
        self._validate_optional_string_list(
            options,
            errors,
            option_key="target_topics",
            aliases=("targetTopics",),
        )
        self._validate_optional_non_empty_string(
            options,
            errors,
            option_key="target_topics_field",
            aliases=("targetTopicsField",),
        )
        return errors

    def describe_inputs(self) -> dict[str, str]:
        return {
            "sources_field": "Context field containing discovery source candidates.",
            "target_topics": "Explicit target topics or keywords.",
            "target_topics_field": "Context field containing the target topic list.",
            "threshold": "Score threshold used to mark passing sources.",
        }

    def describe_outputs(self) -> dict[str, str]:
        return {
            "scored_sources": "Candidate sources with deterministic relevance scores and threshold decisions.",
        }


class LlmAnalyzerPlugin(ContextTaskPlugin):
    name = "discovery.llm_analyzer"
    description = "Run a pluggable LLM analysis step over discovery or enrichment payloads."
    category = "discovery"

    async def execute(
        self,
        options: dict[str, Any],
        context: dict[str, Any],
    ) -> dict[str, Any]:
        output_field = self._resolve_optional_string(
            options=options,
            context=context,
            key="output_field",
            aliases=("outputField",),
        ) or "llm_analysis"
        meta_output_field = self._resolve_optional_string(
            options=options,
            context=context,
            key="meta_output_field",
            aliases=("metaOutputField",),
        ) or f"{output_field}_meta"
        prompt = self._resolve_optional_string(
            options=options,
            context=context,
            key="prompt",
        )
        if prompt is None:
            prompt_field = self._resolve_optional_string(
                options=options,
                context=context,
                key="prompt_field",
                aliases=("promptField",),
            )
            if prompt_field is not None:
                prompt = self._resolve_required_string(
                    options={},
                    context=context,
                    key=prompt_field,
                )

        task = self._resolve_optional_string(
            options=options,
            context=context,
            key="task",
        )
        payload_field = self._resolve_optional_string(
            options=options,
            context=context,
            key="payload_field",
            aliases=("payloadField",),
        )
        payload = (
            context.get(payload_field)
            if payload_field
            else options.get("payload", _non_reserved_context(context))
        )
        model = self._resolve_optional_string(
            options=options,
            context=context,
            key="model",
        )
        temperature = self._resolve_probability(
            options=options,
            context=context,
            key="temperature",
            default=0.0,
        )
        output_schema = self._resolve_json_object(
            options=options,
            context=context,
            key="output_schema",
            aliases=("outputSchema",),
            default=None,
        ) or None

        runtime = get_discovery_runtime()
        raw_result = await resolve_runtime_call(
            runtime.llm_analyzer.analyze(
                prompt=prompt,
                task=task,
                payload=payload,
                model=model,
                temperature=temperature,
                output_schema=output_schema,
            )
        )
        result, result_meta = unwrap_llm_analyzer_output(raw_result)
        return {
            output_field: result,
            meta_output_field: result_meta,
        }

    def validate_options(self, options: dict[str, Any]) -> list[str]:
        errors: list[str] = []
        self._validate_optional_non_empty_string(
            options,
            errors,
            option_key="output_field",
            aliases=("outputField",),
        )
        self._validate_optional_non_empty_string(
            options,
            errors,
            option_key="meta_output_field",
            aliases=("metaOutputField",),
        )
        self._validate_optional_non_empty_string(options, errors, option_key="prompt")
        self._validate_optional_non_empty_string(
            options,
            errors,
            option_key="prompt_field",
            aliases=("promptField",),
        )
        self._validate_optional_non_empty_string(options, errors, option_key="task")
        self._validate_optional_non_empty_string(
            options,
            errors,
            option_key="payload_field",
            aliases=("payloadField",),
        )
        self._validate_optional_non_empty_string(options, errors, option_key="model")
        self._validate_optional_probability(options, errors, option_key="temperature")

        prompt = _lookup_from_mapping(options, "prompt")
        prompt_field = _lookup_from_mapping(options, "prompt_field", "promptField")
        task = _lookup_from_mapping(options, "task")
        if (
            (prompt is _MISSING or prompt is None)
            and (prompt_field is _MISSING or prompt_field is None)
            and (task is _MISSING or task is None)
        ):
            errors.append("At least one of prompt, prompt_field or task must be provided.")
        return errors

    def describe_inputs(self) -> dict[str, str]:
        return {
            "prompt": "Direct prompt string for the analyzer.",
            "prompt_field": "Context field containing the prompt.",
            "task": "Short task label understood by the adapter.",
            "payload_field": "Context field containing the payload to analyze.",
            "output_field": "Context field name to receive the analysis output.",
            "meta_output_field": "Context field name to receive provider/cost metadata.",
        }

    def describe_outputs(self) -> dict[str, str]:
        return {
            "llm_analysis": "LLM-produced analysis or structured output.",
            "llm_analysis_meta": "Provider/model/usage/cost metadata for the analysis step.",
        }


class SourceRegistrarPlugin(ContextTaskPlugin):
    name = "discovery.source_registrar"
    description = "Register discovered sources through a pluggable DB/outbox adapter."
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
        ) or "scored_sources"
        minimum_score = self._resolve_probability(
            options=options,
            context=context,
            key="minimum_score",
            aliases=("minimumScore",),
            default=0.0,
        )
        enabled = self._resolve_bool(
            options=options,
            context=context,
            key="enabled",
            default=False,
        )
        dry_run = self._resolve_bool(
            options=options,
            context=context,
            key="dry_run",
            aliases=("dryRun",),
            default=False,
        )
        created_by = self._resolve_optional_string(
            options=options,
            context=context,
            key="created_by",
            aliases=("createdBy",),
        )
        tags = self._resolve_string_list(
            options=options,
            context=context,
            key="tags",
            default=[],
        )
        provider_type = self._resolve_optional_string(
            options=options,
            context=context,
            key="provider_type",
            aliases=("providerType",),
        ) or "website"
        if provider_type not in _VALID_DISCOVERY_PROVIDER_TYPES:
            raise ValueError(
                f"{self.name} expected provider_type to be one of {sorted(_VALID_DISCOVERY_PROVIDER_TYPES)}."
            )

        sources = _coerce_mapping_list(context.get(sources_field) or [], field_name=sources_field)
        selected_sources = [
            dict(source)
            for source in sources
            if float(source.get("relevance_score", 0) or 0) >= minimum_score
            and (
                source.get("passes_threshold") is None
                or bool(source.get("passes_threshold"))
            )
        ]

        runtime = get_discovery_runtime()
        raw_results = await resolve_runtime_call(
            runtime.source_registrar.register_sources(
                sources=selected_sources,
                enabled=enabled,
                dry_run=dry_run,
                created_by=created_by,
                tags=tags,
                provider_type=provider_type,
            )
        )
        registered = _coerce_mapping_list(raw_results, field_name="registered_channels")
        return {"registered_channels": registered}

    def validate_options(self, options: dict[str, Any]) -> list[str]:
        errors: list[str] = []
        self._validate_optional_non_empty_string(
            options,
            errors,
            option_key="sources_field",
            aliases=("sourcesField",),
        )
        self._validate_optional_probability(
            options,
            errors,
            option_key="minimum_score",
            aliases=("minimumScore",),
        )
        self._validate_optional_boolean_like(options, errors, option_key="enabled")
        self._validate_optional_boolean_like(
            options,
            errors,
            option_key="dry_run",
            aliases=("dryRun",),
        )
        self._validate_optional_non_empty_string(
            options,
            errors,
            option_key="created_by",
            aliases=("createdBy",),
        )
        provider_type = _lookup_from_mapping(options, "provider_type", "providerType")
        if (
            provider_type is not _MISSING
            and provider_type is not None
            and provider_type not in _VALID_DISCOVERY_PROVIDER_TYPES
        ):
            errors.append(
                f"provider_type must be one of {sorted(_VALID_DISCOVERY_PROVIDER_TYPES)} when provided."
            )
        self._validate_optional_string_list(options, errors, option_key="tags")
        return errors

    def describe_inputs(self) -> dict[str, str]:
        return {
            "sources_field": "Context field containing scored sources.",
            "minimum_score": "Minimum relevance score required for registration.",
            "enabled": "Whether newly registered channels should start enabled.",
            "dry_run": "Whether the registrar should skip durable writes.",
            "provider_type": "Provider type to register for the selected sources: rss, website, api, email_imap, or youtube.",
        }

    def describe_outputs(self) -> dict[str, str]:
        return {
            "registered_channels": "Channels created or proposed by the registrar adapter.",
        }


class DbStorePlugin(ContextTaskPlugin):
    name = "utility.db_store"
    description = "Persist part of the sequence context through a pluggable storage adapter."
    category = "utility"

    async def execute(
        self,
        options: dict[str, Any],
        context: dict[str, Any],
    ) -> dict[str, Any]:
        payload_field = self._resolve_optional_string(
            options=options,
            context=context,
            key="payload_field",
            aliases=("payloadField",),
        )
        record_key = self._resolve_optional_string(
            options=options,
            context=context,
            key="record_key",
            aliases=("recordKey",),
        )
        if record_key is None:
            record_key_field = self._resolve_optional_string(
                options=options,
                context=context,
                key="record_key_field",
                aliases=("recordKeyField",),
            )
            if record_key_field is not None:
                record_key = self._resolve_required_string(
                    options={},
                    context=context,
                    key=record_key_field,
                )
        record_key = record_key or str(context.get("_run_id"))
        namespace = self._resolve_optional_string(
            options=options,
            context=context,
            key="namespace",
        )
        payload = options.get("payload", context.get(payload_field) if payload_field else _non_reserved_context(context))

        runtime = get_discovery_runtime()
        receipt = await resolve_runtime_call(
            runtime.db_store.store(
                record_key=record_key,
                payload=payload,
                namespace=namespace,
            )
        )
        return {
            "stored": True,
            "store_receipt": receipt,
            "stored_record_key": record_key,
        }

    def validate_options(self, options: dict[str, Any]) -> list[str]:
        errors: list[str] = []
        self._validate_optional_non_empty_string(
            options,
            errors,
            option_key="payload_field",
            aliases=("payloadField",),
        )
        self._validate_optional_non_empty_string(
            options,
            errors,
            option_key="record_key",
            aliases=("recordKey",),
        )
        self._validate_optional_non_empty_string(
            options,
            errors,
            option_key="record_key_field",
            aliases=("recordKeyField",),
        )
        self._validate_optional_non_empty_string(options, errors, option_key="namespace")
        return errors

    def describe_inputs(self) -> dict[str, str]:
        return {
            "payload_field": "Context field containing the payload to store.",
            "record_key": "Stable storage key for the persisted record.",
            "record_key_field": "Context field containing the storage key.",
            "namespace": "Optional storage namespace.",
        }

    def describe_outputs(self) -> dict[str, str]:
        return {
            "stored": "Whether the storage adapter acknowledged the write.",
            "store_receipt": "Adapter-specific storage receipt.",
            "stored_record_key": "Record key used for the store operation.",
        }


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

        runtime = get_discovery_runtime()
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

        runtime = get_discovery_runtime()
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

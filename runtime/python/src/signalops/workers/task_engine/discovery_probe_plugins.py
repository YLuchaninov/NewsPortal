from __future__ import annotations

import re
from typing import Any, Mapping

from .discovery_plugin_common import (
    ContextTaskPlugin,
    _coerce_mapping_list,
    _extract_url_candidates,
    _is_http_url,
    _looks_like_rss_candidate,
    _unique_preserving_order,
)
from . import discovery_runtime as _discovery_runtime
from .discovery_runtime import resolve_runtime_call


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

        runtime = _discovery_runtime.get_discovery_runtime()
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

        runtime = _discovery_runtime.get_discovery_runtime()
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
                    "feed_url": str(item.get("feed_url") or item.get("final_url") or item.get("url") or ""),
                    "final_url": str(item.get("final_url") or item.get("feed_url") or item.get("url") or ""),
                    "is_valid_rss": bool(item.get("is_valid_rss", item.get("isValidRss"))),
                    "feed_title": str(item.get("feed_title") or item.get("feedTitle") or ""),
                    "sample_entries": _coerce_mapping_list(
                        item.get("sample_entries") or item.get("sampleEntries") or [],
                        field_name="sample_entries",
                    ),
                    "discovered_feed_urls": self._resolve_string_list(
                        options={
                            "discovered_feed_urls": item.get("discovered_feed_urls")
                            or item.get("hidden_rss_urls")
                            or []
                        },
                        context={},
                        key="discovered_feed_urls",
                        default=[],
                    ),
                    "error_text": str(item.get("error_text") or item.get("errorText") or "").strip() or None,
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

        runtime = _discovery_runtime.get_discovery_runtime()
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
                    "detail_count_estimate": int(item.get("detail_count_estimate") or item.get("signal_candidate_count_estimate") or 0),
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
                    "signal_candidate_count_estimate": int(item.get("signal_candidate_count_estimate") or 0),
                    "freshness": str(item.get("freshness") or "unknown"),
                    "date_patterns_found": bool(item.get("date_patterns_found")),
                    "category_urls": self._resolve_string_list(
                        options={"category_urls": item.get("category_urls") or []},
                        context={},
                        key="category_urls",
                        default=[],
                    ),
                    "sample_signal_candidates": _coerce_mapping_list(
                        item.get("sample_signal_candidates") or [],
                        field_name="sample_signal_candidates",
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

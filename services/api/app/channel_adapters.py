from __future__ import annotations

from typing import Any
from urllib.parse import urlparse


def infer_feed_ingress_adapter_strategy(fetch_url: str | None) -> str:
    if not fetch_url:
        return "generic"

    try:
        parsed = urlparse(fetch_url)
    except ValueError:
        return "generic"

    hostname = (parsed.hostname or "").lower()
    pathname = (parsed.path or "").lower()

    if hostname.endswith("reddit.com") and "search.rss" in pathname:
        return "reddit_search_rss"
    if hostname == "hnrss.org":
        return "hn_comments_feed"
    if hostname == "news.google.com" and pathname.startswith("/rss/"):
        return "google_news_rss"
    return "generic"


def default_max_entry_age_hours_for_adapter(strategy: str) -> int | None:
    if strategy in {"reddit_search_rss", "hn_comments_feed", "google_news_rss"}:
        return 168
    return None


def resolve_feed_ingress_adapter_strategy(fetch_url: str | None, config_json: Any) -> str:
    explicit_strategy = None
    if isinstance(config_json, dict):
        candidate = config_json.get("adapterStrategy")
        if isinstance(candidate, str) and candidate.strip():
            explicit_strategy = candidate.strip()

    return explicit_strategy or infer_feed_ingress_adapter_strategy(fetch_url)


def resolve_feed_ingress_max_entry_age_hours(fetch_url: str | None, config_json: Any) -> int | None:
    if isinstance(config_json, dict):
        candidate = config_json.get("maxEntryAgeHours")
        if isinstance(candidate, int) and candidate > 0:
            return candidate

    return default_max_entry_age_hours_for_adapter(
        resolve_feed_ingress_adapter_strategy(fetch_url, config_json)
    )


def _has_legacy_api_adapter_hint(config_json: Any) -> bool:
    if not isinstance(config_json, dict):
        return False
    for path in (
        ("api", "adapterKey"),
        ("adapter", "adapterKey"),
        ("adapterKey",),
    ):
        current: Any = config_json
        for part in path:
            if not isinstance(current, dict):
                current = None
                break
            current = current.get(part)
        if isinstance(current, str) and current.strip():
            return True
    return False


def _has_legacy_rss_adapter_hint(fetch_url: str | None, config_json: Any) -> bool:
    if isinstance(config_json, dict) and isinstance(config_json.get("adapterStrategy"), str):
        return True
    return infer_feed_ingress_adapter_strategy(fetch_url) != "generic"


def _resolve_adapter_resolution_source(channel: dict[str, Any]) -> str:
    binding_key = channel.get("adapter_binding_key")
    binding_valid = (
        bool(binding_key)
        and channel.get("adapter_binding_enabled") is True
        and channel.get("adapter_binding_status") == "active"
    )
    if binding_valid:
        return "binding"
    return "provider_default"


def with_resolved_channel_adapter_fields(channel: dict[str, Any]) -> dict[str, Any]:
    adapter_key = channel.get("adapter_binding_key")
    if adapter_key:
        channel["adapter_binding"] = {
            "adapterKey": adapter_key,
            "title": channel.get("adapter_binding_title"),
            "runtimeKind": channel.get("adapter_binding_runtime_kind"),
            "outputMode": channel.get("adapter_binding_output_mode"),
            "status": channel.get("adapter_binding_status"),
            "selectionMode": channel.get("adapter_binding_selection_mode"),
            "enabled": channel.get("adapter_binding_enabled"),
            "config": channel.get("adapter_binding_config_json") or {},
        }
    else:
        channel["adapter_binding"] = None
    adapter_key = str(channel.get("adapter_binding_key") or "")
    binding_strategy_by_key = {
        "rss.generic": "generic",
        "rss.reddit_search_rss": "reddit_search_rss",
        "rss.hn_comments_feed": "hn_comments_feed",
        "rss.google_news_rss": "google_news_rss",
    }
    channel["resolved_adapter_strategy"] = binding_strategy_by_key.get(
        adapter_key,
        "generic",
    )
    binding_config = channel.get("adapter_binding_config_json")
    configured_max_age = (
        binding_config.get("maxEntryAgeHours")
        if isinstance(binding_config, dict)
        else None
    )
    channel["resolved_max_entry_age_hours"] = (
        configured_max_age
        if isinstance(configured_max_age, int) and configured_max_age > 0
        else default_max_entry_age_hours_for_adapter(channel["resolved_adapter_strategy"])
    )
    resolution_source = _resolve_adapter_resolution_source(channel)
    channel["adapter_resolution_source"] = resolution_source
    channel["adapter_resolution_warning"] = (
        "Channel has no valid enabled binding; runtime will use the provider default adapter."
        if resolution_source == "provider_default"
        else None
    )
    channel["legacy_adapter_diagnostics"] = {
        "hasLegacyRssAdapterHint": _has_legacy_rss_adapter_hint(
            str(channel.get("fetch_url") or ""),
            channel.get("config_json"),
        ),
        "hasLegacyApiAdapterHint": _has_legacy_api_adapter_hint(channel.get("config_json")),
        "ignoredForRuntimeSelection": True,
    }
    return channel

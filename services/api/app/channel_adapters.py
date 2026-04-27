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


def with_resolved_channel_adapter_fields(channel: dict[str, Any]) -> dict[str, Any]:
    channel["resolved_adapter_strategy"] = resolve_feed_ingress_adapter_strategy(
        str(channel.get("fetch_url") or ""),
        channel.get("config_json"),
    )
    channel["resolved_max_entry_age_hours"] = resolve_feed_ingress_max_entry_age_hours(
        str(channel.get("fetch_url") or ""),
        channel.get("config_json"),
    )
    return channel

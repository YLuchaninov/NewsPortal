from __future__ import annotations

from typing import Any

from .fetchers_rss_probe import FetchersRssProbeAdapter
from .website_probe import FetchersWebsiteProbeAdapter


class FetchersContentSamplerAdapter:
    def __init__(
        self,
        *,
        rss_probe: Any | None = None,
        website_probe: Any | None = None,
    ) -> None:
        self._rss_probe = rss_probe or FetchersRssProbeAdapter()
        self._website_probe = website_probe or FetchersWebsiteProbeAdapter()

    def sample_content(
        self,
        *,
        source_urls: list[str],
        article_count: int,
        max_chars: int,
    ) -> list[dict[str, Any]]:
        results: list[dict[str, Any]] = []
        for source_url in source_urls:
            articles = self._sample_feed(source_url, article_count, max_chars)
            if not articles:
                articles = self._sample_website(source_url, article_count, max_chars)
            if not articles:
                articles = [
                    {
                        "title": "",
                        "url": source_url,
                        "content": "No feed or website samples were returned by fetchers.",
                    }
                ]
            results.append({"source_url": source_url, "articles": articles[:article_count]})
        return results

    def _sample_feed(
        self,
        source_url: str,
        article_count: int,
        max_chars: int,
    ) -> list[dict[str, str]]:
        try:
            probed = self._rss_probe.probe_feeds(
                urls=[source_url],
                sample_count=article_count,
            )
        except Exception:
            return []

        first_probe = next((item for item in probed if item.get("is_valid_rss")), None)
        sample_entries = first_probe.get("sample_entries") if isinstance(first_probe, dict) else None
        if not isinstance(sample_entries, list):
            return []
        return [
            {
                "title": str(entry.get("title") or ""),
                "url": str(entry.get("link") or entry.get("url") or ""),
                "content": str(
                    entry.get("snippet")
                    or entry.get("content")
                    or entry.get("summary")
                    or entry.get("title")
                    or ""
                )[:max_chars],
            }
            for entry in sample_entries
            if isinstance(entry, dict)
        ][:article_count]

    def _sample_website(
        self,
        source_url: str,
        article_count: int,
        max_chars: int,
    ) -> list[dict[str, str]]:
        try:
            probed = self._website_probe.probe_websites(
                urls=[source_url],
                sample_count=article_count,
            )
        except Exception:
            return []

        first_probe = probed[0] if probed and isinstance(probed[0], dict) else None
        if not first_probe:
            return []
        sample_articles = first_probe.get("sample_articles")
        if isinstance(sample_articles, list) and sample_articles:
            return [
                {
                    "title": str(entry.get("title") or first_probe.get("title") or ""),
                    "url": str(entry.get("url") or first_probe.get("final_url") or source_url),
                    "content": str(entry.get("title") or first_probe.get("title") or "")[:max_chars],
                }
                for entry in sample_articles
                if isinstance(entry, dict)
            ][:article_count]

        sample_resources = first_probe.get("sample_resources")
        if isinstance(sample_resources, list) and sample_resources:
            return [
                {
                    "title": str(entry.get("title") or first_probe.get("title") or ""),
                    "url": str(entry.get("url") or first_probe.get("final_url") or source_url),
                    "content": str(
                        entry.get("title")
                        or " ".join(str(reason) for reason in entry.get("reasons", []) if reason)
                        or first_probe.get("title")
                        or ""
                    )[:max_chars],
                }
                for entry in sample_resources
                if isinstance(entry, dict)
            ][:article_count]

        title = str(first_probe.get("title") or "")
        final_url = str(first_probe.get("final_url") or source_url)
        return [{"title": title, "url": final_url, "content": title[:max_chars]}] if title else []

from __future__ import annotations

from typing import Any


class FeedparserRssProbeAdapter:
    def probe_feeds(self, *, urls: list[str], sample_count: int) -> list[dict[str, Any]]:
        import feedparser
        import httpx

        results: list[dict[str, Any]] = []
        with httpx.Client(
            follow_redirects=True,
            headers={"User-Agent": "NewsPortalDiscovery/0.1"},
            timeout=10.0,
        ) as client:
            for url in urls:
                is_valid_rss = False
                feed_title = ""
                sample_entries: list[dict[str, Any]] = []
                error_text: str | None = None
                final_url = url
                try:
                    response = client.get(url)
                    final_url = str(response.url)
                    parsed = feedparser.parse(response.text)
                    feed_title = str(parsed.feed.get("title") or "")
                    sample_entries = [
                        {
                            "title": str(entry.get("title") or ""),
                            "link": str(entry.get("link") or ""),
                            "snippet": str(
                                entry.get("summary")
                                or entry.get("description")
                                or entry.get("title")
                                or ""
                            ),
                        }
                        for entry in list(parsed.entries or [])[:sample_count]
                    ]
                    is_valid_rss = bool(sample_entries or feed_title)
                except Exception as error:  # pragma: no cover - network dependent
                    error_text = str(error)
                results.append(
                    {
                        "url": url,
                        "feed_url": final_url,
                        "is_valid_rss": is_valid_rss,
                        "feed_title": feed_title,
                        "sample_entries": sample_entries,
                        "error_text": error_text,
                    }
                )
        return results


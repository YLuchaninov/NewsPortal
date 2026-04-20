from __future__ import annotations

from html.parser import HTMLParser
from typing import Any
from urllib.parse import urljoin


class _FeedLinkParser(HTMLParser):
    def __init__(self, *, base_url: str) -> None:
        super().__init__(convert_charrefs=True)
        self._base_url = base_url
        self.feed_urls: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() != "link":
            return
        attr_map = {str(key).lower(): str(value or "") for key, value in attrs}
        rel_tokens = {token.strip().lower() for token in attr_map.get("rel", "").split() if token.strip()}
        content_type = attr_map.get("type", "").lower()
        href = attr_map.get("href", "").strip()
        if not href:
            return
        if "alternate" not in rel_tokens:
            return
        if not any(
            hint in content_type
            for hint in ("application/rss+xml", "application/atom+xml", "application/xml", "text/xml")
        ):
            return
        resolved = urljoin(self._base_url, href)
        if resolved and resolved not in self.feed_urls:
            self.feed_urls.append(resolved)


def _extract_feed_urls_from_html(body: str, *, base_url: str) -> list[str]:
    parser = _FeedLinkParser(base_url=base_url)
    parser.feed(body or "")
    return parser.feed_urls


def _parse_feed_response(feedparser: Any, body: str, *, sample_count: int) -> tuple[bool, str, list[dict[str, Any]]]:
    parsed = feedparser.parse(body)
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
    return bool(sample_entries or feed_title), feed_title, sample_entries


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
                discovered_feed_urls: list[str] = []
                try:
                    response = client.get(url)
                    final_url = str(response.url)
                    is_valid_rss, feed_title, sample_entries = _parse_feed_response(
                        feedparser,
                        response.text,
                        sample_count=sample_count,
                    )
                    if not is_valid_rss:
                        discovered_feed_urls = _extract_feed_urls_from_html(
                            response.text,
                            base_url=final_url,
                        )
                        for feed_candidate_url in discovered_feed_urls:
                            feed_response = client.get(feed_candidate_url)
                            discovered_final_url = str(feed_response.url)
                            discovered_valid, discovered_title, discovered_entries = _parse_feed_response(
                                feedparser,
                                feed_response.text,
                                sample_count=sample_count,
                            )
                            if not discovered_valid:
                                continue
                            is_valid_rss = True
                            feed_title = discovered_title
                            sample_entries = discovered_entries
                            final_url = discovered_final_url
                            break
                except Exception as error:  # pragma: no cover - network dependent
                    error_text = str(error)
                results.append(
                    {
                        "url": url,
                        "feed_url": final_url,
                        "final_url": final_url,
                        "is_valid_rss": is_valid_rss,
                        "feed_title": feed_title,
                        "sample_entries": sample_entries,
                        "discovered_feed_urls": discovered_feed_urls,
                        "error_text": error_text,
                    }
                )
        return results

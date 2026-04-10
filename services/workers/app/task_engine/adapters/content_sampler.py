from __future__ import annotations

from typing import Any


class HttpxContentSamplerAdapter:
    def sample_content(
        self,
        *,
        source_urls: list[str],
        article_count: int,
        max_chars: int,
    ) -> list[dict[str, Any]]:
        import feedparser
        import httpx

        results: list[dict[str, Any]] = []
        with httpx.Client(
            follow_redirects=True,
            headers={"User-Agent": "NewsPortalDiscovery/0.1"},
            timeout=10.0,
        ) as client:
            for source_url in source_urls:
                articles: list[dict[str, Any]] = []
                try:
                    response = client.get(source_url)
                    parsed = feedparser.parse(response.text)
                    if parsed.entries:
                        articles = [
                            {
                                "title": str(entry.get("title") or ""),
                                "url": str(entry.get("link") or ""),
                                "content": str(
                                    entry.get("summary")
                                    or entry.get("description")
                                    or entry.get("title")
                                    or ""
                                )[:max_chars],
                            }
                            for entry in list(parsed.entries or [])[:article_count]
                        ]
                    else:
                        extracted = self._extract_html_content(response.text, max_chars=max_chars)
                        articles = [
                            {
                                "title": extracted.get("title", ""),
                                "url": str(response.url),
                                "content": extracted.get("content", ""),
                            }
                        ]
                except Exception as error:  # pragma: no cover - network dependent
                    articles = [{"title": "", "url": source_url, "content": str(error)[:max_chars]}]
                results.append({"source_url": source_url, "articles": articles[:article_count]})
        return results

    def _extract_html_content(self, html_text: str, *, max_chars: int) -> dict[str, str]:
        try:
            import trafilatura

            extracted = trafilatura.extract(
                html_text,
                include_comments=False,
                include_tables=False,
                include_links=False,
            )
            content = (extracted or "").strip()
        except Exception:  # pragma: no cover - optional dependency / extraction quality
            content = ""

        if not content:
            try:
                from bs4 import BeautifulSoup

                soup = BeautifulSoup(html_text, "html.parser")
                title = (soup.title.string or "").strip() if soup.title and soup.title.string else ""
                content = " ".join(s.strip() for s in soup.stripped_strings)
                return {"title": title, "content": content[:max_chars]}
            except Exception:
                return {"title": "", "content": html_text[:max_chars]}

        return {"title": "", "content": content[:max_chars]}


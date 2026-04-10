from __future__ import annotations

from typing import Any


def _classify_source_type(url: str, content_type: str | None) -> tuple[bool, bool, str]:
    lowered_url = url.lower()
    lowered_type = (content_type or "").lower()
    is_rss = any(
        hint in lowered_type
        for hint in ("application/rss+xml", "application/atom+xml", "xml", "rss", "atom")
    ) or any(hint in lowered_url for hint in ("/feed", "/rss", ".rss", ".xml", "atom"))
    is_website = "text/html" in lowered_type or lowered_url.startswith(("http://", "https://"))
    source_type_hint = "rss" if is_rss and not is_website else "website" if is_website and not is_rss else "unknown"
    if is_rss and is_website:
        source_type_hint = "rss"
    return is_rss, is_website, source_type_hint


class HttpxUrlValidatorAdapter:
    def __init__(self, *, timeout_seconds: float = 10.0) -> None:
        self._timeout_seconds = timeout_seconds

    def validate_urls(self, *, urls: list[str]) -> list[dict[str, Any]]:
        import httpx

        results: list[dict[str, Any]] = []
        with httpx.Client(
            follow_redirects=True,
            headers={"User-Agent": "NewsPortalDiscovery/0.1"},
            timeout=self._timeout_seconds,
        ) as client:
            for url in urls:
                final_url = url
                status: int | None = None
                content_type: str | None = None
                error_text: str | None = None
                try:
                    response = client.get(url)
                    final_url = str(response.url)
                    status = response.status_code
                    content_type = response.headers.get("content-type")
                except Exception as error:  # pragma: no cover - network dependent
                    error_text = str(error)

                is_rss, is_website, source_type_hint = _classify_source_type(
                    final_url,
                    content_type,
                )
                results.append(
                    {
                        "url": url,
                        "status": status,
                        "content_type": content_type,
                        "final_url": final_url,
                        "is_rss_candidate": is_rss,
                        "is_website_candidate": is_website,
                        "source_type_hint": source_type_hint,
                        "error_text": error_text,
                    }
                )
        return results


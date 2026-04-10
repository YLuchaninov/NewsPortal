from __future__ import annotations

import os
from typing import Any, Callable

try:  # pragma: no cover - exercised via injected fake in unit tests
    from ddgs import DDGS as _DDGS
except ImportError:  # pragma: no cover - dependency may be absent in host-only unit runs
    _DDGS = None


_TIME_RANGE_MAP = {
    "day": "d",
    "week": "w",
    "month": "m",
    "year": "y",
}


def unwrap_web_search_output(value: Any) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    if isinstance(value, dict):
        results = value.get("results")
        if isinstance(results, list):
            meta = value.get("meta")
            return results, dict(meta) if isinstance(meta, dict) else {}
    if isinstance(value, list):
        return value, {}
    return [], {}


class StubWebSearchAdapter:
    def search(
        self,
        *,
        query: str,
        count: int,
        result_type: str,
        time_range: str | None,
    ) -> dict[str, Any]:
        del query
        return {
            "results": [],
            "meta": {
                "provider": "stub",
                "backend": "stub",
                "result_type": result_type,
                "time_range": time_range,
                "request_count": 0,
                "returned_count": 0,
                "cost_usd": 0.0,
                "cost_cents": 0,
            },
        }


class DdgsWebSearchAdapter:
    def __init__(
        self,
        *,
        ddgs_cls: Callable[..., Any] | None = None,
        backend: str | None = None,
        region: str | None = None,
        safesearch: str | None = None,
    ) -> None:
        self._ddgs_cls = ddgs_cls if ddgs_cls is not None else _DDGS
        self._backend = backend or os.getenv("DISCOVERY_DDGS_BACKEND", "auto").strip() or "auto"
        self._region = region or os.getenv("DISCOVERY_DDGS_REGION", "us-en").strip() or "us-en"
        self._safesearch = (
            safesearch or os.getenv("DISCOVERY_DDGS_SAFESEARCH", "moderate").strip() or "moderate"
        )

    def search(
        self,
        *,
        query: str,
        count: int,
        result_type: str,
        time_range: str | None,
    ) -> dict[str, Any]:
        if self._ddgs_cls is None:
            raise RuntimeError(
                "ddgs is not installed. Add the Python dependency before enabling "
                "DISCOVERY_SEARCH_PROVIDER=ddgs."
            )

        ddgs_client = self._ddgs_cls()
        timelimit = _TIME_RANGE_MAP.get(time_range or "", None)
        search_fn_name = "news" if result_type == "news" else "text"
        search_fn = getattr(ddgs_client, search_fn_name)
        raw_results = search_fn(
            query=query,
            region=self._region,
            safesearch=self._safesearch,
            timelimit=timelimit,
            max_results=count,
            backend=self._backend,
        )

        normalized_results: list[dict[str, Any]] = []
        for item in raw_results if isinstance(raw_results, list) else []:
            if not isinstance(item, dict):
                continue
            url = str(item.get("url") or item.get("href") or "").strip()
            if not url:
                continue
            normalized_results.append(
                {
                    "url": url,
                    "title": str(item.get("title") or ""),
                    "snippet": str(item.get("body") or item.get("snippet") or ""),
                    "source": str(item.get("source") or ""),
                    "published_at": str(item.get("date") or item.get("published") or ""),
                }
            )

        return {
            "results": normalized_results,
            "meta": {
                "provider": "ddgs",
                "backend": self._backend,
                "region": self._region,
                "safesearch": self._safesearch,
                "result_type": result_type,
                "time_range": time_range,
                "timelimit": timelimit,
                "request_count": 1,
                "returned_count": len(normalized_results),
                "cost_usd": 0.0,
                "cost_cents": 0,
            },
        }


__all__ = [
    "DdgsWebSearchAdapter",
    "StubWebSearchAdapter",
    "unwrap_web_search_output",
]

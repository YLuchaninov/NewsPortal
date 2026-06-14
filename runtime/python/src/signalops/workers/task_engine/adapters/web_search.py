from __future__ import annotations

import json
import os
from typing import Any, Callable
from urllib.parse import urlencode
from urllib.request import Request, urlopen

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


def _default_json_request(
    *,
    method: str,
    url: str,
    headers: dict[str, str] | None = None,
    payload: dict[str, Any] | None = None,
) -> Any:
    body = None
    request_headers = dict(headers or {})
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")
        request_headers.setdefault("content-type", "application/json")
    request = Request(url, data=body, headers=request_headers, method=method.upper())
    with urlopen(request, timeout=20) as response:  # pragma: no cover - exercised via injected fake
        return json.loads(response.read().decode("utf-8"))


def _normalize_common_result(
    *,
    url: str,
    title: Any,
    snippet: Any,
    source: Any,
    published_at: Any,
    provider_rank: int | None = None,
    raw_score: Any = None,
) -> dict[str, Any]:
    normalized = {
        "url": str(url or "").strip(),
        "title": str(title or ""),
        "snippet": str(snippet or ""),
        "source": str(source or ""),
        "published_at": str(published_at or ""),
    }
    if provider_rank is not None:
        normalized["provider_rank"] = provider_rank
    if raw_score is not None:
        normalized["raw_score"] = raw_score
    return normalized


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
        for index, item in enumerate(raw_results if isinstance(raw_results, list) else [], start=1):
            if not isinstance(item, dict):
                continue
            url = str(item.get("url") or item.get("href") or "").strip()
            if not url:
                continue
            normalized_results.append(
                _normalize_common_result(
                    url=url,
                    title=item.get("title"),
                    snippet=item.get("body") or item.get("snippet"),
                    source=item.get("source"),
                    published_at=item.get("date") or item.get("published"),
                    provider_rank=index,
                    raw_score=item.get("score"),
                )
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
                "provider_meta": {
                    "backend": self._backend,
                    "region": self._region,
                    "safesearch": self._safesearch,
                    "timelimit": timelimit,
                },
            },
        }


class BraveWebSearchAdapter:
    def __init__(
        self,
        *,
        api_key: str | None = None,
        request_json: Callable[..., Any] | None = None,
    ) -> None:
        self._api_key = api_key or os.getenv("DISCOVERY_BRAVE_API_KEY", "").strip()
        self._request_json = request_json or _default_json_request

    def search(
        self,
        *,
        query: str,
        count: int,
        result_type: str,
        time_range: str | None,
    ) -> dict[str, Any]:
        del result_type, time_range
        if not self._api_key:
            raise RuntimeError(
                "DISCOVERY_BRAVE_API_KEY must be set before enabling "
                "DISCOVERY_SEARCH_PROVIDER=brave."
            )
        url = "https://api.search.brave.com/res/v1/web/search?" + urlencode(
            {"q": query, "count": max(1, count)}
        )
        payload = self._request_json(
            method="GET",
            url=url,
            headers={"x-subscription-token": self._api_key, "accept": "application/json"},
        )
        web = payload.get("web") if isinstance(payload, dict) else {}
        raw_results = web.get("results") if isinstance(web, dict) else []
        normalized_results: list[dict[str, Any]] = []
        for index, item in enumerate(raw_results if isinstance(raw_results, list) else [], start=1):
            if not isinstance(item, dict):
                continue
            result_url = str(item.get("url") or "").strip()
            if not result_url:
                continue
            normalized_results.append(
                _normalize_common_result(
                    url=result_url,
                    title=item.get("title"),
                    snippet=item.get("description"),
                    source=item.get("profile", {}).get("name") if isinstance(item.get("profile"), dict) else "",
                    published_at=item.get("age"),
                    provider_rank=index,
                    raw_score=item.get("page_age"),
                )
            )
        return {
            "results": normalized_results,
            "meta": {
                "provider": "brave",
                "request_count": 1,
                "returned_count": len(normalized_results),
                "cost_usd": 0.0,
                "cost_cents": 0,
                "result_type": "text",
                "time_range": None,
                "provider_meta": {
                    "query": query,
                    "count": count,
                },
            },
        }


class SerperWebSearchAdapter:
    def __init__(
        self,
        *,
        api_key: str | None = None,
        request_json: Callable[..., Any] | None = None,
    ) -> None:
        self._api_key = api_key or os.getenv("DISCOVERY_SERPER_API_KEY", "").strip()
        self._request_json = request_json or _default_json_request

    def search(
        self,
        *,
        query: str,
        count: int,
        result_type: str,
        time_range: str | None,
    ) -> dict[str, Any]:
        del result_type
        if not self._api_key:
            raise RuntimeError(
                "DISCOVERY_SERPER_API_KEY must be set before enabling "
                "DISCOVERY_SEARCH_PROVIDER=serper."
            )
        payload = self._request_json(
            method="POST",
            url="https://google.serper.dev/search",
            headers={"X-API-KEY": self._api_key, "accept": "application/json"},
            payload={
                "q": query,
                "num": max(1, count),
                "tbs": _TIME_RANGE_MAP.get(time_range or "", ""),
            },
        )
        raw_results = payload.get("organic") if isinstance(payload, dict) else []
        normalized_results: list[dict[str, Any]] = []
        for index, item in enumerate(raw_results if isinstance(raw_results, list) else [], start=1):
            if not isinstance(item, dict):
                continue
            result_url = str(item.get("link") or item.get("url") or "").strip()
            if not result_url:
                continue
            normalized_results.append(
                _normalize_common_result(
                    url=result_url,
                    title=item.get("title"),
                    snippet=item.get("snippet"),
                    source=item.get("source"),
                    published_at=item.get("date"),
                    provider_rank=index,
                    raw_score=item.get("position"),
                )
            )
        return {
            "results": normalized_results,
            "meta": {
                "provider": "serper",
                "request_count": 1,
                "returned_count": len(normalized_results),
                "cost_usd": 0.0,
                "cost_cents": 0,
                "result_type": "text",
                "time_range": time_range,
                "provider_meta": {
                    "query": query,
                    "count": count,
                },
            },
        }


__all__ = [
    "BraveWebSearchAdapter",
    "DdgsWebSearchAdapter",
    "SerperWebSearchAdapter",
    "StubWebSearchAdapter",
    "unwrap_web_search_output",
]

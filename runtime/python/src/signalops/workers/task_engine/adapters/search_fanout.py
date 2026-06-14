from __future__ import annotations

import inspect
from typing import Any
from urllib.parse import urlparse

from .web_search import unwrap_web_search_output


async def _maybe_await(value: Any) -> Any:
    if inspect.isawaitable(value):
        return await value
    return value


class SearchFanoutAdapter:
    def __init__(self, providers: dict[str, Any]) -> None:
        self.providers = dict(providers)

    async def search(
        self,
        *,
        query: str,
        count: int,
        result_type: str,
        time_range: str | None,
    ) -> dict[str, Any]:
        merged: dict[str, dict[str, Any]] = {}
        provider_errors: dict[str, str] = {}
        request_count = 0
        cost_usd = 0.0
        for provider_id, adapter in self.providers.items():
            try:
                raw = await _maybe_await(
                    adapter.search(
                        query=query,
                        count=max(1, count),
                        result_type=result_type,
                        time_range=time_range,
                    )
                )
                results, meta = unwrap_web_search_output(raw)
                request_count += int(meta.get("request_count") or (1 if results else 0))
                cost_usd += float(meta.get("cost_usd") or 0)
            except Exception as error:
                provider_errors[provider_id] = f"{type(error).__name__}: {error}"
                continue
            for rank, result in enumerate(results, start=1):
                canonical = _canonical_url(str(result.get("url") or result.get("link") or ""))
                if not canonical:
                    continue
                row = merged.setdefault(
                    canonical,
                    {
                        **result,
                        "url": canonical,
                        "provider_votes": {},
                    },
                )
                row["provider_votes"][provider_id] = {"rank": int(result.get("provider_rank") or rank)}
                existing_rank = int(row.get("provider_rank") or rank)
                row["provider_rank"] = min(existing_rank, int(result.get("provider_rank") or rank))
        providers_total = max(1, len(self.providers))
        normalized: list[dict[str, Any]] = []
        for row in merged.values():
            votes = row.get("provider_votes") if isinstance(row.get("provider_votes"), dict) else {}
            ranks = [float(v.get("rank") or 100) for v in votes.values() if isinstance(v, dict)]
            provider_vote_score = len(votes) / providers_total
            rank_score = sum(1 / max(1.0, rank) for rank in ranks) / max(1, len(ranks))
            row["provider_score"] = round(provider_vote_score * 0.6 + rank_score * 0.4, 4)
            normalized.append(row)
        normalized.sort(key=lambda item: float(item.get("provider_score") or 0), reverse=True)
        return {
            "results": normalized[:count],
            "meta": {
                "provider": "fanout",
                "providers": list(self.providers),
                "provider_errors": provider_errors,
                "request_count": request_count,
                "returned_count": len(normalized[:count]),
                "cost_usd": cost_usd,
                "cost_cents": int(round(cost_usd * 100)),
            },
        }


def _canonical_url(value: str) -> str | None:
    parsed = urlparse(value.strip())
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return None
    path = parsed.path.rstrip("/") or "/"
    query = f"?{parsed.query}" if parsed.query else ""
    return f"{parsed.scheme.lower()}://{parsed.netloc.lower()}{path}{query}"

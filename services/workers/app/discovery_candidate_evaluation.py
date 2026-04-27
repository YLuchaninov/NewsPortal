from __future__ import annotations

from typing import Any

from .source_scoring import clamp_score
from .task_engine.adapters.common import normalize_url


def _coerce_mapping_list(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    rows: list[dict[str, Any]] = []
    for item in value:
        if isinstance(item, dict):
            rows.append(dict(item))
    return rows


def assessment_map(llm_analysis: Any) -> dict[str, dict[str, Any]]:
    mapping: dict[str, dict[str, Any]] = {}
    for item in _coerce_mapping_list(llm_analysis):
        source_url = item.get("source_url") or item.get("url")
        if isinstance(source_url, str) and source_url.strip():
            mapping[source_url.strip()] = dict(item)
    return mapping


def candidate_rows_from_context(
    *,
    mission_id: str,
    hypothesis_id: str,
    provider_type: str,
    context: dict[str, Any],
    existing_source_channels: dict[str, str],
) -> list[dict[str, Any]]:
    scored_sources = {
        str(item.get("source_url") or ""): dict(item)
        for item in _coerce_mapping_list(context.get("scored_sources"))
    }
    sampled_content = {
        str(item.get("source_url") or ""): dict(item)
        for item in _coerce_mapping_list(context.get("sampled_content"))
    }
    llm_assessments = assessment_map(context.get("llm_analysis"))
    search_meta = dict(context.get("search_meta") or {}) if isinstance(context.get("search_meta"), dict) else {}
    base_rows = context.get("probed_feeds") if provider_type == "rss" else context.get("probed_websites")
    if not isinstance(base_rows, list):
        return []

    candidates: list[dict[str, Any]] = []
    for row in base_rows:
        if not isinstance(row, dict):
            continue
        source_url = str(
            row.get("feed_url")
            or row.get("url")
            or row.get("final_url")
            or ""
        ).strip()
        if not source_url:
            continue
        scored = scored_sources.get(source_url, {})
        llm = llm_assessments.get(source_url, {})
        discovered_feed_urls = row.get("discovered_feed_urls") or row.get("hidden_rss_urls") or []
        classification = row.get("classification") if isinstance(row.get("classification"), dict) else {}
        capabilities = row.get("capabilities") if isinstance(row.get("capabilities"), dict) else {}
        browser_assisted_recommended = bool(row.get("browser_assisted_recommended"))
        challenge_kind = str(row.get("challenge_kind") or "").strip() or None
        effective_url = source_url
        effective_provider = provider_type
        normalized = normalize_url(effective_url)
        existing_channel_id = existing_source_channels.get(normalized)
        status = "duplicate" if existing_channel_id else "pending"
        candidates.append(
            {
                "mission_id": mission_id,
                "hypothesis_id": hypothesis_id,
                "url": effective_url,
                "final_url": str(row.get("final_url") or source_url or effective_url),
                "title": str(row.get("feed_title") or row.get("title") or ""),
                "description": str(llm.get("reasoning") or ""),
                "provider_type": effective_provider,
                "is_valid": bool(
                    row.get(
                        "is_valid_rss",
                        False if row.get("error_text") else True,
                    )
                ),
                "relevance_score": clamp_score(
                    llm.get("relevance")
                    or scored.get("relevance_score")
                    or 0.0
                ),
                "evaluation_json": {
                    "matched_terms": scored.get("matched_terms") or [],
                    "passes_threshold": bool(scored.get("passes_threshold", False)),
                    "search_provider": str(search_meta.get("provider") or ""),
                    "classification": classification,
                    "capabilities": capabilities,
                    "discovered_feed_urls": [
                        item for item in discovered_feed_urls if isinstance(item, str) and item.strip()
                    ],
                    "browser_assisted_recommended": browser_assisted_recommended,
                    "challenge_kind": challenge_kind,
                },
                "llm_assessment": llm,
                "sample_data": (
                    row.get("sample_entries")
                    or row.get("sample_resources")
                    or row.get("sample_articles")
                    or sampled_content.get(source_url, {}).get("articles")
                    or []
                ),
                "status": status,
                "registered_channel_id": existing_channel_id,
                "rejection_reason": "already_known_source" if status == "duplicate" else None,
            }
        )
    return candidates

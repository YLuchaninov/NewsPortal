from __future__ import annotations

from typing import Any
from urllib.parse import urlparse

from .source_scoring import canonical_domain
from .task_engine.adapters.common import normalize_url


def canonical_origin_url(url: str) -> str:
    raw = str(url or "").strip()
    if not raw:
        return ""
    parsed = urlparse(raw if "://" in raw else f"https://{raw}")
    hostname = (parsed.netloc or parsed.path or "").strip().lower()
    if not hostname:
        return ""
    return f"{parsed.scheme or 'https'}://{hostname}"


def looks_like_feed_candidate_url(url: str) -> bool:
    raw = str(url or "").strip()
    if not raw:
        return False
    parsed = urlparse(raw if "://" in raw else f"https://{raw}")
    hostname = (parsed.netloc or parsed.path or "").lower()
    path = (parsed.path or "").lower()
    query = (parsed.query or "").lower()
    candidate = " ".join(part for part in (hostname, path, query) if part)
    feed_hints = (
        "feed",
        "feeds",
        "rss",
        "atom",
        ".xml",
        "feedburner",
    )
    return any(hint in candidate for hint in feed_hints)


def normalize_domain_seed(value: Any) -> str:
    raw = str(value or "").strip()
    if not raw:
        return ""
    if "://" in raw:
        return canonical_domain(raw)
    candidate = raw.lower().strip().strip("/")
    if candidate.startswith("www."):
        candidate = candidate[4:]
    return candidate


def recall_candidate_rows_from_probe_results(
    *,
    recall_mission_id: str,
    provider_type: str,
    probe_rows: list[dict[str, Any]],
    probe_targets: dict[str, dict[str, Any]],
    existing_source_channels: dict[str, str],
) -> list[dict[str, Any]]:
    candidates: list[dict[str, Any]] = []
    for row in probe_rows:
        if not isinstance(row, dict):
            continue
        probe_input_url = str(row.get("url") or row.get("feed_url") or row.get("final_url") or "").strip()
        resolved_url = str(
            row.get("feed_url")
            or row.get("final_url")
            or row.get("url")
            or ""
        ).strip()
        candidate_url = (
            canonical_origin_url(resolved_url or probe_input_url)
            if provider_type == "website"
            else (resolved_url or probe_input_url)
        )
        if not candidate_url:
            continue
        canonical_domain_value = canonical_domain(candidate_url)
        if canonical_domain_value == "unknown":
            continue
        target_meta = probe_targets.get(normalize_url(probe_input_url)) or probe_targets.get(
            normalize_url(candidate_url)
        ) or {}
        sample_data = (
            row.get("sample_entries")
            or row.get("sample_resources")
            or row.get("sample_articles")
            or []
        )
        is_valid = bool(
            row.get("is_valid_rss")
            if provider_type == "rss"
            else not row.get("error_text")
        )
        existing_channel_id = existing_source_channels.get(normalize_url(candidate_url))
        status = "duplicate" if existing_channel_id else (
            "pending" if is_valid else "rejected"
        )
        rejection_reason = None
        if status == "duplicate":
            rejection_reason = "already_known_source"
        elif not is_valid:
            rejection_reason = "invalid_feed" if provider_type == "rss" else "probe_failed"
        discovered_feed_urls = row.get("discovered_feed_urls") or row.get("hidden_rss_urls") or []
        evaluation_json = {
            "classification": row.get("classification") if isinstance(row.get("classification"), dict) else {},
            "capabilities": row.get("capabilities") if isinstance(row.get("capabilities"), dict) else {},
            "discovered_feed_urls": [
                item for item in discovered_feed_urls if isinstance(item, str) and item.strip()
            ],
            "browser_assisted_recommended": bool(row.get("browser_assisted_recommended")),
            "challenge_kind": str(row.get("challenge_kind") or "").strip() or None,
            "error_text": str(row.get("error_text") or "").strip() or None,
            "is_valid": is_valid,
            "sample_data": sample_data if isinstance(sample_data, list) else [],
            "probe_input_url": probe_input_url or candidate_url,
            "seed_type": target_meta.get("seed_type"),
            "seed_value": target_meta.get("seed_value"),
            "search_query": target_meta.get("search_query"),
            "search_provider": target_meta.get("search_provider"),
            "search_result_title": target_meta.get("search_result_title"),
            "search_snippet": target_meta.get("search_snippet"),
            "query_family": target_meta.get("query_family"),
        }
        title = str(row.get("feed_title") or row.get("title") or target_meta.get("search_result_title") or "")
        description = str(
            target_meta.get("search_snippet")
            or row.get("error_text")
            or ""
        )
        candidates.append(
            {
                "recall_mission_id": recall_mission_id,
                "canonical_domain": canonical_domain_value,
                "url": candidate_url,
                "final_url": str(row.get("final_url") or resolved_url or candidate_url),
                "title": title,
                "description": description,
                "provider_type": provider_type,
                "status": status,
                "registered_channel_id": existing_channel_id,
                "quality_signal_source": target_meta.get("quality_signal_source") or "recall_acquisition",
                "evaluation_json": evaluation_json,
                "rejection_reason": rejection_reason,
                "created_by": "independent_recall:agent",
            }
        )
    return candidates


def probe_failure_rows(
    *,
    provider_type: str,
    probe_urls: list[str],
    error_text: str,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    normalized_error_text = str(error_text or "").strip() or "probe_failed"
    for probe_url in probe_urls:
        if not isinstance(probe_url, str) or not probe_url.strip():
            continue
        row: dict[str, Any] = {
            "url": probe_url,
            "error_text": normalized_error_text,
        }
        if provider_type == "rss":
            row["feed_url"] = probe_url
            row["is_valid_rss"] = False
            row["sample_entries"] = []
        else:
            row["final_url"] = probe_url
            row["sample_resources"] = []
        rows.append(row)
    return rows

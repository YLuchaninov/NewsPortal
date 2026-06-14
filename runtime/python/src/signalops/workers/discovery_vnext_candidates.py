from __future__ import annotations

from typing import Any
from urllib.parse import urldefrag, urlparse, urlunparse


def normalize_candidate_url(url: str) -> str:
    parsed = urlparse(url.strip())
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("Candidate URL must be absolute http(s).")
    hostname = (parsed.hostname or "").lower()
    port = f":{parsed.port}" if parsed.port else ""
    path = parsed.path or "/"
    if path != "/" and path.endswith("/"):
        path = path.rstrip("/")
    normalized = urlunparse((parsed.scheme.lower(), f"{hostname}{port}", path, "", parsed.query, ""))
    return urldefrag(normalized)[0]


def canonical_domain(url: str) -> str:
    parsed = urlparse(normalize_candidate_url(url))
    host = parsed.hostname or ""
    return host[4:] if host.startswith("www.") else host


def build_candidate_rows(
    *,
    run_id: str | None,
    interest_id: str | None,
    hypothesis_id: str,
    query_attempt_id: str | None,
    results: list[dict[str, Any]],
    lens: str | None = None,
    memory_mode: str | None = None,
) -> list[dict[str, Any]]:
    seen: dict[str, dict[str, Any]] = {}
    rows: list[dict[str, Any]] = []
    for index, result in enumerate(results):
        raw_url = str(result.get("url") or result.get("candidateUrl") or "").strip()
        if not raw_url:
            continue
        try:
            normalized_url = normalize_candidate_url(raw_url)
        except ValueError:
            continue
        existing = seen.get(normalized_url)
        if existing:
            existing["rediscoveryCount"] += 1
            existing["acquisitionEvidence"]["paths"].append(_evidence(result, index, hypothesis_id, query_attempt_id, lens, memory_mode))
            continue
        row = {
            "runId": run_id,
            "interestId": interest_id,
            "hypothesisId": hypothesis_id,
            "lens": lens,
            "memoryMode": memory_mode,
            "queryAttemptId": query_attempt_id,
            "canonicalUrl": normalized_url,
            "canonicalDomain": canonical_domain(normalized_url),
            "candidateKindGuess": _kind_guess(normalized_url, result),
            "acquisitionEvidence": {
                "paths": [_evidence(result, index, hypothesis_id, query_attempt_id, lens, memory_mode)],
            },
            "rediscoveryCount": 1,
            "status": "new",
        }
        seen[normalized_url] = row
        rows.append(row)
    return rows


def query_quality_report(
    *,
    query: str,
    query_family_intent: str,
    candidates: list[dict[str, Any]],
    raw_result_count: int,
) -> dict[str, Any]:
    mix = classify_result_mix(candidates, raw_result_count=raw_result_count)
    quality = query_quality_from_result_mix(mix)
    return {
        "query": query,
        "queryFamilyIntent": query_family_intent,
        "queryPurpose": _query_purpose(query_family_intent, query),
        "observedResultMix": mix,
        "quality": quality,
        "refinementHints": _refinement_hints(quality),
        "recommendedNextAction": _recommended_next_action(quality),
    }


def classify_result_mix(candidates: list[dict[str, Any]], *, raw_result_count: int) -> dict[str, int]:
    mix = {
        "official_or_owner_sources": 0,
        "recurring_listings": 0,
        "feeds": 0,
        "api_endpoints": 0,
        "document_collections": 0,
        "source_directories": 0,
        "item_details": 0,
        "context_pages": 0,
        "seller_or_vendor_pages": 0,
        "search_or_category_wrappers": 0,
        "blocked_or_unusable": 0,
        "duplicates": 0,
        "unknown": 0,
    }
    for candidate in candidates:
        text = " ".join(
            str(value or "")
            for value in (
                candidate.get("canonicalUrl"),
                candidate.get("canonicalDomain"),
                candidate.get("candidateKindGuess"),
                candidate.get("acquisitionEvidence"),
            )
        ).lower()
        if _looks_dead_or_blocked(text):
            mix["blocked_or_unusable"] += 1
        elif "feed" in text or "rss" in text or ".atom" in text:
            mix["feeds"] += 1
        elif "api" in text or "json" in text or "openapi" in text:
            mix["api_endpoints"] += 1
        elif ".pdf" in text or "document" in text or "report" in text:
            mix["document_collections"] += 1
        elif _looks_search_or_category_wrapper(text):
            mix["search_or_category_wrappers"] += 1
        elif _looks_seo_or_content_farm(text):
            mix["context_pages"] += 1
        elif _looks_seller_or_vendor(text):
            mix["seller_or_vendor_pages"] += 1
        elif _looks_source_directory(text):
            mix["source_directories"] += 1
        elif _looks_dataset_or_registry(text):
            mix["api_endpoints"] += 1
        elif _looks_recurring_listing(text):
            mix["recurring_listings"] += 1
        elif _looks_owner_or_official(text):
            mix["official_or_owner_sources"] += 1
        elif _looks_secondary_explainer(text):
            mix["context_pages"] += 1
        else:
            mix["unknown"] += 1
        mix["duplicates"] += max(0, int(candidate.get("rediscoveryCount") or 1) - 1)
    accounted = sum(value for key, value in mix.items() if key != "duplicates")
    mix["unknown"] += max(0, raw_result_count - accounted - mix["duplicates"])
    return mix


def query_quality_from_result_mix(mix: dict[str, int]) -> str:
    source_worthy = (
        mix.get("official_or_owner_sources", 0)
        + mix.get("recurring_listings", 0)
        + mix.get("feeds", 0)
        + mix.get("api_endpoints", 0)
        + mix.get("document_collections", 0)
        + mix.get("source_directories", 0)
    )
    item_worthy = mix.get("item_details", 0) + mix.get("document_collections", 0)
    context = mix.get("context_pages", 0) + mix.get("search_or_category_wrappers", 0)
    noise = mix.get("seller_or_vendor_pages", 0) + mix.get("blocked_or_unusable", 0)
    if item_worthy >= 2 and noise <= item_worthy:
        return "useful_for_item_discovery"
    if source_worthy >= 3 and noise <= source_worthy:
        return "useful_for_source_acquisition"
    if source_worthy > 0:
        return "useful_for_query_expansion" if noise > source_worthy else "useful_for_source_acquisition"
    if context > 0 and noise <= context:
        return "useful_for_query_expansion"
    if noise > 0 or mix.get("unknown", 0) > 0:
        return "noisy"
    return "exhausted"


def _evidence(
    result: dict[str, Any],
    index: int,
    hypothesis_id: str,
    query_attempt_id: str | None,
    lens: str | None,
    memory_mode: str | None,
) -> dict[str, Any]:
    return {
        "title": result.get("title"),
        "snippet": result.get("snippet"),
        "rank": int(result.get("rank") or index + 1),
        "provider": result.get("provider") or "fixture",
        "hypothesisId": hypothesis_id,
        "queryAttemptId": query_attempt_id,
        "lens": lens,
        "memoryMode": memory_mode,
    }


def _kind_guess(url: str, result: dict[str, Any]) -> str:
    text = f"{url} {result.get('title') or ''} {result.get('snippet') or ''}".lower()
    if any(token in text for token in ("rss", "feed.xml", ".atom")):
        return "rss"
    if any(token in text for token in ("api", "openapi", "json")):
        return "api"
    if any(token in text for token in (".pdf", "document", "report")):
        return "document"
    if any(token in text for token in ("dataset", "data portal")):
        return "dataset"
    return "website"


def _refinement_hints(quality: str) -> list[str]:
    if quality in {"useful_for_source_acquisition", "useful_for_item_discovery"}:
        return []
    if quality == "useful_for_query_expansion":
        return ["Add artifact-specific terms", "Try local-language terms"]
    if quality == "noisy":
        return ["Remove ambiguous vocabulary", "Add source-oriented terms"]
    return ["Try a different universal lens", "Broaden query terms"]


def _recommended_next_action(quality: str) -> str:
    return {
        "useful_for_source_acquisition": "probe_top_candidates",
        "useful_for_item_discovery": "probe_top_candidates",
        "useful_for_query_expansion": "refine_query",
        "noisy": "use_different_lens",
        "exhausted": "stop_family",
    }[quality]


def _query_purpose(intent: str, query: str) -> str:
    text = f"{intent} {query}".lower()
    if any(token in text for token in ("directory", "registry", "catalog")):
        return "find_source_directories"
    if any(token in text for token in ("terminology", "terms", "vocabulary", "synonym")):
        return "find_terminology"
    if any(token in text for token in ("document", "pdf", "report", "notice")):
        return "find_documents"
    if any(token in text for token in ("forum", "discussion", "community", "thread")):
        return "find_discussions"
    if any(token in text for token in ("official", "owner", "authority", "agency")):
        return "find_official_owners"
    if any(token in text for token in ("local language", "locale", "translated")):
        return "find_local_language_forms"
    return "find_direct_sources"


def _looks_owner_or_official(text: str) -> bool:
    return any(token in text for token in ("official", ".gov", ".gob", "europa.eu", "agency", "ministry", "department", "commission", "/news", "/updates", "/changelog"))


def _looks_recurring_listing(text: str) -> bool:
    return any(token in text for token in ("/jobs", "/careers", "/tenders", "/notices", "/opportunities", "/listings", "feed.xml", "rss"))


def _looks_source_directory(text: str) -> bool:
    return any(token in text for token in ("/directory", "/marketplace", "/catalog", "/registry", "directory", "marketplace"))


def _looks_dataset_or_registry(text: str) -> bool:
    return any(token in text for token in ("/data", "/dataset", "/api", "open data", "registry"))


def _looks_secondary_explainer(text: str) -> bool:
    return any(token in text for token in ("/blog", "/guide", "/learn", "how to", "what is", "template"))


def _looks_search_or_category_wrapper(text: str) -> bool:
    return any(token in text for token in ("/search", "/browse", "?q=", "category=", "tag=", "/category/", "/topics/"))


def _looks_seller_or_vendor(text: str) -> bool:
    return any(token in text for token in ("/pricing", "/services", "/solutions", "/demo", "book a demo", "consulting"))


def _looks_seo_or_content_farm(text: str) -> bool:
    return any(token in text for token in ("top 10", "best ", "alternatives", "sponsored", "coupon", "affiliate"))


def _looks_dead_or_blocked(text: str) -> bool:
    return any(token in text for token in ("404", "not found", "blocked", "captcha", "login required", "forbidden"))

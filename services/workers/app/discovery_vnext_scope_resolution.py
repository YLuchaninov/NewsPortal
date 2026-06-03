from __future__ import annotations

import re
from typing import Any
from urllib.parse import parse_qs, urlparse, urlunparse

from services.workers.app.discovery_vnext_artifacts import (
    validate_source_scope_resolution,
    validation_json,
)


DOCUMENT_EXTENSIONS = {".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".rtf"}
ITEM_SEGMENT_RE = re.compile(r"(\d{4}[/_-]\d{1,2}|[a-z0-9-]{18,}|bid_detail|detail|notice|article|post|rfp)", re.I)


def resolve_source_scope(
    *,
    discovery_brief: dict[str, Any] | None = None,
    candidate: dict[str, Any] | None = None,
    probe_report: dict[str, Any],
    previous_memory: dict[str, Any] | None = None,
) -> dict[str, Any]:
    del discovery_brief, previous_memory
    payload = build_source_scope_resolution_payload(
        candidate=candidate or {},
        probe_report=probe_report,
    )
    issues = validate_source_scope_resolution(payload)
    return {
        "artifactType": "SourceScopeResolution",
        "schemaVersion": "1.0",
        "status": "validated" if not issues else "rejected",
        "payload": payload,
        "validation": validation_json(issues),
    }


def build_source_scope_resolution_payload(
    *,
    candidate: dict[str, Any],
    probe_report: dict[str, Any],
) -> dict[str, Any]:
    candidate_url = str(
        probe_report.get("candidateUrl")
        or candidate.get("canonicalUrl")
        or candidate.get("canonical_url")
        or candidate.get("url")
        or ""
    ).strip()
    parsed = urlparse(candidate_url)
    observations = [item for item in probe_report.get("observations") or [] if isinstance(item, dict)]
    technical = probe_report.get("technicalObservability") if isinstance(probe_report.get("technicalObservability"), dict) else {}
    page_hints = probe_report.get("pageRoleHints") if isinstance(probe_report.get("pageRoleHints"), dict) else {}
    access_pattern = str(probe_report.get("accessPattern") or "unknown")
    evidence: list[str] = []
    monitoring_urls: list[str] = []
    extraction_hints = _item_extraction_hints(candidate_url, observations)

    valid_feed = bool(technical.get("feedValid")) or any(bool(item.get("valid")) and item.get("kind") == "feed_probe" for item in observations)
    discovered_feeds = _discovered_feed_urls(probe_report, observations)
    listing_count = max((int(item.get("listingCountEstimate") or 0) for item in observations), default=0)
    document_count = max((int(item.get("documentCountEstimate") or 0) for item in observations), default=0)
    is_document = _is_document_url(parsed)
    is_api = _looks_like_api(parsed, candidate, observations)
    is_search = _looks_like_search(parsed)
    is_context = _looks_like_context(parsed, page_hints, observations)
    is_item = _looks_like_item(parsed)

    if access_pattern in {"blocked", "captcha_blocked", "requires_auth"}:
        scope_type = "blocked_or_unusable"
        resolved_url = candidate_url
        confidence = 0.88
        reason = f"Probe access pattern is {access_pattern}; source cannot be monitored without unsupported access."
        evidence.append(reason)
        not_monitoring_reason = reason
    elif valid_feed and _looks_like_feed(parsed):
        scope_type = "feed"
        resolved_url = candidate_url
        confidence = 0.92
        evidence.append("Candidate URL is a validated feed.")
        not_monitoring_reason = None
    elif is_api:
        scope_type = "api_endpoint"
        resolved_url = _api_scope_url(parsed)
        confidence = 0.82
        evidence.append("Candidate URL or probe evidence indicates an API endpoint.")
        not_monitoring_reason = "API endpoints require declarative or custom adapter support before channel projection."
    elif is_document:
        scope_type = "document_collection" if _parent_scope_url(parsed) != _origin_url(parsed) else "single_item"
        resolved_url = _parent_scope_url(parsed)
        confidence = 0.78
        evidence.append("Candidate URL is a document artifact, not a source channel URL.")
        not_monitoring_reason = "Document artifacts require document extraction or parent collection monitoring."
    elif is_context:
        scope_type = "context_page"
        resolved_url = candidate_url
        confidence = 0.76
        evidence.append("Candidate appears to be static/context/vendor/explainer content.")
        not_monitoring_reason = "Context pages are retained for inventory/query expansion, not direct channel projection."
    elif is_search:
        scope_type = "listing_page" if listing_count > 0 else "search_endpoint"
        resolved_url = candidate_url
        confidence = 0.72 if listing_count > 0 else 0.62
        evidence.append("Candidate URL contains search/listing query parameters.")
        not_monitoring_reason = None if listing_count > 0 else "Search endpoint needs stability evidence before channel projection."
    elif listing_count > 0 or bool(technical.get("hasRecurringStructure")):
        scope_type = "listing_page" if _path_depth(parsed.path) > 0 else "domain_root"
        resolved_url = candidate_url
        confidence = 0.82
        evidence.append("Probe observed recurring listing/feed-like structure at the candidate URL.")
        not_monitoring_reason = None
    elif is_item:
        scope_type = "section" if _parent_scope_url(parsed) != candidate_url else "single_item"
        resolved_url = _parent_scope_url(parsed)
        confidence = 0.74
        evidence.append("Candidate URL looks like an item/detail page; parent scope is safer to monitor.")
        not_monitoring_reason = None if scope_type == "section" else "Single item URL cannot become a source channel."
    else:
        scope_type = "domain_root" if _path_depth(parsed.path) == 0 else "section"
        resolved_url = _parent_scope_url(parsed) if scope_type == "section" else _origin_url(parsed)
        confidence = 0.55
        evidence.append("Resolver selected the widest safe same-origin scope from URL structure and probe hints.")
        not_monitoring_reason = None

    if scope_type == "feed":
        monitoring_urls.append(resolved_url)
    else:
        monitoring_urls.append(resolved_url)
        monitoring_urls.extend(discovered_feeds)

    if document_count > 0:
        evidence.append("Probe observed document links that may need item extraction.")
    if discovered_feeds:
        evidence.append("Probe discovered feed URLs near the candidate scope.")

    payload = {
        "candidateUrl": candidate_url,
        "resolvedSourceUrl": _normalize_url(resolved_url),
        "sourceScopeType": scope_type,
        "sourceScopeConfidence": round(confidence, 2),
        "seedItemUrl": candidate_url if scope_type in {"single_item", "section", "document_collection", "context_page"} else None,
        "monitoringEntryUrls": _dedupe_urls(monitoring_urls),
        "itemExtractionHints": extraction_hints,
        "resolutionEvidence": list(dict.fromkeys(evidence))[:8],
        "notMonitoringReason": not_monitoring_reason,
        "risk": _risk(access_pattern, scope_type, page_hints, technical),
    }
    return payload


def _item_extraction_hints(candidate_url: str, observations: list[dict[str, Any]]) -> dict[str, Any]:
    parsed = urlparse(candidate_url)
    return {
        "itemUrlPattern": _item_url_pattern(parsed.path),
        "listingUrlPattern": _parent_scope_url(parsed),
        "datePatternObserved": bool(re.search(r"/\d{4}([/-]\d{1,2})?", parsed.path)),
        "paginationObserved": any(_has_pagination(item) for item in observations) or bool(parse_qs(parsed.query).keys() & {"page", "p", "offset", "cursor"}),
        "documentLinksObserved": any(int(item.get("documentCountEstimate") or 0) > 0 for item in observations),
    }


def _risk(access_pattern: str, scope_type: str, page_hints: dict[str, Any], technical: dict[str, Any]) -> dict[str, Any]:
    return {
        "overallRisk": "high" if access_pattern in {"blocked", "captcha_blocked", "requires_auth"} else "medium" if scope_type in {"domain_root", "search_endpoint"} else "low",
        "promptInjectionRisk": "medium" if page_hints.get("communityOrUgcLikely") else "low",
        "seoSpamRisk": "medium" if page_hints.get("secondaryExplainerLikely") or page_hints.get("sellerOrVendorLikely") else "low",
        "ugcManipulationRisk": "medium" if page_hints.get("communityOrUgcLikely") else "low",
        "authOrCaptchaRisk": "high" if access_pattern in {"captcha_blocked", "requires_auth"} else "low",
        "crawlBlastRadius": "medium" if scope_type == "domain_root" else "low",
        "legalRisk": "medium" if access_pattern == "blocked" else "low",
        "unsupportedAdapterRisk": "medium" if scope_type in {"api_endpoint", "document_collection", "search_endpoint"} else "low",
        "providerFailureCount": int(technical.get("providerFailureCount") or 0),
    }


def _is_document_url(parsed: Any) -> bool:
    return any(parsed.path.lower().endswith(ext) for ext in DOCUMENT_EXTENSIONS)


def _looks_like_feed(parsed: Any) -> bool:
    path = parsed.path.lower()
    return any(token in path for token in ("rss", "feed", "atom")) or path.endswith((".xml", ".rss", ".atom"))


def _looks_like_api(parsed: Any, candidate: dict[str, Any], observations: list[dict[str, Any]]) -> bool:
    text = " ".join([parsed.path, parsed.query, str(candidate.get("candidateKindGuess") or candidate.get("candidate_kind_guess") or ""), str(observations)]).lower()
    return "/api" in text or "openapi" in text or "json" in text or parsed.path.lower().endswith(".json")


def _looks_like_search(parsed: Any) -> bool:
    query_keys = set(parse_qs(parsed.query).keys())
    return bool(query_keys & {"q", "query", "search", "keyword", "keywords", "category", "type"}) or any(
        token in parsed.path.lower() for token in ("/search", "/find", "/browse")
    )


def _looks_like_context(parsed: Any, page_hints: dict[str, Any], observations: list[dict[str, Any]]) -> bool:
    path = parsed.path.lower()
    if page_hints.get("sellerOrVendorLikely") or page_hints.get("staticEvergreenLikely"):
        return True
    if any(token in path for token in ("/pricing", "/services", "/solutions", "/demo", "/guide", "/learn", "/about", "/contact")):
        return True
    listing_count = max((int(item.get("listingCountEstimate") or 0) for item in observations), default=0)
    document_count = max((int(item.get("documentCountEstimate") or 0) for item in observations), default=0)
    return "/blog" in path and listing_count == 0 and document_count == 0


def _looks_like_item(parsed: Any) -> bool:
    parts = [part for part in parsed.path.split("/") if part]
    if len(parts) >= 3:
        return True
    return bool(ITEM_SEGMENT_RE.search(parsed.path))


def _path_depth(path: str) -> int:
    return len([part for part in path.split("/") if part])


def _origin_url(parsed: Any) -> str:
    return urlunparse((parsed.scheme or "https", parsed.netloc, "/", "", "", "")).rstrip("/")


def _parent_scope_url(parsed: Any) -> str:
    parts = [part for part in parsed.path.split("/") if part]
    if not parts:
        return _origin_url(parsed)
    if len(parts) == 1:
        parent_path = f"/{parts[0]}"
    else:
        parent_path = "/" + "/".join(parts[:-1])
    return urlunparse((parsed.scheme or "https", parsed.netloc, parent_path, "", "", "")).rstrip("/")


def _api_scope_url(parsed: Any) -> str:
    parts = [part for part in parsed.path.split("/") if part]
    if not parts:
        return _origin_url(parsed)
    if parts[0].lower() == "api" and len(parts) > 1:
        path = "/" + "/".join(parts[:2])
    else:
        path = "/" + parts[0]
    return urlunparse((parsed.scheme or "https", parsed.netloc, path, "", "", "")).rstrip("/")


def _item_url_pattern(path: str) -> str | None:
    parts = [part for part in path.split("/") if part]
    if len(parts) < 2:
        return None
    return "/" + "/".join([*parts[:-1], "{slug}"])


def _has_pagination(item: dict[str, Any]) -> bool:
    rendered = str(item).lower()
    return any(token in rendered for token in ("pagination", "next page", "page=", "offset=", "cursor="))


def _discovered_feed_urls(probe_report: dict[str, Any], observations: list[dict[str, Any]]) -> list[str]:
    values: list[str] = []
    for observation in observations:
        raw = observation.get("discoveredFeedUrls") or observation.get("discovered_feed_urls") or []
        if isinstance(raw, list):
            values.extend(str(item) for item in raw if isinstance(item, str))
    for result in probe_report.get("websiteResults") or []:
        if isinstance(result, dict):
            raw = result.get("discovered_feed_urls") or result.get("discoveredFeedUrls") or []
            if isinstance(raw, list):
                values.extend(str(item) for item in raw if isinstance(item, str))
    return _dedupe_urls(values)


def _normalize_url(url: str) -> str:
    parsed = urlparse(url.strip())
    if not parsed.scheme or not parsed.netloc:
        return url.strip()
    path = parsed.path or "/"
    if path != "/" and path.endswith("/"):
        path = path.rstrip("/")
    return urlunparse((parsed.scheme.lower(), parsed.netloc.lower(), path, "", parsed.query, ""))


def _dedupe_urls(urls: list[str]) -> list[str]:
    result: list[str] = []
    for url in urls:
        normalized = _normalize_url(str(url))
        if normalized and normalized not in result:
            result.append(normalized)
    return result[:10]

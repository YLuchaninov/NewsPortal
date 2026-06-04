from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any
from urllib.parse import parse_qs, urlencode, urlparse, urlunparse

from services.workers.app.discovery_vnext_artifacts import (
    validate_source_scope_resolution,
    validation_json,
)


DOCUMENT_EXTENSIONS = {".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".rtf"}
TRACKING_PARAMS = {
    "fbclid",
    "gclid",
    "mc_cid",
    "mc_eid",
    "utm_campaign",
    "utm_content",
    "utm_medium",
    "utm_source",
    "utm_term",
}
DATE_SEGMENT_RE = re.compile(r"^(?:19|20)\d{2}$|^\d{1,2}$")
ITEM_SEGMENT_RE = re.compile(r"(\d{4}[/_-]\d{1,2}|[a-z0-9-]{18,}|bid_detail|detail|notice|article|post|item|view)", re.I)
STATIC_CONTEXT_TOKENS = (
    "/pricing",
    "/services",
    "/solutions",
    "/demo",
    "/guide",
    "/learn",
    "/about",
    "/contact",
    "/help",
    "/docs",
)


@dataclass(frozen=True)
class ScopeCandidate:
    url: str
    type: str
    score: float
    evidence: tuple[str, ...]
    rejected_reason: str | None = None
    selected: bool = False


def resolve_source_scope(
    *,
    discovery_brief: dict[str, Any] | None = None,
    candidate: dict[str, Any] | None = None,
    probe_report: dict[str, Any],
    previous_memory: dict[str, Any] | None = None,
) -> dict[str, Any]:
    payload = build_source_scope_resolution_payload(
        discovery_brief=discovery_brief or {},
        candidate=candidate or {},
        probe_report=probe_report,
        previous_memory=previous_memory or {},
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
    discovery_brief: dict[str, Any] | None = None,
    previous_memory: dict[str, Any] | None = None,
) -> dict[str, Any]:
    del discovery_brief
    original_url = str(
        probe_report.get("candidateUrl")
        or candidate.get("canonicalUrl")
        or candidate.get("canonical_url")
        or candidate.get("url")
        or ""
    ).strip()
    observations = [item for item in probe_report.get("observations") or [] if isinstance(item, dict)]
    technical = probe_report.get("technicalObservability") if isinstance(probe_report.get("technicalObservability"), dict) else {}
    page_hints = probe_report.get("pageRoleHints") if isinstance(probe_report.get("pageRoleHints"), dict) else {}
    access_pattern = str(probe_report.get("accessPattern") or "unknown")
    canonical_link = _canonical_link(probe_report, observations)
    canonical_url, normalization_evidence = _normalize_candidate_url(original_url, canonical_link=canonical_link)
    parsed = urlparse(canonical_url)
    evidence: list[str] = []
    warnings: list[str] = []

    url_shape = _classify_url_shape(
        parsed=parsed,
        candidate=candidate,
        probe_report=probe_report,
        observations=observations,
        technical=technical,
        page_hints=page_hints,
        access_pattern=access_pattern,
    )
    evidence.append(f"Candidate URL structural shape classified as {url_shape}.")

    scope_candidates = _generate_scope_candidates(
        canonical_url=canonical_url,
        url_shape=url_shape,
        probe_report=probe_report,
        observations=observations,
        technical=technical,
        page_hints=page_hints,
        previous_memory=previous_memory or {},
    )
    selected = _select_scope_candidate(scope_candidates)
    if selected.rejected_reason:
        warnings.append(selected.rejected_reason)
    if selected.type == "section" and _path_has_date_bucket(urlparse(selected.url).path):
        warnings.append("selected_section_contains_date_bucket")

    resolved_url = selected.url
    scope_type = selected.type
    confidence = round(max(0.35, min(0.97, selected.score)), 2)
    evidence.extend(selected.evidence)

    discovered_feeds = _discovered_feed_urls(probe_report, observations)
    monitoring_urls = [resolved_url] if scope_type != "unknown" else []
    if scope_type != "feed":
        monitoring_urls.extend(discovered_feeds)
    document_count = _max_observation_int(observations, "documentCountEstimate")
    if document_count > 0:
        evidence.append("Probe observed document links near the candidate scope.")
    if discovered_feeds:
        evidence.append("Probe discovered feed URLs near the candidate scope.")

    not_monitoring_reason = _not_monitoring_reason(scope_type, access_pattern)
    seed_item_url = canonical_url if scope_type in {"single_item", "section", "document_collection", "context_page"} or url_shape in {"single_item_like", "file_document"} else None

    payload = {
        "candidateUrl": canonical_url,
        "canonicalCandidateUrl": canonical_url,
        "originalCandidateUrl": original_url,
        "resolvedSourceUrl": _normalize_url(resolved_url),
        "sourceScopeType": scope_type,
        "sourceScopeConfidence": confidence,
        "seedItemUrl": seed_item_url,
        "monitoringEntryUrls": _dedupe_urls(monitoring_urls),
        "scopeCandidates": [_scope_candidate_json(candidate_item, selected_url=selected.url) for candidate_item in scope_candidates],
        "itemExtractionHints": _item_extraction_hints(canonical_url, selected.url, observations, technical),
        "resolutionEvidence": list(dict.fromkeys(evidence))[:12],
        "normalizationEvidence": normalization_evidence,
        "notMonitoringReason": not_monitoring_reason,
        "warnings": list(dict.fromkeys(warnings))[:10],
        "risk": _risk(access_pattern, scope_type, page_hints, technical),
    }
    return payload


def _normalize_candidate_url(url: str, *, canonical_link: str | None = None) -> tuple[str, list[str]]:
    evidence: list[str] = []
    selected = canonical_link.strip() if canonical_link else url.strip()
    if canonical_link and canonical_link.strip() != url.strip():
        evidence.append("Applied rel=canonical URL from probe evidence.")
    parsed = urlparse(selected)
    if not parsed.scheme or not parsed.netloc:
        return selected, evidence or ["URL was not absolute; preserved as provided."]
    query_pairs = []
    for key, values in parse_qs(parsed.query, keep_blank_values=True).items():
        if key.lower() in TRACKING_PARAMS:
            evidence.append(f"Removed tracking query parameter {key}.")
            continue
        for value in values:
            query_pairs.append((key, value))
    path = parsed.path or "/"
    if path != "/" and path.endswith("/"):
        path = path.rstrip("/")
        evidence.append("Removed trailing slash from non-root path.")
    normalized = urlunparse((parsed.scheme.lower(), parsed.netloc.lower(), path, "", urlencode(query_pairs), ""))
    if parsed.fragment:
        evidence.append("Removed URL fragment.")
    if normalized != selected:
        evidence.append("Normalized scheme, host, path, query or fragment.")
    return normalized, evidence or ["Candidate URL required no structural normalization."]


def _classify_url_shape(
    *,
    parsed: Any,
    candidate: dict[str, Any],
    probe_report: dict[str, Any],
    observations: list[dict[str, Any]],
    technical: dict[str, Any],
    page_hints: dict[str, Any],
    access_pattern: str,
) -> str:
    if access_pattern in {"blocked", "captcha_blocked", "requires_auth"} or _challenge_observed(probe_report, observations):
        return "blocked_or_challenged"
    if _is_document_url(parsed, probe_report):
        return "file_document"
    if _valid_feed(parsed, observations, technical):
        return "feed_like"
    if _looks_like_api(parsed, candidate, probe_report, observations):
        return "api_like"
    if _looks_like_search(parsed):
        return "search_or_category"
    if _listing_evidence_at_url(_normalize_url(urlunparse((parsed.scheme, parsed.netloc, parsed.path or "/", "", parsed.query, ""))), observations, technical):
        return "listing_like"
    if _looks_like_context(parsed, page_hints, observations):
        return "context_like"
    if _looks_like_item(parsed):
        return "single_item_like"
    return "listing_like" if bool(technical.get("hasRecurringStructure")) else "unknown"


def _generate_scope_candidates(
    *,
    canonical_url: str,
    url_shape: str,
    probe_report: dict[str, Any],
    observations: list[dict[str, Any]],
    technical: dict[str, Any],
    page_hints: dict[str, Any],
    previous_memory: dict[str, Any],
) -> list[ScopeCandidate]:
    parsed = urlparse(canonical_url)
    origin = _origin_url(parsed)
    candidates: list[ScopeCandidate] = []
    feed_urls = _discovered_feed_urls(probe_report, observations)
    if url_shape == "blocked_or_challenged":
        return [
            ScopeCandidate(
                url=canonical_url,
                type="blocked_or_unusable",
                score=0.88,
                evidence=("Access/challenge evidence means this URL is not monitorable by Discovery.",),
            )
        ]
    if url_shape == "feed_like":
        candidates.append(ScopeCandidate(canonical_url, "feed", 0.94, ("Candidate URL is a validated feed.",)))
    for feed_url in feed_urls:
        score = 0.9 if _valid_feed(urlparse(feed_url), observations, technical) or bool(technical.get("feedValid")) else 0.62
        candidates.append(ScopeCandidate(_normalize_url(feed_url), "feed", score, ("Feed candidate was discovered near the source scope.",)))
    if url_shape == "api_like":
        candidates.append(ScopeCandidate(_api_scope_url(parsed), "api_endpoint", 0.84, ("Candidate URL or response shape indicates an API endpoint.",)))
    if url_shape == "file_document":
        referrer = _referring_collection_url(probe_report, observations)
        if referrer:
            candidates.append(ScopeCandidate(referrer, "document_collection", 0.78, ("Document has a referring collection/listing URL.",)))
        candidates.append(ScopeCandidate(canonical_url, "single_item", 0.72, ("Candidate URL is a document item artifact.",)))
    if url_shape == "context_like":
        candidates.append(ScopeCandidate(canonical_url, "context_page", 0.78, ("Candidate appears to be static/context/vendor/explainer content.",)))
        blog_parent = _validated_parent_section(parsed, observations, technical)
        if blog_parent:
            candidates.append(ScopeCandidate(blog_parent, "section", 0.71, ("Parent section has recurring structure evidence.",)))
    if url_shape in {"listing_like", "search_or_category"}:
        scope_type = "listing_page" if url_shape == "listing_like" or _listing_evidence_at_url(canonical_url, observations, technical) else "search_endpoint"
        candidates.append(ScopeCandidate(canonical_url, scope_type, 0.82 if scope_type == "listing_page" else 0.62, ("Candidate page has listing/search endpoint structure.",)))
    if url_shape == "single_item_like":
        parent_candidates = _parent_scope_candidates(parsed, observations, technical)
        candidates.extend(parent_candidates)
        candidates.append(ScopeCandidate(canonical_url, "single_item", 0.52, ("Exact URL is an item detail page and is too narrow for ordinary monitoring.",)))
    if url_shape == "unknown":
        parent = _parent_scope_url(parsed)
        if parent != canonical_url and parent != origin:
            candidates.append(ScopeCandidate(parent, "section", 0.48, ("Parent path is only a weak structural scope candidate.", "More evidence is needed before channel projection.")))
        candidates.append(ScopeCandidate(origin, "domain_root", 0.42, ("Domain root is the broad fallback scope candidate.",), "domain_root_requires_small_validated_site"))

    if not candidates:
        candidates.append(ScopeCandidate(canonical_url, "unknown", 0.35, ("No structurally validated source scope was found.",), "insufficient_scope_evidence"))

    candidates = _apply_memory_score(candidates, previous_memory)
    return _dedupe_scope_candidates(candidates)


def _parent_scope_candidates(parsed: Any, observations: list[dict[str, Any]], technical: dict[str, Any]) -> list[ScopeCandidate]:
    parts = [part for part in parsed.path.split("/") if part]
    result: list[ScopeCandidate] = []
    origin = _origin_url(parsed)
    for end in range(len(parts) - 1, 0, -1):
        path = "/" + "/".join(parts[:end])
        url = urlunparse((parsed.scheme or "https", parsed.netloc, path, "", "", "")).rstrip("/")
        has_listing = _listing_evidence_at_url(url, observations, technical)
        has_date_bucket = _path_has_date_bucket(path)
        if has_listing:
            score = 0.83 - (0.03 * max(0, end - 1))
            result.append(ScopeCandidate(url, "section", score, ("Parent path has listing/archive evidence.",)))
        elif has_date_bucket:
            result.append(
                ScopeCandidate(
                    url,
                    "section",
                    0.28,
                    ("Date-bucket parent was considered but lacks listing evidence.",),
                    "date_bucket_parent_without_listing_evidence",
                )
            )
    if len(parts) > 1:
        section_root = urlunparse((parsed.scheme or "https", parsed.netloc, f"/{parts[0]}", "", "", "")).rstrip("/")
        if section_root != origin:
            score = 0.74 if not _path_has_date_bucket(f"/{parts[0]}") else 0.45
            result.append(ScopeCandidate(section_root, "section", score, ("Top-level section is the widest safe parent for an item URL.",)))
    return result


def _select_scope_candidate(candidates: list[ScopeCandidate]) -> ScopeCandidate:
    priority = {
        "feed": 0.08,
        "api_endpoint": 0.05,
        "listing_page": 0.04,
        "section": 0.03,
        "document_collection": 0.02,
        "domain_root": -0.08,
        "single_item": -0.18,
        "context_page": -0.04,
        "search_endpoint": -0.06,
        "blocked_or_unusable": 0.04,
        "unknown": -0.12,
    }
    eligible = [candidate for candidate in candidates if candidate.score >= 0.5 or candidate.type in {"single_item", "context_page", "blocked_or_unusable"}]
    pool = eligible or candidates
    return max(pool, key=lambda item: (item.score + priority.get(item.type, 0), item.score, -len(urlparse(item.url).path.split("/"))))


def _scope_candidate_json(candidate: ScopeCandidate, *, selected_url: str) -> dict[str, Any]:
    return {
        "url": candidate.url,
        "type": candidate.type,
        "score": round(candidate.score, 2),
        "evidence": list(candidate.evidence),
        "rejectedReason": candidate.rejected_reason,
        "selected": candidate.url == selected_url,
    }


def _item_extraction_hints(candidate_url: str, resolved_url: str, observations: list[dict[str, Any]], technical: dict[str, Any]) -> dict[str, Any]:
    parsed = urlparse(candidate_url)
    return {
        "itemUrlPatterns": [pattern for pattern in [_item_url_pattern(parsed.path)] if pattern],
        "listingUrlPatterns": [resolved_url] if resolved_url else [],
        "paginationObserved": any(_has_pagination(item) for item in observations) or bool(parse_qs(parsed.query).keys() & {"page", "p", "offset", "cursor"}),
        "dateOrVersionObserved": bool(re.search(r"/\d{4}([/-]\d{1,2})?", parsed.path)),
        "documentLinksObserved": any(int(item.get("documentCountEstimate") or 0) > 0 for item in observations),
        "feedDiscovered": bool(technical.get("feedValid")) or bool(_discovered_feed_urls({}, observations)),
        "apiHintsObserved": bool(technical.get("apiHintsObserved")) or _looks_like_api(parsed, {}, {}, observations),
    }


def _risk(access_pattern: str, scope_type: str, page_hints: dict[str, Any], technical: dict[str, Any]) -> dict[str, Any]:
    return {
        "overallRisk": "high" if access_pattern in {"blocked", "captcha_blocked", "requires_auth"} else "medium" if scope_type in {"domain_root", "search_endpoint", "unknown"} else "low",
        "promptInjectionRisk": "medium" if page_hints.get("communityOrUgcLikely") else "low",
        "seoSpamRisk": "medium" if page_hints.get("secondaryExplainerLikely") or page_hints.get("sellerOrVendorLikely") else "low",
        "ugcManipulationRisk": "medium" if page_hints.get("communityOrUgcLikely") else "low",
        "authOrCaptchaRisk": "high" if access_pattern in {"captcha_blocked", "requires_auth"} else "medium" if access_pattern == "blocked" else "low",
        "crawlBlastRadius": "medium" if scope_type in {"domain_root", "search_endpoint"} else "low",
        "legalRisk": "medium" if access_pattern == "blocked" else "low",
        "unsupportedAdapterRisk": "medium" if scope_type in {"api_endpoint", "document_collection", "search_endpoint", "single_item"} else "low",
        "providerFailureCount": int(technical.get("providerFailureCount") or 0),
    }


def _not_monitoring_reason(scope_type: str, access_pattern: str) -> str | None:
    if access_pattern in {"blocked", "captcha_blocked", "requires_auth"}:
        return f"Access pattern {access_pattern} is not monitorable without unsupported access."
    return {
        "api_endpoint": "API endpoints require declarative or custom adapter support before channel projection.",
        "document_collection": "Document collections require document adapter support before ordinary channel projection.",
        "single_item": "Single item URLs are item evidence, not ordinary source channel URLs.",
        "context_page": "Context pages are retained for evidence/query expansion, not direct channel projection.",
        "search_endpoint": "Search endpoints require bounded list/detail adapter logic before channel projection.",
        "blocked_or_unusable": "Blocked or challenged sources require manual review.",
        "unknown": "Insufficient structural evidence for automatic monitoring.",
    }.get(scope_type)


def _is_document_url(parsed: Any, probe_report: dict[str, Any] | None = None) -> bool:
    path = parsed.path.lower()
    content_type = str((probe_report or {}).get("contentType") or (probe_report or {}).get("content_type") or "").lower()
    return any(path.endswith(ext) for ext in DOCUMENT_EXTENSIONS) or any(token in content_type for token in ("application/pdf", "msword", "spreadsheet", "presentation"))


def _valid_feed(parsed: Any, observations: list[dict[str, Any]], technical: dict[str, Any]) -> bool:
    path = parsed.path.lower()
    looks_feed = any(token in path for token in ("rss", "feed", "atom")) or path.endswith((".xml", ".rss", ".atom"))
    observed_valid = bool(technical.get("feedValid")) or any(bool(item.get("valid")) and item.get("kind") == "feed_probe" for item in observations)
    return looks_feed and observed_valid


def _looks_like_api(parsed: Any, candidate: dict[str, Any], probe_report: dict[str, Any] | None = None, observations: list[dict[str, Any]] | None = None) -> bool:
    text = " ".join(
        [
            parsed.path,
            parsed.query,
            str(candidate.get("candidateKindGuess") or candidate.get("candidate_kind_guess") or ""),
            str((probe_report or {}).get("contentType") or (probe_report or {}).get("content_type") or ""),
            str(observations or []),
        ]
    ).lower()
    return "/api" in text or "openapi" in text or "json" in text or parsed.path.lower().endswith(".json")


def _looks_like_search(parsed: Any) -> bool:
    query_keys = set(parse_qs(parsed.query).keys())
    return bool(query_keys & {"q", "query", "search", "keyword", "keywords", "category", "type", "filter"}) or any(
        token in parsed.path.lower() for token in ("/search", "/find", "/browse")
    )


def _looks_like_context(parsed: Any, page_hints: dict[str, Any], observations: list[dict[str, Any]]) -> bool:
    path = parsed.path.lower()
    if page_hints.get("sellerOrVendorLikely") or page_hints.get("staticEvergreenLikely"):
        return True
    if any(token in path for token in STATIC_CONTEXT_TOKENS):
        return True
    listing_count = _max_observation_int(observations, "listingCountEstimate")
    document_count = _max_observation_int(observations, "documentCountEstimate")
    return "/blog" in path and listing_count == 0 and document_count == 0 and _looks_like_item(parsed)


def _looks_like_item(parsed: Any) -> bool:
    parts = [part for part in parsed.path.split("/") if part]
    if len(parts) >= 3:
        return True
    return bool(ITEM_SEGMENT_RE.search(parsed.path))


def _challenge_observed(probe_report: dict[str, Any], observations: list[dict[str, Any]]) -> bool:
    text = f"{probe_report} {observations}".lower()
    return any(token in text for token in ("captcha", "access denied", "verify you are human", "login required"))


def _listing_evidence_at_url(url: str, observations: list[dict[str, Any]], technical: dict[str, Any]) -> bool:
    if bool(technical.get("hasRecurringStructure")) and _same_path_or_unknown(url, str(technical.get("recurringStructureUrl") or "")):
        return True
    for observation in observations:
        count = int(observation.get("listingCountEstimate") or observation.get("itemLinkCount") or 0)
        observed_url = str(observation.get("url") or observation.get("sourceUrl") or observation.get("listingUrl") or "").strip()
        if count > 0 and (not observed_url or _same_path_or_unknown(url, observed_url)):
            return True
        if observation.get("paginationObserved") and (not observed_url or _same_path_or_unknown(url, observed_url)):
            return True
    return False


def _validated_parent_section(parsed: Any, observations: list[dict[str, Any]], technical: dict[str, Any]) -> str | None:
    parent = _parent_scope_url(parsed)
    if parent and _listing_evidence_at_url(parent, observations, technical):
        return parent
    return None


def _same_path_or_unknown(left: str, right: str) -> bool:
    if not right:
        return True
    left_parsed = urlparse(_normalize_url(left))
    right_parsed = urlparse(_normalize_url(right))
    return left_parsed.netloc == right_parsed.netloc and left_parsed.path.rstrip("/") == right_parsed.path.rstrip("/")


def _max_observation_int(observations: list[dict[str, Any]], key: str) -> int:
    return max((int(item.get(key) or 0) for item in observations), default=0)


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


def _path_has_date_bucket(path: str) -> bool:
    parts = [part for part in path.split("/") if part]
    return any(DATE_SEGMENT_RE.match(part) for part in parts)


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


def _canonical_link(probe_report: dict[str, Any], observations: list[dict[str, Any]]) -> str | None:
    for key in ("canonicalUrl", "canonical_url"):
        value = probe_report.get(key)
        if isinstance(value, str) and value.strip():
            return value
    for observation in observations:
        for key in ("canonicalUrl", "canonical_url"):
            value = observation.get(key)
            if isinstance(value, str) and value.strip():
                return value
    return None


def _referring_collection_url(probe_report: dict[str, Any], observations: list[dict[str, Any]]) -> str | None:
    for key in ("referrerUrl", "referrer_url", "sourcePageUrl", "source_page_url"):
        value = probe_report.get(key)
        if isinstance(value, str) and value.strip():
            return _normalize_url(value)
    for observation in observations:
        for key in ("referrerUrl", "referrer_url", "sourcePageUrl", "source_page_url"):
            value = observation.get(key)
            if isinstance(value, str) and value.strip():
                return _normalize_url(value)
    return None


def _apply_memory_score(candidates: list[ScopeCandidate], previous_memory: dict[str, Any]) -> list[ScopeCandidate]:
    known_good = {str(item).strip() for item in previous_memory.get("knownGoodScopeUrls") or []}
    known_bad = {str(item).strip() for item in previous_memory.get("knownBadScopeUrls") or []}
    result: list[ScopeCandidate] = []
    for candidate in candidates:
        if candidate.url in known_good:
            result.append(ScopeCandidate(candidate.url, candidate.type, min(0.97, candidate.score + 0.05), (*candidate.evidence, "Prior memory marks this scope as useful."), candidate.rejected_reason, candidate.selected))
        elif candidate.url in known_bad:
            result.append(ScopeCandidate(candidate.url, candidate.type, max(0.1, candidate.score - 0.15), (*candidate.evidence, "Prior memory marks this scope as risky/noisy."), candidate.rejected_reason or "known_bad_scope_memory", candidate.selected))
        else:
            result.append(candidate)
    return result


def _dedupe_scope_candidates(candidates: list[ScopeCandidate]) -> list[ScopeCandidate]:
    best: dict[tuple[str, str], ScopeCandidate] = {}
    for candidate in candidates:
        key = (_normalize_url(candidate.url), candidate.type)
        existing = best.get(key)
        if existing is None or candidate.score > existing.score:
            best[key] = ScopeCandidate(_normalize_url(candidate.url), candidate.type, candidate.score, candidate.evidence, candidate.rejected_reason, candidate.selected)
    return sorted(best.values(), key=lambda item: item.score, reverse=True)[:12]


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

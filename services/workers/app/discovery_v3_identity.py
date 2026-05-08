from __future__ import annotations

from typing import Any
from urllib.parse import parse_qs, urlparse

from .discovery_v3_endpoint_classification import canonical_domain_from_url


FEED_PROXY_DOMAINS = {"feedproxy.google.com", "feeds.feedburner.com"}


def normalize_endpoint_url(url: str) -> str:
    parsed = urlparse(url.strip())
    scheme = parsed.scheme.lower() or "https"
    netloc = parsed.netloc.lower()
    path = parsed.path.rstrip("/") or "/"
    if netloc in FEED_PROXY_DOMAINS:
        qs = parse_qs(parsed.query)
        if "q" in qs and qs["q"]:
            return normalize_endpoint_url(qs["q"][0])
    return f"{scheme}://{netloc}{path}"


def identity_key_for_endpoint(endpoint: dict[str, Any]) -> tuple[str, str, str]:
    url = str(endpoint.get("normalized_endpoint_url") or endpoint.get("endpoint_url") or endpoint.get("endpointUrl") or "")
    endpoint_kind = str(endpoint.get("endpoint_kind") or endpoint.get("endpointKind") or "unknown")
    source_role = str(endpoint.get("source_role") or endpoint.get("sourceRole") or "")
    domain = str(endpoint.get("canonical_domain") or canonical_domain_from_url(url))
    return domain, endpoint_kind, source_role


def is_duplicate_endpoint(candidate: dict[str, Any], existing: list[dict[str, Any]]) -> tuple[bool, str | None]:
    candidate_url = normalize_endpoint_url(
        str(candidate.get("normalized_endpoint_url") or candidate.get("endpoint_url") or candidate.get("endpointUrl") or "")
    )
    candidate_key = identity_key_for_endpoint(candidate)
    candidate_title = str(candidate.get("rss_title") or candidate.get("title") or "").lower()
    candidate_site = str(candidate.get("site_link") or candidate.get("homepage_url") or "").lower()
    candidate_channel = str(candidate.get("source_channel_id") or "")

    for row in existing:
        row_url = normalize_endpoint_url(
            str(row.get("normalized_endpoint_url") or row.get("endpoint_url") or row.get("endpointUrl") or "")
        )
        if row_url and row_url == candidate_url:
            return True, "exact_normalized_endpoint"
        if candidate_key == identity_key_for_endpoint(row):
            return True, "same_domain_kind_role"
        row_title = str(row.get("rss_title") or row.get("title") or "").lower()
        row_site = str(row.get("site_link") or row.get("homepage_url") or "").lower()
        if candidate_title and candidate_site and candidate_title == row_title and candidate_site == row_site:
            return True, "same_rss_title_site_link"
        row_channel = str(row.get("source_channel_id") or "")
        if candidate_channel and row_channel and candidate_channel == row_channel:
            return True, "same_source_channel"

    return False, None


def resolve_source_identity(candidate: dict[str, Any], existing: list[dict[str, Any]]) -> dict[str, Any]:
    duplicate, reason = is_duplicate_endpoint(candidate, existing)
    domain, endpoint_kind, source_role = identity_key_for_endpoint(candidate)
    known_feed_urls = []
    endpoint_url = candidate.get("endpoint_url") or candidate.get("endpointUrl")
    if endpoint_kind == "rss_feed" and endpoint_url:
        known_feed_urls.append(normalize_endpoint_url(str(endpoint_url)))

    return {
        "canonical_domain": domain,
        "canonical_organization": candidate.get("organization_name") or candidate.get("title"),
        "known_domains": [domain] if domain else [],
        "known_feed_urls": known_feed_urls,
        "known_homepage_urls": [candidate["homepage_url"]] if candidate.get("homepage_url") else [],
        "identity_confidence": 0.9 if duplicate else 0.55,
        "duplicate": duplicate,
        "duplicateReason": reason,
        "sourceRole": source_role,
    }

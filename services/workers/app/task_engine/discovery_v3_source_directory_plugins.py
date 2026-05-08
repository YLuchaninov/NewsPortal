from __future__ import annotations

from html.parser import HTMLParser
from typing import Any
from urllib.parse import urljoin, urlparse

from ..discovery_v3_endpoint_classification import canonical_domain_from_url
from .discovery_plugin_common import ContextTaskPlugin, _coerce_mapping_list

JUNK_DOMAINS = {
    "facebook.com",
    "instagram.com",
    "linkedin.com",
    "tiktok.com",
    "twitter.com",
    "x.com",
    "youtube.com",
}


class DiscoveryV3SourceDirectoryExtractorPlugin(ContextTaskPlugin):
    name = "discovery.v3.source_directory_extract"
    description = "Extract outbound source-of-sources links from directory/resources HTML."
    category = "discovery"

    async def execute(self, options: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
        origin_url = self._resolve_optional_string(
            options=options,
            context=context,
            key="origin_url",
            aliases=("originUrl",),
        ) or self._resolve_optional_string(options=options, context=context, key="url")
        html = self._resolve_optional_string(options=options, context=context, key="html")
        pages = _coerce_mapping_list(context.get("source_directory_pages") or [], field_name="source_directory_pages")

        discovered_domains: list[dict[str, Any]] = []
        edges: list[dict[str, Any]] = []
        followups: list[dict[str, Any]] = []

        page_inputs = []
        if html and origin_url:
            page_inputs.append({"url": origin_url, "html": html})
        page_inputs.extend(page for page in pages if page.get("html") and page.get("url"))

        for page in page_inputs:
            extracted = extract_source_directory_links(str(page["html"]), origin_url=str(page["url"]))
            discovered_domains.extend(extracted["discoveredDomains"])
            edges.extend(extracted["edges"])
            followups.extend(extracted["followUpHypotheses"])

        return {
            "discovery_v3_source_directory_domains": _dedupe_domain_rows(discovered_domains),
            "discovery_v3_source_edges": edges,
            "discovery_v3_followup_hypotheses": _dedupe_followups(followups),
        }

    def describe_inputs(self) -> dict[str, str]:
        return {
            "html": "HTML from a source-directory/resources page.",
            "origin_url": "URL the HTML was fetched from.",
            "source_directory_pages": "Optional list of {url, html} directory pages.",
        }

    def describe_outputs(self) -> dict[str, str]:
        return {
            "discovery_v3_source_directory_domains": "Outbound domains discovered from directory links.",
            "discovery_v3_source_edges": "Edges linking origin directory to discovered domains.",
            "discovery_v3_followup_hypotheses": "Direct follow-up hypotheses for discovered domains.",
        }


def extract_source_directory_links(html: str, *, origin_url: str) -> dict[str, list[dict[str, Any]]]:
    parser = _AnchorParser()
    parser.feed(html)
    origin_domain = canonical_domain_from_url(origin_url)
    discovered: list[dict[str, Any]] = []
    edges: list[dict[str, Any]] = []
    followups: list[dict[str, Any]] = []
    for href, anchor_text in parser.links:
        absolute_url = urljoin(origin_url, href)
        parsed = urlparse(absolute_url)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            continue
        domain = canonical_domain_from_url(absolute_url)
        if not domain or domain == origin_domain or _is_junk_domain(domain):
            continue
        source_role = _suggested_role(anchor_text, absolute_url)
        discovered.append(
            {
                "canonical_domain": domain,
                "url": absolute_url,
                "anchorText": anchor_text,
                "originUrl": origin_url,
                "confidence": _confidence(anchor_text, absolute_url),
                "suggestedSourceRole": source_role,
            }
        )
        edges.append(
            {
                "from_kind": "source_directory",
                "from_ref": origin_url,
                "to_kind": "domain",
                "to_ref": domain,
                "edge_kind": "discovered_from_source_directory",
                "confidence": _confidence(anchor_text, absolute_url),
                "evidence_json": {"anchorText": anchor_text, "url": absolute_url},
            }
        )
        followups.append(
            {
                "hypothesis_type": "official_entity_source",
                "signal_mode": "direct",
                "source_role": source_role,
                "provider_id": "web_search",
                "seed_domain": domain,
                "query_text": f'{domain} {anchor_text}'.strip(),
                "acquisition_tactic": "source_directory_followup",
                "expected_provider_types": ["rss", "website"],
                "explorer_json": {
                    "originUrl": origin_url,
                    "anchorText": anchor_text,
                    "sourceDirectoryConfidence": _confidence(anchor_text, absolute_url),
                },
            }
        )
    return {
        "discoveredDomains": _dedupe_domain_rows(discovered),
        "edges": edges,
        "followUpHypotheses": _dedupe_followups(followups),
    }


class _AnchorParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.links: list[tuple[str, str]] = []
        self._active_href: str | None = None
        self._text_parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() != "a":
            return
        href = next((value for key, value in attrs if key.lower() == "href" and value), None)
        if href:
            self._active_href = href
            self._text_parts = []

    def handle_data(self, data: str) -> None:
        if self._active_href:
            self._text_parts.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() != "a" or not self._active_href:
            return
        text = " ".join(part.strip() for part in self._text_parts if part.strip())
        self.links.append((self._active_href, text))
        self._active_href = None
        self._text_parts = []


def _suggested_role(anchor_text: str, url: str) -> str:
    text = f"{anchor_text} {url}".lower()
    if any(token in text for token in ("changelog", "release notes", "docs", "migration guide", "developer")):
        return "technical_change"
    if any(token in text for token in ("procurement", "tender", "rfp", "contract", "przetarg", "vergab")):
        return "procurement_signal"
    if any(token in text for token in ("report", "research", "whitepaper", "publication")):
        return "report_research"
    if any(token in text for token in ("data", "dataset", "statistics", "api")):
        return "primary_data"
    return "industry_niche"


def _confidence(anchor_text: str, url: str) -> float:
    text = f"{anchor_text} {url}".lower()
    score = 0.45
    if anchor_text.strip():
        score += 0.15
    if any(token in text for token in ("official", "docs", "report", "procurement", "changelog", "research")):
        score += 0.20
    if any(token in text for token in ("utm_", "affiliate", "sponsored")):
        score -= 0.25
    return round(max(0.0, min(1.0, score)), 4)


def _is_junk_domain(domain: str) -> bool:
    return any(domain == junk or domain.endswith(f".{junk}") for junk in JUNK_DOMAINS)


def _dedupe_domain_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_domain: dict[str, dict[str, Any]] = {}
    for row in rows:
        domain = str(row.get("canonical_domain") or "")
        if not domain:
            continue
        existing = by_domain.get(domain)
        if existing is None or float(row.get("confidence") or 0) > float(existing.get("confidence") or 0):
            by_domain[domain] = row
    return list(by_domain.values())


def _dedupe_followups(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[tuple[str, str, str]] = set()
    deduped: list[dict[str, Any]] = []
    for row in rows:
        key = (
            str(row.get("seed_domain") or ""),
            str(row.get("source_role") or ""),
            str(row.get("query_text") or ""),
        )
        if key in seen:
            continue
        seen.add(key)
        deduped.append(row)
    return deduped

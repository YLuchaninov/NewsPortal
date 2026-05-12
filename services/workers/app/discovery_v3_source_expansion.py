from __future__ import annotations

from typing import Any
from urllib.parse import urlparse


ROLE_EXPANSION_PATTERNS: dict[str, list[str]] = {
    "authoritative_anchor": ["/blog", "/newsroom", "/press", "/announcements", "/feed.xml", "/rss.xml"],
    "technical_change": ["/docs", "/changelog", "/release-notes", "/developers", "/engineering", "/feed.xml"],
    "security_advisory": ["/security", "/security/advisories", "/advisories", "/cve", "/psirt"],
    "procurement_signal": ["/procurement", "/tenders", "/contracts", "/przetargi", "/zamowienia", "/ausschreibungen"],
    "primary_data": ["/data", "/datasets", "/open-data", "/api", "/openapi.json", "/swagger.json"],
    "report_research": ["/reports", "/research", "/publications", "/resources", "/downloads"],
    "regulatory_policy": ["/policy", "/policies", "/guidance", "/regulations", "/laws", "/standards"],
    "industry_niche": ["/news", "/analysis", "/insights", "/newsletter", "/archive", "/feed.xml"],
    "source_directory": ["/resources", "/links", "/directory", "/partners", "/vendors", "/ecosystem"],
}


def build_existing_source_hypotheses(
    *,
    target: dict[str, Any],
    graph: dict[str, Any],
    run: dict[str, Any],
    source_inventory: list[dict[str, Any]],
    channel_id: str | None = None,
    replacement_only: bool = False,
) -> list[dict[str, Any]]:
    hypotheses: list[dict[str, Any]] = []
    for source in source_inventory:
        if channel_id and str(source.get("channel_id")) != str(channel_id):
            continue
        role = str(source.get("source_role") or source.get("sourceRole") or "source_directory")
        domain = _canonical_domain(source)
        if not domain:
            continue
        status = _classify_source(source)
        hypotheses.extend(
            _discovered_feed_hypotheses(target=target, graph=graph, run=run, source=source, role=role, domain=domain)
        )
        if status in {"strong", "probation"} and not replacement_only:
            hypotheses.extend(_sibling_and_feed_hypotheses(target=target, graph=graph, run=run, source=source, role=role, domain=domain))
        if status in {"weak", "broken", "degraded"} or replacement_only:
            hypotheses.extend(_replacement_hypotheses(target=target, graph=graph, run=run, source=source, role=role, domain=domain))
    return hypotheses


def _discovered_feed_hypotheses(
    *,
    target: dict[str, Any],
    graph: dict[str, Any],
    run: dict[str, Any],
    source: dict[str, Any],
    role: str,
    domain: str,
) -> list[dict[str, Any]]:
    discovered_feed_urls = _source_discovered_feed_urls(source)
    if not discovered_feed_urls:
        return []
    topic = str(graph.get("coreTopic") or target.get("title") or "")
    return [
        {
            "run_id": run.get("run_id"),
            "target_id": target["target_id"],
            "hypothesis_type": "discovered_feed_candidate",
            "signal_mode": "source_expansion",
            "source_role": role,
            "acquisition_tactic": "feed_probe_autodiscovery",
            "seed_domain": domain,
            "seed_url": feed_url,
            "query_text": f"site:{_canonical_domain({'fetch_url': feed_url}) or domain} {topic}".strip(),
            "provider_id": "web_search",
            "expected_provider_types": ["rss"],
            "expected_endpoint_kinds": ["rss_feed"],
            "endpoint_patterns": [],
            "seed_urls": [feed_url],
            "expected_data_shape": role,
            "priority_score": 0.78,
            "gap_score": 0.35,
            "risk_score": 0.25,
            "confidence_score": 0.72,
            "explorer_json": {
                "generatedBy": "existing_source_feed_probe_evidence",
                "channelId": str(source.get("channel_id")),
                "sourceDomain": domain,
                "discoveredFeedUrl": feed_url,
                "reason": "Existing source evidence includes a discovered feed URL from fetchers feed probe.",
            },
        }
        for feed_url in discovered_feed_urls
    ]


def _sibling_and_feed_hypotheses(
    *,
    target: dict[str, Any],
    graph: dict[str, Any],
    run: dict[str, Any],
    source: dict[str, Any],
    role: str,
    domain: str,
) -> list[dict[str, Any]]:
    patterns = ROLE_EXPANSION_PATTERNS.get(role, ROLE_EXPANSION_PATTERNS["source_directory"])
    topic = str(graph.get("coreTopic") or target.get("title") or "")
    return [
        {
            "run_id": run.get("run_id"),
            "target_id": target["target_id"],
            "hypothesis_type": "sibling_endpoint",
            "signal_mode": "source_expansion",
            "source_role": role,
            "acquisition_tactic": "endpoint_pattern_sweep",
            "seed_domain": domain,
            "query_text": f"site:{domain} {topic}".strip(),
            "provider_id": "web_search",
            "expected_provider_types": ["rss", "website"],
            "expected_endpoint_kinds": [],
            "endpoint_patterns": patterns,
            "expected_data_shape": role,
            "priority_score": 0.75,
            "gap_score": 0.5,
            "risk_score": 0.35,
            "confidence_score": 0.65,
            "explorer_json": {
                "generatedBy": "existing_source_expansion",
                "channelId": str(source.get("channel_id")),
                "reason": "Strong/probation source may expose sibling endpoints on the same domain.",
            },
        },
        {
            "run_id": run.get("run_id"),
            "target_id": target["target_id"],
            "hypothesis_type": "feed_discovery",
            "signal_mode": "source_expansion",
            "source_role": role,
            "acquisition_tactic": "rss_autodiscovery",
            "seed_domain": domain,
            "query_text": f"site:{domain} feed rss {topic}".strip(),
            "provider_id": "web_search",
            "expected_provider_types": ["rss"],
            "expected_endpoint_kinds": ["rss_feed"],
            "endpoint_patterns": ["/feed.xml", "/rss.xml", "/atom.xml", "/feed", "/rss"],
            "expected_data_shape": role,
            "priority_score": 0.7,
            "gap_score": 0.45,
            "risk_score": 0.3,
            "confidence_score": 0.6,
            "explorer_json": {
                "generatedBy": "existing_source_expansion",
                "channelId": str(source.get("channel_id")),
            },
        },
    ]


def _replacement_hypotheses(
    *,
    target: dict[str, Any],
    graph: dict[str, Any],
    run: dict[str, Any],
    source: dict[str, Any],
    role: str,
    domain: str,
) -> list[dict[str, Any]]:
    topic = str(graph.get("coreTopic") or target.get("title") or "")
    language = str(source.get("language") or "")
    geo = str(source.get("country") or "")
    suffix = " ".join(part for part in [geo, language] if part)
    return [
        {
            "run_id": run.get("run_id"),
            "target_id": target["target_id"],
            "hypothesis_type": "replacement_source",
            "signal_mode": "replacement",
            "source_role": role,
            "acquisition_tactic": "same_role_replacement_search",
            "query_text": f'"{topic}" {role.replace("_", " ")} {suffix}'.strip(),
            "provider_id": "web_search",
            "expected_provider_types": ["rss", "website"],
            "expected_endpoint_kinds": [],
            "endpoint_patterns": ROLE_EXPANSION_PATTERNS.get(role, []),
            "expected_data_shape": role,
            "priority_score": 0.85,
            "gap_score": 0.75,
            "risk_score": 0.45,
            "confidence_score": 0.55,
            "explorer_json": {
                "generatedBy": "existing_source_replacement",
                "channelId": str(source.get("channel_id")),
                "replacementForDomain": domain,
            },
        }
    ]


def _classify_source(source: dict[str, Any]) -> str:
    config = source.get("config_json") if isinstance(source.get("config_json"), dict) else {}
    discovery = config.get("discovery") if isinstance(config.get("discovery"), dict) else {}
    trust_stage = str(discovery.get("trustStage") or "").lower()
    contribution = float(discovery.get("coverageContribution") or 0)
    if trust_stage == "degraded" or contribution == 0:
        return "degraded"
    if trust_stage == "probation":
        return "probation"
    if source.get("last_error_at") and not source.get("last_success_at"):
        return "broken"
    if source.get("is_active") is False:
        return "weak"
    return "strong"


def _source_discovered_feed_urls(source: dict[str, Any]) -> list[str]:
    urls: list[str] = []

    def collect(value: Any) -> None:
        if isinstance(value, str):
            urls.append(value)
            return
        if isinstance(value, list):
            for item in value:
                if isinstance(item, str):
                    urls.append(item)

    for key in ("discovered_feed_urls", "discoveredFeedUrls", "hidden_rss_urls", "hiddenRssUrls"):
        collect(source.get(key))

    for container_key in ("evaluation_json", "evaluationJson", "evidence_json", "evidenceJson"):
        container = source.get(container_key)
        if not isinstance(container, dict):
            continue
        for key in ("discovered_feed_urls", "discoveredFeedUrls", "hidden_rss_urls", "hiddenRssUrls"):
            collect(container.get(key))

    config = source.get("config_json") if isinstance(source.get("config_json"), dict) else {}
    for container_key in ("discoveryHints", "discovery_hints", "discovery"):
        container = config.get(container_key)
        if not isinstance(container, dict):
            continue
        for key in ("discovered_feed_urls", "discoveredFeedUrls", "hidden_rss_urls", "hiddenRssUrls"):
            collect(container.get(key))

    unique: list[str] = []
    seen: set[str] = set()
    for url in urls:
        normalized = url.strip()
        parsed = urlparse(normalized)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            continue
        key = normalized.rstrip("/")
        if key not in seen:
            seen.add(key)
            unique.append(normalized)
    return unique[:12]


def _canonical_domain(source: dict[str, Any]) -> str:
    for key in ("fetch_url", "homepage_url"):
        value = source.get(key)
        if isinstance(value, str) and value.strip():
            parsed = urlparse(value if "://" in value else f"https://{value}")
            domain = parsed.netloc.lower().removeprefix("www.")
            if domain:
                return domain
    return ""

from __future__ import annotations

from typing import Any
from urllib.parse import urlparse

from ..discovery_v3_endpoint_classification import (
    DEFAULT_ENDPOINT_PATTERNS,
    GERMANY_ENDPOINT_PATTERNS,
    POLAND_ENDPOINT_PATTERNS,
    canonical_domain_from_url,
    classify_endpoint_kind,
    infer_provider_type,
)
from .discovery_plugin_common import ContextTaskPlugin, _coerce_mapping_list


class DiscoveryV3EndpointSweepPlugin(ContextTaskPlugin):
    name = "discovery.v3.endpoint_sweep"
    description = "Generate v3 source endpoint candidates from domains, seed URLs and role-specific patterns."
    category = "discovery"

    async def execute(self, options: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
        domains = _domain_values(options.get("domains") or context.get("domains") or [])
        domains.extend(
            row["canonical_domain"]
            for row in _coerce_mapping_list(
                context.get("discovery_v3_domain_inventory") or [],
                field_name="discovery_v3_domain_inventory",
            )
            if row.get("canonical_domain")
        )
        seed_urls = _string_list(options.get("seedUrls") or options.get("seed_urls") or context.get("seed_urls") or [])
        source_role = str(options.get("sourceRole") or options.get("source_role") or context.get("source_role") or "source_directory")
        signal_mode = str(options.get("signalMode") or options.get("signal_mode") or context.get("signal_mode") or "direct")
        patterns = _endpoint_patterns(options, context)
        endpoints = sweep_endpoint_candidates(
            domains=domains,
            seed_urls=seed_urls,
            endpoint_patterns=patterns,
            source_role=source_role,
            signal_mode=signal_mode,
        )
        return {"discovery_v3_endpoint_candidates": endpoints}

    def describe_inputs(self) -> dict[str, str]:
        return {
            "domains": "Candidate domains to sweep.",
            "seed_urls": "Seed URLs to preserve as endpoint candidates.",
            "source_role": "Source role expected for generated endpoints.",
            "signal_mode": "Signal mode, usually direct for endpoint candidates.",
        }

    def describe_outputs(self) -> dict[str, str]:
        return {"discovery_v3_endpoint_candidates": "Endpoint candidates ready for probe/scoring."}


def sweep_endpoint_candidates(
    *,
    domains: list[str],
    seed_urls: list[str] | None = None,
    endpoint_patterns: list[str] | None = None,
    source_role: str = "source_directory",
    signal_mode: str = "direct",
) -> list[dict[str, Any]]:
    signal_mode = _endpoint_signal_mode(signal_mode)
    patterns = endpoint_patterns or DEFAULT_ENDPOINT_PATTERNS
    rows: dict[str, dict[str, Any]] = {}
    for seed_url in seed_urls or []:
        _add_endpoint(rows, seed_url, source_role=source_role, signal_mode=signal_mode, origin_kind="seed_url")
    for domain in _dedupe_domains(domains):
        for pattern in patterns:
            url = f"https://{domain}{pattern if pattern.startswith('/') else '/' + pattern}"
            _add_endpoint(rows, url, source_role=source_role, signal_mode=signal_mode, origin_kind="endpoint_sweep")
    return list(rows.values())


def _add_endpoint(
    rows: dict[str, dict[str, Any]],
    url: str,
    *,
    source_role: str,
    signal_mode: str,
    origin_kind: str,
) -> None:
    signal_mode = _endpoint_signal_mode(signal_mode)
    parsed = urlparse(url.strip())
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return
    endpoint_url = f"{parsed.scheme.lower()}://{parsed.netloc.lower()}{parsed.path or '/'}"
    if parsed.query:
        endpoint_url = f"{endpoint_url}?{parsed.query}"
    endpoint_kind = classify_endpoint_kind(endpoint_url)
    provider_type = infer_provider_type(endpoint_kind, endpoint_url)
    domain = canonical_domain_from_url(endpoint_url)
    row = {
        "endpoint_url": endpoint_url,
        "normalized_endpoint_url": endpoint_url,
        "canonical_domain": domain,
        "homepage_url": f"https://{domain}",
        "provider_type": provider_type,
        "endpoint_kind": endpoint_kind,
        "source_role": source_role,
        "signal_mode": signal_mode,
        "origin_kind": origin_kind,
        "evidence_json": {"generatedBy": "discovery.v3.endpoint_sweep"},
        "novelty_score": 1.0,
    }
    if origin_kind == "seed_url":
        row.update(
            {
                "interest_fit_score": 0.90,
                "coverage_gap_score": 1.0,
                "adversarial_confidence_score": 0.80,
                "quality_score": 0.65,
            }
        )
    rows.setdefault(endpoint_url, row)


def _endpoint_signal_mode(value: str) -> str:
    normalized = str(value or "direct").strip().lower()
    if normalized in {"direct", "hidden", "mixed"}:
        return normalized
    return "direct"


def _endpoint_patterns(options: dict[str, Any], context: dict[str, Any]) -> list[str]:
    patterns = _string_list(options.get("endpointPatterns") or options.get("endpoint_patterns") or [])
    if not patterns:
        patterns = list(DEFAULT_ENDPOINT_PATTERNS)
    languages = {item.lower() for item in _string_list(options.get("languages") or context.get("languages") or [])}
    geos = {item.lower() for item in _string_list(options.get("geos") or context.get("geos") or [])}
    if "pl" in languages or "poland" in geos or "polska" in geos:
        patterns.extend(POLAND_ENDPOINT_PATTERNS)
    if "de" in languages or "germany" in geos or "deutschland" in geos:
        patterns.extend(GERMANY_ENDPOINT_PATTERNS)
    return _unique_strings(patterns)


def _domain_values(value: Any) -> list[str]:
    if isinstance(value, list):
        return [
            str(item.get("canonical_domain") if isinstance(item, dict) else item).strip().lower()
            for item in value
            if str(item.get("canonical_domain") if isinstance(item, dict) else item).strip()
        ]
    return []


def _string_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item).strip() for item in value if str(item).strip()]


def _dedupe_domains(domains: list[str]) -> list[str]:
    return _unique_strings(domain[4:] if domain.startswith("www.") else domain for domain in domains if "." in domain)


def _unique_strings(values: list[str]) -> list[str]:
    seen: set[str] = set()
    unique: list[str] = []
    for value in values:
        if value and value not in seen:
            seen.add(value)
            unique.append(value)
    return unique

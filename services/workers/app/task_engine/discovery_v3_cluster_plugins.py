from __future__ import annotations

from typing import Any
from urllib.parse import urlparse

from ..discovery_v3_endpoint_classification import canonical_domain_from_url, classify_endpoint_kind
from .discovery_plugin_common import ContextTaskPlugin, _coerce_mapping_list


class DiscoveryV3UrlClusterPlugin(ContextTaskPlugin):
    name = "discovery.v3.url_cluster"
    description = "Cluster v3 discovery search/provider results by canonical domain and endpoint-like kind."
    category = "discovery"

    async def execute(self, options: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
        field = self._resolve_optional_string(
            options=options,
            context=context,
            key="results_field",
            aliases=("resultsField",),
        ) or "search_results"
        results = _coerce_mapping_list(context.get(field) or options.get("results") or [], field_name=field)
        clustered = cluster_discovery_results(results)
        return {
            "discovery_v3_clustered_results": clustered["results"],
            "discovery_v3_domain_inventory": clustered["domains"],
        }

    def describe_inputs(self) -> dict[str, str]:
        return {
            "search_results": "Search/provider result objects containing url/title/snippet.",
            "results_field": "Optional context field holding result objects.",
        }

    def describe_outputs(self) -> dict[str, str]:
        return {
            "discovery_v3_clustered_results": "Normalized result rows with canonical URL/domain and result kind.",
            "discovery_v3_domain_inventory": "Domain-level inventory hints derived from result clustering.",
        }


def cluster_discovery_results(results: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    by_url: dict[str, dict[str, Any]] = {}
    domains: dict[str, dict[str, Any]] = {}
    for result in results:
        url = _http_url(str(result.get("url") or result.get("link") or ""))
        if not url:
            continue
        normalized_url = _normalize_url(url)
        domain = canonical_domain_from_url(normalized_url)
        if not domain:
            continue
        result_kind = classify_endpoint_kind(normalized_url)
        if result_kind == "unknown":
            result_kind = _classify_result_from_text(result)
        row = {
            **result,
            "url": url,
            "canonical_url": normalized_url,
            "canonical_domain": domain,
            "result_kind": result_kind,
        }
        by_url.setdefault(normalized_url, row)
        domain_row = domains.setdefault(
            domain,
            {
                "canonical_domain": domain,
                "homepage_url": f"https://{domain}",
                "seen_count": 0,
                "result_kinds": [],
                "evidence_json": {"sampleResults": []},
            },
        )
        domain_row["seen_count"] += 1
        if result_kind not in domain_row["result_kinds"]:
            domain_row["result_kinds"].append(result_kind)
        if len(domain_row["evidence_json"]["sampleResults"]) < 5:
            domain_row["evidence_json"]["sampleResults"].append(
                {
                    "url": normalized_url,
                    "title": result.get("title"),
                    "resultKind": result_kind,
                }
            )
    return {"results": list(by_url.values()), "domains": list(domains.values())}


def _http_url(value: str) -> str | None:
    parsed = urlparse(value.strip())
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return None
    return value.strip()


def _normalize_url(url: str) -> str:
    parsed = urlparse(url.strip())
    path = parsed.path.rstrip("/") or "/"
    query = f"?{parsed.query}" if parsed.query else ""
    return f"{parsed.scheme.lower()}://{parsed.netloc.lower()}{path}{query}"


def _classify_result_from_text(result: dict[str, Any]) -> str:
    text = " ".join(str(result.get(key) or "") for key in ("title", "snippet", "description")).lower()
    if any(token in text for token in ("resources", "directory", "partners", "vendors")):
        return "source_directory"
    if any(token in text for token in ("report", "research", "whitepaper")):
        return "report"
    if any(token in text for token in ("tender", "procurement", "contract award")):
        return "procurement"
    if any(token in text for token in ("changelog", "release notes", "docs")):
        return "docs"
    if any(token in text for token in ("newsroom", "press release", "announcement")):
        return "newsroom"
    return "unknown"

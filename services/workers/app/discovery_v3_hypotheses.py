from __future__ import annotations

from typing import Any

from .discovery_v3_query_templates import (
    HIDDEN_SIGNAL_QUERIES,
    OFFICIAL_SOURCE_QUERIES,
    PRIMARY_DATA_SOURCE_QUERIES,
    PROCUREMENT_SOURCE_QUERIES,
    REGULATORY_POLICY_SOURCE_QUERIES,
    REPORT_RESEARCH_SOURCE_QUERIES,
    SECURITY_SOURCE_QUERIES,
    TECHNICAL_SOURCE_QUERIES,
)


ROLE_TEMPLATE_MAP = {
    "authoritative_anchor": ("official_source", OFFICIAL_SOURCE_QUERIES, "direct"),
    "official_newsroom": ("official_source", OFFICIAL_SOURCE_QUERIES, "direct"),
    "technical_change": ("technical_source", TECHNICAL_SOURCE_QUERIES, "direct"),
    "security_advisory": ("security_source", SECURITY_SOURCE_QUERIES, "direct"),
    "procurement_signal": ("procurement_source", PROCUREMENT_SOURCE_QUERIES, "direct"),
    "primary_data": ("primary_data_source", PRIMARY_DATA_SOURCE_QUERIES, "direct"),
    "report_research": ("report_research_source", REPORT_RESEARCH_SOURCE_QUERIES, "direct"),
    "regulatory_policy": ("regulatory_policy_source", REGULATORY_POLICY_SOURCE_QUERIES, "direct"),
    "social_pain_signal": ("social_need_signal", HIDDEN_SIGNAL_QUERIES, "hidden"),
}


def build_initial_frontier(
    *,
    target: dict[str, Any],
    graph: dict[str, Any],
    coverage: dict[str, Any],
    run: dict[str, Any],
) -> list[dict[str, Any]]:
    topic = str(graph.get("coreTopic") or target.get("title") or "")
    entities = list(graph.get("entities") or []) or [topic]
    gaps = list(coverage.get("gaps_json") or [])
    if not gaps:
        gaps = [{"sourceRole": "source_directory", "gapScore": 0.4}]

    hypotheses: list[dict[str, Any]] = []
    seed_source_role = _seed_source_role(target=target, gaps=gaps)
    seed_endpoint_patterns = _seed_endpoint_patterns(seed_source_role)
    seed_endpoint_kinds = _seed_endpoint_kinds(seed_source_role)
    for seed_url in _string_list(target.get("seed_urls") or target.get("seedUrls")):
        hypotheses.append(
            {
                "run_id": run.get("run_id"),
                "target_id": target["target_id"],
                "hypothesis_type": "seed_endpoint_probe",
                "signal_mode": "direct",
                "source_role": seed_source_role,
                "acquisition_tactic": "seed_endpoint_probe",
                "seed_url": seed_url,
                "provider_id": "web_search",
                "expected_provider_types": ["rss", "website"],
                "expected_endpoint_kinds": seed_endpoint_kinds,
                "endpoint_patterns": [],
                "expected_data_shape": seed_source_role,
                "priority_score": 0.85,
                "gap_score": 0.75,
                "risk_score": 0.25,
                "confidence_score": 0.75,
                "explorer_json": {"generatedBy": "deterministic_seed_url", "seedSourceRole": seed_source_role},
            }
        )
    for seed_domain in _string_list(target.get("seed_domains") or target.get("seedDomains")):
        hypotheses.append(
            {
                "run_id": run.get("run_id"),
                "target_id": target["target_id"],
                "hypothesis_type": "seed_domain_sweep",
                "signal_mode": "direct",
                "source_role": seed_source_role,
                "acquisition_tactic": "seed_domain_endpoint_sweep",
                "query_text": _seed_domain_query(seed_domain, seed_source_role),
                "seed_domain": seed_domain,
                "provider_id": "web_search",
                "expected_provider_types": ["rss", "website"],
                "expected_endpoint_kinds": seed_endpoint_kinds,
                "endpoint_patterns": seed_endpoint_patterns,
                "expected_data_shape": seed_source_role,
                "priority_score": 0.80,
                "gap_score": 0.70,
                "risk_score": 0.30,
                "confidence_score": 0.70,
                "explorer_json": {"generatedBy": "deterministic_seed_domain", "seedSourceRole": seed_source_role},
            }
        )
    for gap in gaps:
        role = str(gap.get("sourceRole") or "source_directory")
        hypothesis_type, templates, signal_mode = ROLE_TEMPLATE_MAP.get(
            role,
            ("source_directory", ['"{topic}" resources', '"{topic}" directory'], "direct"),
        )
        for template in templates:
            for entity in entities[:3]:
                query = template.format(topic=topic, entity=entity)
                hypotheses.append(
                    {
                        "run_id": run.get("run_id"),
                        "target_id": target["target_id"],
                        "hypothesis_type": hypothesis_type,
                        "signal_mode": signal_mode,
                        "source_role": role,
                        "acquisition_tactic": "search_fanout",
                        "query_text": query,
                        "provider_id": "web_search" if signal_mode == "direct" else "reddit",
                        "expected_provider_types": ["rss", "website"],
                        "expected_endpoint_kinds": [],
                        "endpoint_patterns": [],
                        "expected_data_shape": role,
                        "priority_score": float(gap.get("gapScore") or 0.5),
                        "gap_score": float(gap.get("gapScore") or 0.5),
                        "risk_score": 0.45 if signal_mode == "direct" else 0.60,
                        "confidence_score": 0.55,
                        "explorer_json": {"generatedBy": "deterministic_frontier"},
                    }
                )
    return hypotheses


def _string_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item).strip() for item in value if str(item).strip()]


def _seed_source_role(*, target: dict[str, Any], gaps: list[dict[str, Any]]) -> str:
    target_text = " ".join(
        [
            str(target.get("title") or ""),
            str(target.get("description") or ""),
            *(_string_list(target.get("seed_topics") or target.get("seedTopics"))),
            *(_string_list(target.get("seed_entities") or target.get("seedEntities"))),
        ]
    ).lower()
    graph = target.get("graph_json") or target.get("graphJson") or {}
    if isinstance(graph, dict):
        explicit_roles = set((graph.get("sourceRoleTargets") or graph.get("source_role_targets") or {}).keys())
        for role in (
            "procurement_signal",
            "primary_data",
            "report_research",
            "regulatory_policy",
            "security_advisory",
            "technical_change",
            "authoritative_anchor",
            "official_newsroom",
            "industry_niche",
            "source_directory",
        ):
            if role in explicit_roles:
                return role
    gap_roles = [str(gap.get("sourceRole") or gap.get("source_role") or "") for gap in gaps]
    role_priority = (
        (
            "procurement_signal",
            (
                "procurement",
                "tender",
                "contract award",
                "contract opportunities",
                "przetarg",
                "zamówienie",
                "zamowienie",
                "ausschreibung",
                "vergabe",
            ),
        ),
        ("regulatory_policy", ("regulatory", "regulation", "policy", "guidance", "standards", "laws")),
        ("primary_data", ("dataset", "open data", "statistics", "data portal", "eurostat")),
        ("report_research", ("report", "research", "publication", "whitepaper", "publications")),
        ("security_advisory", ("security", "advisory", "vulnerability", "cve", "psirt")),
    )
    for role, tokens in role_priority:
        if role in gap_roles or any(token in target_text for token in tokens):
            return role
    if "procurement_signal" in gap_roles or any(
        token in target_text for token in ("procurement", "tender", "contract award", "contract opportunities")
    ):
        return "procurement_signal"
    return "technical_change"


def _seed_endpoint_patterns(source_role: str) -> list[str]:
    if source_role == "security_advisory":
        return ["/security", "/security/advisories", "/advisories", "/cve", "/psirt", "/vulnerabilities"]
    if source_role == "procurement_signal":
        return [
            "/opportunities",
            "/content/opportunities",
            "/search",
            "/Search",
            "/tenders",
            "/contracts",
            "/contract-awards",
            "/procurement",
            "/przetargi",
            "/zamowienia",
            "/zamówienia",
            "/postepowania",
            "/postępowania",
            "/bip",
            "/ausschreibungen",
            "/vergaben",
            "/bekanntmachungen",
        ]
    if source_role == "primary_data":
        return ["/data", "/datasets", "/open-data", "/statistics", "/downloads", "/api", "/openapi.json", "/swagger.json"]
    if source_role == "report_research":
        return ["/reports", "/research", "/publications", "/whitepapers", "/resources", "/downloads"]
    if source_role == "regulatory_policy":
        return ["/policy", "/policies", "/guidance", "/regulations", "/regulatory", "/laws", "/standards"]
    return ["/feed.xml", "/rss.xml", "/atom.xml", "/feed", "/rss", "/blog"]


def _seed_endpoint_kinds(source_role: str) -> list[str]:
    if source_role == "security_advisory":
        return ["security_advisory"]
    if source_role == "procurement_signal":
        return ["procurement", "tender_listing"]
    if source_role == "primary_data":
        return ["dataset", "api_openapi"]
    if source_role == "report_research":
        return ["report_library", "source_directory"]
    if source_role == "regulatory_policy":
        return ["regulatory_policy"]
    return ["rss_feed", "blog"]


def _seed_domain_query(seed_domain: str, source_role: str) -> str:
    if source_role == "security_advisory":
        return f"site:{seed_domain} (security OR advisory OR vulnerability OR CVE)"
    if source_role == "procurement_signal":
        return f"site:{seed_domain} (tender OR procurement OR opportunities OR contracts)"
    if source_role == "primary_data":
        return f"site:{seed_domain} (dataset OR data OR statistics OR downloads)"
    if source_role == "report_research":
        return f"site:{seed_domain} (reports OR research OR publications OR whitepaper)"
    if source_role == "regulatory_policy":
        return f"site:{seed_domain} (policy OR guidance OR regulations OR laws OR standards)"
    return f"site:{seed_domain} (rss OR atom OR feed)"

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
    if str(run.get("run_kind") or run.get("runKind") or "") == "hidden_signal_scan":
        gaps = [
            {"sourceRole": "social_pain_signal", "gapScore": 0.95},
            *[gap for gap in gaps if str(gap.get("sourceRole") or gap.get("source_role") or "") == "social_pain_signal"],
        ]
    else:
        gaps = _filter_gaps_for_target(target=target, graph=graph, gaps=gaps)

    hypotheses: list[dict[str, Any]] = []
    seed_source_role = _seed_source_role(target=target, graph=graph, gaps=gaps)
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
        hidden_claim_extraction = _hidden_claim_extraction_config(target=target, graph=graph)
        for template in templates:
            topic_values = _topic_values(topic=topic, graph=graph, signal_mode=signal_mode)
            for entity in entities[:3]:
                for topic_value in topic_values[:5]:
                    query = template.format(topic=topic_value, entity=entity)
                    hypotheses.append(
                        {
                            "run_id": run.get("run_id"),
                            "target_id": target["target_id"],
                            "hypothesis_type": hypothesis_type,
                            "signal_mode": signal_mode,
                            "source_role": role,
                            "acquisition_tactic": "search_fanout",
                            "query_text": query,
                            "seed_entity": entity,
                            "provider_id": "web_search",
                            "control_query_text": _control_query(topic_value, entity) if signal_mode == "hidden" else None,
                            "control_provider_id": "web_search" if signal_mode == "hidden" else None,
                            "control_expected_noise": 0.35 if signal_mode == "hidden" else None,
                            "expected_provider_types": ["rss", "website"],
                            "expected_endpoint_kinds": [],
                            "endpoint_patterns": [],
                            "expected_data_shape": role,
                            "priority_score": float(gap.get("gapScore") or 0.5),
                            "gap_score": float(gap.get("gapScore") or 0.5),
                            "risk_score": 0.45 if signal_mode == "direct" else 0.60,
                            "confidence_score": 0.55,
                            "explorer_json": {
                                "generatedBy": "deterministic_frontier",
                                **(
                                    {"hiddenClaimExtraction": hidden_claim_extraction}
                                    if signal_mode == "hidden" and hidden_claim_extraction
                                    else {}
                                ),
                            },
                            **(
                                {"hiddenClaimExtraction": hidden_claim_extraction}
                                if signal_mode == "hidden" and hidden_claim_extraction
                                else {}
                            ),
                        }
                    )
    return hypotheses


def _topic_values(*, topic: str, graph: dict[str, Any], signal_mode: str) -> list[str]:
    if signal_mode != "hidden":
        return [topic]
    values = [
        *[str(item).strip() for item in list(graph.get("subtopics") or []) if str(item).strip()],
        *[str(item).strip() for item in list(graph.get("entities") or []) if str(item).strip()],
        topic,
    ]
    return list(dict.fromkeys(value for value in values if value))


def _control_query(topic: str, entity: str) -> str:
    del topic, entity
    return '"project management software"'


def _string_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item).strip() for item in value if str(item).strip()]


def _record(value: Any) -> dict[str, Any]:
    return dict(value) if isinstance(value, dict) else {}


def _hidden_claim_extraction_config(*, target: dict[str, Any], graph: dict[str, Any]) -> dict[str, Any]:
    for container in (graph, _record(target.get("policy_json")), _record(target.get("autopilot_json"))):
        value = container.get("hiddenClaimExtraction") or container.get("hidden_claim_extraction")
        if isinstance(value, dict):
            return dict(value)
        candidate_signals = container.get("candidateSignals") or container.get("candidate_signals")
        if isinstance(candidate_signals, dict):
            return {
                "positiveGroups": candidate_signals.get("positiveGroups") or [],
                "negativeGroups": candidate_signals.get("negativeGroups") or [],
            }
    return {}


def _preferred_source_roles(*, target: dict[str, Any], graph: dict[str, Any]) -> list[str]:
    for container in (
        graph,
        _record(target.get("graph_json") or target.get("graphJson")),
        _record(target.get("policy_json") or target.get("policyJson")),
        _record(target.get("autopilot_json") or target.get("autopilotJson")),
    ):
        for key in ("preferredSourceRoles", "preferred_source_roles", "sourceRoleHints", "source_role_hints"):
            roles = _string_list(container.get(key))
            if roles:
                return roles
    return []


def _filter_gaps_for_target(
    *,
    target: dict[str, Any],
    graph: dict[str, Any],
    gaps: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    preferred_roles = _preferred_source_roles(target=target, graph=graph)
    if not preferred_roles:
        return gaps
    preferred = [
        gap
        for gap in gaps
        if str(gap.get("sourceRole") or gap.get("source_role") or "") in set(preferred_roles)
    ]
    if preferred:
        return preferred
    return [{"sourceRole": role, "gapScore": 0.65} for role in preferred_roles]


def _seed_source_role(*, target: dict[str, Any], graph: dict[str, Any], gaps: list[dict[str, Any]]) -> str:
    gap_roles = [str(gap.get("sourceRole") or gap.get("source_role") or "") for gap in gaps]
    preferred_roles = _preferred_source_roles(target=target, graph=graph)
    if preferred_roles:
        for role in gap_roles:
            if role in preferred_roles:
                return role
        return preferred_roles[0]
    explicit_roles: set[str] = set()
    if isinstance(graph, dict):
        explicit_roles = set((graph.get("sourceRoleTargets") or graph.get("source_role_targets") or {}).keys())
        if len(explicit_roles) == 1:
            return next(iter(explicit_roles))
    role_priority = (
        "procurement_signal",
        "regulatory_policy",
        "primary_data",
        "report_research",
        "security_advisory",
    )
    for role in role_priority:
        if role in gap_roles and not explicit_roles:
            return role
    if not explicit_roles and "procurement_signal" in gap_roles:
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
    if source_role == "source_directory":
        return ["/jobs", "/careers", "/openings", "/postings", "/api", "/feed.xml", "/rss.xml", "/atom.xml", "/feed", "/rss"]
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
    if source_role == "source_directory":
        return ["rss_feed", "api_openapi", "source_directory"]
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
    if source_role == "source_directory":
        return f"site:{seed_domain} (jobs OR careers OR postings OR api OR rss OR atom OR feed)"
    return f"site:{seed_domain} (rss OR atom OR feed)"

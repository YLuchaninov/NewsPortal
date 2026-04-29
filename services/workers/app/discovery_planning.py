from __future__ import annotations

from math import sqrt
from typing import Any

from .discovery_candidate_evaluation import assessment_map as _candidate_assessment_map
from .discovery_policy import normalize_runtime_discovery_policy


DEFAULT_DISCOVERY_PROVIDER_TYPES = ["rss", "website", "api", "email_imap", "youtube"]
DISCOVERY_QUERY_FAMILY_TERMS = {
    "official_blog": "official blog",
    "newsroom": "newsroom",
    "engineering_updates": "engineering updates",
    "security_advisory": "security advisory",
    "release_notes": "release notes",
    "procurement_notice": "procurement notice",
    "rfp_tender": "rfp tender",
    "vendor_selection": "vendor selection",
    "lead_signal_funding": "funding",
    "lead_signal_product_expansion": "product expansion",
    "lead_signal_enterprise_rollout": "enterprise rollout",
    "lead_signal_platform_migration": "platform migration",
    "lead_signal_modernization": "modernization",
}
PROCUREMENT_QUERY_FAMILIES = {
    "procurement_notice",
    "rfp_tender",
    "vendor_selection",
}
LEAD_SIGNAL_QUERY_FAMILIES = {
    "lead_signal_funding",
    "lead_signal_product_expansion",
    "lead_signal_enterprise_rollout",
    "lead_signal_platform_migration",
    "lead_signal_modernization",
}


def normalize_text_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        values = [str(item).strip() for item in value if str(item).strip()]
    else:
        values = [str(value).strip()] if str(value).strip() else []
    deduped: list[str] = []
    seen: set[str] = set()
    for item in values:
        normalized = item.lower()
        if normalized in seen:
            continue
        seen.add(normalized)
        deduped.append(item)
    return deduped


def tokenize(value: Any) -> set[str]:
    if isinstance(value, str):
        text = value
    elif isinstance(value, list):
        text = " ".join(str(item) for item in value)
    elif isinstance(value, dict):
        text = " ".join(str(item) for item in value.values())
    else:
        text = str(value)
    tokens: set[str] = set()
    for raw in text.lower().replace("/", " ").replace("-", " ").split():
        token = "".join(ch for ch in raw if ch.isalnum() or ch == "_").strip()
        if len(token) >= 2:
            tokens.add(token)
    return tokens


def coerce_mapping_list(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    rows: list[dict[str, Any]] = []
    for item in value:
        if isinstance(item, dict):
            rows.append(dict(item))
    return rows


def assessment_map(llm_analysis: Any) -> dict[str, dict[str, Any]]:
    return _candidate_assessment_map(llm_analysis)


def validate_interest_graph(candidate: Any) -> dict[str, Any]:
    graph = dict(candidate) if isinstance(candidate, dict) else {}
    core_topic = str(graph.get("core_topic") or graph.get("coreTopic") or "").strip()
    if not core_topic:
        raise ValueError("interest_graph must contain core_topic.")
    return {
        "core_topic": core_topic,
        "subtopics": normalize_text_list(graph.get("subtopics")),
        "entities": normalize_text_list(graph.get("entities")),
        "people": normalize_text_list(graph.get("people")),
        "organizations": normalize_text_list(graph.get("organizations")),
        "geos": normalize_text_list(graph.get("geos")),
        "languages": normalize_text_list(graph.get("languages")),
        "source_types": normalize_text_list(graph.get("source_types") or graph.get("sourceTypes")),
        "event_types": normalize_text_list(graph.get("event_types") or graph.get("eventTypes")),
        "positive_signals": normalize_text_list(graph.get("positive_signals") or graph.get("positiveSignals")),
        "negative_signals": normalize_text_list(graph.get("negative_signals") or graph.get("negativeSignals")),
        "exclusions": normalize_text_list(graph.get("exclusions")),
        "freshness_horizon_days": max(
            1,
            int(graph.get("freshness_horizon_days") or graph.get("freshnessHorizonDays") or 14),
        ),
        "ambiguities": [
            dict(item)
            for item in (graph.get("ambiguities") or [])
            if isinstance(item, dict)
        ],
        "known_good_sources": normalize_text_list(graph.get("known_good_sources") or graph.get("knownGoodSources")),
        "known_bad_sources": normalize_text_list(graph.get("known_bad_sources") or graph.get("knownBadSources")),
    }


def default_interest_graph(
    mission: dict[str, Any],
    existing_urls: set[str] | None = None,
) -> dict[str, Any]:
    title = str(mission.get("title") or "").strip()
    description = str(mission.get("description") or "").strip()
    seed_topics = normalize_text_list(mission.get("seed_topics") or mission.get("topics"))
    seed_languages = normalize_text_list(mission.get("seed_languages") or mission.get("languages"))
    seed_regions = normalize_text_list(mission.get("seed_regions") or mission.get("regions"))
    provider_types = normalize_text_list(mission.get("target_provider_types"))
    core_topic = seed_topics[0] if seed_topics else title or "news discovery"
    subtopics = seed_topics[1:6] if len(seed_topics) > 1 else ([title] if title and title != core_topic else [])
    exclusions = []
    if description:
        lowered = description.lower()
        if "not " in lowered or "exclude" in lowered:
            exclusions.append(description)
    return {
        "core_topic": core_topic,
        "subtopics": subtopics,
        "entities": [],
        "people": [],
        "organizations": [],
        "geos": seed_regions,
        "languages": seed_languages,
        "source_types": provider_types or list(DEFAULT_DISCOVERY_PROVIDER_TYPES),
        "event_types": [],
        "positive_signals": seed_topics[:4],
        "negative_signals": [],
        "exclusions": exclusions,
        "freshness_horizon_days": 14,
        "ambiguities": [],
        "known_good_sources": sorted(existing_urls or [])[:10],
        "known_bad_sources": [],
    }


def normalize_query_family_key(value: str) -> str:
    return str(value or "").strip().lower().replace(" ", "_")


def ordered_query_families(
    *,
    seed_text: str,
    preferred_tactics: list[str],
) -> list[str]:
    procurement_hints = {"procurement", "tender", "vendor", "contract", "rfp", "outsourcing"}
    lead_signal_hints = {"funding", "expansion", "enterprise", "migration", "modernization", "rollout"}
    seed_tokens = tokenize(seed_text)
    preferred = [
        family
        for family in (normalize_query_family_key(item) for item in preferred_tactics)
        if family in DISCOVERY_QUERY_FAMILY_TERMS
    ]
    default_order = [
        "official_blog",
        "newsroom",
        "engineering_updates",
        "security_advisory",
        "release_notes",
        "procurement_notice",
        "rfp_tender",
        "vendor_selection",
        "lead_signal_funding",
        "lead_signal_product_expansion",
        "lead_signal_enterprise_rollout",
        "lead_signal_platform_migration",
        "lead_signal_modernization",
    ]
    if seed_tokens & procurement_hints:
        prioritized = list(PROCUREMENT_QUERY_FAMILIES) + list(LEAD_SIGNAL_QUERY_FAMILIES)
    elif seed_tokens & lead_signal_hints:
        prioritized = list(LEAD_SIGNAL_QUERY_FAMILIES) + list(PROCUREMENT_QUERY_FAMILIES)
    else:
        prioritized = default_order
    ordered: list[str] = []
    seen: set[str] = set()
    for family in [*preferred, *prioritized, *default_order]:
        if family not in DISCOVERY_QUERY_FAMILY_TERMS or family in seen:
            continue
        seen.add(family)
        ordered.append(family)
    return ordered


def build_generation_seed(
    *,
    class_row: dict[str, Any],
    graph: dict[str, Any],
    stats_map: dict[tuple[str, str], dict[str, Any]],
    applied_policy_json: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    class_key = str(class_row.get("class_key") or "").strip()
    seed_rules = dict(class_row.get("seed_rules_json") or {})
    tactics = normalize_text_list(seed_rules.get("tactics")) or ["default"]
    max_per_mission = max(1, int(class_row.get("max_per_mission") or 3))
    provider_types = normalize_text_list(class_row.get("default_provider_types")) or list(DEFAULT_DISCOVERY_PROVIDER_TYPES)
    provider_type = "website" if "website" in provider_types else provider_types[0]
    core_topic = str(graph.get("core_topic") or "content").strip() or "content"
    subtopics = normalize_text_list(graph.get("subtopics"))
    entities = normalize_text_list(graph.get("entities")) or normalize_text_list(graph.get("organizations"))
    geos = normalize_text_list(graph.get("geos"))
    source_types = normalize_text_list(graph.get("source_types"))
    exclusions = normalize_text_list(graph.get("exclusions"))
    runtime_policy = normalize_runtime_discovery_policy(
        lane="graph",
        applied_policy_json=applied_policy_json,
        mission_like={"target_provider_types": provider_types},
    )
    preferred_tactics = normalize_text_list(runtime_policy.get("preferredTactics"))

    seeds: list[dict[str, Any]] = []
    for tactic_key in tactics:
        selection_score = 0.5
        stat_key = (class_key, tactic_key)
        if stat_key in stats_map:
            stat = stats_map[stat_key]
            alpha = float(stat.get("alpha") or 1)
            beta = float(stat.get("beta") or 1)
            trials = int(stat.get("trials") or 0)
            selection_score = (alpha / max(alpha + beta, 1.0)) + (1 / sqrt(trials + 1))

        base_seed = entities[0] if class_key == "actor" and entities else (
            subtopics[0] if class_key in {"lexical", "facet"} and subtopics else core_topic
        )
        if class_key == "source_type":
            source_type = source_types[0] if source_types else "source"
            base_seed = f"{core_topic} {source_type}".strip()
        elif class_key == "contrarian":
            exclusion = exclusions[0] if exclusions else core_topic
            geo = geos[0] if geos else ""
            base_seed = f"{core_topic} {exclusion} {geo}".strip()
        if class_key not in {"lexical", "facet", "actor", "source_type", "evidence_chain", "contrarian"}:
            query = f"{base_seed} {tactic_key}".strip()
            seeds.append(
                {
                    "class_key": class_key,
                    "tactic_key": tactic_key,
                    "search_query": " ".join(query.split()),
                    "target_provider_type": provider_type,
                    "expected_value": f"{class_row.get('display_name') or class_key} / {tactic_key}",
                    "generation_context": {
                        "origin": "registry_seed",
                        "selection_score": round(selection_score, 4),
                        "provider_types": provider_types,
                    },
                }
            )
            continue
        families = ordered_query_families(
            seed_text=f"{base_seed} {tactic_key}",
            preferred_tactics=preferred_tactics,
        )
        for family in families[:max_per_mission]:
            query = f"{base_seed} {DISCOVERY_QUERY_FAMILY_TERMS[family]}".strip()
            seeds.append(
                {
                    "class_key": class_key,
                    "tactic_key": tactic_key,
                    "search_query": " ".join(query.split()),
                    "target_provider_type": provider_type,
                    "expected_value": f"{class_row.get('display_name') or class_key} / {tactic_key}",
                    "generation_context": {
                        "origin": "registry_seed",
                        "selection_score": round(selection_score, 4),
                        "provider_types": provider_types,
                        "query_family": family,
                    },
                }
            )

    seeds.sort(
        key=lambda item: float(item.get("generation_context", {}).get("selection_score") or 0),
        reverse=True,
    )
    return seeds[:max_per_mission]


def build_default_hypotheses_from_graph(
    *,
    graph: dict[str, Any],
    class_rows: list[dict[str, Any]],
    stats_rows: list[dict[str, Any]],
    applied_policy_json: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    stats_map = {
        (str(row.get("class_key") or ""), str(row.get("tactic_key") or "")): dict(row)
        for row in stats_rows
    }
    hypotheses: list[dict[str, Any]] = []
    for class_row in class_rows:
        hypotheses.extend(
            build_generation_seed(
                class_row=class_row,
                graph=graph,
                stats_map=stats_map,
                applied_policy_json=applied_policy_json,
            )
        )
    return hypotheses


def dedup_hypotheses(
    hypotheses: list[dict[str, Any]],
    recent_hypotheses: list[dict[str, Any]],
    *,
    max_hypotheses: int,
) -> list[dict[str, Any]]:
    seen: set[tuple[str, str, str]] = set()
    for item in recent_hypotheses:
        seen.add(
            (
                str(item.get("class_key") or "").strip(),
                str(item.get("tactic_key") or "").strip(),
                " ".join(str(item.get("search_query") or "").lower().split()),
            )
        )
    filtered: list[dict[str, Any]] = []
    for hypothesis in hypotheses:
        normalized_key = (
            str(hypothesis.get("class_key") or "").strip(),
            str(hypothesis.get("tactic_key") or "").strip(),
            " ".join(str(hypothesis.get("search_query") or "").lower().split()),
        )
        if not normalized_key[0] or not normalized_key[1] or not normalized_key[2]:
            continue
        if normalized_key in seen:
            continue
        seen.add(normalized_key)
        filtered.append(
            {
                "class_key": normalized_key[0],
                "tactic_key": normalized_key[1],
                "search_query": str(hypothesis.get("search_query") or "").strip(),
                "target_urls": normalize_text_list(hypothesis.get("target_urls")),
                "target_provider_type": str(hypothesis.get("target_provider_type") or "rss"),
                "generation_context": dict(hypothesis.get("generation_context") or {}),
                "expected_value": str(hypothesis.get("expected_value") or "").strip() or None,
            }
        )
        if len(filtered) >= max_hypotheses:
            break
    return filtered

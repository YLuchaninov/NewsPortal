from __future__ import annotations

from typing import Any


DEFAULT_SOURCE_ROLE_TARGETS = {
    "authoritative_anchor": {"min": 3, "target": 5},
    "technical_change": {"min": 2, "target": 4},
    "security_advisory": {"min": 1, "target": 3},
    "procurement_signal": {"min": 2, "target": 5},
    "primary_data": {"min": 1, "target": 3},
    "report_research": {"min": 1, "target": 3},
    "regulatory_policy": {"min": 1, "target": 3},
    "industry_niche": {"min": 3, "target": 6},
    "localized_media": {"min": 2, "target": 5},
    "social_pain_signal": {"min": 2, "target": 5},
    "source_directory": {"min": 1, "target": 3},
}


def _text_list(row: dict[str, Any], *keys: str) -> list[str]:
    values: list[str] = []
    for key in keys:
        raw = row.get(key)
        if isinstance(raw, list):
            values.extend(str(item).strip() for item in raw if str(item).strip())
        elif isinstance(raw, str) and raw.strip():
            values.append(raw.strip())
    return list(dict.fromkeys(values))


def _record(value: Any) -> dict[str, Any]:
    return dict(value) if isinstance(value, dict) else {}


def _candidate_signal_config(row: dict[str, Any]) -> dict[str, Any]:
    definition = _record(row.get("selection_profile_definition_json"))
    candidate_signals = definition.get("candidateSignals")
    return dict(candidate_signals) if isinstance(candidate_signals, dict) else {}


def _hidden_claim_extraction_policy(row: dict[str, Any]) -> dict[str, Any]:
    definition = _record(row.get("selection_profile_definition_json"))
    policy = _record(row.get("selection_profile_policy_json"))
    candidate_signals = _candidate_signal_config(row)
    configured = definition.get("hiddenClaimExtraction") or policy.get("hiddenClaimExtraction")
    hidden_claim_extraction = dict(configured) if isinstance(configured, dict) else {}
    if candidate_signals:
        hidden_claim_extraction.setdefault("positiveGroups", candidate_signals.get("positiveGroups") or [])
        hidden_claim_extraction.setdefault("negativeGroups", candidate_signals.get("negativeGroups") or [])
    return hidden_claim_extraction


def _interest_policy_json(row: dict[str, Any]) -> dict[str, Any]:
    candidate_signals = _candidate_signal_config(row)
    hidden_claim_extraction = _hidden_claim_extraction_policy(row)
    policy: dict[str, Any] = {}
    if candidate_signals:
        policy["candidateSignals"] = candidate_signals
    if hidden_claim_extraction:
        policy["hiddenClaimExtraction"] = hidden_claim_extraction
    return policy


def build_target_from_system_interest(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "origin_kind": "system_interest",
        "origin_id": row.get("interest_template_id") or row.get("template_id"),
        "title": row.get("name") or row.get("title") or "System interest",
        "description": row.get("description"),
        "seed_topics": _text_list(row, "positive_texts", "must_have_terms", "keywords"),
        "seed_entities": _text_list(row, "entities", "entity_names"),
        "seed_geos": _text_list(row, "places", "geos"),
        "seed_languages": _text_list(row, "languages_allowed", "languages"),
        "seed_urls": [],
        "seed_domains": [],
        "graph_json": {},
        "policy_json": _interest_policy_json(row),
        "autopilot_json": {},
        "created_by": "system_interest_bootstrap",
    }


def build_target_from_user_interest(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "origin_kind": "user_interest",
        "origin_id": row.get("user_interest_id") or row.get("interest_id"),
        "title": row.get("title") or row.get("name") or "User interest",
        "description": row.get("description"),
        "seed_topics": _text_list(row, "positive_texts", "must_have_terms", "keywords"),
        "seed_entities": _text_list(row, "entities", "entity_names"),
        "seed_geos": _text_list(row, "places", "geos"),
        "seed_languages": _text_list(row, "languages_allowed", "languages"),
        "seed_urls": [],
        "seed_domains": [],
        "graph_json": {},
        "policy_json": {},
        "autopilot_json": {},
        "created_by": "user_interest_bootstrap",
    }


def compile_interest_graph(target: dict[str, Any]) -> dict[str, Any]:
    title = str(target.get("title") or "")
    description = str(target.get("description") or "")
    topics = _text_list(target, "seed_topics")
    entities = _text_list(target, "seed_entities")
    geos = _text_list(target, "seed_geos")
    languages = _text_list(target, "seed_languages") or ["en"]
    aliases = list(dict.fromkeys([title, *topics, *[f"{entity} alternative" for entity in entities]]))
    policy = _record(target.get("policy_json"))
    graph = {
        "coreTopic": title,
        "description": description,
        "positiveTexts": list(dict.fromkeys([title, description, *topics])),
        "negativeTexts": ["generic SEO comparison", "affiliate landing page", "old tutorial"],
        "entities": entities,
        "aliases": aliases,
        "subtopics": topics,
        "eventTypes": [
            "announcement",
            "tender",
            "contract award",
            "release note",
            "security advisory",
            "report",
            "complaint",
            "workaround",
        ],
        "directSignalPhrases": [
            "official blog",
            "newsroom",
            "changelog",
            "release notes",
            "security advisory",
            "procurement",
            "report",
            "dataset",
            "policy guidance",
        ],
        "hiddenSignalPhrases": [
            "problem",
            "too expensive",
            "alternative",
            "moving away",
            "workaround",
            "looking for",
        ],
        "geos": geos,
        "languages": languages,
        "sourceRoleTargets": DEFAULT_SOURCE_ROLE_TARGETS,
    }
    if isinstance(policy.get("candidateSignals"), dict):
        graph["candidateSignals"] = dict(policy["candidateSignals"])
    if isinstance(policy.get("hiddenClaimExtraction"), dict):
        graph["hiddenClaimExtraction"] = dict(policy["hiddenClaimExtraction"])
    return graph


def merge_graph_expansions(graph: dict[str, Any], expansions: dict[str, Any]) -> dict[str, Any]:
    merged = dict(graph)
    for key, value in expansions.items():
        if isinstance(value, list):
            merged[key] = list(dict.fromkeys([*list(merged.get(key) or []), *value]))
        elif isinstance(value, dict):
            merged[key] = {**dict(merged.get(key) or {}), **value}
        else:
            merged[key] = value
    return merged

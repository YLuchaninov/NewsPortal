from __future__ import annotations

from typing import Any

from .discovery_v3_settings import (
    BALANCED_AUTOPILOT,
    RESEARCH_AUTOPILOT,
    SOCIAL_EARLY_SIGNAL_AUTOPILOT,
    WIDE_AUTOPILOT,
)


CONSERVATIVE_AUTOPILOT: dict[str, Any] = {
    "maxDepth": 1,
    "maxHypotheses": 40,
    "maxDomains": 120,
    "maxEndpoints": 180,
    "directSignalWeight": 0.8,
    "hiddenSignalWeight": 0.2,
    "autoPromote": [],
    "websiteAutoPromote": False,
    "socialAction": "monitor_only",
    "manualReviewOnly": True,
    "sourceOfSources": True,
    "existingSourceExpansion": True,
    "replacementDiscovery": True,
}


AUTOPILOT_PROFILES: dict[str, dict[str, Any]] = {
    "conservative": CONSERVATIVE_AUTOPILOT,
    "balanced": BALANCED_AUTOPILOT,
    "wide": WIDE_AUTOPILOT,
    "research": RESEARCH_AUTOPILOT,
    "social_early_signal": SOCIAL_EARLY_SIGNAL_AUTOPILOT,
}


def list_autopilot_profiles() -> list[dict[str, Any]]:
    return [
        {
            "profileId": profile_id,
            "config": dict(config),
            "description": _profile_description(profile_id),
        }
        for profile_id, config in AUTOPILOT_PROFILES.items()
    ]


def get_autopilot_profile(profile_id: str | None) -> dict[str, Any]:
    return dict(AUTOPILOT_PROFILES.get(str(profile_id or "balanced"), BALANCED_AUTOPILOT))


def build_simple_target_payload(payload: dict[str, Any]) -> dict[str, Any]:
    prompt = str(payload.get("prompt") or payload.get("description") or payload.get("title") or "").strip()
    title = str(payload.get("title") or prompt[:120] or "Discovery target").strip()
    profile_id = str(payload.get("autopilotProfile") or payload.get("autopilot_profile") or "balanced")
    profile = get_autopilot_profile(profile_id)
    seed_topics = _list_or_default(payload.get("seedTopics") or payload.get("seed_topics"), [prompt or title])
    seed_languages = _list_or_default(payload.get("seedLanguages") or payload.get("seed_languages"), ["en"])
    return {
        "origin_kind": "manual_prompt",
        "origin_id": None,
        "title": title,
        "description": str(payload.get("description") or prompt or title),
        "seed_topics": seed_topics,
        "seed_entities": _list_or_default(payload.get("seedEntities") or payload.get("seed_entities"), []),
        "seed_geos": _list_or_default(payload.get("seedGeos") or payload.get("seed_geos"), []),
        "seed_languages": seed_languages,
        "seed_urls": _list_or_default(payload.get("seedUrls") or payload.get("seed_urls"), []),
        "seed_domains": _list_or_default(payload.get("seedDomains") or payload.get("seed_domains"), []),
        "graph_json": {},
        "policy_json": {
            "autopilotProfile": profile_id,
            "websiteAutoPromotion": False,
            "socialDefaultAction": "monitor_only",
            "killSwitch": False,
        },
        "autopilot_json": profile,
        "created_by": payload.get("createdBy") or payload.get("created_by") or "operator",
    }


def simplify_config_deterministically(payload: dict[str, Any]) -> dict[str, Any]:
    simple = build_simple_target_payload(payload)
    return {
        "target": simple,
        "autopilotProfile": str(payload.get("autopilotProfile") or payload.get("autopilot_profile") or "balanced"),
        "profile": simple["autopilot_json"],
        "policyHints": simple["policy_json"],
        "assumptions": [
            {
                "text": "Deterministic fallback derived seeds from the operator prompt.",
                "confidence": 0.5,
            }
        ],
    }


def _list_or_default(value: Any, default: list[str]) -> list[str]:
    if isinstance(value, list):
        cleaned = [str(item).strip() for item in value if str(item).strip()]
        return list(dict.fromkeys(cleaned)) or default
    if isinstance(value, str) and value.strip():
        return [value.strip()]
    return default


def _profile_description(profile_id: str) -> str:
    descriptions = {
        "conservative": "Manual-review-heavy profile for cautious source discovery and operator proof.",
        "balanced": "Default profile balancing direct sources, hidden signals, source expansion and replacement.",
        "wide": "Broader recall profile with larger budgets and more hidden-signal exploration.",
        "research": "Manual-review profile focused on primary data, reports, policy and procurement.",
        "social_early_signal": "Monitor-only hidden-signal profile for social/community early demand signals.",
    }
    return descriptions.get(profile_id, "Discovery autopilot profile.")

from __future__ import annotations

from typing import Any, Mapping


DISCOVERY_PROFILE_PROVIDER_TYPES = {"rss", "website"}


def normalize_string_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    normalized: list[str] = []
    seen: set[str] = set()
    for entry in value:
        item = str(entry or "").strip()
        if not item or item in seen:
            continue
        normalized.append(item)
        seen.add(item)
    return normalized


def normalize_optional_text(value: Any) -> str | None:
    normalized = str(value or "").strip()
    return normalized or None


def normalize_optional_float(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed if parsed >= 0 else None


def normalize_optional_positive_int(value: Any) -> int | None:
    if value is None or value == "":
        return None
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return None
    return parsed if parsed > 0 else None


def normalize_discovery_diversity_caps(value: Any) -> dict[str, Any]:
    source = value if isinstance(value, Mapping) else {}
    caps: dict[str, Any] = {}
    max_per_source_family = normalize_optional_positive_int(source.get("maxPerSourceFamily"))
    max_per_domain = normalize_optional_positive_int(source.get("maxPerDomain"))
    if max_per_source_family is not None:
        caps["maxPerSourceFamily"] = max_per_source_family
    if max_per_domain is not None:
        caps["maxPerDomain"] = max_per_domain
    return caps


def normalize_discovery_graph_policy(value: Mapping[str, Any] | None) -> dict[str, Any]:
    source = value if isinstance(value, Mapping) else {}
    provider_types = [
        provider
        for provider in normalize_string_list(source.get("providerTypes"))
        if provider in DISCOVERY_PROFILE_PROVIDER_TYPES
    ]
    return {
        "providerTypes": provider_types or ["rss", "website"],
        "supportedWebsiteKinds": normalize_string_list(source.get("supportedWebsiteKinds")),
        "preferredDomains": normalize_string_list(source.get("preferredDomains")),
        "blockedDomains": normalize_string_list(
            source.get("blockedDomains") or source.get("negativeDomains")
        ),
        "positiveKeywords": normalize_string_list(source.get("positiveKeywords")),
        "negativeKeywords": normalize_string_list(source.get("negativeKeywords")),
        "preferredTactics": normalize_string_list(source.get("preferredTactics")),
        "expectedSourceShapes": normalize_string_list(source.get("expectedSourceShapes")),
        "allowedSourceFamilies": normalize_string_list(source.get("allowedSourceFamilies")),
        "disfavoredSourceFamilies": normalize_string_list(source.get("disfavoredSourceFamilies")),
        "usefulnessHints": normalize_string_list(source.get("usefulnessHints")),
        "diversityCaps": normalize_discovery_diversity_caps(source.get("diversityCaps")),
        "minRssReviewScore": normalize_optional_float(source.get("minRssReviewScore")),
        "minWebsiteReviewScore": normalize_optional_float(source.get("minWebsiteReviewScore")),
        "advancedPromptInstructions": normalize_optional_text(
            source.get("advancedPromptInstructions")
        ),
    }


def normalize_discovery_recall_policy(value: Mapping[str, Any] | None) -> dict[str, Any]:
    source = value if isinstance(value, Mapping) else {}
    provider_types = [
        provider
        for provider in normalize_string_list(source.get("providerTypes"))
        if provider in DISCOVERY_PROFILE_PROVIDER_TYPES
    ]
    return {
        "providerTypes": provider_types or ["rss", "website"],
        "supportedWebsiteKinds": normalize_string_list(source.get("supportedWebsiteKinds")),
        "preferredDomains": normalize_string_list(source.get("preferredDomains")),
        "blockedDomains": normalize_string_list(
            source.get("blockedDomains") or source.get("negativeDomains")
        ),
        "positiveKeywords": normalize_string_list(source.get("positiveKeywords")),
        "negativeKeywords": normalize_string_list(source.get("negativeKeywords")),
        "preferredTactics": normalize_string_list(source.get("preferredTactics")),
        "expectedSourceShapes": normalize_string_list(source.get("expectedSourceShapes")),
        "allowedSourceFamilies": normalize_string_list(source.get("allowedSourceFamilies")),
        "disfavoredSourceFamilies": normalize_string_list(source.get("disfavoredSourceFamilies")),
        "usefulnessHints": normalize_string_list(source.get("usefulnessHints")),
        "diversityCaps": normalize_discovery_diversity_caps(source.get("diversityCaps")),
        "minPromotionScore": normalize_optional_float(source.get("minPromotionScore")),
        "advancedPromptInstructions": normalize_optional_text(
            source.get("advancedPromptInstructions")
        ),
    }


def normalize_discovery_yield_benchmark(value: Mapping[str, Any] | None) -> dict[str, Any]:
    source = value if isinstance(value, Mapping) else {}
    return {
        "domains": normalize_string_list(source.get("domains")),
        "titleKeywords": normalize_string_list(source.get("titleKeywords")),
        "tacticKeywords": normalize_string_list(source.get("tacticKeywords")),
    }


def build_discovery_profile_payload(
    *,
    graph_policy_json: Mapping[str, Any] | None,
    recall_policy_json: Mapping[str, Any] | None,
    yield_benchmark_json: Mapping[str, Any] | None,
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    return (
        normalize_discovery_graph_policy(graph_policy_json),
        normalize_discovery_recall_policy(recall_policy_json),
        normalize_discovery_yield_benchmark(yield_benchmark_json),
    )


def parse_discovery_profile_json(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return dict(value)
    return {}

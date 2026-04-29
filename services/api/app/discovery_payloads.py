from __future__ import annotations

from typing import Any, Literal, Mapping

from pydantic import BaseModel, ConfigDict, Field


DISCOVERY_PROFILE_PROVIDER_TYPES = {"rss", "website"}


class DiscoveryMissionCreatePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str
    description: str | None = None
    source_kind: Literal["interest_template", "manual"] = Field(
        default="manual",
        alias="sourceKind",
    )
    source_ref_id: str | None = Field(default=None, alias="sourceRefId")
    seed_topics: list[str] = Field(default_factory=list, alias="seedTopics")
    seed_languages: list[str] = Field(default_factory=list, alias="seedLanguages")
    seed_regions: list[str] = Field(default_factory=list, alias="seedRegions")
    target_provider_types: list[
        Literal["rss", "website", "api", "email_imap", "youtube"]
    ] = Field(
        default_factory=lambda: ["rss", "website", "api", "email_imap", "youtube"],
        alias="targetProviderTypes",
    )
    interest_graph: dict[str, Any] | None = Field(default=None, alias="interestGraph")
    max_hypotheses: int | None = Field(default=None, ge=1, alias="maxHypotheses")
    max_sources: int | None = Field(default=None, ge=1, alias="maxSources")
    budget_cents: int | None = Field(default=None, ge=0, alias="budgetCents")
    priority: int = 0
    profile_id: str | None = Field(default=None, alias="profileId")
    created_by: str | None = Field(default=None, alias="createdBy")


class DiscoveryMissionUpdatePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str | None = None
    description: str | None = None
    seed_topics: list[str] | None = Field(default=None, alias="seedTopics")
    seed_languages: list[str] | None = Field(default=None, alias="seedLanguages")
    seed_regions: list[str] | None = Field(default=None, alias="seedRegions")
    target_provider_types: list[
        Literal["rss", "website", "api", "email_imap", "youtube"]
    ] | None = Field(
        default=None,
        alias="targetProviderTypes",
    )
    interest_graph: dict[str, Any] | None = Field(default=None, alias="interestGraph")
    max_hypotheses: int | None = Field(default=None, ge=1, alias="maxHypotheses")
    max_sources: int | None = Field(default=None, ge=1, alias="maxSources")
    budget_cents: int | None = Field(default=None, ge=0, alias="budgetCents")
    priority: int | None = None
    status: Literal["planned", "active", "completed", "paused", "failed", "archived"] | None = None
    profile_id: str | None = Field(default=None, alias="profileId")


class DiscoveryMissionRunPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    requested_by: str | None = Field(default=None, alias="requestedBy")


class DiscoveryRecallMissionCreatePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str
    description: str | None = None
    mission_kind: Literal["manual", "domain_seed", "query_seed"] = Field(
        default="manual",
        alias="missionKind",
    )
    seed_domains: list[str] = Field(default_factory=list, alias="seedDomains")
    seed_urls: list[str] = Field(default_factory=list, alias="seedUrls")
    seed_queries: list[str] = Field(default_factory=list, alias="seedQueries")
    target_provider_types: list[
        Literal["rss", "website", "api", "email_imap", "youtube"]
    ] = Field(
        default_factory=lambda: ["rss", "website", "api", "email_imap", "youtube"],
        alias="targetProviderTypes",
    )
    scope_json: dict[str, Any] = Field(default_factory=dict, alias="scopeJson")
    max_candidates: int = Field(default=50, ge=1, alias="maxCandidates")
    profile_id: str | None = Field(default=None, alias="profileId")
    created_by: str | None = Field(default=None, alias="createdBy")


class DiscoveryRecallMissionUpdatePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str | None = None
    description: str | None = None
    mission_kind: Literal["manual", "domain_seed", "query_seed"] | None = Field(
        default=None,
        alias="missionKind",
    )
    seed_domains: list[str] | None = Field(default=None, alias="seedDomains")
    seed_urls: list[str] | None = Field(default=None, alias="seedUrls")
    seed_queries: list[str] | None = Field(default=None, alias="seedQueries")
    target_provider_types: list[
        Literal["rss", "website", "api", "email_imap", "youtube"]
    ] | None = Field(
        default=None,
        alias="targetProviderTypes",
    )
    scope_json: dict[str, Any] | None = Field(default=None, alias="scopeJson")
    max_candidates: int | None = Field(default=None, ge=1, alias="maxCandidates")
    status: Literal["planned", "active", "completed", "paused", "failed"] | None = None
    profile_id: str | None = Field(default=None, alias="profileId")


class DiscoveryPolicyProfileCreatePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    profile_key: str = Field(alias="profileKey")
    display_name: str = Field(alias="displayName")
    description: str | None = None
    status: Literal["draft", "active", "archived"] = "draft"
    graph_policy_json: dict[str, Any] = Field(default_factory=dict, alias="graphPolicyJson")
    recall_policy_json: dict[str, Any] = Field(default_factory=dict, alias="recallPolicyJson")
    yield_benchmark_json: dict[str, Any] = Field(
        default_factory=dict,
        alias="yieldBenchmarkJson",
    )
    created_by: str | None = Field(default=None, alias="createdBy")


class DiscoveryPolicyProfileUpdatePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    display_name: str | None = Field(default=None, alias="displayName")
    description: str | None = None
    status: Literal["draft", "active", "archived"] | None = None
    graph_policy_json: dict[str, Any] | None = Field(default=None, alias="graphPolicyJson")
    recall_policy_json: dict[str, Any] | None = Field(default=None, alias="recallPolicyJson")
    yield_benchmark_json: dict[str, Any] | None = Field(
        default=None,
        alias="yieldBenchmarkJson",
    )


class DiscoveryRecallCandidateCreatePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    recall_mission_id: str = Field(alias="recallMissionId")
    source_profile_id: str | None = Field(default=None, alias="sourceProfileId")
    url: str
    final_url: str | None = Field(default=None, alias="finalUrl")
    title: str | None = None
    description: str | None = None
    provider_type: Literal["rss", "website", "api", "email_imap", "youtube"] = Field(
        default="rss",
        alias="providerType",
    )
    status: Literal["pending", "shortlisted", "rejected", "duplicate"] = "pending"
    quality_signal_source: str = Field(default="manual", alias="qualitySignalSource")
    evaluation_json: dict[str, Any] = Field(default_factory=dict, alias="evaluationJson")
    rejection_reason: str | None = Field(default=None, alias="rejectionReason")
    created_by: str | None = Field(default=None, alias="createdBy")


class DiscoveryRecallCandidateUpdatePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["pending", "shortlisted", "rejected", "duplicate"] | None = None
    reviewed_by: str | None = Field(default=None, alias="reviewedBy")
    rejection_reason: str | None = Field(default=None, alias="rejectionReason")
    quality_signal_source: str | None = Field(default=None, alias="qualitySignalSource")
    evaluation_json: dict[str, Any] | None = Field(default=None, alias="evaluationJson")


class DiscoveryRecallCandidatePromotePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reviewed_by: str | None = Field(default=None, alias="reviewedBy")
    enabled: bool = True
    tags: list[str] = Field(default_factory=list)


class DiscoveryHypothesisClassCreatePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    class_key: str = Field(alias="classKey")
    display_name: str = Field(alias="displayName")
    description: str | None = None
    status: Literal["draft", "active", "archived"] = "draft"
    generation_backend: Literal["graph_seed_llm", "graph_seed_only"] = Field(
        default="graph_seed_llm",
        alias="generationBackend",
    )
    default_provider_types: list[
        Literal["rss", "website", "api", "email_imap", "youtube"]
    ] = Field(
        default_factory=lambda: ["rss", "website", "api", "email_imap", "youtube"],
        alias="defaultProviderTypes",
    )
    prompt_instructions: str | None = Field(default=None, alias="promptInstructions")
    seed_rules_json: dict[str, Any] = Field(default_factory=dict, alias="seedRulesJson")
    max_per_mission: int = Field(default=3, ge=1, alias="maxPerMission")
    sort_order: int = Field(default=0, alias="sortOrder")
    config_json: dict[str, Any] = Field(default_factory=dict, alias="configJson")


class DiscoveryHypothesisClassUpdatePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    display_name: str | None = Field(default=None, alias="displayName")
    description: str | None = None
    status: Literal["draft", "active", "archived"] | None = None
    generation_backend: Literal["graph_seed_llm", "graph_seed_only"] | None = Field(
        default=None,
        alias="generationBackend",
    )
    default_provider_types: list[
        Literal["rss", "website", "api", "email_imap", "youtube"]
    ] | None = Field(
        default=None,
        alias="defaultProviderTypes",
    )
    prompt_instructions: str | None = Field(default=None, alias="promptInstructions")
    seed_rules_json: dict[str, Any] | None = Field(default=None, alias="seedRulesJson")
    max_per_mission: int | None = Field(default=None, ge=1, alias="maxPerMission")
    sort_order: int | None = Field(default=None, alias="sortOrder")
    config_json: dict[str, Any] | None = Field(default=None, alias="configJson")


class DiscoveryCandidateUpdatePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["approved", "rejected", "pending"]
    reviewed_by: str | None = Field(default=None, alias="reviewedBy")
    rejection_reason: str | None = Field(default=None, alias="rejectionReason")


class DiscoveryFeedbackCreatePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mission_id: str | None = Field(default=None, alias="missionId")
    candidate_id: str | None = Field(default=None, alias="candidateId")
    source_profile_id: str | None = Field(default=None, alias="sourceProfileId")
    feedback_type: str = Field(alias="feedbackType")
    feedback_value: str | None = Field(default=None, alias="feedbackValue")
    notes: str | None = None
    created_by: str | None = Field(default=None, alias="createdBy")


class DiscoveryReEvaluatePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mission_id: str | None = Field(default=None, alias="missionId")


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

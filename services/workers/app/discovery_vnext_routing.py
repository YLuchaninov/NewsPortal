from __future__ import annotations

from typing import Any


DEFAULT_ROUTING_POLICY = {
    "policyVersion": "discovery-routing-vnext-1",
    "inventoryThreshold": 0.15,
    "cheapWatchThreshold": 0.35,
    "autoRegisterThreshold": 0.72,
    "minTechnicalObservability": 0.55,
    "minConfidence": 0.65,
    "maxAutoRisk": 0.35,
    "maxWatchRisk": 0.60,
    "allowedAutoRegisterSignalProductionModes": [
        "direct_event_feed",
        "direct_request_or_listing",
        "official_update",
        "source_directory",
    ],
    "allowedAutoRegisterFreshnessKinds": [
        "recurring_listing",
        "recurring_feed",
        "official_update",
        "dataset_or_registry",
    ],
    "blockedAutoRegisterSourceVoices": ["seller_or_vendor", "third_party_commentary"],
    "accessPatternPolicies": {
        "public": {"defaultAction": "cheap_watch"},
        "requires_browser": {"defaultAction": "manual_review", "allowAutoWatch": True, "allowAutoRegister": False},
        "requires_auth": {"defaultAction": "adapter_backlog", "allowAutoRegister": False},
        "captcha_blocked": {"defaultAction": "blocked", "allowAutoRegister": False},
        "blocked": {"defaultAction": "blocked", "allowAutoRegister": False},
        "unknown": {"defaultAction": "manual_review", "allowAutoRegister": False},
    },
    "providerPolicies": {
        "rss": {"autoRegisterThreshold": 0.65, "minTechnicalObservability": 0.75, "allowProbation": True},
        "website": {"autoRegisterThreshold": 0.75, "minTechnicalObservability": 0.65, "allowProbation": True},
        "api": {"defaultAction": "adapter_backlog", "allowProbation": False},
        "document_portal": {"defaultAction": "cheap_watch", "allowProbation": False},
        "unknown": {"defaultAction": "manual_review", "allowProbation": False},
    },
}

HARD_BLOCKERS = {
    "hard_blocker",
    "structural_mismatch",
    "unusable_access",
    "malware_spam_phishing",
    "unsupported_auth_or_captcha",
    "dead_source",
    "duplicate_sink_without_added_value",
    "legal_or_policy_block",
}


def clamp_score(value: Any, default: float = 0.0) -> float:
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return default
    return max(0.0, min(1.0, numeric))


def score_components(source_understanding: dict[str, Any]) -> dict[str, float]:
    capabilities = []
    for signal in source_understanding.get("canProduceSignals") or []:
        if not isinstance(signal, dict):
            continue
        if signal.get("capabilityScore") is not None:
            capabilities.append(clamp_score(signal.get("capabilityScore")))
            continue
        capabilities.append({"high": 0.85, "medium": 0.55, "low": 0.25}.get(signal.get("capability"), 0.2))

    risk = source_understanding.get("risk") if isinstance(source_understanding.get("risk"), dict) else {}
    return {
        "capabilityFit": round(sum(capabilities) / max(1, len(capabilities)), 4),
        "artifactFit": round(clamp_score(source_understanding.get("artifactFit")), 4),
        "technicalObservability": round(clamp_score(source_understanding.get("technicalObservability")), 4),
        "evidenceDirectness": round(clamp_score(source_understanding.get("evidenceDirectness")), 4),
        "riskScore": round(_risk_score(risk), 4),
        "routingConfidence": round(clamp_score(source_understanding.get("routingConfidence")), 4),
    }


def _risk_score(risk: dict[str, Any]) -> float:
    if "riskScore" in risk:
        return clamp_score(risk.get("riskScore"))
    values = [
        _risk_label_score(risk.get("overallRisk")),
        _risk_label_score(risk.get("legalRisk")),
        _risk_label_score(risk.get("spamRisk")),
        _risk_label_score(risk.get("promptInjectionRisk")),
        _risk_label_score(risk.get("authOrCaptchaRisk")),
        _risk_label_score(risk.get("crawlBlastRadius")),
        _risk_label_score(risk.get("unsupportedAdapterRisk")),
    ]
    return max(values)


def _risk_label_score(value: Any) -> float:
    return {
        "low": 0.2,
        "medium": 0.55,
        "high": 0.9,
        "unknown": 0.65,
    }.get(str(value or "unknown"), 0.65)


def route_source_understanding(
    source_understanding: dict[str, Any],
    *,
    policy: dict[str, Any] | None = None,
    provider_type: str = "unknown",
    access_pattern: str = "unknown",
    rollback_group_id: str | None = None,
) -> dict[str, Any]:
    active_policy = {**DEFAULT_ROUTING_POLICY, **(policy or {})}
    source_understanding = {
        **source_understanding,
        "suggestedProviderType": source_understanding.get("suggestedProviderType") or provider_type,
        "accessPattern": source_understanding.get("accessPattern") or access_pattern,
    }
    components = score_components(source_understanding)
    hard_blockers = set(str(item) for item in source_understanding.get("hardBlockers") or [])
    provider_policy = _nested_policy(active_policy, "providerPolicies", provider_type)
    access_policy = _nested_policy(active_policy, "accessPatternPolicies", access_pattern)

    decision = _decision(
        components=components,
        hard_blockers=hard_blockers,
        policy=active_policy,
        provider_policy=provider_policy,
        access_policy=access_policy,
        source_understanding=source_understanding,
    )

    return {
        "candidateId": source_understanding.get("candidateId"),
        "sourceUnderstandingArtifactId": source_understanding.get("artifactId"),
        "decision": decision,
        "reason": _reason(decision, components, hard_blockers, provider_type, access_pattern),
        "policyVersion": str(active_policy.get("policyVersion") or "discovery-routing-vnext-1"),
        "scoreComponents": components,
        "actions": _actions(decision, provider_type),
        "manualReviewRequired": decision == "manual_review",
        "rollbackGroupId": rollback_group_id,
    }


def _nested_policy(policy: dict[str, Any], key: str, value: str) -> dict[str, Any]:
    nested = policy.get(key)
    if not isinstance(nested, dict):
        return {}
    selected = nested.get(value) or nested.get("unknown") or {}
    return selected if isinstance(selected, dict) else {}


def _decision(
    *,
    components: dict[str, float],
    hard_blockers: set[str],
    policy: dict[str, Any],
    provider_policy: dict[str, Any],
    access_policy: dict[str, Any],
    source_understanding: dict[str, Any],
) -> str:
    if hard_blockers & HARD_BLOCKERS:
        return "blocked"
    if access_policy.get("defaultAction") in {"blocked", "adapter_backlog"}:
        return str(access_policy["defaultAction"])
    if provider_policy.get("defaultAction") == "adapter_backlog" or source_understanding.get("adapterRequired"):
        return "adapter_backlog"
    if components["riskScore"] > clamp_score(policy.get("maxWatchRisk"), 0.60):
        return "manual_review"
    if _is_context_only(source_understanding):
        return "inventory_context"

    auto_threshold = clamp_score(provider_policy.get("autoRegisterThreshold"), clamp_score(policy.get("autoRegisterThreshold"), 0.72))
    min_observability = clamp_score(
        provider_policy.get("minTechnicalObservability"),
        clamp_score(policy.get("minTechnicalObservability"), 0.55),
    )
    allow_probation = provider_policy.get("allowProbation", True) is True and access_policy.get("allowAutoRegister", True) is not False
    if (
        allow_probation
        and _is_auto_register_eligible_source_mode(source_understanding, policy, provider_type=str(source_understanding.get("suggestedProviderType") or "unknown"))
        and _provider_validated_for_auto_register(source_understanding, str(source_understanding.get("suggestedProviderType") or "unknown"))
        and components["capabilityFit"] >= auto_threshold
        and components["technicalObservability"] >= min_observability
        and components["routingConfidence"] >= clamp_score(policy.get("minConfidence"), 0.65)
        and components["riskScore"] <= clamp_score(policy.get("maxAutoRisk"), 0.35)
    ):
        return "auto_register_probation"

    if (
        _is_cheap_watch_eligible(source_understanding)
        and components["capabilityFit"] >= clamp_score(policy.get("cheapWatchThreshold"), 0.35)
        and components["technicalObservability"] >= clamp_score(policy.get("minCheapWatchObservability"), 0.30)
        and components["riskScore"] <= clamp_score(policy.get("maxWatchRisk"), 0.60)
    ):
        return "cheap_watch"

    if components["capabilityFit"] >= clamp_score(policy.get("inventoryThreshold"), 0.15):
        return "inventory"
    if source_understanding.get("classificationUncertain") and source_understanding.get("potentialHigh"):
        return "manual_review"
    return "inventory_low_priority"


def _reason(
    decision: str,
    components: dict[str, float],
    hard_blockers: set[str],
    provider_type: str,
    access_pattern: str,
) -> str:
    if decision == "blocked":
        blocker = sorted(hard_blockers & HARD_BLOCKERS)
        return f"Hard blocker: {blocker[0]}" if blocker else "Access policy blocks this source."
    if decision == "adapter_backlog":
        return f"{provider_type} source requires adapter/config before safe monitoring."
    if decision == "auto_register_probation":
        return "High capability, low risk and observable source can enter rollbackable probation."
    if decision == "cheap_watch":
        return "Source can plausibly produce desired signals and can be watched cheaply."
    if decision == "manual_review":
        return f"Manual review required for risk/access uncertainty ({access_pattern})."
    return f"Capability fit {components['capabilityFit']:.2f} retained without yield penalty."


def _actions(decision: str, provider_type: str) -> list[dict[str, Any]]:
    if decision == "auto_register_probation":
        return [
            {"actionType": "store_in_inventory", "status": "pending"},
            {"actionType": "create_probation_channel", "providerType": provider_type, "status": "pending"},
        ]
    if decision == "cheap_watch":
        return [
            {"actionType": "store_in_inventory", "status": "pending"},
            {"actionType": "create_monitoring_state", "status": "pending"},
        ]
    if decision == "adapter_backlog":
        return [
            {"actionType": "store_in_inventory", "status": "pending"},
            {"actionType": "create_adapter_backlog_item", "status": "pending"},
        ]
    if decision in {"inventory", "inventory_low_priority", "manual_review"}:
        return [{"actionType": "store_in_inventory", "status": "pending"}]
    if decision == "inventory_context":
        return [
            {"actionType": "store_in_inventory", "status": "pending"},
            {"actionType": "retain_for_context", "status": "pending"},
        ]
    return []


def _is_context_only(source_understanding: dict[str, Any]) -> bool:
    voice = str(source_understanding.get("sourceVoice") or "unknown")
    freshness = str(source_understanding.get("artifactFreshnessKind") or "unknown")
    mode = str(source_understanding.get("signalProductionMode") or "unknown")
    if voice in {"seller_or_vendor", "third_party_commentary"} and mode in {"secondary_context", "unlikely", "unknown"}:
        return True
    if freshness in {"static_service_page", "evergreen_article", "documentation_or_guide"} and mode in {"secondary_context", "unlikely"}:
        return True
    return False


def _is_auto_register_eligible_source_mode(
    source_understanding: dict[str, Any],
    policy: dict[str, Any],
    *,
    provider_type: str,
) -> bool:
    mode = str(source_understanding.get("signalProductionMode") or "unknown")
    freshness = str(source_understanding.get("artifactFreshnessKind") or "unknown")
    voice = str(source_understanding.get("sourceVoice") or "unknown")
    access_pattern = str(source_understanding.get("accessPattern") or "unknown")
    allowed_modes = {str(item) for item in policy.get("allowedAutoRegisterSignalProductionModes") or []}
    allowed_freshness = {str(item) for item in policy.get("allowedAutoRegisterFreshnessKinds") or []}
    blocked_voices = {str(item) for item in policy.get("blockedAutoRegisterSourceVoices") or []}
    if access_pattern != "public":
        return False
    if voice in blocked_voices:
        return False
    if mode == "source_directory" and provider_type not in {"website", "document_portal"}:
        return False
    return mode in allowed_modes and freshness in allowed_freshness


def _provider_validated_for_auto_register(source_understanding: dict[str, Any], provider_type: str) -> bool:
    summary = source_understanding.get("probeSummary") if isinstance(source_understanding.get("probeSummary"), dict) else {}
    if provider_type == "rss":
        return summary.get("validFeed") is True
    if provider_type in {"website", "document_portal"}:
        hints = summary.get("pageRoleHints") if isinstance(summary.get("pageRoleHints"), dict) else {}
        return bool(
            summary.get("listingSignals")
            or summary.get("documentSignals")
            or summary.get("validFeed")
            or hints.get("officialOwnerLikely")
            or hints.get("publicAuthorityLikely")
        )
    return provider_type not in {"unknown", "api"}


def _is_cheap_watch_eligible(source_understanding: dict[str, Any]) -> bool:
    mode = str(source_understanding.get("signalProductionMode") or "unknown")
    return mode in {
        "official_update",
        "source_directory",
        "precursor_context",
        "direct_event_feed",
        "direct_request_or_listing",
    }

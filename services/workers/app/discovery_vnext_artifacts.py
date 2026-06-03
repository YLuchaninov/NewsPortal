from __future__ import annotations

from dataclasses import dataclass
from typing import Any


ARTIFACT_TYPES = {
    "DiscoveryBrief",
    "HypothesisBatch",
    "ProbePlan",
    "ProbeReport",
    "SourceScopeResolution",
    "SourceUnderstanding",
    "RoutingDecision",
    "QueryQualityReport",
}
ARTIFACT_STATUSES = {"draft", "generated", "validated", "rejected", "superseded", "applied", "expired"}
MEMORY_MODES = {"blind", "thin", "gap_only", "locale", "artifact_lens", "adversarial", "full", "full_evaluator_only"}
FRESHNESS_NEEDS = {"fast", "normal", "slow", "rare", "unknown"}
DIRECTNESS_VALUES = {"direct", "indirect", "precursor", "contextual"}
CAPABILITY_VALUES = {"high", "medium", "low", "unknown"}
ACCESS_PATTERNS = {"public", "requires_browser", "requires_auth", "captcha_blocked", "blocked", "unknown"}
ARTIFACT_EXPECTATIONS = {
    "article",
    "listing",
    "document",
    "dataset",
    "thread",
    "profile",
    "changelog",
    "registry_entry",
    "report",
    "unknown",
}
ROUTING_DECISIONS = {
    "inventory",
    "inventory_context",
    "inventory_low_priority",
    "cheap_watch",
    "auto_register_probation",
    "manual_review",
    "adapter_backlog",
    "blocked",
    "rejected_structural",
}
SOURCE_VOICES = {
    "owner_or_operator",
    "public_authority",
    "seller_or_vendor",
    "aggregator_or_directory",
    "community_or_ugc",
    "third_party_commentary",
    "unknown",
}
ARTIFACT_FRESHNESS_KINDS = {
    "recurring_listing",
    "recurring_feed",
    "official_update",
    "static_service_page",
    "evergreen_article",
    "documentation_or_guide",
    "dataset_or_registry",
    "community_thread",
    "unknown",
}
SIGNAL_PRODUCTION_MODES = {
    "direct_event_feed",
    "direct_request_or_listing",
    "official_update",
    "precursor_context",
    "source_directory",
    "secondary_context",
    "unlikely",
    "unknown",
}
SOURCE_SCOPE_TYPES = {
    "domain_root",
    "section",
    "feed",
    "api_endpoint",
    "listing_page",
    "search_endpoint",
    "document_collection",
    "single_item",
    "context_page",
    "blocked_or_unusable",
    "unknown",
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
YIELD_FORBIDDEN_TERMS = {
    "yield",
    "recent_yield",
    "useful_selected_items",
    "selected_count",
    "useful_hit",
    "useful_hits",
}


@dataclass(frozen=True)
class ValidationIssue:
    path: str
    code: str
    message: str

    def as_dict(self) -> dict[str, str]:
        return {"path": self.path, "code": self.code, "message": self.message}


def _is_record(value: Any) -> bool:
    return isinstance(value, dict)


def _string(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""


def _list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _record(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _push(issues: list[ValidationIssue], path: str, code: str, message: str) -> None:
    issues.append(ValidationIssue(path=path, code=code, message=message))


def _require_string(payload: dict[str, Any], key: str, issues: list[ValidationIssue], path: str = "$") -> None:
    if not _string(payload.get(key)):
        _push(issues, f"{path}.{key}", "required", f"{key} must be a non-empty string.")


def _require_list(payload: dict[str, Any], key: str, issues: list[ValidationIssue], path: str = "$") -> None:
    if not isinstance(payload.get(key), list) or not payload.get(key):
        _push(issues, f"{path}.{key}", "required", f"{key} must be a non-empty list.")


def _enum(value: Any, allowed: set[str], issues: list[ValidationIssue], path: str) -> None:
    if value not in allowed:
        _push(issues, path, "invalid_enum", f"{path} contains an unsupported value.")


def validate_artifact_envelope(artifact: dict[str, Any]) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    if not _is_record(artifact):
        return [ValidationIssue("$", "invalid_type", "artifact must be an object.")]

    artifact_type = artifact.get("artifactType") or artifact.get("artifact_type")
    if artifact_type not in ARTIFACT_TYPES:
        _push(issues, "$.artifactType", "invalid_enum", "artifactType is unsupported.")
    if artifact.get("schemaVersion") not in {None, "1.0"} and artifact.get("schema_version") not in {None, "1.0"}:
        _push(issues, "$.schemaVersion", "invalid_schema_version", "schemaVersion must be 1.0.")

    status = artifact.get("status", "generated")
    _enum(status, ARTIFACT_STATUSES, issues, "$.status")

    memory_mode = artifact.get("memoryMode") or artifact.get("memory_mode")
    if memory_mode is not None:
        _enum(memory_mode, MEMORY_MODES, issues, "$.memoryMode")

    parent_ids = artifact.get("parentArtifactIds") or artifact.get("parent_artifact_ids") or []
    if not isinstance(parent_ids, list):
        _push(issues, "$.parentArtifactIds", "invalid_type", "parentArtifactIds must be a list.")

    payload = artifact.get("payload")
    if not _is_record(payload):
        _push(issues, "$.payload", "invalid_type", "payload must be an object.")
    elif artifact_type in ARTIFACT_TYPES:
        issues.extend(validate_artifact_payload(str(artifact_type), payload))

    return issues


def validate_artifact_payload(artifact_type: str, payload: dict[str, Any]) -> list[ValidationIssue]:
    validators = {
        "DiscoveryBrief": validate_discovery_brief,
        "HypothesisBatch": validate_hypothesis_batch,
        "ProbePlan": validate_probe_plan,
        "ProbeReport": validate_probe_report,
        "SourceScopeResolution": validate_source_scope_resolution,
        "SourceUnderstanding": validate_source_understanding,
        "RoutingDecision": validate_routing_decision,
        "QueryQualityReport": validate_query_quality_report,
    }
    validator = validators.get(artifact_type)
    return validator(payload) if validator else [ValidationIssue("$", "invalid_type", "unsupported artifact type.")]


def validate_discovery_brief(payload: dict[str, Any]) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    _require_string(payload, "goal", issues)
    _require_list(payload, "desiredSignals", issues)
    _require_list(payload, "negativeSignals", issues)
    _require_list(payload, "artifactExpectations", issues)
    if not _is_record(payload.get("constraints")):
        _push(issues, "$.constraints", "required", "constraints must be an object.")

    freshness_need = payload.get("freshnessNeed", "unknown")
    _enum(freshness_need, FRESHNESS_NEEDS, issues, "$.freshnessNeed")

    for index, signal in enumerate(_list(payload.get("desiredSignals"))):
        signal_path = f"$.desiredSignals.{index}"
        if not _is_record(signal):
            _push(issues, signal_path, "invalid_type", "desired signal must be an object.")
            continue
        _require_string(signal, "description", issues, signal_path)
        if signal.get("directness") is not None:
            _enum(signal.get("directness"), DIRECTNESS_VALUES, issues, f"{signal_path}.directness")
        if not _list(signal.get("expectedEvidencePatterns")):
            _push(
                issues,
                f"{signal_path}.expectedEvidencePatterns",
                "required",
                "desired signal must include expected evidence patterns.",
            )

    for index, artifact_type in enumerate(_list(payload.get("artifactExpectations"))):
        if artifact_type not in ARTIFACT_EXPECTATIONS:
            _push(
                issues,
                f"$.artifactExpectations.{index}",
                "invalid_enum",
                "artifact expectation is not supported.",
            )

    issues.extend(validate_domain_neutrality(payload))
    return issues


def validate_domain_neutrality(payload: dict[str, Any]) -> list[ValidationIssue]:
    source_text = " ".join(
        str(payload.get(key) or "")
        for key in ("interestName", "goal", "sourceInterestText", "source_interest_text")
    ).lower()
    issues: list[ValidationIssue] = []
    source_tokens = set(_domain_tokenize(source_text))
    for key in ("keywordHints", "querySeeds"):
        for index, value in enumerate(_list(payload.get(key))):
            generated_tokens = _domain_tokenize(str(value).lower())
            missing = [
                token
                for token in generated_tokens
                if token not in source_tokens and token not in {"public", "source", "signal", "evidence", "update", "updates"}
            ]
            if missing:
                _push(
                    issues,
                    f"$.{key}.{index}",
                    "domain_contamination",
                    f"{key} introduces terms absent from the source interest.",
                )
                break
    return issues


def _domain_tokenize(text: str) -> list[str]:
    normalized = text.replace("_", " ")
    return [
        token
        for token in "".join(char if char.isalnum() else " " for char in normalized).split()
        if len(token) >= 4
    ]


def validate_hypothesis_batch(payload: dict[str, Any]) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    _enum(payload.get("memoryMode"), MEMORY_MODES, issues, "$.memoryMode")
    _require_string(payload, "lens", issues)
    _require_list(payload, "hypotheses", issues)
    for index, hypothesis in enumerate(_list(payload.get("hypotheses"))):
        path = f"$.hypotheses.{index}"
        if not _is_record(hypothesis):
            _push(issues, path, "invalid_type", "hypothesis must be an object.")
            continue
        _require_string(hypothesis, "sourceRoleDescription", issues, path)
        _require_list(hypothesis, "expectedSignalLinks", issues, path)
        _require_list(hypothesis, "queryFamilies", issues, path)
    return issues


def validate_probe_plan(payload: dict[str, Any]) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    _require_string(payload, "candidateUrl", issues)
    _require_string(payload, "probeStrategy", issues)
    _require_list(payload, "checks", issues)
    limits = _record(payload.get("limits"))
    if not limits:
        _push(issues, "$.limits", "required", "ProbePlan must include limits.")
    elif int(limits.get("maxBrowserRequests") or 0) > 0 and "bounded_browser" not in _list(payload.get("allowedEscalations")):
        _push(
            issues,
            "$.limits.maxBrowserRequests",
            "browser_escalation_not_allowed",
            "browser probe requests require an explicit bounded_browser escalation.",
        )
    disallowed = set(str(item) for item in _list(payload.get("disallowedActions")))
    if not {"login", "captcha_bypass"}.issubset(disallowed):
        _push(issues, "$.disallowedActions", "unsafe_probe_plan", "login and captcha_bypass must be disallowed.")
    return issues


def validate_probe_report(payload: dict[str, Any]) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    _require_string(payload, "candidateUrl", issues)
    _enum(payload.get("accessPattern", "unknown"), ACCESS_PATTERNS, issues, "$.accessPattern")
    if not _is_record(payload.get("technicalObservability")):
        _push(issues, "$.technicalObservability", "required", "technicalObservability must be an object.")
    if not _is_record(payload.get("probeCost")):
        _push(issues, "$.probeCost", "required", "probeCost must be an object.")
    return issues


def validate_source_scope_resolution(payload: dict[str, Any]) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    _require_string(payload, "candidateUrl", issues)
    _require_string(payload, "resolvedSourceUrl", issues)
    _enum(payload.get("sourceScopeType"), SOURCE_SCOPE_TYPES, issues, "$.sourceScopeType")
    if payload.get("sourceScopeConfidence") is None:
        _push(issues, "$.sourceScopeConfidence", "required", "SourceScopeResolution must include confidence.")
    if not isinstance(payload.get("monitoringEntryUrls"), list):
        _push(issues, "$.monitoringEntryUrls", "required", "monitoringEntryUrls must be a list.")
    if not _is_record(payload.get("itemExtractionHints")):
        _push(issues, "$.itemExtractionHints", "required", "itemExtractionHints must be an object.")
    if not _list(payload.get("resolutionEvidence")):
        _push(issues, "$.resolutionEvidence", "required", "resolutionEvidence must be a non-empty list.")
    if not _is_record(payload.get("risk")):
        _push(issues, "$.risk", "required", "risk must be an object.")
    return issues


def validate_source_understanding(payload: dict[str, Any]) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    _require_string(payload, "sourceUrl", issues)
    if payload.get("sourceScopeType") is not None:
        _enum(payload.get("sourceScopeType"), SOURCE_SCOPE_TYPES, issues, "$.sourceScopeType")
    _require_string(payload, "sourceRoleDescription", issues)
    _enum(payload.get("sourceVoice"), SOURCE_VOICES, issues, "$.sourceVoice")
    _enum(payload.get("artifactFreshnessKind"), ARTIFACT_FRESHNESS_KINDS, issues, "$.artifactFreshnessKind")
    _enum(payload.get("signalProductionMode"), SIGNAL_PRODUCTION_MODES, issues, "$.signalProductionMode")
    if not _list(payload.get("observedArtifactTypes")):
        _push(issues, "$.observedArtifactTypes", "required", "SourceUnderstanding must include observedArtifactTypes.")
    if payload.get("sourceRoleConfidence") is None:
        _push(issues, "$.sourceRoleConfidence", "required", "SourceUnderstanding must include sourceRoleConfidence.")
    _require_list(payload, "canProduceSignals", issues)
    _require_string(payload, "reasonToKeep", issues)
    _require_string(payload, "reasonNotToAutoRegister", issues)
    if payload.get("yieldIndependent") is not True:
        _push(issues, "$.yieldIndependent", "yield_dependent", "SourceUnderstanding must be yield-independent.")
    if not _is_record(payload.get("risk")):
        _push(issues, "$.risk", "required", "risk must be an object.")
    if _mentions_forbidden_yield_reason(payload):
        _push(
            issues,
            "$",
            "yield_reason_forbidden",
            "SourceUnderstanding must not use historical yield or selected counts as keep/drop evidence.",
        )
    for index, signal in enumerate(_list(payload.get("canProduceSignals"))):
        path = f"$.canProduceSignals.{index}"
        if not _is_record(signal):
            _push(issues, path, "invalid_type", "canProduceSignals item must be an object.")
            continue
        _enum(signal.get("capability", "unknown"), CAPABILITY_VALUES, issues, f"{path}.capability")
        _enum(signal.get("directness", "contextual"), DIRECTNESS_VALUES, issues, f"{path}.directness")
        if not _list(signal.get("evidenceFromProbe")):
            _push(issues, f"{path}.evidenceFromProbe", "required", "signal capability must cite probe evidence.")
        if "counterEvidence" in signal and not isinstance(signal.get("counterEvidence"), list):
            _push(issues, f"{path}.counterEvidence", "invalid_type", "counterEvidence must be a list when present.")
    return issues


def _mentions_forbidden_yield_reason(value: Any) -> bool:
    if isinstance(value, str):
        text = value.lower()
        return any(term in text for term in YIELD_FORBIDDEN_TERMS)
    if isinstance(value, list):
        return any(_mentions_forbidden_yield_reason(item) for item in value)
    if isinstance(value, dict):
        return any(_mentions_forbidden_yield_reason(item) for item in value.values())
    return False


def validate_routing_decision(payload: dict[str, Any]) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    _enum(payload.get("decision"), ROUTING_DECISIONS, issues, "$.decision")
    _require_string(payload, "policyVersion", issues)
    if not _is_record(payload.get("scoreComponents")):
        _push(issues, "$.scoreComponents", "required", "scoreComponents must be an object.")
    if "usefulYieldScore" in _record(payload.get("scoreComponents")):
        _push(issues, "$.scoreComponents.usefulYieldScore", "yield_score_forbidden", "yield is telemetry only.")
    return issues


def validate_query_quality_report(payload: dict[str, Any]) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    _require_string(payload, "query", issues)
    _require_string(payload, "queryFamilyIntent", issues)
    _enum(
        payload.get("queryPurpose"),
        {
            "find_direct_sources",
            "find_source_directories",
            "find_terminology",
            "find_documents",
            "find_discussions",
            "find_official_owners",
            "find_local_language_forms",
        },
        issues,
        "$.queryPurpose",
    )
    _enum(
        payload.get("quality"),
        {
            "useful_for_acquisition",
            "useful_for_query_expansion",
            "needs_refinement",
            "noisy",
            "exhausted",
        },
        issues,
        "$.quality",
    )
    if not _is_record(payload.get("observedResultMix")):
        _push(issues, "$.observedResultMix", "required", "observedResultMix must be an object.")
    _enum(
        payload.get("recommendedNextAction"),
        {"probe_top_candidates", "refine_query", "use_different_lens", "stop_family"},
        issues,
        "$.recommendedNextAction",
    )
    return issues


def validation_json(issues: list[ValidationIssue]) -> dict[str, Any]:
    return {
        "schemaValid": not issues,
        "policyValid": not issues,
        "errors": [issue.as_dict() for issue in issues],
    }

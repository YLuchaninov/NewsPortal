from __future__ import annotations

from copy import deepcopy
from typing import Any


TRUST_STAGE_VALUES = {
    "probation": {"coverageContribution": 0.25, "downstreamWeight": 0.3},
    "active": {"coverageContribution": 1.0, "downstreamWeight": 1.0},
    "degraded": {"coverageContribution": 0.0, "downstreamWeight": 0.0},
}

DEFAULT_CONTRACT_THRESHOLDS = {
    "rss": {
        "minimumUsefulItemsPerWindow": 3,
        "windowDays": 30,
        "maxNoiseRate": 0.55,
        "maxDuplicateRate": 0.60,
        "maxStalenessDays": 45,
        "minTopicFitScore": 0.50,
        "minExtractionSuccessRate": 0.80,
        "minSuccessfulFetchCount": 3,
    },
    "website": {
        "minimumUsefulItemsPerWindow": 2,
        "windowDays": 30,
        "maxNoiseRate": 0.60,
        "maxDuplicateRate": 0.65,
        "maxStalenessDays": 45,
        "minTopicFitScore": 0.45,
        "minExtractionSuccessRate": 0.65,
        "minSuccessfulFetchCount": 2,
    },
}


def _string_or_none(value: Any) -> str | None:
    if value is None:
        return None
    normalized = str(value).strip()
    return normalized or None


def build_source_evidence_contract(source: dict[str, Any]) -> dict[str, Any]:
    provider_type = str(source.get("provider_type") or source.get("providerType") or "website")
    source_role = str(
        source.get("source_role")
        or source.get("sourceRole")
        or source.get("sourceRoleDescription")
        or "industry_niche"
    )
    endpoint_kind = str(source.get("endpoint_kind") or source.get("endpointKind") or "unknown")
    expected_data_shape = source.get("expected_data_shape") or source.get("expectedDataShape")
    thresholds = deepcopy(DEFAULT_CONTRACT_THRESHOLDS.get(provider_type, DEFAULT_CONTRACT_THRESHOLDS["website"]))

    return {
        "contractVersion": "vnext-1",
        "candidateId": _string_or_none(source.get("candidate_id") or source.get("candidateId")),
        "artifactId": _string_or_none(source.get("artifact_id") or source.get("artifactId")),
        "sourceUrl": _string_or_none(source.get("source_url") or source.get("sourceUrl") or source.get("url")),
        "sourceRole": source_role,
        "signalMode": source.get("signal_mode") or source.get("signalMode") or "direct",
        "providerType": provider_type,
        "endpointKind": endpoint_kind,
        "expectedDataShape": expected_data_shape,
        "expectedEvidence": expected_evidence_for_role(source_role, endpoint_kind),
        **thresholds,
        "degradationTriggers": [
            "no_useful_items",
            "high_noise",
            "stale",
            "fetch_failures",
            "provider_auth_failed",
            "browser_challenge",
            "contract_mismatch",
        ],
        "repairActions": [
            "refresh_probe",
            "try_sibling_source",
            "replace_source",
            "switch_provider",
            "request_manual_review",
        ],
    }


def expected_evidence_for_role(source_role: str, endpoint_kind: str) -> list[str]:
    if source_role == "procurement_signal" or endpoint_kind == "procurement":
        return ["listing items", "document links", "publication dates", "buyer/issuer", "scope text"]
    if source_role == "technical_change" or endpoint_kind in {"release_notes", "docs"}:
        return ["change title", "publication dates", "version or product reference", "stable item links"]
    if source_role == "primary_data" or endpoint_kind in {"dataset", "api_openapi"}:
        return ["dataset/API metadata", "download or path list", "schema or fields", "refresh dates"]
    if source_role == "report_research" or endpoint_kind == "report_library":
        return ["publication titles", "downloadable documents", "publication dates", "publisher metadata"]
    return ["recent items", "stable item links", "publication dates", "topic-relevant samples"]


def trust_stage_config(stage: str) -> dict[str, Any]:
    values = TRUST_STAGE_VALUES.get(stage, TRUST_STAGE_VALUES["probation"])
    return {
        "trustStage": stage if stage in TRUST_STAGE_VALUES else "probation",
        "coverageContribution": values["coverageContribution"],
        "downstreamWeight": values["downstreamWeight"],
    }


def build_discovery_config_fragment(
    source: dict[str, Any],
    contract: dict[str, Any] | None = None,
    *,
    trust_stage: str = "probation",
) -> dict[str, Any]:
    evidence_contract = contract or build_source_evidence_contract(source)
    return {
        "version": "vnext-1",
        **trust_stage_config(trust_stage),
        "candidateId": evidence_contract.get("candidateId"),
        "artifactId": evidence_contract.get("artifactId"),
        "sourceUrl": evidence_contract.get("sourceUrl"),
        "sourceRole": evidence_contract.get("sourceRole"),
        "signalMode": evidence_contract.get("signalMode"),
        "endpointKind": evidence_contract.get("endpointKind"),
        "evidenceContract": evidence_contract,
    }

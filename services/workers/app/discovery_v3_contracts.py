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


def build_source_evidence_contract(endpoint: dict[str, Any]) -> dict[str, Any]:
    provider_type = str(endpoint.get("provider_type") or endpoint.get("providerType") or "website")
    source_role = str(endpoint.get("source_role") or endpoint.get("sourceRole") or "industry_niche")
    endpoint_kind = str(endpoint.get("endpoint_kind") or endpoint.get("endpointKind") or "unknown")
    expected_data_shape = endpoint.get("expected_data_shape") or endpoint.get("expectedDataShape")
    thresholds = deepcopy(DEFAULT_CONTRACT_THRESHOLDS.get(provider_type, DEFAULT_CONTRACT_THRESHOLDS["website"]))

    return {
        "contractVersion": "1.0",
        "targetId": _string_or_none(endpoint.get("target_id") or endpoint.get("targetId")),
        "endpointId": _string_or_none(endpoint.get("endpoint_id") or endpoint.get("endpointId")),
        "sourceRole": source_role,
        "signalMode": endpoint.get("signal_mode") or endpoint.get("signalMode") or "direct",
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
            "resweep_domain",
            "try_sibling_endpoints",
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
    endpoint: dict[str, Any],
    contract: dict[str, Any] | None = None,
    *,
    trust_stage: str = "probation",
) -> dict[str, Any]:
    evidence_contract = contract or build_source_evidence_contract(endpoint)
    return {
        **trust_stage_config(trust_stage),
        "targetId": evidence_contract.get("targetId"),
        "endpointId": evidence_contract.get("endpointId"),
        "sourceRole": evidence_contract.get("sourceRole"),
        "signalMode": evidence_contract.get("signalMode"),
        "endpointKind": evidence_contract.get("endpointKind"),
        "evidenceContract": evidence_contract,
    }


def evaluate_source_contract(contract: dict[str, Any], metrics: dict[str, Any]) -> dict[str, Any]:
    provider_type = str(contract.get("providerType") or "website")
    useful_items = int(metrics.get("useful_item_count") or metrics.get("useful_resource_count") or 0)
    successful_fetches = int(metrics.get("successful_fetch_count") or 0)
    duplicate_rate = float(metrics.get("duplicate_rate") or 0)
    noise_rate = float(metrics.get("noise_rate") or 0)
    topic_fit = float(metrics.get("topic_fit_score") or 0)
    extraction_success = float(metrics.get("extraction_success_rate") or 0)
    browser_challenge = bool(metrics.get("browser_challenge"))

    failures: list[str] = []
    if successful_fetches < int(contract.get("minSuccessfulFetchCount") or 0):
        failures.append("fetch_count_below_contract")
    if useful_items < int(contract.get("minimumUsefulItemsPerWindow") or 0):
        failures.append("useful_yield_below_contract")
    if duplicate_rate > float(contract.get("maxDuplicateRate") or 1):
        failures.append("duplicate_rate_above_contract")
    if noise_rate > float(contract.get("maxNoiseRate") or 1):
        failures.append("noise_rate_above_contract")
    if topic_fit < float(contract.get("minTopicFitScore") or 0):
        failures.append("topic_fit_below_contract")
    if extraction_success < float(contract.get("minExtractionSuccessRate") or 0):
        failures.append("extraction_success_below_contract")
    if provider_type == "website" and browser_challenge:
        failures.append("browser_challenge")

    status = "active" if not failures else "degraded"
    if failures and successful_fetches < int(contract.get("minSuccessfulFetchCount") or 0):
        status = "probation"

    useful_yield_score = min(1.0, useful_items / max(1, int(contract.get("minimumUsefulItemsPerWindow") or 1)))
    health_score = max(
        0.0,
        min(
            1.0,
            successful_fetches / max(1, int(contract.get("minSuccessfulFetchCount") or 1)) * 0.25
            + useful_yield_score * 0.25
            + (1 - min(1.0, duplicate_rate)) * 0.15
            + (1 - min(1.0, noise_rate)) * 0.10
            + topic_fit * 0.15
            + extraction_success * 0.10,
        ),
    )

    return {
        "status": status,
        "passed": status == "active",
        "failureReasons": failures,
        "trust": trust_stage_config("active" if status == "active" else "degraded"),
        "healthScore": round(health_score, 4),
        "contractFitScore": round(topic_fit, 4),
        "usefulYieldScore": round(useful_yield_score, 4),
        "noiseScore": round(1 - min(1.0, noise_rate), 4),
        "freshnessScore": float(metrics.get("freshness_score") or 0),
    }

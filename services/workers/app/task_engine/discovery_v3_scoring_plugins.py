from __future__ import annotations

from typing import Any

from ..discovery_v3_actions import decide_action
from ..discovery_v3_scoring import compute_endpoint_total_score
from .discovery_plugin_common import ContextTaskPlugin, _coerce_mapping_list


class DiscoveryV3EndpointScorerPlugin(ContextTaskPlugin):
    name = "discovery.v3.endpoint_scorer"
    description = "Score v3 endpoint candidates with the resilient discovery endpoint formula."
    category = "discovery"

    async def execute(self, options: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
        field = self._resolve_optional_string(
            options=options,
            context=context,
            key="endpoints_field",
            aliases=("endpointsField",),
        ) or "discovery_v3_endpoint_candidates"
        endpoints = _coerce_mapping_list(context.get(field) or options.get("endpoints") or [], field_name=field)
        scored = [score_endpoint_candidate(endpoint, options.get("defaults") if isinstance(options.get("defaults"), dict) else {}) for endpoint in endpoints]
        return {"discovery_v3_scored_endpoints": scored}

    def describe_inputs(self) -> dict[str, str]:
        return {"discovery_v3_endpoint_candidates": "Endpoint candidates with evidence/probe scores."}

    def describe_outputs(self) -> dict[str, str]:
        return {"discovery_v3_scored_endpoints": "Endpoint candidates with total_score populated."}


class DiscoveryV3ActionDeciderPlugin(ContextTaskPlugin):
    name = "discovery.v3.action_decider"
    description = "Decide v3 endpoint recommended actions from score, evidence and provider policy."
    category = "discovery"

    async def execute(self, options: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
        field = self._resolve_optional_string(
            options=options,
            context=context,
            key="endpoints_field",
            aliases=("endpointsField",),
        ) or "discovery_v3_scored_endpoints"
        endpoints = _coerce_mapping_list(context.get(field) or options.get("endpoints") or [], field_name=field)
        decided = [decide_endpoint_candidate(endpoint) for endpoint in endpoints]
        return {"discovery_v3_actioned_endpoints": decided}

    def describe_inputs(self) -> dict[str, str]:
        return {"discovery_v3_scored_endpoints": "Scored endpoint candidates."}

    def describe_outputs(self) -> dict[str, str]:
        return {"discovery_v3_actioned_endpoints": "Endpoint candidates with status and recommended action."}


def score_endpoint_candidate(endpoint: dict[str, Any], defaults: dict[str, Any] | None = None) -> dict[str, Any]:
    merged = {**(defaults or {}), **endpoint}
    scores = {
        "interest_fit_score": _score_value(merged, "interest_fit_score", "interestFitScore", default=0.45),
        "evidence_score": _score_value(merged, "evidence_score", "evidenceScore", default=0.0),
        "quality_score": _score_value(merged, "quality_score", "qualityScore", default=0.45),
        "yield_score": _score_value(merged, "yield_score", "yieldScore", default=0.0),
        "freshness_score": _score_value(merged, "freshness_score", "freshnessScore", default=0.35),
        "extraction_ready_score": _score_value(merged, "extraction_ready_score", "extractionReadyScore", default=0.25),
        "coverage_gap_score": _score_value(merged, "coverage_gap_score", "coverageGapScore", default=0.5),
        "novelty_score": _score_value(merged, "novelty_score", "noveltyScore", default=1.0),
        "compliance_score": _score_value(merged, "compliance_score", "complianceScore", default=0.95),
        "adversarial_confidence_score": _score_value(
            merged,
            "adversarial_confidence_score",
            "adversarialConfidenceScore",
            default=0.5,
        ),
    }
    total = compute_endpoint_total_score(scores)
    return {**merged, **scores, "total_score": total}


def decide_endpoint_candidate(endpoint: dict[str, Any]) -> dict[str, Any]:
    recommended_action, reason = decide_action(endpoint)
    status = {
        "auto_promote": "promotable",
        "manual_promote": "manual_review",
        "review": "manual_review",
        "monitor": "monitor_only",
        "detect_only": "detect_only",
        "needs_config": "needs_config",
        "reject": "rejected",
    }.get(recommended_action, "manual_review")
    return {
        **endpoint,
        "recommended_action": recommended_action,
        "status": status,
        "action_reason": reason,
    }


def _score_value(row: dict[str, Any], *keys: str, default: float) -> float:
    for key in keys:
        if row.get(key) is not None:
            try:
                return max(0.0, min(1.0, float(row[key])))
            except (TypeError, ValueError):
                return default
    return default

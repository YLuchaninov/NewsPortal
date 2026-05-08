from __future__ import annotations

from typing import Any

from .discovery_v3_provider_capabilities import (
    get_provider_card,
    provider_allows_promotion,
    provider_requires_config,
)


def decide_hypothesis_execution(
    hypothesis: dict[str, Any],
    verification: dict[str, Any] | None = None,
) -> tuple[str, str]:
    check = verification or {}
    max_severity = float(check.get("maxSeverity") or hypothesis.get("maxSeverity") or 0)
    disagreement = float(check.get("disagreementScore") or hypothesis.get("disagreementScore") or 0)
    risk = float(hypothesis.get("riskScore") or hypothesis.get("risk_score") or 0.5)
    repair_quality = float(hypothesis.get("repairQualityScore") or hypothesis.get("repair_quality_score") or 0)
    provider_id = str(hypothesis.get("providerId") or hypothesis.get("provider_id") or "")
    signal_mode = str(hypothesis.get("signalMode") or hypothesis.get("signal_mode") or "direct")
    duplicate = bool(hypothesis.get("duplicate"))
    compliance_risk = float(hypothesis.get("complianceRisk") or hypothesis.get("compliance_risk") or 0)

    if duplicate:
        return "reject", "duplicate_hypothesis"
    if max_severity >= 0.85 or compliance_risk >= 0.75:
        return "reject", "blocking_risk"
    provider_card = get_provider_card(provider_id) if provider_id else None
    if provider_id and provider_card is None:
        return "reject", "unknown_provider"
    if provider_id and not bool(provider_card.get("discoverySupported", True)):
        return "reject", "provider_discovery_disabled"
    if provider_id and provider_requires_config(provider_id):
        return "needs_config", "provider_requires_config"
    if disagreement >= 0.65:
        return "manual_review", "persistent_disagreement"
    if (
        provider_id
        and not provider_allows_promotion(provider_id)
        and signal_mode != "hidden"
        and provider_id != "web_search"
    ):
        return "monitor_only", "provider_is_monitor_or_detect_only"
    if max_severity <= 0.35 and risk <= 0.55:
        return "accept", "low_risk_hypothesis"
    if max_severity <= 0.60 and repair_quality >= 0.65 and risk <= 0.65:
        return "accept_after_repair", "repaired_hypothesis"
    if signal_mode == "hidden":
        return "monitor_only", "hidden_signal_requires_confirmation"
    return "manual_review", "uncertain_hypothesis"


def decide_pack(
    pack: dict[str, Any],
    verification: dict[str, Any] | None = None,
) -> dict[str, Any]:
    decided: list[dict[str, Any]] = []
    for hypothesis in list(pack.get("hypotheses") or []):
        if not isinstance(hypothesis, dict):
            continue
        decision, reason = decide_hypothesis_execution(hypothesis, verification)
        row = dict(hypothesis)
        row["refereeDecision"] = decision
        row["refereeReason"] = reason
        decided.append(row)
    return {**pack, "hypotheses": decided}

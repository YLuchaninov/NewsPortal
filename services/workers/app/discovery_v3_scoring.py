from __future__ import annotations

from typing import Any


def clamp(value: float, minimum: float = 0.0, maximum: float = 1.0) -> float:
    return max(minimum, min(maximum, value))


def compute_endpoint_total_score(scores: dict[str, Any]) -> float:
    return clamp(
        float(scores.get("interest_fit_score") or 0) * 0.22
        + float(scores.get("evidence_score") or 0) * 0.20
        + float(scores.get("quality_score") or 0) * 0.12
        + float(scores.get("yield_score") or 0) * 0.10
        + float(scores.get("freshness_score") or 0) * 0.08
        + float(scores.get("extraction_ready_score") or 0) * 0.10
        + float(scores.get("coverage_gap_score") or 0) * 0.08
        + float(scores.get("compliance_score") or 0) * 0.06
        + float(scores.get("adversarial_confidence_score") or 0) * 0.04
    )


def compute_hidden_signal_confidence(cluster: dict[str, Any]) -> float:
    return clamp(
        float(cluster.get("need_score") or 0) * 0.25
        + float(cluster.get("evidence_count_score") or 0) * 0.15
        + float(cluster.get("independent_source_score") or 0) * 0.20
        + float(cluster.get("unique_author_score") or 0) * 0.10
        + float(cluster.get("burst_score") or 0) * 0.10
        + float(cluster.get("novelty_score") or 0) * 0.10
        + float(cluster.get("cross_provider_score") or 0) * 0.10
        - float(cluster.get("spam_risk") or 0) * 0.20
        - float(cluster.get("campaign_risk") or 0) * 0.15
    )


def compute_adversarial_confidence(values: dict[str, Any]) -> float:
    skeptic_pass_score = 1.0 - clamp(float(values.get("max_critique_severity") or 0))
    return clamp(
        float(values.get("explorer_confidence") or 0) * 0.35
        + skeptic_pass_score * 0.35
        + float(values.get("repair_quality_score") or 0) * 0.15
        + float(values.get("evidence_alignment_score") or 0) * 0.15
    )


def evidence_count_score(count: int, target: int = 20) -> float:
    if target <= 0:
        return 0.0
    return clamp(count / target)


def coverage_gap_score(role_status: str) -> float:
    if role_status == "missing":
        return 1.0
    if role_status == "weak":
        return 0.75
    if role_status == "ok":
        return 0.4
    if role_status == "saturated":
        return 0.1
    return 0.3

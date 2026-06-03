from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from .runtime_json import coerce_json_object


def is_candidate_recovery_protected(
    candidate_signal_explain: Mapping[str, Any] | None,
) -> bool:
    return bool(candidate_signal_explain and candidate_signal_explain.get("upliftedToGrayZone"))


def should_queue_criterion_llm_review(
    *,
    decision: str,
    runtime_resolution: Mapping[str, Any] | None,
    llm_review_allowed: bool,
    historical_backfill: bool,
) -> bool:
    return (
        decision == "gray_zone"
        and runtime_resolution is None
        and llm_review_allowed
        and not historical_backfill
    )


def resolve_runtime_review_reason(
    *,
    llm_review_queued: bool,
    historical_backfill: bool,
    llm_review_allowed: bool,
    gray_zone_policy: Mapping[str, Any] | None,
) -> str:
    if llm_review_queued:
        return "queued"
    if historical_backfill and llm_review_allowed:
        return "historical_backfill_skip"
    return str(coerce_json_object(gray_zone_policy).get("reason") or "").strip() or "not_queued"


def build_runtime_review_state(
    *,
    llm_review_queued: bool,
    historical_backfill: bool,
    llm_review_allowed: bool,
    candidate_recovery_protected: bool,
    gray_zone_policy: Mapping[str, Any] | None,
) -> dict[str, Any]:
    return {
        "reviewQueued": llm_review_queued,
        "reason": resolve_runtime_review_reason(
            llm_review_queued=llm_review_queued,
            historical_backfill=historical_backfill,
            llm_review_allowed=llm_review_allowed,
            gray_zone_policy=gray_zone_policy,
        ),
        "candidateRecoveryProtected": candidate_recovery_protected,
    }

from __future__ import annotations

from collections.abc import Mapping
from typing import Any


def coerce_selection_profile_runtime(
    profile_row: Mapping[str, Any] | None,
) -> dict[str, Any]:
    if not profile_row or not profile_row.get("selection_profile_id"):
        return {
            "selectionProfileId": None,
            "selectionProfileVersion": None,
            "selectionProfileStatus": None,
            "selectionProfileFamily": None,
            "runtimeMode": "legacy_criterion",
            "strictness": "balanced",
            "unresolvedDecision": "hold",
            "llmReviewMode": "always",
            "highValue": False,
        }

    raw_policy = profile_row.get("selection_profile_policy_json")
    policy = raw_policy if isinstance(raw_policy, Mapping) else {}

    strictness = str(policy.get("strictness") or "balanced").strip() or "balanced"
    if strictness not in {"strict", "balanced", "broad"}:
        strictness = "balanced"

    unresolved_decision = (
        str(policy.get("unresolvedDecision") or "hold").strip() or "hold"
    )
    if unresolved_decision not in {"hold", "reject"}:
        unresolved_decision = "hold"

    profile_family = str(profile_row.get("selection_profile_family") or "").strip()
    default_llm_review_mode = (
        "always"
        if profile_family == "compatibility_interest_template"
        else "optional_high_value_only"
    )
    llm_review_mode = (
        str(policy.get("llmReviewMode") or default_llm_review_mode).strip()
        or default_llm_review_mode
    )
    if llm_review_mode not in {"disabled", "optional_high_value_only", "always"}:
        llm_review_mode = default_llm_review_mode

    return {
        "selectionProfileId": str(profile_row.get("selection_profile_id") or ""),
        "selectionProfileVersion": (
            None
            if profile_row.get("selection_profile_version") is None
            else int(profile_row.get("selection_profile_version") or 0)
        ),
        "selectionProfileStatus": str(profile_row.get("selection_profile_status") or ""),
        "selectionProfileFamily": str(profile_row.get("selection_profile_family") or ""),
        "runtimeMode": "selection_profile",
        "strictness": strictness,
        "unresolvedDecision": unresolved_decision,
        "llmReviewMode": llm_review_mode,
        "highValue": bool(policy.get("highValue")),
    }


def selection_profile_allows_llm_review(runtime: Mapping[str, Any]) -> bool:
    mode = str(runtime.get("llmReviewMode") or "").strip()
    if mode == "always":
        return True
    if mode == "optional_high_value_only":
        return bool(runtime.get("highValue"))
    return False


def resolve_profile_gray_zone_decision(runtime: Mapping[str, Any]) -> str:
    return (
        "irrelevant"
        if str(runtime.get("unresolvedDecision") or "hold").strip() == "reject"
        else "gray_zone"
    )


def build_selection_profile_runtime_explain(
    runtime: Mapping[str, Any],
) -> dict[str, Any]:
    return {
        "selectionProfileId": runtime.get("selectionProfileId"),
        "selectionProfileVersion": runtime.get("selectionProfileVersion"),
        "selectionProfileStatus": runtime.get("selectionProfileStatus"),
        "selectionProfileFamily": runtime.get("selectionProfileFamily"),
        "runtimeMode": runtime.get("runtimeMode"),
        "strictness": runtime.get("strictness"),
        "unresolvedDecision": runtime.get("unresolvedDecision"),
        "llmReviewMode": runtime.get("llmReviewMode"),
        "highValue": bool(runtime.get("highValue")),
        "llmReviewAllowed": selection_profile_allows_llm_review(runtime),
    }

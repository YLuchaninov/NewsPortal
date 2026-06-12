from __future__ import annotations

from collections.abc import Mapping
from typing import Any

_AUTO_SELECT_MODES = {
    "disabled",
    "evidence_led",
    "llm_approved",
    "evidence_or_llm",
}
_SIGNAL_VISIBILITIES = {
    "explicit_marker",
    "hidden_intent",
    "mixed",
    "unknown",
}


def _read_policy_enum(
    policy: Mapping[str, Any],
    key: str,
    allowed: set[str],
    fallback: str,
) -> str:
    value = str(policy.get(key) or fallback).strip() or fallback
    return value if value in allowed else fallback


def _read_positive_int(policy: Mapping[str, Any], key: str, fallback: int) -> int:
    try:
        value = int(policy.get(key) or fallback)
    except (TypeError, ValueError):
        return fallback
    return value if value > 0 else fallback


def _read_bool(policy: Mapping[str, Any], key: str, fallback: bool) -> bool:
    value = policy.get(key)
    if value is None or value == "":
        return fallback
    if isinstance(value, bool):
        return value
    normalized = str(value).strip().lower()
    if normalized in {"true", "1", "yes"}:
        return True
    if normalized in {"false", "0", "no"}:
        return False
    return fallback


def _default_auto_select_mode(signal_visibility: str) -> str:
    if signal_visibility == "explicit_marker":
        return "evidence_or_llm"
    if signal_visibility == "hidden_intent":
        return "llm_approved"
    return "disabled"


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
            "autoSelectMode": "disabled",
            "signalVisibility": "unknown",
            "autoSelectMinPositiveGroups": 3,
            "autoSelectMinCueHits": 4,
            "autoSelectRequiresNoNoise": True,
            "autoSelectRequiresNoTechnicalVeto": True,
            "highValue": False,
        }

    raw_policy = profile_row.get("selection_profile_policy_json")
    policy = raw_policy if isinstance(raw_policy, Mapping) else {}

    strictness = _read_policy_enum(
        policy, "strictness", {"strict", "balanced", "broad"}, "balanced"
    )
    unresolved_decision = _read_policy_enum(
        policy, "unresolvedDecision", {"hold", "reject"}, "hold"
    )

    profile_family = str(profile_row.get("selection_profile_family") or "").strip()
    default_llm_review_mode = (
        "always"
        if profile_family == "compatibility_interest_template"
        else "optional_high_value_only"
    )
    llm_review_mode = _read_policy_enum(
        policy,
        "llmReviewMode",
        {"disabled", "optional_high_value_only", "always"},
        default_llm_review_mode,
    )
    signal_visibility = _read_policy_enum(
        policy,
        "signalVisibility",
        _SIGNAL_VISIBILITIES,
        "unknown",
    )
    configured_auto_select_mode = str(policy.get("autoSelectMode") or "").strip()
    auto_select_mode = (
        configured_auto_select_mode
        if configured_auto_select_mode in _AUTO_SELECT_MODES
        else _default_auto_select_mode(signal_visibility)
    )

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
        "autoSelectMode": auto_select_mode,
        "signalVisibility": signal_visibility,
        "autoSelectMinPositiveGroups": _read_positive_int(
            policy, "autoSelectMinPositiveGroups", 3
        ),
        "autoSelectMinCueHits": _read_positive_int(
            policy, "autoSelectMinCueHits", 4
        ),
        "autoSelectRequiresNoNoise": _read_bool(
            policy, "autoSelectRequiresNoNoise", True
        ),
        "autoSelectRequiresNoTechnicalVeto": _read_bool(
            policy, "autoSelectRequiresNoTechnicalVeto", True
        ),
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
    if (
        str(runtime.get("strictness") or "balanced").strip() == "broad"
        and str(runtime.get("unresolvedDecision") or "hold").strip() == "hold"
    ):
        return "relevant"
    return (
        "irrelevant"
        if str(runtime.get("unresolvedDecision") or "hold").strip() == "reject"
        else "gray_zone"
    )


def resolve_strict_candidate_signal_guard(
    runtime: Mapping[str, Any],
    candidate_signal_explain: Mapping[str, Any] | None,
) -> dict[str, Any] | None:
    if str(runtime.get("strictness") or "balanced").strip() != "strict":
        return None
    if not isinstance(candidate_signal_explain, Mapping):
        return None
    if str(candidate_signal_explain.get("signalSource") or "") != "selection_profile_definition":
        return None

    positive_signal_count = int(candidate_signal_explain.get("positiveSignalCount") or 0)
    noise_signal_count = int(candidate_signal_explain.get("noiseSignalCount") or 0)
    minimum_positive_groups = 2
    missing_positive_groups = positive_signal_count < minimum_positive_groups
    has_noise = noise_signal_count > 0
    if not missing_positive_groups and not has_noise:
        return None

    final_decision = (
        "irrelevant"
        if str(runtime.get("unresolvedDecision") or "hold").strip() == "reject"
        else "gray_zone"
    )
    return {
        "reason": "strict_candidate_signal_guard",
        "finalDecision": final_decision,
        "minimumPositiveGroups": minimum_positive_groups,
        "positiveSignalCount": positive_signal_count,
        "noiseSignalCount": noise_signal_count,
        "missingPositiveGroups": missing_positive_groups,
        "hasNoise": has_noise,
    }


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
        "autoSelectMode": runtime.get("autoSelectMode"),
        "signalVisibility": runtime.get("signalVisibility"),
        "autoSelectMinPositiveGroups": runtime.get("autoSelectMinPositiveGroups"),
        "autoSelectMinCueHits": runtime.get("autoSelectMinCueHits"),
        "autoSelectRequiresNoNoise": bool(
            runtime.get("autoSelectRequiresNoNoise")
        ),
        "autoSelectRequiresNoTechnicalVeto": bool(
            runtime.get("autoSelectRequiresNoTechnicalVeto")
        ),
        "highValue": bool(runtime.get("highValue")),
        "llmReviewAllowed": selection_profile_allows_llm_review(runtime),
    }

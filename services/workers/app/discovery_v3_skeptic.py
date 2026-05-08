from __future__ import annotations

from typing import Any


CONSTRUCTIVE_SKEPTIC_PROMPT = """You are Constructive Skeptic for a resilient discovery system.

Your role is not only to criticize. Your role is to improve robustness.

Review Explorer hypotheses and produce concrete critiques, repair patches,
missing-angle ideas, negative-control hypotheses, provider/compliance warnings,
and direct-vs-hidden signal corrections.

Do not create an unlimited alternative plan. Add only hypotheses that fix a
concrete weakness. Return JSON only matching the schema.
"""

VERIFICATION_SKEPTIC_PROMPT = """You are Verification Skeptic.

Review a repaired hypothesis pack after one critique/repair cycle. Confirm
whether major risks were fixed, identify only remaining blocking issues, avoid
adding broad new ideas, and mark unresolved disagreement as manual_review.
Return JSON only.
"""

SKEPTIC_DECISIONS = {"accept", "repair_required", "manual_review", "reject"}
SKEPTIC_ADDITION_TYPES = {
    "missing_angle",
    "hidden_signal_angle",
    "negative_control",
    "source_directory",
    "provider_warning",
    "replacement_angle",
}
SKEPTIC_REPAIR_CHANGE_TYPES = {
    "narrow",
    "broaden",
    "localize",
    "switch_provider",
    "change_role",
    "split_direct_hidden",
    "add_endpoint_patterns",
    "mark_monitor_only",
    "mark_needs_config",
}

CONSTRUCTIVE_SKEPTIC_OUTPUT_SCHEMA = {
    "type": "object",
    "required": [
        "decision",
        "disagreementScore",
        "maxSeverity",
        "summary",
        "critiques",
        "repairPatches",
        "addedIdeas",
        "rejectHypotheses",
        "manualReviewItems",
        "globalWarnings",
    ],
    "properties": {
        "decision": {"enum": sorted(SKEPTIC_DECISIONS)},
        "disagreementScore": {"type": "number", "minimum": 0, "maximum": 1},
        "maxSeverity": {"type": "number", "minimum": 0, "maximum": 1},
        "summary": {"type": "string"},
        "critiques": {"type": "array"},
        "repairPatches": {"type": "array"},
        "addedIdeas": {"type": "array"},
        "rejectHypotheses": {"type": "array"},
        "manualReviewItems": {"type": "array"},
        "globalWarnings": {"type": "array"},
    },
}


def _as_float(value: Any, default: float = 0.0) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return default
    return max(0.0, min(1.0, parsed))


def _as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def normalize_skeptic_output(value: dict[str, Any] | None) -> dict[str, Any]:
    raw = value if isinstance(value, dict) else {}
    decision = str(raw.get("decision") or "manual_review")
    if decision not in SKEPTIC_DECISIONS:
        decision = "manual_review"

    normalized_added: list[dict[str, Any]] = []
    for item in _as_list(raw.get("addedIdeas")):
        if not isinstance(item, dict):
            continue
        addition_type = str(item.get("additionType") or "")
        if addition_type not in SKEPTIC_ADDITION_TYPES:
            continue
        normalized_added.append(dict(item))

    normalized_patches: list[dict[str, Any]] = []
    for item in _as_list(raw.get("repairPatches")):
        if not isinstance(item, dict):
            continue
        change_type = str(item.get("changeType") or "")
        if change_type not in SKEPTIC_REPAIR_CHANGE_TYPES:
            continue
        normalized_patches.append(dict(item))

    return {
        "decision": decision,
        "disagreementScore": _as_float(raw.get("disagreementScore")),
        "maxSeverity": _as_float(raw.get("maxSeverity")),
        "summary": str(raw.get("summary") or ""),
        "critiques": [dict(item) for item in _as_list(raw.get("critiques")) if isinstance(item, dict)],
        "repairPatches": normalized_patches,
        "addedIdeas": normalized_added,
        "rejectHypotheses": [
            dict(item) for item in _as_list(raw.get("rejectHypotheses")) if isinstance(item, dict)
        ],
        "manualReviewItems": [
            dict(item) for item in _as_list(raw.get("manualReviewItems")) if isinstance(item, dict)
        ],
        "globalWarnings": [str(item) for item in _as_list(raw.get("globalWarnings"))],
    }

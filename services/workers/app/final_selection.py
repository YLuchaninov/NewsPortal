from __future__ import annotations

from typing import Any


def summarize_final_selection_result(
    *,
    total_filter_count: int,
    matched_filter_count: int,
    no_match_filter_count: int,
    gray_zone_filter_count: int,
    technical_filtered_out_count: int,
    verification_state: str | None,
) -> dict[str, Any]:
    total = max(int(total_filter_count or 0), 0)
    matched = max(int(matched_filter_count or 0), 0)
    no_match = max(int(no_match_filter_count or 0), 0)
    gray_zone = max(int(gray_zone_filter_count or 0), 0)
    technical_filtered_out = max(int(technical_filtered_out_count or 0), 0)
    normalized_verification_state = str(verification_state or "").strip() or None

    selection_reason = "semantic_match"
    if gray_zone > 0:
        decision = "gray_zone"
        compat_system_feed_decision = "pending_llm"
        is_selected = False
        selection_reason = "semantic_gray_zone"
    elif matched > 0 and normalized_verification_state == "conflicting":
        decision = "gray_zone"
        compat_system_feed_decision = "filtered_out"
        is_selected = False
        selection_reason = "verification_conflict"
    elif total == 0:
        decision = "selected"
        compat_system_feed_decision = "pass_through"
        is_selected = True
        selection_reason = "pass_through"
    elif matched > 0:
        decision = "selected"
        compat_system_feed_decision = "eligible"
        is_selected = True
    else:
        decision = "rejected"
        compat_system_feed_decision = "filtered_out"
        is_selected = False
        selection_reason = "no_system_match"

    compat_eligible_for_feed = compat_system_feed_decision in {"eligible", "pass_through"}

    return {
        "decision": decision,
        "isSelected": is_selected,
        "compatSystemFeedDecision": compat_system_feed_decision,
        "compatEligibleForFeed": compat_eligible_for_feed,
        "selectionReason": selection_reason,
        "explain_json": {
            "source": "interest_filter_results",
            "decision": decision,
            "isSelected": is_selected,
            "compatSystemFeedDecision": compat_system_feed_decision,
            "compatEligibleForFeed": compat_eligible_for_feed,
            "selectionReason": selection_reason,
            "verificationState": normalized_verification_state,
            "filterCounts": {
                "total": total,
                "matched": matched,
                "noMatch": no_match,
                "grayZone": gray_zone,
                "technicalFilteredOut": technical_filtered_out,
            },
        },
    }

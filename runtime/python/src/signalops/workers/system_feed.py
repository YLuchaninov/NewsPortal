from __future__ import annotations

from typing import Any


def summarize_system_feed_result(
    *,
    total_criteria_count: int,
    relevant_criteria_count: int,
    irrelevant_criteria_count: int,
    pending_llm_criteria_count: int,
) -> dict[str, Any]:
    total = max(int(total_criteria_count or 0), 0)
    relevant = max(int(relevant_criteria_count or 0), 0)
    irrelevant = max(int(irrelevant_criteria_count or 0), 0)
    pending = max(int(pending_llm_criteria_count or 0), 0)

    if total == 0:
        decision = "pass_through"
        eligible_for_feed = True
    elif pending > 0:
        decision = "pending_llm"
        eligible_for_feed = False
    elif relevant > 0:
        decision = "eligible"
        eligible_for_feed = True
    else:
        decision = "filtered_out"
        eligible_for_feed = False

    return {
        "decision": decision,
        "eligible_for_feed": eligible_for_feed,
        "explain_json": {
            "source": "criteria",
            "decision": decision,
            "eligibleForFeed": eligible_for_feed,
            "criteriaCounts": {
                "total": total,
                "relevant": relevant,
                "irrelevant": irrelevant,
                "pendingLlm": pending,
            },
        },
    }

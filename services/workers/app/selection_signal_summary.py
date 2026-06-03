from __future__ import annotations

from collections.abc import Mapping
from typing import Any

CANDIDATE_SIGNAL_TIER_ORDER = {
    "context": 1,
    "buyer_intent": 2,
    "project_intent": 3,
}


def build_candidate_signal_tier_summary(
    counts: Mapping[str, Any],
) -> tuple[str | None, dict[str, int]]:
    tier_counts = {
        "context": int(counts.get("candidate_signal_context_count") or 0),
        "buyer_intent": int(counts.get("candidate_signal_buyer_intent_count") or 0),
        "project_intent": int(counts.get("candidate_signal_project_intent_count") or 0),
    }
    positive_tiers = {key: value for key, value in tier_counts.items() if value > 0}
    if not positive_tiers:
        return None, tier_counts

    tier = max(
        positive_tiers.items(),
        key=lambda item: (item[1], CANDIDATE_SIGNAL_TIER_ORDER[item[0]]),
    )[0]
    return tier, tier_counts

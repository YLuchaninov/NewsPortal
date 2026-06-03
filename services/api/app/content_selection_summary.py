from __future__ import annotations

ABSENT_CANDIDATE_RECOVERY_SUMMARY = (
    "Recovered candidate signals have not materialized on this item yet."
)


def resolve_selection_mode_summary(
    *,
    final_decision: str | None,
    compatibility_decision: str | None,
    candidate_signal_uplift_count: int,
    llm_review_pending_count: int,
    hold_count: int,
    selection_reason: str | None,
) -> tuple[str, str]:
    if final_decision == "gray_zone":
        if candidate_signal_uplift_count and (
            llm_review_pending_count > 0 or compatibility_decision == "pending_llm"
        ):
            return "llm_review_pending", "Recovered candidate waiting for LLM review"
        if llm_review_pending_count > 0 or compatibility_decision == "pending_llm":
            return "llm_review_pending", "Gray zone pending LLM review"
        if candidate_signal_uplift_count and (
            hold_count > 0 or selection_reason == "candidate_signal_hold"
        ):
            return "hold", "Recovered candidate held by profile policy"
        if hold_count > 0 or selection_reason == "semantic_hold":
            return "hold", "Gray zone held by profile policy"
        if candidate_signal_uplift_count:
            return "gray_zone", "Recovered candidate remains in gray zone"
        return "gray_zone", "Gray zone unresolved"

    if final_decision == "selected":
        return "selected", "Selected by final-selection policy"
    if final_decision == "rejected":
        return "rejected", "Rejected by final-selection policy"
    if compatibility_decision == "pending_llm":
        return "llm_review_pending", "Compatibility projection waiting for review"
    if compatibility_decision:
        return "compatibility_only", f"Compatibility projection: {compatibility_decision}"
    return "pending", "Selection not materialized yet"


def resolve_candidate_recovery_summary(
    *,
    selection_mode: str,
    candidate_signal_uplift_count: int,
) -> tuple[str, str]:
    if not candidate_signal_uplift_count:
        return "absent", ABSENT_CANDIDATE_RECOVERY_SUMMARY
    if selection_mode == "llm_review_pending":
        return (
            "review_pending",
            "Recovered candidate signals are materialized and waiting for LLM review.",
        )
    if selection_mode == "hold":
        return "held", "Recovered candidate signals are materialized but currently held."
    return "present", "Recovered candidate signals are materialized on this item."

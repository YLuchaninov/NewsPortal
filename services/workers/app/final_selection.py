from __future__ import annotations

from typing import Any

_POSITIVE_CANDIDATE_SIGNAL_GROUPS: dict[str, tuple[str, ...]] = {
    "requestSearch": (
        "looking for",
        "need help",
        "seeking ",
        "request for",
        "need a ",
    ),
    "serviceDelivery": (
        " consultant",
        " partner",
        " agency",
        " vendor",
        " solution provider",
        " service provider",
        " integrator",
        " staff augmentation",
        " dedicated team",
        " customiz",
    ),
    "implementationChange": (
        "implementation",
        "implementing",
        " migration",
        " replacement",
        " replatform",
        " integration",
        " upgrade",
    ),
    "marketDemand": (
        " demand for",
        " rising demand",
        " increasing demand",
        " growing demand",
        " demand is rising",
        " sees rising demand",
    ),
    "procurementIntent": (
        " procurement",
        " request for proposal",
        " rfp",
        " shortlist",
        " bid process",
    ),
    "evaluationMarket": (
        "best ",
        "top ",
        " comparison",
        " what to look for",
        " partners",
        " agencies",
        " companies",
    ),
}

_NEGATIVE_CANDIDATE_SIGNAL_GROUPS: dict[str, tuple[str, ...]] = {
    "hiringRole": (
        "[hiring]",
        " hiring ",
        " recruitment",
        " salary",
        " apprentice",
        " position",
        " sales engineer",
    ),
    "communityCollaboration": (
        " contributors",
        " collaborator",
        " community interest",
        " feedback",
        " testers",
        " open source",
    ),
    "marketplaceListing": (
        " usd / hour",
        " per hour",
        "/ hour",
        " posted ",
        " ends in ",
        " freelancer",
        " freelance ",
        " proposals",
        " bids",
    ),
}


def _collect_signal_hits(text: str, groups: dict[str, tuple[str, ...]]) -> dict[str, list[str]]:
    hits: dict[str, list[str]] = {}
    for group_name, fragments in groups.items():
        matched_fragments = [fragment.strip() for fragment in fragments if fragment in text]
        if matched_fragments:
            hits[group_name] = matched_fragments
    return hits


def _count_signal_hits(hits: dict[str, list[str]]) -> int:
    return sum(len(values) for values in hits.values())


def evaluate_document_candidate_signals(
    *,
    title: str | None,
    lead: str | None,
    body: str | None,
    score_final: float,
    positive_score: float,
    lexical_score: float,
    canonical_document_id: str | None,
    story_cluster_id: str | None,
    verification_state: str | None,
    base_decision: str,
) -> dict[str, Any]:
    normalized_text = " ".join(
        part.strip().lower()
        for part in (
            str(title or ""),
            str(lead or ""),
            str(body or "")[:800],
        )
        if str(part or "").strip()
    )
    positive_hits = _collect_signal_hits(normalized_text, _POSITIVE_CANDIDATE_SIGNAL_GROUPS)
    noise_hits = _collect_signal_hits(normalized_text, _NEGATIVE_CANDIDATE_SIGNAL_GROUPS)
    positive_group_count = len(positive_hits)
    positive_hit_count = _count_signal_hits(positive_hits)
    noise_group_count = len(noise_hits)
    noise_hit_count = _count_signal_hits(noise_hits)
    normalized_verification_state = str(verification_state or "").strip() or None
    has_canonical_context = bool(str(canonical_document_id or "").strip())
    has_story_cluster_context = bool(str(story_cluster_id or "").strip())
    near_threshold = base_decision == "irrelevant" and float(score_final) >= 0.34
    context_near_threshold = base_decision == "irrelevant" and float(score_final) >= 0.28
    semantic_support = max(float(positive_score), float(lexical_score)) >= 0.20
    verification_bonus = 1 if normalized_verification_state in {"medium", "strong"} else 0
    context_bonus = (2 if has_story_cluster_context else 0) + (
        1 if has_canonical_context else 0
    )
    candidate_signal_score = (
        positive_group_count
        + positive_hit_count
        + (1 if near_threshold else 0)
        + (1 if context_near_threshold else 0)
        + (1 if semantic_support else 0)
        + verification_bonus
        + context_bonus
        - noise_group_count
        - noise_hit_count
    )
    document_only_uplift = (
        base_decision == "irrelevant"
        and near_threshold
        and semantic_support
        and positive_group_count >= 2
        and noise_group_count == 0
    )
    context_backed_uplift = (
        base_decision == "irrelevant"
        and context_near_threshold
        and semantic_support
        and positive_group_count >= 1
        and noise_group_count == 0
        and (
            has_story_cluster_context
            or (
                has_canonical_context
                and normalized_verification_state in {"medium", "strong"}
                and positive_group_count >= 2
            )
        )
    )
    uplifted_to_gray_zone = document_only_uplift or context_backed_uplift

    return {
        "baseDecision": base_decision,
        "nearThreshold": near_threshold,
        "contextNearThreshold": context_near_threshold,
        "semanticSupport": semantic_support,
        "verificationState": normalized_verification_state,
        "verificationBonus": verification_bonus,
        "hasCanonicalContext": has_canonical_context,
        "hasStoryClusterContext": has_story_cluster_context,
        "contextBonus": context_bonus,
        "positiveSignalCount": positive_group_count,
        "positiveSignalHitCount": positive_hit_count,
        "noiseSignalCount": noise_group_count,
        "noiseSignalHitCount": noise_hit_count,
        "candidateSignalScore": candidate_signal_score,
        "positiveSignals": positive_hits,
        "noiseSignals": noise_hits,
        "documentOnlyUplift": document_only_uplift,
        "contextBackedUplift": context_backed_uplift,
        "upliftedToGrayZone": uplifted_to_gray_zone,
        "upliftPath": (
            "context_backed"
            if context_backed_uplift
            else "document_only"
            if document_only_uplift
            else None
        ),
        "reason": (
            "context_backed_candidate_signal_uplift"
            if context_backed_uplift
            else "document_candidate_signal_uplift"
            if document_only_uplift
            else None
        ),
    }


def apply_document_candidate_signal_uplift(
    *,
    title: str | None,
    lead: str | None,
    body: str | None,
    score_final: float,
    positive_score: float,
    lexical_score: float,
    canonical_document_id: str | None,
    story_cluster_id: str | None,
    verification_state: str | None,
    base_decision: str,
) -> tuple[str, dict[str, Any] | None]:
    explain = evaluate_document_candidate_signals(
        title=title,
        lead=lead,
        body=body,
        score_final=score_final,
        positive_score=positive_score,
        lexical_score=lexical_score,
        canonical_document_id=canonical_document_id,
        story_cluster_id=story_cluster_id,
        verification_state=verification_state,
        base_decision=base_decision,
    )
    if explain["upliftedToGrayZone"]:
        return ("gray_zone", explain)
    if explain["positiveSignalCount"] > 0 or explain["noiseSignalCount"] > 0:
        return (base_decision, explain)
    return (base_decision, None)


def summarize_final_selection_result(
    *,
    total_filter_count: int,
    matched_filter_count: int,
    no_match_filter_count: int,
    gray_zone_filter_count: int,
    llm_review_pending_filter_count: int,
    hold_filter_count: int,
    technical_filtered_out_count: int,
    verification_state: str | None,
    candidate_signal_uplift_count: int = 0,
) -> dict[str, Any]:
    total = max(int(total_filter_count or 0), 0)
    matched = max(int(matched_filter_count or 0), 0)
    no_match = max(int(no_match_filter_count or 0), 0)
    gray_zone = max(int(gray_zone_filter_count or 0), 0)
    llm_review_pending = max(int(llm_review_pending_filter_count or 0), 0)
    hold = max(int(hold_filter_count or 0), 0)
    technical_filtered_out = max(int(technical_filtered_out_count or 0), 0)
    candidate_signal_uplift = max(int(candidate_signal_uplift_count or 0), 0)
    normalized_verification_state = str(verification_state or "").strip() or None

    selection_reason = "semantic_match"
    if gray_zone > 0:
        decision = "gray_zone"
        compat_system_feed_decision = "pending_llm" if llm_review_pending > 0 else "filtered_out"
        is_selected = False
        if candidate_signal_uplift > 0:
            selection_reason = (
                "candidate_signal_gray_zone"
                if llm_review_pending > 0
                else "candidate_signal_hold"
            )
        else:
            selection_reason = "semantic_gray_zone" if llm_review_pending > 0 else "semantic_hold"
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
                "llmReviewPending": llm_review_pending,
                "hold": hold,
                "technicalFilteredOut": technical_filtered_out,
                "candidateSignalUplift": candidate_signal_uplift,
            },
            "candidateSignalUpliftCount": candidate_signal_uplift,
        },
    }

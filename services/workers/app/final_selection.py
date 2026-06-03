from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from .candidate_signal_text import looks_like_generic_advice_title

_CANDIDATE_SIGNAL_TIERS = ("context", "buyer_intent", "project_intent")
_CANDIDATE_SIGNAL_TIER_RANK = {
    "context": 1,
    "buyer_intent": 2,
    "project_intent": 3,
}

_GENERIC_POSITIVE_CANDIDATE_SIGNAL_GROUPS: dict[str, tuple[str, ...]] = {
    "requestSearch": (
        "looking for",
        "need help",
        "seeking ",
        "request for",
        "need a ",
        "wanted ",
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
        " vendor evaluation",
        " solution evaluation",
        " request for quote",
    ),
}

_GENERIC_NEGATIVE_CANDIDATE_SIGNAL_GROUPS: dict[str, tuple[str, ...]] = {
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
        " proposals",
        " bids",
    ),
}


def _coerce_signal_groups(
    value: Any,
    *,
    fallback: dict[str, tuple[str, ...]],
) -> tuple[dict[str, tuple[str, ...]], str]:
    if not isinstance(value, Mapping):
        return fallback, "generic_fallback"

    groups_value = value.get("positiveGroups") or value.get("negativeGroups")
    if groups_value is None and "groups" in value:
        groups_value = value.get("groups")
    if not isinstance(groups_value, list):
        return fallback, "generic_fallback"

    groups: dict[str, tuple[str, ...]] = {}
    for index, raw_group in enumerate(groups_value):
        if not isinstance(raw_group, Mapping):
            continue
        raw_name = str(raw_group.get("name") or "").strip() or f"group_{index + 1}"
        cues = raw_group.get("cues")
        if not isinstance(cues, list):
            cues = raw_group.get("terms")
        normalized_cues = tuple(
            str(entry).strip().lower()
            for entry in (cues if isinstance(cues, list) else [])
            if str(entry).strip()
        )
        if normalized_cues:
            groups[raw_name] = normalized_cues

    return (groups or fallback), ("selection_profile_definition" if groups else "generic_fallback")


def _resolve_candidate_signal_groups(
    candidate_signal_config: Mapping[str, Any] | None,
) -> tuple[dict[str, tuple[str, ...]], dict[str, tuple[str, ...]], str]:
    config = candidate_signal_config if isinstance(candidate_signal_config, Mapping) else {}
    positive_groups, positive_source = _coerce_signal_groups(
        {"positiveGroups": config.get("positiveGroups")},
        fallback=_GENERIC_POSITIVE_CANDIDATE_SIGNAL_GROUPS,
    )
    negative_groups, negative_source = _coerce_signal_groups(
        {"negativeGroups": config.get("negativeGroups")},
        fallback=_GENERIC_NEGATIVE_CANDIDATE_SIGNAL_GROUPS,
    )
    signal_source = (
        "selection_profile_definition"
        if positive_source == "selection_profile_definition"
        or negative_source == "selection_profile_definition"
        else "generic_fallback"
    )
    return positive_groups, negative_groups, signal_source


def _read_signal_group_tiers(
    candidate_signal_config: Mapping[str, Any] | None,
    group_names: list[str],
) -> dict[str, str]:
    config = candidate_signal_config if isinstance(candidate_signal_config, Mapping) else {}
    default_tier = str(config.get("defaultTier") or "project_intent").strip()
    if default_tier not in _CANDIDATE_SIGNAL_TIERS:
        default_tier = "project_intent"
    group_tiers = {group_name: default_tier for group_name in group_names}

    positive_groups = config.get("positiveGroups")
    if isinstance(positive_groups, list):
        for raw_group in positive_groups:
            if not isinstance(raw_group, Mapping):
                continue
            name = str(raw_group.get("name") or "").strip()
            tier = str(raw_group.get("tier") or "").strip()
            if name and tier in _CANDIDATE_SIGNAL_TIERS:
                group_tiers[name] = tier

    tiers = config.get("tiers")
    if isinstance(tiers, Mapping):
        for raw_tier_name, raw_tier_config in tiers.items():
            tier_name = str(raw_tier_name or "").strip()
            if tier_name not in _CANDIDATE_SIGNAL_TIERS:
                continue
            if not isinstance(raw_tier_config, Mapping):
                continue
            configured_groups = raw_tier_config.get("positiveGroups")
            if configured_groups is None:
                configured_groups = raw_tier_config.get("groups")
            if not isinstance(configured_groups, list):
                continue
            for raw_group_name in configured_groups:
                group_name = str(raw_group_name or "").strip()
                if group_name:
                    group_tiers[group_name] = tier_name

    return group_tiers


def _resolve_candidate_signal_tier(
    positive_hits: dict[str, list[str]],
    group_tiers: Mapping[str, str],
) -> tuple[str | None, dict[str, list[str]], dict[str, int]]:
    tier_groups: dict[str, list[str]] = {tier: [] for tier in _CANDIDATE_SIGNAL_TIERS}
    for group_name in positive_hits:
        tier = str(group_tiers.get(group_name) or "project_intent")
        if tier not in _CANDIDATE_SIGNAL_TIERS:
            tier = "project_intent"
        tier_groups[tier].append(group_name)
    tier_counts = {tier: len(groups) for tier, groups in tier_groups.items()}
    matched_tiers = [tier for tier, count in tier_counts.items() if count > 0]
    if not matched_tiers:
        return None, tier_groups, tier_counts
    dominant_tier = max(
        matched_tiers,
        key=lambda tier: _CANDIDATE_SIGNAL_TIER_RANK[tier],
    )
    return dominant_tier, tier_groups, tier_counts


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
    candidate_signal_config: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    normalized_title = str(title or "").strip().lower()
    normalized_text = " ".join(
        part.strip().lower()
        for part in (
            normalized_title,
            str(lead or ""),
            str(body or "")[:800],
        )
        if str(part or "").strip()
    )
    generic_advice_noise = looks_like_generic_advice_title(normalized_title)
    positive_groups, noise_groups, signal_source = _resolve_candidate_signal_groups(
        candidate_signal_config
    )
    positive_hits = _collect_signal_hits(normalized_text, positive_groups)
    noise_hits = _collect_signal_hits(normalized_text, noise_groups)
    group_tiers = _read_signal_group_tiers(candidate_signal_config, list(positive_groups))
    candidate_signal_tier, tier_groups, tier_counts = _resolve_candidate_signal_tier(
        positive_hits,
        group_tiers,
    )
    candidate_selection_eligible = candidate_signal_tier in {
        "buyer_intent",
        "project_intent",
    }
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
        and not generic_advice_noise
        and near_threshold
        and semantic_support
        and candidate_selection_eligible
        and positive_group_count >= 2
        and noise_group_count == 0
    )
    evidence_led_uplift = (
        base_decision == "irrelevant"
        and not generic_advice_noise
        and candidate_signal_tier == "project_intent"
        and positive_group_count >= 3
        and positive_hit_count >= 4
        and candidate_signal_score >= 6
        and noise_group_count == 0
    )
    context_backed_uplift = (
        base_decision == "irrelevant"
        and not generic_advice_noise
        and context_near_threshold
        and semantic_support
        and candidate_selection_eligible
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
    uplifted_to_gray_zone = (
        document_only_uplift or evidence_led_uplift or context_backed_uplift
    )

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
        "candidateSignalTier": candidate_signal_tier,
        "candidateSignalTierCounts": tier_counts,
        "candidateSignalTierGroups": tier_groups,
        "candidateSelectionEligible": candidate_selection_eligible,
        "contextOnly": candidate_signal_tier == "context",
        "noiseSignalCount": noise_group_count,
        "noiseSignalHitCount": noise_hit_count,
        "genericAdviceNoise": generic_advice_noise,
        "candidateSignalScore": candidate_signal_score,
        "positiveSignals": positive_hits,
        "noiseSignals": noise_hits,
        "documentOnlyUplift": document_only_uplift,
        "evidenceLedUplift": evidence_led_uplift,
        "contextBackedUplift": context_backed_uplift,
        "upliftedToGrayZone": uplifted_to_gray_zone,
        "upliftPath": (
            "context_backed"
            if context_backed_uplift
            else "evidence_led"
            if evidence_led_uplift
            else "document_only"
            if document_only_uplift
            else None
        ),
        "signalSource": signal_source,
        "reason": (
            "context_backed_candidate_signal_uplift"
            if context_backed_uplift
            else "evidence_led_candidate_signal_uplift"
            if evidence_led_uplift
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
    candidate_signal_config: Mapping[str, Any] | None = None,
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
        candidate_signal_config=candidate_signal_config,
    )
    if explain["upliftedToGrayZone"]:
        return ("gray_zone", explain)
    if explain["positiveSignalCount"] > 0 or explain["noiseSignalCount"] > 0:
        return (base_decision, explain)
    if explain["signalSource"] == "selection_profile_definition":
        return (base_decision, explain)
    return (base_decision, None)


def build_downstream_selection_diagnostics(
    *,
    total_filter_count: int,
    matched_filter_count: int,
    no_match_filter_count: int,
    gray_zone_filter_count: int,
    llm_review_pending_filter_count: int,
    hold_filter_count: int,
    technical_filtered_out_count: int,
    verification_state: str | None,
    selection_reason: str | None,
    selection_decision: str,
    candidate_signal_uplift_count: int = 0,
    candidate_signal_eligible_count: int = 0,
    candidate_signal_strong_match_count: int = 0,
    candidate_signal_tier: str | None = None,
    candidate_signal_tier_counts: Mapping[str, int] | None = None,
    filter_reason_counts: Mapping[str, int] | None = None,
) -> dict[str, Any]:
    total = max(int(total_filter_count or 0), 0)
    matched = max(int(matched_filter_count or 0), 0)
    no_match = max(int(no_match_filter_count or 0), 0)
    gray_zone = max(int(gray_zone_filter_count or 0), 0)
    llm_review_pending = max(int(llm_review_pending_filter_count or 0), 0)
    hold = max(int(hold_filter_count or 0), 0)
    technical_filtered_out = max(int(technical_filtered_out_count or 0), 0)
    candidate_signal_uplift = max(int(candidate_signal_uplift_count or 0), 0)
    candidate_signal_eligible = max(int(candidate_signal_eligible_count or 0), 0)
    candidate_signal_strong_match = max(int(candidate_signal_strong_match_count or 0), 0)
    normalized_candidate_signal_tier = str(candidate_signal_tier or "").strip() or None
    normalized_candidate_signal_tier_counts = {
        str(key).strip(): max(int(value or 0), 0)
        for key, value in (candidate_signal_tier_counts or {}).items()
        if str(key).strip()
    }
    normalized_verification_state = str(verification_state or "").strip() or None
    normalized_selection_reason = str(selection_reason or "").strip() or None

    normalized_filter_reason_counts = {
        str(key).strip(): max(int(value or 0), 0)
        for key, value in (filter_reason_counts or {}).items()
        if str(key).strip()
    }
    dominant_filter_reason = None
    if normalized_filter_reason_counts:
        dominant_filter_reason = max(
            normalized_filter_reason_counts.items(),
            key=lambda item: (item[1], item[0]),
        )[0]

    if total == 0:
        downstream_loss_bucket = "articles_missing_interest_filter_results"
        blocker_stage = "interest_filtering"
        blocker_reason = "missing_interest_filter_results"
    elif selection_decision == "selected":
        downstream_loss_bucket = "selected_useful_evidence_present"
        blocker_stage = "selected"
        blocker_reason = normalized_selection_reason or (
            "semantic_match" if matched > 0 else "strong_gray_zone_consensus"
        )
    elif llm_review_pending > 0:
        downstream_loss_bucket = "llm_review_pending"
        blocker_stage = "llm_review"
        blocker_reason = normalized_selection_reason or "llm_review_pending"
    elif hold > 0 or (
        selection_decision == "gray_zone"
        and normalized_selection_reason
        in {"semantic_hold", "candidate_signal_hold", "item_level_evidence_required"}
    ):
        if (
            (candidate_signal_uplift > 0 or candidate_signal_eligible > 0)
            and normalized_candidate_signal_tier == "buyer_intent"
        ):
            downstream_loss_bucket = "buyer_intent_hold"
        elif (
            (candidate_signal_uplift > 0 or candidate_signal_eligible > 0)
            and normalized_candidate_signal_tier == "project_intent"
        ):
            downstream_loss_bucket = "project_intent_hold"
        elif candidate_signal_uplift > 0 and normalized_candidate_signal_tier == "context":
            downstream_loss_bucket = "context_candidate_not_selected"
        elif normalized_selection_reason == "item_level_evidence_required":
            downstream_loss_bucket = "context_candidate_not_selected"
        else:
            downstream_loss_bucket = "gray_zone_hold"
        blocker_stage = "hold_policy"
        blocker_reason = normalized_selection_reason or "gray_zone_hold"
    elif normalized_selection_reason == "document_level_technical_filter":
        downstream_loss_bucket = "technical_filter_rejected"
        blocker_stage = "technical_filter"
        blocker_reason = dominant_filter_reason or normalized_selection_reason
    elif (
        technical_filtered_out > 0
        and (
            matched == 0
            or normalized_selection_reason == "document_level_technical_filter"
        )
        and gray_zone == 0
    ):
        downstream_loss_bucket = "technical_filter_rejected"
        blocker_stage = "technical_filter"
        blocker_reason = dominant_filter_reason or normalized_selection_reason or "technical_filtered_out"
    elif no_match > 0 and matched == 0 and gray_zone == 0:
        downstream_loss_bucket = "semantic_rejected"
        blocker_stage = "semantic_filter"
        blocker_reason = normalized_selection_reason or "semantic_no_match"
    elif selection_decision == "rejected":
        downstream_loss_bucket = "final_selection_rejected"
        blocker_stage = "final_selection"
        blocker_reason = normalized_selection_reason or dominant_filter_reason or "final_selection_rejected"
    else:
        downstream_loss_bucket = "final_selection_rejected"
        blocker_stage = "final_selection"
        blocker_reason = normalized_selection_reason or "selection_incomplete"

    return {
        "downstreamLossBucket": downstream_loss_bucket,
        "selectionBlockerStage": blocker_stage,
        "selectionBlockerReason": blocker_reason,
        "holdReason": (
            normalized_selection_reason
            if downstream_loss_bucket == "gray_zone_hold"
            else None
        ),
        "semanticSignalSummary": {
            "total": total,
            "matched": matched,
            "noMatch": no_match,
            "grayZone": gray_zone,
            "llmReviewPending": llm_review_pending,
            "hold": hold,
            "technicalFilteredOut": technical_filtered_out,
            "candidateSignalUplift": candidate_signal_uplift,
            "candidateSignalEligible": candidate_signal_eligible,
            "candidateSignalStrongMatch": candidate_signal_strong_match,
            "candidateSignalTier": normalized_candidate_signal_tier,
            "candidateSignalTierCounts": normalized_candidate_signal_tier_counts,
            "dominantFilterReason": dominant_filter_reason,
            "filterReasonCounts": normalized_filter_reason_counts,
        },
        "verificationSignalSummary": {
            "verificationState": normalized_verification_state,
            "selectionDecision": selection_decision,
            "selectionReason": normalized_selection_reason,
        },
    }


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
    candidate_signal_eligible_count: int = 0,
    candidate_signal_strong_match_count: int = 0,
    candidate_signal_tier: str | None = None,
    candidate_signal_tier_counts: Mapping[str, int] | None = None,
    filter_reason_counts: Mapping[str, int] | None = None,
) -> dict[str, Any]:
    total = max(int(total_filter_count or 0), 0)
    matched = max(int(matched_filter_count or 0), 0)
    no_match = max(int(no_match_filter_count or 0), 0)
    gray_zone = max(int(gray_zone_filter_count or 0), 0)
    llm_review_pending = max(int(llm_review_pending_filter_count or 0), 0)
    hold = max(int(hold_filter_count or 0), 0)
    technical_filtered_out = max(int(technical_filtered_out_count or 0), 0)
    candidate_signal_uplift = max(int(candidate_signal_uplift_count or 0), 0)
    candidate_signal_eligible = max(int(candidate_signal_eligible_count or 0), 0)
    candidate_signal_strong_match = max(int(candidate_signal_strong_match_count or 0), 0)
    normalized_verification_state = str(verification_state or "").strip() or None
    normalized_filter_reason_counts = {
        str(key).strip(): max(int(value or 0), 0)
        for key, value in (filter_reason_counts or {}).items()
        if str(key).strip()
    }
    document_level_technical_veto = _has_document_level_technical_veto(
        total=total,
        filter_reason_counts=normalized_filter_reason_counts,
    )
    item_level_candidate_signal = (
        (candidate_signal_uplift > 0 or candidate_signal_eligible > 0)
        and str(candidate_signal_tier or "").strip()
        in {"buyer_intent", "project_intent"}
    )
    clean_item_level_match = (
        candidate_signal_strong_match > 0
        and str(candidate_signal_tier or "").strip()
        in {"buyer_intent", "project_intent"}
    )

    strong_gray_zone_consensus = (
        gray_zone >= 4
        and matched == 0
        and no_match <= 1
        and llm_review_pending == 0
        and technical_filtered_out == 0
        and not document_level_technical_veto
        and item_level_candidate_signal
    )
    strong_item_level_candidate_consensus = (
        matched == 0
        and gray_zone > 0
        and llm_review_pending == 0
        and technical_filtered_out == 0
        and normalized_verification_state != "conflicting"
        and not document_level_technical_veto
        and item_level_candidate_signal
        and (
            candidate_signal_uplift >= 2
            or candidate_signal_eligible >= 4
        )
    )

    selection_reason = "semantic_match"
    if document_level_technical_veto:
        decision = "rejected"
        compat_system_feed_decision = "filtered_out"
        is_selected = False
        selection_reason = "document_level_technical_filter"
    elif strong_item_level_candidate_consensus:
        decision = "selected"
        compat_system_feed_decision = "eligible"
        is_selected = True
        selection_reason = "strong_item_level_candidate_signal"
    elif strong_gray_zone_consensus:
        decision = "selected"
        compat_system_feed_decision = "eligible"
        is_selected = True
        selection_reason = "strong_gray_zone_consensus"
    elif matched > 0 and normalized_verification_state == "conflicting":
        decision = "gray_zone"
        compat_system_feed_decision = "filtered_out"
        is_selected = False
        selection_reason = "verification_conflict"
    elif matched > 0 and clean_item_level_match:
        decision = "selected"
        compat_system_feed_decision = "eligible"
        is_selected = True
        selection_reason = "item_level_semantic_match"
    elif matched > 0:
        decision = "gray_zone"
        compat_system_feed_decision = "filtered_out"
        is_selected = False
        selection_reason = "item_level_evidence_required"
    elif gray_zone > 0:
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
    elif total == 0:
        decision = "rejected"
        compat_system_feed_decision = "filtered_out"
        is_selected = False
        selection_reason = "missing_interest_filter_results"
    else:
        decision = "rejected"
        compat_system_feed_decision = "filtered_out"
        is_selected = False
        selection_reason = "no_system_match"

    compat_eligible_for_feed = compat_system_feed_decision in {"eligible", "pass_through"}
    downstream_diagnostics = build_downstream_selection_diagnostics(
        total_filter_count=total,
        matched_filter_count=matched,
        no_match_filter_count=no_match,
        gray_zone_filter_count=gray_zone,
        llm_review_pending_filter_count=llm_review_pending,
        hold_filter_count=hold,
        technical_filtered_out_count=technical_filtered_out,
        verification_state=normalized_verification_state,
        selection_reason=selection_reason,
        selection_decision=decision,
        candidate_signal_uplift_count=candidate_signal_uplift,
        candidate_signal_eligible_count=candidate_signal_eligible,
        candidate_signal_strong_match_count=candidate_signal_strong_match,
        candidate_signal_tier=candidate_signal_tier,
        candidate_signal_tier_counts=candidate_signal_tier_counts,
        filter_reason_counts=filter_reason_counts,
    )

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
                "candidateSignalEligible": candidate_signal_eligible,
                "candidateSignalStrongMatch": candidate_signal_strong_match,
            },
            "candidateSignalUpliftCount": candidate_signal_uplift,
            "candidateSignalEligibleCount": candidate_signal_eligible,
            "candidateSignalStrongMatchCount": candidate_signal_strong_match,
            **downstream_diagnostics,
        },
    }


def _has_document_level_technical_veto(
    *,
    total: int,
    filter_reason_counts: Mapping[str, int],
) -> bool:
    if total <= 0:
        return False
    document_level_reasons = {
        "directory_listicle_noise",
        "jobs_only_post_noise",
        "professional_network_post_noise",
        "repo_internal_change_noise",
        "wrapper_directory_noise",
    }
    return any(
        int(filter_reason_counts.get(reason) or 0) >= total
        for reason in document_level_reasons
    )

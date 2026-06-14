from __future__ import annotations

import re
from typing import Any, Mapping

from signalops.api.content_selection_summary import (
    ABSENT_CANDIDATE_RECOVERY_SUMMARY,
    resolve_candidate_recovery_summary,
    resolve_selection_mode_summary,
)
from signalops.api.json_read_model import (
    as_json_bool,
    as_json_int,
    as_json_object,
    as_json_str,
)

LABEL_LIKE_CUE_PATTERN = re.compile(r"^[a-z][a-z0-9]+(?:_[a-z0-9]+)+$")


def _as_text_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [
        str(entry or "").strip()
        for entry in value
        if str(entry or "").strip()
    ]


def _read_candidate_signal_groups(
    definition_json: Mapping[str, Any],
    key: str,
) -> list[Mapping[str, Any]]:
    raw_candidate_signals = definition_json.get("candidateSignals")
    candidate_signals = (
        raw_candidate_signals if isinstance(raw_candidate_signals, Mapping) else {}
    )
    groups = candidate_signals.get(key)
    if not isinstance(groups, list):
        return []
    return [group for group in groups if isinstance(group, Mapping)]


def build_candidate_signal_quality_warnings(
    definition_json: Mapping[str, Any],
) -> list[dict[str, Any]]:
    warnings: list[dict[str, Any]] = []
    for key, polarity in (
        ("positiveGroups", "positive"),
        ("negativeGroups", "negative"),
    ):
        for index, group in enumerate(
            _read_candidate_signal_groups(definition_json, key)
        ):
            cues = _as_text_list(group.get("cues"))
            path = f"candidateSignals.{key}[{index}].cues"
            if not cues:
                warnings.append(
                    {
                        "kind": "empty_candidate_signal_group",
                        "polarity": polarity,
                        "path": path,
                        "message": "Candidate signal group has no literal cue fragments.",
                        "guidance": (
                            "Use group.name for the conceptual label and group.cues "
                            "for observable text fragments found in candidate items."
                        ),
                    }
                )
                continue
            if len(cues) == 1:
                warnings.append(
                    {
                        "kind": "single_cue_group",
                        "polarity": polarity,
                        "path": path,
                        "message": (
                            "Candidate signal group has only one cue; hidden or "
                            "mixed signals usually need evidence diversity."
                        ),
                        "guidance": (
                            "Add literal cue variants from representative rejected "
                            "and near-miss items before broadening hard gates."
                        ),
                    }
                )
            for cue_index, cue in enumerate(cues):
                if LABEL_LIKE_CUE_PATTERN.match(cue):
                    warnings.append(
                        {
                            "kind": "label_like_candidate_signal_cue",
                            "polarity": polarity,
                            "path": f"{path}[{cue_index}]",
                            "cue": cue,
                            "message": (
                                "Cue looks like an id or concept label, not text "
                                "likely to appear in candidate content."
                            ),
                            "guidance": (
                                "Keep concept labels in group.name and put literal "
                                "observable fragments in group.cues."
                            ),
                        }
                    )
    return warnings


def build_hard_gate_safety_warnings(
    template: Mapping[str, Any],
) -> list[dict[str, Any]]:
    warnings: list[dict[str, Any]] = []
    must_have_terms = _as_text_list(template.get("must_have_terms"))
    short_tokens_required = _as_text_list(template.get("short_tokens_required"))
    if must_have_terms:
        warnings.append(
            {
                "kind": "hard_gate_unsafe_for_hidden_signal",
                "path": "must_have_terms",
                "message": "must_have_terms is any-of, but still a hard pre-semantic gate.",
                "guidance": (
                    "For hidden or mixed signals, keep must_have_terms empty unless "
                    "representative samples prove a mandatory marker and bounded "
                    "replay verifies recall."
                ),
            }
        )
    if short_tokens_required:
        warnings.append(
            {
                "kind": "short_token_gate_unsafe_for_hidden_signal",
                "path": "short_tokens_required",
                "message": (
                    "short_tokens_required is an extracted-token requirement, not "
                    "a broad keyword OR gate."
                ),
                "guidance": (
                    "For hidden or mixed signals, keep short_tokens_required empty "
                    "unless the token is truly mandatory in extracted short-token features."
                ),
            }
        )
    for index, token in enumerate(short_tokens_required):
        if any(character.isspace() for character in token):
            warnings.append(
                {
                    "kind": "invalid_short_token_phrase",
                    "path": f"short_tokens_required[{index}]",
                    "message": (
                        "short_tokens_required contains a phrase; only token-like "
                        "strings are safe here."
                    ),
                    "guidance": (
                        "Phrase lexical gates belong in must_have_terms only when "
                        "mandatory marker proof exists; hidden-signal recovery "
                        "should use literal candidate cue groups."
                    ),
                }
            )
    return warnings


def normalize_system_interest_selection_profile_payload(
    template: Mapping[str, Any],
) -> dict[str, Any]:
    normalized = dict(template)
    family = str(template.get("selection_profile_family") or "").strip()
    raw_policy = template.get("selection_profile_policy_json")
    policy = raw_policy if isinstance(raw_policy, Mapping) else {}
    normalized_policy = dict(policy)

    if family == "compatibility_interest_template":
        llm_review_mode = str(normalized_policy.get("llmReviewMode") or "").strip()
        if not llm_review_mode or llm_review_mode == "optional_high_value_only":
            normalized_policy["llmReviewMode"] = "always"

    raw_definition = template.get("selection_profile_definition_json")
    definition_json = raw_definition if isinstance(raw_definition, Mapping) else {}
    positive_groups = _read_candidate_signal_groups(definition_json, "positiveGroups")
    negative_groups = _read_candidate_signal_groups(definition_json, "negativeGroups")
    positive_group_count = len(positive_groups)
    negative_group_count = len(negative_groups)
    candidate_signal_quality_warnings = build_candidate_signal_quality_warnings(
        definition_json
    )
    hard_gate_safety_warnings = build_hard_gate_safety_warnings(template)

    normalized["selection_profile_policy_json"] = normalized_policy
    normalized["selection_profile_definition_json"] = definition_json
    normalized["candidate_signals_quality_warnings"] = candidate_signal_quality_warnings
    normalized["hard_gate_safety_warnings"] = hard_gate_safety_warnings
    normalized["selection_profile_candidate_signal_summary"] = {
        "source": (
            "selection_profile_definition"
            if positive_group_count > 0 or negative_group_count > 0
            else "generic_fallback"
        ),
        "positiveGroupCount": positive_group_count,
        "negativeGroupCount": negative_group_count,
        "qualityWarningCount": len(candidate_signal_quality_warnings),
    }
    return normalized


def build_selection_explain_payload(
    *,
    selection_like: Mapping[str, Any],
    final_selection_result: Mapping[str, Any] | None,
    system_feed_result: Mapping[str, Any] | None,
) -> dict[str, Any]:
    final_result = final_selection_result or {}
    system_result = system_feed_result or {}
    final_explain = as_json_object(final_result.get("explain_json"))
    filter_counts = as_json_object(final_explain.get("filterCounts"))
    hold_count = as_json_int(
        filter_counts.get("hold") or selection_like.get("final_selection_hold_count")
    )
    llm_review_pending_count = as_json_int(
        filter_counts.get("llmReviewPending")
        or selection_like.get("final_selection_llm_review_pending_count")
    )
    candidate_signal_uplift_count = as_json_int(
        final_explain.get("candidateSignalUpliftCount")
    )
    downstream_loss_bucket = as_json_str(final_explain.get("downstreamLossBucket"))
    selection_blocker_stage = as_json_str(final_explain.get("selectionBlockerStage"))
    selection_blocker_reason = as_json_str(final_explain.get("selectionBlockerReason"))
    hold_reason = as_json_str(final_explain.get("holdReason"))
    semantic_signal_summary = as_json_object(final_explain.get("semanticSignalSummary"))
    verification_signal_summary = as_json_object(
        final_explain.get("verificationSignalSummary")
    )
    canonical_review_reused = as_json_bool(
        final_explain.get("canonicalReviewReused")
        if "canonicalReviewReused" in final_explain
        else selection_like.get("final_selection_canonical_review_reused")
    )
    canonical_review_reused_count = as_json_int(
        final_explain.get("canonicalReviewReusedCount")
        if "canonicalReviewReusedCount" in final_explain
        else selection_like.get("final_selection_canonical_review_reused_count")
    )
    duplicate_signal_candidate_count_for_canonical = as_json_int(
        final_explain.get("duplicateSignalCandidateCountForCanonical")
        if "duplicateSignalCandidateCountForCanonical" in final_explain
        else selection_like.get("final_selection_duplicate_signal_candidate_count_for_canonical")
    )
    canonical_selection_reused = as_json_bool(
        final_explain.get("canonicalSelectionReused")
        if "canonicalSelectionReused" in final_explain
        else selection_like.get("final_selection_canonical_selection_reused")
    )
    selection_reuse_source = (
        as_json_str(
            final_explain.get("selectionReuseSource")
            if "selectionReuseSource" in final_explain
            else selection_like.get("final_selection_reuse_source")
        )
        or "signal_candidate_level"
    )
    selection_reason = (
        str(
            selection_like.get("final_selection_reason")
            or final_explain.get("selectionReason")
            or ""
        ).strip()
        or None
    )
    compatibility_decision = (
        str(
            selection_like.get("system_feed_decision")
            or system_result.get("decision")
            or ""
        ).strip()
        or None
    )
    final_decision = (
        str(
            selection_like.get("final_selection_decision")
            or final_result.get("final_decision")
            or ""
        ).strip()
        or None
    )

    selection_mode, selection_summary = resolve_selection_mode_summary(
        final_decision=final_decision,
        compatibility_decision=compatibility_decision,
        candidate_signal_uplift_count=candidate_signal_uplift_count,
        llm_review_pending_count=llm_review_pending_count,
        hold_count=hold_count,
        selection_reason=selection_reason,
    )
    candidate_recovery_state, candidate_recovery_summary = (
        resolve_candidate_recovery_summary(
            selection_mode=selection_mode,
            candidate_signal_uplift_count=candidate_signal_uplift_count,
        )
    )

    return {
        "source": (
            "final_selection_results"
            if final_decision
            else "system_feed_results"
            if compatibility_decision
            else "pending"
        ),
        "decision": final_decision or compatibility_decision,
        "systemSelected": (
            selection_like.get("final_selection_selected")
            if selection_like.get("final_selection_selected") is not None
            else selection_like.get("system_feed_eligible")
        ),
        "selectionReason": selection_reason,
        "selectionMode": selection_mode,
        "selectionSummary": selection_summary,
        "downstreamLossBucket": downstream_loss_bucket,
        "selectionBlockerStage": selection_blocker_stage,
        "selectionBlockerReason": selection_blocker_reason,
        "holdReason": hold_reason,
        "semanticSignalSummary": semantic_signal_summary,
        "verificationSignalSummary": verification_signal_summary,
        "llmReviewPendingCount": llm_review_pending_count,
        "holdCount": hold_count,
        "candidateSignalUpliftCount": candidate_signal_uplift_count,
        "candidateRecoveryState": candidate_recovery_state,
        "candidateRecoverySummary": candidate_recovery_summary,
        "canonicalReviewReused": canonical_review_reused,
        "canonicalReviewReusedCount": canonical_review_reused_count,
        "canonicalSelectionReused": canonical_selection_reused,
        "duplicateSignalCandidateCountForCanonical": duplicate_signal_candidate_count_for_canonical,
        "selectionReuseSource": selection_reuse_source,
        "reviewSource": (
            "reused_canonical_llm_review" if canonical_review_reused else None
        ),
        "compatibilityDecision": compatibility_decision,
        "observationState": selection_like.get("observation_state"),
        "duplicateKind": selection_like.get("duplicate_kind"),
        "canonicalDocumentId": selection_like.get("canonical_document_id"),
        "storyClusterId": selection_like.get("story_cluster_id"),
        "verificationState": selection_like.get("final_selection_verification_state")
        or selection_like.get("story_cluster_verification_state")
        or selection_like.get("canonical_verification_state"),
        "verificationTargetType": selection_like.get("verification_target_type"),
        "verificationTargetId": selection_like.get("verification_target_id"),
        "finalSelectionResult": final_selection_result,
        "systemFeedResult": system_feed_result,
    }


def build_fallback_selection_blocker_payload(
    *,
    selection_explain: Mapping[str, Any],
    system_criterion_rows: int,
    matched_rows: int,
    no_match_rows: int,
    gray_zone_rows: int,
    technical_filtered_out_rows: int,
) -> dict[str, Any]:
    selection_mode = str(selection_explain.get("selectionMode") or "").strip() or "pending"
    selection_reason = str(selection_explain.get("selectionReason") or "").strip() or None
    hold_count = as_json_int(selection_explain.get("holdCount"))
    llm_review_pending_count = as_json_int(selection_explain.get("llmReviewPendingCount"))

    if system_criterion_rows == 0:
        return {
            "downstreamLossBucket": "signal_candidates_missing_interest_filter_results",
            "selectionBlockerStage": "interest_filtering",
            "selectionBlockerReason": "missing_interest_filter_results",
            "holdReason": None,
        }
    if selection_mode == "selected":
        return {
            "downstreamLossBucket": "selected_useful_evidence_present",
            "selectionBlockerStage": "selected",
            "selectionBlockerReason": selection_reason or "semantic_match",
            "holdReason": None,
        }
    if selection_mode == "llm_review_pending" or llm_review_pending_count > 0:
        return {
            "downstreamLossBucket": "llm_review_pending",
            "selectionBlockerStage": "llm_review",
            "selectionBlockerReason": selection_reason or "llm_review_pending",
            "holdReason": None,
        }
    if selection_mode == "hold" or hold_count > 0:
        return {
            "downstreamLossBucket": "gray_zone_hold",
            "selectionBlockerStage": "hold_policy",
            "selectionBlockerReason": selection_reason or "gray_zone_hold",
            "holdReason": selection_reason or "gray_zone_hold",
        }
    if (
        technical_filtered_out_rows > 0
        and matched_rows == 0
        and no_match_rows == 0
        and gray_zone_rows == 0
    ):
        return {
            "downstreamLossBucket": "technical_filter_rejected",
            "selectionBlockerStage": "technical_filter",
            "selectionBlockerReason": selection_reason or "technical_filtered_out",
            "holdReason": None,
        }
    if no_match_rows > 0 and matched_rows == 0 and gray_zone_rows == 0:
        return {
            "downstreamLossBucket": "semantic_rejected",
            "selectionBlockerStage": "semantic_filter",
            "selectionBlockerReason": selection_reason or "semantic_no_match",
            "holdReason": None,
        }
    return {
        "downstreamLossBucket": "final_selection_rejected",
        "selectionBlockerStage": "final_selection",
        "selectionBlockerReason": selection_reason or "final_selection_rejected",
        "holdReason": None,
    }


def build_selection_diagnostics_payload(
    *,
    selection_explain: Mapping[str, Any],
    interest_filter_results: list[Mapping[str, Any]],
    llm_reviews: list[Mapping[str, Any]],
    notifications: list[Mapping[str, Any]],
) -> dict[str, Any]:
    filter_counts = build_interest_filter_count_summary(interest_filter_results)
    return build_selection_diagnostics_payload_from_counts(
        selection_explain=selection_explain,
        system_criterion_rows=filter_counts["systemCriterionRows"],
        user_interest_rows=filter_counts["userInterestRows"],
        matched_rows=filter_counts["matchedRows"],
        no_match_rows=filter_counts["noMatchRows"],
        gray_zone_rows=filter_counts["grayZoneRows"],
        technical_filtered_out_rows=filter_counts["technicalFilteredOutRows"],
        llm_review_rows=len(llm_reviews),
        notification_rows=len(notifications),
    )


def build_interest_filter_count_summary(
    interest_filter_results: list[Mapping[str, Any]],
) -> dict[str, int]:
    system_criterion_rows = 0
    user_interest_rows = 0
    matched_rows = 0
    no_match_rows = 0
    gray_zone_rows = 0
    technical_filtered_out_rows = 0

    for row in interest_filter_results:
        filter_scope = str(row.get("filter_scope") or "").strip()
        semantic_decision = str(row.get("semantic_decision") or "").strip()
        technical_filter_state = str(row.get("technical_filter_state") or "").strip()

        if filter_scope == "system_criterion":
            system_criterion_rows += 1
        elif filter_scope == "user_interest":
            user_interest_rows += 1

        if semantic_decision == "match":
            matched_rows += 1
        elif semantic_decision == "no_match":
            no_match_rows += 1
        elif semantic_decision == "gray_zone":
            gray_zone_rows += 1

        if technical_filter_state == "filtered_out":
            technical_filtered_out_rows += 1

    return {
        "systemCriterionRows": system_criterion_rows,
        "userInterestRows": user_interest_rows,
        "matchedRows": matched_rows,
        "noMatchRows": no_match_rows,
        "grayZoneRows": gray_zone_rows,
        "technicalFilteredOutRows": technical_filtered_out_rows,
    }


def build_selection_diagnostics_payload_from_counts(
    *,
    selection_explain: Mapping[str, Any],
    system_criterion_rows: int,
    user_interest_rows: int,
    matched_rows: int,
    no_match_rows: int,
    gray_zone_rows: int,
    technical_filtered_out_rows: int,
    llm_review_rows: int,
    notification_rows: int,
) -> dict[str, Any]:
    blocker_payload = build_fallback_selection_blocker_payload(
        selection_explain=selection_explain,
        system_criterion_rows=system_criterion_rows,
        matched_rows=matched_rows,
        no_match_rows=no_match_rows,
        gray_zone_rows=gray_zone_rows,
        technical_filtered_out_rows=technical_filtered_out_rows,
    )

    return {
        "source": selection_explain.get("source") or "pending",
        "decision": selection_explain.get("decision"),
        "selectionMode": selection_explain.get("selectionMode") or "pending",
        "selectionSummary": selection_explain.get("selectionSummary")
        or "Selection not explained yet",
        "selectionReason": selection_explain.get("selectionReason"),
        "downstreamLossBucket": selection_explain.get("downstreamLossBucket")
        or blocker_payload.get("downstreamLossBucket"),
        "selectionBlockerStage": selection_explain.get("selectionBlockerStage")
        or blocker_payload.get("selectionBlockerStage"),
        "selectionBlockerReason": selection_explain.get("selectionBlockerReason")
        or blocker_payload.get("selectionBlockerReason"),
        "holdReason": selection_explain.get("holdReason") or blocker_payload.get("holdReason"),
        "semanticSignalSummary": selection_explain.get("semanticSignalSummary")
        or {
            "total": system_criterion_rows,
            "matched": matched_rows,
            "noMatch": no_match_rows,
            "grayZone": gray_zone_rows,
            "technicalFilteredOut": technical_filtered_out_rows,
        },
        "verificationSignalSummary": selection_explain.get("verificationSignalSummary")
        or {
            "verificationState": selection_explain.get("verificationState"),
            "selectionDecision": selection_explain.get("decision"),
            "selectionReason": selection_explain.get("selectionReason"),
        },
        "holdCount": as_json_int(selection_explain.get("holdCount")),
        "llmReviewPendingCount": as_json_int(
            selection_explain.get("llmReviewPendingCount")
        ),
        "candidateSignalUpliftCount": as_json_int(
            selection_explain.get("candidateSignalUpliftCount")
        ),
        "candidateRecoveryState": selection_explain.get("candidateRecoveryState")
        or "absent",
        "candidateRecoverySummary": selection_explain.get("candidateRecoverySummary")
        or ABSENT_CANDIDATE_RECOVERY_SUMMARY,
        "systemCriterionRows": system_criterion_rows,
        "userInterestRows": user_interest_rows,
        "matchedRows": matched_rows,
        "noMatchRows": no_match_rows,
        "grayZoneRows": gray_zone_rows,
        "technicalFilteredOutRows": technical_filtered_out_rows,
        "llmReviewRows": llm_review_rows,
        "notificationRows": notification_rows,
    }


def build_selection_guidance_payload(
    *, selection_explain: Mapping[str, Any]
) -> dict[str, Any]:
    selection_mode = str(selection_explain.get("selectionMode") or "").strip() or "pending"
    selection_source = str(selection_explain.get("source") or "").strip() or "pending"
    candidate_signal_uplift_count = as_json_int(
        selection_explain.get("candidateSignalUpliftCount")
    )

    if selection_mode == "selected":
        if selection_source == "system_interest_content_kind":
            return {
                "tone": "positive",
                "summary": "Content-kind eligibility already selected this resource. Use this row mainly to verify projection quality and downstream visibility.",
            }
        return {
            "tone": "positive",
            "summary": "Final selection already passed. Use this row mainly to verify quality and downstream visibility.",
        }
    if selection_mode == "hold":
        if candidate_signal_uplift_count:
            return {
                "tone": "warning",
                "summary": "A recovered candidate was preserved out of early no-match, but profile policy still kept it on cheap hold. Tune evidence rules or escalation policy before broadening recall.",
            }
        return {
            "tone": "warning",
            "summary": "Profile policy kept this item on cheap hold. Tune profile definitions or evidence rules before enabling broader escalation.",
        }
    if selection_mode == "llm_review_pending":
        if candidate_signal_uplift_count:
            return {
                "tone": "warning",
                "summary": "A candidate-recovery signal kept this item alive for LLM review. Watch these cases to see whether the new recall path surfaces real wins or only extra noise.",
            }
        return {
            "tone": "warning",
            "summary": "This item is waiting for the LLM review path. Review budget and profile policy before treating it as a selected result.",
        }
    if selection_mode == "compatibility_only":
        return {
            "tone": "neutral",
            "summary": "Only the legacy compatibility projection is materialized here. Prefer final-selection/profile truth before tuning semantics.",
        }
    if selection_mode == "rejected":
        return {
            "tone": "neutral",
            "summary": "Final selection rejected this item. Revisit the profile only if you expect this pattern to pass consistently.",
        }
    if selection_mode == "gray_zone":
        if candidate_signal_uplift_count:
            return {
                "tone": "warning",
                "summary": "A recovered candidate remains unresolved in gray zone. Check whether canonical evidence or cluster context should turn this pattern into a cleaner escalation path.",
            }
        return {
            "tone": "warning",
            "summary": "Gray zone remains unresolved. Check missing evidence and decide whether this profile should hold, reject, or escalate similar cases.",
        }

    return {
        "tone": "neutral",
        "summary": "Selection is not materialized yet. Wait for the final-selection path before using this row for profile tuning decisions.",
    }


def build_content_kind_selection_explain_payload(
    *, content_like: Mapping[str, Any]
) -> dict[str, Any]:
    return {
        "source": "system_interest_content_kind",
        "decision": content_like.get("system_selection_decision") or "kind_enabled",
        "systemSelected": True,
        "selectionReason": None,
        "selectionMode": "selected",
        "selectionSummary": "Selected by content-kind eligibility",
        "llmReviewPendingCount": 0,
        "holdCount": 0,
        "candidateSignalUpliftCount": 0,
        "candidateRecoveryState": "absent",
        "candidateRecoverySummary": ABSENT_CANDIDATE_RECOVERY_SUMMARY,
        "canonicalReviewReused": False,
        "canonicalReviewReusedCount": 0,
        "canonicalSelectionReused": False,
        "duplicateSignalCandidateCountForCanonical": 0,
        "selectionReuseSource": "signal_candidate_level",
        "reviewSource": None,
        "compatibilityDecision": None,
        "observationState": None,
        "duplicateKind": None,
        "canonicalDocumentId": None,
        "storyClusterId": None,
        "verificationState": None,
        "verificationTargetType": None,
        "verificationTargetId": None,
        "finalSelectionResult": None,
        "systemFeedResult": None,
    }


def build_resource_selection_explain_payload(
    *, resource_like: Mapping[str, Any]
) -> dict[str, Any]:
    if resource_like.get("projected_signal_candidate_id"):
        return build_selection_explain_payload(
            selection_like=resource_like,
            final_selection_result=None,
            system_feed_result=None,
        )
    if resource_like.get("content_item_ready"):
        return build_content_kind_selection_explain_payload(content_like=resource_like)
    return {
        "source": "pending",
        "decision": None,
        "systemSelected": False,
        "selectionReason": None,
        "selectionMode": "pending",
        "selectionSummary": "Selection not materialized yet",
        "llmReviewPendingCount": 0,
        "holdCount": 0,
        "candidateSignalUpliftCount": 0,
        "candidateRecoveryState": "absent",
        "candidateRecoverySummary": ABSENT_CANDIDATE_RECOVERY_SUMMARY,
        "canonicalReviewReused": False,
        "canonicalReviewReusedCount": 0,
        "canonicalSelectionReused": False,
        "duplicateSignalCandidateCountForCanonical": 0,
        "selectionReuseSource": "signal_candidate_level",
        "reviewSource": None,
        "compatibilityDecision": None,
        "observationState": None,
        "duplicateKind": None,
        "canonicalDocumentId": None,
        "storyClusterId": None,
        "verificationState": None,
        "verificationTargetType": None,
        "verificationTargetId": None,
        "finalSelectionResult": None,
        "systemFeedResult": None,
    }

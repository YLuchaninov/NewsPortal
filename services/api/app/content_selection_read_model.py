from __future__ import annotations

from typing import Any, Mapping

from fastapi import HTTPException

from services.api.app.database import query_one
from services.api.app.json_read_model import (
    as_json_bool,
    as_json_int,
    as_json_object,
    as_json_str,
)

CONTENT_ITEM_ORIGINS = {"editorial", "resource"}


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
    raw_candidate_signals = (
        definition_json.get("candidateSignals")
        if isinstance(definition_json.get("candidateSignals"), Mapping)
        else {}
    )
    positive_groups = raw_candidate_signals.get("positiveGroups")
    negative_groups = raw_candidate_signals.get("negativeGroups")
    positive_group_count = len(positive_groups) if isinstance(positive_groups, list) else 0
    negative_group_count = len(negative_groups) if isinstance(negative_groups, list) else 0

    normalized["selection_profile_policy_json"] = normalized_policy
    normalized["selection_profile_definition_json"] = definition_json
    normalized["selection_profile_candidate_signal_summary"] = {
        "source": (
            "selection_profile_definition"
            if positive_group_count > 0 or negative_group_count > 0
            else "generic_fallback"
        ),
        "positiveGroupCount": positive_group_count,
        "negativeGroupCount": negative_group_count,
    }
    return normalized


def processed_article_clause(alias: str = "a") -> str:
    return (
        "("
        f"{alias}.processing_state in ('matched', 'notified')"
        f" or exists ("
        f"select 1 from final_selection_results fsr_processed "
        f"where fsr_processed.doc_id = {alias}.doc_id "
        "and fsr_processed.final_decision in ('selected', 'rejected', 'gray_zone')"
        ")"
        f" or exists ("
        f"select 1 from system_feed_results sfr_processed "
        f"where sfr_processed.doc_id = {alias}.doc_id "
        "and sfr_processed.decision in ('pass_through', 'eligible', 'filtered_out')"
        ")"
        ")"
    )


def final_selection_join_clause(
    article_alias: str = "a",
    final_alias: str = "fsr",
) -> str:
    return f"left join final_selection_results {final_alias} on {final_alias}.doc_id = {article_alias}.doc_id"


def system_feed_join_clause(article_alias: str = "a", system_alias: str = "sfr") -> str:
    return f"left join system_feed_results {system_alias} on {system_alias}.doc_id = {article_alias}.doc_id"


def article_observation_join_clause(
    article_alias: str = "a",
    observation_alias: str = "obs",
) -> str:
    return (
        f"left join document_observations {observation_alias} "
        f"on {observation_alias}.origin_type = 'article' "
        f"and {observation_alias}.origin_id = {article_alias}.doc_id"
    )


def effective_system_selected_expr(
    final_alias: str = "fsr",
    system_alias: str = "sfr",
) -> str:
    return f"""
      case
        when {final_alias}.doc_id is not null then coalesce({final_alias}.is_selected, false)
        else coalesce({system_alias}.eligible_for_feed, false)
      end
    """


def effective_system_selection_decision_expr(
    final_alias: str = "fsr",
    system_alias: str = "sfr",
) -> str:
    return f"""
      case
        when {final_alias}.doc_id is not null and {final_alias}.final_decision = 'selected' then 'selected'
        when {final_alias}.doc_id is not null and {final_alias}.final_decision = 'gray_zone' then 'gray_zone'
        when {final_alias}.doc_id is not null and {final_alias}.final_decision = 'rejected' then 'rejected'
        when coalesce({system_alias}.eligible_for_feed, false) then 'selected'
        when {system_alias}.decision = 'pending_llm' then 'pending_ai_review'
        when {system_alias}.decision in ('eligible', 'filtered_out', 'pass_through') then 'filtered_out'
        else 'unknown'
      end
    """


def canonical_article_family_expr(article_alias: str = "a") -> str:
    return f"coalesce({article_alias}.canonical_doc_id, {article_alias}.doc_id)"


def canonical_article_family_order_clause(article_alias: str = "a") -> str:
    family_expr = canonical_article_family_expr(article_alias)
    return (
        f"case when {article_alias}.doc_id = {family_expr} then 0 else 1 end, "
        f"{article_alias}.published_at desc nulls last, "
        f"{article_alias}.ingested_at desc, "
        f"{article_alias}.doc_id"
    )


def feed_eligible_article_clause(
    article_alias: str = "a",
    final_alias: str = "fsr",
    system_alias: str = "sfr",
) -> str:
    return (
        f"{article_alias}.visibility_state = 'visible' and "
        f"{effective_system_selected_expr(final_alias, system_alias)} = true"
    )


def build_content_item_id(origin_type: str, origin_id: str) -> str:
    return f"{origin_type}:{origin_id}"


def parse_content_item_id(content_item_id: str) -> tuple[str, str]:
    origin_type, separator, origin_id = str(content_item_id or "").partition(":")
    if separator != ":" or origin_type not in CONTENT_ITEM_ORIGINS or not origin_id:
        raise HTTPException(status_code=404, detail="Content item not found.")
    return origin_type, origin_id


def system_interest_kind_enabled_clause(kind_expr: str) -> str:
    return f"""
      exists (
        select 1
        from interest_templates it
        where it.is_active = true
          and (
            jsonb_array_length(
              case
                when jsonb_typeof(coalesce(it.allowed_content_kinds, '[]'::jsonb)) = 'array'
                then coalesce(it.allowed_content_kinds, '[]'::jsonb)
                else '[]'::jsonb
              end
            ) = 0
            or exists (
              select 1
              from jsonb_array_elements_text(
                case
                  when jsonb_typeof(coalesce(it.allowed_content_kinds, '[]'::jsonb)) = 'array'
                  then coalesce(it.allowed_content_kinds, '[]'::jsonb)
                  else '[]'::jsonb
                end
              ) allowed(kind)
              where allowed.kind = {kind_expr}
            )
          )
      )
    """


def primary_media_join_clause(
    article_alias: str = "a",
    media_alias: str = "pma",
) -> str:
    return f"left join article_media_assets {media_alias} on {media_alias}.asset_id = {article_alias}.primary_media_asset_id"


def article_preview_projection(
    article_alias: str = "a",
    channel_alias: str = "sc",
    media_alias: str = "pma",
) -> str:
    return f"""
          {article_alias}.has_media,
          {article_alias}.enrichment_state,
          coalesce({article_alias}.extracted_source_name, {channel_alias}.name) as source_name,
          {article_alias}.extracted_author as author_name,
          {article_alias}.extracted_ttr_seconds as read_time_seconds,
          {media_alias}.asset_id::text as primary_media_asset_id,
          {media_alias}.media_kind as primary_media_kind,
          {media_alias}.storage_kind as primary_media_storage_kind,
          coalesce({media_alias}.thumbnail_url, {media_alias}.source_url) as primary_media_url,
          {media_alias}.thumbnail_url as primary_media_thumbnail_url,
          {media_alias}.source_url as primary_media_source_url,
          {media_alias}.title as primary_media_title,
          {media_alias}.alt_text as primary_media_alt_text
    """


def query_count(
    sql: str,
    params: tuple[Any, ...] = (),
    *,
    query_one_func: Any = query_one,
) -> int:
    row = query_one_func(sql, params)
    return int(row["total"]) if row and row.get("total") is not None else 0


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
    duplicate_article_count_for_canonical = as_json_int(
        final_explain.get("duplicateArticleCountForCanonical")
        if "duplicateArticleCountForCanonical" in final_explain
        else selection_like.get("final_selection_duplicate_article_count_for_canonical")
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
        or "article_level"
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

    if final_decision == "gray_zone":
        if candidate_signal_uplift_count and (
            llm_review_pending_count > 0 or compatibility_decision == "pending_llm"
        ):
            selection_mode = "llm_review_pending"
            selection_summary = "Recovered candidate waiting for LLM review"
        elif llm_review_pending_count > 0 or compatibility_decision == "pending_llm":
            selection_mode = "llm_review_pending"
            selection_summary = "Gray zone pending LLM review"
        elif candidate_signal_uplift_count and (
            hold_count > 0 or selection_reason == "candidate_signal_hold"
        ):
            selection_mode = "hold"
            selection_summary = "Recovered candidate held by profile policy"
        elif hold_count > 0 or selection_reason == "semantic_hold":
            selection_mode = "hold"
            selection_summary = "Gray zone held by profile policy"
        elif candidate_signal_uplift_count:
            selection_mode = "gray_zone"
            selection_summary = "Recovered candidate remains in gray zone"
        else:
            selection_mode = "gray_zone"
            selection_summary = "Gray zone unresolved"
    elif final_decision == "selected":
        selection_mode = "selected"
        selection_summary = "Selected by final-selection policy"
    elif final_decision == "rejected":
        selection_mode = "rejected"
        selection_summary = "Rejected by final-selection policy"
    elif compatibility_decision == "pending_llm":
        selection_mode = "llm_review_pending"
        selection_summary = "Compatibility projection waiting for review"
    elif compatibility_decision:
        selection_mode = "compatibility_only"
        selection_summary = f"Compatibility projection: {compatibility_decision}"
    else:
        selection_mode = "pending"
        selection_summary = "Selection not materialized yet"

    if candidate_signal_uplift_count:
        candidate_recovery_state = (
            "review_pending"
            if selection_mode == "llm_review_pending"
            else "held"
            if selection_mode == "hold"
            else "present"
        )
        candidate_recovery_summary = (
            "Recovered candidate signals are materialized and waiting for LLM review."
            if selection_mode == "llm_review_pending"
            else "Recovered candidate signals are materialized but currently held."
            if selection_mode == "hold"
            else "Recovered candidate signals are materialized on this item."
        )
    else:
        candidate_recovery_state = "absent"
        candidate_recovery_summary = (
            "Recovered candidate signals have not materialized on this item yet."
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
        "duplicateArticleCountForCanonical": duplicate_article_count_for_canonical,
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
            "downstreamLossBucket": "articles_missing_interest_filter_results",
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
        or "Recovered candidate signals have not materialized on this item yet.",
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
        "candidateRecoverySummary":
            "Recovered candidate signals have not materialized on this item yet.",
        "canonicalReviewReused": False,
        "canonicalReviewReusedCount": 0,
        "canonicalSelectionReused": False,
        "duplicateArticleCountForCanonical": 0,
        "selectionReuseSource": "article_level",
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
    if resource_like.get("projected_article_id"):
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
        "candidateRecoverySummary":
            "Recovered candidate signals have not materialized on this item yet.",
        "canonicalReviewReused": False,
        "canonicalReviewReusedCount": 0,
        "canonicalSelectionReused": False,
        "duplicateArticleCountForCanonical": 0,
        "selectionReuseSource": "article_level",
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


def apply_resource_selection_payload(
    resource_like: Mapping[str, Any],
    *,
    interest_filter_results: list[Mapping[str, Any]] | None = None,
    llm_reviews: list[Mapping[str, Any]] | None = None,
    notifications: list[Mapping[str, Any]] | None = None,
) -> dict[str, Any]:
    resource = dict(resource_like)
    selection_explain = build_resource_selection_explain_payload(resource_like=resource)
    resource["selection_source"] = selection_explain.get("source")
    resource["selection_decision"] = selection_explain.get("decision")
    resource["selection_mode"] = selection_explain.get("selectionMode")
    resource["selection_summary"] = selection_explain.get("selectionSummary")
    resource["selection_reason"] = selection_explain.get("selectionReason")
    resource["selection_hold_count"] = as_json_int(selection_explain.get("holdCount"))
    resource["selection_llm_review_pending_count"] = as_json_int(
        selection_explain.get("llmReviewPendingCount")
    )
    resource["selection_candidate_signal_uplift_count"] = as_json_int(
        selection_explain.get("candidateSignalUpliftCount")
    )
    resource["selection_candidate_recovery_state"] = selection_explain.get(
        "candidateRecoveryState"
    )
    resource["selection_candidate_recovery_summary"] = selection_explain.get(
        "candidateRecoverySummary"
    )
    resource["selection_canonical_review_reused"] = selection_explain.get(
        "canonicalReviewReused"
    )
    resource["selection_canonical_review_reused_count"] = as_json_int(
        selection_explain.get("canonicalReviewReusedCount")
    )
    resource["selection_canonical_reused"] = selection_explain.get(
        "canonicalSelectionReused"
    )
    resource["selection_duplicate_article_count_for_canonical"] = as_json_int(
        selection_explain.get("duplicateArticleCountForCanonical")
    )
    resource["selection_reuse_source"] = selection_explain.get("selectionReuseSource")
    resource["selection_review_source"] = selection_explain.get("reviewSource")
    resource["selection_guidance"] = build_selection_guidance_payload(
        selection_explain=selection_explain
    )
    if (
        interest_filter_results is not None
        and llm_reviews is not None
        and notifications is not None
    ):
        resource["selection_diagnostics"] = build_selection_diagnostics_payload(
            selection_explain=selection_explain,
            interest_filter_results=interest_filter_results,
            llm_reviews=llm_reviews,
            notifications=notifications,
        )
    return resource


def apply_article_selection_payload(
    article_like: Mapping[str, Any],
    *,
    interest_filter_results: list[Mapping[str, Any]] | None = None,
    llm_reviews: list[Mapping[str, Any]] | None = None,
    notifications: list[Mapping[str, Any]] | None = None,
) -> dict[str, Any]:
    article = dict(article_like)
    selection_explain = build_selection_explain_payload(
        selection_like=article,
        final_selection_result=None,
        system_feed_result=None,
    )
    article["selection_source"] = selection_explain.get("source")
    article["selection_decision"] = selection_explain.get("decision")
    article["selection_mode"] = selection_explain.get("selectionMode")
    article["selection_summary"] = selection_explain.get("selectionSummary")
    article["selection_reason"] = selection_explain.get("selectionReason")
    article["selection_hold_count"] = as_json_int(selection_explain.get("holdCount"))
    article["selection_llm_review_pending_count"] = as_json_int(
        selection_explain.get("llmReviewPendingCount")
    )
    article["selection_candidate_signal_uplift_count"] = as_json_int(
        selection_explain.get("candidateSignalUpliftCount")
    )
    article["selection_candidate_recovery_state"] = selection_explain.get(
        "candidateRecoveryState"
    )
    article["selection_candidate_recovery_summary"] = selection_explain.get(
        "candidateRecoverySummary"
    )
    article["selection_canonical_review_reused"] = selection_explain.get(
        "canonicalReviewReused"
    )
    article["selection_canonical_review_reused_count"] = as_json_int(
        selection_explain.get("canonicalReviewReusedCount")
    )
    article["selection_canonical_reused"] = selection_explain.get(
        "canonicalSelectionReused"
    )
    article["selection_duplicate_article_count_for_canonical"] = as_json_int(
        selection_explain.get("duplicateArticleCountForCanonical")
    )
    article["selection_reuse_source"] = selection_explain.get("selectionReuseSource")
    article["selection_review_source"] = selection_explain.get("reviewSource")
    article["selection_guidance"] = build_selection_guidance_payload(
        selection_explain=selection_explain
    )
    if (
        interest_filter_results is not None
        and llm_reviews is not None
        and notifications is not None
    ):
        article["selection_diagnostics"] = build_selection_diagnostics_payload(
            selection_explain=selection_explain,
            interest_filter_results=interest_filter_results,
            llm_reviews=llm_reviews,
            notifications=notifications,
        )
    return article



def editorial_content_select_sql(*, include_internal_fields: bool = False) -> str:
    family_expr = canonical_article_family_expr("a")
    family_order = canonical_article_family_order_clause("a")
    internal_projection = ""
    if include_internal_fields:
        internal_projection = """
            nullif(lower(btrim(coalesce(a.title, ''))), '') as _normalized_title,
            concat_ws(' ', coalesce(a.title, ''), coalesce(a.lead, ''), coalesce(a.body, '')) as _search_text,
        """
    return f"""
        select
          ranked.content_item_id,
          ranked.content_kind,
          ranked.origin_type,
          ranked.origin_id,
          ranked.url,
          ranked.title,
          ranked.summary,
          ranked.lead,
          ranked.lang,
          ranked.published_at,
          ranked.ingested_at,
          ranked.updated_at,
          ranked.source_name,
          ranked.author_name,
          ranked.read_time_seconds,
          ranked.system_selection_decision,
          ranked.system_selected,
          ranked.has_media,
          ranked.primary_media_kind,
          ranked.primary_media_url,
          ranked.primary_media_thumbnail_url,
          ranked.primary_media_source_url,
          ranked.primary_media_title,
          ranked.primary_media_alt_text,
          ranked.like_count,
          ranked.dislike_count,
          ranked.matched_interest_id,
          ranked.matched_interest_description,
          ranked.interest_match_score,
          ranked.interest_match_decision
          {", ranked._normalized_title, ranked._search_text" if include_internal_fields else ""}
        from (
          select
            {repr('editorial:')} || a.doc_id::text as content_item_id,
            coalesce(a.content_kind, 'editorial')::text as content_kind,
            'editorial'::text as origin_type,
            a.doc_id::text as origin_id,
            a.url,
            a.title,
            a.lead as summary,
            a.lead,
            a.lang,
            a.published_at,
            a.ingested_at,
            a.updated_at,
            coalesce(a.extracted_source_name, sc.name) as source_name,
            a.extracted_author as author_name,
            a.extracted_ttr_seconds as read_time_seconds,
            {effective_system_selection_decision_expr("fsr", "sfr")} as system_selection_decision,
            {effective_system_selected_expr("fsr", "sfr")} as system_selected,
            a.has_media,
            pma.media_kind as primary_media_kind,
            coalesce(pma.thumbnail_url, pma.source_url) as primary_media_url,
            pma.thumbnail_url as primary_media_thumbnail_url,
            pma.source_url as primary_media_source_url,
            pma.title as primary_media_title,
            pma.alt_text as primary_media_alt_text,
            coalesce(ars.like_count, 0) as like_count,
            coalesce(ars.dislike_count, 0) as dislike_count,
            null::text as matched_interest_id,
            null::text as matched_interest_description,
            null::double precision as interest_match_score,
            null::text as interest_match_decision,
            {internal_projection if include_internal_fields else ""}
            row_number() over (
              partition by {family_expr}
              order by {family_order}
            ) as family_rank
          from articles a
          join source_channels sc on sc.channel_id = a.channel_id
          {final_selection_join_clause("a", "fsr")}
          left join system_feed_results sfr on sfr.doc_id = a.doc_id
          left join article_media_assets pma on pma.asset_id = a.primary_media_asset_id
          left join article_reaction_stats ars on ars.doc_id = a.doc_id
          where {feed_eligible_article_clause("a", "fsr", "sfr")}
        ) ranked
        where ranked.family_rank = 1
    """


def resource_content_select_sql(*, include_internal_fields: bool = False) -> str:
    internal_projection = ""
    if include_internal_fields:
        internal_projection = """
          ,
          nullif(lower(btrim(coalesce(wr.title, ''))), '') as _normalized_title,
          concat_ws(' ', coalesce(wr.title, ''), coalesce(wr.summary, ''), coalesce(wr.body, '')) as _search_text
        """
    return f"""
        select
          {repr('resource:')} || wr.resource_id::text as content_item_id,
          wr.resource_kind as content_kind,
          'resource'::text as origin_type,
          wr.resource_id::text as origin_id,
          coalesce(wr.final_url, wr.url) as url,
          wr.title,
          wr.summary,
          wr.summary as lead,
          wr.lang,
          wr.published_at,
          wr.discovered_at as ingested_at,
          wr.updated_at,
          sc.name as source_name,
          null::text as author_name,
          null::integer as read_time_seconds,
          'kind_enabled'::text as system_selection_decision,
          true as system_selected,
          jsonb_array_length(coalesce(wr.media_json, '[]'::jsonb)) > 0 as has_media,
          wr.media_json -> 0 ->> 'media_kind' as primary_media_kind,
          coalesce(wr.media_json -> 0 ->> 'thumbnail_url', wr.media_json -> 0 ->> 'source_url') as primary_media_url,
          wr.media_json -> 0 ->> 'thumbnail_url' as primary_media_thumbnail_url,
          wr.media_json -> 0 ->> 'source_url' as primary_media_source_url,
          wr.media_json -> 0 ->> 'title' as primary_media_title,
          wr.media_json -> 0 ->> 'alt_text' as primary_media_alt_text,
          0::bigint as like_count,
          0::bigint as dislike_count,
          null::text as matched_interest_id,
          null::text as matched_interest_description,
          null::double precision as interest_match_score,
          null::text as interest_match_decision
          {internal_projection}
        from web_resources wr
        join source_channels sc on sc.channel_id = wr.channel_id
        where wr.resource_kind <> 'editorial'
          and wr.extraction_state in ('enriched', 'skipped')
          and {system_interest_kind_enabled_clause("wr.resource_kind")}
    """


def combined_content_items_select_sql(*, include_internal_fields: bool = False) -> str:
    return editorial_content_select_sql(
        include_internal_fields=include_internal_fields
    )


def build_editorial_content_item_preview_from_article(
    article: Mapping[str, Any],
) -> dict[str, Any]:
    final_selection_decision = str(article.get("final_selection_decision") or "").strip()
    system_feed_decision = str(article.get("system_feed_decision") or "").strip()
    final_selection_selected = article.get("final_selection_selected")
    system_feed_eligible = article.get("system_feed_eligible")
    system_selected = (
        bool(final_selection_selected)
        if final_selection_selected is not None
        else bool(system_feed_eligible)
    )

    if final_selection_decision == "selected":
        system_selection_decision = "selected"
    elif final_selection_decision == "gray_zone":
        system_selection_decision = "gray_zone"
    elif final_selection_decision == "rejected":
        system_selection_decision = "rejected"
    elif system_feed_eligible:
        system_selection_decision = "selected"
    elif system_feed_decision == "pending_llm":
        system_selection_decision = "pending_ai_review"
    elif system_feed_decision in {"eligible", "filtered_out", "pass_through"}:
        system_selection_decision = "filtered_out"
    else:
        system_selection_decision = "unknown"

    return {
        "content_item_id": build_content_item_id(
            "editorial", str(article.get("doc_id") or "")
        ),
        "content_kind": str(article.get("content_kind") or "editorial"),
        "origin_type": "editorial",
        "origin_id": str(article.get("doc_id") or ""),
        "url": article.get("url"),
        "title": article.get("title"),
        "lead": article.get("lead"),
        "lang": article.get("lang"),
        "published_at": article.get("published_at"),
        "ingested_at": article.get("ingested_at"),
        "updated_at": article.get("updated_at"),
        "source_name": article.get("source_name"),
        "author_name": article.get("author_name"),
        "read_time_seconds": article.get("read_time_seconds"),
        "system_selection_decision": system_selection_decision,
        "system_selected": system_selected,
        "has_media": article.get("has_media"),
        "primary_media_kind": article.get("primary_media_kind"),
        "primary_media_url": article.get("primary_media_url"),
        "primary_media_thumbnail_url": article.get("primary_media_thumbnail_url"),
        "primary_media_source_url": article.get("primary_media_source_url"),
        "primary_media_title": article.get("primary_media_title"),
        "primary_media_alt_text": article.get("primary_media_alt_text"),
        "like_count": article.get("like_count", 0),
        "dislike_count": article.get("dislike_count", 0),
        "matched_interest_id": None,
        "matched_interest_description": None,
        "interest_match_score": None,
        "interest_match_decision": None,
    }


def get_selected_content_item_preview(content_item_id: str) -> dict[str, Any]:
    content_item = query_one(
        f"""
        select *
        from ({combined_content_items_select_sql()}) content_items
        where content_item_id = %s
        """,
        (content_item_id,),
    )
    if content_item is None:
        raise HTTPException(status_code=404, detail="Content item not found.")
    return content_item

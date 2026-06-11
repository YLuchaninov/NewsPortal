from __future__ import annotations

from typing import Any, Mapping
from uuid import UUID

from fastapi import HTTPException

from services.api.app.database import query_one
from services.api.app.json_read_model import as_json_int
from services.api.app.content_selection.payloads import (
    build_resource_selection_explain_payload,
    build_selection_diagnostics_payload,
    build_selection_explain_payload,
    build_selection_guidance_payload,
)
from services.api.app.content_selection.sql_fragments import combined_content_items_select_sql

CONTENT_ITEM_ORIGINS = {"signal_candidate", "resource"}


def build_content_item_id(origin_type: str, origin_id: str) -> str:
    return f"{origin_type}:{origin_id}"


def parse_content_item_id(content_item_id: str) -> tuple[str, str]:
    origin_type, separator, origin_id = str(content_item_id or "").partition(":")
    if separator != ":" or origin_type not in CONTENT_ITEM_ORIGINS or not origin_id:
        raise HTTPException(status_code=404, detail="Content item not found.")
    try:
        origin_id = str(UUID(origin_id))
    except (TypeError, ValueError) as error:
        raise HTTPException(status_code=404, detail="Content item not found.") from error
    return origin_type, origin_id


def query_count(
    sql: str,
    params: tuple[Any, ...] = (),
    *,
    query_one_func: Any = query_one,
) -> int:
    row = query_one_func(sql, params)
    return int(row["total"]) if row and row.get("total") is not None else 0


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
    resource["selection_duplicate_signal_candidate_count_for_canonical"] = as_json_int(
        selection_explain.get("duplicateSignalCandidateCountForCanonical")
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


def apply_signal_candidate_selection_payload(
    signal_candidate_like: Mapping[str, Any],
    *,
    interest_filter_results: list[Mapping[str, Any]] | None = None,
    llm_reviews: list[Mapping[str, Any]] | None = None,
    notifications: list[Mapping[str, Any]] | None = None,
) -> dict[str, Any]:
    signal_candidate = dict(signal_candidate_like)
    selection_explain = build_selection_explain_payload(
        selection_like=signal_candidate,
        final_selection_result=None,
        system_feed_result=None,
    )
    signal_candidate["selection_source"] = selection_explain.get("source")
    signal_candidate["selection_decision"] = selection_explain.get("decision")
    signal_candidate["selection_mode"] = selection_explain.get("selectionMode")
    signal_candidate["selection_summary"] = selection_explain.get("selectionSummary")
    signal_candidate["selection_reason"] = selection_explain.get("selectionReason")
    signal_candidate["selection_hold_count"] = as_json_int(selection_explain.get("holdCount"))
    signal_candidate["selection_llm_review_pending_count"] = as_json_int(
        selection_explain.get("llmReviewPendingCount")
    )
    signal_candidate["selection_candidate_signal_uplift_count"] = as_json_int(
        selection_explain.get("candidateSignalUpliftCount")
    )
    signal_candidate["selection_candidate_recovery_state"] = selection_explain.get(
        "candidateRecoveryState"
    )
    signal_candidate["selection_candidate_recovery_summary"] = selection_explain.get(
        "candidateRecoverySummary"
    )
    signal_candidate["selection_canonical_review_reused"] = selection_explain.get(
        "canonicalReviewReused"
    )
    signal_candidate["selection_canonical_review_reused_count"] = as_json_int(
        selection_explain.get("canonicalReviewReusedCount")
    )
    signal_candidate["selection_canonical_reused"] = selection_explain.get(
        "canonicalSelectionReused"
    )
    signal_candidate["selection_duplicate_signal_candidate_count_for_canonical"] = as_json_int(
        selection_explain.get("duplicateSignalCandidateCountForCanonical")
    )
    signal_candidate["selection_reuse_source"] = selection_explain.get("selectionReuseSource")
    signal_candidate["selection_review_source"] = selection_explain.get("reviewSource")
    signal_candidate["selection_guidance"] = build_selection_guidance_payload(
        selection_explain=selection_explain
    )
    if (
        interest_filter_results is not None
        and llm_reviews is not None
        and notifications is not None
    ):
        signal_candidate["selection_diagnostics"] = build_selection_diagnostics_payload(
            selection_explain=selection_explain,
            interest_filter_results=interest_filter_results,
            llm_reviews=llm_reviews,
            notifications=notifications,
        )
    return signal_candidate


def build_editorial_content_item_preview_from_signal_candidate(
    signal_candidate: Mapping[str, Any],
) -> dict[str, Any]:
    final_selection_decision = str(signal_candidate.get("final_selection_decision") or "").strip()
    system_feed_decision = str(signal_candidate.get("system_feed_decision") or "").strip()
    final_selection_selected = signal_candidate.get("final_selection_selected")
    system_feed_eligible = signal_candidate.get("system_feed_eligible")
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
        "content_item_id": build_content_item_id("signal_candidate", str(signal_candidate.get("doc_id") or "")
        ),
        "content_kind": str(signal_candidate.get("content_kind") or "editorial"),
        "origin_type": "signal_candidate",
        "origin_id": str(signal_candidate.get("doc_id") or ""),
        "url": signal_candidate.get("url"),
        "title": signal_candidate.get("title"),
        "lead": signal_candidate.get("lead"),
        "lang": signal_candidate.get("lang"),
        "published_at": signal_candidate.get("published_at"),
        "ingested_at": signal_candidate.get("ingested_at"),
        "updated_at": signal_candidate.get("updated_at"),
        "source_name": signal_candidate.get("source_name"),
        "author_name": signal_candidate.get("author_name"),
        "read_time_seconds": signal_candidate.get("read_time_seconds"),
        "system_selection_decision": system_selection_decision,
        "system_selected": system_selected,
        "has_media": signal_candidate.get("has_media"),
        "primary_media_kind": signal_candidate.get("primary_media_kind"),
        "primary_media_url": signal_candidate.get("primary_media_url"),
        "primary_media_thumbnail_url": signal_candidate.get("primary_media_thumbnail_url"),
        "primary_media_source_url": signal_candidate.get("primary_media_source_url"),
        "primary_media_title": signal_candidate.get("primary_media_title"),
        "primary_media_alt_text": signal_candidate.get("primary_media_alt_text"),
        "like_count": signal_candidate.get("like_count", 0),
        "dislike_count": signal_candidate.get("dislike_count", 0),
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

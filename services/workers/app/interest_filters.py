from __future__ import annotations

import uuid
from typing import Any, Mapping

import psycopg
from psycopg.types.json import Json

from .story_clusters import (
    fetch_story_cluster_membership,
    refresh_canonical_document_verification,
)


def build_interest_filter_key(
    filter_scope: str,
    *,
    criterion_id: uuid.UUID | None = None,
    interest_id: uuid.UUID | None = None,
) -> str:
    if filter_scope == "system_criterion" and criterion_id is not None:
        return f"criterion:{criterion_id}"
    if filter_scope == "user_interest" and interest_id is not None:
        return f"interest:{interest_id}"
    raise ValueError(f"Unable to build interest filter key for scope {filter_scope}.")


def resolve_criterion_filter_outcome(
    *,
    pass_filters: bool,
    compat_decision: str,
) -> tuple[str, str]:
    if not pass_filters:
        return ("filtered_out", "not_evaluated")
    if compat_decision == "relevant":
        return ("passed", "match")
    if compat_decision == "gray_zone":
        return ("passed", "gray_zone")
    return ("passed", "no_match")


def resolve_user_interest_filter_outcome(
    *,
    pass_filters: bool,
    compat_decision: str,
) -> tuple[str, str]:
    if not pass_filters:
        return ("filtered_out", "not_evaluated")
    if compat_decision == "notify":
        return ("passed", "match")
    if compat_decision == "gray_zone":
        return ("passed", "gray_zone")
    return ("passed", "no_match")


async def fetch_verification_result_snapshot(
    cursor: psycopg.AsyncCursor[Any],
    *,
    target_type: str,
    target_id: uuid.UUID,
) -> dict[str, Any] | None:
    await cursor.execute(
        """
        select
          target_type,
          target_id,
          verification_state
        from verification_results
        where target_type = %s
          and target_id = %s
        limit 1
        """,
        (target_type, target_id),
    )
    row = await cursor.fetchone()
    return row


async def resolve_interest_filter_context(
    cursor: psycopg.AsyncCursor[Any],
    *,
    article: Mapping[str, Any],
    prefer_story_cluster: bool,
) -> dict[str, Any]:
    raw_canonical_document_id = article.get("canonical_doc_id") or article.get("doc_id")
    canonical_document_id: uuid.UUID | None = None
    if raw_canonical_document_id:
        try:
            canonical_document_id = uuid.UUID(str(raw_canonical_document_id))
        except (TypeError, ValueError):
            canonical_document_id = None

    story_cluster_id: uuid.UUID | None = None
    verification_target_type: str | None = None
    verification_target_id: uuid.UUID | None = None
    verification_state: str | None = None

    if prefer_story_cluster and canonical_document_id is not None:
        membership = await fetch_story_cluster_membership(cursor, canonical_document_id)
        if membership is not None:
            try:
                story_cluster_id = uuid.UUID(str(membership["story_cluster_id"]))
            except (TypeError, ValueError):
                story_cluster_id = None
        if story_cluster_id is not None:
            story_snapshot = await fetch_verification_result_snapshot(
                cursor,
                target_type="story_cluster",
                target_id=story_cluster_id,
            )
            if story_snapshot is not None:
                verification_target_type = "story_cluster"
                verification_target_id = story_cluster_id
                verification_state = str(story_snapshot.get("verification_state") or "")

    if verification_target_type is None and canonical_document_id is not None:
        try:
            canonical_snapshot = await refresh_canonical_document_verification(
                cursor,
                canonical_document_id=canonical_document_id,
            )
        except ValueError:
            canonical_snapshot = None
        if canonical_snapshot is not None:
            verification_target_type = "canonical_document"
            verification_target_id = canonical_document_id
            verification_state = str(canonical_snapshot.get("verificationState") or "")

    return {
        "canonicalDocumentId": canonical_document_id,
        "storyClusterId": story_cluster_id,
        "verificationTargetType": verification_target_type,
        "verificationTargetId": verification_target_id,
        "verificationState": verification_state or None,
    }


def build_interest_filter_explain(
    *,
    base_explain_json: Mapping[str, Any],
    technical_filter_state: str,
    semantic_decision: str,
    compat_decision: str,
    filter_scope: str,
    context: Mapping[str, Any],
) -> dict[str, Any]:
    explain_json = dict(base_explain_json)
    explain_json["filterScope"] = filter_scope
    explain_json["technicalFilterState"] = technical_filter_state
    explain_json["semanticDecision"] = semantic_decision
    explain_json["compatDecision"] = compat_decision
    explain_json["canonicalDocumentId"] = (
        None
        if context.get("canonicalDocumentId") is None
        else str(context["canonicalDocumentId"])
    )
    explain_json["storyClusterId"] = (
        None if context.get("storyClusterId") is None else str(context["storyClusterId"])
    )
    explain_json["verification"] = {
        "targetType": context.get("verificationTargetType"),
        "targetId": (
            None
            if context.get("verificationTargetId") is None
            else str(context["verificationTargetId"])
        ),
        "state": context.get("verificationState"),
    }
    return explain_json


async def upsert_interest_filter_result(
    cursor: psycopg.AsyncCursor[Any],
    *,
    filter_scope: str,
    doc_id: uuid.UUID,
    canonical_document_id: uuid.UUID | None,
    story_cluster_id: uuid.UUID | None,
    user_id: uuid.UUID | None,
    criterion_id: uuid.UUID | None,
    interest_id: uuid.UUID | None,
    technical_filter_state: str,
    semantic_decision: str,
    compat_decision: str,
    verification_target_type: str | None,
    verification_target_id: uuid.UUID | None,
    verification_state: str | None,
    semantic_score: float,
    explain_json: Mapping[str, Any],
) -> None:
    filter_key = build_interest_filter_key(
        filter_scope,
        criterion_id=criterion_id,
        interest_id=interest_id,
    )
    await cursor.execute(
        """
        insert into interest_filter_results (
          filter_scope,
          filter_key,
          doc_id,
          canonical_document_id,
          story_cluster_id,
          user_id,
          criterion_id,
          interest_id,
          technical_filter_state,
          semantic_decision,
          compat_decision,
          verification_target_type,
          verification_target_id,
          verification_state,
          semantic_score,
          explain_json
        )
        values (
          %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb
        )
        on conflict (doc_id, filter_key) do update
        set
          filter_scope = excluded.filter_scope,
          canonical_document_id = excluded.canonical_document_id,
          story_cluster_id = excluded.story_cluster_id,
          user_id = excluded.user_id,
          criterion_id = excluded.criterion_id,
          interest_id = excluded.interest_id,
          technical_filter_state = excluded.technical_filter_state,
          semantic_decision = excluded.semantic_decision,
          compat_decision = excluded.compat_decision,
          verification_target_type = excluded.verification_target_type,
          verification_target_id = excluded.verification_target_id,
          verification_state = excluded.verification_state,
          semantic_score = excluded.semantic_score,
          explain_json = excluded.explain_json,
          updated_at = now()
        """,
        (
            filter_scope,
            filter_key,
            doc_id,
            canonical_document_id,
            story_cluster_id,
            user_id,
            criterion_id,
            interest_id,
            technical_filter_state,
            semantic_decision,
            compat_decision,
            verification_target_type,
            verification_target_id,
            verification_state,
            semantic_score,
            Json(dict(explain_json)),
        ),
    )

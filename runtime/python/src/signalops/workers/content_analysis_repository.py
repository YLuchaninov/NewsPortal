"""Persistence primitives for content analysis result rows."""

from __future__ import annotations

import uuid
from typing import Any, Mapping

import psycopg
from psycopg.types.json import Json

from .content_analysis_runtime import ContentSubject, RuntimeAnalysisPolicy


def _replace_analysis_result(
    connection: psycopg.Connection[Any],
    *,
    subject: ContentSubject,
    analysis_type: str,
    provider: str,
    model_key: str,
    model_version: str,
    result_json: Mapping[str, Any],
    confidence: float | None,
    source_hash: str | None,
    policy: RuntimeAnalysisPolicy | None = None,
    status: str = "completed",
    error_text: str | None = None,
) -> uuid.UUID:
    row = connection.execute(
        """
        insert into content_analysis_results (
          subject_type,
          subject_id,
          canonical_document_id,
          source_channel_id,
          analysis_type,
          provider,
          model_key,
          model_version,
          language,
          policy_id,
          policy_version,
          status,
          result_json,
          confidence,
          source_hash,
          error_text
        )
        values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        on conflict (
          subject_type,
          subject_id,
          analysis_type,
          provider,
          model_key,
          (coalesce(source_hash, ''::text))
        )
        do update set
          canonical_document_id = excluded.canonical_document_id,
          source_channel_id = excluded.source_channel_id,
          model_version = excluded.model_version,
          language = excluded.language,
          policy_id = excluded.policy_id,
          policy_version = excluded.policy_version,
          status = excluded.status,
          result_json = excluded.result_json,
          confidence = excluded.confidence,
          error_text = excluded.error_text,
          updated_at = now()
        returning analysis_id
        """,
        (
            subject.subject_type,
            subject.subject_id,
            subject.canonical_document_id,
            subject.source_channel_id,
            analysis_type,
            provider,
            model_key,
            model_version,
            subject.language,
            policy.policy_id if policy else None,
            policy.version if policy else None,
            status,
            Json(dict(result_json)),
            confidence,
            source_hash,
            error_text,
        ),
    ).fetchone()
    return uuid.UUID(str(row["analysis_id"]))

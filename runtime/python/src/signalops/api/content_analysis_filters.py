from __future__ import annotations

import uuid
from typing import Any

from fastapi import HTTPException

from signalops.api import content_query as _content_query

CONTENT_ANALYSIS_SUBJECT_TYPES = {
    "signal_candidate",
    "web_resource",
    "canonical_document",
    "story_cluster",
}
CONTENT_ANALYSIS_TYPES = {
    "ner",
    "sentiment",
    "entity_sentiment",
    "category",
    "system_interest_label",
    "content_filter",
    "cluster_summary",
    "structured_extraction",
}
CONTENT_ANALYSIS_STATUSES = {"pending", "completed", "failed", "skipped"}
CONTENT_ANALYSIS_POLICY_MODULES = {
    "ner",
    "sentiment",
    "category",
    "system_interest_label",
    "content_filter",
    "cluster_summary",
    "clustering",
    "structured_extraction",
}
CONTENT_FILTER_DECISIONS = {"keep", "reject", "hold", "needs_review"}


def normalize_optional_query_bool(value: Any) -> bool | None:
    if value is None or _content_query.is_fastapi_param_default(value):
        return None
    return bool(value)


def normalize_content_analysis_subject_type(value: str) -> str:
    normalized = str(value or "").strip()
    if normalized not in CONTENT_ANALYSIS_SUBJECT_TYPES:
        raise HTTPException(status_code=400, detail="Unsupported content analysis subject type.")
    return normalized


def normalize_content_analysis_type(value: str | None) -> str | None:
    if value is None or _content_query.is_fastapi_param_default(value):
        return None
    normalized = str(value or "").strip()
    if normalized and normalized not in CONTENT_ANALYSIS_TYPES:
        raise HTTPException(status_code=400, detail="Unsupported content analysis type.")
    return normalized or None


def normalize_content_analysis_status(value: str | None) -> str | None:
    if value is None or _content_query.is_fastapi_param_default(value):
        return None
    normalized = str(value or "").strip()
    if normalized and normalized not in CONTENT_ANALYSIS_STATUSES:
        raise HTTPException(status_code=400, detail="Unsupported content analysis status.")
    return normalized or None


def normalize_content_filter_decision(value: str | None) -> str | None:
    if value is None or _content_query.is_fastapi_param_default(value):
        return None
    normalized = str(value or "").strip()
    if normalized and normalized not in CONTENT_FILTER_DECISIONS:
        raise HTTPException(status_code=400, detail="Unsupported content filter decision.")
    return normalized or None


def normalize_content_analysis_subject_id(value: str | None) -> str | None:
    if value is None or _content_query.is_fastapi_param_default(value):
        return None
    normalized = str(value or "").strip()
    if not normalized:
        return None
    try:
        uuid.UUID(normalized)
    except ValueError as error:
        raise HTTPException(status_code=400, detail="subjectId must be a UUID.") from error
    return normalized

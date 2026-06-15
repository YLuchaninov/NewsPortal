"""Compatibility facade for content-analysis worker workflows.

Implementation lives in narrower modules by reason-to-change. This module keeps the
historical import and monkeypatch surface stable for processors and tests.
"""

from __future__ import annotations

from typing import Any, Mapping

from . import content_analysis_filter_runtime as _filter_runtime
from .content_analysis_cluster_labels import (
    load_story_cluster_summary,
    persist_cluster_summary_analysis,
    project_system_interest_labels,
)
from .content_analysis_filter_runtime import (
    _evaluate_label_rule,
    _evaluate_structured_date_rule,
    _evaluate_structured_field_rule,
    _load_subject_labels,
    _load_subject_structured_extractions,
    _relative_threshold,
    _resolve_date,
    _structured_field_matches,
    evaluate_content_filter_policy as _evaluate_content_filter_policy,
    load_filter_policy,
    persist_content_filter_result as _persist_content_filter_result,
)
from .content_analysis_heuristics import analyze_categories, analyze_sentiment, extract_heuristic_entities
from .content_analysis_local_persistence import (
    persist_category_analysis,
    persist_ner_analysis,
    persist_sentiment_analysis,
)
from .content_analysis_repository import _replace_analysis_result
from .content_analysis_runtime import (
    CLUSTER_SUMMARY_MODEL_KEY,
    CLUSTER_SUMMARY_MODEL_VERSION,
    CLUSTER_SUMMARY_PROVIDER,
    CONTENT_FILTER_MODEL_KEY,
    CONTENT_FILTER_MODEL_VERSION,
    CONTENT_FILTER_PROVIDER,
    DEFAULT_CONTENT_FILTER_POLICY_KEY,
    DEFAULT_MAX_TEXT_CHARS,
    SYSTEM_LABEL_MODEL_KEY,
    SYSTEM_LABEL_MODEL_VERSION,
    SYSTEM_LABEL_PROVIDER,
    ContentSubject,
    RuntimeAnalysisPolicy,
    policy_supports_local_runtime as _runtime_policy_supports_local_runtime,
)
from .content_analysis_structured import validate_structured_extraction_output
from .content_analysis_structured_runtime import (
    build_structured_extraction_hints,
    persist_structured_extraction_analysis,
)
from .content_analysis_subjects import load_content_subject

_policy_supports_local_runtime = _runtime_policy_supports_local_runtime


def _sync_filter_runtime_patchables() -> None:
    _filter_runtime.load_filter_policy = load_filter_policy
    _filter_runtime._relative_threshold = _relative_threshold
    _filter_runtime._resolve_date = _resolve_date
    _filter_runtime._load_subject_labels = _load_subject_labels
    _filter_runtime._evaluate_label_rule = _evaluate_label_rule
    _filter_runtime._load_subject_structured_extractions = _load_subject_structured_extractions
    _filter_runtime._structured_field_matches = _structured_field_matches
    _filter_runtime._evaluate_structured_field_rule = _evaluate_structured_field_rule
    _filter_runtime._evaluate_structured_date_rule = _evaluate_structured_date_rule


def evaluate_content_filter_policy(subject: ContentSubject, policy: Mapping[str, Any]) -> dict[str, Any]:
    _sync_filter_runtime_patchables()
    return _evaluate_content_filter_policy(subject, policy)


def persist_content_filter_result(
    subject: ContentSubject | str,
    subject_id: str | None = None,
    *,
    policy_key: str | None = None,
    mode_override: str | None = None,
) -> dict[str, Any]:
    _sync_filter_runtime_patchables()
    kwargs: dict[str, Any] = {"policy_key": policy_key or DEFAULT_CONTENT_FILTER_POLICY_KEY}
    if mode_override is not None:
        kwargs["mode_override"] = mode_override
    if isinstance(subject, str):
        if subject_id is None:
            raise ValueError("subject_id is required when subject is provided as a subject_type string.")
        return _persist_content_filter_result(
            subject,
            subject_id,
            **kwargs,
        )
    return _persist_content_filter_result(
        subject.subject_type,
        subject.subject_id,
        **kwargs,
    )


__all__ = [
    "CLUSTER_SUMMARY_MODEL_KEY",
    "CLUSTER_SUMMARY_MODEL_VERSION",
    "CLUSTER_SUMMARY_PROVIDER",
    "CONTENT_FILTER_MODEL_KEY",
    "CONTENT_FILTER_MODEL_VERSION",
    "CONTENT_FILTER_PROVIDER",
    "DEFAULT_CONTENT_FILTER_POLICY_KEY",
    "DEFAULT_MAX_TEXT_CHARS",
    "SYSTEM_LABEL_MODEL_KEY",
    "SYSTEM_LABEL_MODEL_VERSION",
    "SYSTEM_LABEL_PROVIDER",
    "ContentSubject",
    "RuntimeAnalysisPolicy",
    "_evaluate_label_rule",
    "_evaluate_structured_date_rule",
    "_evaluate_structured_field_rule",
    "_load_subject_labels",
    "_load_subject_structured_extractions",
    "_policy_supports_local_runtime",
    "_relative_threshold",
    "_replace_analysis_result",
    "_resolve_date",
    "_structured_field_matches",
    "analyze_categories",
    "analyze_sentiment",
    "build_structured_extraction_hints",
    "evaluate_content_filter_policy",
    "extract_heuristic_entities",
    "load_content_subject",
    "load_filter_policy",
    "load_story_cluster_summary",
    "persist_category_analysis",
    "persist_cluster_summary_analysis",
    "persist_content_filter_result",
    "persist_ner_analysis",
    "persist_sentiment_analysis",
    "persist_structured_extraction_analysis",
    "project_system_interest_labels",
    "validate_structured_extraction_output",
]

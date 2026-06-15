from __future__ import annotations

import uuid
from typing import Any

import psycopg
from fastapi import HTTPException, Query
from psycopg.rows import dict_row

from signalops.api import content_analysis_backfill as _content_analysis_backfill
from signalops.api import content_analysis_payloads as _content_analysis_payloads
from signalops.api import content_analysis_policies as _content_analysis_policies
from signalops.api import content_analysis_read_model as _content_analysis_read_model
from signalops.api.database import build_database_url, query_all, query_one
from signalops.api.main_common import query_count
from signalops.api.main_sequence import dump_json_value


def _raise_content_analysis_policy_write_error(error: Exception) -> None:
    if isinstance(error, _content_analysis_policies.ContentAnalysisPolicyWriteFailure):
        raise HTTPException(status_code=500, detail=str(error)) from error
    raise error


ContentAnalysisPolicyPayload = _content_analysis_payloads.ContentAnalysisPolicyPayload
ContentAnalysisPolicyUpdatePayload = _content_analysis_payloads.ContentAnalysisPolicyUpdatePayload
ContentFilterPolicyPayload = _content_analysis_payloads.ContentFilterPolicyPayload
ContentFilterPolicyUpdatePayload = _content_analysis_payloads.ContentFilterPolicyUpdatePayload
ContentAnalysisBackfillPayload = _content_analysis_payloads.ContentAnalysisBackfillPayload


def normalize_content_analysis_subject_type(value: str) -> str:
    return _content_analysis_read_model.normalize_content_analysis_subject_type(value)


def normalize_content_analysis_type(value: str | None) -> str | None:
    return _content_analysis_read_model.normalize_content_analysis_type(value)


def normalize_content_analysis_status(value: str | None) -> str | None:
    return _content_analysis_read_model.normalize_content_analysis_status(value)


def normalize_content_filter_decision(value: str | None) -> str | None:
    return _content_analysis_read_model.normalize_content_filter_decision(value)


def normalize_content_analysis_subject_id(value: str | None) -> str | None:
    return _content_analysis_read_model.normalize_content_analysis_subject_id(value)


def load_content_analysis_summary(
    *,
    subject_type: str,
    subject_id: str,
) -> dict[str, Any]:
    return _content_analysis_read_model.load_content_analysis_summary(
        subject_type=subject_type,
        subject_id=subject_id,
        query_all_func=query_all,
        query_one_func=query_one,
    )


def build_content_analysis_filter_clause(
    *,
    subject_alias: str,
    subject_type: str,
    entity_type: str | None = None,
    entity_text: str | None = None,
    entity_normalized_key: str | None = None,
    label_type: str | None = None,
    label_key: str | None = None,
    content_filter_passed: bool | None = None,
    content_filter_decision: str | None = None,
) -> tuple[list[str], list[Any]]:
    return _content_analysis_read_model.build_content_analysis_filter_clause(
        subject_alias=subject_alias,
        subject_type=subject_type,
        entity_type=entity_type,
        entity_text=entity_text,
        entity_normalized_key=entity_normalized_key,
        label_type=label_type,
        label_key=label_key,
        content_filter_passed=content_filter_passed,
        content_filter_decision=content_filter_decision,
    )


def list_content_analysis_results(
    subject_type: str | None = Query(default=None, alias="subjectType"),
    subject_id: str | None = Query(default=None, alias="subjectId"),
    analysis_type: str | None = Query(default=None, alias="analysisType"),
    status: str | None = Query(default=None),
    page: int | None = Query(default=None, ge=1),
    page_size: int | None = Query(default=None, ge=1, le=200, alias="pageSize"),
) -> dict[str, Any]:
    return _content_analysis_read_model.list_content_analysis_results(
        subject_type=subject_type,
        subject_id=subject_id,
        analysis_type=analysis_type,
        status=status,
        page=page,
        page_size=page_size,
        query_all_func=query_all,
        query_count_func=query_count,
    )


def get_content_analysis_result(analysis_id: str) -> dict[str, Any]:
    return _content_analysis_read_model.get_content_analysis_result(
        analysis_id,
        query_one_func=query_one,
    )

def request_content_analysis_backfill(
    payload: ContentAnalysisBackfillPayload,
) -> dict[str, Any]:
    return _content_analysis_backfill.request_content_analysis_backfill(
        payload,
        normalize_subject_id_func=normalize_content_analysis_subject_id,
        dump_json_value_func=dump_json_value,
        build_database_url_func=build_database_url,
        connect_func=psycopg.connect,
        dict_row_value=dict_row,
        uuid4_func=uuid.uuid4,
    )


def list_content_entities(
    subject_type: str | None = Query(default=None, alias="subjectType"),
    subject_id: str | None = Query(default=None, alias="subjectId"),
    entity_type: str | None = Query(default=None, alias="entityType"),
    entity_text: str | None = Query(default=None, alias="entityText"),
    normalized_key: str | None = Query(default=None, alias="normalizedKey"),
    page: int | None = Query(default=None, ge=1),
    page_size: int | None = Query(default=None, ge=1, le=200, alias="pageSize"),
) -> dict[str, Any]:
    return _content_analysis_read_model.list_content_entities(
        subject_type=subject_type,
        subject_id=subject_id,
        entity_type=entity_type,
        entity_text=entity_text,
        normalized_key=normalized_key,
        page=page,
        page_size=page_size,
        query_all_func=query_all,
        query_count_func=query_count,
    )


def list_content_labels(
    subject_type: str | None = Query(default=None, alias="subjectType"),
    subject_id: str | None = Query(default=None, alias="subjectId"),
    label_type: str | None = Query(default=None, alias="labelType"),
    label_key: str | None = Query(default=None, alias="labelKey"),
    decision: str | None = Query(default=None),
    page: int | None = Query(default=None, ge=1),
    page_size: int | None = Query(default=None, ge=1, le=200, alias="pageSize"),
) -> dict[str, Any]:
    return _content_analysis_read_model.list_content_labels(
        subject_type=subject_type,
        subject_id=subject_id,
        label_type=label_type,
        label_key=label_key,
        decision=decision,
        page=page,
        page_size=page_size,
        query_all_func=query_all,
        query_count_func=query_count,
    )


def list_content_analysis_policies(
    module: str | None = Query(default=None),
    page: int | None = Query(default=None, ge=1),
    page_size: int | None = Query(default=None, ge=1, le=200, alias="pageSize"),
) -> dict[str, Any]:
    return _content_analysis_read_model.list_content_analysis_policies(
        module=module,
        page=page,
        page_size=page_size,
        query_all_func=query_all,
        query_count_func=query_count,
    )


def get_content_analysis_policy(policy_id: str) -> dict[str, Any]:
    return _content_analysis_read_model.get_content_analysis_policy(
        policy_id,
        query_one_func=query_one,
    )

def create_content_analysis_policy(payload: ContentAnalysisPolicyPayload) -> dict[str, Any]:
    try:
        return _content_analysis_policies.create_content_analysis_policy(
            payload,
            query_one_func=query_one,
            get_content_analysis_policy_func=get_content_analysis_policy,
        )
    except _content_analysis_policies.ContentAnalysisPolicyWriteFailure as error:
        _raise_content_analysis_policy_write_error(error)


def update_content_analysis_policy(
    policy_id: str,
    payload: ContentAnalysisPolicyUpdatePayload,
) -> dict[str, Any]:
    try:
        return _content_analysis_policies.update_content_analysis_policy(
            policy_id,
            payload,
            get_content_analysis_policy_func=get_content_analysis_policy,
            query_one_func=query_one,
            build_database_url_func=build_database_url,
            connect_func=psycopg.connect,
            dict_row_value=dict_row,
        )
    except _content_analysis_policies.ContentAnalysisPolicyWriteFailure as error:
        _raise_content_analysis_policy_write_error(error)


def list_content_filter_policies(
    page: int | None = Query(default=None, ge=1),
    page_size: int | None = Query(default=None, ge=1, le=200, alias="pageSize"),
) -> dict[str, Any]:
    return _content_analysis_read_model.list_content_filter_policies(
        page=page,
        page_size=page_size,
        query_all_func=query_all,
        query_count_func=query_count,
    )


def get_content_filter_policy(filter_policy_id: str) -> dict[str, Any]:
    return _content_analysis_read_model.get_content_filter_policy(
        filter_policy_id,
        query_one_func=query_one,
    )

def create_content_filter_policy(payload: ContentFilterPolicyPayload) -> dict[str, Any]:
    try:
        return _content_analysis_policies.create_content_filter_policy(
            payload,
            query_one_func=query_one,
            get_content_filter_policy_func=get_content_filter_policy,
        )
    except _content_analysis_policies.ContentAnalysisPolicyWriteFailure as error:
        _raise_content_analysis_policy_write_error(error)


def update_content_filter_policy(
    filter_policy_id: str,
    payload: ContentFilterPolicyUpdatePayload,
) -> dict[str, Any]:
    try:
        return _content_analysis_policies.update_content_filter_policy(
            filter_policy_id,
            payload,
            get_content_filter_policy_func=get_content_filter_policy,
            query_one_func=query_one,
            build_database_url_func=build_database_url,
            connect_func=psycopg.connect,
            dict_row_value=dict_row,
        )
    except _content_analysis_policies.ContentAnalysisPolicyWriteFailure as error:
        _raise_content_analysis_policy_write_error(error)


def preview_content_filter_policy(filter_policy_id: str) -> dict[str, Any]:
    return _content_analysis_read_model.preview_content_filter_policy(
        filter_policy_id,
        get_content_filter_policy_func=get_content_filter_policy,
        query_one_func=query_one,
        query_count_func=query_count,
    )


def list_content_filter_results(
    subject_type: str | None = Query(default=None, alias="subjectType"),
    subject_id: str | None = Query(default=None, alias="subjectId"),
    policy_key: str | None = Query(default=None, alias="policyKey"),
    decision: str | None = Query(default=None),
    passed: bool | None = Query(default=None),
    page: int | None = Query(default=None, ge=1),
    page_size: int | None = Query(default=None, ge=1, le=200, alias="pageSize"),
) -> dict[str, Any]:
    return _content_analysis_read_model.list_content_filter_results(
        subject_type=subject_type,
        subject_id=subject_id,
        policy_key=policy_key,
        decision=decision,
        passed=passed,
        page=page,
        page_size=page_size,
        query_all_func=query_all,
        query_count_func=query_count,
    )

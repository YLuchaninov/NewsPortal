# ruff: noqa: F401
from __future__ import annotations

from signalops.api.main_route_prelude import (
    Any,
    ApiAppContext,
    ApiRouteDependencyValues,
    HTTPException,
    Literal,
    Mapping,
    Query,
    RESERVED_CONTEXT_KEYS,
    SEQUENCE_RUN_CANCELLABLE_STATUSES,
    SequenceQueueDispatchError,
    TASK_REGISTRY,
    _channel_read_model,
    _cluster_read_model,
    _content_analysis_backfill,
    _content_analysis_payloads,
    _content_analysis_policies,
    _content_analysis_read_model,
    _content_detail_read_model,
    _content_item_list_read_model,
    _content_selection_query_count,
    _dashboard_read_model,
    _llm_review_read_model,
    _notification_read_model,
    _reindex_read_model,
    _sequence_commands,
    _sequence_payloads,
    _sequence_read_model,
    _sequence_route_compat,
    _signal_candidate_list_read_model,
    _signal_candidate_residual_read_model,
    _system_interest_read_model,
    _user_interest_read_model,
    _user_match_read_model,
    _web_resource_read_model,
    apply_reindex_selection_profile_payload,
    apply_resource_selection_payload,
    apply_signal_candidate_selection_payload,
    as_json_bool,
    as_json_int,
    as_json_object,
    as_json_str,
    build_content_item_id,
    build_content_kind_selection_explain_payload,
    build_database_url,
    build_editorial_content_item_preview_from_signal_candidate,
    build_fallback_selection_blocker_payload,
    build_paginated_response,
    build_reindex_selection_profile_payload,
    build_resource_selection_explain_payload,
    build_route_deps,
    build_selection_diagnostics_payload,
    build_selection_diagnostics_payload_from_counts,
    build_selection_explain_payload,
    build_selection_guidance_payload,
    build_web_content_order_clause,
    build_web_content_search_clause,
    build_web_content_search_pattern,
    canonical_signal_candidate_family_expr,
    canonical_signal_candidate_family_order_clause,
    coerce_llm_review_cost_usd,
    combined_content_items_select_sql,
    create_api_app,
    default_max_entry_age_hours_for_adapter,
    dict_row,
    dispatch_sequence_run_job,
    editorial_content_select_sql,
    feed_eligible_signal_candidate_clause,
    final_selection_join_clause,
    get_selected_content_item_preview,
    infer_feed_ingress_adapter_strategy,
    is_fastapi_param_default,
    llm_review_accept_gray_zone_on_budget_exhaustion,
    llm_review_cost_usd_to_cents,
    llm_review_enabled,
    llm_review_month_start_utc,
    llm_review_monthly_budget_cents,
    normalize_optional_query_string,
    normalize_system_interest_selection_profile_payload,
    normalize_web_content_list_sort,
    normalize_web_content_search_query,
    parse_content_item_id,
    parse_cron_expression,
    primary_media_join_clause,
    processed_signal_candidate_clause,
    psycopg,
    query_all,
    query_one,
    resolve_feed_ingress_adapter_strategy,
    resolve_feed_ingress_max_entry_age_hours,
    resolve_pagination,
    resource_content_select_sql,
    signal_candidate_observation_join_clause,
    signal_candidate_preview_projection,
    strip_web_content_internal_fields,
    system_feed_join_clause,
    system_interest_kind_enabled_clause,
    uuid,
    with_resolved_channel_adapter_fields,
)

def normalize_optional_query_bool(value: Any) -> bool | None:
    if value is None or is_fastapi_param_default(value):
        return None
    return bool(value)


def query_count(sql: str, params: tuple[Any, ...] = ()) -> int:
    return _content_selection_query_count(sql, params, query_one_func=query_one)

from signalops.api.main_sequence import dump_json_value

def _raise_content_analysis_policy_write_error(error: Exception) -> None:
    if isinstance(error, _content_analysis_policies.ContentAnalysisPolicyWriteFailure):
        raise HTTPException(status_code=500, detail=str(error)) from error
    raise error



SequenceValidationError = _sequence_read_model.SequenceValidationError
SequenceNotFoundError = _sequence_read_model.SequenceNotFoundError
SequenceConflictError = _sequence_read_model.SequenceConflictError




SequenceDispatchError = _sequence_read_model.SequenceDispatchError
SequenceCreatePayload = _sequence_payloads.SequenceCreatePayload
SequenceUpdatePayload = _sequence_payloads.SequenceUpdatePayload
SequenceManualRunPayload = _sequence_payloads.SequenceManualRunPayload
SequenceRetryRunPayload = _sequence_payloads.SequenceRetryRunPayload
AgentSequenceCreatePayload = _sequence_payloads.AgentSequenceCreatePayload
SequenceCancelPayload = _sequence_payloads.SequenceCancelPayload
SignalCandidateEnrichmentRetryPayload = _sequence_payloads.SignalCandidateEnrichmentRetryPayload

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

from __future__ import annotations

import os as _os
import uuid
from typing import Any, Literal, Mapping

import psycopg
from fastapi import HTTPException, Query
from psycopg.rows import dict_row

from services.api.app.api_app import ApiAppContext, create_api_app
from services.api.app.database import (
    build_database_url,
    query_all,
    query_one,
)
from services.api.app import channel_adapters as _channel_adapters
from services.api.app import channel_read_model as _channel_read_model
from services.api.app import cluster_read_model as _cluster_read_model
from services.api.app import signal_candidate_list_read_model as _signal_candidate_list_read_model
from services.api.app import signal_candidate_residual_read_model as _signal_candidate_residual_read_model
from services.api.app import content_analysis_backfill as _content_analysis_backfill
from services.api.app import content_analysis_payloads as _content_analysis_payloads
from services.api.app import content_analysis_policies as _content_analysis_policies
from services.api.app import content_analysis_read_model as _content_analysis_read_model
from services.api.app import content_detail_read_model as _content_detail_read_model
from services.api.app import content_item_list_read_model as _content_item_list_read_model
from services.api.app import content_query as _content_query
from services.api.app import dashboard_read_model as _dashboard_read_model
from services.api.app import json_read_model as _json_read_model
from services.api.app import llm_review_read_model as _llm_review_read_model
from services.api.app import notification_read_model as _notification_read_model
from services.api.app import reindex_read_model as _reindex_read_model
from services.api.app import sequence_commands as _sequence_commands
from services.api.app import sequence_payloads as _sequence_payloads
from services.api.app import sequence_route_compat as _sequence_route_compat
from services.api.app import sequence_read_model as _sequence_read_model
from services.api.app import system_interest_read_model as _system_interest_read_model
from services.api.app import user_interest_read_model as _user_interest_read_model
from services.api.app import user_match_read_model as _user_match_read_model
from services.api.app import web_resource_read_model as _web_resource_read_model
from services.api.app.content_selection_read_model import (
    apply_signal_candidate_selection_payload,
    apply_resource_selection_payload,
    signal_candidate_observation_join_clause,
    signal_candidate_preview_projection,
    build_content_item_id,
    build_content_kind_selection_explain_payload,
    build_editorial_content_item_preview_from_signal_candidate,
    build_fallback_selection_blocker_payload,
    build_resource_selection_explain_payload,
    build_selection_diagnostics_payload,
    build_selection_diagnostics_payload_from_counts,
    build_selection_explain_payload,
    build_selection_guidance_payload,
    canonical_signal_candidate_family_expr,
    canonical_signal_candidate_family_order_clause,
    combined_content_items_select_sql,
    editorial_content_select_sql,
    feed_eligible_signal_candidate_clause,
    final_selection_join_clause,
    get_selected_content_item_preview,
    normalize_system_interest_selection_profile_payload,
    parse_content_item_id,
    primary_media_join_clause,
    processed_signal_candidate_clause,
    query_count as _content_selection_query_count,
    resource_content_select_sql,
    system_feed_join_clause,
    system_interest_kind_enabled_clause,
)
from services.api.app.pagination import build_paginated_response, resolve_pagination
from services.api.app.route_deps import build_route_deps
from services.api.app.llm_review_budget import (
    coerce_llm_review_cost_usd,
    llm_review_accept_gray_zone_on_budget_exhaustion,
    llm_review_cost_usd_to_cents,
    llm_review_enabled,
    llm_review_month_start_utc,
    llm_review_monthly_budget_cents,
)
from services.api.app.status_constants import (
    SEQUENCE_RUN_CANCELLABLE_STATUSES,
)
from services.api.app.sequence_worker_boundary import (
    RESERVED_CONTEXT_KEYS,
    parse_cron_expression,
    dispatch_sequence_run_job,
    SequenceQueueDispatchError,
    TASK_REGISTRY,
)

os = _os


API_MAIN_COMPAT_EXPORTS = (
    build_content_item_id,
    build_fallback_selection_blocker_payload,
    build_resource_selection_explain_payload,
    canonical_signal_candidate_family_order_clause,
    coerce_llm_review_cost_usd,
    editorial_content_select_sql,
    llm_review_accept_gray_zone_on_budget_exhaustion,
    llm_review_cost_usd_to_cents,
    llm_review_enabled,
    llm_review_month_start_utc,
    llm_review_monthly_budget_cents,
    resource_content_select_sql,
    system_interest_kind_enabled_clause,
)
infer_feed_ingress_adapter_strategy = _channel_adapters.infer_feed_ingress_adapter_strategy
default_max_entry_age_hours_for_adapter = _channel_adapters.default_max_entry_age_hours_for_adapter
resolve_feed_ingress_adapter_strategy = _channel_adapters.resolve_feed_ingress_adapter_strategy
resolve_feed_ingress_max_entry_age_hours = (
    _channel_adapters.resolve_feed_ingress_max_entry_age_hours
)
with_resolved_channel_adapter_fields = _channel_adapters.with_resolved_channel_adapter_fields
is_fastapi_param_default = _content_query.is_fastapi_param_default
normalize_web_content_list_sort = _content_query.normalize_web_content_list_sort
normalize_web_content_search_query = _content_query.normalize_web_content_search_query
normalize_optional_query_string = _content_query.normalize_optional_query_string
build_web_content_search_pattern = _content_query.build_web_content_search_pattern
build_web_content_search_clause = _content_query.build_web_content_search_clause
build_web_content_order_clause = _content_query.build_web_content_order_clause
strip_web_content_internal_fields = _content_query.strip_web_content_internal_fields
as_json_object = _json_read_model.as_json_object
as_json_int = _json_read_model.as_json_int
as_json_bool = _json_read_model.as_json_bool
as_json_str = _json_read_model.as_json_str
build_reindex_selection_profile_payload = (
    _reindex_read_model.build_reindex_selection_profile_payload
)
apply_reindex_selection_profile_payload = (
    _reindex_read_model.apply_reindex_selection_profile_payload
)


def normalize_optional_query_bool(value: Any) -> bool | None:
    if value is None or is_fastapi_param_default(value):
        return None
    return bool(value)


def query_count(sql: str, params: tuple[Any, ...] = ()) -> int:
    return _content_selection_query_count(sql, params, query_one_func=query_one)


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


def validate_sequence_task_graph(task_graph: list[dict[str, Any]]) -> None:
    return _sequence_read_model.validate_sequence_task_graph(
        task_graph,
        task_registry=TASK_REGISTRY,
    )


def validate_sequence_context_json(context_json: dict[str, Any]) -> None:
    return _sequence_read_model.validate_sequence_context_json(
        context_json,
        reserved_context_keys=RESERVED_CONTEXT_KEYS,
    )


def sanitize_sequence_retry_context(context_json: Mapping[str, Any] | None) -> dict[str, Any]:
    return _sequence_read_model.sanitize_sequence_retry_context(
        context_json,
        reserved_context_keys=RESERVED_CONTEXT_KEYS,
    )


def validate_trigger_meta(trigger_meta: dict[str, Any]) -> None:
    return _sequence_read_model.validate_trigger_meta(trigger_meta)


def validate_sequence_editor_state(editor_state: dict[str, Any] | None) -> None:
    return _sequence_read_model.validate_sequence_editor_state(editor_state)


def normalize_sequence_cron(cron: str | None) -> str | None:
    return _sequence_read_model.normalize_sequence_cron(
        cron,
        parse_cron_expression_func=parse_cron_expression,
    )


def dump_json_value(value: Any, field_name: str) -> str:
    return _sequence_read_model.dump_json_value(value, field_name)


def sequence_select_sql() -> str:
    return _sequence_read_model.sequence_select_sql()


def sequence_run_select_sql() -> str:
    return _sequence_read_model.sequence_run_select_sql()


def list_sequence_plugins() -> list[dict[str, Any]]:
    return _sequence_read_model.list_sequence_plugins(task_registry=TASK_REGISTRY)


def list_sequences_page(
    *,
    limit: int,
    page: int | None,
    page_size: int | None,
) -> dict[str, Any] | list[dict[str, Any]]:
    return _sequence_read_model.list_sequences_page(
        limit=limit,
        page=page,
        page_size=page_size,
        sequence_select_sql_func=sequence_select_sql,
        resolve_pagination_func=resolve_pagination,
        query_all_func=query_all,
        query_count_func=query_count,
        build_paginated_response_func=build_paginated_response,
    )


def get_sequence_definition(sequence_id: str) -> dict[str, Any]:
    return _sequence_read_model.get_sequence_definition(
        sequence_id,
        sequence_select_sql_func=sequence_select_sql,
        query_one_func=query_one,
    )


def create_sequence_definition(payload: SequenceCreatePayload) -> dict[str, Any]:
    return _sequence_commands.create_sequence_definition(
        payload,
        validate_sequence_task_graph_func=validate_sequence_task_graph,
        validate_sequence_editor_state_func=validate_sequence_editor_state,
        normalize_sequence_cron_func=normalize_sequence_cron,
        dump_json_value_func=dump_json_value,
        build_database_url_func=build_database_url,
        connect_func=psycopg.connect,
        dict_row_value=dict_row,
    )


def update_sequence_definition(
    sequence_id: str,
    payload: SequenceUpdatePayload,
) -> dict[str, Any]:
    return _sequence_commands.update_sequence_definition(
        sequence_id,
        payload,
        validate_sequence_task_graph_func=validate_sequence_task_graph,
        validate_sequence_editor_state_func=validate_sequence_editor_state,
        normalize_sequence_cron_func=normalize_sequence_cron,
        dump_json_value_func=dump_json_value,
        build_database_url_func=build_database_url,
        connect_func=psycopg.connect,
        dict_row_value=dict_row,
    )


def archive_sequence_definition(sequence_id: str) -> dict[str, Any]:
    return _sequence_commands.archive_sequence_definition(
        sequence_id,
        build_database_url_func=build_database_url,
        connect_func=psycopg.connect,
        dict_row_value=dict_row,
    )


def enqueue_sequence_run_job(run_id: str, sequence_id: str) -> None:
    return _sequence_commands.enqueue_sequence_run_job(
        run_id,
        sequence_id,
        dispatch_sequence_run_job_func=dispatch_sequence_run_job,
        sequence_queue_dispatch_error_type=SequenceQueueDispatchError,
    )


def mark_sequence_run_failed_dispatch(run_id: str, error_text: str) -> None:
    return _sequence_commands.mark_sequence_run_failed_dispatch(
        run_id,
        error_text,
        build_database_url_func=build_database_url,
        connect_func=psycopg.connect,
        dict_row_value=dict_row,
    )


def create_sequence_run_request_for_trigger(
    sequence_id: str,
    *,
    context_json: dict[str, Any],
    trigger_meta: dict[str, Any],
    trigger_type: Literal["manual", "cron", "agent", "api", "event"],
    retry_of_run_id: str | None = None,
) -> dict[str, Any]:
    return _sequence_commands.create_sequence_run_request_for_trigger(
        sequence_id,
        context_json=context_json,
        trigger_meta=trigger_meta,
        trigger_type=trigger_type,
        retry_of_run_id=retry_of_run_id,
        uuid4_func=uuid.uuid4,
        validate_sequence_context_json_func=validate_sequence_context_json,
        validate_trigger_meta_func=validate_trigger_meta,
        dump_json_value_func=dump_json_value,
        build_database_url_func=build_database_url,
        connect_func=psycopg.connect,
        dict_row_value=dict_row,
        enqueue_sequence_run_job_func=enqueue_sequence_run_job,
        mark_sequence_run_failed_dispatch_func=mark_sequence_run_failed_dispatch,
        get_sequence_run_func=get_sequence_run,
    )


def create_sequence_run_request(
    sequence_id: str,
    payload: SequenceManualRunPayload,
) -> dict[str, Any]:
    return _sequence_commands.create_sequence_run_request(
        sequence_id,
        payload,
        create_sequence_run_request_for_trigger_func=create_sequence_run_request_for_trigger,
    )


def retry_sequence_run_request(
    run_id: str,
    payload: SequenceRetryRunPayload,
) -> dict[str, Any]:
    return _sequence_commands.retry_sequence_run_request(
        run_id,
        payload,
        get_sequence_run_func=get_sequence_run,
        sanitize_sequence_retry_context_func=sanitize_sequence_retry_context,
        validate_sequence_context_json_func=validate_sequence_context_json,
        create_sequence_run_request_for_trigger_func=create_sequence_run_request_for_trigger,
    )


def get_active_sequence_for_trigger(trigger_event: str) -> dict[str, Any]:
    return _sequence_commands.get_active_sequence_for_trigger(
        trigger_event,
        query_one_func=query_one,
    )


def ensure_published_signal_candidate_retry_event(*, event_id: str, doc_id: str) -> None:
    return _sequence_commands.ensure_published_signal_candidate_retry_event(
        event_id=event_id,
        doc_id=doc_id,
        dump_json_value_func=dump_json_value,
        build_database_url_func=build_database_url,
        connect_func=psycopg.connect,
        dict_row_value=dict_row,
    )


def request_signal_candidate_enrichment_retry(
    doc_id: str,
    payload: SignalCandidateEnrichmentRetryPayload | None = None,
) -> dict[str, Any]:
    return _sequence_commands.request_signal_candidate_enrichment_retry(
        doc_id,
        payload,
        query_one_func=query_one,
        get_active_sequence_for_trigger_func=get_active_sequence_for_trigger,
        uuid4_func=uuid.uuid4,
        ensure_published_signal_candidate_retry_event_func=ensure_published_signal_candidate_retry_event,
        create_sequence_run_request_for_trigger_func=create_sequence_run_request_for_trigger,
    )


def list_agent_sequence_tools() -> dict[str, Any]:
    return _sequence_commands.list_agent_sequence_tools(
        list_sequence_plugins_func=list_sequence_plugins,
    )


def create_agent_sequence_request(payload: AgentSequenceCreatePayload) -> dict[str, Any]:
    return _sequence_commands.create_agent_sequence_request(
        payload,
        sequence_create_payload_type=SequenceCreatePayload,
        create_sequence_definition_func=create_sequence_definition,
        create_sequence_run_request_for_trigger_func=create_sequence_run_request_for_trigger,
    )


def get_sequence_run(run_id: str) -> dict[str, Any]:
    return _sequence_read_model.get_sequence_run(
        run_id,
        sequence_run_select_sql_func=sequence_run_select_sql,
        query_one_func=query_one,
    )


def cancel_sequence_run_request(run_id: str, reason: str | None = None) -> dict[str, Any]:
    return _sequence_commands.cancel_sequence_run_request(
        run_id,
        reason=reason,
        cancellable_statuses=SEQUENCE_RUN_CANCELLABLE_STATUSES,
        build_database_url_func=build_database_url,
        connect_func=psycopg.connect,
        dict_row_value=dict_row,
        get_sequence_run_func=get_sequence_run,
    )


def list_sequence_task_runs(run_id: str) -> list[dict[str, Any]]:
    return _sequence_read_model.list_sequence_task_runs(
        run_id,
        get_sequence_run_func=get_sequence_run,
        query_all_func=query_all,
    )


def raise_sequence_http_exception(error: Exception) -> None:
    return _sequence_route_compat.raise_sequence_http_exception(globals(), error)


def list_sequences(
    limit: int = 20,
    page: int | None = None,
    page_size: int | None = None,
) -> dict[str, Any] | list[dict[str, Any]]:
    return _sequence_route_compat.list_sequences(
        globals(),
        limit=limit,
        page=page,
        page_size=page_size,
    )


def get_sequence(sequence_id: str) -> dict[str, Any]:
    return _sequence_route_compat.get_sequence(globals(), sequence_id)


def create_sequence(payload: SequenceCreatePayload) -> dict[str, Any]:
    return _sequence_route_compat.create_sequence(globals(), payload)


def update_sequence(
    sequence_id: str,
    payload: SequenceUpdatePayload,
) -> dict[str, Any]:
    return _sequence_route_compat.update_sequence(globals(), sequence_id, payload)


def delete_sequence(sequence_id: str) -> dict[str, Any]:
    return _sequence_route_compat.delete_sequence(globals(), sequence_id)


def get_sequence_plugins() -> list[dict[str, Any]]:
    return _sequence_route_compat.get_sequence_plugins(globals())


def get_agent_sequence_tools() -> dict[str, Any]:
    return _sequence_route_compat.get_agent_sequence_tools(globals())


def create_agent_sequence(payload: AgentSequenceCreatePayload) -> dict[str, Any]:
    return _sequence_route_compat.create_agent_sequence(globals(), payload)


def request_sequence_run(
    sequence_id: str,
    payload: SequenceManualRunPayload,
) -> dict[str, Any]:
    return _sequence_route_compat.request_sequence_run(globals(), sequence_id, payload)


def get_sequence_run_status(run_id: str) -> dict[str, Any]:
    return _sequence_route_compat.get_sequence_run_status(globals(), run_id)


def get_sequence_run_task_runs(run_id: str) -> list[dict[str, Any]]:
    return _sequence_route_compat.get_sequence_run_task_runs(globals(), run_id)


def cancel_sequence_run(
    run_id: str,
    payload: SequenceCancelPayload | None = None,
) -> dict[str, Any]:
    return _sequence_route_compat.cancel_sequence_run(globals(), run_id, payload)


def retry_sequence_run(
    run_id: str,
    payload: SequenceRetryRunPayload | None = None,
) -> dict[str, Any]:
    return _sequence_route_compat.retry_sequence_run(globals(), run_id, payload)


def list_signal_candidates(
    limit: int = Query(default=20, ge=1, le=100),
    entity_type: str | None = Query(default=None, alias="entityType"),
    entity_text: str | None = Query(default=None, alias="entityText"),
    entity_normalized_key: str | None = Query(default=None, alias="entityNormalizedKey"),
    label_type: str | None = Query(default=None, alias="labelType"),
    label_key: str | None = Query(default=None, alias="labelKey"),
    content_filter_passed: bool | None = Query(default=None, alias="contentFilterPassed"),
    content_filter_decision: str | None = Query(default=None, alias="contentFilterDecision"),
    channel_id: str | None = Query(default=None, alias="channelId"),
    final_selection_decision: str | None = Query(default=None, alias="finalSelectionDecision"),
    selection_mode: str | None = Query(default=None, alias="selectionMode"),
    visibility_state: str | None = Query(default=None, alias="visibilityState"),
    q: str | None = Query(default=None),
    page: int | None = Query(default=None, ge=1),
    page_size: int | None = Query(default=None, ge=1, le=100, alias="pageSize"),
) -> dict[str, Any] | list[dict[str, Any]]:
    return _signal_candidate_list_read_model.list_signal_candidates(
        limit=limit,
        entity_type=entity_type,
        entity_text=entity_text,
        entity_normalized_key=entity_normalized_key,
        label_type=label_type,
        label_key=label_key,
        content_filter_passed=content_filter_passed,
        content_filter_decision=content_filter_decision,
        channel_id=channel_id,
        final_selection_decision=final_selection_decision,
        selection_mode=selection_mode,
        visibility_state=visibility_state,
        q=q,
        page=page,
        page_size=page_size,
        build_content_analysis_filter_clause_func=build_content_analysis_filter_clause,
        normalize_content_filter_decision_func=normalize_content_filter_decision,
        signal_candidate_preview_projection_func=signal_candidate_preview_projection,
        signal_candidate_observation_join_clause_func=signal_candidate_observation_join_clause,
        final_selection_join_clause_func=final_selection_join_clause,
        system_feed_join_clause_func=system_feed_join_clause,
        primary_media_join_clause_func=primary_media_join_clause,
        resolve_pagination_func=resolve_pagination,
        query_all_func=query_all,
        query_count_func=query_count,
        build_paginated_response_func=build_paginated_response,
        apply_signal_candidate_selection_payload_func=apply_signal_candidate_selection_payload,
    )


def summarize_signal_candidate_selection_counts() -> dict[str, Any]:
    return _signal_candidate_list_read_model.summarize_signal_candidate_selection_counts(
        query_all_func=query_all,
        query_count_func=query_count,
    )


def load_signal_candidate_residual_rows(
    *,
    q: str | None = None,
    verification_state: str | None = None,
    processing_state: str | None = None,
    observation_state: str | None = None,
    duplicate_kind: str | None = None,
) -> list[dict[str, Any]]:
    return _signal_candidate_residual_read_model.load_signal_candidate_residual_rows(
        q=q,
        verification_state=verification_state,
        processing_state=processing_state,
        observation_state=observation_state,
        duplicate_kind=duplicate_kind,
        normalize_web_content_search_query_func=normalize_web_content_search_query,
        build_web_content_search_pattern_func=build_web_content_search_pattern,
        query_all_func=query_all,
        signal_candidate_preview_projection_func=signal_candidate_preview_projection,
        signal_candidate_observation_join_clause_func=signal_candidate_observation_join_clause,
        final_selection_join_clause_func=final_selection_join_clause,
        system_feed_join_clause_func=system_feed_join_clause,
        primary_media_join_clause_func=primary_media_join_clause,
    )


def build_signal_candidate_residual_payload(signal_candidate_like: Mapping[str, Any]) -> dict[str, Any]:
    return _signal_candidate_residual_read_model.build_signal_candidate_residual_payload(
        signal_candidate_like,
        apply_signal_candidate_selection_payload_func=apply_signal_candidate_selection_payload,
        build_selection_explain_payload_func=build_selection_explain_payload,
        build_selection_diagnostics_payload_from_counts_func=(
            build_selection_diagnostics_payload_from_counts
        ),
    )


def signal_candidate_matches_residual_filters(
    signal_candidate: Mapping[str, Any],
    *,
    downstream_loss_bucket: str | None = None,
    selection_blocker_stage: str | None = None,
    selection_blocker_reason: str | None = None,
    selection_mode: str | None = None,
) -> bool:
    return _signal_candidate_residual_read_model.signal_candidate_matches_residual_filters(
        signal_candidate,
        downstream_loss_bucket=downstream_loss_bucket,
        selection_blocker_stage=selection_blocker_stage,
        selection_blocker_reason=selection_blocker_reason,
        selection_mode=selection_mode,
    )


def summarize_signal_candidate_residual_rows(rows: list[Mapping[str, Any]]) -> dict[str, Any]:
    return _signal_candidate_residual_read_model.summarize_signal_candidate_residual_rows(rows)


def list_signal_candidate_residuals(
    downstream_loss_bucket: str | None = Query(default=None, alias="downstreamLossBucket"),
    selection_blocker_stage: str | None = Query(default=None, alias="selectionBlockerStage"),
    selection_blocker_reason: str | None = Query(default=None, alias="selectionBlockerReason"),
    selection_mode: str | None = Query(default=None, alias="selectionMode"),
    verification_state: str | None = Query(default=None, alias="verificationState"),
    processing_state: str | None = Query(default=None, alias="processingState"),
    observation_state: str | None = Query(default=None, alias="observationState"),
    duplicate_kind: str | None = Query(default=None, alias="duplicateKind"),
    q: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100, alias="pageSize"),
) -> dict[str, Any]:
    return _signal_candidate_residual_read_model.list_signal_candidate_residuals(
        downstream_loss_bucket=downstream_loss_bucket,
        selection_blocker_stage=selection_blocker_stage,
        selection_blocker_reason=selection_blocker_reason,
        selection_mode=selection_mode,
        verification_state=verification_state,
        processing_state=processing_state,
        observation_state=observation_state,
        duplicate_kind=duplicate_kind,
        q=q,
        page=page,
        page_size=page_size,
        normalize_optional_query_string_func=normalize_optional_query_string,
        normalize_web_content_search_query_func=normalize_web_content_search_query,
        load_signal_candidate_residual_rows_func=load_signal_candidate_residual_rows,
        build_signal_candidate_residual_payload_func=build_signal_candidate_residual_payload,
        signal_candidate_matches_residual_filters_func=signal_candidate_matches_residual_filters,
        build_paginated_response_func=build_paginated_response,
    )


def summarize_signal_candidate_residuals(
    downstream_loss_bucket: str | None = Query(default=None, alias="downstreamLossBucket"),
    selection_blocker_stage: str | None = Query(default=None, alias="selectionBlockerStage"),
    selection_blocker_reason: str | None = Query(default=None, alias="selectionBlockerReason"),
    selection_mode: str | None = Query(default=None, alias="selectionMode"),
    verification_state: str | None = Query(default=None, alias="verificationState"),
    processing_state: str | None = Query(default=None, alias="processingState"),
    observation_state: str | None = Query(default=None, alias="observationState"),
    duplicate_kind: str | None = Query(default=None, alias="duplicateKind"),
    q: str | None = Query(default=None),
) -> dict[str, Any]:
    return _signal_candidate_residual_read_model.summarize_signal_candidate_residuals(
        downstream_loss_bucket=downstream_loss_bucket,
        selection_blocker_stage=selection_blocker_stage,
        selection_blocker_reason=selection_blocker_reason,
        selection_mode=selection_mode,
        verification_state=verification_state,
        processing_state=processing_state,
        observation_state=observation_state,
        duplicate_kind=duplicate_kind,
        q=q,
        normalize_optional_query_string_func=normalize_optional_query_string,
        normalize_web_content_search_query_func=normalize_web_content_search_query,
        load_signal_candidate_residual_rows_func=load_signal_candidate_residual_rows,
        build_signal_candidate_residual_payload_func=build_signal_candidate_residual_payload,
        signal_candidate_matches_residual_filters_func=signal_candidate_matches_residual_filters,
        summarize_signal_candidate_residual_rows_func=summarize_signal_candidate_residual_rows,
    )


def list_system_selected_content_items_page(
    *,
    page: int = 1,
    page_size: int = 20,
    sort: str | None = None,
    q: str | None = None,
    channel_id: str | None = None,
) -> dict[str, Any]:
    return _content_item_list_read_model.list_system_selected_content_items_page(
        page=page,
        page_size=page_size,
        sort=sort,
        q=q,
        channel_id=channel_id,
        normalize_web_content_list_sort_func=normalize_web_content_list_sort,
        normalize_web_content_search_query_func=normalize_web_content_search_query,
        combined_content_items_select_sql_func=combined_content_items_select_sql,
        build_web_content_search_clause_func=lambda query: build_web_content_search_clause(
            query, alias="content_items"
        ),
        build_web_content_order_clause_func=lambda resolved_sort: build_web_content_order_clause(
            resolved_sort, alias="content_items"
        ),
        query_count_func=query_count,
        query_all_func=query_all,
        strip_web_content_internal_fields_func=strip_web_content_internal_fields,
        build_paginated_response_func=build_paginated_response,
    )


def list_system_selected_content_items(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100, alias="pageSize"),
    sort: str | None = Query(default=None),
    q: str | None = Query(default=None),
    channel_id: str | None = Query(default=None, alias="channelId"),
) -> dict[str, Any]:
    return list_system_selected_content_items_page(
        page=page,
        page_size=page_size,
        sort=sort,
        q=q,
        channel_id=channel_id,
    )


def list_content_items(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100, alias="pageSize"),
    sort: str | None = Query(default=None),
    q: str | None = Query(default=None),
    channel_id: str | None = Query(default=None, alias="channelId"),
) -> dict[str, Any]:
    return list_system_selected_content_items_page(
        page=page,
        page_size=page_size,
        sort=sort,
        q=q,
        channel_id=channel_id,
    )


def get_resource_content_item(resource_id: str) -> dict[str, Any]:
    try:
        return _content_detail_read_model.get_resource_content_item(
            resource_id,
            query_one_func=query_one,
            system_interest_kind_enabled_clause_func=system_interest_kind_enabled_clause,
            load_content_analysis_summary_func=load_content_analysis_summary,
        )
    except _content_detail_read_model.ContentItemNotFoundError:
        raise HTTPException(status_code=404, detail="Content item not found.")


def get_content_item(content_item_id: str) -> dict[str, Any]:
    return _content_detail_read_model.get_content_item(
        content_item_id,
        parse_content_item_id_func=parse_content_item_id,
        get_signal_candidate_func=get_signal_candidate,
        get_selected_content_item_preview_func=get_selected_content_item_preview,
        build_editorial_content_item_preview_from_signal_candidate_func=(
            build_editorial_content_item_preview_from_signal_candidate
        ),
        get_resource_content_item_func=get_resource_content_item,
        load_content_analysis_summary_func=load_content_analysis_summary,
        http_exception_type=HTTPException,
    )


def get_content_item_explain(content_item_id: str) -> dict[str, Any]:
    return _content_detail_read_model.get_content_item_explain(
        content_item_id,
        parse_content_item_id_func=parse_content_item_id,
        get_content_item_func=get_content_item,
        query_one_func=query_one,
        query_all_func=query_all,
        build_selection_explain_payload_func=build_selection_explain_payload,
        build_content_kind_selection_explain_payload_func=(
            build_content_kind_selection_explain_payload
        ),
        build_selection_diagnostics_payload_func=build_selection_diagnostics_payload,
        build_selection_guidance_payload_func=build_selection_guidance_payload,
    )


def list_web_resources_page(
    *,
    limit: int = 20,
    page: int | None = None,
    page_size: int | None = None,
    channel_id: str | None = None,
    extraction_state: str | None = None,
    projection: str = "all",
    resource_kind: str | None = None,
    entity_type: str | None = None,
    entity_text: str | None = None,
    entity_normalized_key: str | None = None,
    label_type: str | None = None,
    label_key: str | None = None,
    content_filter_passed: bool | None = None,
    content_filter_decision: str | None = None,
) -> dict[str, Any] | list[dict[str, Any]]:
    try:
        return _web_resource_read_model.list_web_resources_page(
            limit=limit,
            page=page,
            page_size=page_size,
            channel_id=channel_id,
            extraction_state=extraction_state,
            projection=projection,
            resource_kind=resource_kind,
            entity_type=entity_type,
            entity_text=entity_text,
            entity_normalized_key=entity_normalized_key,
            label_type=label_type,
            label_key=label_key,
            content_filter_passed=content_filter_passed,
            content_filter_decision=content_filter_decision,
            resolve_pagination_func=resolve_pagination,
            query_all_func=query_all,
            query_count_func=query_count,
            build_paginated_response_func=build_paginated_response,
            build_content_analysis_filter_clause_func=build_content_analysis_filter_clause,
            normalize_content_filter_decision_func=normalize_content_filter_decision,
            apply_resource_selection_payload_func=apply_resource_selection_payload,
        )
    except _web_resource_read_model.UnsupportedWebResourceExtractionStateError:
        raise HTTPException(status_code=422, detail="Unsupported web resource extractionState.")
    except _web_resource_read_model.UnsupportedWebResourceProjectionError:
        raise HTTPException(status_code=422, detail="Unsupported web resource projection filter.")
    except _web_resource_read_model.UnsupportedWebResourceKindError:
        raise HTTPException(status_code=422, detail="Unsupported web resource resourceKind.")


def list_web_resources(
    limit: int = Query(default=20, ge=1, le=200),
    channel_id: str | None = Query(default=None, alias="channelId"),
    extraction_state: str | None = Query(default=None, alias="extractionState"),
    projection: str = Query(default="all"),
    resource_kind: str | None = Query(default=None, alias="resourceKind"),
    entity_type: str | None = Query(default=None, alias="entityType"),
    entity_text: str | None = Query(default=None, alias="entityText"),
    entity_normalized_key: str | None = Query(default=None, alias="entityNormalizedKey"),
    label_type: str | None = Query(default=None, alias="labelType"),
    label_key: str | None = Query(default=None, alias="labelKey"),
    content_filter_passed: bool | None = Query(default=None, alias="contentFilterPassed"),
    content_filter_decision: str | None = Query(default=None, alias="contentFilterDecision"),
    page: int | None = Query(default=None, ge=1),
    page_size: int | None = Query(default=None, ge=1, le=200, alias="pageSize"),
) -> dict[str, Any] | list[dict[str, Any]]:
    return list_web_resources_page(
        limit=limit,
        page=page,
        page_size=page_size,
        channel_id=channel_id,
        extraction_state=extraction_state,
        projection=projection,
        resource_kind=resource_kind,
        entity_type=entity_type,
        entity_text=entity_text,
        entity_normalized_key=entity_normalized_key,
        label_type=label_type,
        label_key=label_key,
        content_filter_passed=content_filter_passed,
        content_filter_decision=content_filter_decision,
    )


def get_web_resource(resource_id: str) -> dict[str, Any]:
    try:
        return _web_resource_read_model.get_web_resource(
            resource_id,
            query_one_func=query_one,
            query_all_func=query_all,
            apply_resource_selection_payload_func=apply_resource_selection_payload,
            load_content_analysis_summary_func=load_content_analysis_summary,
        )
    except _web_resource_read_model.WebResourceNotFoundError:
        raise HTTPException(status_code=404, detail="Web resource not found.")


def get_signal_candidate(doc_id: str) -> dict[str, Any]:
    try:
        return _content_detail_read_model.get_signal_candidate(
            doc_id,
            query_one_func=query_one,
            query_all_func=query_all,
            apply_signal_candidate_selection_payload_func=apply_signal_candidate_selection_payload,
            load_content_analysis_summary_func=load_content_analysis_summary,
        )
    except _content_detail_read_model.SignalCandidateNotFoundError:
        raise HTTPException(status_code=404, detail="SignalCandidate not found.")


def get_signal_candidate_explain(doc_id: str) -> dict[str, Any]:
    return _content_detail_read_model.get_signal_candidate_explain(
        doc_id,
        get_signal_candidate_func=get_signal_candidate,
        query_one_func=query_one,
        query_all_func=query_all,
        build_selection_explain_payload_func=build_selection_explain_payload,
        build_selection_diagnostics_payload_func=build_selection_diagnostics_payload,
        build_selection_guidance_payload_func=build_selection_guidance_payload,
    )


def get_dashboard_summary() -> dict[str, Any]:
    return _dashboard_read_model.get_dashboard_summary(
        canonical_signal_candidate_family_expr_func=canonical_signal_candidate_family_expr,
        final_selection_join_clause_func=final_selection_join_clause,
        system_feed_join_clause_func=system_feed_join_clause,
        feed_eligible_signal_candidate_clause_func=feed_eligible_signal_candidate_clause,
        processed_signal_candidate_clause_func=processed_signal_candidate_clause,
        query_one_func=query_one,
        get_llm_budget_summary_func=get_llm_budget_summary,
    )


def get_llm_budget_summary() -> dict[str, Any]:
    return _llm_review_read_model.get_llm_budget_summary(query_one_func=query_one)


def list_channels(
    provider_type: str | None = Query(default=None, alias="providerType"),
    page: int | None = Query(default=None, ge=1),
    page_size: int | None = Query(default=None, ge=1, le=100, alias="pageSize"),
) -> dict[str, Any] | list[dict[str, Any]]:
    return _channel_read_model.list_channels(
        provider_type=provider_type,
        page=page,
        page_size=page_size,
        resolve_pagination_func=resolve_pagination,
        query_all_func=query_all,
        query_count_func=query_count,
        build_paginated_response_func=build_paginated_response,
        with_resolved_channel_adapter_fields_func=with_resolved_channel_adapter_fields,
    )


def get_channel(channel_id: str) -> dict[str, Any]:
    try:
        return _channel_read_model.get_channel(
            channel_id,
            query_one_func=query_one,
            with_resolved_channel_adapter_fields_func=with_resolved_channel_adapter_fields,
        )
    except _channel_read_model.ChannelNotFoundError:
        raise HTTPException(status_code=404, detail="Channel not found.")


def list_clusters(
    limit: int = Query(default=20, ge=1, le=100),
    page: int | None = Query(default=None, ge=1),
    page_size: int | None = Query(default=None, ge=1, le=100, alias="pageSize"),
) -> dict[str, Any] | list[dict[str, Any]]:
    return _cluster_read_model.list_clusters(
        limit=limit,
        page=page,
        page_size=page_size,
        resolve_pagination_func=resolve_pagination,
        query_all_func=query_all,
        query_count_func=query_count,
        build_paginated_response_func=build_paginated_response,
    )


def list_user_interests(
    user_id: str,
    page: int | None = Query(default=None, ge=1),
    page_size: int | None = Query(default=None, ge=1, le=100, alias="pageSize"),
) -> dict[str, Any] | list[dict[str, Any]]:
    return _user_interest_read_model.list_user_interests(
        user_id=user_id,
        page=page,
        page_size=page_size,
        resolve_pagination_func=resolve_pagination,
        query_all_func=query_all,
        query_count_func=query_count,
        build_paginated_response_func=build_paginated_response,
    )


def list_user_matches(
    user_id: str,
    limit: int = Query(default=20, ge=1, le=100),
    page: int | None = Query(default=None, ge=1),
    page_size: int | None = Query(default=None, ge=1, le=100, alias="pageSize"),
    sort: str | None = Query(default=None),
    q: str | None = Query(default=None),
) -> dict[str, Any] | list[dict[str, Any]]:
    return _user_match_read_model.list_user_matches(
        user_id=user_id,
        limit=limit,
        page=page,
        page_size=page_size,
        sort=sort,
        q=q,
        resolve_pagination_func=resolve_pagination,
        query_all_func=query_all,
        query_count_func=query_count,
        build_paginated_response_func=build_paginated_response,
    )


def list_user_notifications(
    user_id: str,
    limit: int = Query(default=20, ge=1, le=100),
    page: int | None = Query(default=None, ge=1),
    page_size: int | None = Query(default=None, ge=1, le=100, alias="pageSize"),
) -> dict[str, Any] | list[dict[str, Any]]:
    return _notification_read_model.list_user_notifications(
        user_id=user_id,
        limit=limit,
        page=page,
        page_size=page_size,
        resolve_pagination_func=resolve_pagination,
        query_all_func=query_all,
        query_count_func=query_count,
        build_paginated_response_func=build_paginated_response,
    )


def list_llm_templates(
    page: int | None = Query(default=None, ge=1),
    page_size: int | None = Query(default=None, ge=1, le=100, alias="pageSize"),
) -> dict[str, Any] | list[dict[str, Any]]:
    return _llm_review_read_model.list_llm_templates(
        page=page,
        page_size=page_size,
        query_all_func=query_all,
        query_count_func=query_count,
    )


def get_llm_template(prompt_template_id: str) -> dict[str, Any]:
    try:
        return _llm_review_read_model.get_llm_template(
            prompt_template_id,
            query_one_func=query_one,
        )
    except _llm_review_read_model.LlmTemplateNotFoundError:
        raise HTTPException(status_code=404, detail="LLM template not found.")


def list_system_interests(
    page: int | None = Query(default=None, ge=1),
    page_size: int | None = Query(default=None, ge=1, le=100, alias="pageSize"),
) -> dict[str, Any] | list[dict[str, Any]]:
    return _system_interest_read_model.list_system_interests(
        page=page,
        page_size=page_size,
        resolve_pagination_func=resolve_pagination,
        query_all_func=query_all,
        query_count_func=query_count,
        build_paginated_response_func=build_paginated_response,
        normalize_payload_func=normalize_system_interest_selection_profile_payload,
    )


def get_system_interest(interest_template_id: str) -> dict[str, Any]:
    try:
        return _system_interest_read_model.get_system_interest(
            interest_template_id,
            query_one_func=query_one,
            normalize_payload_func=normalize_system_interest_selection_profile_payload,
        )
    except _system_interest_read_model.SystemInterestNotFoundError:
        raise HTTPException(status_code=404, detail="System interest not found.")


def list_reindex_jobs(
    limit: int = Query(default=20, ge=1, le=100),
    page: int | None = Query(default=None, ge=1),
    page_size: int | None = Query(default=None, ge=1, le=100, alias="pageSize"),
) -> dict[str, Any] | list[dict[str, Any]]:
    return _reindex_read_model.list_reindex_jobs(
        limit=limit,
        page=page,
        page_size=page_size,
        resolve_pagination_func=resolve_pagination,
        query_all_func=query_all,
        query_count_func=query_count,
        build_paginated_response_func=build_paginated_response,
        apply_payload_func=apply_reindex_selection_profile_payload,
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

def request_signal_candidate_enrichment_retry_route(
    doc_id: str,
    payload: SignalCandidateEnrichmentRetryPayload | None = None,
) -> dict[str, Any]:
    return _sequence_route_compat.request_signal_candidate_enrichment_retry_route(
        globals(),
        doc_id,
        payload,
    )


def request_content_item_enrichment_retry_route(
    content_item_id: str,
    payload: SignalCandidateEnrichmentRetryPayload | None = None,
) -> dict[str, Any]:
    return _sequence_route_compat.request_content_item_enrichment_retry_route(
        globals(),
        content_item_id,
        payload,
    )


app = create_api_app(ApiAppContext(route_deps=build_route_deps(globals())))

from __future__ import annotations

import os
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
from services.api.app import article_list_read_model as _article_list_read_model
from services.api.app import article_residual_read_model as _article_residual_read_model
from services.api.app import content_analysis_backfill as _content_analysis_backfill
from services.api.app import content_analysis_payloads as _content_analysis_payloads
from services.api.app import content_analysis_policies as _content_analysis_policies
from services.api.app import content_analysis_read_model as _content_analysis_read_model
from services.api.app import content_detail_read_model as _content_detail_read_model
from services.api.app import content_item_list_read_model as _content_item_list_read_model
from services.api.app import content_query as _content_query
from services.api.app import dashboard_read_model as _dashboard_read_model
from services.api.app import discovery_candidates as _discovery_candidates
from services.api.app import discovery_classes as _discovery_classes
from services.api.app import discovery_feedback as _discovery_feedback
from services.api.app import discovery_missions as _discovery_missions
from services.api.app import discovery_payloads as _discovery_payloads
from services.api.app import discovery_policy_profiles as _discovery_policy_profiles
from services.api.app import discovery_policy_snapshots as _discovery_policy_snapshots
from services.api.app import discovery_read_model as _discovery_read_model
from services.api.app import discovery_re_evaluation as _discovery_re_evaluation
from services.api.app import discovery_recall_missions as _discovery_recall_missions
from services.api.app import discovery_selects as _discovery_selects
from services.api.app import json_read_model as _json_read_model
from services.api.app import llm_review_read_model as _llm_review_read_model
from services.api.app import notification_read_model as _notification_read_model
from services.api.app import reindex_read_model as _reindex_read_model
from services.api.app import sequence_commands as _sequence_commands
from services.api.app import sequence_payloads as _sequence_payloads
from services.api.app import sequence_read_model as _sequence_read_model
from services.api.app import system_interest_read_model as _system_interest_read_model
from services.api.app import user_interest_read_model as _user_interest_read_model
from services.api.app import user_match_read_model as _user_match_read_model
from services.api.app import web_resource_read_model as _web_resource_read_model
from services.api.app.content_selection_read_model import (
    apply_article_selection_payload,
    apply_resource_selection_payload,
    article_observation_join_clause,
    article_preview_projection,
    build_content_item_id,
    build_content_kind_selection_explain_payload,
    build_editorial_content_item_preview_from_article,
    build_fallback_selection_blocker_payload,
    build_resource_selection_explain_payload,
    build_selection_diagnostics_payload,
    build_selection_diagnostics_payload_from_counts,
    build_selection_explain_payload,
    build_selection_guidance_payload,
    canonical_article_family_expr,
    canonical_article_family_order_clause,
    combined_content_items_select_sql,
    editorial_content_select_sql,
    feed_eligible_article_clause,
    final_selection_join_clause,
    get_selected_content_item_preview,
    normalize_system_interest_selection_profile_payload,
    parse_content_item_id,
    primary_media_join_clause,
    processed_article_clause,
    query_count as _content_selection_query_count,
    resource_content_select_sql,
    system_feed_join_clause,
    system_interest_kind_enabled_clause,
)
from services.api.app.pagination import build_paginated_response, resolve_pagination
from services.api.app import discovery_error_mapping as _discovery_error_mapping
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
    DISCOVERY_CANDIDATE_STATUSES,
    DISCOVERY_CLASS_STATUSES,
    DISCOVERY_HYPOTHESIS_STATUSES,
    DISCOVERY_MISSION_STATUSES,
    DISCOVERY_PROFILE_STATUSES,
    DISCOVERY_PROVIDER_TYPES,
    DISCOVERY_RECALL_CANDIDATE_STATUSES,
    DISCOVERY_RECALL_MISSION_KINDS,
    DISCOVERY_RECALL_MISSION_STATUSES,
    SEQUENCE_RUN_CANCELLABLE_STATUSES,
)
from services.api.app.discovery_worker_boundary import (
    DISCOVERY_ORCHESTRATOR_SEQUENCE_ID,
    DiscoveryCoordinatorRepository,
    PostgresSourceRegistrarAdapter,
    acquire_recall_missions,
    canonical_domain,
    compile_interest_graph_for_mission,
    configure_api_discovery_runtime,
    coerce_discovery_cost_usd,
    discovery_cost_usd_to_cents,
    discovery_month_start_utc,
    load_discovery_settings,
    re_evaluate_sources,
)
from services.api.app.sequence_worker_boundary import (
    RESERVED_CONTEXT_KEYS,
    parse_cron_expression,
    dispatch_sequence_run_job,
    SequenceQueueDispatchError,
    TASK_REGISTRY,
)


discovery_mission_select_sql = _discovery_selects.discovery_mission_select_sql
discovery_recall_mission_select_sql = _discovery_selects.discovery_recall_mission_select_sql
discovery_policy_profile_select_sql = _discovery_selects.discovery_policy_profile_select_sql
discovery_class_select_sql = _discovery_selects.discovery_class_select_sql
discovery_candidate_select_sql = _discovery_selects.discovery_candidate_select_sql
discovery_recall_candidate_select_sql = _discovery_selects.discovery_recall_candidate_select_sql
discovery_hypothesis_select_sql = _discovery_selects.discovery_hypothesis_select_sql
discovery_source_profile_select_sql = _discovery_selects.discovery_source_profile_select_sql
discovery_source_quality_snapshot_select_sql = (
    _discovery_selects.discovery_source_quality_snapshot_select_sql
)
discovery_source_interest_score_select_sql = (
    _discovery_selects.discovery_source_interest_score_select_sql
)
discovery_feedback_select_sql = _discovery_selects.discovery_feedback_select_sql

API_MAIN_COMPAT_EXPORTS = (
    build_content_item_id,
    build_fallback_selection_blocker_payload,
    build_resource_selection_explain_payload,
    canonical_article_family_order_clause,
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
_normalize_string_list = _discovery_payloads.normalize_string_list
_normalize_optional_text = _discovery_payloads.normalize_optional_text
_normalize_optional_float = _discovery_payloads.normalize_optional_float
_normalize_optional_positive_int = _discovery_payloads.normalize_optional_positive_int
_normalize_discovery_diversity_caps = _discovery_payloads.normalize_discovery_diversity_caps
normalize_discovery_graph_policy = _discovery_payloads.normalize_discovery_graph_policy
normalize_discovery_recall_policy = _discovery_payloads.normalize_discovery_recall_policy
normalize_discovery_yield_benchmark = _discovery_payloads.normalize_discovery_yield_benchmark
build_discovery_profile_payload = _discovery_payloads.build_discovery_profile_payload
parse_discovery_profile_json = _discovery_payloads.parse_discovery_profile_json


def normalize_optional_query_bool(value: Any) -> bool | None:
    if value is None or is_fastapi_param_default(value):
        return None
    return bool(value)


def query_count(sql: str, params: tuple[Any, ...] = ()) -> int:
    return _content_selection_query_count(sql, params, query_one_func=query_one)


configure_api_discovery_runtime()


def resolve_discovery_canonical_domain(url: str | None) -> str:
    try:
        return _discovery_candidates.resolve_discovery_canonical_domain(
            url,
            canonical_domain_func=canonical_domain,
        )
    except _discovery_candidates.DiscoveryCandidateValidation as error:
        raise SequenceValidationError(error.errors) from error


SequenceValidationError = _sequence_read_model.SequenceValidationError
SequenceNotFoundError = _sequence_read_model.SequenceNotFoundError
SequenceConflictError = _sequence_read_model.SequenceConflictError


_raise_discovery_read_model_not_found = (
    _discovery_error_mapping.raise_discovery_read_model_not_found
)
_raise_content_analysis_policy_write_error = (
    _discovery_error_mapping.raise_content_analysis_policy_write_error
)
_raise_discovery_policy_profile_error = (
    _discovery_error_mapping.raise_discovery_policy_profile_error
)
_raise_discovery_class_error = _discovery_error_mapping.raise_discovery_class_error
_raise_discovery_candidate_error = _discovery_error_mapping.raise_discovery_candidate_error
_raise_discovery_feedback_error = _discovery_error_mapping.raise_discovery_feedback_error
_raise_discovery_mission_error = _discovery_error_mapping.raise_discovery_mission_error
_raise_discovery_recall_mission_error = (
    _discovery_error_mapping.raise_discovery_recall_mission_error
)


SequenceDispatchError = _sequence_read_model.SequenceDispatchError
SequenceCreatePayload = _sequence_payloads.SequenceCreatePayload
SequenceUpdatePayload = _sequence_payloads.SequenceUpdatePayload
SequenceManualRunPayload = _sequence_payloads.SequenceManualRunPayload
SequenceRetryRunPayload = _sequence_payloads.SequenceRetryRunPayload
AgentSequenceCreatePayload = _sequence_payloads.AgentSequenceCreatePayload
SequenceCancelPayload = _sequence_payloads.SequenceCancelPayload
ArticleEnrichmentRetryPayload = _sequence_payloads.ArticleEnrichmentRetryPayload

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
DiscoveryMissionCreatePayload = _discovery_payloads.DiscoveryMissionCreatePayload
DiscoveryMissionUpdatePayload = _discovery_payloads.DiscoveryMissionUpdatePayload
DiscoveryMissionRunPayload = _discovery_payloads.DiscoveryMissionRunPayload
DiscoveryRecallMissionCreatePayload = _discovery_payloads.DiscoveryRecallMissionCreatePayload
DiscoveryRecallMissionUpdatePayload = _discovery_payloads.DiscoveryRecallMissionUpdatePayload
DiscoveryPolicyProfileCreatePayload = _discovery_payloads.DiscoveryPolicyProfileCreatePayload
DiscoveryPolicyProfileUpdatePayload = _discovery_payloads.DiscoveryPolicyProfileUpdatePayload
DiscoveryRecallCandidateCreatePayload = _discovery_payloads.DiscoveryRecallCandidateCreatePayload
DiscoveryRecallCandidateUpdatePayload = _discovery_payloads.DiscoveryRecallCandidateUpdatePayload
DiscoveryRecallCandidatePromotePayload = _discovery_payloads.DiscoveryRecallCandidatePromotePayload
DiscoveryHypothesisClassCreatePayload = _discovery_payloads.DiscoveryHypothesisClassCreatePayload
DiscoveryHypothesisClassUpdatePayload = _discovery_payloads.DiscoveryHypothesisClassUpdatePayload
DiscoveryCandidateUpdatePayload = _discovery_payloads.DiscoveryCandidateUpdatePayload
DiscoveryFeedbackCreatePayload = _discovery_payloads.DiscoveryFeedbackCreatePayload
DiscoveryReEvaluatePayload = _discovery_payloads.DiscoveryReEvaluatePayload


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


def ensure_published_article_retry_event(*, event_id: str, doc_id: str) -> None:
    return _sequence_commands.ensure_published_article_retry_event(
        event_id=event_id,
        doc_id=doc_id,
        dump_json_value_func=dump_json_value,
        build_database_url_func=build_database_url,
        connect_func=psycopg.connect,
        dict_row_value=dict_row,
    )


def request_article_enrichment_retry(
    doc_id: str,
    payload: ArticleEnrichmentRetryPayload | None = None,
) -> dict[str, Any]:
    return _sequence_commands.request_article_enrichment_retry(
        doc_id,
        payload,
        query_one_func=query_one,
        get_active_sequence_for_trigger_func=get_active_sequence_for_trigger,
        uuid4_func=uuid.uuid4,
        ensure_published_article_retry_event_func=ensure_published_article_retry_event,
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
    if isinstance(error, SequenceNotFoundError):
        raise HTTPException(status_code=404, detail=str(error)) from error
    if isinstance(error, SequenceConflictError):
        raise HTTPException(status_code=409, detail=str(error)) from error
    if isinstance(error, SequenceValidationError):
        raise HTTPException(status_code=422, detail=error.errors) from error
    if isinstance(error, SequenceDispatchError):
        raise HTTPException(status_code=503, detail=str(error)) from error
    raise error


def list_sequences(
    limit: int = 20,
    page: int | None = None,
    page_size: int | None = None,
) -> dict[str, Any] | list[dict[str, Any]]:
    return list_sequences_page(limit=limit, page=page, page_size=page_size)


def get_sequence(sequence_id: str) -> dict[str, Any]:
    try:
        return get_sequence_definition(sequence_id)
    except SequenceNotFoundError as error:
        raise_sequence_http_exception(error)


def create_sequence(payload: SequenceCreatePayload) -> dict[str, Any]:
    try:
        return create_sequence_definition(payload)
    except (
        SequenceConflictError,
        SequenceValidationError,
    ) as error:
        raise_sequence_http_exception(error)


def update_sequence(
    sequence_id: str,
    payload: SequenceUpdatePayload,
) -> dict[str, Any]:
    try:
        return update_sequence_definition(sequence_id, payload)
    except (
        SequenceConflictError,
        SequenceNotFoundError,
        SequenceValidationError,
    ) as error:
        raise_sequence_http_exception(error)


def delete_sequence(sequence_id: str) -> dict[str, Any]:
    try:
        return archive_sequence_definition(sequence_id)
    except SequenceNotFoundError as error:
        raise_sequence_http_exception(error)


def get_sequence_plugins() -> list[dict[str, Any]]:
    return list_sequence_plugins()


def get_agent_sequence_tools() -> dict[str, Any]:
    return list_agent_sequence_tools()


def create_agent_sequence(payload: AgentSequenceCreatePayload) -> dict[str, Any]:
    try:
        return create_agent_sequence_request(payload)
    except (
        SequenceConflictError,
        SequenceDispatchError,
        SequenceNotFoundError,
        SequenceValidationError,
    ) as error:
        raise_sequence_http_exception(error)


def request_sequence_run(
    sequence_id: str,
    payload: SequenceManualRunPayload,
) -> dict[str, Any]:
    try:
        return create_sequence_run_request(sequence_id, payload)
    except (
        SequenceConflictError,
        SequenceDispatchError,
        SequenceNotFoundError,
        SequenceValidationError,
    ) as error:
        raise_sequence_http_exception(error)


def get_sequence_run_status(run_id: str) -> dict[str, Any]:
    try:
        return get_sequence_run(run_id)
    except SequenceNotFoundError as error:
        raise_sequence_http_exception(error)


def get_sequence_run_task_runs(run_id: str) -> list[dict[str, Any]]:
    try:
        return list_sequence_task_runs(run_id)
    except SequenceNotFoundError as error:
        raise_sequence_http_exception(error)


def cancel_sequence_run(
    run_id: str,
    payload: SequenceCancelPayload | None = None,
) -> dict[str, Any]:
    try:
        return cancel_sequence_run_request(
            run_id,
            reason=payload.reason if payload is not None else None,
        )
    except (
        SequenceConflictError,
        SequenceNotFoundError,
    ) as error:
        raise_sequence_http_exception(error)


def retry_sequence_run(
    run_id: str,
    payload: SequenceRetryRunPayload | None = None,
) -> dict[str, Any]:
    try:
        return retry_sequence_run_request(
            run_id,
            payload or SequenceRetryRunPayload(),
        )
    except (
        SequenceConflictError,
        SequenceDispatchError,
        SequenceNotFoundError,
        SequenceValidationError,
    ) as error:
        raise_sequence_http_exception(error)


def list_discovery_missions_page(
    *,
    limit: int,
    page: int | None,
    page_size: int | None,
    status: str | None,
) -> dict[str, Any] | list[dict[str, Any]]:
    return _discovery_read_model.list_discovery_missions_page(
        limit=limit,
        page=page,
        page_size=page_size,
        status=status,
        query_all_func=query_all,
        query_count_func=query_count,
    )


def get_discovery_mission(mission_id: str) -> dict[str, Any]:
    try:
        return _discovery_read_model.get_discovery_mission(
            mission_id,
            query_one_func=query_one,
        )
    except _discovery_read_model.DiscoveryReadModelNotFound as error:
        _raise_discovery_read_model_not_found(error)


def list_discovery_recall_missions_page(
    *,
    limit: int,
    page: int | None,
    page_size: int | None,
    status: str | None,
    mission_kind: str | None,
) -> dict[str, Any] | list[dict[str, Any]]:
    return _discovery_read_model.list_discovery_recall_missions_page(
        limit=limit,
        page=page,
        page_size=page_size,
        status=status,
        mission_kind=mission_kind,
        query_all_func=query_all,
        query_count_func=query_count,
    )


def get_discovery_recall_mission(recall_mission_id: str) -> dict[str, Any]:
    try:
        return _discovery_read_model.get_discovery_recall_mission(
            recall_mission_id,
            query_one_func=query_one,
        )
    except _discovery_read_model.DiscoveryReadModelNotFound as error:
        _raise_discovery_read_model_not_found(error)


def list_discovery_policy_profiles_page(
    *,
    limit: int,
    page: int | None,
    page_size: int | None,
    status: str | None,
) -> dict[str, Any] | list[dict[str, Any]]:
    return _discovery_read_model.list_discovery_policy_profiles_page(
        limit=limit,
        page=page,
        page_size=page_size,
        status=status,
        query_all_func=query_all,
        query_count_func=query_count,
    )


def get_discovery_policy_profile(profile_id: str) -> dict[str, Any]:
    try:
        return _discovery_read_model.get_discovery_policy_profile(
            profile_id,
            query_one_func=query_one,
        )
    except _discovery_read_model.DiscoveryReadModelNotFound as error:
        _raise_discovery_read_model_not_found(error)


def require_attachable_discovery_policy_profile(profile_id: str) -> dict[str, Any]:
    try:
        return _discovery_policy_profiles.require_attachable_discovery_policy_profile(
            profile_id,
            get_discovery_policy_profile_func=get_discovery_policy_profile,
        )
    except (
        _discovery_policy_profiles.DiscoveryPolicyProfileConflict,
        _discovery_policy_profiles.DiscoveryPolicyProfileNotFound,
        _discovery_policy_profiles.DiscoveryPolicyProfileValidation,
    ) as error:
        _raise_discovery_policy_profile_error(error)


def create_discovery_policy_profile(
    payload: DiscoveryPolicyProfileCreatePayload,
) -> dict[str, Any]:
    try:
        return _discovery_policy_profiles.create_discovery_policy_profile(
            payload,
            build_discovery_profile_payload_func=build_discovery_profile_payload,
            get_discovery_policy_profile_func=get_discovery_policy_profile,
            build_database_url_func=build_database_url,
            connect_func=psycopg.connect,
            dict_row_value=dict_row,
        )
    except (
        _discovery_policy_profiles.DiscoveryPolicyProfileConflict,
        _discovery_policy_profiles.DiscoveryPolicyProfileNotFound,
        _discovery_policy_profiles.DiscoveryPolicyProfileValidation,
    ) as error:
        _raise_discovery_policy_profile_error(error)


def update_discovery_policy_profile(
    profile_id: str,
    payload: DiscoveryPolicyProfileUpdatePayload,
) -> dict[str, Any]:
    try:
        return _discovery_policy_profiles.update_discovery_policy_profile(
            profile_id,
            payload,
            get_discovery_policy_profile_func=get_discovery_policy_profile,
            parse_discovery_profile_json_func=parse_discovery_profile_json,
            normalize_discovery_graph_policy_func=normalize_discovery_graph_policy,
            normalize_discovery_recall_policy_func=normalize_discovery_recall_policy,
            normalize_discovery_yield_benchmark_func=normalize_discovery_yield_benchmark,
            build_database_url_func=build_database_url,
            connect_func=psycopg.connect,
            dict_row_value=dict_row,
        )
    except (
        _discovery_policy_profiles.DiscoveryPolicyProfileConflict,
        _discovery_policy_profiles.DiscoveryPolicyProfileNotFound,
        _discovery_policy_profiles.DiscoveryPolicyProfileValidation,
    ) as error:
        _raise_discovery_policy_profile_error(error)


def delete_discovery_policy_profile(profile_id: str) -> dict[str, Any]:
    try:
        return _discovery_policy_profiles.delete_discovery_policy_profile(
            profile_id,
            get_discovery_policy_profile_func=get_discovery_policy_profile,
            build_database_url_func=build_database_url,
            connect_func=psycopg.connect,
            dict_row_value=dict_row,
        )
    except (
        _discovery_policy_profiles.DiscoveryPolicyProfileConflict,
        _discovery_policy_profiles.DiscoveryPolicyProfileNotFound,
        _discovery_policy_profiles.DiscoveryPolicyProfileValidation,
    ) as error:
        _raise_discovery_policy_profile_error(error)


def build_applied_discovery_policy_snapshot(
    *,
    lane: Literal["graph", "recall"],
    mission_like: Mapping[str, Any],
    profile: Mapping[str, Any],
) -> dict[str, Any]:
    return _discovery_policy_snapshots.build_applied_discovery_policy_snapshot(
        lane=lane,
        mission_like=mission_like,
        profile=profile,
        parse_discovery_profile_json_func=parse_discovery_profile_json,
        normalize_discovery_graph_policy_func=normalize_discovery_graph_policy,
        normalize_discovery_recall_policy_func=normalize_discovery_recall_policy,
        normalize_discovery_yield_benchmark_func=normalize_discovery_yield_benchmark,
    )


def snapshot_discovery_mission_profile_policy(mission_id: str) -> None:
    _discovery_policy_snapshots.snapshot_discovery_mission_profile_policy(
        mission_id,
        get_discovery_mission_func=get_discovery_mission,
        require_attachable_discovery_policy_profile_func=(
            require_attachable_discovery_policy_profile
        ),
        build_database_url_func=build_database_url,
        connect_func=psycopg.connect,
        dict_row_value=dict_row,
        parse_discovery_profile_json_func=parse_discovery_profile_json,
        normalize_discovery_graph_policy_func=normalize_discovery_graph_policy,
        normalize_discovery_recall_policy_func=normalize_discovery_recall_policy,
        normalize_discovery_yield_benchmark_func=normalize_discovery_yield_benchmark,
    )


def snapshot_discovery_recall_mission_profile_policy(recall_mission_id: str) -> None:
    _discovery_policy_snapshots.snapshot_discovery_recall_mission_profile_policy(
        recall_mission_id,
        get_discovery_recall_mission_func=get_discovery_recall_mission,
        require_attachable_discovery_policy_profile_func=(
            require_attachable_discovery_policy_profile
        ),
        build_database_url_func=build_database_url,
        connect_func=psycopg.connect,
        dict_row_value=dict_row,
        parse_discovery_profile_json_func=parse_discovery_profile_json,
        normalize_discovery_graph_policy_func=normalize_discovery_graph_policy,
        normalize_discovery_recall_policy_func=normalize_discovery_recall_policy,
        normalize_discovery_yield_benchmark_func=normalize_discovery_yield_benchmark,
    )


def create_discovery_recall_mission(
    payload: DiscoveryRecallMissionCreatePayload,
) -> dict[str, Any]:
    try:
        return _discovery_recall_missions.create_discovery_recall_mission(
            payload,
            require_attachable_discovery_policy_profile_func=(
                require_attachable_discovery_policy_profile
            ),
            get_discovery_recall_mission_func=get_discovery_recall_mission,
            build_database_url_func=build_database_url,
            connect_func=psycopg.connect,
            dict_row_value=dict_row,
        )
    except (
        _discovery_recall_missions.DiscoveryRecallMissionConflict,
        _discovery_recall_missions.DiscoveryRecallMissionNotFound,
        _discovery_recall_missions.DiscoveryRecallMissionValidation,
    ) as error:
        _raise_discovery_recall_mission_error(error)


def update_discovery_recall_mission(
    recall_mission_id: str,
    payload: DiscoveryRecallMissionUpdatePayload,
) -> dict[str, Any]:
    try:
        return _discovery_recall_missions.update_discovery_recall_mission(
            recall_mission_id,
            payload,
            require_attachable_discovery_policy_profile_func=(
                require_attachable_discovery_policy_profile
            ),
            get_discovery_recall_mission_func=get_discovery_recall_mission,
            build_database_url_func=build_database_url,
            connect_func=psycopg.connect,
            dict_row_value=dict_row,
        )
    except (
        _discovery_recall_missions.DiscoveryRecallMissionConflict,
        _discovery_recall_missions.DiscoveryRecallMissionNotFound,
        _discovery_recall_missions.DiscoveryRecallMissionValidation,
    ) as error:
        _raise_discovery_recall_mission_error(error)


async def request_discovery_recall_mission_acquisition(
    recall_mission_id: str,
) -> dict[str, Any]:
    return await _discovery_recall_missions.request_discovery_recall_mission_acquisition(
        recall_mission_id,
        get_discovery_recall_mission_func=get_discovery_recall_mission,
        snapshot_discovery_recall_mission_profile_policy_func=(
            snapshot_discovery_recall_mission_profile_policy
        ),
        load_discovery_settings_func=load_discovery_settings,
        discovery_coordinator_repository_factory=DiscoveryCoordinatorRepository,
        acquire_recall_missions_func=acquire_recall_missions,
    )


def create_discovery_mission(payload: DiscoveryMissionCreatePayload) -> dict[str, Any]:
    try:
        return _discovery_missions.create_discovery_mission(
            payload,
            load_discovery_settings_func=load_discovery_settings,
            require_attachable_discovery_policy_profile_func=(
                require_attachable_discovery_policy_profile
            ),
            get_discovery_mission_func=get_discovery_mission,
            build_database_url_func=build_database_url,
            connect_func=psycopg.connect,
            dict_row_value=dict_row,
        )
    except (
        _discovery_missions.DiscoveryMissionConflict,
        _discovery_missions.DiscoveryMissionNotFound,
        _discovery_missions.DiscoveryMissionValidation,
    ) as error:
        _raise_discovery_mission_error(error)


def update_discovery_mission(
    mission_id: str,
    payload: DiscoveryMissionUpdatePayload,
) -> dict[str, Any]:
    try:
        return _discovery_missions.update_discovery_mission(
            mission_id,
            payload,
            require_attachable_discovery_policy_profile_func=(
                require_attachable_discovery_policy_profile
            ),
            get_discovery_mission_func=get_discovery_mission,
            build_database_url_func=build_database_url,
            connect_func=psycopg.connect,
            dict_row_value=dict_row,
        )
    except (
        _discovery_missions.DiscoveryMissionConflict,
        _discovery_missions.DiscoveryMissionNotFound,
        _discovery_missions.DiscoveryMissionValidation,
    ) as error:
        _raise_discovery_mission_error(error)


def delete_discovery_mission(mission_id: str) -> dict[str, Any]:
    try:
        return _discovery_missions.delete_discovery_mission(
            mission_id,
            get_discovery_mission_func=get_discovery_mission,
            build_database_url_func=build_database_url,
            connect_func=psycopg.connect,
            dict_row_value=dict_row,
        )
    except (
        _discovery_missions.DiscoveryMissionConflict,
        _discovery_missions.DiscoveryMissionNotFound,
        _discovery_missions.DiscoveryMissionValidation,
    ) as error:
        _raise_discovery_mission_error(error)


async def compile_discovery_mission_graph(mission_id: str) -> dict[str, Any]:
    try:
        return await _discovery_missions.compile_discovery_mission_graph(
            mission_id,
            discovery_coordinator_repository_factory=DiscoveryCoordinatorRepository,
            snapshot_discovery_mission_profile_policy_func=(
                snapshot_discovery_mission_profile_policy
            ),
            compile_interest_graph_for_mission_func=compile_interest_graph_for_mission,
            get_discovery_mission_func=get_discovery_mission,
        )
    except (
        _discovery_missions.DiscoveryMissionConflict,
        _discovery_missions.DiscoveryMissionNotFound,
        _discovery_missions.DiscoveryMissionValidation,
    ) as error:
        _raise_discovery_mission_error(error)


def request_discovery_mission_run(
    mission_id: str,
    payload: DiscoveryMissionRunPayload,
) -> dict[str, Any]:
    try:
        return _discovery_missions.request_discovery_mission_run(
            mission_id,
            payload,
            discovery_orchestrator_sequence_id=DISCOVERY_ORCHESTRATOR_SEQUENCE_ID,
            get_discovery_mission_func=get_discovery_mission,
            get_discovery_monthly_quota_snapshot_func=get_discovery_monthly_quota_snapshot,
            snapshot_discovery_mission_profile_policy_func=snapshot_discovery_mission_profile_policy,
            create_sequence_run_request_for_trigger_func=(
                create_sequence_run_request_for_trigger
            ),
            build_database_url_func=build_database_url,
            connect_func=psycopg.connect,
            dict_row_value=dict_row,
        )
    except (
        _discovery_missions.DiscoveryMissionConflict,
        _discovery_missions.DiscoveryMissionNotFound,
        _discovery_missions.DiscoveryMissionValidation,
    ) as error:
        _raise_discovery_mission_error(error)


def list_discovery_classes_page(
    *,
    limit: int,
    page: int | None,
    page_size: int | None,
    status: str | None,
) -> dict[str, Any] | list[dict[str, Any]]:
    return _discovery_read_model.list_discovery_classes_page(
        limit=limit,
        page=page,
        page_size=page_size,
        status=status,
        query_all_func=query_all,
        query_count_func=query_count,
    )


def get_discovery_class(class_key: str) -> dict[str, Any]:
    try:
        return _discovery_read_model.get_discovery_class(
            class_key,
            query_one_func=query_one,
        )
    except _discovery_read_model.DiscoveryReadModelNotFound as error:
        _raise_discovery_read_model_not_found(error)


def create_discovery_class(payload: DiscoveryHypothesisClassCreatePayload) -> dict[str, Any]:
    try:
        return _discovery_classes.create_discovery_class(
            payload,
            get_discovery_class_func=get_discovery_class,
            build_database_url_func=build_database_url,
            connect_func=psycopg.connect,
            dict_row_value=dict_row,
        )
    except (
        _discovery_classes.DiscoveryClassConflict,
        _discovery_classes.DiscoveryClassNotFound,
        _discovery_classes.DiscoveryClassValidation,
    ) as error:
        _raise_discovery_class_error(error)


def update_discovery_class(
    class_key: str,
    payload: DiscoveryHypothesisClassUpdatePayload,
) -> dict[str, Any]:
    try:
        return _discovery_classes.update_discovery_class(
            class_key,
            payload,
            get_discovery_class_func=get_discovery_class,
            build_database_url_func=build_database_url,
            connect_func=psycopg.connect,
            dict_row_value=dict_row,
        )
    except (
        _discovery_classes.DiscoveryClassConflict,
        _discovery_classes.DiscoveryClassNotFound,
        _discovery_classes.DiscoveryClassValidation,
    ) as error:
        _raise_discovery_class_error(error)


def delete_discovery_class(class_key: str) -> dict[str, Any]:
    try:
        return _discovery_classes.delete_discovery_class(
            class_key,
            get_discovery_class_func=get_discovery_class,
            build_database_url_func=build_database_url,
            connect_func=psycopg.connect,
            dict_row_value=dict_row,
        )
    except (
        _discovery_classes.DiscoveryClassConflict,
        _discovery_classes.DiscoveryClassNotFound,
        _discovery_classes.DiscoveryClassValidation,
    ) as error:
        _raise_discovery_class_error(error)


def list_discovery_candidates_page(
    *,
    limit: int,
    page: int | None,
    page_size: int | None,
    mission_id: str | None,
    status: str | None,
    provider_type: str | None,
) -> dict[str, Any] | list[dict[str, Any]]:
    return _discovery_read_model.list_discovery_candidates_page(
        limit=limit,
        page=page,
        page_size=page_size,
        mission_id=mission_id,
        status=status,
        provider_type=provider_type,
        query_all_func=query_all,
        query_count_func=query_count,
    )


def get_discovery_candidate(candidate_id: str) -> dict[str, Any]:
    try:
        return _discovery_read_model.get_discovery_candidate(
            candidate_id,
            query_one_func=query_one,
        )
    except _discovery_read_model.DiscoveryReadModelNotFound as error:
        _raise_discovery_read_model_not_found(error)


def update_discovery_candidate(
    candidate_id: str,
    payload: DiscoveryCandidateUpdatePayload,
) -> dict[str, Any]:
    try:
        return _discovery_candidates.update_discovery_candidate(
            candidate_id,
            payload,
            get_discovery_candidate_func=get_discovery_candidate,
            registrar_adapter_factory=PostgresSourceRegistrarAdapter,
            build_database_url_func=build_database_url,
            connect_func=psycopg.connect,
            dict_row_value=dict_row,
        )
    except (
        _discovery_candidates.DiscoveryCandidateConflict,
        _discovery_candidates.DiscoveryCandidateNotFound,
        _discovery_candidates.DiscoveryCandidateValidation,
    ) as error:
        _raise_discovery_candidate_error(error)


def get_discovery_source_profile_by_canonical_domain(canonical_domain_value: str) -> dict[str, Any] | None:
    return _discovery_read_model.get_discovery_source_profile_by_canonical_domain(
        canonical_domain_value,
        query_one_func=query_one,
    )


def list_discovery_recall_candidates_page(
    *,
    limit: int,
    page: int | None,
    page_size: int | None,
    recall_mission_id: str | None,
    status: str | None,
    provider_type: str | None,
    canonical_domain_value: str | None,
) -> dict[str, Any] | list[dict[str, Any]]:
    return _discovery_read_model.list_discovery_recall_candidates_page(
        limit=limit,
        page=page,
        page_size=page_size,
        recall_mission_id=recall_mission_id,
        status=status,
        provider_type=provider_type,
        canonical_domain_value=canonical_domain_value,
        query_all_func=query_all,
        query_count_func=query_count,
    )


def get_discovery_recall_candidate(recall_candidate_id: str) -> dict[str, Any]:
    try:
        return _discovery_read_model.get_discovery_recall_candidate(
            recall_candidate_id,
            query_one_func=query_one,
        )
    except _discovery_read_model.DiscoveryReadModelNotFound as error:
        _raise_discovery_read_model_not_found(error)


def create_discovery_recall_candidate(
    payload: DiscoveryRecallCandidateCreatePayload,
) -> dict[str, Any]:
    try:
        return _discovery_candidates.create_discovery_recall_candidate(
            payload,
            get_discovery_recall_mission_func=get_discovery_recall_mission,
            resolve_discovery_canonical_domain_func=resolve_discovery_canonical_domain,
            get_discovery_source_profile_func=get_discovery_source_profile,
            get_discovery_source_profile_by_canonical_domain_func=(
                get_discovery_source_profile_by_canonical_domain
            ),
            get_discovery_recall_candidate_func=get_discovery_recall_candidate,
            build_database_url_func=build_database_url,
            connect_func=psycopg.connect,
            dict_row_value=dict_row,
        )
    except (
        _discovery_candidates.DiscoveryCandidateConflict,
        _discovery_candidates.DiscoveryCandidateNotFound,
        _discovery_candidates.DiscoveryCandidateValidation,
    ) as error:
        _raise_discovery_candidate_error(error)


def update_discovery_recall_candidate(
    recall_candidate_id: str,
    payload: DiscoveryRecallCandidateUpdatePayload,
) -> dict[str, Any]:
    try:
        return _discovery_candidates.update_discovery_recall_candidate(
            recall_candidate_id,
            payload,
            get_discovery_recall_candidate_func=get_discovery_recall_candidate,
            build_database_url_func=build_database_url,
            connect_func=psycopg.connect,
            dict_row_value=dict_row,
        )
    except (
        _discovery_candidates.DiscoveryCandidateConflict,
        _discovery_candidates.DiscoveryCandidateNotFound,
        _discovery_candidates.DiscoveryCandidateValidation,
    ) as error:
        _raise_discovery_candidate_error(error)


def promote_discovery_recall_candidate(
    recall_candidate_id: str,
    payload: DiscoveryRecallCandidatePromotePayload,
) -> dict[str, Any]:
    try:
        return _discovery_candidates.promote_discovery_recall_candidate(
            recall_candidate_id,
            payload,
            get_discovery_recall_candidate_func=get_discovery_recall_candidate,
            registrar_adapter_factory=PostgresSourceRegistrarAdapter,
            build_database_url_func=build_database_url,
            connect_func=psycopg.connect,
            dict_row_value=dict_row,
        )
    except (
        _discovery_candidates.DiscoveryCandidateConflict,
        _discovery_candidates.DiscoveryCandidateNotFound,
        _discovery_candidates.DiscoveryCandidateValidation,
    ) as error:
        _raise_discovery_candidate_error(error)


def list_discovery_hypotheses_page(
    *,
    limit: int,
    page: int | None,
    page_size: int | None,
    mission_id: str | None,
    status: str | None,
) -> dict[str, Any] | list[dict[str, Any]]:
    return _discovery_read_model.list_discovery_hypotheses_page(
        limit=limit,
        page=page,
        page_size=page_size,
        mission_id=mission_id,
        status=status,
        query_all_func=query_all,
        query_count_func=query_count,
    )


def get_discovery_hypothesis(hypothesis_id: str) -> dict[str, Any]:
    try:
        return _discovery_read_model.get_discovery_hypothesis(
            hypothesis_id,
            query_one_func=query_one,
        )
    except _discovery_read_model.DiscoveryReadModelNotFound as error:
        _raise_discovery_read_model_not_found(error)


def list_discovery_source_profiles_page(
    *,
    limit: int,
    page: int | None,
    page_size: int | None,
    min_trust_score: float | None,
    source_type: str | None,
) -> dict[str, Any] | list[dict[str, Any]]:
    return _discovery_read_model.list_discovery_source_profiles_page(
        limit=limit,
        page=page,
        page_size=page_size,
        min_trust_score=min_trust_score,
        source_type=source_type,
        query_all_func=query_all,
        query_count_func=query_count,
    )


def get_discovery_source_profile(source_profile_id: str) -> dict[str, Any]:
    try:
        return _discovery_read_model.get_discovery_source_profile(
            source_profile_id,
            query_one_func=query_one,
        )
    except _discovery_read_model.DiscoveryReadModelNotFound as error:
        _raise_discovery_read_model_not_found(error)


def list_discovery_source_quality_snapshots_page(
    *,
    limit: int,
    page: int | None,
    page_size: int | None,
    channel_id: str | None,
    min_recall_score: float | None,
) -> dict[str, Any] | list[dict[str, Any]]:
    return _discovery_read_model.list_discovery_source_quality_snapshots_page(
        limit=limit,
        page=page,
        page_size=page_size,
        channel_id=channel_id,
        min_recall_score=min_recall_score,
        query_all_func=query_all,
        query_count_func=query_count,
    )


def get_discovery_source_quality_snapshot(snapshot_id: str) -> dict[str, Any]:
    try:
        return _discovery_read_model.get_discovery_source_quality_snapshot(
            snapshot_id,
            query_one_func=query_one,
        )
    except _discovery_read_model.DiscoveryReadModelNotFound as error:
        _raise_discovery_read_model_not_found(error)


def list_discovery_source_interest_scores_page(
    *,
    limit: int,
    page: int | None,
    page_size: int | None,
    mission_id: str | None,
    channel_id: str | None,
    min_score: float | None,
) -> dict[str, Any] | list[dict[str, Any]]:
    return _discovery_read_model.list_discovery_source_interest_scores_page(
        limit=limit,
        page=page,
        page_size=page_size,
        mission_id=mission_id,
        channel_id=channel_id,
        min_score=min_score,
        query_all_func=query_all,
        query_count_func=query_count,
    )


def get_discovery_source_interest_score(score_id: str) -> dict[str, Any]:
    try:
        return _discovery_read_model.get_discovery_source_interest_score(
            score_id,
            query_one_func=query_one,
        )
    except _discovery_read_model.DiscoveryReadModelNotFound as error:
        _raise_discovery_read_model_not_found(error)


def get_discovery_portfolio_snapshot(mission_id: str) -> dict[str, Any]:
    try:
        return _discovery_read_model.get_discovery_portfolio_snapshot(
            mission_id,
            get_discovery_mission_func=get_discovery_mission,
            query_one_func=query_one,
        )
    except _discovery_read_model.DiscoveryReadModelNotFound as error:
        _raise_discovery_read_model_not_found(error)


def list_discovery_feedback_page(
    *,
    limit: int,
    page: int | None,
    page_size: int | None,
    mission_id: str | None,
) -> dict[str, Any] | list[dict[str, Any]]:
    return _discovery_read_model.list_discovery_feedback_page(
        limit=limit,
        page=page,
        page_size=page_size,
        mission_id=mission_id,
        query_all_func=query_all,
        query_count_func=query_count,
    )


def create_discovery_feedback(payload: DiscoveryFeedbackCreatePayload) -> dict[str, Any]:
    try:
        return _discovery_feedback.create_discovery_feedback(
            payload,
            discovery_feedback_select_sql_func=discovery_feedback_select_sql,
            query_one_func=query_one,
            build_database_url_func=build_database_url,
            connect_func=psycopg.connect,
            dict_row_value=dict_row,
        )
    except _discovery_feedback.DiscoveryFeedbackConflict as error:
        _raise_discovery_feedback_error(error)


def get_discovery_monthly_quota_snapshot() -> dict[str, Any]:
    return _discovery_read_model.get_discovery_monthly_quota_snapshot(
        load_discovery_settings_func=load_discovery_settings,
        discovery_month_start_utc_func=discovery_month_start_utc,
        coerce_discovery_cost_usd_func=coerce_discovery_cost_usd,
        discovery_cost_usd_to_cents_func=discovery_cost_usd_to_cents,
        query_one_func=query_one,
    )


def get_discovery_summary() -> dict[str, Any]:
    return _discovery_read_model.get_discovery_summary(
        load_discovery_settings_func=load_discovery_settings,
        get_discovery_monthly_quota_snapshot_func=get_discovery_monthly_quota_snapshot,
        coerce_discovery_cost_usd_func=coerce_discovery_cost_usd,
        discovery_cost_usd_to_cents_func=discovery_cost_usd_to_cents,
        discovery_enabled_env_value=os.getenv("DISCOVERY_ENABLED", "0"),
        query_one_func=query_one,
    )


def get_discovery_cost_summary() -> dict[str, Any]:
    return _discovery_read_model.get_discovery_cost_summary(
        discovery_month_start_utc_func=discovery_month_start_utc,
        get_discovery_monthly_quota_snapshot_func=get_discovery_monthly_quota_snapshot,
        coerce_discovery_cost_usd_func=coerce_discovery_cost_usd,
        discovery_cost_usd_to_cents_func=discovery_cost_usd_to_cents,
        query_all_func=query_all,
        query_one_func=query_one,
    )


def list_articles(
    limit: int = Query(default=20, ge=1, le=100),
    entity_type: str | None = Query(default=None, alias="entityType"),
    entity_text: str | None = Query(default=None, alias="entityText"),
    entity_normalized_key: str | None = Query(default=None, alias="entityNormalizedKey"),
    label_type: str | None = Query(default=None, alias="labelType"),
    label_key: str | None = Query(default=None, alias="labelKey"),
    content_filter_passed: bool | None = Query(default=None, alias="contentFilterPassed"),
    content_filter_decision: str | None = Query(default=None, alias="contentFilterDecision"),
    page: int | None = Query(default=None, ge=1),
    page_size: int | None = Query(default=None, ge=1, le=100, alias="pageSize"),
) -> dict[str, Any] | list[dict[str, Any]]:
    return _article_list_read_model.list_articles(
        limit=limit,
        entity_type=entity_type,
        entity_text=entity_text,
        entity_normalized_key=entity_normalized_key,
        label_type=label_type,
        label_key=label_key,
        content_filter_passed=content_filter_passed,
        content_filter_decision=content_filter_decision,
        page=page,
        page_size=page_size,
        build_content_analysis_filter_clause_func=build_content_analysis_filter_clause,
        normalize_content_filter_decision_func=normalize_content_filter_decision,
        article_preview_projection_func=article_preview_projection,
        article_observation_join_clause_func=article_observation_join_clause,
        final_selection_join_clause_func=final_selection_join_clause,
        system_feed_join_clause_func=system_feed_join_clause,
        primary_media_join_clause_func=primary_media_join_clause,
        resolve_pagination_func=resolve_pagination,
        query_all_func=query_all,
        query_count_func=query_count,
        build_paginated_response_func=build_paginated_response,
        apply_article_selection_payload_func=apply_article_selection_payload,
    )


def load_article_residual_rows(
    *,
    q: str | None = None,
    verification_state: str | None = None,
    processing_state: str | None = None,
    observation_state: str | None = None,
    duplicate_kind: str | None = None,
) -> list[dict[str, Any]]:
    return _article_residual_read_model.load_article_residual_rows(
        q=q,
        verification_state=verification_state,
        processing_state=processing_state,
        observation_state=observation_state,
        duplicate_kind=duplicate_kind,
        normalize_web_content_search_query_func=normalize_web_content_search_query,
        build_web_content_search_pattern_func=build_web_content_search_pattern,
        query_all_func=query_all,
        article_preview_projection_func=article_preview_projection,
        article_observation_join_clause_func=article_observation_join_clause,
        final_selection_join_clause_func=final_selection_join_clause,
        system_feed_join_clause_func=system_feed_join_clause,
        primary_media_join_clause_func=primary_media_join_clause,
    )


def build_article_residual_payload(article_like: Mapping[str, Any]) -> dict[str, Any]:
    return _article_residual_read_model.build_article_residual_payload(
        article_like,
        apply_article_selection_payload_func=apply_article_selection_payload,
        build_selection_explain_payload_func=build_selection_explain_payload,
        build_selection_diagnostics_payload_from_counts_func=(
            build_selection_diagnostics_payload_from_counts
        ),
    )


def article_matches_residual_filters(
    article: Mapping[str, Any],
    *,
    downstream_loss_bucket: str | None = None,
    selection_blocker_stage: str | None = None,
    selection_blocker_reason: str | None = None,
    selection_mode: str | None = None,
) -> bool:
    return _article_residual_read_model.article_matches_residual_filters(
        article,
        downstream_loss_bucket=downstream_loss_bucket,
        selection_blocker_stage=selection_blocker_stage,
        selection_blocker_reason=selection_blocker_reason,
        selection_mode=selection_mode,
    )


def summarize_article_residual_rows(rows: list[Mapping[str, Any]]) -> dict[str, Any]:
    return _article_residual_read_model.summarize_article_residual_rows(rows)


def list_article_residuals(
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
    return _article_residual_read_model.list_article_residuals(
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
        load_article_residual_rows_func=load_article_residual_rows,
        build_article_residual_payload_func=build_article_residual_payload,
        article_matches_residual_filters_func=article_matches_residual_filters,
        build_paginated_response_func=build_paginated_response,
    )


def summarize_article_residuals(
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
    return _article_residual_read_model.summarize_article_residuals(
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
        load_article_residual_rows_func=load_article_residual_rows,
        build_article_residual_payload_func=build_article_residual_payload,
        article_matches_residual_filters_func=article_matches_residual_filters,
        summarize_article_residual_rows_func=summarize_article_residual_rows,
    )


def list_system_selected_content_items_page(
    *,
    page: int = 1,
    page_size: int = 20,
    sort: str | None = None,
    q: str | None = None,
) -> dict[str, Any]:
    return _content_item_list_read_model.list_system_selected_content_items_page(
        page=page,
        page_size=page_size,
        sort=sort,
        q=q,
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
) -> dict[str, Any]:
    return list_system_selected_content_items_page(
        page=page,
        page_size=page_size,
        sort=sort,
        q=q,
    )


def list_content_items(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100, alias="pageSize"),
    sort: str | None = Query(default=None),
    q: str | None = Query(default=None),
) -> dict[str, Any]:
    return list_system_selected_content_items_page(
        page=page,
        page_size=page_size,
        sort=sort,
        q=q,
    )


def get_resource_content_item(resource_id: str) -> dict[str, Any]:
    try:
        return _content_detail_read_model.get_resource_content_item(
            resource_id,
            query_one_func=query_one,
            load_content_analysis_summary_func=load_content_analysis_summary,
        )
    except _content_detail_read_model.ContentItemNotFoundError:
        raise HTTPException(status_code=404, detail="Content item not found.")


def get_content_item(content_item_id: str) -> dict[str, Any]:
    return _content_detail_read_model.get_content_item(
        content_item_id,
        parse_content_item_id_func=parse_content_item_id,
        get_article_func=get_article,
        get_selected_content_item_preview_func=get_selected_content_item_preview,
        build_editorial_content_item_preview_from_article_func=(
            build_editorial_content_item_preview_from_article
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


def get_article(doc_id: str) -> dict[str, Any]:
    try:
        return _content_detail_read_model.get_article(
            doc_id,
            query_one_func=query_one,
            query_all_func=query_all,
            apply_article_selection_payload_func=apply_article_selection_payload,
            load_content_analysis_summary_func=load_content_analysis_summary,
        )
    except _content_detail_read_model.ArticleNotFoundError:
        raise HTTPException(status_code=404, detail="Article not found.")


def get_article_explain(doc_id: str) -> dict[str, Any]:
    return _content_detail_read_model.get_article_explain(
        doc_id,
        get_article_func=get_article,
        query_one_func=query_one,
        query_all_func=query_all,
        build_selection_explain_payload_func=build_selection_explain_payload,
        build_selection_diagnostics_payload_func=build_selection_diagnostics_payload,
        build_selection_guidance_payload_func=build_selection_guidance_payload,
    )


def get_dashboard_summary() -> dict[str, Any]:
    return _dashboard_read_model.get_dashboard_summary(
        canonical_article_family_expr_func=canonical_article_family_expr,
        final_selection_join_clause_func=final_selection_join_clause,
        system_feed_join_clause_func=system_feed_join_clause,
        feed_eligible_article_clause_func=feed_eligible_article_clause,
        processed_article_clause_func=processed_article_clause,
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

def request_article_enrichment_retry_route(
    doc_id: str,
    payload: ArticleEnrichmentRetryPayload | None = None,
) -> dict[str, Any]:
    try:
        return request_article_enrichment_retry(
            doc_id,
            payload or ArticleEnrichmentRetryPayload.model_validate({}),
        )
    except (
        SequenceConflictError,
        SequenceDispatchError,
        SequenceNotFoundError,
        SequenceValidationError,
    ) as error:
        raise_sequence_http_exception(error)


def request_content_item_enrichment_retry_route(
    content_item_id: str,
    payload: ArticleEnrichmentRetryPayload | None = None,
) -> dict[str, Any]:
    origin_type, origin_id = parse_content_item_id(content_item_id)
    if origin_type != "editorial":
        raise HTTPException(
            status_code=409,
            detail="Manual retry is only supported for editorial content items in the current runtime.",
        )
    return request_article_enrichment_retry_route(origin_id, payload)


def get_discovery_summary_route() -> dict[str, Any]:
    return get_discovery_summary()


def list_discovery_classes(
    limit: int = Query(default=20, ge=1, le=100),
    status: str | None = Query(default=None),
    page: int | None = Query(default=None, ge=1),
    page_size: int | None = Query(default=None, ge=1, le=100, alias="pageSize"),
) -> dict[str, Any] | list[dict[str, Any]]:
    if status is not None and status not in DISCOVERY_CLASS_STATUSES:
        raise HTTPException(status_code=422, detail=f"Unsupported discovery class status {status!r}.")
    return list_discovery_classes_page(limit=limit, page=page, page_size=page_size, status=status)


def create_discovery_class_route(payload: DiscoveryHypothesisClassCreatePayload) -> dict[str, Any]:
    try:
        return create_discovery_class(payload)
    except SequenceConflictError as error:
        raise_sequence_http_exception(error)


def get_discovery_class_route(class_key: str) -> dict[str, Any]:
    try:
        return get_discovery_class(class_key)
    except SequenceNotFoundError as error:
        raise_sequence_http_exception(error)


def update_discovery_class_route(
    class_key: str,
    payload: DiscoveryHypothesisClassUpdatePayload,
) -> dict[str, Any]:
    try:
        return update_discovery_class(class_key, payload)
    except (SequenceNotFoundError, SequenceValidationError) as error:
        raise_sequence_http_exception(error)


def delete_discovery_class_route(class_key: str) -> dict[str, Any]:
    try:
        return delete_discovery_class(class_key)
    except (SequenceConflictError, SequenceNotFoundError) as error:
        raise_sequence_http_exception(error)


def list_discovery_missions(
    limit: int = Query(default=20, ge=1, le=100),
    status: str | None = Query(default=None),
    page: int | None = Query(default=None, ge=1),
    page_size: int | None = Query(default=None, ge=1, le=100, alias="pageSize"),
) -> dict[str, Any] | list[dict[str, Any]]:
    if status is not None and status not in DISCOVERY_MISSION_STATUSES:
        raise HTTPException(status_code=422, detail=f"Unsupported discovery mission status {status!r}.")
    return list_discovery_missions_page(limit=limit, page=page, page_size=page_size, status=status)


def list_discovery_policy_profiles(
    limit: int = Query(default=20, ge=1, le=100),
    status: str | None = Query(default=None),
    page: int | None = Query(default=None, ge=1),
    page_size: int | None = Query(default=None, ge=1, le=100, alias="pageSize"),
) -> dict[str, Any] | list[dict[str, Any]]:
    if status is not None and status not in DISCOVERY_PROFILE_STATUSES:
        raise HTTPException(
            status_code=422,
            detail=f"Unsupported discovery profile status {status!r}.",
        )
    return list_discovery_policy_profiles_page(
        limit=limit,
        page=page,
        page_size=page_size,
        status=status,
    )


def create_discovery_policy_profile_route(
    payload: DiscoveryPolicyProfileCreatePayload,
) -> dict[str, Any]:
    try:
        return create_discovery_policy_profile(payload)
    except (SequenceConflictError, SequenceValidationError) as error:
        raise_sequence_http_exception(error)


def get_discovery_policy_profile_route(profile_id: str) -> dict[str, Any]:
    try:
        return get_discovery_policy_profile(profile_id)
    except SequenceNotFoundError as error:
        raise_sequence_http_exception(error)


def update_discovery_policy_profile_route(
    profile_id: str,
    payload: DiscoveryPolicyProfileUpdatePayload,
) -> dict[str, Any]:
    try:
        return update_discovery_policy_profile(profile_id, payload)
    except (SequenceConflictError, SequenceNotFoundError, SequenceValidationError) as error:
        raise_sequence_http_exception(error)


def delete_discovery_policy_profile_route(profile_id: str) -> dict[str, Any]:
    try:
        return delete_discovery_policy_profile(profile_id)
    except (SequenceConflictError, SequenceNotFoundError) as error:
        raise_sequence_http_exception(error)


def create_discovery_mission_route(payload: DiscoveryMissionCreatePayload) -> dict[str, Any]:
    return create_discovery_mission(payload)


def list_discovery_recall_missions(
    limit: int = Query(default=20, ge=1, le=100),
    status: str | None = Query(default=None),
    mission_kind: str | None = Query(default=None, alias="missionKind"),
    page: int | None = Query(default=None, ge=1),
    page_size: int | None = Query(default=None, ge=1, le=100, alias="pageSize"),
) -> dict[str, Any] | list[dict[str, Any]]:
    if status is not None and status not in DISCOVERY_RECALL_MISSION_STATUSES:
        raise HTTPException(
            status_code=422,
            detail=f"Unsupported discovery recall mission status {status!r}.",
        )
    if mission_kind is not None and mission_kind not in DISCOVERY_RECALL_MISSION_KINDS:
        raise HTTPException(
            status_code=422,
            detail=f"Unsupported discovery recall mission kind {mission_kind!r}.",
        )
    return list_discovery_recall_missions_page(
        limit=limit,
        page=page,
        page_size=page_size,
        status=status,
        mission_kind=mission_kind,
    )


def create_discovery_recall_mission_route(
    payload: DiscoveryRecallMissionCreatePayload,
) -> dict[str, Any]:
    return create_discovery_recall_mission(payload)


def get_discovery_recall_mission_route(recall_mission_id: str) -> dict[str, Any]:
    try:
        return get_discovery_recall_mission(recall_mission_id)
    except SequenceNotFoundError as error:
        raise_sequence_http_exception(error)


def update_discovery_recall_mission_route(
    recall_mission_id: str,
    payload: DiscoveryRecallMissionUpdatePayload,
) -> dict[str, Any]:
    try:
        return update_discovery_recall_mission(recall_mission_id, payload)
    except (SequenceNotFoundError, SequenceValidationError) as error:
        raise_sequence_http_exception(error)


async def request_discovery_recall_mission_acquisition_route(
    recall_mission_id: str,
) -> dict[str, Any]:
    try:
        return await request_discovery_recall_mission_acquisition(recall_mission_id)
    except (SequenceNotFoundError, SequenceValidationError) as error:
        raise_sequence_http_exception(error)


def get_discovery_mission_route(mission_id: str) -> dict[str, Any]:
    try:
        return get_discovery_mission(mission_id)
    except SequenceNotFoundError as error:
        raise_sequence_http_exception(error)


def update_discovery_mission_route(
    mission_id: str,
    payload: DiscoveryMissionUpdatePayload,
) -> dict[str, Any]:
    try:
        return update_discovery_mission(mission_id, payload)
    except (SequenceNotFoundError, SequenceValidationError) as error:
        raise_sequence_http_exception(error)


def delete_discovery_mission_route(mission_id: str) -> dict[str, Any]:
    try:
        return delete_discovery_mission(mission_id)
    except (SequenceConflictError, SequenceNotFoundError) as error:
        raise_sequence_http_exception(error)


async def compile_discovery_mission_graph_route(mission_id: str) -> dict[str, Any]:
    try:
        return await compile_discovery_mission_graph(mission_id)
    except (SequenceConflictError, SequenceNotFoundError) as error:
        raise_sequence_http_exception(error)


def request_discovery_mission_run_route(
    mission_id: str,
    payload: DiscoveryMissionRunPayload | None = None,
) -> dict[str, Any]:
    try:
        return request_discovery_mission_run(
            mission_id,
            payload or DiscoveryMissionRunPayload.model_validate({}),
        )
    except (
        SequenceConflictError,
        SequenceDispatchError,
        SequenceNotFoundError,
        SequenceValidationError,
    ) as error:
        raise_sequence_http_exception(error)


def list_discovery_candidates(
    limit: int = Query(default=50, ge=1, le=200),
    mission_id: str | None = Query(default=None, alias="missionId"),
    status: str | None = Query(default=None),
    provider_type: str | None = Query(default=None, alias="providerType"),
    page: int | None = Query(default=None, ge=1),
    page_size: int | None = Query(default=None, ge=1, le=200, alias="pageSize"),
    ) -> dict[str, Any] | list[dict[str, Any]]:
    if status is not None and status not in DISCOVERY_CANDIDATE_STATUSES:
        raise HTTPException(status_code=422, detail=f"Unsupported discovery candidate status {status!r}.")
    if provider_type is not None and provider_type not in DISCOVERY_PROVIDER_TYPES:
        raise HTTPException(status_code=422, detail=f"Unsupported discovery provider type {provider_type!r}.")
    return list_discovery_candidates_page(
        limit=limit,
        page=page,
        page_size=page_size,
        mission_id=mission_id,
        status=status,
        provider_type=provider_type,
    )


def list_discovery_recall_candidates(
    limit: int = Query(default=50, ge=1, le=200),
    recall_mission_id: str | None = Query(default=None, alias="recallMissionId"),
    status: str | None = Query(default=None),
    provider_type: str | None = Query(default=None, alias="providerType"),
    canonical_domain_value: str | None = Query(default=None, alias="canonicalDomain"),
    page: int | None = Query(default=None, ge=1),
    page_size: int | None = Query(default=None, ge=1, le=200, alias="pageSize"),
) -> dict[str, Any] | list[dict[str, Any]]:
    if status is not None and status not in DISCOVERY_RECALL_CANDIDATE_STATUSES:
        raise HTTPException(
            status_code=422,
            detail=f"Unsupported discovery recall candidate status {status!r}.",
        )
    if provider_type is not None and provider_type not in DISCOVERY_PROVIDER_TYPES:
        raise HTTPException(
            status_code=422,
            detail=f"Unsupported discovery provider type {provider_type!r}.",
        )
    return list_discovery_recall_candidates_page(
        limit=limit,
        page=page,
        page_size=page_size,
        recall_mission_id=recall_mission_id,
        status=status,
        provider_type=provider_type,
        canonical_domain_value=canonical_domain_value,
    )


def create_discovery_recall_candidate_route(
    payload: DiscoveryRecallCandidateCreatePayload,
) -> dict[str, Any]:
    try:
        return create_discovery_recall_candidate(payload)
    except (SequenceNotFoundError, SequenceValidationError, SequenceConflictError) as error:
        raise_sequence_http_exception(error)


def get_discovery_recall_candidate_route(recall_candidate_id: str) -> dict[str, Any]:
    try:
        return get_discovery_recall_candidate(recall_candidate_id)
    except SequenceNotFoundError as error:
        raise_sequence_http_exception(error)


def promote_discovery_recall_candidate_route(
    recall_candidate_id: str,
    payload: DiscoveryRecallCandidatePromotePayload | None = None,
) -> dict[str, Any]:
    try:
        return promote_discovery_recall_candidate(
            recall_candidate_id,
            payload or DiscoveryRecallCandidatePromotePayload.model_validate({}),
        )
    except (
        SequenceConflictError,
        SequenceNotFoundError,
        SequenceValidationError,
    ) as error:
        raise_sequence_http_exception(error)


def update_discovery_recall_candidate_route(
    recall_candidate_id: str,
    payload: DiscoveryRecallCandidateUpdatePayload,
) -> dict[str, Any]:
    try:
        return update_discovery_recall_candidate(recall_candidate_id, payload)
    except (SequenceNotFoundError, SequenceValidationError) as error:
        raise_sequence_http_exception(error)


def get_discovery_candidate_route(candidate_id: str) -> dict[str, Any]:
    try:
        return get_discovery_candidate(candidate_id)
    except SequenceNotFoundError as error:
        raise_sequence_http_exception(error)


def update_discovery_candidate_route(
    candidate_id: str,
    payload: DiscoveryCandidateUpdatePayload,
) -> dict[str, Any]:
    try:
        return update_discovery_candidate(candidate_id, payload)
    except (SequenceNotFoundError, SequenceValidationError) as error:
        raise_sequence_http_exception(error)


def list_discovery_hypotheses(
    limit: int = Query(default=50, ge=1, le=200),
    mission_id: str | None = Query(default=None, alias="missionId"),
    status: str | None = Query(default=None),
    page: int | None = Query(default=None, ge=1),
    page_size: int | None = Query(default=None, ge=1, le=200, alias="pageSize"),
) -> dict[str, Any] | list[dict[str, Any]]:
    if status is not None and status not in DISCOVERY_HYPOTHESIS_STATUSES:
        raise HTTPException(status_code=422, detail=f"Unsupported discovery hypothesis status {status!r}.")
    return list_discovery_hypotheses_page(
        limit=limit,
        page=page,
        page_size=page_size,
        mission_id=mission_id,
        status=status,
    )


def get_discovery_hypothesis_route(hypothesis_id: str) -> dict[str, Any]:
    try:
        return get_discovery_hypothesis(hypothesis_id)
    except SequenceNotFoundError as error:
        raise_sequence_http_exception(error)


def list_discovery_source_profiles(
    limit: int = Query(default=50, ge=1, le=200),
    min_trust_score: float | None = Query(default=None, alias="minTrustScore"),
    source_type: str | None = Query(default=None, alias="sourceType"),
    page: int | None = Query(default=None, ge=1),
    page_size: int | None = Query(default=None, ge=1, le=200, alias="pageSize"),
) -> dict[str, Any] | list[dict[str, Any]]:
    return list_discovery_source_profiles_page(
        limit=limit,
        page=page,
        page_size=page_size,
        min_trust_score=min_trust_score,
        source_type=source_type,
    )


def get_discovery_source_profile_route(source_profile_id: str) -> dict[str, Any]:
    try:
        return get_discovery_source_profile(source_profile_id)
    except SequenceNotFoundError as error:
        raise_sequence_http_exception(error)


def list_discovery_source_quality_snapshots(
    limit: int = Query(default=50, ge=1, le=200),
    channel_id: str | None = Query(default=None, alias="channelId"),
    min_recall_score: float | None = Query(default=None, alias="minRecallScore"),
    page: int | None = Query(default=None, ge=1),
    page_size: int | None = Query(default=None, ge=1, le=200, alias="pageSize"),
) -> dict[str, Any] | list[dict[str, Any]]:
    return list_discovery_source_quality_snapshots_page(
        limit=limit,
        page=page,
        page_size=page_size,
        channel_id=channel_id,
        min_recall_score=min_recall_score,
    )


def get_discovery_source_quality_snapshot_route(snapshot_id: str) -> dict[str, Any]:
    try:
        return get_discovery_source_quality_snapshot(snapshot_id)
    except SequenceNotFoundError as error:
        raise_sequence_http_exception(error)


def list_discovery_source_interest_scores(
    limit: int = Query(default=50, ge=1, le=200),
    mission_id: str | None = Query(default=None, alias="missionId"),
    channel_id: str | None = Query(default=None, alias="channelId"),
    min_score: float | None = Query(default=None, alias="minScore"),
    page: int | None = Query(default=None, ge=1),
    page_size: int | None = Query(default=None, ge=1, le=200, alias="pageSize"),
) -> dict[str, Any] | list[dict[str, Any]]:
    return list_discovery_source_interest_scores_page(
        limit=limit,
        page=page,
        page_size=page_size,
        mission_id=mission_id,
        channel_id=channel_id,
        min_score=min_score,
    )


def get_discovery_source_interest_score_route(score_id: str) -> dict[str, Any]:
    try:
        return get_discovery_source_interest_score(score_id)
    except SequenceNotFoundError as error:
        raise_sequence_http_exception(error)


def get_discovery_portfolio_snapshot_route(mission_id: str) -> dict[str, Any]:
    try:
        return get_discovery_portfolio_snapshot(mission_id)
    except SequenceNotFoundError as error:
        raise_sequence_http_exception(error)


def list_discovery_feedback(
    limit: int = Query(default=50, ge=1, le=200),
    mission_id: str | None = Query(default=None, alias="missionId"),
    page: int | None = Query(default=None, ge=1),
    page_size: int | None = Query(default=None, ge=1, le=200, alias="pageSize"),
) -> dict[str, Any] | list[dict[str, Any]]:
    return list_discovery_feedback_page(
        limit=limit,
        page=page,
        page_size=page_size,
        mission_id=mission_id,
    )


def create_discovery_feedback_route(payload: DiscoveryFeedbackCreatePayload) -> dict[str, Any]:
    try:
        return create_discovery_feedback(payload)
    except SequenceConflictError as error:
        raise_sequence_http_exception(error)


async def re_evaluate_discovery_sources_route(
    payload: DiscoveryReEvaluatePayload | None = None,
) -> dict[str, Any]:
    try:
        return await _discovery_re_evaluation.request_discovery_re_evaluation(
            payload,
            discovery_coordinator_repository_factory=DiscoveryCoordinatorRepository,
            re_evaluate_sources_func=re_evaluate_sources,
        )
    except SequenceNotFoundError as error:
        raise_sequence_http_exception(error)


def get_discovery_cost_summary_route() -> dict[str, Any]:
    return get_discovery_cost_summary()


app = create_api_app(ApiAppContext(route_deps=build_route_deps(globals())))

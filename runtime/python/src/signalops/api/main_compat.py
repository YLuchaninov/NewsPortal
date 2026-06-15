from __future__ import annotations

import os as _os
import uuid as _uuid
from collections.abc import Callable
from functools import wraps
from inspect import signature
from typing import Any, get_type_hints

import psycopg as _psycopg
from fastapi import HTTPException as _HTTPException
from psycopg.rows import dict_row as _dict_row

from signalops.api import api_app as _api_app
from signalops.api import content_selection_read_model as _content_selection_read_model
from signalops.api import database as _database
from signalops.api import llm_review_budget as _llm_review_budget
from signalops.api import main_common as _main_common
from signalops.api import main_content as _main_content
from signalops.api import main_content_analysis as _main_content_analysis
from signalops.api import main_observability as _main_observability
from signalops.api import main_sequence as _main_sequence
from signalops.api import route_deps as _route_deps
from signalops.api.route_deps import ApiRouteDependencyValues

_PATCH_MODULES = (
    _main_common,
    _main_content,
    _main_content_analysis,
    _main_observability,
    _main_sequence,
)

_EXTERNAL_PATCHABLES = (
    "build_database_url",
    "query_all",
    "query_one",
    "query_count",
    "psycopg",
    "dict_row",
    "uuid",
    "apply_reindex_selection_profile_payload",
    "with_resolved_channel_adapter_fields",
    "archive_sequence_definition",
    "cancel_sequence_run_request",
    "create_agent_sequence_request",
    "create_sequence_definition",
    "create_sequence_run_request",
    "create_sequence_run_request_for_trigger",
    "ensure_published_signal_candidate_retry_event",
    "get_content_item",
    "get_selected_content_item_preview",
    "get_sequence_definition",
    "get_sequence_run",
    "get_signal_candidate",
    "list_sequences_page",
    "load_content_analysis_summary",
    "request_signal_candidate_enrichment_retry",
    "request_signal_candidate_enrichment_retry_route",
    "retry_sequence_run_request",
    "update_sequence_definition",
)

API_MAIN_COMPAT_EXPORTS = (
    "build_content_item_id",
    "build_fallback_selection_blocker_payload",
    "build_resource_selection_explain_payload",
    "canonical_signal_candidate_family_order_clause",
    "coerce_llm_review_cost_usd",
    "editorial_content_select_sql",
    "llm_review_accept_gray_zone_on_budget_exhaustion",
    "llm_review_cost_usd_to_cents",
    "llm_review_enabled",
    "llm_review_month_start_utc",
    "llm_review_monthly_budget_cents",
    "resource_content_select_sql",
    "system_interest_kind_enabled_clause",
)

_STATIC_EXPORTS = {
    "os": _os,
    "uuid": _uuid,
    "psycopg": _psycopg,
    "HTTPException": _HTTPException,
    "dict_row": _dict_row,
}

_DIRECT_EXPORTS: tuple[tuple[object, tuple[str, ...]], ...] = (
    (
        _api_app,
        (
            "ApiAppContext",
            "create_api_app",
        ),
    ),
    (
        _database,
        (
            "build_database_url",
            "query_all",
            "query_one",
        ),
    ),
    (
        _route_deps,
        (
            "ApiRouteDependencyValues",
            "build_route_deps",
        ),
    ),
    (
        _content_selection_read_model,
        (
            "apply_resource_selection_payload",
            "apply_signal_candidate_selection_payload",
            "build_content_item_id",
            "build_content_kind_selection_explain_payload",
            "build_editorial_content_item_preview_from_signal_candidate",
            "build_fallback_selection_blocker_payload",
            "build_resource_selection_explain_payload",
            "build_selection_diagnostics_payload",
            "build_selection_diagnostics_payload_from_counts",
            "build_selection_explain_payload",
            "build_selection_guidance_payload",
            "canonical_signal_candidate_family_expr",
            "canonical_signal_candidate_family_order_clause",
            "combined_content_items_select_sql",
            "editorial_content_select_sql",
            "feed_eligible_signal_candidate_clause",
            "final_selection_join_clause",
            "get_selected_content_item_preview",
            "normalize_system_interest_selection_profile_payload",
            "parse_content_item_id",
            "primary_media_join_clause",
            "processed_signal_candidate_clause",
            "resource_content_select_sql",
            "signal_candidate_observation_join_clause",
            "signal_candidate_preview_projection",
            "system_feed_join_clause",
            "system_interest_kind_enabled_clause",
        ),
    ),
    (
        _llm_review_budget,
        (
            "coerce_llm_review_cost_usd",
            "llm_review_accept_gray_zone_on_budget_exhaustion",
            "llm_review_cost_usd_to_cents",
            "llm_review_enabled",
            "llm_review_month_start_utc",
            "llm_review_monthly_budget_cents",
        ),
    ),
    (
        _main_common,
        (
            "apply_reindex_selection_profile_payload",
            "as_json_bool",
            "as_json_int",
            "as_json_object",
            "as_json_str",
            "build_reindex_selection_profile_payload",
            "build_web_content_order_clause",
            "build_web_content_search_clause",
            "build_web_content_search_pattern",
            "default_max_entry_age_hours_for_adapter",
            "infer_feed_ingress_adapter_strategy",
            "is_fastapi_param_default",
            "normalize_optional_query_bool",
            "normalize_optional_query_string",
            "normalize_web_content_list_sort",
            "normalize_web_content_search_query",
            "query_count",
            "resolve_feed_ingress_adapter_strategy",
            "resolve_feed_ingress_max_entry_age_hours",
            "strip_web_content_internal_fields",
            "with_resolved_channel_adapter_fields",
        ),
    ),
    (
        _main_content,
        (
            "get_content_item",
            "get_content_item_explain",
            "get_resource_content_item",
            "get_signal_candidate",
            "get_signal_candidate_explain",
            "get_web_resource",
            "list_content_items",
            "list_signal_candidate_residuals",
            "list_signal_candidates",
            "list_system_selected_content_items",
            "list_system_selected_content_items_page",
            "list_web_resources",
            "list_web_resources_page",
            "summarize_signal_candidate_residual_rows",
            "summarize_signal_candidate_residuals",
            "summarize_signal_candidate_selection_counts",
        ),
    ),
    (
        _main_content_analysis,
        (
            "ContentAnalysisBackfillPayload",
            "ContentAnalysisPolicyPayload",
            "ContentAnalysisPolicyUpdatePayload",
            "ContentFilterPolicyPayload",
            "ContentFilterPolicyUpdatePayload",
            "build_content_analysis_filter_clause",
            "create_content_analysis_policy",
            "create_content_filter_policy",
            "get_content_analysis_policy",
            "get_content_analysis_result",
            "get_content_filter_policy",
            "list_content_analysis_policies",
            "list_content_analysis_results",
            "list_content_entities",
            "list_content_filter_policies",
            "list_content_filter_results",
            "list_content_labels",
            "load_content_analysis_summary",
            "normalize_content_analysis_status",
            "normalize_content_analysis_subject_id",
            "normalize_content_analysis_subject_type",
            "normalize_content_analysis_type",
            "normalize_content_filter_decision",
            "preview_content_filter_policy",
            "request_content_analysis_backfill",
            "update_content_analysis_policy",
            "update_content_filter_policy",
        ),
    ),
    (
        _main_observability,
        (
            "get_channel",
            "get_dashboard_summary",
            "get_llm_budget_summary",
            "get_llm_template",
            "get_system_interest",
            "list_channels",
            "list_clusters",
            "list_llm_templates",
            "list_reindex_jobs",
            "list_system_interests",
            "list_user_interests",
            "list_user_matches",
            "list_user_notifications",
        ),
    ),
    (
        _main_sequence,
        (
            "AgentSequenceCreatePayload",
            "SequenceCancelPayload",
            "SequenceConflictError",
            "SequenceCreatePayload",
            "SequenceDispatchError",
            "SequenceManualRunPayload",
            "SequenceNotFoundError",
            "SequenceRetryRunPayload",
            "SequenceUpdatePayload",
            "SequenceValidationError",
            "SignalCandidateEnrichmentRetryPayload",
            "archive_sequence_definition",
            "cancel_sequence_run",
            "cancel_sequence_run_request",
            "create_agent_sequence",
            "create_agent_sequence_request",
            "create_sequence",
            "create_sequence_definition",
            "create_sequence_run_request",
            "create_sequence_run_request_for_trigger",
            "delete_sequence",
            "ensure_published_signal_candidate_retry_event",
            "get_active_sequence_for_trigger",
            "get_agent_sequence_tools",
            "get_sequence",
            "get_sequence_definition",
            "get_sequence_plugins",
            "get_sequence_run",
            "get_sequence_run_status",
            "get_sequence_run_task_runs",
            "list_agent_sequence_tools",
            "list_sequence_plugins",
            "list_sequence_task_runs",
            "list_sequences",
            "list_sequences_page",
            "normalize_sequence_cron",
            "raise_sequence_http_exception",
            "request_content_item_enrichment_retry_route",
            "request_sequence_run",
            "request_signal_candidate_enrichment_retry",
            "request_signal_candidate_enrichment_retry_route",
            "retry_sequence_run",
            "retry_sequence_run_request",
            "update_sequence",
            "update_sequence_definition",
            "validate_sequence_editor_state",
        ),
    ),
)

_ROUTE_EXPORTS: tuple[tuple[object, tuple[str, ...]], ...] = (
    (
        _main_content,
        (
            "get_content_item",
            "get_content_item_explain",
            "get_resource_content_item",
            "get_signal_candidate",
            "get_signal_candidate_explain",
            "get_web_resource",
            "list_content_items",
            "list_signal_candidate_residuals",
            "list_signal_candidates",
            "list_system_selected_content_items",
            "list_system_selected_content_items_page",
            "list_web_resources",
            "list_web_resources_page",
            "summarize_signal_candidate_residual_rows",
            "summarize_signal_candidate_residuals",
            "summarize_signal_candidate_selection_counts",
        ),
    ),
    (
        _main_content_analysis,
        (
            "build_content_analysis_filter_clause",
            "create_content_analysis_policy",
            "create_content_filter_policy",
            "get_content_analysis_policy",
            "get_content_analysis_result",
            "get_content_filter_policy",
            "list_content_analysis_policies",
            "list_content_analysis_results",
            "list_content_entities",
            "list_content_filter_policies",
            "list_content_filter_results",
            "list_content_labels",
            "load_content_analysis_summary",
            "normalize_content_analysis_status",
            "normalize_content_analysis_subject_id",
            "normalize_content_analysis_subject_type",
            "normalize_content_analysis_type",
            "normalize_content_filter_decision",
            "preview_content_filter_policy",
            "request_content_analysis_backfill",
            "update_content_analysis_policy",
            "update_content_filter_policy",
        ),
    ),
    (
        _main_observability,
        (
            "get_channel",
            "get_dashboard_summary",
            "get_llm_budget_summary",
            "get_llm_template",
            "get_system_interest",
            "list_channels",
            "list_clusters",
            "list_llm_templates",
            "list_reindex_jobs",
            "list_system_interests",
            "list_user_interests",
            "list_user_matches",
            "list_user_notifications",
        ),
    ),
    (
        _main_sequence,
        (
            "archive_sequence_definition",
            "cancel_sequence_run",
            "cancel_sequence_run_request",
            "create_agent_sequence",
            "create_agent_sequence_request",
            "create_sequence",
            "create_sequence_definition",
            "create_sequence_run_request_for_trigger",
            "create_sequence_run_request",
            "delete_sequence",
            "ensure_published_signal_candidate_retry_event",
            "get_active_sequence_for_trigger",
            "get_agent_sequence_tools",
            "get_sequence",
            "get_sequence_definition",
            "get_sequence_plugins",
            "get_sequence_run",
            "get_sequence_run_status",
            "get_sequence_run_task_runs",
            "list_agent_sequence_tools",
            "list_sequence_plugins",
            "list_sequence_task_runs",
            "list_sequences",
            "list_sequences_page",
            "normalize_sequence_cron",
            "raise_sequence_http_exception",
            "request_content_item_enrichment_retry_route",
            "request_sequence_run",
            "request_signal_candidate_enrichment_retry",
            "request_signal_candidate_enrichment_retry_route",
            "retry_sequence_run",
            "retry_sequence_run_request",
            "update_sequence",
            "update_sequence_definition",
            "validate_sequence_editor_state",
        ),
    ),
)


def install_main_compat_exports(
    main_globals: dict[str, Any],
) -> Callable[[], ApiRouteDependencyValues]:
    main_globals["API_MAIN_COMPAT_EXPORTS"] = API_MAIN_COMPAT_EXPORTS
    for name, value in _STATIC_EXPORTS.items():
        main_globals[name] = value
    for module, names in _DIRECT_EXPORTS:
        for name in names:
            main_globals[name] = getattr(module, name)

    wrapper_originals: dict[str, Any] = {}
    internal_originals: dict[tuple[object, str], Any] = {}

    def sync_route_test_overrides() -> None:
        for name in _EXTERNAL_PATCHABLES:
            value = main_globals.get(name)
            for module in _PATCH_MODULES:
                if value is not None and hasattr(module, name):
                    if value is wrapper_originals.get(name):
                        original = internal_originals.get((module, name))
                        if original is not None:
                            setattr(module, name, original)
                    else:
                        setattr(module, name, value)

    def typed_signature(original: Callable[..., Any]):
        original_signature = signature(original)
        type_hints = get_type_hints(original)
        parameters = [
            parameter.replace(annotation=type_hints.get(parameter_name, parameter.annotation))
            for parameter_name, parameter in original_signature.parameters.items()
        ]
        return original_signature.replace(
            parameters=parameters,
            return_annotation=type_hints.get("return", original_signature.return_annotation),
        )

    def wrap_route(module: object, name: str):
        original = getattr(module, name)

        @wraps(original)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            sync_route_test_overrides()
            return getattr(module, name)(*args, **kwargs)

        wrapper.__signature__ = typed_signature(original)  # type: ignore[attr-defined]
        return wrapper

    for module, names in _ROUTE_EXPORTS:
        for name in names:
            internal_originals[(module, name)] = getattr(module, name)
            wrapper = wrap_route(module, name)
            main_globals[name] = wrapper
            wrapper_originals[name] = wrapper

    def api_route_dependency_values() -> ApiRouteDependencyValues:
        get = main_globals.__getitem__
        return ApiRouteDependencyValues(
            AgentSequenceCreatePayload=get("AgentSequenceCreatePayload"),
            SequenceCancelPayload=get("SequenceCancelPayload"),
            SequenceConflictError=get("SequenceConflictError"),
            SequenceCreatePayload=get("SequenceCreatePayload"),
            SequenceDispatchError=get("SequenceDispatchError"),
            SequenceManualRunPayload=get("SequenceManualRunPayload"),
            SequenceNotFoundError=get("SequenceNotFoundError"),
            SequenceRetryRunPayload=get("SequenceRetryRunPayload"),
            SequenceUpdatePayload=get("SequenceUpdatePayload"),
            SequenceValidationError=get("SequenceValidationError"),
            archive_sequence_definition=get("archive_sequence_definition"),
            cancel_sequence_run_request=get("cancel_sequence_run_request"),
            create_agent_sequence_request=get("create_agent_sequence_request"),
            create_content_analysis_policy=get("create_content_analysis_policy"),
            create_content_filter_policy=get("create_content_filter_policy"),
            create_sequence_definition=get("create_sequence_definition"),
            create_sequence_run_request=get("create_sequence_run_request"),
            get_signal_candidate=get("get_signal_candidate"),
            get_signal_candidate_explain=get("get_signal_candidate_explain"),
            get_channel=get("get_channel"),
            get_content_analysis_policy=get("get_content_analysis_policy"),
            get_content_analysis_result=get("get_content_analysis_result"),
            get_content_filter_policy=get("get_content_filter_policy"),
            get_content_item=get("get_content_item"),
            get_content_item_explain=get("get_content_item_explain"),
            get_dashboard_summary=get("get_dashboard_summary"),
            get_llm_template=get("get_llm_template"),
            get_sequence_definition=get("get_sequence_definition"),
            get_sequence_run=get("get_sequence_run"),
            get_system_interest=get("get_system_interest"),
            get_web_resource=get("get_web_resource"),
            list_agent_sequence_tools=get("list_agent_sequence_tools"),
            list_signal_candidate_residuals=get("list_signal_candidate_residuals"),
            list_signal_candidates=get("list_signal_candidates"),
            list_channels=get("list_channels"),
            list_clusters=get("list_clusters"),
            list_content_analysis_policies=get("list_content_analysis_policies"),
            list_content_analysis_results=get("list_content_analysis_results"),
            list_content_entities=get("list_content_entities"),
            list_content_filter_policies=get("list_content_filter_policies"),
            list_content_filter_results=get("list_content_filter_results"),
            list_content_items=get("list_content_items"),
            list_content_labels=get("list_content_labels"),
            list_llm_templates=get("list_llm_templates"),
            list_reindex_jobs=get("list_reindex_jobs"),
            list_sequence_plugins=get("list_sequence_plugins"),
            list_sequence_task_runs=get("list_sequence_task_runs"),
            list_sequences_page=get("list_sequences_page"),
            list_system_interests=get("list_system_interests"),
            list_system_selected_content_items=get("list_system_selected_content_items"),
            list_user_interests=get("list_user_interests"),
            list_user_matches=get("list_user_matches"),
            list_user_notifications=get("list_user_notifications"),
            list_web_resources=get("list_web_resources"),
            preview_content_filter_policy=get("preview_content_filter_policy"),
            raise_sequence_http_exception=get("raise_sequence_http_exception"),
            request_signal_candidate_enrichment_retry_route=get(
                "request_signal_candidate_enrichment_retry_route"
            ),
            request_content_analysis_backfill=get("request_content_analysis_backfill"),
            request_content_item_enrichment_retry_route=get(
                "request_content_item_enrichment_retry_route"
            ),
            retry_sequence_run_request=get("retry_sequence_run_request"),
            summarize_signal_candidate_residuals=get(
                "summarize_signal_candidate_residuals"
            ),
            summarize_signal_candidate_selection_counts=get(
                "summarize_signal_candidate_selection_counts"
            ),
            update_content_analysis_policy=get("update_content_analysis_policy"),
            update_content_filter_policy=get("update_content_filter_policy"),
            update_sequence_definition=get("update_sequence_definition"),
        )

    return api_route_dependency_values

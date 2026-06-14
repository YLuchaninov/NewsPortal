from __future__ import annotations

from collections.abc import Callable
from functools import wraps
from inspect import signature
from typing import Any, get_type_hints

from signalops.api import main_common as _main_common
from signalops.api import main_content as _main_content
from signalops.api import main_content_analysis as _main_content_analysis
from signalops.api import main_observability as _main_observability
from signalops.api import main_sequence as _main_sequence
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

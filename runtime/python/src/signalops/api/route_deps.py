from __future__ import annotations

from collections.abc import Iterator, Mapping
from dataclasses import dataclass
from typing import Any

ROUTE_DEPENDENCY_KEYS = (
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
    "archive_sequence_definition",
    "cancel_sequence_run_request",
    "create_agent_sequence_request",
    "create_content_analysis_policy",
    "create_content_filter_policy",
    "create_sequence_definition",
    "create_sequence_run_request",
    "get_signal_candidate",
    "get_signal_candidate_explain",
    "get_channel",
    "get_content_analysis_policy",
    "get_content_analysis_result",
    "get_content_filter_policy",
    "get_content_item",
    "get_content_item_explain",
    "get_dashboard_summary",
    "get_llm_template",
    "get_sequence_definition",
    "get_sequence_run",
    "get_system_interest",
    "get_web_resource",
    "list_agent_sequence_tools",
    "list_signal_candidate_residuals",
    "list_signal_candidates",
    "list_channels",
    "list_clusters",
    "list_content_analysis_policies",
    "list_content_analysis_results",
    "list_content_entities",
    "list_content_filter_policies",
    "list_content_filter_results",
    "list_content_items",
    "list_content_labels",
    "list_llm_templates",
    "list_reindex_jobs",
    "list_sequence_plugins",
    "list_sequence_task_runs",
    "list_sequences_page",
    "list_system_interests",
    "list_system_selected_content_items",
    "list_user_interests",
    "list_user_matches",
    "list_user_notifications",
    "list_web_resources",
    "preview_content_filter_policy",
    "raise_sequence_http_exception",
    "request_signal_candidate_enrichment_retry_route",
    "request_content_analysis_backfill",
    "request_content_item_enrichment_retry_route",
    "retry_sequence_run_request",
    "summarize_signal_candidate_residuals",
    "summarize_signal_candidate_selection_counts",
    "update_content_analysis_policy",
    "update_content_filter_policy",
    "update_sequence_definition",
)


@dataclass(frozen=True)
class ApiRouteDependencyValues:
    AgentSequenceCreatePayload: Any
    SequenceCancelPayload: Any
    SequenceConflictError: Any
    SequenceCreatePayload: Any
    SequenceDispatchError: Any
    SequenceManualRunPayload: Any
    SequenceNotFoundError: Any
    SequenceRetryRunPayload: Any
    SequenceUpdatePayload: Any
    SequenceValidationError: Any
    archive_sequence_definition: Any
    cancel_sequence_run_request: Any
    create_agent_sequence_request: Any
    create_content_analysis_policy: Any
    create_content_filter_policy: Any
    create_sequence_definition: Any
    create_sequence_run_request: Any
    get_signal_candidate: Any
    get_signal_candidate_explain: Any
    get_channel: Any
    get_content_analysis_policy: Any
    get_content_analysis_result: Any
    get_content_filter_policy: Any
    get_content_item: Any
    get_content_item_explain: Any
    get_dashboard_summary: Any
    get_llm_template: Any
    get_sequence_definition: Any
    get_sequence_run: Any
    get_system_interest: Any
    get_web_resource: Any
    list_agent_sequence_tools: Any
    list_signal_candidate_residuals: Any
    list_signal_candidates: Any
    list_channels: Any
    list_clusters: Any
    list_content_analysis_policies: Any
    list_content_analysis_results: Any
    list_content_entities: Any
    list_content_filter_policies: Any
    list_content_filter_results: Any
    list_content_items: Any
    list_content_labels: Any
    list_llm_templates: Any
    list_reindex_jobs: Any
    list_sequence_plugins: Any
    list_sequence_task_runs: Any
    list_sequences_page: Any
    list_system_interests: Any
    list_system_selected_content_items: Any
    list_user_interests: Any
    list_user_matches: Any
    list_user_notifications: Any
    list_web_resources: Any
    preview_content_filter_policy: Any
    raise_sequence_http_exception: Any
    request_signal_candidate_enrichment_retry_route: Any
    request_content_analysis_backfill: Any
    request_content_item_enrichment_retry_route: Any
    retry_sequence_run_request: Any
    summarize_signal_candidate_residuals: Any
    summarize_signal_candidate_selection_counts: Any
    update_content_analysis_policy: Any
    update_content_filter_policy: Any
    update_sequence_definition: Any



@dataclass(frozen=True)
class ApiRouteDependencies(Mapping[str, Any]):
    values: Mapping[str, Any]

    def __getitem__(self, key: str) -> Any:
        if key not in ROUTE_DEPENDENCY_KEYS:
            raise KeyError(f"API route dependency {key} is not declared.")
        try:
            return self.values[key]
        except KeyError as error:
            raise KeyError(f"API route dependency {key} is missing.") from error

    def __iter__(self) -> Iterator[str]:
        return iter(ROUTE_DEPENDENCY_KEYS)

    def __len__(self) -> int:
        return len(ROUTE_DEPENDENCY_KEYS)

    def as_dict(self) -> dict[str, Any]:
        return {key: self[key] for key in ROUTE_DEPENDENCY_KEYS}


def build_route_deps(values: ApiRouteDependencyValues) -> ApiRouteDependencies:
    return ApiRouteDependencies({key: getattr(values, key) for key in ROUTE_DEPENDENCY_KEYS})

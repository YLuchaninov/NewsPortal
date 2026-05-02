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
    "compile_discovery_mission_graph_route",
    "create_agent_sequence_request",
    "create_content_analysis_policy",
    "create_content_filter_policy",
    "create_discovery_class_route",
    "create_discovery_feedback_route",
    "create_discovery_mission_route",
    "create_discovery_policy_profile_route",
    "create_discovery_recall_candidate_route",
    "create_discovery_recall_mission_route",
    "create_sequence_definition",
    "create_sequence_run_request",
    "delete_discovery_class_route",
    "delete_discovery_mission_route",
    "delete_discovery_policy_profile_route",
    "get_article",
    "get_article_explain",
    "get_channel",
    "get_content_analysis_policy",
    "get_content_analysis_result",
    "get_content_filter_policy",
    "get_content_item",
    "get_content_item_explain",
    "get_dashboard_summary",
    "get_discovery_candidate_route",
    "get_discovery_class_route",
    "get_discovery_cost_summary_route",
    "get_discovery_hypothesis_route",
    "get_discovery_mission_route",
    "get_discovery_policy_profile_route",
    "get_discovery_portfolio_snapshot_route",
    "get_discovery_recall_candidate_route",
    "get_discovery_recall_mission_route",
    "get_discovery_source_interest_score_route",
    "get_discovery_source_profile_route",
    "get_discovery_source_quality_snapshot_route",
    "get_discovery_summary_route",
    "get_llm_template",
    "get_sequence_definition",
    "get_sequence_run",
    "get_system_interest",
    "get_web_resource",
    "list_agent_sequence_tools",
    "list_article_residuals",
    "list_articles",
    "list_channels",
    "list_clusters",
    "list_content_analysis_policies",
    "list_content_analysis_results",
    "list_content_entities",
    "list_content_filter_policies",
    "list_content_filter_results",
    "list_content_items",
    "list_content_labels",
    "list_discovery_candidates",
    "list_discovery_classes",
    "list_discovery_feedback",
    "list_discovery_hypotheses",
    "list_discovery_missions",
    "list_discovery_policy_profiles",
    "list_discovery_recall_candidates",
    "list_discovery_recall_missions",
    "list_discovery_source_interest_scores",
    "list_discovery_source_profiles",
    "list_discovery_source_quality_snapshots",
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
    "promote_discovery_recall_candidate_route",
    "raise_sequence_http_exception",
    "re_evaluate_discovery_sources_route",
    "request_article_enrichment_retry_route",
    "request_content_analysis_backfill",
    "request_content_item_enrichment_retry_route",
    "request_discovery_mission_run_route",
    "request_discovery_recall_mission_acquisition_route",
    "retry_sequence_run_request",
    "summarize_article_residuals",
    "update_content_analysis_policy",
    "update_content_filter_policy",
    "update_discovery_candidate_route",
    "update_discovery_class_route",
    "update_discovery_mission_route",
    "update_discovery_policy_profile_route",
    "update_discovery_recall_candidate_route",
    "update_discovery_recall_mission_route",
    "update_sequence_definition",
)


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


def build_route_deps(namespace: Mapping[str, Any]) -> ApiRouteDependencies:
    missing = [key for key in ROUTE_DEPENDENCY_KEYS if key not in namespace]
    if missing:
        missing_text = ", ".join(missing)
        raise RuntimeError(f"API route dependency map is missing: {missing_text}")
    return ApiRouteDependencies({key: namespace[key] for key in ROUTE_DEPENDENCY_KEYS})

# ruff: noqa: F401
from __future__ import annotations

import os as _os
import uuid
from typing import Any, Literal, Mapping

import psycopg
from fastapi import HTTPException, Query
from psycopg.rows import dict_row

from signalops.api.api_app import ApiAppContext, create_api_app
from signalops.api.database import (
    build_database_url,
    query_all,
    query_one,
)
from signalops.api import channel_adapters as _channel_adapters
from signalops.api import channel_read_model as _channel_read_model
from signalops.api import cluster_read_model as _cluster_read_model
from signalops.api import signal_candidate_list_read_model as _signal_candidate_list_read_model
from signalops.api import signal_candidate_residual_read_model as _signal_candidate_residual_read_model
from signalops.api import content_analysis_backfill as _content_analysis_backfill
from signalops.api import content_analysis_payloads as _content_analysis_payloads
from signalops.api import content_analysis_policies as _content_analysis_policies
from signalops.api import content_analysis_read_model as _content_analysis_read_model
from signalops.api import content_detail_read_model as _content_detail_read_model
from signalops.api import content_item_list_read_model as _content_item_list_read_model
from signalops.api import content_query as _content_query
from signalops.api import dashboard_read_model as _dashboard_read_model
from signalops.api import json_read_model as _json_read_model
from signalops.api import llm_review_read_model as _llm_review_read_model
from signalops.api import notification_read_model as _notification_read_model
from signalops.api import reindex_read_model as _reindex_read_model
from signalops.api import sequence_commands as _sequence_commands
from signalops.api import sequence_payloads as _sequence_payloads
from signalops.api import sequence_route_compat as _sequence_route_compat
from signalops.api import sequence_read_model as _sequence_read_model
from signalops.api import system_interest_read_model as _system_interest_read_model
from signalops.api import user_interest_read_model as _user_interest_read_model
from signalops.api import user_match_read_model as _user_match_read_model
from signalops.api import web_resource_read_model as _web_resource_read_model
from signalops.api.content_selection_read_model import (
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
from signalops.api.pagination import build_paginated_response, resolve_pagination
from signalops.api.route_deps import ApiRouteDependencyValues, build_route_deps
from signalops.api.llm_review_budget import (
    coerce_llm_review_cost_usd,
    llm_review_accept_gray_zone_on_budget_exhaustion,
    llm_review_cost_usd_to_cents,
    llm_review_enabled,
    llm_review_month_start_utc,
    llm_review_monthly_budget_cents,
)
from signalops.api.status_constants import (
    SEQUENCE_RUN_CANCELLABLE_STATUSES,
)
from signalops.api.sequence_worker_boundary import (
    RESERVED_CONTEXT_KEYS,
    parse_cron_expression,
    dispatch_sequence_run_job,
    SequenceQueueDispatchError,
    TASK_REGISTRY,
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


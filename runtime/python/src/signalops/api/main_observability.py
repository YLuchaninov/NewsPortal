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


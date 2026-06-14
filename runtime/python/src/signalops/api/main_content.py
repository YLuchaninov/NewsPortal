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

from signalops.api.main_content_analysis import (
    build_content_analysis_filter_clause,
    load_content_analysis_summary,
    normalize_content_filter_decision,
    normalize_content_analysis_subject_id,
    normalize_content_analysis_subject_type,
)

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

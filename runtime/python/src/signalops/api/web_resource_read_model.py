from __future__ import annotations

from typing import Any, Callable


WEB_RESOURCE_EXTRACTION_STATES = {"pending", "enriched", "skipped", "failed"}
WEB_RESOURCE_KINDS = {
    "editorial",
    "listing",
    "entity",
    "document",
    "data_file",
    "api_payload",
    "unknown",
}
WEB_RESOURCE_PROJECTION_FILTERS = {"all", "projected", "resource_only"}


class UnsupportedWebResourceExtractionStateError(ValueError):
    pass


class UnsupportedWebResourceProjectionError(ValueError):
    pass


class UnsupportedWebResourceKindError(ValueError):
    pass


class WebResourceNotFoundError(LookupError):
    pass


def list_web_resources_page(
    *,
    limit: int,
    page: int | None,
    page_size: int | None,
    channel_id: str | None,
    extraction_state: str | None,
    projection: str,
    resource_kind: str | None,
    entity_type: str | None,
    entity_text: str | None,
    entity_normalized_key: str | None,
    label_type: str | None,
    label_key: str | None,
    content_filter_passed: bool | None,
    content_filter_decision: str | None,
    resolve_pagination_func: Callable[
        [int | None, int | None, int], tuple[bool, int, int, int]
    ],
    query_all_func: Callable[..., list[dict[str, Any]]],
    query_count_func: Callable[..., int],
    build_paginated_response_func: Callable[
        [list[dict[str, Any]], int, int, int], dict[str, Any]
    ],
    build_content_analysis_filter_clause_func: Callable[..., tuple[list[str], list[Any]]],
    normalize_content_filter_decision_func: Callable[[str | None], str | None],
    apply_resource_selection_payload_func: Callable[..., dict[str, Any]],
) -> dict[str, Any] | list[dict[str, Any]]:
    if extraction_state and extraction_state not in WEB_RESOURCE_EXTRACTION_STATES:
        raise UnsupportedWebResourceExtractionStateError
    if projection not in WEB_RESOURCE_PROJECTION_FILTERS:
        raise UnsupportedWebResourceProjectionError
    if resource_kind and resource_kind not in WEB_RESOURCE_KINDS:
        raise UnsupportedWebResourceKindError

    resource_filters = ["sc.provider_type = 'website'"]
    params: list[Any] = []
    if channel_id:
        resource_filters.append("wr.channel_id = %s")
        params.append(channel_id)
    if extraction_state:
        resource_filters.append("wr.extraction_state = %s")
        params.append(extraction_state)
    if resource_kind:
        resource_filters.append("wr.resource_kind = %s")
        params.append(resource_kind)
    if projection == "projected":
        resource_filters.append("wr.projected_signal_candidate_id is not null")
    elif projection == "resource_only":
        resource_filters.append("wr.projected_signal_candidate_id is null")
    analysis_filters, analysis_params = build_content_analysis_filter_clause_func(
        subject_alias="wr.resource_id",
        subject_type="web_resource",
        entity_type=entity_type,
        entity_text=entity_text,
        entity_normalized_key=entity_normalized_key,
        label_type=label_type,
        label_key=label_key,
        content_filter_passed=content_filter_passed,
        content_filter_decision=normalize_content_filter_decision_func(
            content_filter_decision
        ),
    )
    resource_filters.extend(analysis_filters)
    params.extend(analysis_params)

    where_clause = f"where {' and '.join(resource_filters)}" if resource_filters else ""
    content_item_ready_expr = "false"
    resource_select = f"""
        select
          wr.resource_id::text as resource_id,
          sc.channel_id::text as channel_id,
          sc.name as channel_name,
          wr.url,
          wr.final_url,
          wr.normalized_url,
          wr.title,
          wr.summary,
          wr.lang,
          wr.published_at,
          wr.discovered_at,
          wr.updated_at,
          wr.resource_kind,
          wr.discovery_source,
          wr.extraction_state,
          wr.extraction_error,
          wr.projection_state,
          wr.projection_error,
          wr.projected_signal_candidate_id::text as projected_signal_candidate_id,
          pa.title as projected_signal_candidate_title,
          case
            when {content_item_ready_expr}
            then 'resource:' || wr.resource_id::text
            else null
          end as content_item_id,
          ({content_item_ready_expr}) as content_item_ready,
          sfr.decision as system_feed_decision,
          sfr.eligible_for_feed as system_feed_eligible,
          fsr.final_decision as final_selection_decision,
          fsr.is_selected as final_selection_selected,
          fsr.verification_state as final_selection_verification_state,
          fsr.explain_json ->> 'selectionMode' as final_selection_mode,
          fsr.explain_json ->> 'selectionSummary' as final_selection_summary,
          fsr.explain_json ->> 'selectionReason' as final_selection_reason,
          coalesce(
            nullif(fsr.explain_json -> 'filterCounts' ->> 'llmReviewPending', '')::int,
            0
          ) as final_selection_llm_review_pending_count,
          coalesce(
            nullif(fsr.explain_json -> 'filterCounts' ->> 'hold', '')::int,
            0
          ) as final_selection_hold_count,
          coalesce((fsr.explain_json ->> 'canonicalReviewReused')::boolean, false)
            as final_selection_canonical_review_reused,
          coalesce((fsr.explain_json ->> 'canonicalReviewReusedCount')::int, 0)
            as final_selection_canonical_review_reused_count,
          coalesce((fsr.explain_json ->> 'canonicalSelectionReused')::boolean, false)
            as final_selection_canonical_selection_reused,
          coalesce((fsr.explain_json ->> 'duplicateSignalCandidateCountForCanonical')::int, 0)
            as final_selection_duplicate_signal_candidate_count_for_canonical,
          fsr.explain_json ->> 'selectionReuseSource' as final_selection_reuse_source,
          jsonb_array_length(coalesce(wr.documents_json, '[]'::jsonb))::int as documents_count,
          jsonb_array_length(coalesce(wr.media_json, '[]'::jsonb))::int as media_count,
          jsonb_array_length(coalesce(wr.links_out_json, '[]'::jsonb))::int as links_out_count,
          jsonb_array_length(coalesce(wr.child_resources_json, '[]'::jsonb))::int as child_resources_count
        from web_resources wr
        join source_channels sc on sc.channel_id = wr.channel_id
        left join signal_candidates pa on pa.doc_id = wr.projected_signal_candidate_id
        left join final_selection_results fsr on fsr.doc_id = wr.projected_signal_candidate_id
        left join system_feed_results sfr on sfr.doc_id = wr.projected_signal_candidate_id
        {where_clause}
        order by coalesce(wr.published_at, wr.discovered_at) desc nulls last, wr.updated_at desc, wr.resource_id
    """
    paginate, resolved_page, resolved_page_size, offset = resolve_pagination_func(
        page, page_size, limit
    )
    if not paginate:
        return [
            apply_resource_selection_payload_func(row)
            for row in query_all_func(
                f"{resource_select}\nlimit %s",
                tuple([*params, limit]),
            )
        ]

    count_sql = """
        select count(*)::int as total
        from web_resources wr
        join source_channels sc on sc.channel_id = wr.channel_id
    """
    if where_clause:
        count_sql = f"{count_sql}\n{where_clause}"
    total = query_count_func(count_sql, tuple(params))
    items = query_all_func(
        f"{resource_select}\nlimit %s\noffset %s",
        tuple([*params, resolved_page_size, offset]),
    )
    items = [apply_resource_selection_payload_func(row) for row in items]
    return build_paginated_response_func(items, resolved_page, resolved_page_size, total)


def get_web_resource(
    resource_id: str,
    *,
    query_one_func: Callable[[str, tuple[Any, ...]], dict[str, Any] | None],
    query_all_func: Callable[..., list[dict[str, Any]]],
    apply_resource_selection_payload_func: Callable[..., dict[str, Any]],
    load_content_analysis_summary_func: Callable[..., dict[str, Any]],
) -> dict[str, Any]:
    content_item_ready_expr = "false"
    resource = query_one_func(
        f"""
        select
          wr.resource_id::text as resource_id,
          sc.channel_id::text as channel_id,
          sc.name as channel_name,
          wr.url,
          wr.final_url,
          wr.normalized_url,
          wr.title,
          wr.summary,
          wr.body,
          wr.body_html,
          wr.lang,
          wr.published_at,
          wr.discovered_at,
          wr.updated_at,
          wr.resource_kind,
          wr.discovery_source,
          wr.extraction_state,
          wr.extraction_error,
          wr.projection_state,
          wr.projection_error,
          wr.projected_signal_candidate_id::text as projected_signal_candidate_id,
          pa.title as projected_signal_candidate_title,
          case
            when {content_item_ready_expr}
            then 'resource:' || wr.resource_id::text
            else null
          end as content_item_id,
          ({content_item_ready_expr}) as content_item_ready,
          sfr.decision as system_feed_decision,
          sfr.eligible_for_feed as system_feed_eligible,
          fsr.final_decision as final_selection_decision,
          fsr.is_selected as final_selection_selected,
          fsr.verification_state as final_selection_verification_state,
          fsr.explain_json ->> 'selectionMode' as final_selection_mode,
          fsr.explain_json ->> 'selectionSummary' as final_selection_summary,
          fsr.explain_json ->> 'selectionReason' as final_selection_reason,
          coalesce(
            nullif(fsr.explain_json -> 'filterCounts' ->> 'llmReviewPending', '')::int,
            0
          ) as final_selection_llm_review_pending_count,
          coalesce(
            nullif(fsr.explain_json -> 'filterCounts' ->> 'hold', '')::int,
            0
          ) as final_selection_hold_count,
          coalesce((fsr.explain_json ->> 'canonicalReviewReused')::boolean, false)
            as final_selection_canonical_review_reused,
          coalesce((fsr.explain_json ->> 'canonicalReviewReusedCount')::int, 0)
            as final_selection_canonical_review_reused_count,
          coalesce((fsr.explain_json ->> 'canonicalSelectionReused')::boolean, false)
            as final_selection_canonical_selection_reused,
          coalesce((fsr.explain_json ->> 'duplicateSignalCandidateCountForCanonical')::int, 0)
            as final_selection_duplicate_signal_candidate_count_for_canonical,
          fsr.explain_json ->> 'selectionReuseSource' as final_selection_reuse_source,
          jsonb_array_length(coalesce(wr.documents_json, '[]'::jsonb))::int as documents_count,
          jsonb_array_length(coalesce(wr.media_json, '[]'::jsonb))::int as media_count,
          jsonb_array_length(coalesce(wr.links_out_json, '[]'::jsonb))::int as links_out_count,
          jsonb_array_length(coalesce(wr.child_resources_json, '[]'::jsonb))::int as child_resources_count,
          wr.classification_json,
          wr.attributes_json,
          wr.documents_json,
          wr.media_json,
          wr.links_out_json,
          wr.child_resources_json,
          wr.raw_payload_json
        from web_resources wr
        join source_channels sc on sc.channel_id = wr.channel_id
        left join signal_candidates pa on pa.doc_id = wr.projected_signal_candidate_id
        left join final_selection_results fsr on fsr.doc_id = wr.projected_signal_candidate_id
        left join system_feed_results sfr on sfr.doc_id = wr.projected_signal_candidate_id
        where wr.resource_id = %s
        """,
        (resource_id,),
    )
    if resource is None:
        raise WebResourceNotFoundError
    interest_filter_results: list[dict[str, Any]] = []
    llm_reviews: list[dict[str, Any]] = []
    notifications: list[dict[str, Any]] = []
    projected_signal_candidate_id = str(resource.get("projected_signal_candidate_id") or "").strip()
    if projected_signal_candidate_id:
        interest_filter_results = query_all_func(
            """
            select *
            from interest_filter_results
            where doc_id = %s
            order by filter_scope, created_at desc
            """,
            (projected_signal_candidate_id,),
        )
        llm_reviews = query_all_func(
            """
            select *
            from llm_review_log
            where doc_id = %s
            order by created_at desc
            """,
            (projected_signal_candidate_id,),
        )
        notifications = query_all_func(
            """
            select *
            from notification_log
            where doc_id = %s
            order by created_at desc
            """,
            (projected_signal_candidate_id,),
        )
    resource = apply_resource_selection_payload_func(
        resource,
        interest_filter_results=interest_filter_results,
        llm_reviews=llm_reviews,
        notifications=notifications,
    )
    resource["analysis_summary"] = load_content_analysis_summary_func(
        subject_type="web_resource",
        subject_id=resource_id,
    )
    return resource

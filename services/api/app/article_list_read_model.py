from __future__ import annotations

from typing import Any, Callable


def summarize_article_selection_counts(
    *,
    query_all_func: Callable[[str, tuple[Any, ...]], list[dict[str, Any]]],
    query_count_func: Callable[[str, tuple[Any, ...]], int],
) -> dict[str, Any]:
    raw_article_observations = query_count_func(
        "select count(*)::int as total from articles",
        (),
    )
    blocked_article_observations = query_count_func(
        """
        select count(*)::int as total
        from articles
        where visibility_state = 'blocked'
        """,
        (),
    )
    pending_selection_rows = query_count_func(
        """
        select count(*)::int as total
        from articles a
        left join final_selection_results fsr on fsr.doc_id = a.doc_id
        where fsr.doc_id is null
        """,
        (),
    )
    decision_rows = query_all_func(
        """
        select
          coalesce(final_decision, 'unknown') as decision,
          count(*)::int as count,
          count(*) filter (where is_selected = true)::int as selected_count,
          count(*) filter (
            where coalesce(explain_json ->> 'selectionMode', '') = 'hold'
          )::int as hold_count,
          count(*) filter (
            where coalesce(explain_json ->> 'selectionMode', '') = 'llm_review_pending'
              or coalesce((explain_json -> 'filterCounts' ->> 'llmReviewPending')::int, 0) > 0
          )::int as llm_review_pending_count
        from final_selection_results
        group by coalesce(final_decision, 'unknown')
        order by decision
        """,
        (),
    )
    by_decision = {
        str(row.get("decision") or "unknown"): int(row.get("count") or 0)
        for row in decision_rows
    }
    selected_article_signals = sum(
        int(row.get("selected_count") or 0) for row in decision_rows
    )
    hold_rows = sum(int(row.get("hold_count") or 0) for row in decision_rows)
    llm_review_pending_rows = sum(
        int(row.get("llm_review_pending_count") or 0) for row in decision_rows
    )
    materialized_selection_rows = sum(by_decision.values())
    rejected_rows = by_decision.get("rejected", 0)
    gray_zone_rows = by_decision.get("gray_zone", 0)
    return {
        "sourceOfTruth": {
            "rawArticleObservations": "articles",
            "articleSelection": "final_selection_results",
            "publicSelectedContent": "content_items",
        },
        "counts": {
            "rawArticleObservations": raw_article_observations,
            "materializedSelectionRows": materialized_selection_rows,
            "pendingSelectionRows": pending_selection_rows,
            "selectedArticleSignals": selected_article_signals,
            "rejectedRows": rejected_rows,
            "grayZoneRows": gray_zone_rows,
            "holdRows": hold_rows,
            "llmReviewPendingRows": llm_review_pending_rows,
            "blockedArticleObservations": blocked_article_observations,
        },
        "byDecision": [
            {"decision": decision, "count": count}
            for decision, count in sorted(by_decision.items())
        ],
        "interpretation": (
            "Raw article observations are the ingested corpus. Selected lead signals are "
            "materialized separately by final_selection_results/content_items, so a high "
            "article count can coexist with zero selected signals after strict calibration."
        ),
    }


def list_articles(
    *,
    limit: int,
    entity_type: str | None,
    entity_text: str | None,
    entity_normalized_key: str | None,
    label_type: str | None,
    label_key: str | None,
    content_filter_passed: bool | None,
    content_filter_decision: str | None,
    channel_id: str | None,
    final_selection_decision: str | None,
    selection_mode: str | None,
    visibility_state: str | None,
    q: str | None,
    page: int | None,
    page_size: int | None,
    build_content_analysis_filter_clause_func: Callable[..., tuple[list[str], list[Any]]],
    normalize_content_filter_decision_func: Callable[[str | None], str | None],
    article_preview_projection_func: Callable[[str, str, str], str],
    article_observation_join_clause_func: Callable[[str, str], str],
    final_selection_join_clause_func: Callable[[str, str], str],
    system_feed_join_clause_func: Callable[[str, str], str],
    primary_media_join_clause_func: Callable[[str, str], str],
    resolve_pagination_func: Callable[
        [int | None, int | None, int], tuple[bool, int, int, int]
    ],
    query_all_func: Callable[[str, tuple[Any, ...]], list[dict[str, Any]]],
    query_count_func: Callable[[str, tuple[Any, ...]], int],
    build_paginated_response_func: Callable[
        [list[dict[str, Any]], int, int, int], dict[str, Any]
    ],
    apply_article_selection_payload_func: Callable[[dict[str, Any]], dict[str, Any]],
) -> dict[str, Any] | list[dict[str, Any]]:
    filters, params = build_content_analysis_filter_clause_func(
        subject_alias="a.doc_id",
        subject_type="article",
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
    if channel_id:
        filters.append("a.channel_id = %s")
        params.append(channel_id)
    if final_selection_decision:
        filters.append("fsr.final_decision = %s")
        params.append(final_selection_decision)
    if selection_mode:
        filters.append("coalesce(fsr.explain_json ->> 'selectionMode', '') = %s")
        params.append(selection_mode)
    if visibility_state:
        filters.append("a.visibility_state = %s")
        params.append(visibility_state)
    normalized_query = q.strip() if q else ""
    if normalized_query:
        escaped_query = (
            normalized_query.replace("\\", "\\\\")
            .replace("%", "\\%")
            .replace("_", "\\_")
        )
        filters.append(
            "concat_ws(' ', coalesce(a.title, ''), coalesce(a.lead, ''), coalesce(a.url, '')) ilike %s escape '\\'"
        )
        params.append(f"%{escaped_query}%")
    where_clause = f"where {' and '.join(filters)}" if filters else ""
    article_select = f"""
        select
          a.doc_id,
          a.url,
          a.title,
          a.lead,
          a.lang,
          a.published_at,
          a.processing_state,
          a.visibility_state,
          a.event_cluster_id,
          obs.observation_state,
          obs.duplicate_kind,
          obs.canonical_document_id::text as canonical_document_id,
          fsr.final_decision as final_selection_decision,
          fsr.is_selected as final_selection_selected,
          fsr.verification_state as final_selection_verification_state,
          fsr.explain_json ->> 'selectionMode' as final_selection_mode,
          fsr.explain_json ->> 'selectionSummary' as final_selection_summary,
          fsr.explain_json ->> 'selectionReason' as final_selection_reason,
          coalesce((fsr.explain_json -> 'filterCounts' ->> 'llmReviewPending')::int, 0)
            as final_selection_llm_review_pending_count,
          coalesce((fsr.explain_json -> 'filterCounts' ->> 'hold')::int, 0)
            as final_selection_hold_count,
          coalesce((fsr.explain_json ->> 'canonicalReviewReused')::boolean, false)
            as final_selection_canonical_review_reused,
          coalesce((fsr.explain_json ->> 'canonicalReviewReusedCount')::int, 0)
            as final_selection_canonical_review_reused_count,
          coalesce((fsr.explain_json ->> 'canonicalSelectionReused')::boolean, false)
            as final_selection_canonical_selection_reused,
          coalesce((fsr.explain_json ->> 'duplicateArticleCountForCanonical')::int, 0)
            as final_selection_duplicate_article_count_for_canonical,
          fsr.explain_json ->> 'selectionReuseSource' as final_selection_reuse_source,
          fsr.story_cluster_id::text as story_cluster_id,
          fsr.verification_target_type,
          fsr.verification_target_id::text as verification_target_id,
          sfr.decision as system_feed_decision,
          coalesce(sfr.eligible_for_feed, false) as system_feed_eligible,
          {article_preview_projection_func("a", "sc", "pma")},
          coalesce(ars.like_count, 0) as like_count,
          coalesce(ars.dislike_count, 0) as dislike_count
        from articles a
        join source_channels sc on sc.channel_id = a.channel_id
        {article_observation_join_clause_func("a", "obs")}
        {final_selection_join_clause_func("a", "fsr")}
        {system_feed_join_clause_func("a", "sfr")}
        {primary_media_join_clause_func("a", "pma")}
        left join article_reaction_stats ars on ars.doc_id = a.doc_id
        {where_clause}
        order by a.published_at desc nulls last, a.ingested_at desc
    """
    paginate, resolved_page, resolved_page_size, offset = resolve_pagination_func(
        page, page_size, limit
    )

    def with_article_selection_payload(
        rows: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        return [apply_article_selection_payload_func(row) for row in rows]

    if not paginate:
        return with_article_selection_payload(
            query_all_func(f"{article_select}\nlimit %s", tuple([*params, limit]))
        )

    total = query_count_func(
        f"""
        select count(*)::int as total
        from articles a
        {final_selection_join_clause_func("a", "fsr")}
        {where_clause}
        """,
        tuple(params),
    )
    items = with_article_selection_payload(
        query_all_func(
            f"{article_select}\nlimit %s\noffset %s",
            tuple([*params, resolved_page_size, offset]),
        )
    )
    return build_paginated_response_func(items, resolved_page, resolved_page_size, total)

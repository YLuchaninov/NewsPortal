from __future__ import annotations

from typing import Any, Callable


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

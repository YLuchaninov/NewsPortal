from __future__ import annotations

from typing import Any, Callable

from services.api.app.content_query import (
    build_web_content_order_clause,
    build_web_content_search_clause,
    normalize_web_content_list_sort,
    normalize_web_content_search_query,
    strip_web_content_internal_fields,
)
from services.api.app.content_selection_read_model import (
    canonical_signal_candidate_family_expr,
    effective_system_selected_expr,
    effective_system_selection_decision_expr,
    feed_eligible_signal_candidate_clause,
    final_selection_join_clause,
    primary_media_join_clause,
    system_feed_join_clause,
)


def list_user_matches(
    *,
    user_id: str,
    limit: int,
    page: int | None,
    page_size: int | None,
    sort: str | None,
    q: str | None,
    resolve_pagination_func: Callable[
        [int | None, int | None, int], tuple[bool, int, int, int]
    ],
    query_all_func: Callable[..., list[dict[str, Any]]],
    query_count_func: Callable[..., int],
    build_paginated_response_func: Callable[
        [list[dict[str, Any]], int, int, int], dict[str, Any]
    ],
) -> dict[str, Any] | list[dict[str, Any]]:
    family_expr = canonical_signal_candidate_family_expr("a")
    ranked_match_select = f"""
        select
          {repr('signal_candidate:')} || a.doc_id::text as content_item_id,
          coalesce(a.content_kind, 'editorial')::text as content_kind,
          'signal_candidate'::text as origin_type,
          a.doc_id::text as origin_id,
          a.url,
          a.title,
          a.lead as summary,
          a.lead,
          a.lang,
          a.published_at,
          a.ingested_at,
          a.updated_at,
          a.has_media,
          coalesce(a.extracted_source_name, sc.name) as source_name,
          a.extracted_author as author_name,
          a.extracted_ttr_seconds as read_time_seconds,
          pma.media_kind as primary_media_kind,
          coalesce(pma.thumbnail_url, pma.source_url) as primary_media_url,
          pma.thumbnail_url as primary_media_thumbnail_url,
          pma.source_url as primary_media_source_url,
          pma.title as primary_media_title,
          pma.alt_text as primary_media_alt_text,
          coalesce(ars.like_count, 0) as like_count,
          coalesce(ars.dislike_count, 0) as dislike_count,
          {effective_system_selection_decision_expr("fsr", "sfr")} as system_selection_decision,
          {effective_system_selected_expr("fsr", "sfr")} as system_selected,
          imr.interest_id::text as matched_interest_id,
          ui.description as matched_interest_description,
          imr.score_interest as interest_match_score,
          imr.decision as interest_match_decision,
          nullif(lower(btrim(coalesce(a.title, ''))), '') as _normalized_title,
          concat_ws(' ', coalesce(a.title, ''), coalesce(a.lead, ''), coalesce(a.body, '')) as _search_text,
          row_number() over (
            partition by {family_expr}
            order by
              imr.score_interest desc nulls last,
              imr.created_at desc,
              case when a.doc_id = {family_expr} then 0 else 1 end,
              a.published_at desc nulls last,
              a.ingested_at desc,
              a.doc_id
          ) as family_rank
        from interest_match_results imr
        join signal_candidates a on a.doc_id = imr.doc_id
        join source_channels sc on sc.channel_id = a.channel_id
        join user_interests ui on ui.interest_id = imr.interest_id
        {final_selection_join_clause("a", "fsr")}
        {system_feed_join_clause("a", "sfr")}
        {primary_media_join_clause("a", "pma")}
        left join signal_candidate_reaction_stats ars on ars.doc_id = a.doc_id
        where imr.user_id = %s
          and imr.decision = 'notify'
          and {feed_eligible_signal_candidate_clause("a", "fsr", "sfr")}
    """
    paginate, resolved_page, resolved_page_size, offset = resolve_pagination_func(
        page, page_size, limit
    )
    ranked_params: tuple[Any, ...] = (user_id,)
    deduped_select = f"""
        select
          matched.content_item_id,
          matched.content_kind,
          matched.origin_type,
          matched.origin_id,
          matched.url,
          matched.title,
          matched.summary,
          matched.lead,
          matched.lang,
          matched.published_at,
          matched.ingested_at,
          matched.updated_at,
          matched.system_selection_decision,
          matched.system_selected,
          matched.has_media,
          matched.source_name,
          matched.author_name,
          matched.read_time_seconds,
          matched.primary_media_kind,
          matched.primary_media_url,
          matched.primary_media_thumbnail_url,
          matched.primary_media_source_url,
          matched.primary_media_title,
          matched.primary_media_alt_text,
          matched.like_count,
          matched.dislike_count,
          matched.matched_interest_id,
          matched.matched_interest_description,
          matched.interest_match_score,
          matched.interest_match_decision,
          matched._normalized_title,
          matched._search_text
        from ({ranked_match_select}) matched
        where matched.family_rank = 1
    """
    resolved_sort = normalize_web_content_list_sort(sort)
    resolved_query = normalize_web_content_search_query(q)
    visible_matches_select = f"select * from ({deduped_select}) matched_items"
    search_clause, search_params = build_web_content_search_clause(
        resolved_query, alias="matched_items"
    )
    order_clause = build_web_content_order_clause(
        resolved_sort, alias="matched_items"
    )
    if not paginate:
        return strip_web_content_internal_fields(
            query_all_func(
                f"""
                {visible_matches_select}
                {search_clause}
                {order_clause}
                limit %s
                """,
                tuple([*ranked_params, *search_params, limit]),
            )
        )

    filtered_select = f"""
        {visible_matches_select}
        {search_clause}
    """
    total = query_count_func(
        f"select count(*)::int as total from ({filtered_select}) counted",
        tuple([*ranked_params, *search_params]),
    )
    items = strip_web_content_internal_fields(
        query_all_func(
            f"""
            {filtered_select}
            {order_clause}
            limit %s
            offset %s
            """,
            tuple([*ranked_params, *search_params, resolved_page_size, offset]),
        )
    )
    return build_paginated_response_func(
        items, resolved_page, resolved_page_size, total
    )

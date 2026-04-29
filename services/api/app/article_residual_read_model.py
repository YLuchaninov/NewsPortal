from __future__ import annotations

from typing import Any, Callable, Mapping


def load_article_residual_rows(
    *,
    q: str | None = None,
    verification_state: str | None = None,
    processing_state: str | None = None,
    observation_state: str | None = None,
    duplicate_kind: str | None = None,
    normalize_web_content_search_query_func: Callable[[str | None], str | None],
    build_web_content_search_pattern_func: Callable[[str], str],
    query_all_func: Callable[[str, tuple[Any, ...]], list[dict[str, Any]]],
    article_preview_projection_func: Callable[[str, str, str], str],
    article_observation_join_clause_func: Callable[[str, str], str],
    final_selection_join_clause_func: Callable[[str, str], str],
    system_feed_join_clause_func: Callable[[str, str], str],
    primary_media_join_clause_func: Callable[[str, str], str],
) -> list[dict[str, Any]]:
    filters: list[str] = []
    params: list[Any] = []
    resolved_query = normalize_web_content_search_query_func(q)
    verification_expr = (
        "coalesce(fsr.verification_state, st.verification_state, vrc.verification_state)"
    )
    if verification_state:
        filters.append(f"{verification_expr} = %s")
        params.append(verification_state)
    if processing_state:
        filters.append("a.processing_state = %s")
        params.append(processing_state)
    if observation_state:
        filters.append("obs.observation_state = %s")
        params.append(observation_state)
    if duplicate_kind:
        filters.append("obs.duplicate_kind = %s")
        params.append(duplicate_kind)
    if resolved_query:
        pattern = build_web_content_search_pattern_func(resolved_query)
        filters.append(
            """
            (
              coalesce(a.title, '') ilike %s escape '\\'
              or coalesce(a.lead, '') ilike %s escape '\\'
              or coalesce(a.body, '') ilike %s escape '\\'
              or coalesce(a.url, '') ilike %s escape '\\'
            )
            """
        )
        params.extend([pattern, pattern, pattern, pattern])

    where_clause = f"where {' and '.join(filters)}" if filters else ""
    return query_all_func(
        f"""
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
          coalesce(fsr.canonical_document_id, obs.canonical_document_id)::text as canonical_document_id,
          vrc.verification_state as canonical_verification_state,
          fsr.story_cluster_id::text as story_cluster_id,
          st.verification_state as story_cluster_verification_state,
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
          fsr.verification_target_type,
          fsr.verification_target_id::text as verification_target_id,
          sfr.decision as system_feed_decision,
          coalesce(sfr.eligible_for_feed, false) as system_feed_eligible,
          {article_preview_projection_func("a", "sc", "pma")},
          coalesce(ifc.system_criterion_rows, 0) as system_criterion_rows,
          coalesce(ifc.user_interest_rows, 0) as user_interest_rows,
          coalesce(ifc.matched_rows, 0) as matched_rows,
          coalesce(ifc.no_match_rows, 0) as no_match_rows,
          coalesce(ifc.gray_zone_rows, 0) as gray_zone_rows,
          coalesce(ifc.technical_filtered_out_rows, 0) as technical_filtered_out_rows,
          coalesce(llm.llm_review_rows, 0) as llm_review_rows,
          coalesce(notify.notification_rows, 0) as notification_rows
        from articles a
        join source_channels sc on sc.channel_id = a.channel_id
        {article_observation_join_clause_func("a", "obs")}
        {final_selection_join_clause_func("a", "fsr")}
        {system_feed_join_clause_func("a", "sfr")}
        left join canonical_documents cd
          on cd.canonical_document_id = coalesce(fsr.canonical_document_id, obs.canonical_document_id)
        left join story_cluster_members scm
          on scm.canonical_document_id = cd.canonical_document_id
        left join story_clusters st
          on st.story_cluster_id = coalesce(fsr.story_cluster_id, scm.story_cluster_id)
        left join verification_results vrc
          on vrc.target_type = 'canonical_document'
         and vrc.target_id = cd.canonical_document_id
        {primary_media_join_clause_func("a", "pma")}
        left join (
          select
            doc_id,
            count(*) filter (where filter_scope = 'system_criterion')::int as system_criterion_rows,
            count(*) filter (where filter_scope = 'user_interest')::int as user_interest_rows,
            count(*) filter (where semantic_decision = 'match')::int as matched_rows,
            count(*) filter (where semantic_decision = 'no_match')::int as no_match_rows,
            count(*) filter (where semantic_decision = 'gray_zone')::int as gray_zone_rows,
            count(*) filter (where technical_filter_state = 'filtered_out')::int
              as technical_filtered_out_rows
          from interest_filter_results
          group by doc_id
        ) ifc on ifc.doc_id = a.doc_id
        left join (
          select doc_id, count(*)::int as llm_review_rows
          from llm_review_log
          group by doc_id
        ) llm on llm.doc_id = a.doc_id
        left join (
          select doc_id, count(*)::int as notification_rows
          from notification_log
          group by doc_id
        ) notify on notify.doc_id = a.doc_id
        {where_clause}
        order by a.published_at desc nulls last, a.ingested_at desc, a.doc_id
        """,
        tuple(params),
    )


def build_article_residual_payload(
    article_like: Mapping[str, Any],
    *,
    apply_article_selection_payload_func: Callable[[Mapping[str, Any]], dict[str, Any]],
    build_selection_explain_payload_func: Callable[..., dict[str, Any]],
    build_selection_diagnostics_payload_from_counts_func: Callable[..., dict[str, Any]],
) -> dict[str, Any]:
    article = apply_article_selection_payload_func(article_like)
    selection_explain = build_selection_explain_payload_func(
        selection_like=article,
        final_selection_result=None,
        system_feed_result=None,
    )
    selection_diagnostics = build_selection_diagnostics_payload_from_counts_func(
        selection_explain=selection_explain,
        system_criterion_rows=int(article_like.get("system_criterion_rows") or 0),
        user_interest_rows=int(article_like.get("user_interest_rows") or 0),
        matched_rows=int(article_like.get("matched_rows") or 0),
        no_match_rows=int(article_like.get("no_match_rows") or 0),
        gray_zone_rows=int(article_like.get("gray_zone_rows") or 0),
        technical_filtered_out_rows=int(
            article_like.get("technical_filtered_out_rows") or 0
        ),
        llm_review_rows=int(article_like.get("llm_review_rows") or 0),
        notification_rows=int(article_like.get("notification_rows") or 0),
    )
    article["selection_explain"] = selection_explain
    article["selection_diagnostics"] = selection_diagnostics
    article["interest_filter_summary"] = {
        "systemCriterionRows": int(article_like.get("system_criterion_rows") or 0),
        "userInterestRows": int(article_like.get("user_interest_rows") or 0),
        "matchedRows": int(article_like.get("matched_rows") or 0),
        "noMatchRows": int(article_like.get("no_match_rows") or 0),
        "grayZoneRows": int(article_like.get("gray_zone_rows") or 0),
        "technicalFilteredOutRows": int(
            article_like.get("technical_filtered_out_rows") or 0
        ),
    }
    article["llm_review_row_count"] = int(article_like.get("llm_review_rows") or 0)
    article["notification_row_count"] = int(article_like.get("notification_rows") or 0)
    return article


def article_matches_residual_filters(
    article: Mapping[str, Any],
    *,
    downstream_loss_bucket: str | None = None,
    selection_blocker_stage: str | None = None,
    selection_blocker_reason: str | None = None,
    selection_mode: str | None = None,
) -> bool:
    diagnostics = article.get("selection_diagnostics")
    if diagnostics is None or not isinstance(diagnostics, dict):
        return False
    if (
        downstream_loss_bucket
        and str(diagnostics.get("downstreamLossBucket") or "").strip()
        != downstream_loss_bucket
    ):
        return False
    if (
        selection_blocker_stage
        and str(diagnostics.get("selectionBlockerStage") or "").strip()
        != selection_blocker_stage
    ):
        return False
    if (
        selection_blocker_reason
        and str(diagnostics.get("selectionBlockerReason") or "").strip()
        != selection_blocker_reason
    ):
        return False
    if selection_mode and str(article.get("selection_mode") or "").strip() != selection_mode:
        return False
    return True


def summarize_article_residual_rows(rows: list[Mapping[str, Any]]) -> dict[str, Any]:
    def count_by(values: list[str | None]) -> list[dict[str, Any]]:
        counts: dict[str, int] = {}
        for value in values:
            normalized = str(value or "").strip() or "unknown"
            counts[normalized] = counts.get(normalized, 0) + 1
        return [
            {"value": key, "count": count}
            for key, count in sorted(counts.items(), key=lambda item: (-item[1], item[0]))
        ]

    diagnostics = [
        row.get("selection_diagnostics")
        for row in rows
        if isinstance(row.get("selection_diagnostics"), dict)
    ]
    totals = {
        "selected": sum(1 for row in rows if row.get("selection_mode") == "selected"),
        "grayZone": sum(1 for row in rows if row.get("selection_mode") == "gray_zone"),
        "rejected": sum(1 for row in rows if row.get("selection_mode") == "rejected"),
        "technicalFiltered": sum(
            1
            for payload in diagnostics
            if payload.get("downstreamLossBucket") == "technical_filter_rejected"
        ),
        "semanticNoMatch": sum(
            1
            for payload in diagnostics
            if payload.get("downstreamLossBucket") == "semantic_rejected"
        ),
        "hold": sum(1 for payload in diagnostics if payload.get("selectionMode") == "hold"),
        "llmReviewPending": sum(
            1
            for payload in diagnostics
            if payload.get("selectionMode") == "llm_review_pending"
        ),
        "missingInterestFilterResults": sum(
            1
            for payload in diagnostics
            if payload.get("downstreamLossBucket")
            == "articles_missing_interest_filter_results"
        ),
    }
    return {
        "total": len(rows),
        "totals": totals,
        "groups": {
            "downstreamLossBuckets": count_by(
                [payload.get("downstreamLossBucket") for payload in diagnostics]
            ),
            "selectionBlockerStages": count_by(
                [payload.get("selectionBlockerStage") for payload in diagnostics]
            ),
            "selectionBlockerReasons": count_by(
                [payload.get("selectionBlockerReason") for payload in diagnostics]
            ),
            "selectionModes": count_by([row.get("selection_mode") for row in rows]),
            "verificationStates": count_by(
                [
                    row.get("final_selection_verification_state")
                    or row.get("story_cluster_verification_state")
                    or row.get("canonical_verification_state")
                    for row in rows
                ]
            ),
            "processingStates": count_by([row.get("processing_state") for row in rows]),
            "observationStates": count_by([row.get("observation_state") for row in rows]),
            "duplicateKinds": count_by([row.get("duplicate_kind") for row in rows]),
        },
    }


def list_article_residuals(
    *,
    downstream_loss_bucket: str | None,
    selection_blocker_stage: str | None,
    selection_blocker_reason: str | None,
    selection_mode: str | None,
    verification_state: str | None,
    processing_state: str | None,
    observation_state: str | None,
    duplicate_kind: str | None,
    q: str | None,
    page: int,
    page_size: int,
    normalize_optional_query_string_func: Callable[[Any], str | None],
    normalize_web_content_search_query_func: Callable[[str | None], str | None],
    load_article_residual_rows_func: Callable[..., list[dict[str, Any]]],
    build_article_residual_payload_func: Callable[[Mapping[str, Any]], dict[str, Any]],
    article_matches_residual_filters_func: Callable[..., bool],
    build_paginated_response_func: Callable[
        [list[dict[str, Any]], int, int, int], dict[str, Any]
    ],
) -> dict[str, Any]:
    downstream_loss_bucket = normalize_optional_query_string_func(downstream_loss_bucket)
    selection_blocker_stage = normalize_optional_query_string_func(
        selection_blocker_stage
    )
    selection_blocker_reason = normalize_optional_query_string_func(
        selection_blocker_reason
    )
    selection_mode = normalize_optional_query_string_func(selection_mode)
    verification_state = normalize_optional_query_string_func(verification_state)
    processing_state = normalize_optional_query_string_func(processing_state)
    observation_state = normalize_optional_query_string_func(observation_state)
    duplicate_kind = normalize_optional_query_string_func(duplicate_kind)
    q = normalize_web_content_search_query_func(q)
    rows = [
        build_article_residual_payload_func(row)
        for row in load_article_residual_rows_func(
            q=q,
            verification_state=verification_state,
            processing_state=processing_state,
            observation_state=observation_state,
            duplicate_kind=duplicate_kind,
        )
    ]
    filtered_rows = [
        row
        for row in rows
        if article_matches_residual_filters_func(
            row,
            downstream_loss_bucket=downstream_loss_bucket,
            selection_blocker_stage=selection_blocker_stage,
            selection_blocker_reason=selection_blocker_reason,
            selection_mode=selection_mode,
        )
    ]
    offset = (page - 1) * page_size
    return build_paginated_response_func(
        filtered_rows[offset : offset + page_size], page, page_size, len(filtered_rows)
    )


def summarize_article_residuals(
    *,
    downstream_loss_bucket: str | None,
    selection_blocker_stage: str | None,
    selection_blocker_reason: str | None,
    selection_mode: str | None,
    verification_state: str | None,
    processing_state: str | None,
    observation_state: str | None,
    duplicate_kind: str | None,
    q: str | None,
    normalize_optional_query_string_func: Callable[[Any], str | None],
    normalize_web_content_search_query_func: Callable[[str | None], str | None],
    load_article_residual_rows_func: Callable[..., list[dict[str, Any]]],
    build_article_residual_payload_func: Callable[[Mapping[str, Any]], dict[str, Any]],
    article_matches_residual_filters_func: Callable[..., bool],
    summarize_article_residual_rows_func: Callable[
        [list[dict[str, Any]]], dict[str, Any]
    ],
) -> dict[str, Any]:
    downstream_loss_bucket = normalize_optional_query_string_func(downstream_loss_bucket)
    selection_blocker_stage = normalize_optional_query_string_func(
        selection_blocker_stage
    )
    selection_blocker_reason = normalize_optional_query_string_func(
        selection_blocker_reason
    )
    selection_mode = normalize_optional_query_string_func(selection_mode)
    verification_state = normalize_optional_query_string_func(verification_state)
    processing_state = normalize_optional_query_string_func(processing_state)
    observation_state = normalize_optional_query_string_func(observation_state)
    duplicate_kind = normalize_optional_query_string_func(duplicate_kind)
    q = normalize_web_content_search_query_func(q)
    rows = [
        build_article_residual_payload_func(row)
        for row in load_article_residual_rows_func(
            q=q,
            verification_state=verification_state,
            processing_state=processing_state,
            observation_state=observation_state,
            duplicate_kind=duplicate_kind,
        )
    ]
    filtered_rows = [
        row
        for row in rows
        if article_matches_residual_filters_func(
            row,
            downstream_loss_bucket=downstream_loss_bucket,
            selection_blocker_stage=selection_blocker_stage,
            selection_blocker_reason=selection_blocker_reason,
            selection_mode=selection_mode,
        )
    ]
    return {
        "filters": {
            "downstreamLossBucket": downstream_loss_bucket,
            "selectionBlockerStage": selection_blocker_stage,
            "selectionBlockerReason": selection_blocker_reason,
            "selectionMode": selection_mode,
            "verificationState": verification_state,
            "processingState": processing_state,
            "observationState": observation_state,
            "duplicateKind": duplicate_kind,
            "q": q,
        },
        **summarize_article_residual_rows_func(filtered_rows),
    }

from __future__ import annotations

from typing import Any, Callable, Mapping


class SignalCandidateNotFoundError(LookupError):
    pass


class ContentItemNotFoundError(LookupError):
    pass


def get_resource_content_item(
    resource_id: str,
    *,
    query_one_func: Callable[[str, tuple[Any, ...]], dict[str, Any] | None],
    system_interest_kind_enabled_clause_func: Callable[[str], str],
    load_content_analysis_summary_func: Callable[..., dict[str, Any]],
) -> dict[str, Any]:
    resource = query_one_func(
        f"""
        select
          wr.resource_id::text as origin_id,
          'resource:' || wr.resource_id::text as content_item_id,
          wr.resource_kind as content_kind,
          'resource'::text as origin_type,
          coalesce(wr.final_url, wr.url) as url,
          wr.title,
          wr.summary,
          wr.summary as lead,
          wr.body,
          wr.body_html,
          wr.lang,
          wr.published_at,
          wr.discovered_at as ingested_at,
          wr.updated_at,
          sc.channel_id::text as channel_id,
          sc.name as channel_name,
          sc.name as source_name,
          fsr.final_decision as system_selection_decision,
          coalesce(fsr.is_selected, false) as system_selected,
          jsonb_array_length(coalesce(wr.media_json, '[]'::jsonb)) > 0 as has_media,
          wr.media_json -> 0 ->> 'media_kind' as primary_media_kind,
          coalesce(wr.media_json -> 0 ->> 'thumbnail_url', wr.media_json -> 0 ->> 'source_url') as primary_media_url,
          wr.media_json -> 0 ->> 'thumbnail_url' as primary_media_thumbnail_url,
          wr.media_json -> 0 ->> 'source_url' as primary_media_source_url,
          wr.media_json -> 0 ->> 'title' as primary_media_title,
          wr.media_json -> 0 ->> 'alt_text' as primary_media_alt_text,
          wr.classification_json,
          wr.attributes_json,
          wr.documents_json,
          wr.media_json,
          wr.links_out_json,
          wr.child_resources_json,
          wr.raw_payload_json,
          wr.extraction_state,
          wr.extraction_error,
          wr.projection_state,
          wr.projection_error
        from web_resources wr
        join source_channels sc on sc.channel_id = wr.channel_id
        join signal_candidates pa on pa.doc_id = wr.projected_signal_candidate_id
        join final_selection_results fsr on fsr.doc_id = pa.doc_id
        where wr.resource_id = %s
          and wr.resource_kind <> 'editorial'
          and wr.extraction_state in ('enriched', 'skipped')
          and pa.visibility_state = 'visible'
          and coalesce(fsr.is_selected, false) = true
          and {system_interest_kind_enabled_clause_func("wr.resource_kind")}
        """,
        (resource_id,),
    )
    if resource is None:
        raise ContentItemNotFoundError
    resource["analysis_summary"] = load_content_analysis_summary_func(
        subject_type="web_resource",
        subject_id=resource_id,
    )
    return resource


def get_content_item(
    content_item_id: str,
    *,
    parse_content_item_id_func: Callable[[str], tuple[str, str]],
    get_signal_candidate_func: Callable[[str], dict[str, Any]],
    get_selected_content_item_preview_func: Callable[[str], dict[str, Any]],
    build_editorial_content_item_preview_from_signal_candidate_func: Callable[
        [Mapping[str, Any]], dict[str, Any]
    ],
    get_resource_content_item_func: Callable[[str], dict[str, Any]],
    load_content_analysis_summary_func: Callable[..., dict[str, Any]],
    http_exception_type: type[Exception],
) -> dict[str, Any]:
    origin_type, origin_id = parse_content_item_id_func(content_item_id)
    if origin_type == "signal_candidate":
        signal_candidate = get_signal_candidate_func(origin_id)
        try:
            content_item = get_selected_content_item_preview_func(content_item_id)
        except http_exception_type as exc:
            if getattr(exc, "status_code", None) != 404:
                raise
            content_item = build_editorial_content_item_preview_from_signal_candidate_func(signal_candidate)
        signal_candidate.update(content_item)
        signal_candidate["summary"] = signal_candidate.get("summary") or signal_candidate.get("lead")
        signal_candidate["body_html"] = signal_candidate.get("body_html") or signal_candidate.get("full_content_html")
        signal_candidate["analysis_summary"] = load_content_analysis_summary_func(
            subject_type="signal_candidate",
            subject_id=origin_id,
        )
        return signal_candidate
    return get_resource_content_item_func(origin_id)


def get_content_item_explain(
    content_item_id: str,
    *,
    parse_content_item_id_func: Callable[[str], tuple[str, str]],
    get_content_item_func: Callable[[str], dict[str, Any]],
    query_one_func: Callable[[str, tuple[Any, ...]], dict[str, Any] | None],
    query_all_func: Callable[..., list[dict[str, Any]]],
    build_selection_explain_payload_func: Callable[..., dict[str, Any]],
    build_content_kind_selection_explain_payload_func: Callable[..., dict[str, Any]],
    build_selection_diagnostics_payload_func: Callable[..., dict[str, Any]],
    build_selection_guidance_payload_func: Callable[..., dict[str, Any]],
) -> dict[str, Any]:
    origin_type, origin_id = parse_content_item_id_func(content_item_id)
    content_item = get_content_item_func(content_item_id)
    if origin_type == "signal_candidate":
        final_selection = query_one_func(
            """
            select *
            from final_selection_results
            where doc_id = %s
            """,
            (origin_id,),
        )
        system_feed = query_one_func(
            """
            select *
            from system_feed_results
            where doc_id = %s
            """,
            (origin_id,),
        )
        system_interest_matches = query_all_func(
            """
            select *
            from criterion_match_results
            where doc_id = %s
            order by created_at desc
            """,
            (origin_id,),
        )
        user_interest_matches = query_all_func(
            """
            select *
            from interest_match_results
            where doc_id = %s
            order by created_at desc
            """,
            (origin_id,),
        )
        ai_reviews = query_all_func(
            """
            select *
            from llm_review_log
            where doc_id = %s
            order by created_at desc
            """,
            (origin_id,),
        )
        notifications = query_all_func(
            """
            select *
            from notification_log
            where doc_id = %s
            order by created_at desc
            """,
            (origin_id,),
        )
        interest_filter_results = query_all_func(
            """
            select *
            from interest_filter_results
            where doc_id = %s
            order by filter_scope, created_at desc
            """,
            (origin_id,),
        )
        selection_explain = build_selection_explain_payload_func(
            selection_like=content_item,
            final_selection_result=final_selection,
            system_feed_result=system_feed,
        )
        return {
            "content_item": content_item,
            "system_interest_matches": system_interest_matches,
            "user_interest_matches": user_interest_matches,
            "ai_reviews": ai_reviews,
            "notifications": notifications,
            "interest_filter_results": interest_filter_results,
            "selection_explain": selection_explain,
            "selection_diagnostics": build_selection_diagnostics_payload_func(
                selection_explain=selection_explain,
                interest_filter_results=interest_filter_results,
                llm_reviews=ai_reviews,
                notifications=notifications,
            ),
            "selection_guidance": build_selection_guidance_payload_func(
                selection_explain=selection_explain
            ),
        }
    selection_explain = build_content_kind_selection_explain_payload_func(
        content_like=content_item
    )
    return {
        "content_item": content_item,
        "system_interest_matches": [],
        "user_interest_matches": [],
        "ai_reviews": [],
        "notifications": [],
        "interest_filter_results": [],
        "selection_explain": selection_explain,
        "selection_diagnostics": build_selection_diagnostics_payload_func(
            selection_explain=selection_explain,
            interest_filter_results=[],
            llm_reviews=[],
            notifications=[],
        ),
        "selection_guidance": build_selection_guidance_payload_func(
            selection_explain=selection_explain
        ),
    }


def get_signal_candidate(
    doc_id: str,
    *,
    query_one_func: Callable[[str, tuple[Any, ...]], dict[str, Any] | None],
    query_all_func: Callable[..., list[dict[str, Any]]],
    apply_signal_candidate_selection_payload_func: Callable[..., dict[str, Any]],
    load_content_analysis_summary_func: Callable[..., dict[str, Any]],
) -> dict[str, Any]:
    signal_candidate = query_one_func(
        """
        select
          a.*,
          sc.name as channel_name,
          coalesce(a.extracted_source_name, sc.name) as source_name,
          a.extracted_author as author_name,
          a.extracted_ttr_seconds as read_time_seconds,
          pma.asset_id::text as primary_media_asset_id,
          pma.media_kind as primary_media_kind,
          pma.storage_kind as primary_media_storage_kind,
          coalesce(pma.thumbnail_url, pma.source_url) as primary_media_url,
          pma.thumbnail_url as primary_media_thumbnail_url,
          pma.source_url as primary_media_source_url,
          pma.title as primary_media_title,
          pma.alt_text as primary_media_alt_text,
          obs.observation_state,
          obs.duplicate_kind,
          coalesce(fsr.canonical_document_id, obs.canonical_document_id)::text as canonical_document_id,
          cd.canonical_url as canonical_document_url,
          cd.canonical_domain,
          cd.observation_count as canonical_observation_count,
          cd.first_observed_at as canonical_first_observed_at,
          cd.last_observed_at as canonical_last_observed_at,
          vrc.verification_state as canonical_verification_state,
          coalesce(fsr.story_cluster_id, scm.story_cluster_id)::text as story_cluster_id,
          st.primary_title as story_cluster_title,
          st.verification_state as story_cluster_verification_state,
          st.canonical_document_count as story_cluster_document_count,
          st.source_family_count as story_cluster_source_family_count,
          st.corroboration_count as story_cluster_corroboration_count,
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
          coalesce((fsr.explain_json ->> 'duplicateSignalCandidateCountForCanonical')::int, 0)
            as final_selection_duplicate_signal_candidate_count_for_canonical,
          fsr.explain_json ->> 'selectionReuseSource' as final_selection_reuse_source,
          fsr.verification_target_type,
          fsr.verification_target_id::text as verification_target_id,
          coalesce(ars.like_count, 0) as like_count,
          coalesce(ars.dislike_count, 0) as dislike_count,
          sfr.decision as system_feed_decision,
          coalesce(sfr.eligible_for_feed, false) as system_feed_eligible
        from signal_candidates a
        join source_channels sc on sc.channel_id = a.channel_id
        left join document_observations obs
          on obs.origin_type = 'signal_candidate'
         and obs.origin_id = a.doc_id
        left join final_selection_results fsr on fsr.doc_id = a.doc_id
        left join system_feed_results sfr on sfr.doc_id = a.doc_id
        left join canonical_documents cd
          on cd.canonical_document_id = coalesce(fsr.canonical_document_id, obs.canonical_document_id)
        left join story_cluster_members scm
          on scm.canonical_document_id = cd.canonical_document_id
        left join story_clusters st
          on st.story_cluster_id = coalesce(fsr.story_cluster_id, scm.story_cluster_id)
        left join verification_results vrc
          on vrc.target_type = 'canonical_document'
         and vrc.target_id = cd.canonical_document_id
        left join signal_candidate_media_assets pma on pma.asset_id = a.primary_media_asset_id
        left join signal_candidate_reaction_stats ars on ars.doc_id = a.doc_id
        where a.doc_id = %s
        """,
        (doc_id,),
    )
    if signal_candidate is None:
        raise SignalCandidateNotFoundError

    signal_candidate["media_assets"] = query_all_func(
        """
        select *
        from signal_candidate_media_assets
        where doc_id = %s
        order by sort_order, created_at
        """,
        (doc_id,),
    )
    interest_filter_results = query_all_func(
        """
        select *
        from interest_filter_results
        where doc_id = %s
        order by filter_scope, created_at desc
        """,
        (doc_id,),
    )
    llm_reviews = query_all_func(
        """
        select *
        from llm_review_log
        where doc_id = %s
        order by created_at desc
        """,
        (doc_id,),
    )
    notifications = query_all_func(
        """
        select *
        from notification_log
        where doc_id = %s
        order by created_at desc
        """,
        (doc_id,),
    )
    signal_candidate = apply_signal_candidate_selection_payload_func(
        signal_candidate,
        interest_filter_results=interest_filter_results,
        llm_reviews=llm_reviews,
        notifications=notifications,
    )
    signal_candidate["enrichment_debug"] = {
        "state": signal_candidate.get("enrichment_state"),
        "enriched_at": signal_candidate.get("enriched_at"),
        "full_content_html": signal_candidate.get("full_content_html"),
        "extracted_description": signal_candidate.get("extracted_description"),
        "extracted_author": signal_candidate.get("extracted_author"),
        "extracted_ttr_seconds": signal_candidate.get("extracted_ttr_seconds"),
        "extracted_image_url": signal_candidate.get("extracted_image_url"),
        "extracted_favicon_url": signal_candidate.get("extracted_favicon_url"),
        "extracted_published_at": signal_candidate.get("extracted_published_at"),
        "extracted_source_name": signal_candidate.get("extracted_source_name"),
        "raw_payload_json": signal_candidate.get("raw_payload_json"),
    }
    signal_candidate["analysis_summary"] = load_content_analysis_summary_func(
        subject_type="signal_candidate",
        subject_id=doc_id,
    )
    return signal_candidate


def get_signal_candidate_explain(
    doc_id: str,
    *,
    get_signal_candidate_func: Callable[[str], dict[str, Any]],
    query_one_func: Callable[[str, tuple[Any, ...]], dict[str, Any] | None],
    query_all_func: Callable[..., list[dict[str, Any]]],
    build_selection_explain_payload_func: Callable[..., dict[str, Any]],
    build_selection_diagnostics_payload_func: Callable[..., dict[str, Any]],
    build_selection_guidance_payload_func: Callable[..., dict[str, Any]],
) -> dict[str, Any]:
    signal_candidate = get_signal_candidate_func(doc_id)
    canonical_document_id = signal_candidate.get("canonical_document_id")
    story_cluster_id = signal_candidate.get("story_cluster_id")
    verification_results: list[dict[str, Any]] = []
    if canonical_document_id:
        verification_results.extend(
            query_all_func(
                """
                select *
                from verification_results
                where target_type = 'canonical_document'
                  and target_id = %s
                order by updated_at desc
                """,
                (canonical_document_id,),
            )
        )
    if story_cluster_id:
        verification_results.extend(
            query_all_func(
                """
                select *
                from verification_results
                where target_type = 'story_cluster'
                  and target_id = %s
                order by updated_at desc
                """,
                (story_cluster_id,),
            )
        )
    final_selection_result = query_one_func(
        """
        select *
        from final_selection_results
        where doc_id = %s
        """,
        (doc_id,),
    )
    system_feed_result = query_one_func(
        """
        select *
        from system_feed_results
        where doc_id = %s
        """,
        (doc_id,),
    )
    criteria_matches = query_all_func(
        """
        select *
        from criterion_match_results
        where doc_id = %s
        order by created_at desc
        """,
        (doc_id,),
    )
    interest_matches = query_all_func(
        """
        select *
        from interest_match_results
        where doc_id = %s
        order by created_at desc
        """,
        (doc_id,),
    )
    interest_filter_results = query_all_func(
        """
        select *
        from interest_filter_results
        where doc_id = %s
        order by filter_scope, created_at desc
        """,
        (doc_id,),
    )
    llm_reviews = query_all_func(
        """
        select *
        from llm_review_log
        where doc_id = %s
        order by created_at desc
        """,
        (doc_id,),
    )
    notifications = query_all_func(
        """
        select *
        from notification_log
        where doc_id = %s
        order by created_at desc
        """,
        (doc_id,),
    )
    selection_explain = build_selection_explain_payload_func(
        selection_like=signal_candidate,
        final_selection_result=final_selection_result,
        system_feed_result=system_feed_result,
    )
    return {
        "signal_candidate": signal_candidate,
        "criteria_matches": criteria_matches,
        "interest_matches": interest_matches,
        "interest_filter_results": interest_filter_results,
        "canonical_document": query_one_func(
            """
            select *
            from canonical_documents
            where canonical_document_id = %s
            """,
            (canonical_document_id,),
        )
        if canonical_document_id
        else None,
        "story_cluster": query_one_func(
            """
            select *
            from story_clusters
            where story_cluster_id = %s
            """,
            (story_cluster_id,),
        )
        if story_cluster_id
        else None,
        "verification_results": verification_results,
        "final_selection_result": final_selection_result,
        "system_feed_result": system_feed_result,
        "llm_reviews": llm_reviews,
        "notifications": notifications,
        "selection_explain": selection_explain,
        "selection_diagnostics": build_selection_diagnostics_payload_func(
            selection_explain=selection_explain,
            interest_filter_results=interest_filter_results,
            llm_reviews=llm_reviews,
            notifications=notifications,
        ),
        "selection_guidance": build_selection_guidance_payload_func(
            selection_explain=selection_explain
        ),
    }

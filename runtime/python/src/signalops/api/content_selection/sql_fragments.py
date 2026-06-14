from __future__ import annotations


def processed_signal_candidate_clause(alias: str = "a") -> str:
    return (
        "("
        f"{alias}.processing_state in ('matched', 'notified')"
        f" or exists ("
        f"select 1 from final_selection_results fsr_processed "
        f"where fsr_processed.doc_id = {alias}.doc_id "
        "and fsr_processed.final_decision in ('selected', 'rejected', 'gray_zone')"
        ")"
        f" or exists ("
        f"select 1 from system_feed_results sfr_processed "
        f"where sfr_processed.doc_id = {alias}.doc_id "
        "and sfr_processed.decision in ('pass_through', 'eligible', 'filtered_out')"
        ")"
        ")"
    )


def final_selection_join_clause(
    signal_candidate_alias: str = "a",
    final_alias: str = "fsr",
) -> str:
    return f"left join final_selection_results {final_alias} on {final_alias}.doc_id = {signal_candidate_alias}.doc_id"


def system_feed_join_clause(signal_candidate_alias: str = "a", system_alias: str = "sfr") -> str:
    return f"left join system_feed_results {system_alias} on {system_alias}.doc_id = {signal_candidate_alias}.doc_id"


def signal_candidate_observation_join_clause(
    signal_candidate_alias: str = "a",
    observation_alias: str = "obs",
) -> str:
    return (
        f"left join document_observations {observation_alias} "
        f"on {observation_alias}.origin_type = 'signal_candidate' "
        f"and {observation_alias}.origin_id = {signal_candidate_alias}.doc_id"
    )


def effective_system_selected_expr(
    final_alias: str = "fsr",
    system_alias: str = "sfr",
) -> str:
    return f"""
      case
        when {final_alias}.doc_id is not null then coalesce({final_alias}.is_selected, false)
        else coalesce({system_alias}.eligible_for_feed, false)
      end
    """


def effective_system_selection_decision_expr(
    final_alias: str = "fsr",
    system_alias: str = "sfr",
) -> str:
    return f"""
      case
        when {final_alias}.doc_id is not null and {final_alias}.final_decision = 'selected' then 'selected'
        when {final_alias}.doc_id is not null and {final_alias}.final_decision = 'gray_zone' then 'gray_zone'
        when {final_alias}.doc_id is not null and {final_alias}.final_decision = 'rejected' then 'rejected'
        when coalesce({system_alias}.eligible_for_feed, false) then 'selected'
        when {system_alias}.decision = 'pending_llm' then 'pending_ai_review'
        when {system_alias}.decision in ('eligible', 'filtered_out', 'pass_through') then 'filtered_out'
        else 'unknown'
      end
    """


def canonical_signal_candidate_family_expr(signal_candidate_alias: str = "a") -> str:
    return f"coalesce({signal_candidate_alias}.canonical_doc_id, {signal_candidate_alias}.doc_id)"


def canonical_signal_candidate_family_order_clause(signal_candidate_alias: str = "a") -> str:
    family_expr = canonical_signal_candidate_family_expr(signal_candidate_alias)
    return (
        f"case when {signal_candidate_alias}.doc_id = {family_expr} then 0 else 1 end, "
        f"{signal_candidate_alias}.published_at desc nulls last, "
        f"{signal_candidate_alias}.ingested_at desc, "
        f"{signal_candidate_alias}.doc_id"
    )


def feed_eligible_signal_candidate_clause(
    signal_candidate_alias: str = "a",
    final_alias: str = "fsr",
    system_alias: str = "sfr",
) -> str:
    return (
        f"{signal_candidate_alias}.visibility_state = 'visible' and "
        f"{effective_system_selected_expr(final_alias, system_alias)} = true"
    )


def system_interest_kind_enabled_clause(kind_expr: str) -> str:
    return f"""
      exists (
        select 1
        from interest_templates it
        where it.is_active = true
          and (
            jsonb_array_length(
              case
                when jsonb_typeof(coalesce(it.allowed_content_kinds, '[]'::jsonb)) = 'array'
                then coalesce(it.allowed_content_kinds, '[]'::jsonb)
                else '[]'::jsonb
              end
            ) = 0
            or exists (
              select 1
              from jsonb_array_elements_text(
                case
                  when jsonb_typeof(coalesce(it.allowed_content_kinds, '[]'::jsonb)) = 'array'
                  then coalesce(it.allowed_content_kinds, '[]'::jsonb)
                  else '[]'::jsonb
                end
              ) allowed(kind)
              where allowed.kind = {kind_expr}
            )
          )
      )
    """


def primary_media_join_clause(
    signal_candidate_alias: str = "a",
    media_alias: str = "pma",
) -> str:
    return f"left join signal_candidate_media_assets {media_alias} on {media_alias}.asset_id = {signal_candidate_alias}.primary_media_asset_id"


def signal_candidate_preview_projection(
    signal_candidate_alias: str = "a",
    channel_alias: str = "sc",
    media_alias: str = "pma",
) -> str:
    return f"""
          {signal_candidate_alias}.has_media,
          {signal_candidate_alias}.enrichment_state,
          coalesce({signal_candidate_alias}.extracted_source_name, {channel_alias}.name) as source_name,
          {signal_candidate_alias}.extracted_author as author_name,
          {signal_candidate_alias}.extracted_ttr_seconds as read_time_seconds,
          {media_alias}.asset_id::text as primary_media_asset_id,
          {media_alias}.media_kind as primary_media_kind,
          {media_alias}.storage_kind as primary_media_storage_kind,
          coalesce({media_alias}.thumbnail_url, {media_alias}.source_url) as primary_media_url,
          {media_alias}.thumbnail_url as primary_media_thumbnail_url,
          {media_alias}.source_url as primary_media_source_url,
          {media_alias}.title as primary_media_title,
          {media_alias}.alt_text as primary_media_alt_text
    """


def editorial_content_select_sql(*, include_internal_fields: bool = False) -> str:
    family_expr = canonical_signal_candidate_family_expr("a")
    family_order = canonical_signal_candidate_family_order_clause("a")
    internal_projection = ""
    if include_internal_fields:
        internal_projection = """
            nullif(lower(btrim(coalesce(a.title, ''))), '') as _normalized_title,
            concat_ws(' ', coalesce(a.title, ''), coalesce(a.lead, ''), coalesce(a.body, '')) as _search_text,
            a.channel_id::text as _channel_id,
        """
    return f"""
        select
          ranked.content_item_id,
          ranked.content_kind,
          ranked.origin_type,
          ranked.origin_id,
          ranked.url,
          ranked.title,
          ranked.summary,
          ranked.lead,
          ranked.lang,
          ranked.published_at,
          ranked.ingested_at,
          ranked.updated_at,
          ranked.source_name,
          ranked.author_name,
          ranked.read_time_seconds,
          ranked.system_selection_decision,
          ranked.system_selected,
          ranked.has_media,
          ranked.primary_media_kind,
          ranked.primary_media_url,
          ranked.primary_media_thumbnail_url,
          ranked.primary_media_source_url,
          ranked.primary_media_title,
          ranked.primary_media_alt_text,
          ranked.like_count,
          ranked.dislike_count,
          ranked.matched_interest_id,
          ranked.matched_interest_description,
          ranked.interest_match_score,
          ranked.interest_match_decision
          {", ranked._normalized_title, ranked._search_text, ranked._channel_id" if include_internal_fields else ""}
        from (
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
            coalesce(a.extracted_source_name, sc.name) as source_name,
            a.extracted_author as author_name,
            a.extracted_ttr_seconds as read_time_seconds,
            {effective_system_selection_decision_expr("fsr", "sfr")} as system_selection_decision,
            {effective_system_selected_expr("fsr", "sfr")} as system_selected,
            a.has_media,
            pma.media_kind as primary_media_kind,
            coalesce(pma.thumbnail_url, pma.source_url) as primary_media_url,
            pma.thumbnail_url as primary_media_thumbnail_url,
            pma.source_url as primary_media_source_url,
            pma.title as primary_media_title,
            pma.alt_text as primary_media_alt_text,
            coalesce(ars.like_count, 0) as like_count,
            coalesce(ars.dislike_count, 0) as dislike_count,
            null::text as matched_interest_id,
            null::text as matched_interest_description,
            null::double precision as interest_match_score,
            null::text as interest_match_decision,
            {internal_projection if include_internal_fields else ""}
            row_number() over (
              partition by {family_expr}
              order by {family_order}
            ) as family_rank
          from signal_candidates a
          join source_channels sc on sc.channel_id = a.channel_id
          {final_selection_join_clause("a", "fsr")}
          left join system_feed_results sfr on sfr.doc_id = a.doc_id
          left join signal_candidate_media_assets pma on pma.asset_id = a.primary_media_asset_id
          left join signal_candidate_reaction_stats ars on ars.doc_id = a.doc_id
          where {feed_eligible_signal_candidate_clause("a", "fsr", "sfr")}
        ) ranked
        where ranked.family_rank = 1
    """


def resource_content_select_sql(*, include_internal_fields: bool = False) -> str:
    internal_projection = ""
    if include_internal_fields:
        internal_projection = """
          ,
          nullif(lower(btrim(coalesce(wr.title, ''))), '') as _normalized_title,
          concat_ws(' ', coalesce(wr.title, ''), coalesce(wr.summary, ''), coalesce(wr.body, '')) as _search_text
          , wr.channel_id::text as _channel_id
        """
    return f"""
        select
          {repr('resource:')} || wr.resource_id::text as content_item_id,
          wr.resource_kind as content_kind,
          'resource'::text as origin_type,
          wr.resource_id::text as origin_id,
          coalesce(wr.final_url, wr.url) as url,
          wr.title,
          wr.summary,
          wr.summary as lead,
          wr.lang,
          wr.published_at,
          wr.discovered_at as ingested_at,
          wr.updated_at,
          sc.name as source_name,
          null::text as author_name,
          null::integer as read_time_seconds,
          fsr.final_decision as system_selection_decision,
          coalesce(fsr.is_selected, false) as system_selected,
          jsonb_array_length(coalesce(wr.media_json, '[]'::jsonb)) > 0 as has_media,
          wr.media_json -> 0 ->> 'media_kind' as primary_media_kind,
          coalesce(wr.media_json -> 0 ->> 'thumbnail_url', wr.media_json -> 0 ->> 'source_url') as primary_media_url,
          wr.media_json -> 0 ->> 'thumbnail_url' as primary_media_thumbnail_url,
          wr.media_json -> 0 ->> 'source_url' as primary_media_source_url,
          wr.media_json -> 0 ->> 'title' as primary_media_title,
          wr.media_json -> 0 ->> 'alt_text' as primary_media_alt_text,
          0::bigint as like_count,
          0::bigint as dislike_count,
          null::text as matched_interest_id,
          null::text as matched_interest_description,
          null::double precision as interest_match_score,
          null::text as interest_match_decision
          {internal_projection}
        from web_resources wr
        join source_channels sc on sc.channel_id = wr.channel_id
        join signal_candidates pa on pa.doc_id = wr.projected_signal_candidate_id
        join final_selection_results fsr on fsr.doc_id = pa.doc_id
        where wr.resource_kind <> 'editorial'
          and wr.extraction_state in ('enriched', 'skipped')
          and pa.visibility_state = 'visible'
          and coalesce(fsr.is_selected, false) = true
          and {system_interest_kind_enabled_clause("wr.resource_kind")}
    """


def combined_content_items_select_sql(*, include_internal_fields: bool = False) -> str:
    editorial_sql = editorial_content_select_sql(
        include_internal_fields=include_internal_fields
    )
    resource_sql = resource_content_select_sql(
        include_internal_fields=include_internal_fields
    )
    return f"""
        select * from ({editorial_sql}) editorial_content_items
        union all
        select * from ({resource_sql}) resource_content_items
    """

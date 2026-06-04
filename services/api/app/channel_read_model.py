from __future__ import annotations

from typing import Any, Callable, Mapping


class ChannelNotFoundError(LookupError):
    pass


CHANNEL_LIST_SELECT = """
        select
          sc.channel_id,
          sc.name,
          sc.provider_type,
          sc.fetch_url,
          sc.language,
          sc.is_active,
          sc.poll_interval_seconds,
          sc.enrichment_enabled,
          sc.enrichment_min_body_length,
          sc.config_json,
          (coalesce(sc.auth_config_json ->> 'authorizationHeader', '') <> '') as has_authorization_header,
          sc.last_fetch_at,
          sc.last_success_at,
          sc.last_error_at,
          sc.last_error_message,
          coalesce(scrs.adaptive_enabled, true) as adaptive_enabled,
          coalesce(scrs.effective_poll_interval_seconds, sc.poll_interval_seconds) as effective_poll_interval_seconds,
          coalesce(scrs.max_poll_interval_seconds, least(sc.poll_interval_seconds * 16, 259200)) as max_poll_interval_seconds,
          coalesce(
            scrs.next_due_at,
            case
              when sc.last_fetch_at is null then now()
              else sc.last_fetch_at + make_interval(secs => sc.poll_interval_seconds)
            end
          ) as next_due_at,
          scrs.adaptive_step,
          scrs.last_result_kind,
          scrs.consecutive_no_change_polls,
          scrs.consecutive_failures,
          scrs.adaptive_reason,
          greatest(
            0,
            extract(
              epoch from (
                now() - coalesce(
                  scrs.next_due_at,
                  case
                    when sc.last_fetch_at is null then now()
                    else sc.last_fetch_at + make_interval(secs => sc.poll_interval_seconds)
                  end
                )
              )
            )
          )::int as overdue_seconds,
          (
            coalesce(scrs.last_result_kind, '') = 'hard_failure'
            or coalesce(scrs.consecutive_failures, 0) >= 2
          ) as needs_attention,
          last_run.started_at as last_run_started_at,
          last_run.outcome_kind as last_run_outcome_kind,
          last_run.fetch_duration_ms as last_run_duration_ms,
          last_run.error_text as last_run_error_text,
          scab.adapter_key as adapter_binding_key,
          scab.config_json as adapter_binding_config_json,
          scab.selection_mode as adapter_binding_selection_mode,
          scab.enabled as adapter_binding_enabled,
          iac.title as adapter_binding_title,
          iac.runtime_kind as adapter_binding_runtime_kind,
          iac.output_mode as adapter_binding_output_mode,
          iac.status as adapter_binding_status,
          recent_runs.recent_failure_count_24h,
          channel_item_counts.stored_item_count,
          sp.provider_id,
          sp.name as provider_name
        from source_channels sc
        left join source_providers sp on sp.provider_id = sc.provider_id
        left join source_channel_runtime_state scrs on scrs.channel_id = sc.channel_id
        left join source_channel_adapter_binding scab on scab.channel_id = sc.channel_id
        left join ingress_adapter_catalog iac on iac.adapter_key = scab.adapter_key
        left join lateral (
          select
            started_at,
            outcome_kind,
            fetch_duration_ms,
            error_text
          from channel_fetch_runs cfr
          where cfr.channel_id = sc.channel_id
          order by cfr.started_at desc
          limit 1
        ) last_run on true
        left join lateral (
          select
            count(*) filter (
              where outcome_kind in ('rate_limited', 'transient_failure', 'hard_failure')
            )::int as recent_failure_count_24h
          from channel_fetch_runs cfr
          where cfr.channel_id = sc.channel_id
            and cfr.started_at >= now() - interval '24 hours'
        ) recent_runs on true
        left join lateral (
          select (
            coalesce(
              (
                select count(*)::int
                from signal_candidates a
                where a.channel_id = sc.channel_id
              ),
              0
            )
            +
            coalesce(
              (
                select count(*)::int
                from web_resources wr
                where wr.channel_id = sc.channel_id
                  and wr.projected_signal_candidate_id is null
              ),
              0
            )
          )::int as stored_item_count
        ) channel_item_counts on true
"""


CHANNEL_GET_SELECT = """
        select
          sc.channel_id,
          sc.name,
          sc.provider_type,
          sc.fetch_url,
          sc.language,
          sc.is_active,
          sc.poll_interval_seconds,
          sc.enrichment_enabled,
          sc.enrichment_min_body_length,
          sc.config_json,
          (coalesce(sc.auth_config_json ->> 'authorizationHeader', '') <> '') as has_authorization_header,
          sc.last_fetch_at,
          sc.last_success_at,
          sc.last_error_at,
          sc.last_error_message,
          coalesce(scrs.adaptive_enabled, true) as adaptive_enabled,
          coalesce(scrs.effective_poll_interval_seconds, sc.poll_interval_seconds) as effective_poll_interval_seconds,
          coalesce(scrs.max_poll_interval_seconds, least(sc.poll_interval_seconds * 16, 259200)) as max_poll_interval_seconds,
          coalesce(
            scrs.next_due_at,
            case
              when sc.last_fetch_at is null then now()
              else sc.last_fetch_at + make_interval(secs => sc.poll_interval_seconds)
            end
          ) as next_due_at,
          scrs.adaptive_step,
          scrs.last_result_kind,
          scrs.consecutive_no_change_polls,
          scrs.consecutive_failures,
          scrs.adaptive_reason,
          greatest(
            0,
            extract(
              epoch from (
                now() - coalesce(
                  scrs.next_due_at,
                  case
                    when sc.last_fetch_at is null then now()
                    else sc.last_fetch_at + make_interval(secs => sc.poll_interval_seconds)
                  end
                )
              )
            )
          )::int as overdue_seconds,
          (
            coalesce(scrs.last_result_kind, '') = 'hard_failure'
            or coalesce(scrs.consecutive_failures, 0) >= 2
          ) as needs_attention,
          scab.adapter_key as adapter_binding_key,
          scab.config_json as adapter_binding_config_json,
          scab.selection_mode as adapter_binding_selection_mode,
          scab.enabled as adapter_binding_enabled,
          iac.title as adapter_binding_title,
          iac.runtime_kind as adapter_binding_runtime_kind,
          iac.output_mode as adapter_binding_output_mode,
          iac.status as adapter_binding_status,
          (
            coalesce(
              (
                select count(*)::int
                from signal_candidates a
                where a.channel_id = sc.channel_id
              ),
              0
            )
            +
            coalesce(
              (
                select count(*)::int
                from web_resources wr
                where wr.channel_id = sc.channel_id
                  and wr.projected_signal_candidate_id is null
              ),
              0
            )
          )::int as stored_item_count,
          sp.provider_id,
          sp.name as provider_name
        from source_channels sc
        left join source_providers sp on sp.provider_id = sc.provider_id
        left join source_channel_runtime_state scrs on scrs.channel_id = sc.channel_id
        left join source_channel_adapter_binding scab on scab.channel_id = sc.channel_id
        left join ingress_adapter_catalog iac on iac.adapter_key = scab.adapter_key
"""


def list_channels(
    *,
    provider_type: str | None,
    page: int | None,
    page_size: int | None,
    resolve_pagination_func: Callable[
        [int | None, int | None, int], tuple[bool, int, int, int]
    ],
    query_all_func: Callable[..., list[dict[str, Any]]],
    query_count_func: Callable[..., int],
    build_paginated_response_func: Callable[
        [list[dict[str, Any]], int, int, int], dict[str, Any]
    ],
    with_resolved_channel_adapter_fields_func: Callable[
        [Mapping[str, Any]], dict[str, Any]
    ],
) -> dict[str, Any] | list[dict[str, Any]]:
    channel_filters: list[str] = []
    params: list[Any] = []
    if provider_type:
        channel_filters.append("sc.provider_type = %s")
        params.append(provider_type)

    where_clause = f"where {' and '.join(channel_filters)}" if channel_filters else ""
    channel_select = f"""
        {CHANNEL_LIST_SELECT}
        {where_clause}
        order by sc.updated_at desc, sc.created_at desc
    """
    paginate, resolved_page, resolved_page_size, offset = resolve_pagination_func(
        page, page_size, 20
    )
    if not paginate:
        return [
            with_resolved_channel_adapter_fields_func(item)
            for item in query_all_func(channel_select, tuple(params))
        ]

    count_sql = "select count(*)::int as total from source_channels sc"
    if where_clause:
        count_sql = f"{count_sql}\n{where_clause}"
    total = query_count_func(count_sql, tuple(params))
    items = [
        with_resolved_channel_adapter_fields_func(item)
        for item in query_all_func(
            f"{channel_select}\nlimit %s\noffset %s",
            tuple([*params, resolved_page_size, offset]),
        )
    ]
    return build_paginated_response_func(items, resolved_page, resolved_page_size, total)


def get_channel(
    channel_id: str,
    *,
    query_one_func: Callable[[str, tuple[Any, ...]], dict[str, Any] | None],
    with_resolved_channel_adapter_fields_func: Callable[
        [Mapping[str, Any]], dict[str, Any]
    ],
) -> dict[str, Any]:
    channel = query_one_func(
        f"""
        {CHANNEL_GET_SELECT}
        where sc.channel_id = %s
        """,
        (channel_id,),
    )
    if channel is None:
        raise ChannelNotFoundError
    return with_resolved_channel_adapter_fields_func(channel)

from __future__ import annotations

from typing import Any, Callable

from services.api.app.content_selection_read_model import query_count
from services.api.app.database import query_all
from services.api.app.pagination import build_paginated_response, resolve_pagination

QueryAllFunc = Callable[[str, tuple[Any, ...]], list[dict[str, Any]]]
QueryCountFunc = Callable[[str, tuple[Any, ...]], int]


def list_fetch_runs(
    *,
    limit: int = 50,
    channel_id: str | None = None,
    page: int | None = None,
    page_size: int | None = None,
    query_all_func: QueryAllFunc = query_all,
    query_count_func: QueryCountFunc = query_count,
) -> dict[str, Any] | list[dict[str, Any]]:
    fetch_filters: list[str] = []
    params: list[Any] = []
    if channel_id:
        fetch_filters.append("channel_id = %s")
        params.append(channel_id)

    where_clause = f"where {' and '.join(fetch_filters)}" if fetch_filters else ""
    if where_clause:
        where_clause = where_clause.replace("channel_id", "cfr.channel_id")
    fetch_run_select = f"""
        select
          cfr.*,
          sc.name as channel_name
        from channel_fetch_runs cfr
        left join source_channels sc on sc.channel_id = cfr.channel_id
        {where_clause}
        order by cfr.started_at desc
    """

    paginate, resolved_page, resolved_page_size, offset = resolve_pagination(
        page, page_size, limit
    )
    if not paginate:
        return query_all_func(
            f"{fetch_run_select}\nlimit %s",
            tuple([*params, limit]),
        )

    count_sql = "select count(*)::int as total from channel_fetch_runs cfr"
    if where_clause:
        count_sql = f"{count_sql}\n{where_clause}"
    total = query_count_func(count_sql, tuple(params))
    items = query_all_func(
        f"{fetch_run_select}\nlimit %s\noffset %s",
        tuple([*params, resolved_page_size, offset]),
    )
    return build_paginated_response(items, resolved_page, resolved_page_size, total)


def list_outbox_events(
    *,
    limit: int = 50,
    query_all_func: QueryAllFunc = query_all,
) -> list[dict[str, Any]]:
    return query_all_func(
        """
        select *
        from outbox_events
        order by created_at desc
        limit %s
        """,
        (limit,),
    )

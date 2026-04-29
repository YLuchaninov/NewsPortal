from __future__ import annotations

from typing import Any, Callable


def list_user_notifications(
    *,
    user_id: str,
    limit: int,
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
) -> dict[str, Any] | list[dict[str, Any]]:
    notification_select = """
        select
          nl.*,
          a.title as article_title,
          a.lead as article_lead
        from notification_log nl
        join articles a on a.doc_id = nl.doc_id
        where nl.user_id = %s
        order by nl.created_at desc
    """
    paginate, resolved_page, resolved_page_size, offset = resolve_pagination_func(
        page, page_size, limit
    )
    if not paginate:
        return query_all_func(f"{notification_select}\nlimit %s", (user_id, limit))

    total = query_count_func(
        """
        select count(*)::int as total
        from notification_log
        where user_id = %s
        """,
        (user_id,),
    )
    items = query_all_func(
        f"{notification_select}\nlimit %s\noffset %s",
        (user_id, resolved_page_size, offset),
    )
    return build_paginated_response_func(
        items, resolved_page, resolved_page_size, total
    )

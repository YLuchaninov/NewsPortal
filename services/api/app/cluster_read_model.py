from __future__ import annotations

from typing import Any, Callable


def list_clusters(
    *,
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
    cluster_select = """
        select
          ec.*,
          (
            select json_agg(ecm.doc_id order by ecm.created_at desc)
            from event_cluster_members ecm
            where ecm.cluster_id = ec.cluster_id
          ) as doc_ids
        from event_clusters ec
        order by ec.max_published_at desc nulls last, ec.updated_at desc
    """
    paginate, resolved_page, resolved_page_size, offset = resolve_pagination_func(
        page, page_size, limit
    )
    if not paginate:
        return query_all_func(f"{cluster_select}\nlimit %s", (limit,))

    total = query_count_func(
        """
        select count(*)::int as total
        from event_clusters
        """
    )
    items = query_all_func(
        f"{cluster_select}\nlimit %s\noffset %s",
        (resolved_page_size, offset),
    )
    return build_paginated_response_func(
        items, resolved_page, resolved_page_size, total
    )

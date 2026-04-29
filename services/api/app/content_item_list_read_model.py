from __future__ import annotations

from typing import Any, Callable


def list_system_selected_content_items_page(
    *,
    page: int,
    page_size: int,
    sort: str | None,
    q: str | None,
    normalize_web_content_list_sort_func: Callable[[str | None], str],
    normalize_web_content_search_query_func: Callable[[str | None], str | None],
    combined_content_items_select_sql_func: Callable[..., str],
    build_web_content_search_clause_func: Callable[
        [str | None], tuple[str, tuple[Any, ...]]
    ],
    build_web_content_order_clause_func: Callable[[str], str],
    query_count_func: Callable[[str, tuple[Any, ...]], int],
    query_all_func: Callable[[str, tuple[Any, ...]], list[dict[str, Any]]],
    strip_web_content_internal_fields_func: Callable[
        [list[dict[str, Any]]], list[dict[str, Any]]
    ],
    build_paginated_response_func: Callable[
        [list[dict[str, Any]], int, int, int], dict[str, Any]
    ],
) -> dict[str, Any]:
    offset = (page - 1) * page_size
    resolved_sort = normalize_web_content_list_sort_func(sort)
    resolved_query = normalize_web_content_search_query_func(q)
    base_select = combined_content_items_select_sql_func(include_internal_fields=True)
    visible_select = f"select * from ({base_select}) content_items"
    search_clause, search_params = build_web_content_search_clause_func(resolved_query)
    order_clause = build_web_content_order_clause_func(resolved_sort)
    filtered_select = f"""
        {visible_select}
        {search_clause}
    """
    total = query_count_func(
        f"select count(*)::int as total from ({filtered_select}) counted",
        search_params,
    )
    items = strip_web_content_internal_fields_func(
        query_all_func(
            f"""
            {filtered_select}
            {order_clause}
            limit %s
            offset %s
            """,
            tuple([*search_params, page_size, offset]),
        )
    )
    return build_paginated_response_func(items, page, page_size, total)

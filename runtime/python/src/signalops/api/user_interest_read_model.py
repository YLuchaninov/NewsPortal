from __future__ import annotations

from typing import Any, Callable


def list_user_interests(
    *,
    user_id: str,
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
    interest_select = """
        select
          ui.*,
          uic.compiled_json,
          uic.compiled_at,
          uic.error_text
        from user_interests ui
        left join user_interests_compiled uic on uic.interest_id = ui.interest_id
        where ui.user_id = %s
        order by ui.updated_at desc
    """
    paginate, resolved_page, resolved_page_size, offset = resolve_pagination_func(
        page, page_size, 20
    )
    if not paginate:
        return query_all_func(interest_select, (user_id,))

    total = query_count_func(
        """
        select count(*)::int as total
        from user_interests
        where user_id = %s
        """,
        (user_id,),
    )
    items = query_all_func(
        f"{interest_select}\nlimit %s\noffset %s",
        (user_id, resolved_page_size, offset),
    )
    return build_paginated_response_func(
        items, resolved_page, resolved_page_size, total
    )

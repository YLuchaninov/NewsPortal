from __future__ import annotations

from typing import Any, Callable, Mapping


class SystemInterestNotFoundError(LookupError):
    pass


SYSTEM_INTEREST_SELECT = """
        select
          it.interest_template_id,
          it.name,
          it.description,
          it.positive_texts,
          it.negative_texts,
          it.must_have_terms,
          it.must_not_have_terms,
          it.places,
          it.languages_allowed,
          it.time_window_hours,
          coalesce(
            it.allowed_content_kinds,
            '["editorial","listing","entity","document","data_file","api_payload"]'::jsonb
          ) as allowed_content_kinds,
          it.short_tokens_required,
          it.short_tokens_forbidden,
          it.priority,
          it.is_active,
          it.created_at,
          it.updated_at,
          sp.selection_profile_id::text as selection_profile_id,
          sp.profile_family as selection_profile_family,
          sp.status as selection_profile_status,
          sp.version as selection_profile_version,
          sp.definition_json as selection_profile_definition_json,
          sp.policy_json as selection_profile_policy_json
        from interest_templates it
        left join selection_profiles sp
          on sp.source_interest_template_id = it.interest_template_id
"""


def list_system_interests(
    *,
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
    normalize_payload_func: Callable[[Mapping[str, Any]], dict[str, Any]],
) -> dict[str, Any] | list[dict[str, Any]]:
    interest_template_select = f"""
        {SYSTEM_INTEREST_SELECT}
        order by it.is_active desc, it.updated_at desc, it.created_at desc
    """
    paginate, resolved_page, resolved_page_size, offset = resolve_pagination_func(
        page, page_size, 20
    )
    if not paginate:
        return [
            normalize_payload_func(item)
            for item in query_all_func(interest_template_select)
        ]

    total = query_count_func(
        """
        select count(*)::int as total
        from interest_templates it
        """
    )
    items = query_all_func(
        f"{interest_template_select}\nlimit %s\noffset %s",
        (resolved_page_size, offset),
    )
    return build_paginated_response_func(
        [normalize_payload_func(item) for item in items],
        resolved_page,
        resolved_page_size,
        total,
    )


def get_system_interest(
    interest_template_id: str,
    *,
    query_one_func: Callable[[str, tuple[Any, ...]], dict[str, Any] | None],
    normalize_payload_func: Callable[[Mapping[str, Any]], dict[str, Any]],
) -> dict[str, Any]:
    template = query_one_func(
        f"""
        {SYSTEM_INTEREST_SELECT}
        where it.interest_template_id = %s
        """,
        (interest_template_id,),
    )
    if template is None:
        raise SystemInterestNotFoundError
    return normalize_payload_func(template)

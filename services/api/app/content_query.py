from __future__ import annotations

from typing import Any

WEB_CONTENT_LIST_SORTS = {"latest", "oldest", "title_asc", "title_desc"}


def is_fastapi_param_default(value: Any) -> bool:
    return value.__class__.__module__ == "fastapi.params"


def normalize_web_content_list_sort(value: str | None) -> str:
    if not isinstance(value, str):
        return "latest"
    normalized = str(value or "").strip().lower()
    if normalized in WEB_CONTENT_LIST_SORTS:
        return normalized
    return "latest"


def normalize_web_content_search_query(value: str | None) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    return normalized or None


def normalize_optional_query_string(value: Any) -> str | None:
    if value is None or is_fastapi_param_default(value):
        return None
    normalized = str(value or "").strip()
    return normalized or None


def build_web_content_search_pattern(query: str) -> str:
    escaped = query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def build_web_content_search_clause(
    query: str | None,
    *,
    alias: str,
) -> tuple[str, tuple[Any, ...]]:
    if query is None:
        return "", ()
    return (
        f"where coalesce({alias}._search_text, '') ilike %s escape '\\'",
        (build_web_content_search_pattern(query),),
    )


def build_web_content_order_clause(sort: str, *, alias: str) -> str:
    if sort == "oldest":
        return (
            f"order by {alias}.published_at asc nulls last, "
            f"{alias}.ingested_at asc nulls last, {alias}.content_item_id"
        )
    if sort == "title_asc":
        return (
            f"order by {alias}._normalized_title asc nulls last, "
            f"{alias}.published_at desc nulls last, "
            f"{alias}.ingested_at desc nulls last, {alias}.content_item_id"
        )
    if sort == "title_desc":
        return (
            f"order by {alias}._normalized_title desc nulls last, "
            f"{alias}.published_at desc nulls last, "
            f"{alias}.ingested_at desc nulls last, {alias}.content_item_id"
        )
    return (
        f"order by {alias}.published_at desc nulls last, "
        f"{alias}.ingested_at desc nulls last, {alias}.content_item_id"
    )


def strip_web_content_internal_fields(
    rows: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    return [
        {key: value for key, value in row.items() if not key.startswith("_")}
        for row in rows
    ]

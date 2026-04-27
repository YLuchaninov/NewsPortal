from __future__ import annotations

from typing import Any


def build_paginated_response(
    items: list[dict[str, Any]], page: int, page_size: int, total: int
) -> dict[str, Any]:
    total_pages = (total + page_size - 1) // page_size if total else 0
    return {
        "items": items,
        "page": page,
        "pageSize": page_size,
        "total": total,
        "totalPages": total_pages,
        "hasNext": page < total_pages,
        "hasPrev": page > 1,
    }


def resolve_pagination(
    page: int | None, page_size: int | None, default_page_size: int
) -> tuple[bool, int, int, int]:
    paginate = page is not None or page_size is not None
    resolved_page = page if page is not None else 1
    resolved_page_size = page_size if page_size is not None else default_page_size
    offset = (resolved_page - 1) * resolved_page_size
    return paginate, resolved_page, resolved_page_size, offset

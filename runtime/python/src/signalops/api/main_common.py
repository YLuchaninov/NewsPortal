from __future__ import annotations

from typing import Any

from signalops.api.channel_adapters import (
    default_max_entry_age_hours_for_adapter,
    infer_feed_ingress_adapter_strategy,
    resolve_feed_ingress_adapter_strategy,
    resolve_feed_ingress_max_entry_age_hours,
    with_resolved_channel_adapter_fields,
)
from signalops.api.content_query import (
    build_web_content_order_clause,
    build_web_content_search_clause,
    build_web_content_search_pattern,
    is_fastapi_param_default,
    normalize_optional_query_string,
    normalize_web_content_list_sort,
    normalize_web_content_search_query,
    strip_web_content_internal_fields,
)
from signalops.api.content_selection_read_model import (
    query_count as _content_selection_query_count,
)
from signalops.api.database import query_one
from signalops.api.json_read_model import (
    as_json_bool,
    as_json_int,
    as_json_object,
    as_json_str,
)
from signalops.api.reindex_read_model import (
    apply_reindex_selection_profile_payload,
    build_reindex_selection_profile_payload,
)

def normalize_optional_query_bool(value: Any) -> bool | None:
    if value is None or is_fastapi_param_default(value):
        return None
    return bool(value)


def query_count(sql: str, params: tuple[Any, ...] = ()) -> int:
    return _content_selection_query_count(sql, params, query_one_func=query_one)


__all__ = [
    "normalize_optional_query_bool",
    "query_count",
    "infer_feed_ingress_adapter_strategy",
    "default_max_entry_age_hours_for_adapter",
    "resolve_feed_ingress_adapter_strategy",
    "resolve_feed_ingress_max_entry_age_hours",
    "with_resolved_channel_adapter_fields",
    "is_fastapi_param_default",
    "normalize_web_content_list_sort",
    "normalize_web_content_search_query",
    "normalize_optional_query_string",
    "build_web_content_search_pattern",
    "build_web_content_search_clause",
    "build_web_content_order_clause",
    "strip_web_content_internal_fields",
    "as_json_object",
    "as_json_int",
    "as_json_bool",
    "as_json_str",
    "build_reindex_selection_profile_payload",
    "apply_reindex_selection_profile_payload",
]

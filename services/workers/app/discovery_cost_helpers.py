from __future__ import annotations

from decimal import Decimal
from typing import Any

from .discovery_runtime_settings import (
    ZERO_USD,
    coerce_discovery_cost_usd,
)


def meta_request_count(meta: dict[str, Any]) -> int:
    try:
        return max(0, int(meta.get("request_count") or 0))
    except (TypeError, ValueError):
        return 0


def meta_input_tokens(meta: dict[str, Any]) -> int | None:
    try:
        parsed = int(meta.get("prompt_tokens"))
    except (TypeError, ValueError):
        return None
    return parsed if parsed >= 0 else None


def meta_output_tokens(meta: dict[str, Any]) -> int | None:
    try:
        parsed = int(meta.get("completion_tokens"))
    except (TypeError, ValueError):
        return None
    return parsed if parsed >= 0 else None


def meta_cost_usd(meta: dict[str, Any]) -> Decimal:
    return coerce_discovery_cost_usd(meta.get("cost_usd"))


def should_log_external_call(meta: dict[str, Any]) -> bool:
    return (
        meta_request_count(meta) > 0
        or meta_cost_usd(meta) > ZERO_USD
        or meta_input_tokens(meta) is not None
        or meta_output_tokens(meta) is not None
    )

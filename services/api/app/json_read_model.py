from __future__ import annotations

from typing import Any


def as_json_object(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def as_json_int(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def as_json_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on"}
    return bool(value)


def as_json_str(value: Any) -> str | None:
    normalized = str(value or "").strip()
    return normalized or None

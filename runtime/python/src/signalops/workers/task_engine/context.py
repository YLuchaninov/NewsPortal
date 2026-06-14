from __future__ import annotations

import json
from typing import Any, Mapping

RESERVED_CONTEXT_KEYS = {
    "_sequence_id",
    "_run_id",
    "_task_key",
    "_task_index",
    "_trigger_type",
    "_trigger_meta",
}

CONTROL_CONTEXT_KEYS = {"_stop"}


def _is_json_serializable(value: Any) -> bool:
    try:
        json.dumps(value)
    except (TypeError, ValueError):
        return False
    return True


class ContextManager:
    """Maintains sequence execution context between tasks."""

    def __init__(self, initial: Mapping[str, Any] | None = None):
        self._data = dict(initial or {})

    @property
    def data(self) -> dict[str, Any]:
        return dict(self._data)

    def get(self, key: str, default: Any = None) -> Any:
        return self._data.get(key, default)

    def merge(self, result: Mapping[str, Any]) -> None:
        for key, value in result.items():
            if key in RESERVED_CONTEXT_KEYS:
                continue
            self._data[key] = value

    def task_view(self, *, task_key: str, task_index: int) -> dict[str, Any]:
        view = dict(self._data)
        view["_task_key"] = task_key
        view["_task_index"] = task_index
        return view

    def snapshot(self) -> dict[str, Any]:
        return {
            key: value
            for key, value in self._data.items()
            if _is_json_serializable(value)
        }

    def snapshot_result(self, result: Mapping[str, Any]) -> dict[str, Any]:
        return {
            key: value
            for key, value in result.items()
            if key not in RESERVED_CONTEXT_KEYS and _is_json_serializable(value)
        }

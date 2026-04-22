from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Mapping

DEFAULT_TASK_TIMEOUT_MS = 60_000
DEFAULT_RETRY_ATTEMPTS = 1
DEFAULT_RETRY_DELAY_MS = 1_000


@dataclass(frozen=True)
class TaskRetryPolicy:
    attempts: int = DEFAULT_RETRY_ATTEMPTS
    delay_ms: int = DEFAULT_RETRY_DELAY_MS

    @classmethod
    def from_mapping(cls, value: Mapping[str, Any] | None) -> "TaskRetryPolicy":
        if value is None:
            return cls()

        attempts = int(value.get("attempts", DEFAULT_RETRY_ATTEMPTS))
        delay_ms = int(value.get("delay_ms", DEFAULT_RETRY_DELAY_MS))
        return cls(
            attempts=max(1, attempts),
            delay_ms=max(0, delay_ms),
        )


@dataclass(frozen=True)
class TaskDefinition:
    key: str
    module: str
    options: dict[str, Any] = field(default_factory=dict)
    label: str | None = None
    notes: str | None = None
    enabled: bool = True
    retry: TaskRetryPolicy = field(default_factory=TaskRetryPolicy)
    timeout_ms: int = DEFAULT_TASK_TIMEOUT_MS

    @classmethod
    def from_mapping(cls, value: Mapping[str, Any]) -> "TaskDefinition":
        key = str(value["key"])
        module = str(value["module"])
        options_value = value.get("options", {})
        if not isinstance(options_value, Mapping):
            raise ValueError(f"Task {key} options must be an object.")

        timeout_ms = int(value.get("timeout_ms", DEFAULT_TASK_TIMEOUT_MS))
        return cls(
            key=key,
            module=module,
            options=dict(options_value),
            label=str(value["label"]) if value.get("label") is not None else None,
            notes=str(value["notes"]) if value.get("notes") is not None else None,
            enabled=bool(value.get("enabled", True)),
            retry=TaskRetryPolicy.from_mapping(
                value.get("retry") if isinstance(value.get("retry"), Mapping) else None
            ),
            timeout_ms=max(1, timeout_ms),
        )


@dataclass(frozen=True)
class SequenceDefinition:
    sequence_id: str
    title: str
    task_graph: list[TaskDefinition]
    status: str
    editor_state: dict[str, Any] | None = None
    trigger_event: str | None = None
    cron: str | None = None
    run_count: int = 0
    max_runs: int | None = None
    description: str | None = None
    tags: tuple[str, ...] = ()
    created_by: str | None = None

    @classmethod
    def from_record(cls, record: Mapping[str, Any]) -> "SequenceDefinition":
        task_graph_value = record.get("task_graph") or []
        if not isinstance(task_graph_value, list):
            raise ValueError("sequence.task_graph must be an array.")

        return cls(
            sequence_id=str(record["sequence_id"]),
            title=str(record["title"]),
            task_graph=[TaskDefinition.from_mapping(node) for node in task_graph_value],
            status=str(record["status"]),
            editor_state=(
                dict(record["editor_state"])
                if isinstance(record.get("editor_state"), Mapping)
                else None
            ),
            trigger_event=(
                str(record["trigger_event"]) if record.get("trigger_event") is not None else None
            ),
            cron=str(record["cron"]) if record.get("cron") is not None else None,
            run_count=int(record.get("run_count") or 0),
            max_runs=int(record["max_runs"]) if record.get("max_runs") is not None else None,
            description=(
                str(record["description"]) if record.get("description") is not None else None
            ),
            tags=tuple(str(tag) for tag in (record.get("tags") or ())),
            created_by=(
                str(record["created_by"]) if record.get("created_by") is not None else None
            ),
        )


@dataclass(frozen=True)
class SequenceRunRecord:
    run_id: str
    sequence_id: str
    status: str
    context_json: dict[str, Any]
    trigger_type: str
    retry_of_run_id: str | None = None
    trigger_meta: dict[str, Any] | None = None
    error_text: str | None = None

    @classmethod
    def from_record(cls, record: Mapping[str, Any]) -> "SequenceRunRecord":
        context_value = record.get("context_json") or {}
        if not isinstance(context_value, Mapping):
            raise ValueError("sequence_run.context_json must be an object.")

        trigger_meta = record.get("trigger_meta")
        if trigger_meta is not None and not isinstance(trigger_meta, Mapping):
            raise ValueError("sequence_run.trigger_meta must be an object.")

        return cls(
            run_id=str(record["run_id"]),
            sequence_id=str(record["sequence_id"]),
            status=str(record["status"]),
            context_json=dict(context_value),
            trigger_type=str(record["trigger_type"]),
            retry_of_run_id=(
                str(record["retry_of_run_id"])
                if record.get("retry_of_run_id") is not None
                else None
            ),
            trigger_meta=dict(trigger_meta) if isinstance(trigger_meta, Mapping) else None,
            error_text=str(record["error_text"]) if record.get("error_text") is not None else None,
        )

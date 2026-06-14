from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Mapping

from pydantic import BaseModel, ConfigDict, Field, ValidationError

DEFAULT_TASK_TIMEOUT_MS = 60_000
DEFAULT_RETRY_ATTEMPTS = 1
DEFAULT_RETRY_DELAY_MS = 1_000


class TaskRetryPolicyPayload(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    attempts: int = Field(default=DEFAULT_RETRY_ATTEMPTS, ge=1)
    delay_ms: int = Field(default=DEFAULT_RETRY_DELAY_MS, ge=0, alias="delayMs")


class TaskDefinitionPayload(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    key: str = Field(min_length=1)
    module: str = Field(min_length=1)
    options: dict[str, Any] = Field(default_factory=dict)
    label: str | None = None
    notes: str | None = None
    enabled: bool = True
    retry: TaskRetryPolicyPayload = Field(default_factory=TaskRetryPolicyPayload)
    timeout_ms: int = Field(default=DEFAULT_TASK_TIMEOUT_MS, ge=1, alias="timeoutMs")

    def to_task_record(self) -> dict[str, Any]:
        return self.model_dump(mode="json", by_alias=False)


def normalize_task_graph_payload(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        raise ValueError("task_graph must be an array.")
    return [
        TaskDefinitionPayload.model_validate(node).to_task_record()
        for node in value
    ]


def format_task_definition_validation_errors(error: ValidationError) -> list[str]:
    messages: list[str] = []
    for item in error.errors():
        location = ".".join(str(part) for part in item.get("loc", ())) or "task"
        messages.append(f"{location}: {item.get('msg', 'invalid task definition')}")
    return messages


@dataclass(frozen=True)
class TaskRetryPolicy:
    attempts: int = DEFAULT_RETRY_ATTEMPTS
    delay_ms: int = DEFAULT_RETRY_DELAY_MS

    @classmethod
    def from_mapping(cls, value: Mapping[str, Any] | None) -> "TaskRetryPolicy":
        payload = TaskRetryPolicyPayload.model_validate(value or {})
        return cls(
            attempts=payload.attempts,
            delay_ms=payload.delay_ms,
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
        payload = TaskDefinitionPayload.model_validate(value)
        return cls(
            key=payload.key,
            module=payload.module,
            options=dict(payload.options),
            label=payload.label,
            notes=payload.notes,
            enabled=payload.enabled,
            retry=TaskRetryPolicy.from_mapping(payload.retry.model_dump(by_alias=False)),
            timeout_ms=payload.timeout_ms,
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

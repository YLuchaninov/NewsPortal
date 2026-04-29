from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class SequenceCreatePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str
    task_graph: list[dict[str, Any]] = Field(alias="taskGraph")
    editor_state: dict[str, Any] | None = Field(default=None, alias="editorState")
    description: str | None = None
    status: Literal["draft", "active", "archived"] = "draft"
    trigger_event: str | None = Field(default=None, alias="triggerEvent")
    cron: str | None = None
    max_runs: int | None = Field(default=None, ge=1, alias="maxRuns")
    tags: list[str] = Field(default_factory=list)
    created_by: str | None = Field(default=None, alias="createdBy")


class SequenceUpdatePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str | None = None
    task_graph: list[dict[str, Any]] | None = Field(default=None, alias="taskGraph")
    editor_state: dict[str, Any] | None = Field(default=None, alias="editorState")
    description: str | None = None
    status: Literal["draft", "active", "archived"] | None = None
    trigger_event: str | None = Field(default=None, alias="triggerEvent")
    cron: str | None = None
    max_runs: int | None = Field(default=None, ge=1, alias="maxRuns")
    tags: list[str] | None = None
    created_by: str | None = Field(default=None, alias="createdBy")


class SequenceManualRunPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    context_json: dict[str, Any] = Field(default_factory=dict, alias="contextJson")
    trigger_meta: dict[str, Any] = Field(default_factory=dict, alias="triggerMeta")
    requested_by: str | None = Field(default=None, alias="requestedBy")


class SequenceRetryRunPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    context_overrides: dict[str, Any] = Field(
        default_factory=dict,
        alias="contextOverrides",
    )
    trigger_meta: dict[str, Any] = Field(default_factory=dict, alias="triggerMeta")
    requested_by: str | None = Field(default=None, alias="requestedBy")


class AgentSequenceCreatePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str
    task_graph: list[dict[str, Any]] = Field(alias="taskGraph")
    description: str | None = None
    tags: list[str] = Field(default_factory=list)
    created_by: str | None = Field(default=None, alias="createdBy")
    context_json: dict[str, Any] = Field(default_factory=dict, alias="contextJson")
    trigger_meta: dict[str, Any] = Field(default_factory=dict, alias="triggerMeta")
    run_now: bool = Field(default=True, alias="runNow")


class SequenceCancelPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reason: str | None = None


class ArticleEnrichmentRetryPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    requested_by: str | None = Field(default=None, alias="requestedBy")

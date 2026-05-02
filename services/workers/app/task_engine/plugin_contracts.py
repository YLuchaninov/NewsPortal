from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

PluginRetryClassification = Literal[
    "no_retry",
    "task_retry",
    "task_retry_with_transient_database_retry",
]


class TaskPluginOutputCaps(BaseModel):
    model_config = ConfigDict(extra="forbid")

    max_keys: int = Field(default=100, ge=1, le=1000)
    max_json_bytes: int = Field(default=262_144, ge=1024, le=10_485_760)


class TaskPluginContract(BaseModel):
    model_config = ConfigDict(extra="forbid")

    module: str = Field(min_length=1)
    category: str = Field(min_length=1)
    description: str = Field(min_length=1)
    options_schema: dict[str, Any] = Field(default_factory=dict)
    context_schema: dict[str, Any] = Field(default_factory=dict)
    context_requirements: list[str] = Field(default_factory=list)
    output_schema: dict[str, Any] = Field(default_factory=dict)
    output_caps: TaskPluginOutputCaps = Field(default_factory=TaskPluginOutputCaps)
    retry_classification: PluginRetryClassification = "task_retry_with_transient_database_retry"
    error_codes: list[str] = Field(default_factory=list)

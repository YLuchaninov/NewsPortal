from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class ContentAnalysisPolicyPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    policy_key: str = Field(alias="policyKey")
    title: str
    description: str | None = None
    scope_type: Literal["global", "source_channel", "system_interest", "sequence", "manual"] = Field(
        default="global",
        alias="scopeType",
    )
    scope_id: str | None = Field(default=None, alias="scopeId")
    module: Literal[
        "ner",
        "sentiment",
        "category",
        "system_interest_label",
        "content_filter",
        "cluster_summary",
        "clustering",
        "structured_extraction",
    ]
    enabled: bool = True
    mode: Literal["disabled", "observe", "dry_run", "hold", "enforce"] = "observe"
    provider: str | None = None
    model_key: str | None = Field(default=None, alias="modelKey")
    model_version: str | None = Field(default=None, alias="modelVersion")
    config_json: dict[str, Any] = Field(default_factory=dict, alias="configJson")
    failure_policy: Literal["skip", "hold", "reject", "fail_run"] = Field(default="skip", alias="failurePolicy")
    priority: int = 100
    version: int = 1
    is_active: bool = Field(default=True, alias="isActive")


class ContentAnalysisPolicyUpdatePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str | None = None
    description: str | None = None
    module: Literal[
        "ner",
        "sentiment",
        "category",
        "system_interest_label",
        "content_filter",
        "cluster_summary",
        "clustering",
        "structured_extraction",
    ] | None = None
    enabled: bool | None = None
    mode: Literal["disabled", "observe", "dry_run", "hold", "enforce"] | None = None
    provider: str | None = None
    model_key: str | None = Field(default=None, alias="modelKey")
    model_version: str | None = Field(default=None, alias="modelVersion")
    config_json: dict[str, Any] | None = Field(default=None, alias="configJson")
    failure_policy: Literal["skip", "hold", "reject", "fail_run"] | None = Field(default=None, alias="failurePolicy")
    is_active: bool | None = Field(default=None, alias="isActive")
    priority: int | None = None


class ContentFilterPolicyPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    policy_key: str = Field(alias="policyKey")
    title: str
    description: str | None = None
    scope_type: str = Field(default="global", alias="scopeType")
    scope_id: str | None = Field(default=None, alias="scopeId")
    mode: Literal["disabled", "observe", "dry_run", "hold", "enforce"] = "dry_run"
    combiner: Literal["all", "any", "priority_first"] = "all"
    policy_json: dict[str, Any] = Field(alias="policyJson")
    version: int = 1
    is_active: bool = Field(default=True, alias="isActive")
    priority: int = 100


class ContentFilterPolicyUpdatePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str | None = None
    description: str | None = None
    mode: Literal["disabled", "observe", "dry_run", "hold", "enforce"] | None = None
    combiner: Literal["all", "any", "priority_first"] | None = None
    policy_json: dict[str, Any] | None = Field(default=None, alias="policyJson")
    is_active: bool | None = Field(default=None, alias="isActive")
    priority: int | None = None


class ContentAnalysisBackfillPayload(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    subject_types: list[Literal["article", "web_resource", "story_cluster"]] = Field(
        default_factory=lambda: ["article", "web_resource", "story_cluster"],
        alias="subjectTypes",
    )
    modules: list[
        Literal[
            "ner",
            "sentiment",
            "category",
            "cluster_summary",
            "system_interest_labels",
            "content_filter",
            "structured_extraction",
        ]
    ] = Field(
        default_factory=lambda: [
            "ner",
            "sentiment",
            "category",
            "cluster_summary",
            "system_interest_labels",
            "content_filter",
        ],
    )
    missing_only: bool = Field(default=True, alias="missingOnly")
    policy_key: str = Field(default="default_recent_content_gate", alias="policyKey")
    batch_size: int = Field(default=100, ge=1, le=500, alias="batchSize")
    max_text_chars: int = Field(default=50_000, ge=1_000, le=250_000, alias="maxTextChars")
    requested_by_user_id: str | None = Field(default=None, alias="requestedByUserId")
    subject_ids: list[str] = Field(default_factory=list, alias="subjectIds")

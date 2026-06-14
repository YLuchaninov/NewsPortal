from __future__ import annotations

import re
from typing import Any, Literal

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, field_validator

class DiscoveryVNextRunCreatePayload(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    run_kind: Literal[
        "brief_compile",
        "mega_loop",
        "candidate_acquisition",
        "probe",
        "understand_route",
        "replay",
        "rollback",
        "full",
    ] = Field(alias="runKind")
    trigger_kind: Literal["operator", "mcp", "api", "replay", "rollback", "eval"] = Field(
        default="operator",
        alias="triggerKind",
    )
    request: dict[str, Any] = Field(default_factory=dict)
    budget: dict[str, Any] = Field(default_factory=dict)
    created_by: str = Field(default="api", alias="createdBy")


class DiscoveryVNextRunStartPayload(DiscoveryVNextRunCreatePayload):
    live_provider_execution: bool | None = Field(default=None, alias="liveProviderExecution")


class DiscoveryVNextBriefPreviewPayload(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    interest_id: str | None = Field(default=None, alias="interestId")
    name: str = "System interest"
    description: str = ""
    positive_texts: list[str] = Field(
        default_factory=list,
        validation_alias=AliasChoices("positiveTexts", "positive_texts"),
    )
    negative_texts: list[str] = Field(
        default_factory=list,
        validation_alias=AliasChoices("negativeTexts", "negative_texts"),
    )
    candidate_positive_signals: list[str] = Field(
        default_factory=list,
        validation_alias=AliasChoices("candidatePositiveSignals", "candidate_positive_signals"),
    )
    candidate_negative_signals: list[str] = Field(
        default_factory=list,
        validation_alias=AliasChoices("candidateNegativeSignals", "candidate_negative_signals"),
    )
    geographies: list[str] = Field(default_factory=list)
    languages: list[str] = Field(default_factory=list)
    operator_constraints: dict[str, Any] = Field(default_factory=dict, alias="operatorConstraints")

    @field_validator(
        "positive_texts",
        "negative_texts",
        "candidate_positive_signals",
        "candidate_negative_signals",
        mode="before",
    )
    @classmethod
    def _coerce_text_list(cls, value: Any) -> list[str]:
        if value is None:
            return []
        if isinstance(value, str):
            return [item.strip() for item in re.split(r"[,;\n]", value) if item.strip()]
        if isinstance(value, list):
            return [str(item).strip() for item in value if str(item).strip()]
        return value


class DiscoveryVNextArtifactValidatePayload(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    artifact_type: Literal[
        "DiscoveryBrief",
        "HypothesisBatch",
        "ProbePlan",
        "ProbeReport",
        "SourceScopeResolution",
        "SourceUnderstanding",
        "RoutingDecision",
        "QueryQualityReport",
    ] = Field(alias="artifactType")
    payload: dict[str, Any]


class DiscoveryVNextArtifactCreatePayload(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    artifact_type: Literal[
        "DiscoveryBrief",
        "HypothesisBatch",
        "ProbePlan",
        "ProbeReport",
        "SourceScopeResolution",
        "SourceUnderstanding",
        "RoutingDecision",
        "QueryQualityReport",
    ] = Field(alias="artifactType")
    payload: dict[str, Any]
    run_id: str | None = Field(default=None, alias="runId")
    vnext_run_id: str | None = Field(default=None, alias="vnextRunId")
    interest_id: str | None = Field(default=None, alias="interestId")
    candidate_id: str | None = Field(default=None, alias="candidateId")
    parent_artifact_ids: list[str] = Field(default_factory=list, alias="parentArtifactIds")
    memory_mode: str | None = Field(default=None, alias="memoryMode")
    lens: str | None = None
    policy_version: str | None = Field(default=None, alias="policyVersion")
    created_by: str = Field(default="api", alias="createdBy")


class DiscoveryVNextRoutePreviewPayload(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    source_understanding: dict[str, Any] = Field(alias="sourceUnderstanding")
    provider_type: str = Field(default="unknown", alias="providerType")
    access_pattern: str = Field(default="unknown", alias="accessPattern")
    policy: dict[str, Any] = Field(default_factory=dict)


class DiscoveryVNextMegaLoopPreviewPayload(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    discovery_brief: dict[str, Any] = Field(alias="discoveryBrief")
    loop_strategy: str = Field(default="universal_broad_coverage", alias="loopStrategy")
    coverage_policy: dict[str, Any] = Field(default_factory=dict, alias="coveragePolicy")
    adaptive_policy: dict[str, Any] = Field(default_factory=dict, alias="adaptivePolicy")
    max_batches: int = Field(default=11, ge=1, le=12, alias="maxBatches")
    locale: str | None = None
    previous_hypotheses: list[dict[str, Any]] = Field(default_factory=list, alias="previousHypotheses")
    source_inventory: list[dict[str, Any]] = Field(default_factory=list, alias="sourceInventory")
    feedback_events: list[dict[str, Any]] = Field(default_factory=list, alias="feedbackEvents")


class DiscoveryVNextCandidateNormalizePayload(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    results: list[dict[str, Any]]
    hypothesis_id: str = Field(alias="hypothesisId")
    query_attempt_id: str | None = Field(default=None, alias="queryAttemptId")
    query: str = ""
    query_family_intent: str = Field(default="", alias="queryFamilyIntent")
    lens: str | None = None
    memory_mode: str | None = Field(default=None, alias="memoryMode")
    run_id: str | None = Field(default=None, alias="runId")
    vnext_run_id: str | None = Field(default=None, alias="vnextRunId")
    interest_id: str | None = Field(default=None, alias="interestId")


class DiscoveryVNextCandidateCreatePayload(DiscoveryVNextCandidateNormalizePayload):
    hypothesis_artifact_id: str | None = Field(default=None, alias="hypothesisArtifactId")
    created_by: str = Field(default="api", alias="createdBy")


class DiscoveryVNextProbePlanPreviewPayload(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    candidate_url: str = Field(alias="candidateUrl")
    candidate_kind_guess: str = Field(default="unknown", alias="candidateKindGuess")
    policy: dict[str, Any] = Field(default_factory=dict)


class DiscoveryVNextProbeExecutePayload(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    probe_plan: dict[str, Any] = Field(alias="probePlan")
    run_id: str | None = Field(default=None, alias="runId")
    vnext_run_id: str | None = Field(default=None, alias="vnextRunId")
    interest_id: str | None = Field(default=None, alias="interestId")
    candidate_id: str | None = Field(default=None, alias="candidateId")
    parent_artifact_ids: list[str] = Field(default_factory=list, alias="parentArtifactIds")
    created_by: str = Field(default="api", alias="createdBy")


class DiscoveryVNextUnderstandPayload(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    discovery_brief: dict[str, Any] = Field(alias="discoveryBrief")
    probe_report: dict[str, Any] = Field(alias="probeReport")
    source_scope_resolution: dict[str, Any] = Field(default_factory=dict, alias="sourceScopeResolution")
    candidate: dict[str, Any] = Field(default_factory=dict)


class DiscoveryVNextScopeResolvePayload(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    discovery_brief: dict[str, Any] = Field(default_factory=dict, alias="discoveryBrief")
    candidate: dict[str, Any] = Field(default_factory=dict)
    probe_report: dict[str, Any] = Field(alias="probeReport")
    previous_memory: dict[str, Any] = Field(default_factory=dict, alias="previousMemory")
    run_id: str | None = Field(default=None, alias="runId")
    vnext_run_id: str | None = Field(default=None, alias="vnextRunId")
    interest_id: str | None = Field(default=None, alias="interestId")
    candidate_id: str | None = Field(default=None, alias="candidateId")
    parent_artifact_ids: list[str] = Field(default_factory=list, alias="parentArtifactIds")
    created_by: str = Field(default="api", alias="createdBy")


class DiscoveryVNextRoutingApplyPayload(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    source_understanding: dict[str, Any] = Field(alias="sourceUnderstanding")
    canonical_url: str = Field(alias="canonicalUrl")
    canonical_domain: str = Field(alias="canonicalDomain")
    source_identity_key: str = Field(alias="sourceIdentityKey")
    provider_type: str = Field(default="unknown", alias="providerType")
    access_pattern: str = Field(default="unknown", alias="accessPattern")
    policy: dict[str, Any] = Field(default_factory=dict)
    run_id: str | None = Field(default=None, alias="runId")
    vnext_run_id: str | None = Field(default=None, alias="vnextRunId")
    interest_id: str | None = Field(default=None, alias="interestId")
    candidate_id: str | None = Field(default=None, alias="candidateId")
    parent_artifact_ids: list[str] = Field(default_factory=list, alias="parentArtifactIds")
    created_by: str = Field(default="api", alias="createdBy")


class DiscoveryVNextProbationHandoffPayload(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    source_understanding: dict[str, Any] = Field(alias="sourceUnderstanding")
    routing_decision: dict[str, Any] = Field(alias="routingDecision")
    source_inventory_id: str | None = Field(default=None, alias="sourceInventoryId")
    provider_type: str | None = Field(default=None, alias="providerType")
    created_by: str = Field(default="api", alias="createdBy")
    dry_run: bool = Field(default=False, alias="dryRun")


class DiscoveryVNextFeedbackPayload(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    target_type: Literal[
        "artifact",
        "candidate",
        "source_inventory",
        "routing_decision",
        "policy",
    ] = Field(alias="targetType")
    target_id: str = Field(alias="targetId")
    feedback_type: Literal[
        "approve",
        "reject",
        "correct",
        "rollback",
        "mark_noise",
        "mark_useful",
        "policy_issue",
        "source_scope_correct",
        "source_scope_wrong",
        "source_understanding_correct",
        "source_understanding_wrong",
        "routing_correct",
        "routing_wrong",
        "source_useful_as_inventory",
        "source_not_useful",
        "lead_useful",
        "lead_false_positive",
        "adapter_gap_confirmed",
        "adapter_gap_wrong",
    ] = Field(alias="feedbackType")
    feedback: dict[str, Any] = Field(default_factory=dict)
    created_by: str = Field(default="api", alias="createdBy")


class DiscoveryVNextPolicyActivatePayload(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    policy_name: str = Field(alias="policyName")
    policy_version: str = Field(alias="policyVersion")
    policy_type: Literal["routing", "probe", "mega_loop", "risk", "rollback", "permissions"] = Field(alias="policyType")
    definition: dict[str, Any]
    created_by: str = Field(default="api", alias="createdBy")


class DiscoveryVNextReplayPayload(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    replay_kind: Literal["artifact_lineage", "routing_policy", "candidate_acquisition", "full_non_live"] = Field(alias="replayKind")
    input: dict[str, Any] = Field(default_factory=dict)
    policy_versions: dict[str, Any] = Field(default_factory=dict, alias="policyVersions")
    dry_run: bool = Field(default=True, alias="dryRun")
    created_by: str = Field(default="api", alias="createdBy")


class DiscoveryVNextLlmGatewayPayload(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    task: str
    prompt: str | None = None
    payload: dict[str, Any] = Field(default_factory=dict)
    model: str | None = None
    temperature: float = 0.0
    output_schema: dict[str, Any] = Field(default_factory=dict, alias="outputSchema")
    budget: dict[str, Any] = Field(default_factory=dict)
    run_id: str | None = Field(default=None, alias="runId")
    vnext_run_id: str | None = Field(default=None, alias="vnextRunId")
    artifact_id: str | None = Field(default=None, alias="artifactId")
    live_provider_execution: bool = Field(default=False, alias="liveProviderExecution")
    created_by: str = Field(default="api", alias="createdBy")


class DiscoveryVNextRollbackPreparePayload(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    source_inventory_id: str = Field(alias="sourceInventoryId")
    reason: str
    created_by: str = Field(default="api", alias="createdBy")


class DiscoveryVNextRollbackApplyPayload(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    rollback_group_id: str = Field(alias="rollbackGroupId")
    applied_by: str = Field(default="api", alias="appliedBy")
    confirm: bool = False


class DiscoveryVNextSourceInventoryExplainPayload(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    source_inventory_id: str = Field(alias="sourceInventoryId")


class DiscoveryVNextSourceInventoryResolveScopesPayload(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    source_inventory_ids: list[str] = Field(default_factory=list, alias="sourceInventoryIds")
    limit: int = Field(default=25, ge=1, le=100)
    apply: bool = False
    created_by: str = Field(default="api", alias="createdBy")


class DiscoveryVNextSourceInventoryActionPayload(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    source_inventory_id: str = Field(alias="sourceInventoryId")
    action: Literal[
        "re_resolve",
        "promote_resolved_scope",
        "demote_to_context",
        "move_to_adapter_backlog",
        "confirm_scope",
        "reject_scope",
    ]
    reason: str = ""
    created_by: str = Field(default="api", alias="createdBy")

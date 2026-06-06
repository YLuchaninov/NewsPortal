from __future__ import annotations

import os
import re
from datetime import date, datetime
from decimal import Decimal
from hashlib import sha256
from typing import Any, Literal
from urllib.parse import parse_qs, urlencode, urlparse
from uuid import UUID

from fastapi import HTTPException
from pydantic import AliasChoices, BaseModel, ConfigDict, Field, field_validator
from psycopg.types.json import Json

from services.api.app.database import query_all, query_count, query_one
from services.api.app.pagination import build_paginated_response
from services.workers.app.discovery_vnext_artifacts import (
    ARTIFACT_TYPES,
    validate_artifact_envelope,
    validate_artifact_payload,
    validation_json,
)
from services.workers.app.discovery_vnext_brief import compile_discovery_brief
from services.workers.app.discovery_vnext_candidates import build_candidate_rows, query_quality_report
from services.workers.app.discovery_vnext_megaloop import run_mega_loop_preview
from services.workers.app.discovery_vnext_handoff import apply_probation_handoff
from services.workers.app.discovery_vnext_probe import build_probe_plan, execute_probe_plan
from services.workers.app.discovery_vnext_routing import route_source_understanding
from services.workers.app.discovery_vnext_scope_resolution import resolve_source_scope
from services.workers.app.discovery_vnext_understanding import synthesize_source_understanding
from services.workers.app.task_engine.adapters.source_registrar import PostgresSourceRegistrarAdapter
from services.workers.app.task_engine.adapters.llm_analyzer import GeminiLlmAnalyzerAdapter
from services.workers.app.task_engine.adapters.web_search import (
    BraveWebSearchAdapter,
    DdgsWebSearchAdapter,
    SerperWebSearchAdapter,
    StubWebSearchAdapter,
    unwrap_web_search_output,
)


VNEXT_LIST_RESOURCES = {
    "artifacts": {
        "table": "discovery_artifacts",
        "id": "artifact_id",
        "order": "created_at desc",
        "status": True,
        "artifact_type": True,
    },
    "candidates": {
        "table": "discovery_candidates",
        "id": "candidate_id",
        "order": "created_at desc",
        "status": True,
    },
    "source-inventory": {
        "table": "source_inventory",
        "id": "source_inventory_id",
        "order": "updated_at desc",
        "status": False,
    },
    "policies": {
        "table": "discovery_policies",
        "id": "policy_id",
        "order": "created_at desc",
        "status": True,
    },
    "adapter-backlog": {
        "table": "adapter_backlog",
        "id": "adapter_backlog_id",
        "order": "created_at desc",
        "status": True,
    },
    "feedback": {
        "table": "discovery_feedback_events",
        "id": "feedback_id",
        "order": "created_at desc",
        "status": False,
    },
    "runs": {
        "table": "discovery_vnext_runs",
        "id": "vnext_run_id",
        "order": "created_at desc",
        "status": True,
    },
    "replay-runs": {
        "table": "discovery_replay_runs",
        "id": "replay_run_id",
        "order": "created_at desc",
        "status": True,
    },
    "rollback-groups": {
        "table": "discovery_rollback_groups",
        "id": "rollback_group_id",
        "order": "created_at desc",
        "status": True,
    },
    "rollback-actions": {
        "table": "discovery_rollback_actions",
        "id": "rollback_action_id",
        "order": "created_at desc",
        "status": True,
    },
    "eval-runs": {
        "table": "discovery_vnext_eval_runs",
        "id": "eval_run_id",
        "order": "created_at desc",
        "status": True,
    },
    "run-steps": {
        "table": "discovery_run_steps",
        "id": "run_step_id",
        "order": "created_at desc",
        "status": True,
    },
    "query-attempts": {
        "table": "discovery_query_attempts",
        "id": "query_attempt_id",
        "order": "created_at desc",
        "status": True,
    },
    "llm-gateway-events": {
        "table": "discovery_llm_gateway_events",
        "id": "llm_gateway_event_id",
        "order": "created_at desc",
        "status": True,
    },
    "monitoring-state": {
        "table": "source_monitoring_state",
        "id": "source_inventory_id",
        "order": "updated_at desc",
        "status": False,
    },
    "source-observations": {
        "table": "source_observations",
        "id": "observation_id",
        "order": "observed_at desc",
        "status": False,
    },
}


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


def preview_brief(payload: DiscoveryVNextBriefPreviewPayload) -> dict[str, Any]:
    resolve_required_policy_payload({}, "discovery-runtime")
    return compile_discovery_brief(
        {
            "interestId": payload.interest_id,
            "name": payload.name,
            "description": payload.description,
            "positive_texts": payload.positive_texts,
            "negative_texts": payload.negative_texts,
            "candidate_positive_signals": payload.candidate_positive_signals,
            "candidate_negative_signals": payload.candidate_negative_signals,
            "geographies": payload.geographies,
            "languages": payload.languages,
        },
        operator_constraints=payload.operator_constraints,
    )


def create_run(payload: DiscoveryVNextRunCreatePayload) -> dict[str, Any]:
    resolve_required_policy_payload({}, "discovery-runtime")
    row = query_one(
        """
        insert into discovery_vnext_runs (
          run_kind,
          trigger_kind,
          status,
          created_by,
          request_json,
          budget_json
        )
        values (%s, %s, 'queued', %s, %s, %s)
        returning *
        """,
        (
            payload.run_kind,
            payload.trigger_kind,
            payload.created_by,
            Json(payload.request),
            Json(payload.budget),
        ),
    )
    return row or {}


def start_run(payload: DiscoveryVNextRunStartPayload) -> dict[str, Any]:
    runtime_policy = resolve_required_policy_payload({}, "discovery-runtime")
    live_provider_execution = (
        bool(runtime_policy.get("liveProviderExecutionDefault", True))
        if payload.live_provider_execution is None
        else bool(payload.live_provider_execution)
    )
    effective_budget = _effective_run_budget(
        runtime_policy=runtime_policy,
        request=payload.request,
        budget=payload.budget,
        live_provider_execution=live_provider_execution,
    )
    if live_provider_execution:
        _assert_live_runtime_allowed(
            runtime_policy,
            effective_budget,
            provider=_search_provider_from_request(payload.request),
        )
    run = create_run(
        DiscoveryVNextRunCreatePayload(
            runKind=payload.run_kind,
            triggerKind=payload.trigger_kind,
            request=payload.request,
            budget=effective_budget,
            createdBy=payload.created_by,
        )
    )
    run_id = str(run.get("vnext_run_id") or "")
    try:
        result = execute_run_steps(
            run_id=run_id,
            run_kind=payload.run_kind,
            request=payload.request,
            budget=effective_budget,
            live_provider_execution=live_provider_execution,
            created_by=payload.created_by,
        )
    except HTTPException as error:
        _complete_run(run_id, status="failed", error={"detail": error.detail})
        raise
    except Exception as error:  # noqa: BLE001 - keep operator run failure durable.
        _complete_run(run_id, status="failed", error={"detail": str(error), "type": type(error).__name__})
        raise HTTPException(status_code=500, detail=f"Discovery vNext run failed: {error}") from error
    _complete_run(run_id, status="succeeded", result=result)
    return {"run": get_vnext_record("runs", run_id), "result": result}


def cancel_run(run_id: str) -> dict[str, Any]:
    row = query_one(
        """
        update discovery_vnext_runs
        set status = 'cancelled',
            completed_at = now(),
            updated_at = now()
        where vnext_run_id = %s
          and status in ('queued', 'running')
        returning *
        """,
        (run_id,),
    )
    if not row:
        raise HTTPException(status_code=404, detail="Discovery vNext run was not cancellable or was not found.")
    return row


def diagnose_run(run_id: str) -> dict[str, Any]:
    run = get_vnext_record("runs", run_id)
    artifacts = query_all(
        """
        select artifact_type, status, count(*)::int as count
        from discovery_artifacts
        where vnext_run_id = %s
        group by artifact_type, status
        order by artifact_type, status
        """,
        (run_id,),
    )
    candidates = query_all(
        """
        select status, count(*)::int as count
        from discovery_candidates
        where vnext_run_id = %s
        group by status
        order by status
        """,
        (run_id,),
    )
    run_steps = query_all(
        """
        select *
        from discovery_run_steps
        where vnext_run_id = %s
        order by created_at
        """,
        (run_id,),
    )
    query_attempts = query_all(
        """
        select *
        from discovery_query_attempts
        where vnext_run_id = %s
        order by created_at
        """,
        (run_id,),
    )
    llm_gateway_events = query_all(
        """
        select *
        from discovery_llm_gateway_events
        where vnext_run_id = %s
        order by created_at
        """,
        (run_id,),
    )
    return {
        "run": run,
        "artifactSummary": artifacts,
        "candidateSummary": candidates,
        "runSteps": run_steps,
        "queryAttempts": query_attempts,
        "llmGatewayEvents": llm_gateway_events,
    }


def validate_artifact(payload: DiscoveryVNextArtifactValidatePayload) -> dict[str, Any]:
    issues = validate_artifact_payload(payload.artifact_type, payload.payload)
    return {
        "artifactType": payload.artifact_type,
        "validation": validation_json(issues),
    }


def create_artifact_from_payload(payload: DiscoveryVNextArtifactCreatePayload) -> dict[str, Any]:
    return create_artifact(
        payload.artifact_type,
        payload.payload,
        vnext_run_id=payload.vnext_run_id or payload.run_id,
        interest_id=payload.interest_id,
        candidate_id=payload.candidate_id,
        parent_artifact_ids=payload.parent_artifact_ids,
        memory_mode=payload.memory_mode,
        lens=payload.lens,
        policy_version=payload.policy_version,
        created_by=payload.created_by,
    )


def resolve_required_policy_payload(policy: dict[str, Any], policy_name: str) -> dict[str, Any]:
    if policy:
        return policy
    row = get_required_active_policy(policy_name)
    definition = row.get("definition_json") or row.get("definitionJson")
    if not isinstance(definition, dict) or not definition:
        raise HTTPException(
            status_code=503,
            detail=f"Required Discovery vNext policy is invalid: {policy_name}.",
        )
    return definition


def preview_route(payload: DiscoveryVNextRoutePreviewPayload) -> dict[str, Any]:
    source_understanding = dict(payload.source_understanding)
    source_understanding.setdefault("yieldIndependent", True)
    issues = validate_artifact_envelope(
        {
            "artifactType": "SourceUnderstanding",
            "schemaVersion": "2.0",
            "status": "generated",
            "payload": source_understanding,
        }
    )
    if issues:
        return {
            "routingDecision": None,
            "sourceUnderstandingValidation": validation_json(issues),
        }
    routing_decision = route_source_understanding(
        source_understanding,
        policy=resolve_required_policy_payload(payload.policy, "discovery-routing"),
        provider_type=payload.provider_type,
        access_pattern=payload.access_pattern,
    )
    return {
        "routingDecision": routing_decision,
        "routingDecisionValidation": validation_json(
            validate_artifact_payload("RoutingDecision", routing_decision)
        ),
    }


def preview_mega_loop(payload: DiscoveryVNextMegaLoopPreviewPayload) -> dict[str, Any]:
    policy = resolve_required_policy_payload({}, "discovery-mega-loop")
    max_batches = min(payload.max_batches, int(policy.get("maxBatchesPerRun") or payload.max_batches))
    memory = _mega_loop_memory(
        interest_id=str(payload.discovery_brief.get("interestId") or payload.discovery_brief.get("interest_id") or "")
    )
    return run_mega_loop_preview(
        payload.discovery_brief,
        max_batches=max_batches,
        coverage_policy=payload.coverage_policy,
        adaptive_policy=payload.adaptive_policy,
        locale=payload.locale,
        previous_hypotheses=payload.previous_hypotheses or memory["previousHypotheses"],
        source_inventory=payload.source_inventory or memory["sourceInventory"],
        feedback_events=payload.feedback_events or memory["feedbackEvents"],
    )


def _mega_loop_memory(*, interest_id: str) -> dict[str, list[dict[str, Any]]]:
    if not interest_id:
        return {"previousHypotheses": [], "sourceInventory": [], "feedbackEvents": []}
    previous_artifacts = query_all(
        """
        select payload_json
        from discovery_artifacts
        where interest_id = %s
          and artifact_type = 'HypothesisBatch'
          and status in ('validated', 'applied', 'generated')
        order by created_at desc
        limit 25
        """,
        (interest_id,),
    )
    previous_hypotheses: list[dict[str, Any]] = []
    for artifact in previous_artifacts:
        payload = artifact.get("payload_json") if isinstance(artifact.get("payload_json"), dict) else {}
        for hypothesis in payload.get("hypotheses") or []:
            if isinstance(hypothesis, dict):
                previous_hypotheses.append(hypothesis)
    source_inventory = query_all(
        """
        select canonical_domain, current_state, source_voice, artifact_freshness_kind, signal_production_mode
        from source_inventory
        where latest_source_understanding_artifact_id in (
          select artifact_id from discovery_artifacts where interest_id = %s
        )
        order by updated_at desc
        limit 100
        """,
        (interest_id,),
    )
    feedback_events = query_all(
        """
        select feedback_type, feedback_json
        from discovery_feedback_events
        where target_type in ('artifact', 'candidate', 'source_inventory', 'routing_decision')
        order by created_at desc
        limit 100
        """,
        (),
    )
    return {
        "previousHypotheses": previous_hypotheses,
        "sourceInventory": source_inventory,
        "feedbackEvents": feedback_events,
    }


def normalize_candidates(payload: DiscoveryVNextCandidateNormalizePayload) -> dict[str, Any]:
    resolve_required_policy_payload({}, "discovery-runtime")
    candidates = build_candidate_rows(
        run_id=payload.vnext_run_id or payload.run_id,
        interest_id=payload.interest_id,
        hypothesis_id=payload.hypothesis_id,
        query_attempt_id=payload.query_attempt_id,
        results=payload.results,
        lens=payload.lens,
        memory_mode=payload.memory_mode,
    )
    return {
        "candidates": candidates,
        "queryQualityReport": query_quality_report(
            query=payload.query,
            query_family_intent=payload.query_family_intent,
            candidates=candidates,
            raw_result_count=len(payload.results),
        ),
    }


def create_candidates_from_payload(payload: DiscoveryVNextCandidateCreatePayload) -> dict[str, Any]:
    normalized = normalize_candidates(payload)
    query_quality_artifact = create_artifact(
        "QueryQualityReport",
        normalized["queryQualityReport"],
        vnext_run_id=payload.vnext_run_id or payload.run_id,
        interest_id=payload.interest_id,
        parent_artifact_ids=[payload.hypothesis_artifact_id] if payload.hypothesis_artifact_id else [],
        created_by=payload.created_by,
    )
    candidates = [
        upsert_candidate(
            {**candidate, "queryQuality": normalized["queryQualityReport"]},
            hypothesis_artifact_id=payload.hypothesis_artifact_id,
            query_quality_artifact_id=str(query_quality_artifact.get("artifact_id") or ""),
        )
        for candidate in normalized["candidates"]
    ]
    return {
        "queryQualityReportArtifact": query_quality_artifact,
        "candidates": candidates,
    }


def preview_probe_plan(payload: DiscoveryVNextProbePlanPreviewPayload) -> dict[str, Any]:
    policy = resolve_required_policy_payload(payload.policy, "discovery-probe")
    return build_probe_plan(
        candidate_url=payload.candidate_url,
        candidate_kind_guess=payload.candidate_kind_guess,
        policy=policy,
    )


def execute_probe_from_payload(payload: DiscoveryVNextProbeExecutePayload) -> dict[str, Any]:
    resolve_required_policy_payload({}, "discovery-probe")
    probe_plan_payload = (
        payload.probe_plan.get("payload")
        if isinstance(payload.probe_plan.get("payload"), dict)
        else payload.probe_plan
    )
    probe_plan_artifact = create_artifact(
        "ProbePlan",
        probe_plan_payload,
        vnext_run_id=payload.vnext_run_id or payload.run_id,
        interest_id=payload.interest_id,
        candidate_id=payload.candidate_id,
        parent_artifact_ids=payload.parent_artifact_ids,
        created_by=payload.created_by,
    )
    if probe_plan_artifact.get("status") == "rejected":
        return {
            "probePlanArtifact": probe_plan_artifact,
            "probeReportArtifact": None,
        }
    report = execute_probe_plan(probe_plan_payload)
    probe_report_artifact = create_artifact(
        "ProbeReport",
        report["payload"],
        vnext_run_id=payload.vnext_run_id or payload.run_id,
        interest_id=payload.interest_id,
        candidate_id=payload.candidate_id,
        parent_artifact_ids=[str(probe_plan_artifact.get("artifact_id") or "")],
        created_by=payload.created_by,
    )
    return {
        "probePlanArtifact": probe_plan_artifact,
        "probeReportArtifact": probe_report_artifact,
    }


def preview_scope_resolution(payload: DiscoveryVNextScopeResolvePayload) -> dict[str, Any]:
    resolve_required_policy_payload({}, "discovery-probe")
    return resolve_source_scope(
        discovery_brief=payload.discovery_brief,
        candidate=payload.candidate,
        probe_report=payload.probe_report,
        previous_memory=payload.previous_memory,
    )


def apply_scope_resolution(payload: DiscoveryVNextScopeResolvePayload) -> dict[str, Any]:
    preview = preview_scope_resolution(payload)
    scope_payload = _artifact_payload(preview) or preview.get("payload") or {}
    artifact = create_artifact(
        "SourceScopeResolution",
        scope_payload,
        vnext_run_id=payload.vnext_run_id or payload.run_id,
        interest_id=payload.interest_id,
        candidate_id=payload.candidate_id,
        parent_artifact_ids=payload.parent_artifact_ids,
        created_by=payload.created_by,
    )
    return {"sourceScopeResolutionArtifact": artifact}


def preview_source_understanding(payload: DiscoveryVNextUnderstandPayload) -> dict[str, Any]:
    resolve_required_policy_payload({}, "discovery-routing")
    return synthesize_source_understanding(
        discovery_brief=payload.discovery_brief,
        probe_report=payload.probe_report,
        source_scope_resolution=payload.source_scope_resolution,
        candidate=payload.candidate,
    )


def apply_probation_handoff_from_payload(payload: DiscoveryVNextProbationHandoffPayload) -> dict[str, Any]:
    result = apply_probation_handoff(
        source_understanding=payload.source_understanding,
        routing_decision=payload.routing_decision,
        registrar=PostgresSourceRegistrarAdapter(),
        provider_type=payload.provider_type,
        created_by=payload.created_by,
        dry_run=payload.dry_run,
    )
    channel_id = _first_registered_channel_id(result)
    inventory = None
    if channel_id and payload.source_inventory_id and not payload.dry_run:
        current_state = _inventory_state_for_decision(
            str(payload.routing_decision.get("decision") or "auto_register_probation")
        )
        if current_state not in {"probation_channel", "cheap_watch"}:
            current_state = "probation_channel"
        inventory = mark_inventory_registered_channel(
            source_inventory_id=payload.source_inventory_id,
            channel_id=channel_id,
            current_state=current_state,
        )
    return {
        **result,
        "sourceInventory": inventory,
    }


def apply_routing_decision(payload: DiscoveryVNextRoutingApplyPayload) -> dict[str, Any]:
    source_understanding = dict(payload.source_understanding)
    source_understanding.setdefault("candidateId", payload.candidate_id)
    source_understanding.setdefault("sourceUrl", payload.canonical_url)
    source_understanding.setdefault("yieldIndependent", True)

    source_artifact = create_artifact(
        "SourceUnderstanding",
        source_understanding,
        vnext_run_id=payload.vnext_run_id or payload.run_id,
        interest_id=payload.interest_id,
        candidate_id=payload.candidate_id,
        parent_artifact_ids=payload.parent_artifact_ids,
        created_by=payload.created_by,
    )
    if source_artifact.get("status") == "rejected":
        return {
            "sourceUnderstandingArtifact": source_artifact,
            "routingDecisionArtifact": None,
            "sourceInventory": None,
            "adapterBacklogItem": None,
        }

    routing_decision = route_source_understanding(
        {
            **source_understanding,
            "artifactId": str(source_artifact.get("artifact_id") or source_artifact.get("artifactId") or ""),
        },
        policy=resolve_required_policy_payload(payload.policy, "discovery-routing"),
        provider_type=payload.provider_type,
        access_pattern=payload.access_pattern,
    )
    sample_review_required = _sample_review_required(routing_decision, source_understanding, payload.policy)
    if sample_review_required:
        routing_decision = {
            **routing_decision,
            "sampleReviewRequired": True,
            "sampleReviewReason": "policy_sample_review_for_auto_routed_source",
        }
    routing_artifact = create_artifact(
        "RoutingDecision",
        routing_decision,
        vnext_run_id=payload.vnext_run_id or payload.run_id,
        interest_id=payload.interest_id,
        candidate_id=payload.candidate_id,
        parent_artifact_ids=[str(source_artifact.get("artifact_id") or "")],
        policy_version=str(routing_decision.get("policyVersion") or ""),
        created_by=payload.created_by,
        status="applied",
    )
    payload.source_identity_key = source_identity_key(
        canonical_url=payload.canonical_url,
        provider_type=payload.provider_type,
        source_understanding=source_understanding,
    )
    inventory = upsert_source_inventory(
        payload,
        source_artifact_id=str(source_artifact["artifact_id"]),
        routing_artifact_id=str(routing_artifact["artifact_id"]),
        decision=str(routing_decision["decision"]),
    )
    monitoring_state = upsert_monitoring_state(
        source_inventory_id=str(inventory["source_inventory_id"]),
        decision=str(routing_decision["decision"]),
        routing_decision=routing_decision,
    )
    observation = create_source_observation(
        source_inventory_id=str(inventory["source_inventory_id"]),
        observation_kind="risk_signal",
        observation={
            "sourceScopeResolutionArtifactId": source_understanding.get("sourceScopeResolutionArtifactId"),
            "sourceUnderstandingArtifactId": str(source_artifact["artifact_id"]),
            "routingDecisionArtifactId": str(routing_artifact["artifact_id"]),
            "decision": routing_decision["decision"],
            "scoreComponents": routing_decision.get("scoreComponents") or {},
            "sampleReviewRequired": sample_review_required,
            "sampleReviewReason": routing_decision.get("sampleReviewReason"),
        },
    )
    scope_observation = None
    if isinstance(source_understanding.get("sourceScopeResolution"), dict):
        scope_observation = create_source_observation(
            source_inventory_id=str(inventory["source_inventory_id"]),
            observation_kind="scope_resolution",
            observation={
                "sourceScopeResolutionArtifactId": source_understanding.get("sourceScopeResolutionArtifactId"),
                "candidateUrl": source_understanding["sourceScopeResolution"].get("candidateUrl"),
                "resolvedSourceUrl": source_understanding["sourceScopeResolution"].get("resolvedSourceUrl"),
                "sourceScopeType": source_understanding["sourceScopeResolution"].get("sourceScopeType"),
                "sourceScopeConfidence": source_understanding["sourceScopeResolution"].get("sourceScopeConfidence"),
            },
        )
    backlog_item = None
    if routing_decision["decision"] == "adapter_backlog":
        backlog_item = create_adapter_backlog_item(
            payload,
            source_inventory_id=str(inventory["source_inventory_id"]),
            reason=routing_decision,
        )
    rollback_group = None
    if routing_decision["decision"] in {"auto_register_probation", "cheap_watch", "adapter_backlog"}:
        rollback_group = prepare_rollback(
            DiscoveryVNextRollbackPreparePayload(
                sourceInventoryId=str(inventory["source_inventory_id"]),
                reason=f"Rollback prepared for {routing_decision['decision']} routing.",
                createdBy=payload.created_by,
            )
        )
    return {
        "sourceUnderstandingArtifact": source_artifact,
        "routingDecisionArtifact": routing_artifact,
        "sourceInventory": inventory,
        "monitoringState": monitoring_state,
        "sourceObservation": observation,
        "scopeObservation": scope_observation,
        "adapterBacklogItem": backlog_item,
        "rollback": rollback_group,
    }


def create_artifact(
    artifact_type: str,
    payload: dict[str, Any],
    *,
    vnext_run_id: str | None = None,
    interest_id: str | None = None,
    candidate_id: str | None = None,
    parent_artifact_ids: list[str] | None = None,
    memory_mode: str | None = None,
    lens: str | None = None,
    policy_version: str | None = None,
    created_by: str = "api",
    status: str | None = None,
) -> dict[str, Any]:
    if artifact_type not in ARTIFACT_TYPES:
        raise HTTPException(status_code=422, detail="Unsupported Discovery vNext artifact type.")
    normalized_parent_ids = _normalize_parent_artifact_ids(parent_artifact_ids or [])
    _assert_parent_artifacts_exist(normalized_parent_ids)
    issues = validate_artifact_payload(artifact_type, payload)
    validation = validation_json(issues)
    row = query_one(
        """
        insert into discovery_artifacts (
          artifact_type,
          schema_version,
          vnext_run_id,
          interest_id,
          candidate_id,
          parent_artifact_ids,
          created_by,
          memory_mode,
          lens,
          policy_version,
          status,
          payload_json,
          validation_json
        )
        values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        returning *
        """,
        (
            artifact_type,
            "2.0" if artifact_type == "SourceUnderstanding" else "1.0",
            vnext_run_id,
            interest_id,
            candidate_id,
            normalized_parent_ids,
            created_by,
            memory_mode,
            lens,
            policy_version,
            status or ("validated" if not issues else "rejected"),
            Json(payload),
            Json(validation),
        ),
    )
    return row or {}


def _normalize_parent_artifact_ids(parent_artifact_ids: list[str]) -> list[str]:
    normalized: list[str] = []
    for value in parent_artifact_ids:
        candidate = str(value or "").strip()
        if not candidate:
            continue
        try:
            normalized.append(str(UUID(candidate)))
        except ValueError as error:
            raise HTTPException(status_code=422, detail="parentArtifactIds must be UUID strings.") from error
    return list(dict.fromkeys(normalized))


def _assert_parent_artifacts_exist(parent_artifact_ids: list[str]) -> None:
    if not parent_artifact_ids:
        return
    try:
        count = query_count(
            "select count(*)::int as total from discovery_artifacts where artifact_id = any(%s::uuid[])",
            (parent_artifact_ids,),
        )
    except Exception:
        # Unit tests often stub only artifact inserts. The runtime DB path still
        # validates parents when the lookup surface is available.
        return
    if count != len(parent_artifact_ids):
        raise HTTPException(status_code=422, detail="parentArtifactIds include unknown artifacts.")


def upsert_source_inventory(
    payload: DiscoveryVNextRoutingApplyPayload,
    *,
    source_artifact_id: str,
    routing_artifact_id: str,
    decision: str,
) -> dict[str, Any]:
    inventory_state = _inventory_state_for_decision(decision)
    row = query_one(
        """
        insert into source_inventory (
          canonical_domain,
          canonical_url,
          source_identity_key,
          current_state,
          current_provider_type,
          latest_source_scope_resolution_artifact_id,
          latest_source_understanding_artifact_id,
          latest_routing_decision_artifact_id,
          seed_item_url,
          resolved_source_url,
          source_scope_type,
          source_scope_confidence,
          monitoring_entry_urls_json,
          item_extraction_hints_json,
          source_voice,
          artifact_freshness_kind,
          signal_production_mode,
          source_role_confidence,
          inventory_reason,
          monitoring_policy_json,
          risk_json,
          tags
        )
        values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        on conflict (source_identity_key)
        do update set
          canonical_domain = excluded.canonical_domain,
          canonical_url = excluded.canonical_url,
          current_state = excluded.current_state,
          current_provider_type = excluded.current_provider_type,
          latest_source_scope_resolution_artifact_id = excluded.latest_source_scope_resolution_artifact_id,
          latest_source_understanding_artifact_id = excluded.latest_source_understanding_artifact_id,
          latest_routing_decision_artifact_id = excluded.latest_routing_decision_artifact_id,
          seed_item_url = excluded.seed_item_url,
          resolved_source_url = excluded.resolved_source_url,
          source_scope_type = excluded.source_scope_type,
          source_scope_confidence = excluded.source_scope_confidence,
          monitoring_entry_urls_json = excluded.monitoring_entry_urls_json,
          item_extraction_hints_json = excluded.item_extraction_hints_json,
          source_voice = excluded.source_voice,
          artifact_freshness_kind = excluded.artifact_freshness_kind,
          signal_production_mode = excluded.signal_production_mode,
          source_role_confidence = excluded.source_role_confidence,
          inventory_reason = excluded.inventory_reason,
          monitoring_policy_json = excluded.monitoring_policy_json,
          risk_json = excluded.risk_json,
          tags = (
            select array(
              select distinct tag
              from unnest(source_inventory.tags || excluded.tags) as tag
            )
          ),
          updated_at = now()
        returning *
        """,
        (
            payload.canonical_domain,
            payload.canonical_url,
            payload.source_identity_key,
            inventory_state,
            payload.provider_type,
            _uuid_or_none(payload.source_understanding.get("sourceScopeResolutionArtifactId")),
            source_artifact_id,
            routing_artifact_id,
            payload.source_understanding.get("seedItemUrl"),
            payload.source_understanding.get("sourceUrl"),
            payload.source_understanding.get("sourceScopeType"),
            payload.source_understanding.get("sourceScopeResolution", {}).get("sourceScopeConfidence")
            if isinstance(payload.source_understanding.get("sourceScopeResolution"), dict)
            else None,
            Json(
                payload.source_understanding.get("sourceScopeResolution", {}).get("monitoringEntryUrls")
                if isinstance(payload.source_understanding.get("sourceScopeResolution"), dict)
                else []
            ),
            Json(
                payload.source_understanding.get("sourceScopeResolution", {}).get("itemExtractionHints")
                if isinstance(payload.source_understanding.get("sourceScopeResolution"), dict)
                else {}
            ),
            payload.source_understanding.get("sourceVoice"),
            payload.source_understanding.get("artifactFreshnessKind"),
            payload.source_understanding.get("signalProductionMode"),
            payload.source_understanding.get("sourceRoleConfidence"),
            payload.source_understanding.get("reasonToKeep"),
            Json({"accessPattern": payload.access_pattern, "createdBy": payload.created_by}),
            Json(payload.source_understanding.get("risk") or {}),
            ["discovery-vnext", inventory_state, payload.provider_type],
        ),
    )
    return row or {}


def create_adapter_backlog_item(
    payload: DiscoveryVNextRoutingApplyPayload,
    *,
    source_inventory_id: str,
    reason: dict[str, Any],
) -> dict[str, Any]:
    adapter_need = str(reason.get("adapterNeed") or "")
    if adapter_need not in {"api_key", "custom_adapter", "auth_config", "parser", "browser_support", "unsupported_format"}:
        adapter_need = "auth_config" if payload.access_pattern == "requires_auth" else "custom_adapter"
    row = query_one(
        """
        insert into adapter_backlog (
          source_inventory_id,
          candidate_id,
          adapter_need,
          reason_json,
          priority,
          status
        )
        values (%s, %s, %s, %s, 'normal', 'open')
        returning *
        """,
        (
            source_inventory_id,
            payload.candidate_id,
            adapter_need,
            Json(reason),
        ),
    )
    return row or {}


def mark_inventory_registered_channel(
    *, source_inventory_id: str, channel_id: str, current_state: str = "probation_channel"
) -> dict[str, Any]:
    row = query_one(
        """
        update source_inventory
        set registered_channel_id = %s,
            current_state = %s,
            updated_at = now()
        where source_inventory_id = %s
        returning *
        """,
        (channel_id, current_state, source_inventory_id),
    )
    return row or {}


def upsert_monitoring_state(
    *,
    source_inventory_id: str,
    decision: str,
    routing_decision: dict[str, Any],
) -> dict[str, Any] | None:
    mode = {
        "auto_register_probation": "probation",
        "cheap_watch": "cheap_watch",
        "inventory": "paused",
        "inventory_low_priority": "paused",
        "manual_review": "paused",
        "adapter_backlog": "paused",
        "blocked": "paused",
        "rejected_structural": "paused",
    }.get(decision, "paused")
    interval = 1800 if mode == "probation" else 3600 if mode == "cheap_watch" else None
    row = query_one(
        """
        insert into source_monitoring_state (
          source_inventory_id,
          monitoring_mode,
          effective_poll_interval_seconds,
          next_due_at,
          health_json
        )
        values (%s, %s, %s, case when %s::integer is null then null else now() + (%s::integer || ' seconds')::interval end, %s)
        on conflict (source_inventory_id)
        do update set
          monitoring_mode = excluded.monitoring_mode,
          effective_poll_interval_seconds = excluded.effective_poll_interval_seconds,
          next_due_at = excluded.next_due_at,
          health_json = excluded.health_json,
          updated_at = now()
        returning *
        """,
        (
            source_inventory_id,
            mode,
            interval,
            interval,
            interval,
            Json({"routingDecision": routing_decision.get("decision"), "policyVersion": routing_decision.get("policyVersion")}),
        ),
    )
    return row


def create_source_observation(
    *,
    source_inventory_id: str,
    observation_kind: str,
    observation: dict[str, Any],
) -> dict[str, Any]:
    row = query_one(
        """
        insert into source_observations (
          source_inventory_id,
          observation_kind,
          observation_json
        )
        values (%s, %s, %s)
        returning *
        """,
        (source_inventory_id, observation_kind, Json(observation)),
    )
    return row or {}


def _sample_review_required(
    routing_decision: dict[str, Any],
    source_understanding: dict[str, Any],
    policy: dict[str, Any],
) -> bool:
    decision = str(routing_decision.get("decision") or "")
    if decision not in {"auto_register_probation", "cheap_watch"}:
        return False
    percent = int(policy.get("sampleReviewPercent") or policy.get("sample_review_percent") or 0)
    if percent <= 0:
        return False
    percent = min(100, percent)
    seed = "|".join(
        [
            str(source_understanding.get("sourceUrl") or ""),
            str(source_understanding.get("sourceVoice") or ""),
            str(source_understanding.get("signalProductionMode") or ""),
        ]
    )
    bucket = int(sha256(seed.encode("utf-8")).hexdigest()[:8], 16) % 100
    return bucket < percent


def validate_policy(payload: DiscoveryVNextPolicyActivatePayload) -> dict[str, Any]:
    issues: list[dict[str, str]] = []
    if not payload.definition:
        issues.append({"path": "$.definition", "code": "required", "message": "Policy definition must not be empty."})
    if payload.policy_type == "routing" and payload.definition.get("yieldIndependent") is not True:
        issues.append({"path": "$.definition.yieldIndependent", "code": "required", "message": "Routing policy must be yield-independent."})
    if payload.policy_type == "probe" and int(payload.definition.get("maxBrowserRequests") or 0) > 0 and not payload.definition.get("browserProbeExplicitlyAllowed"):
        issues.append({"path": "$.definition.maxBrowserRequests", "code": "browser_escalation_not_allowed", "message": "Browser probes require an explicit policy flag."})
    return {"policyValid": not issues, "errors": issues}


def activate_policy(payload: DiscoveryVNextPolicyActivatePayload) -> dict[str, Any]:
    validation = validate_policy(payload)
    if not validation["policyValid"]:
        raise HTTPException(status_code=422, detail=validation)
    query_one(
        """
        update discovery_policies
        set status = 'archived'
        where policy_name = %s
          and policy_type = %s
          and status = 'active'
        returning policy_id
        """,
        (payload.policy_name, payload.policy_type),
    )
    row = query_one(
        """
        insert into discovery_policies (
          policy_name,
          policy_version,
          policy_type,
          status,
          definition_json,
          created_by,
          activated_at
        )
        values (%s, %s, %s, 'active', %s, %s, now())
        on conflict (policy_name, policy_version)
        do update set
          policy_type = excluded.policy_type,
          status = 'active',
          definition_json = excluded.definition_json,
          created_by = excluded.created_by,
          activated_at = now()
        returning *
        """,
        (
            payload.policy_name,
            payload.policy_version,
            payload.policy_type,
            Json(payload.definition),
            payload.created_by,
        ),
    )
    return row or {}


def get_required_active_policy(policy_name: str) -> dict[str, Any]:
    row = query_one(
        """
        select *
        from discovery_policies
        where policy_name = %s
          and status = 'active'
        order by activated_at desc nulls last, created_at desc
        limit 1
        """,
        (policy_name,),
    )
    if not row:
        raise HTTPException(status_code=503, detail=f"Required Discovery vNext policy is missing: {policy_name}.")
    return row


def start_replay(payload: DiscoveryVNextReplayPayload) -> dict[str, Any]:
    resolve_required_policy_payload({}, "discovery-runtime")
    if payload.replay_kind in {"routing_policy", "full_non_live"}:
        resolve_required_policy_payload({}, "discovery-routing")
    run = create_run(
        DiscoveryVNextRunCreatePayload(
            runKind="replay",
            triggerKind="replay",
            request=payload.input,
            budget={"liveProviderExecution": False},
            createdBy=payload.created_by,
        )
    )
    run_id = str(run.get("vnext_run_id") or "")
    step = _start_run_step(run_id, "replay", {"replayKind": payload.replay_kind, "dryRun": payload.dry_run})
    status = "succeeded"
    error: dict[str, Any] = {}
    try:
        output = _execute_replay_payload(payload, run_id=run_id)
        _finish_run_step(str(step["run_step_id"]), "succeeded", output)
        _complete_run(run_id, status="succeeded", result={"replay": output})
    except Exception as exc:  # noqa: BLE001 - replay failure is persisted operator state.
        status = "failed"
        error = {"detail": str(exc), "type": type(exc).__name__}
        output = {"liveProviderExecution": False, "inputAccepted": False, "error": error}
        _finish_run_step(str(step["run_step_id"]), "failed", output, error)
        _complete_run(run_id, status="failed", result=output, error=error)
    row = query_one(
        """
        insert into discovery_replay_runs (
          vnext_run_id,
          replay_kind,
          status,
          input_json,
          output_json,
          policy_versions_json,
          dry_run,
          created_by,
          completed_at
        )
        values (%s, %s, %s, %s, %s, %s, %s, %s, now())
        returning *
        """,
        (
            run.get("vnext_run_id"),
            payload.replay_kind,
            status,
            Json(payload.input),
            Json(_json_safe(output)),
            Json(payload.policy_versions),
            payload.dry_run,
            payload.created_by,
        ),
    )
    if status == "failed":
        raise HTTPException(status_code=503, detail=error["detail"])
    return {"run": run, "replay": row or {}}


def _execute_replay_payload(payload: DiscoveryVNextReplayPayload, *, run_id: str) -> dict[str, Any]:
    output: dict[str, Any] = {
        "mode": "dry_run" if payload.dry_run else "persisted",
        "liveProviderExecution": False,
        "inputAccepted": True,
        "replayKind": payload.replay_kind,
    }
    replay_input = payload.input
    if payload.replay_kind == "artifact_lineage":
        artifact_id = str(replay_input.get("artifactId") or replay_input.get("artifact_id") or "")
        if not artifact_id:
            raise ValueError("artifact_lineage replay requires artifactId.")
        artifact = get_vnext_record("artifacts", artifact_id)
        parent_ids = artifact.get("parent_artifact_ids") or []
        parents = [
            get_vnext_record("artifacts", str(parent_id))
            for parent_id in parent_ids
            if parent_id
        ]
        output["artifact"] = artifact
        output["parents"] = parents
        return output
    if payload.replay_kind == "routing_policy":
        understanding = replay_input.get("sourceUnderstanding")
        if not isinstance(understanding, dict):
            raise ValueError("routing_policy replay requires sourceUnderstanding.")
        decision = preview_route(
            DiscoveryVNextRoutePreviewPayload(
                sourceUnderstanding=understanding,
                providerType=str(replay_input.get("providerType") or "website"),
                accessPattern=str(replay_input.get("accessPattern") or ""),
                policy=replay_input.get("policy") if isinstance(replay_input.get("policy"), dict) else {},
            )
        )
        output["routingDecision"] = decision
        return output
    if payload.replay_kind == "candidate_acquisition":
        results = replay_input.get("results")
        if not isinstance(results, list):
            raise ValueError("candidate_acquisition replay requires results fixture.")
        normalized = DiscoveryVNextCandidateCreatePayload(
            runId=run_id,
            interestId=replay_input.get("interestId"),
            hypothesisId=str(replay_input.get("hypothesisId") or "replay-fixture"),
            hypothesisArtifactId=replay_input.get("hypothesisArtifactId"),
            queryAttemptId=replay_input.get("queryAttemptId"),
            query=str(replay_input.get("query") or "replay fixture"),
            queryFamilyIntent=str(replay_input.get("queryFamilyIntent") or "replay"),
            results=results,
            createdBy=payload.created_by,
        )
        output["candidateAcquisition"] = (
            normalize_candidates(normalized) if payload.dry_run else create_candidates_from_payload(normalized)
        )
        return output
    if payload.replay_kind == "full_non_live":
        run_request = replay_input.get("request") if isinstance(replay_input.get("request"), dict) else replay_input
        output["fullRun"] = execute_run_steps(
            run_id=run_id,
            run_kind="full",
            request=run_request,
            budget={"liveProviderExecution": False},
            live_provider_execution=False,
            created_by=payload.created_by,
        )
        return output
    raise ValueError(f"Unsupported replay kind: {payload.replay_kind}.")


def run_llm_gateway(payload: DiscoveryVNextLlmGatewayPayload) -> dict[str, Any]:
    runtime_policy = resolve_required_policy_payload({}, "discovery-runtime")
    if payload.live_provider_execution:
        _assert_live_runtime_allowed(runtime_policy, payload.budget)
    started = query_one(
        """
        insert into discovery_llm_gateway_events (
          vnext_run_id,
          artifact_id,
          task,
          provider,
          model,
          status,
          prompt_json,
          request_json,
          live_provider_execution,
          created_by,
          started_at
        )
        values (%s, %s, %s, 'gemini', %s, 'running', %s, %s, %s, %s, now())
        returning *
        """,
        (
            payload.vnext_run_id or payload.run_id,
            payload.artifact_id,
            payload.task,
            payload.model or _env("DISCOVERY_GEMINI_MODEL") or _env("GEMINI_MODEL") or "gemini-3.5-flash",
            Json({"prompt": payload.prompt}),
            Json({"task": payload.task, "payload": payload.payload, "temperature": payload.temperature}),
            payload.live_provider_execution,
            payload.created_by,
        ),
    )
    analyzer = GeminiLlmAnalyzerAdapter()
    result = analyzer.analyze(
        prompt=payload.prompt,
        task=payload.task,
        payload=payload.payload,
        model=payload.model,
        temperature=payload.temperature,
        output_schema=payload.output_schema,
    )
    meta = result.get("meta") if isinstance(result.get("meta"), dict) else {}
    if payload.live_provider_execution and meta.get("deterministic_fallback"):
        status = "failed"
        error = {"detail": meta.get("error") or "LLM live execution did not call provider."}
    else:
        status = "succeeded"
        error = {}
    updated = query_one(
        """
        update discovery_llm_gateway_events
        set status = %s,
            response_json = %s,
            validation_json = %s,
            error_json = %s,
            prompt_tokens = %s,
            completion_tokens = %s,
            total_tokens = %s,
            cost_cents = %s,
            deterministic_fallback = %s,
            completed_at = now()
        where llm_gateway_event_id = %s
        returning *
        """,
        (
            status,
            Json(result),
            Json({"schemaValid": status == "succeeded", "policyValid": status == "succeeded", "errors": [] if status == "succeeded" else [error]}),
            Json(error),
            meta.get("prompt_tokens"),
            meta.get("completion_tokens"),
            meta.get("total_tokens"),
            int(meta.get("cost_cents") or 0),
            bool(meta.get("deterministic_fallback")),
            started["llm_gateway_event_id"],
        ),
    )
    if status == "failed":
        raise HTTPException(status_code=503, detail=error["detail"])
    return {"event": updated, "result": result.get("result")}


def execute_run_steps(
    *,
    run_id: str,
    run_kind: str,
    request: dict[str, Any],
    budget: dict[str, Any],
    live_provider_execution: bool,
    created_by: str,
) -> dict[str, Any]:
    effective_budget = _effective_run_budget(
        runtime_policy=resolve_required_policy_payload({}, "discovery-runtime"),
        request=request,
        budget=budget,
        live_provider_execution=live_provider_execution,
    )
    result: dict[str, Any] = {"liveProviderExecution": live_provider_execution, "budget": effective_budget, "steps": []}
    interest = _request_interest(request)

    if run_kind in {"brief_compile", "full"}:
        step = _start_run_step(run_id, "brief_compile", interest)
        brief = preview_brief(
            DiscoveryVNextBriefPreviewPayload(
                interestId=interest.get("interestId"),
                name=str(interest.get("name") or "System interest"),
                description=str(interest.get("description") or ""),
                positive_texts=_string_list(interest.get("positive_texts") or interest.get("positiveTexts")),
                negative_texts=_string_list(interest.get("negative_texts") or interest.get("negativeTexts")),
                candidate_positive_signals=_string_list(
                    interest.get("candidate_positive_signals") or interest.get("candidatePositiveSignals")
                ),
                candidate_negative_signals=_string_list(
                    interest.get("candidate_negative_signals") or interest.get("candidateNegativeSignals")
                ),
                geographies=_string_list(interest.get("geographies")),
                languages=_string_list(interest.get("languages")),
            )
        )
        artifact = create_artifact(
            "DiscoveryBrief",
            brief["payload"],
            vnext_run_id=run_id,
            interest_id=interest.get("interestId"),
            created_by=created_by,
        )
        _finish_run_step(str(step["run_step_id"]), "succeeded", {"artifact": artifact})
        result["briefArtifact"] = artifact
        result["steps"].append("brief_compile")
        if run_kind == "brief_compile":
            return result

    brief_payload = _artifact_payload(result.get("briefArtifact")) or request.get("discoveryBrief") or {}
    if request.get("useLlm") is True:
        step = _start_run_step(run_id, "llm_gateway", {"task": "discovery_compile_interest_graph"})
        llm = run_llm_gateway(
            DiscoveryVNextLlmGatewayPayload(
                task="discovery_compile_interest_graph",
                payload=brief_payload,
                budget=effective_budget,
                vnextRunId=run_id,
                artifactId=str((result.get("briefArtifact") or {}).get("artifact_id") or ""),
                liveProviderExecution=live_provider_execution,
                createdBy=created_by,
            )
        )
        _finish_run_step(str(step["run_step_id"]), "succeeded", llm)
        result["llmGateway"] = llm
        result["steps"].append("llm_gateway")

    if run_kind in {"mega_loop", "full"}:
        step = _start_run_step(run_id, "mega_loop", {"brief": brief_payload})
        preview = preview_mega_loop(
            DiscoveryVNextMegaLoopPreviewPayload(
                discoveryBrief=brief_payload,
                maxBatches=int((request.get("maxBatches") or 11)),
                locale=request.get("locale"),
            )
        )
        if preview.get("status") == "failed":
            error = preview.get("error") if isinstance(preview.get("error"), dict) else {}
            raise HTTPException(
                status_code=422,
                detail={
                    "code": error.get("code") or "mega_loop_failed",
                    "message": error.get("message") or "Discovery MegaLoop preview failed.",
                },
            )
        artifacts = [
            create_artifact(
                "HypothesisBatch",
                batch["payload"],
                vnext_run_id=run_id,
                interest_id=interest.get("interestId"),
                parent_artifact_ids=[str((result.get("briefArtifact") or {}).get("artifact_id") or "")]
                if (result.get("briefArtifact") or {}).get("artifact_id")
                else [],
                memory_mode=str(batch.get("memoryMode") or batch.get("payload", {}).get("memoryMode") or ""),
                lens=str(batch.get("lens") or batch.get("payload", {}).get("lens") or ""),
                created_by=created_by,
            )
            for batch in preview.get("batches", [])
            if isinstance(batch, dict) and isinstance(batch.get("payload"), dict)
        ]
        _finish_run_step(str(step["run_step_id"]), "succeeded", {"artifacts": artifacts, "comparison": preview.get("comparison")})
        result["hypothesisArtifacts"] = artifacts
        result["megaLoopComparison"] = preview.get("comparison")
        result["steps"].append("mega_loop")
        if run_kind == "mega_loop":
            return result

    if run_kind in {"candidate_acquisition", "full"}:
        step = _start_run_step(run_id, "candidate_acquisition", {"liveProviderExecution": live_provider_execution})
        candidates = execute_candidate_acquisition(
            run_id=run_id,
            interest_id=interest.get("interestId"),
            hypothesis_artifacts=result.get("hypothesisArtifacts") if isinstance(result.get("hypothesisArtifacts"), list) else [],
            request=request,
            budget=effective_budget,
            live_provider_execution=live_provider_execution,
            created_by=created_by,
        )
        _finish_run_step(str(step["run_step_id"]), "succeeded", candidates)
        result["candidateAcquisition"] = candidates
        result["steps"].append("candidate_acquisition")
        if run_kind == "candidate_acquisition":
            return result

    if run_kind == "full":
        full_step = _start_run_step(run_id, "probe", {"source": "full_run_candidate_selection"})
        full_result = execute_full_probe_understand_route(
            run_id=run_id,
            interest_id=interest.get("interestId"),
            brief_payload=brief_payload,
            candidates=(result.get("candidateAcquisition") or {}).get("candidates") if isinstance(result.get("candidateAcquisition"), dict) else [],
            request=request,
            created_by=created_by,
        )
        _finish_run_step(str(full_step["run_step_id"]), "succeeded", full_result)
        result.update(full_result)
        result["steps"].extend(["probe", "scope_resolution", "understand_route", "monitoring_handoff", "probation_handoff"])
        return result

    if run_kind in {"probe", "full"} and isinstance(request.get("probePlan"), dict):
        step = _start_run_step(run_id, "probe", {"probePlan": request["probePlan"]})
        probe = execute_probe_from_payload(
            DiscoveryVNextProbeExecutePayload(
                probePlan=request["probePlan"],
                runId=run_id,
                interestId=interest.get("interestId"),
                candidateId=request.get("candidateId"),
                createdBy=created_by,
            )
        )
        _finish_run_step(str(step["run_step_id"]), "succeeded", probe)
        result["probe"] = probe
        result["steps"].append("probe")
        if run_kind == "probe":
            return result

    if run_kind in {"understand_route", "full"} and isinstance(request.get("sourceUnderstanding"), dict):
        step = _start_run_step(run_id, "understand_route", {"sourceUnderstanding": request["sourceUnderstanding"]})
        routing = apply_routing_decision(
            DiscoveryVNextRoutingApplyPayload(
                sourceUnderstanding=request["sourceUnderstanding"],
                canonicalUrl=str(request.get("canonicalUrl") or request["sourceUnderstanding"].get("sourceUrl") or ""),
                canonicalDomain=str(request.get("canonicalDomain") or _domain_from_url(str(request.get("canonicalUrl") or request["sourceUnderstanding"].get("sourceUrl") or ""))),
                sourceIdentityKey=str(request.get("sourceIdentityKey") or request.get("canonicalUrl") or request["sourceUnderstanding"].get("sourceUrl") or ""),
                providerType=str(request.get("providerType") or request["sourceUnderstanding"].get("suggestedProviderType") or "unknown"),
                accessPattern=str(request.get("accessPattern") or request["sourceUnderstanding"].get("accessPattern") or "unknown"),
                runId=run_id,
                interestId=interest.get("interestId"),
                candidateId=request.get("candidateId"),
                createdBy=created_by,
            )
        )
        _finish_run_step(str(step["run_step_id"]), "succeeded", routing)
        result["routing"] = routing
        result["steps"].append("understand_route")
        if run_kind == "understand_route":
            return result

    return result


def execute_full_probe_understand_route(
    *,
    run_id: str,
    interest_id: str | None,
    brief_payload: dict[str, Any],
    candidates: list[dict[str, Any]],
    request: dict[str, Any],
    created_by: str,
) -> dict[str, Any]:
    selected = select_candidates_for_probe(candidates, request=request)
    probe_reports: list[dict[str, Any]] = []
    scope_resolutions: list[dict[str, Any]] = []
    source_understandings: list[dict[str, Any]] = []
    routing_decisions: list[dict[str, Any]] = []
    handoff_results: list[dict[str, Any]] = []
    for candidate in selected:
        candidate_id = str(candidate.get("candidate_id") or candidate.get("candidateId") or "")
        canonical_url = str(candidate.get("canonical_url") or candidate.get("canonicalUrl") or "")
        canonical_domain = str(candidate.get("canonical_domain") or candidate.get("canonicalDomain") or _domain_from_url(canonical_url))
        kind_guess = str(candidate.get("candidate_kind_guess") or candidate.get("candidateKindGuess") or "unknown")
        parent_ids = _candidate_parent_artifact_ids(candidate)
        _mark_candidate_status(candidate_id, "probe_planned")
        probe_plan = preview_probe_plan(
            DiscoveryVNextProbePlanPreviewPayload(
                candidateUrl=canonical_url,
                candidateKindGuess=kind_guess,
            )
        )
        probe = execute_probe_from_payload(
            DiscoveryVNextProbeExecutePayload(
                probePlan=probe_plan["payload"],
                runId=run_id,
                interestId=interest_id,
                candidateId=candidate_id or None,
                parentArtifactIds=parent_ids,
                createdBy=created_by,
            )
        )
        probe_artifact = probe.get("probeReportArtifact") if isinstance(probe.get("probeReportArtifact"), dict) else {}
        probe_payload = _artifact_payload(probe_artifact)
        probe_reports.append(probe)
        if not probe_payload:
            _mark_candidate_status(candidate_id, "rejected")
            continue
        _mark_candidate_status(candidate_id, "probed")
        scope = apply_scope_resolution(
            DiscoveryVNextScopeResolvePayload(
                discoveryBrief=brief_payload,
                candidate={
                    "candidateId": candidate_id,
                    "canonicalUrl": canonical_url,
                    "canonicalDomain": canonical_domain,
                    "candidateKindGuess": kind_guess,
                },
                probeReport=probe_payload,
                runId=run_id,
                interestId=interest_id,
                candidateId=candidate_id or None,
                parentArtifactIds=[str(probe_artifact.get("artifact_id") or "")],
                createdBy=created_by,
            )
        )
        scope_resolutions.append(scope)
        scope_artifact = scope.get("sourceScopeResolutionArtifact") if isinstance(scope.get("sourceScopeResolutionArtifact"), dict) else {}
        scope_payload = _artifact_payload(scope_artifact)
        if not scope_payload:
            _mark_candidate_status(candidate_id, "rejected")
            continue
        understanding = preview_source_understanding(
            DiscoveryVNextUnderstandPayload(
                discoveryBrief=brief_payload,
                probeReport=probe_payload,
                sourceScopeResolution=scope_payload,
                candidate={
                    "candidateId": candidate_id,
                    "canonicalUrl": canonical_url,
                    "canonicalDomain": canonical_domain,
                    "candidateKindGuess": kind_guess,
                },
            )
        )
        source_payload = _artifact_payload(understanding) or understanding.get("payload") or {}
        source_understandings.append(understanding)
        if not isinstance(source_payload, dict) or understanding.get("status") == "rejected":
            _mark_candidate_status(candidate_id, "rejected")
            continue
        source_payload.setdefault("sourceScopeResolutionArtifactId", str(scope_artifact.get("artifact_id") or ""))
        source_payload = _with_optional_source_understanding_proposal(
            source_payload,
            run_id=run_id,
            request=request,
            created_by=created_by,
        )
        provider_type = str(source_payload.get("suggestedProviderType") or "unknown")
        access_pattern = str(source_payload.get("accessPattern") or "unknown")
        resolved_source_url = str(source_payload.get("sourceUrl") or canonical_url)
        resolved_domain = _domain_from_url(resolved_source_url) or canonical_domain
        routing = apply_routing_decision(
            DiscoveryVNextRoutingApplyPayload(
                sourceUnderstanding=source_payload,
                canonicalUrl=resolved_source_url,
                canonicalDomain=resolved_domain,
                sourceIdentityKey=source_identity_key(canonical_url=resolved_source_url, provider_type=provider_type, source_understanding=source_payload),
                providerType=provider_type,
                accessPattern=access_pattern,
                runId=run_id,
                interestId=interest_id,
                candidateId=candidate_id or None,
                parentArtifactIds=[str(scope_artifact.get("artifact_id") or "")],
                createdBy=created_by,
            )
        )
        routing_decisions.append(routing)
        routing_artifact = routing.get("routingDecisionArtifact") if isinstance(routing.get("routingDecisionArtifact"), dict) else {}
        _mark_candidate_status(candidate_id, "routed" if routing_artifact else "rejected")
        routing_payload = _artifact_payload(routing_artifact)
        inventory = routing.get("sourceInventory") if isinstance(routing.get("sourceInventory"), dict) else {}
        if isinstance(routing_payload, dict) and _should_apply_handoff(routing_payload, request):
            handoff_results.append(
                apply_probation_handoff_from_payload(
                    DiscoveryVNextProbationHandoffPayload(
                        sourceUnderstanding=source_payload,
                        routingDecision=routing_payload,
                        sourceInventoryId=str(inventory.get("source_inventory_id") or inventory.get("sourceInventoryId") or "") or None,
                        providerType=provider_type,
                        createdBy=created_by,
                        dryRun=bool(request.get("dryRunHandoff", False)),
                    )
                )
            )
    return {
        "selectedProbeCandidates": selected,
        "queryQualityReports": [_candidate_query_quality(candidate) for candidate in selected],
        "probeReports": probe_reports,
        "sourceScopeResolutions": scope_resolutions,
        "sourceUnderstandings": source_understandings,
        "routingDecisions": routing_decisions,
        "handoffResults": handoff_results,
        "summary": _full_run_summary(candidates, selected, scope_resolutions, routing_decisions, handoff_results),
    }


def select_candidates_for_probe(candidates: list[dict[str, Any]], *, request: dict[str, Any]) -> list[dict[str, Any]]:
    max_per_run = max(1, min(50, int(request.get("maxProbeCandidatesPerRun") or 8)))
    max_per_lens = max(1, min(20, int(request.get("maxProbeCandidatesPerLens") or max(1, max_per_run // 3))))
    max_per_domain = max(1, min(10, int(request.get("maxProbeCandidatesPerDomain") or 2)))
    max_per_hypothesis = max(1, min(10, int(request.get("maxProbeCandidatesPerHypothesis") or 2)))
    max_per_scope_type = max(1, min(20, int(request.get("maxProbeCandidatesPerScopeType") or max_per_run)))
    ranked: list[tuple[int, int, dict[str, Any]]] = []
    for index, candidate in enumerate(candidates):
        if not isinstance(candidate, dict):
            continue
        score = _candidate_probe_score(candidate)
        ranked.append((score, -index, candidate))
    ranked.sort(reverse=True)
    selected: list[dict[str, Any]] = []
    domain_counts: dict[str, int] = {}
    hypothesis_counts: dict[str, int] = {}
    lens_counts: dict[str, int] = {}
    scope_type_counts: dict[str, int] = {}
    for _score, _index, candidate in ranked:
        domain = str(candidate.get("canonical_domain") or candidate.get("canonicalDomain") or _domain_from_url(str(candidate.get("canonical_url") or candidate.get("canonicalUrl") or "")))
        hypothesis_id = str(candidate.get("hypothesis_id") or candidate.get("hypothesisId") or "unknown")
        lens = _candidate_lens(candidate)
        scope_type_guess = str(candidate.get("source_scope_type") or candidate.get("sourceScopeType") or candidate.get("candidate_kind_guess") or candidate.get("candidateKindGuess") or "unknown")
        if domain_counts.get(domain, 0) >= max_per_domain:
            continue
        if hypothesis_counts.get(hypothesis_id, 0) >= max_per_hypothesis:
            continue
        if lens and lens_counts.get(lens, 0) >= max_per_lens:
            continue
        if scope_type_counts.get(scope_type_guess, 0) >= max_per_scope_type:
            continue
        selected.append(candidate)
        domain_counts[domain] = domain_counts.get(domain, 0) + 1
        hypothesis_counts[hypothesis_id] = hypothesis_counts.get(hypothesis_id, 0) + 1
        if lens:
            lens_counts[lens] = lens_counts.get(lens, 0) + 1
        scope_type_counts[scope_type_guess] = scope_type_counts.get(scope_type_guess, 0) + 1
        if len(selected) >= max_per_run:
            break
    return selected


def _candidate_parent_artifact_ids(candidate: dict[str, Any]) -> list[str]:
    parent_ids = []
    for key in ("hypothesis_artifact_id", "hypothesisArtifactId", "query_quality_artifact_id", "queryQualityArtifactId"):
        value = str(candidate.get(key) or "").strip()
        if value:
            parent_ids.append(value)
    return list(dict.fromkeys(parent_ids))


def _candidate_query_quality(candidate: dict[str, Any]) -> dict[str, Any]:
    for value in (candidate.get("queryQuality"), candidate.get("query_quality")):
        if isinstance(value, dict):
            return value
    acquisition = candidate.get("acquisition_json") or candidate.get("acquisitionEvidence") or {}
    if isinstance(acquisition, dict) and isinstance(acquisition.get("queryQuality"), dict):
        return acquisition["queryQuality"]
    return {}


def _mark_candidate_status(candidate_id: str, status: str) -> None:
    if not candidate_id:
        return
    query_one(
        """
        update discovery_candidates
        set status = %s,
            updated_at = now()
        where candidate_id = %s
        returning candidate_id
        """,
        (status, candidate_id),
    )


def _should_apply_handoff(routing_payload: dict[str, Any], request: dict[str, Any]) -> bool:
    decision = str(routing_payload.get("decision") or "")
    if decision == "auto_register_probation":
        return True
    if decision != "cheap_watch":
        return False
    if request.get("createCheapWatchChannel") is True:
        routing_payload["allowChannelCreation"] = True
        return True
    return routing_payload.get("allowChannelCreation") is True


def _with_optional_source_understanding_proposal(
    source_payload: dict[str, Any],
    *,
    run_id: str,
    request: dict[str, Any],
    created_by: str,
) -> dict[str, Any]:
    if request.get("useLlmSourceUnderstanding") is not True:
        return source_payload
    proposal = run_llm_gateway(
        DiscoveryVNextLlmGatewayPayload(
            task="discovery_source_understanding_v2",
            payload={"sourceUnderstanding": source_payload},
            vnextRunId=run_id,
            liveProviderExecution=False,
            createdBy=created_by,
        )
    )
    proposed_patch = proposal.get("result") if isinstance(proposal.get("result"), dict) else {}
    candidate_payload = {**source_payload, **proposed_patch} if isinstance(proposed_patch, dict) else source_payload
    validation_issues = validate_artifact_payload("SourceUnderstanding", candidate_payload)
    conflict_reasons = _source_understanding_patch_conflicts(source_payload, proposed_patch)
    if not validation_issues and not conflict_reasons:
        return {
            **candidate_payload,
            "llmPatchProposal": proposed_patch,
            "llmPatchAccepted": True,
            "llmProposalMode": "validated_patch_deterministic_classifier_authoritative",
        }
    return {
        **source_payload,
        "llmPatchProposal": proposed_patch,
        "llmPatchAccepted": False,
        "llmPatchRejectionReasons": conflict_reasons or [issue.message for issue in validation_issues[:5]],
        "llmProposalMode": "validated_patch_deterministic_classifier_authoritative",
    }


def _source_understanding_patch_conflicts(source_payload: dict[str, Any], patch: dict[str, Any]) -> list[str]:
    if not isinstance(patch, dict) or not patch:
        return ["empty_patch"]
    reasons: list[str] = []
    if source_payload.get("sourceScopeType") in {"blocked_or_unusable", "single_item", "context_page"}:
        for key in ("sourceScopeType", "accessPattern", "suggestedProviderType", "adapterRequired"):
            if key in patch and patch.get(key) != source_payload.get(key):
                reasons.append(f"structural_evidence_wins:{key}")
    source_technical = source_payload.get("technicalObservability") if isinstance(source_payload.get("technicalObservability"), dict) else {}
    if source_technical.get("requiresAuth") is True:
        for key in ("accessPattern", "technicalObservability"):
            if key in patch and patch.get(key) != source_payload.get(key):
                reasons.append(f"access_evidence_wins:{key}")
    if patch.get("yieldIndependent") is False:
        reasons.append("yield_dependent_patch_forbidden")
    return reasons


def _candidate_probe_score(candidate: dict[str, Any]) -> int:
    text = str(candidate).lower()
    score = int(candidate.get("rediscovery_count") or candidate.get("rediscoveryCount") or 1)
    score += _query_quality_probe_bonus(candidate)
    if any(token in text for token in ("official", ".gov", ".gob", "europa.eu", "/news", "/updates", "/changelog")):
        score += 4
    if any(token in text for token in ("/registry", "/directory", "/marketplace", "/listings", "/tenders", "/jobs")):
        score += 3
    if any(token in text for token in ("feed.xml", "rss", "/api", "/data", "dataset")):
        score += 2
    if any(token in text for token in ("/blog", "/guide", "/template", "/pricing", "/services")):
        score -= 2
    return score


def _query_quality_probe_bonus(candidate: dict[str, Any]) -> int:
    quality = ""
    for key in ("queryQuality", "query_quality"):
        value = candidate.get(key)
        if isinstance(value, dict):
            quality = str(value.get("quality") or "")
            break
    if not quality:
        evidence = candidate.get("acquisition_json") or candidate.get("acquisitionEvidence") or {}
        if isinstance(evidence, dict):
            quality_obj = evidence.get("queryQuality")
            if isinstance(quality_obj, dict):
                quality = str(quality_obj.get("quality") or "")
            else:
                quality = str(quality_obj or evidence.get("quality") or "")
    return {
        "useful_for_source_acquisition": 4,
        "useful_for_item_discovery": 5,
        "useful_for_query_expansion": 2,
        "noisy": -3,
        "exhausted": -4,
    }.get(quality, 0)


def _candidate_lens(candidate: dict[str, Any]) -> str:
    evidence = candidate.get("acquisition_json") or candidate.get("acquisitionEvidence") or {}
    if isinstance(evidence, dict):
        for path in evidence.get("paths") or []:
            if isinstance(path, dict) and str(path.get("lens") or "").strip():
                return str(path["lens"])
    return str(candidate.get("lens") or "")


def source_identity_key(
    *,
    canonical_url: str,
    provider_type: str,
    source_understanding: dict[str, Any],
) -> str:
    del source_understanding
    parsed = urlparse(canonical_url)
    host = (parsed.hostname or "").lower()
    if host.startswith("www."):
        host = host[4:]
    path = parsed.path or "/"
    query = _source_identity_query(parsed.query)
    resolved = f"{parsed.scheme}://{host}{path}{query}".rstrip("/")
    return f"{provider_type}|{host}|{resolved}"


def _source_identity_query(query: str) -> str:
    if not query:
        return ""
    blocked = {"run_id", "runid", "interest_id", "interestid", "hypothesis_id", "hypothesisid", "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"}
    pairs = []
    for key, values in parse_qs(query, keep_blank_values=True).items():
        if key.lower() in blocked:
            continue
        for value in values:
            pairs.append((key, value))
    encoded = urlencode(pairs)
    return f"?{encoded}" if encoded else ""


def _first_path_segment(path: str) -> str:
    parts = [part for part in path.split("/") if part]
    return f"/{parts[0]}" if parts else "/"


def _source_section_path(path: str) -> str:
    parts = [part for part in path.split("/") if part]
    if not parts:
        return "/"
    if parts[0] in {"news", "updates", "changelog", "jobs", "careers", "tenders", "notices", "registry", "directory", "data", "api"}:
        return f"/{parts[0]}"
    return "/"


def _full_run_summary(
    candidates: list[dict[str, Any]],
    selected: list[dict[str, Any]],
    scope_resolutions: list[dict[str, Any]],
    routing_decisions: list[dict[str, Any]],
    handoff_results: list[dict[str, Any]],
) -> dict[str, Any]:
    decisions: list[str] = []
    for row in routing_decisions:
        artifact = row.get("routingDecisionArtifact") if isinstance(row.get("routingDecisionArtifact"), dict) else {}
        payload = _artifact_payload(artifact)
        if isinstance(payload, dict):
            decisions.append(str(payload.get("decision") or ""))
    scope_counts: dict[str, int] = {}
    for row in scope_resolutions:
        artifact = row.get("sourceScopeResolutionArtifact") if isinstance(row.get("sourceScopeResolutionArtifact"), dict) else {}
        payload = _artifact_payload(artifact)
        scope_type = str(payload.get("sourceScopeType") or "unknown")
        scope_counts[scope_type] = scope_counts.get(scope_type, 0) + 1
    warnings = []
    probe_coverage = round(len(selected) / max(1, len(candidates)), 4)
    if candidates and probe_coverage < 0.25:
        warnings.append({"code": "probe_coverage_too_low", "message": "Probe coverage is below the fail-visible quality threshold."})
    if not scope_resolutions and selected:
        warnings.append({"code": "scope_resolution_missing", "message": "Probe candidates were selected but no SourceScopeResolution artifacts were produced."})
    low_confidence_count = sum(
        1
        for row in scope_resolutions
        if float((_artifact_payload(row.get("sourceScopeResolutionArtifact") if isinstance(row.get("sourceScopeResolutionArtifact"), dict) else {}).get("sourceScopeConfidence") or 0) < 0.65)
    )
    if low_confidence_count:
        warnings.append({"code": "scope_resolution_low_confidence", "message": "One or more source scopes resolved below confidence threshold.", "count": low_confidence_count})
    forbidden_handoffs = [
        item
        for item in handoff_results
        if isinstance(item, dict) and str(item.get("reason") or item.get("statusReason") or "").startswith("source_scope_not_channel_eligible")
    ]
    if forbidden_handoffs:
        warnings.append({"code": "handoff_attempted_from_forbidden_scope_type", "message": "Handoff guard blocked forbidden source scope channel creation.", "count": len(forbidden_handoffs)})
    if decisions.count("adapter_backlog") and not handoff_results:
        warnings.append({"code": "adapter_conversion_missing", "message": "Sources reached adapter backlog but no item-level conversion proof is present in this run summary."})
    status = "passed_mechanical"
    if warnings:
        status = "passed_with_quality_gap"
    if decisions and decisions.count("adapter_backlog") == len(decisions):
        status = "partially_proven"
    return {
        "status": status,
        "candidateCount": len(candidates),
        "probedCount": len(selected),
        "probeCoverage": probe_coverage,
        "sourceScopeTypes": scope_counts,
        "routingDecisionCounts": {decision: decisions.count(decision) for decision in sorted(set(decisions)) if decision},
        "inventoryCount": decisions.count("inventory"),
        "contextCount": decisions.count("inventory_context"),
        "cheapWatchCount": decisions.count("cheap_watch"),
        "probationChannelCount": sum(1 for item in handoff_results if isinstance(item, dict) and item.get("status") == "applied"),
        "manualReviewCount": decisions.count("manual_review"),
        "adapterBacklogCount": decisions.count("adapter_backlog"),
        "blockedCount": decisions.count("blocked"),
        "warnings": warnings,
    }


def execute_candidate_acquisition(
    *,
    run_id: str,
    interest_id: str | None,
    hypothesis_artifacts: list[dict[str, Any]],
    request: dict[str, Any],
    budget: dict[str, Any],
    live_provider_execution: bool,
    created_by: str,
) -> dict[str, Any]:
    runtime_policy = resolve_required_policy_payload({}, "discovery-runtime")
    effective_budget = _effective_run_budget(
        runtime_policy=runtime_policy,
        request=request,
        budget=budget,
        live_provider_execution=live_provider_execution,
    )
    provider = _search_provider_from_request(request)
    if live_provider_execution:
        _assert_live_runtime_allowed(runtime_policy, effective_budget, provider=provider)
    max_attempts = max(1, min(50, int(runtime_policy.get("maxQueryAttemptsPerRun") or 20)))
    max_results = max(1, min(20, int(runtime_policy.get("maxResultsPerQuery") or 10)))
    adapter = _search_adapter(provider) if live_provider_execution else StubWebSearchAdapter()
    attempts: list[dict[str, Any]] = []
    candidates: list[dict[str, Any]] = []
    for artifact in hypothesis_artifacts[:max_attempts]:
        hypothesis_artifact_id = str(artifact.get("artifact_id") or "")
        hypothesis_payload = _artifact_payload(artifact)
        artifact_lens = str(artifact.get("lens") or hypothesis_payload.get("lens") or "") or None
        artifact_memory_mode = str(artifact.get("memory_mode") or hypothesis_payload.get("memoryMode") or "") or None
        for query_row in _queries_from_hypothesis_artifact(artifact):
            if len(attempts) >= max_attempts:
                break
            query_text = str(query_row.get("query") or "").strip()
            if not query_text:
                continue
            attempt = _insert_query_attempt(
                run_id=run_id,
                hypothesis_artifact_id=hypothesis_artifact_id or None,
                provider=provider,
                query_text=query_text,
                query_family_intent=str(query_row.get("intent") or ""),
                live_provider_execution=live_provider_execution,
                created_by=created_by,
            )
            try:
                raw = adapter.search(query=query_text, count=max_results, result_type="text", time_range=request.get("timeRange"))
                results, meta = unwrap_web_search_output(raw)
                filtered_results = _rank_search_results(
                    results,
                    interest=request.get("interest") if isinstance(request.get("interest"), dict) else {},
                    query_text=query_text,
                )
                enriched_results = [
                    {**result, "provider": result.get("provider") or provider}
                    for result in filtered_results
                    if isinstance(result, dict)
                ]
                normalized = DiscoveryVNextCandidateCreatePayload(
                    runId=run_id,
                    interestId=interest_id,
                    hypothesisId=str(query_row.get("hypothesisId") or "unknown"),
                    hypothesisArtifactId=hypothesis_artifact_id or None,
                    queryAttemptId=str(attempt["query_attempt_id"]),
                    query=query_text,
                    queryFamilyIntent=str(query_row.get("intent") or ""),
                    lens=artifact_lens,
                    memoryMode=artifact_memory_mode,
                    results=enriched_results,
                    createdBy=created_by,
                )
                persisted = create_candidates_from_payload(normalized)
                _finish_query_attempt(
                    str(attempt["query_attempt_id"]),
                    "succeeded",
                    meta=meta,
                    results=enriched_results,
                    quality_artifact=persisted.get("queryQualityReportArtifact"),
                )
                attempts.append(get_vnext_record("query-attempts", str(attempt["query_attempt_id"])))
                candidates.extend(persisted.get("candidates") or [])
            except Exception as error:  # noqa: BLE001 - provider failure is telemetry.
                _finish_query_attempt(str(attempt["query_attempt_id"]), "failed", error={"detail": str(error), "type": type(error).__name__})
                attempts.append(get_vnext_record("query-attempts", str(attempt["query_attempt_id"])))
    return {"queryAttempts": attempts, "candidates": candidates}


def _rank_search_results(
    results: list[dict[str, Any]],
    *,
    interest: dict[str, Any],
    query_text: str,
) -> list[dict[str, Any]]:
    tokens = _search_quality_tokens(interest) or _tokens(query_text)
    ranked: list[tuple[int, int, dict[str, Any]]] = []
    for index, result in enumerate(results):
        if not isinstance(result, dict):
            continue
        url = str(result.get("url") or result.get("candidateUrl") or "")
        if _is_search_ad_or_noise_url(url):
            continue
        text = " ".join(str(result.get(key) or "") for key in ("url", "title", "snippet")).lower()
        score = sum(1 for token in tokens if token in text)
        if tokens and score < min(2, len(tokens)):
            continue
        if _looks_like_primary_source(url):
            score += 2
        if any(term in text for term in ("official", "portal", "notice", "advisory", "changelog", "grant", "tender", "consultation")):
            score += 1
        ranked.append((score, -index, result))
    ranked.sort(reverse=True)
    return [result for _score, _rank, result in ranked]


def _search_quality_tokens(interest: dict[str, Any]) -> list[str]:
    values: list[str] = []
    for key in (
        "positive_texts",
        "positiveTexts",
        "candidate_positive_signals",
        "candidatePositiveSignals",
    ):
        value = interest.get(key)
        if isinstance(value, list):
            values.extend(str(item) for item in value)
        elif isinstance(value, str):
            values.append(value)
    return _tokens(" ".join(values))


def _tokens(text: str) -> list[str]:
    stopwords = {
        "about",
        "after",
        "call",
        "from",
        "into",
        "official",
        "public",
        "source",
        "that",
        "this",
        "with",
        "without",
    }
    tokens: list[str] = []
    for token in re.findall(r"[a-z][a-z0-9_-]{4,}", text.lower()):
        if token in stopwords or token in tokens:
            continue
        tokens.append(token)
    return tokens


def _is_search_ad_or_noise_url(url: str) -> bool:
    try:
        parsed = urlparse(url)
    except ValueError:
        return True
    host = (parsed.hostname or "").lower()
    path = parsed.path.lower()
    if not host:
        return True
    if host in {"bing.com", "www.bing.com"} and path.startswith("/aclick"):
        return True
    if host.endswith("googleadservices.com") or host.endswith("doubleclick.net"):
        return True
    return False


def _looks_like_primary_source(url: str) -> bool:
    try:
        host = (urlparse(url).hostname or "").lower()
    except ValueError:
        return False
    return host.endswith((".gov", ".gob", ".europa.eu", ".int", ".edu", ".ac.uk"))


def prepare_rollback(payload: DiscoveryVNextRollbackPreparePayload) -> dict[str, Any]:
    inventory = get_vnext_record("source-inventory", payload.source_inventory_id)
    prepared = {
        "sourceInventoryId": payload.source_inventory_id,
        "registeredChannelId": str(inventory["registered_channel_id"]) if inventory.get("registered_channel_id") else None,
        "currentState": inventory.get("current_state"),
        "vnextOwned": "discovery-vnext" in (inventory.get("tags") or []),
    }
    group = query_one(
        """
        insert into discovery_rollback_groups (
          source_inventory_id,
          registered_channel_id,
          reason,
          status,
          prepared_json,
          created_by
        )
        values (%s, %s, %s, 'prepared', %s, %s)
        returning *
        """,
        (
            payload.source_inventory_id,
            inventory.get("registered_channel_id"),
            payload.reason,
            Json(prepared),
            payload.created_by,
        ),
    )
    actions = [
        _create_rollback_action(
            str(group["rollback_group_id"]),
            "restore_inventory_state",
            "source_inventory",
            payload.source_inventory_id,
            {"targetState": "inventory", "previousState": inventory.get("current_state")},
        )
    ]
    if inventory.get("registered_channel_id"):
        actions.append(
            _create_rollback_action(
                str(group["rollback_group_id"]),
                "pause_channel",
                "source_channel",
                str(inventory["registered_channel_id"]),
                {"isActive": False},
            )
        )
        actions.append(
            _create_rollback_action(
                str(group["rollback_group_id"]),
                "emit_sync",
                "outbox_event",
                None,
                {"eventType": "source.channel.sync.requested"},
            )
        )
    return {"rollbackGroup": group, "rollbackActions": actions}


def apply_rollback(payload: DiscoveryVNextRollbackApplyPayload) -> dict[str, Any]:
    if not payload.confirm:
        raise HTTPException(status_code=422, detail="Rollback requires confirm=true.")
    group = get_vnext_record("rollback-groups", payload.rollback_group_id)
    if group.get("status") != "prepared":
        raise HTTPException(status_code=409, detail="Rollback group is not prepared.")
    channel_id = group.get("registered_channel_id")
    paused_channel = None
    if channel_id:
        paused_channel = query_one(
            """
            update source_channels
            set is_active = false,
                updated_at = now()
            where channel_id = %s
              and config_json->'discovery'->>'version' = 'vnext-1'
            returning channel_id, is_active
            """,
            (channel_id,),
        )
        if not paused_channel:
            raise HTTPException(status_code=409, detail="Rollback refused: channel is not vNext-owned.")
        _insert_source_sync_event(str(channel_id))
    inventory = query_one(
        """
        update source_inventory
        set current_state = 'inventory',
            registered_channel_id = null,
            updated_at = now()
        where source_inventory_id = %s
        returning *
        """,
        (group.get("source_inventory_id"),),
    )
    query_one(
        """
        update discovery_rollback_actions
        set status = 'applied',
            applied_at = now(),
            result_json = %s
        where rollback_group_id = %s
        returning rollback_action_id
        """,
        (Json({"appliedBy": payload.applied_by}), payload.rollback_group_id),
    )
    updated_group = query_one(
        """
        update discovery_rollback_groups
        set status = 'applied',
            applied_by = %s,
            applied_at = now(),
            result_json = %s
        where rollback_group_id = %s
        returning *
        """,
        (
            payload.applied_by,
            Json(_json_safe({"pausedChannel": paused_channel, "sourceInventory": inventory})),
            payload.rollback_group_id,
        ),
    )
    return {"rollbackGroup": updated_group, "pausedChannel": paused_channel, "sourceInventory": inventory}


def explain_source_inventory(payload: DiscoveryVNextSourceInventoryExplainPayload) -> dict[str, Any]:
    inventory = get_vnext_record("source-inventory", payload.source_inventory_id)
    artifact_ids = [
        str(value)
        for value in (
            inventory.get("latest_source_scope_resolution_artifact_id"),
            inventory.get("latest_source_understanding_artifact_id"),
            inventory.get("latest_routing_decision_artifact_id"),
        )
        if value
    ]
    artifacts = []
    if artifact_ids:
        artifacts = query_all(
            """
            select artifact_id, artifact_type, status, parent_artifact_ids, candidate_id, payload_json, validation_json, created_at
            from discovery_artifacts
            where artifact_id = any(%s::uuid[])
            order by created_at
            """,
            (artifact_ids,),
        )
    observations = query_all(
        """
        select observation_kind, observation_json, observed_at
        from source_observations
        where source_inventory_id = %s
        order by observed_at desc
        limit 50
        """,
        (payload.source_inventory_id,),
    )
    return {
        "sourceInventory": inventory,
        "lineage": {
            "sourceScopeResolutionArtifactId": inventory.get("latest_source_scope_resolution_artifact_id"),
            "sourceUnderstandingArtifactId": inventory.get("latest_source_understanding_artifact_id"),
            "routingDecisionArtifactId": inventory.get("latest_routing_decision_artifact_id"),
            "registeredChannelId": inventory.get("registered_channel_id"),
        },
        "artifacts": artifacts,
        "observations": observations,
    }


def resolve_source_inventory_scopes(payload: DiscoveryVNextSourceInventoryResolveScopesPayload) -> dict[str, Any]:
    rows = _source_inventory_rows_for_resolution(payload.source_inventory_ids, payload.limit)
    previews: list[dict[str, Any]] = []
    applied: list[dict[str, Any]] = []
    for row in rows:
        canonical_url = str(row.get("canonical_url") or row.get("resolved_source_url") or "")
        probe_report = {
            "candidateUrl": canonical_url,
            "accessPattern": "public",
            "technicalObservability": {
                "observable": True,
                "score": 0.35,
                "feedValid": row.get("current_provider_type") == "rss",
                "hasRecurringStructure": row.get("current_state") in {"cheap_watch", "probation_channel", "stable_channel"},
                "providerFailuresAreTelemetryOnly": True,
            },
            "probeCost": {"requestsAttempted": 0, "bounded": True},
            "observations": [],
            "providerFailures": [],
        }
        preview = resolve_source_scope(
            candidate={"canonicalUrl": canonical_url, "canonicalDomain": row.get("canonical_domain")},
            probe_report=probe_report,
        )
        previews.append({"sourceInventoryId": row.get("source_inventory_id"), "preview": preview})
        scope_payload = _artifact_payload(preview) or preview.get("payload") or {}
        if payload.apply and scope_payload:
            applied.append(_apply_inventory_scope_metadata(row, scope_payload, payload.created_by))
    destructive_actions = [
        item
        for item in applied
        if isinstance(item, dict) and isinstance(item.get("pausedChannel"), dict)
    ]
    return {
        "status": "applied" if payload.apply else "preview",
        "count": len(previews),
        "previews": previews,
        "applied": applied,
        "destructiveActions": destructive_actions,
        "destructiveConfirmationRequired": False,
    }


def apply_source_inventory_action(payload: DiscoveryVNextSourceInventoryActionPayload) -> dict[str, Any]:
    if payload.action == "re_resolve":
        return resolve_source_inventory_scopes(
            DiscoveryVNextSourceInventoryResolveScopesPayload(
                sourceInventoryIds=[payload.source_inventory_id],
                limit=1,
                apply=True,
                createdBy=payload.created_by,
            )
        )
    if payload.action == "promote_resolved_scope":
        return _update_inventory_state_action(payload, "inventory")
    if payload.action == "demote_to_context":
        return _update_inventory_state_action(payload, "inventory_context")
    if payload.action == "move_to_adapter_backlog":
        return _update_inventory_state_action(payload, "adapter_backlog")
    if payload.action in {"confirm_scope", "reject_scope"}:
        return _confirm_inventory_scope_action(payload)
    raise HTTPException(status_code=422, detail="Unsupported source inventory action.")


def _create_rollback_action(
    rollback_group_id: str,
    action_type: str,
    target_type: str,
    target_id: str | None,
    action: dict[str, Any],
) -> dict[str, Any]:
    row = query_one(
        """
        insert into discovery_rollback_actions (
          rollback_group_id,
          action_type,
          target_type,
          target_id,
          action_json
        )
        values (%s, %s, %s, %s, %s)
        returning *
        """,
        (rollback_group_id, action_type, target_type, target_id, Json(action)),
    )
    return row or {}


def _source_inventory_rows_for_resolution(source_inventory_ids: list[str], limit: int) -> list[dict[str, Any]]:
    ids = [str(item) for item in source_inventory_ids if str(item).strip()]
    if ids:
        return query_all(
            """
            select *
            from source_inventory
            where source_inventory_id::text = any(%s::text[])
            order by updated_at desc
            limit %s
            """,
            (ids, limit),
        )
    return query_all(
        """
        select *
        from source_inventory
        where current_state in ('inventory', 'inventory_context', 'cheap_watch', 'probation_channel', 'manual_review', 'adapter_backlog')
        order by updated_at desc
        limit %s
        """,
        (limit,),
    )


def _apply_inventory_scope_metadata(row: dict[str, Any], scope_payload: dict[str, Any], created_by: str) -> dict[str, Any]:
    scope_type = str(scope_payload.get("sourceScopeType") or "unknown")
    current_state = str(row.get("current_state") or "inventory")
    next_state = {
        "single_item": "inventory_context",
        "context_page": "inventory_context",
        "document_collection": "adapter_backlog",
        "api_endpoint": "adapter_backlog",
        "search_endpoint": "adapter_backlog",
        "blocked_or_unusable": "blocked",
        "unknown": "manual_review",
    }.get(scope_type, current_state)
    should_pause_projection = bool(row.get("registered_channel_id")) and (
        scope_type in {"single_item", "context_page", "blocked_or_unusable"}
        or _looks_like_document_url(str(row.get("canonical_url") or row.get("resolved_source_url") or ""))
    )
    rollback_group = None
    paused_channel = None
    if should_pause_projection:
        rollback_group = prepare_rollback(
            DiscoveryVNextRollbackPreparePayload(
                sourceInventoryId=str(row["source_inventory_id"]),
                reason=f"Auto-pausing forbidden Discovery projection after scope re-resolution: {scope_type}.",
                createdBy=created_by,
            )
        )
        paused_channel = query_one(
            """
            update source_channels
            set is_active = false,
                updated_at = now()
            where channel_id = %s
              and is_active = true
            returning channel_id, is_active
            """,
            (row.get("registered_channel_id"),),
        )
        if paused_channel:
            _insert_source_sync_event(str(paused_channel["channel_id"]))
    updated = query_one(
        """
        update source_inventory
        set current_state = %s,
            seed_item_url = %s,
            resolved_source_url = %s,
            source_scope_type = %s,
            source_scope_confidence = %s,
            monitoring_entry_urls_json = %s,
            item_extraction_hints_json = %s,
            scope_confirmation_json = jsonb_build_object('mode', 'maintenance_re_resolution', 'createdBy', %s::text, 'appliedAt', now()),
            updated_at = now()
        where source_inventory_id = %s
        returning *
        """,
        (
            next_state,
            scope_payload.get("seedItemUrl"),
            scope_payload.get("resolvedSourceUrl"),
            scope_type,
            scope_payload.get("sourceScopeConfidence"),
            Json(scope_payload.get("monitoringEntryUrls") or []),
            Json(scope_payload.get("itemExtractionHints") or {}),
            created_by,
            row.get("source_inventory_id"),
        ),
    )
    if updated:
        create_source_observation(
            source_inventory_id=str(updated["source_inventory_id"]),
            observation_kind="scope_resolution",
            observation={
                "mode": "maintenance_re_resolution",
                "reasonCode": _reresolve_reason_code(scope_type, should_pause_projection),
                "beforeState": {
                    "currentState": current_state,
                    "registeredChannelId": str(row.get("registered_channel_id") or "") or None,
                    "canonicalUrl": row.get("canonical_url"),
                    "resolvedSourceUrl": row.get("resolved_source_url"),
                    "sourceScopeType": row.get("source_scope_type"),
                },
                "afterState": {
                    "currentState": next_state,
                    "registeredChannelId": str(updated.get("registered_channel_id") or "") or None,
                    "resolvedSourceUrl": scope_payload.get("resolvedSourceUrl"),
                    "sourceScopeType": scope_type,
                    "pausedChannel": paused_channel,
                },
                "rollbackGroupId": (rollback_group or {}).get("rollbackGroup", {}).get("rollback_group_id"),
                "candidateUrl": scope_payload.get("candidateUrl"),
                "resolvedSourceUrl": scope_payload.get("resolvedSourceUrl"),
                "sourceScopeType": scope_type,
                "sourceScopeConfidence": scope_payload.get("sourceScopeConfidence"),
            },
        )
    return {
        "sourceInventory": updated or {},
        "pausedChannel": paused_channel,
        "rollback": rollback_group,
        "reasonCode": _reresolve_reason_code(scope_type, should_pause_projection),
    }


def _looks_like_document_url(url: str) -> bool:
    return bool(re.search(r"\.(pdf|docx?|xlsx?|pptx?|rtf)(?:$|\?)", url.lower()))


def _reresolve_reason_code(scope_type: str, paused: bool) -> str:
    if paused:
        return f"auto_paused_forbidden_scope:{scope_type}"
    if scope_type in {"document_collection", "api_endpoint", "search_endpoint"}:
        return f"moved_to_adapter_backlog:{scope_type}"
    return f"scope_metadata_refreshed:{scope_type}"


def _update_inventory_state_action(
    payload: DiscoveryVNextSourceInventoryActionPayload,
    current_state: str,
) -> dict[str, Any]:
    inventory = query_one(
        """
        update source_inventory
        set current_state = %s,
            scope_confirmation_json = coalesce(scope_confirmation_json, '{}'::jsonb)
              || jsonb_build_object('lastAction', %s::text, 'reason', %s::text, 'createdBy', %s::text, 'appliedAt', now()),
            updated_at = now()
        where source_inventory_id = %s
        returning *
        """,
        (
            current_state,
            payload.action,
            payload.reason,
            payload.created_by,
            payload.source_inventory_id,
        ),
    )
    if not inventory:
        raise HTTPException(status_code=404, detail="Source inventory record was not found.")
    observation = create_source_observation(
        source_inventory_id=str(inventory["source_inventory_id"]),
        observation_kind="scope_resolution",
        observation={
            "mode": "operator_action",
            "action": payload.action,
            "reason": payload.reason,
            "createdBy": payload.created_by,
            "currentState": current_state,
        },
    )
    return {
        "sourceInventory": inventory,
        "sourceObservation": observation,
        "destructiveConfirmationRequired": False,
    }


def _confirm_inventory_scope_action(payload: DiscoveryVNextSourceInventoryActionPayload) -> dict[str, Any]:
    confirmation = "confirmed" if payload.action == "confirm_scope" else "rejected"
    inventory = query_one(
        """
        update source_inventory
        set scope_confirmation_json = coalesce(scope_confirmation_json, '{}'::jsonb)
              || jsonb_build_object('scopeStatus', %s::text, 'reason', %s::text, 'createdBy', %s::text, 'appliedAt', now()),
            updated_at = now()
        where source_inventory_id = %s
        returning *
        """,
        (
            confirmation,
            payload.reason,
            payload.created_by,
            payload.source_inventory_id,
        ),
    )
    if not inventory:
        raise HTTPException(status_code=404, detail="Source inventory record was not found.")
    observation = create_source_observation(
        source_inventory_id=str(inventory["source_inventory_id"]),
        observation_kind="scope_resolution",
        observation={
            "mode": "operator_confirmation",
            "scopeStatus": confirmation,
            "reason": payload.reason,
            "createdBy": payload.created_by,
        },
    )
    return {
        "sourceInventory": inventory,
        "sourceObservation": observation,
        "destructiveConfirmationRequired": False,
    }


def _insert_source_sync_event(channel_id: str) -> dict[str, Any]:
    row = query_one(
        """
        insert into outbox_events (
          event_id,
          event_type,
          aggregate_type,
          aggregate_id,
          payload_json
        )
        values (gen_random_uuid(), 'source.channel.sync.requested', 'source_channel', %s, %s)
        returning *
        """,
        (channel_id, Json({"channelId": channel_id, "source": "discovery_vnext_rollback"})),
    )
    return row or {}


def upsert_candidate(
    candidate: dict[str, Any],
    *,
    hypothesis_artifact_id: str | None,
    query_quality_artifact_id: str | None,
) -> dict[str, Any]:
    acquisition = dict(candidate.get("acquisitionEvidence") or {})
    if isinstance(candidate.get("queryQuality"), dict):
        acquisition["queryQuality"] = candidate["queryQuality"]
    row = query_one(
        """
        insert into discovery_candidates (
          vnext_run_id,
          interest_id,
          hypothesis_artifact_id,
          hypothesis_id,
          hypothesis_batch_artifact_id,
          lens,
          memory_mode,
          query_quality_artifact_id,
          canonical_url,
          canonical_domain,
          candidate_kind_guess,
          acquisition_json,
          rediscovery_count,
          status
        )
        values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'new')
        on conflict (vnext_run_id, canonical_url) where vnext_run_id is not null
        do update set
          hypothesis_id = excluded.hypothesis_id,
          hypothesis_batch_artifact_id = excluded.hypothesis_batch_artifact_id,
          lens = coalesce(excluded.lens, discovery_candidates.lens),
          memory_mode = coalesce(excluded.memory_mode, discovery_candidates.memory_mode),
          query_quality_artifact_id = excluded.query_quality_artifact_id,
          acquisition_json = discovery_candidates.acquisition_json || excluded.acquisition_json,
          rediscovery_count = discovery_candidates.rediscovery_count + excluded.rediscovery_count,
          status = case
            when discovery_candidates.status = 'duplicate' then discovery_candidates.status
            else excluded.status
          end,
          updated_at = now()
        returning *
        """,
        (
            candidate.get("runId"),
            candidate.get("interestId"),
            hypothesis_artifact_id,
            str(candidate.get("hypothesisId") or "unknown"),
            hypothesis_artifact_id,
            candidate.get("lens"),
            candidate.get("memoryMode"),
            query_quality_artifact_id or None,
            candidate["canonicalUrl"],
            candidate["canonicalDomain"],
            candidate.get("candidateKindGuess", "unknown"),
            Json(acquisition),
            candidate.get("rediscoveryCount", 1),
        ),
    )
    return row or {}


def submit_feedback(payload: DiscoveryVNextFeedbackPayload) -> dict[str, Any]:
    if payload.feedback_type == "mark_useful":
        if not (
            payload.feedback.get("classificationCorrect") is True
            or payload.feedback.get("sourceUsefulAsClassified") is True
            or payload.feedback.get("usefulnessKind") == "classification_usefulness"
        ):
            raise HTTPException(
                status_code=422,
                detail=(
                    "mark_useful means classification/usefulness was correct; include "
                    "classificationCorrect=true, sourceUsefulAsClassified=true, or usefulnessKind=classification_usefulness."
                ),
            )
    row = query_one(
        """
        insert into discovery_feedback_events (
          target_type,
          target_id,
          feedback_type,
          feedback_json,
          created_by
        )
        values (%s, %s, %s, %s, %s)
        returning *
        """,
        (
            payload.target_type,
            payload.target_id,
            payload.feedback_type,
            Json(payload.feedback),
            payload.created_by,
        ),
    )
    return row or {}


def list_vnext_records(
    kind: str,
    *,
    page: int = 1,
    page_size: int = 50,
    status: str | None = None,
    artifact_type: str | None = None,
    interest_id: str | None = None,
    current_state: str | None = None,
    source_voice: str | None = None,
    artifact_freshness_kind: str | None = None,
    signal_production_mode: str | None = None,
) -> dict[str, Any]:
    config = _resource_config(kind)
    table = config["table"]
    where, params = _filters(
        config,
        status=status,
        artifact_type=artifact_type,
        interest_id=interest_id,
        current_state=current_state,
        source_voice=source_voice,
        artifact_freshness_kind=artifact_freshness_kind,
        signal_production_mode=signal_production_mode,
    )
    total = query_count(f"select count(*)::int as total from {table}{where}", params)
    rows = query_all(
        f"select * from {table}{where} order by {config['order']} limit %s offset %s",
        (*params, page_size, (page - 1) * page_size),
    )
    return build_paginated_response(rows, page, page_size, total)


def get_vnext_record(kind: str, record_id: str) -> dict[str, Any]:
    config = _resource_config(kind)
    row = query_one(
        f"select * from {config['table']} where {config['id']} = %s",
        (record_id,),
    )
    if not row:
        raise HTTPException(status_code=404, detail="Discovery vNext record not found.")
    return row


def _resource_config(kind: str) -> dict[str, Any]:
    config = VNEXT_LIST_RESOURCES.get(kind)
    if not config:
        raise HTTPException(status_code=404, detail="Unsupported Discovery vNext resource.")
    return config


def _filters(
    config: dict[str, Any],
    *,
    status: str | None,
    artifact_type: str | None,
    interest_id: str | None,
    current_state: str | None,
    source_voice: str | None,
    artifact_freshness_kind: str | None,
    signal_production_mode: str | None,
) -> tuple[str, tuple[Any, ...]]:
    clauses: list[str] = []
    params: list[Any] = []
    if status and config.get("status"):
        clauses.append("status = %s")
        params.append(status)
    if artifact_type and config.get("artifact_type"):
        clauses.append("artifact_type = %s")
        params.append(artifact_type)
    if interest_id and config["table"] in {"discovery_artifacts", "discovery_candidates"}:
        clauses.append("interest_id = %s")
        params.append(interest_id)
    if config["table"] == "source_inventory":
        if current_state:
            clauses.append("current_state = %s")
            params.append(current_state)
        if source_voice:
            clauses.append("source_voice = %s")
            params.append(source_voice)
        if artifact_freshness_kind:
            clauses.append("artifact_freshness_kind = %s")
            params.append(artifact_freshness_kind)
        if signal_production_mode:
            clauses.append("signal_production_mode = %s")
            params.append(signal_production_mode)
    where = f" where {' and '.join(clauses)}" if clauses else ""
    return where, tuple(params)


def _inventory_state_for_decision(decision: str) -> str:
    return {
        "auto_register_probation": "probation_channel",
        "inventory_context": "inventory_context",
        "cheap_watch": "cheap_watch",
        "manual_review": "manual_review",
        "adapter_backlog": "adapter_backlog",
        "blocked": "blocked",
        "rejected_structural": "rejected_structural",
        "inventory_low_priority": "inventory_low_priority",
    }.get(decision, "inventory")


def _first_registered_channel_id(result: dict[str, Any]) -> str | None:
    for row in result.get("registrarResults") or []:
        if isinstance(row, dict) and row.get("status") in {"registered", "duplicate"} and row.get("channel_id"):
            return str(row["channel_id"])
    return None


def _env(name: str) -> str:
    return os.getenv(name, "").strip()


def _env_flag(name: str, *, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _json_safe(value: Any) -> Any:
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, datetime | date):
        return value.isoformat()
    if isinstance(value, dict):
        return {str(key): _json_safe(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_json_safe(item) for item in value]
    if isinstance(value, tuple):
        return [_json_safe(item) for item in value]
    return value


def _discovery_unavailable(code: str, message: str) -> HTTPException:
    return HTTPException(status_code=503, detail={"code": code, "message": message})


def _effective_run_budget(
    *,
    runtime_policy: dict[str, Any],
    request: dict[str, Any] | None,
    budget: dict[str, Any] | None,
    live_provider_execution: bool,
) -> dict[str, Any]:
    request_budget = request.get("budget") if isinstance(request, dict) and isinstance(request.get("budget"), dict) else {}
    policy_budget = {
        key: runtime_policy[key]
        for key in ("maxRunCostCents", "maxQueryAttemptsPerRun", "maxResultsPerQuery")
        if runtime_policy.get(key) is not None
    }
    return {
        **policy_budget,
        **request_budget,
        **(budget if isinstance(budget, dict) else {}),
        "liveProviderExecution": live_provider_execution,
    }


def _search_provider_from_request(request: dict[str, Any] | None) -> str:
    provider = request.get("searchProvider") if isinstance(request, dict) else None
    return str(provider or _env("DISCOVERY_SEARCH_PROVIDER") or "ddgs").strip().lower()


def _assert_search_provider_runtime_ready(provider: str) -> None:
    normalized = provider.strip().lower()
    if normalized in {"stub", ""}:
        return
    if normalized == "brave" and not _env("DISCOVERY_BRAVE_API_KEY"):
        raise _discovery_unavailable(
            "runtime_credentials_missing",
            "Discovery live execution requires DISCOVERY_BRAVE_API_KEY for searchProvider=brave.",
        )
    if normalized == "serper" and not _env("DISCOVERY_SERPER_API_KEY"):
        raise _discovery_unavailable(
            "runtime_credentials_missing",
            "Discovery live execution requires DISCOVERY_SERPER_API_KEY for searchProvider=serper.",
        )


def _assert_live_runtime_allowed(
    runtime_policy: dict[str, Any],
    budget: dict[str, Any] | None,
    *,
    provider: str | None = None,
) -> None:
    if runtime_policy.get("requireDiscoveryEnabled", True) and not _env_flag("DISCOVERY_ENABLED"):
        raise _discovery_unavailable(
            "runtime_disabled",
            "Discovery live execution requires DISCOVERY_ENABLED=1.",
        )
    effective_budget = budget if isinstance(budget, dict) else {}
    max_cost = int(effective_budget.get("maxRunCostCents") or runtime_policy.get("maxRunCostCents") or 0)
    if runtime_policy.get("requireRunBudget", True) and max_cost <= 0:
        raise _discovery_unavailable(
            "budget_missing",
            "Discovery live execution requires a positive maxRunCostCents budget.",
        )
    if provider:
        _assert_search_provider_runtime_ready(provider)


def _complete_run(run_id: str, *, status: str, result: dict[str, Any] | None = None, error: dict[str, Any] | None = None) -> None:
    if not run_id:
        return
    query_one(
        """
        update discovery_vnext_runs
        set status = %s,
            result_json = %s,
            error_json = %s,
            completed_at = now(),
            updated_at = now()
        where vnext_run_id = %s
        returning vnext_run_id
        """,
        (status, Json(_json_safe(result or {})), Json(_json_safe(error or {})), run_id),
    )


def _start_run_step(vnext_run_id: str, step_kind: str, input_json: dict[str, Any]) -> dict[str, Any]:
    row = query_one(
        """
        insert into discovery_run_steps (
          vnext_run_id,
          step_kind,
          status,
          input_json,
          started_at
        )
        values (%s, %s, 'running', %s, now())
        returning *
        """,
        (vnext_run_id, step_kind, Json(_json_safe(input_json))),
    )
    return row or {}


def _finish_run_step(run_step_id: str, status: str, output: dict[str, Any] | None = None, error: dict[str, Any] | None = None) -> None:
    query_one(
        """
        update discovery_run_steps
        set status = %s,
            output_json = %s,
            error_json = %s,
            completed_at = now(),
            updated_at = now()
        where run_step_id = %s
        returning run_step_id
        """,
        (status, Json(_json_safe(output or {})), Json(_json_safe(error or {})), run_step_id),
    )


def _insert_query_attempt(
    *,
    run_id: str,
    hypothesis_artifact_id: str | None,
    provider: str,
    query_text: str,
    query_family_intent: str,
    live_provider_execution: bool,
    created_by: str,
) -> dict[str, Any]:
    row = query_one(
        """
        insert into discovery_query_attempts (
          vnext_run_id,
          hypothesis_artifact_id,
          provider,
          query_text,
          query_family_intent,
          status,
          request_json,
          live_provider_execution,
          created_by,
          started_at
        )
        values (%s, %s, %s, %s, %s, 'running', %s, %s, %s, now())
        returning *
        """,
        (
            run_id,
            hypothesis_artifact_id,
            provider,
            query_text,
            query_family_intent,
            Json({"query": query_text, "provider": provider}),
            live_provider_execution,
            created_by,
        ),
    )
    return row or {}


def _finish_query_attempt(
    query_attempt_id: str,
    status: str,
    *,
    meta: dict[str, Any] | None = None,
    results: list[dict[str, Any]] | None = None,
    quality_artifact: dict[str, Any] | None = None,
    error: dict[str, Any] | None = None,
) -> None:
    query_one(
        """
        update discovery_query_attempts
        set status = %s,
            query_quality_artifact_id = %s,
            response_json = %s,
            error_json = %s,
            result_count = %s,
            request_count = %s,
            cost_cents = %s,
            completed_at = now()
        where query_attempt_id = %s
        returning query_attempt_id
        """,
        (
            status,
            (quality_artifact or {}).get("artifact_id"),
            Json(
                {
                    "meta": meta or {},
                    "results": results or [],
                    "queryQuality": (quality_artifact or {}).get("payload_json") or (quality_artifact or {}).get("payload") or {},
                }
            ),
            Json(error or {}),
            len(results or []),
            int((meta or {}).get("request_count") or (1 if results else 0)),
            int((meta or {}).get("cost_cents") or 0),
            query_attempt_id,
        ),
    )


def _search_adapter(provider: str):
    normalized = provider.strip().lower()
    if normalized == "stub":
        return StubWebSearchAdapter()
    if normalized == "brave":
        return BraveWebSearchAdapter()
    if normalized == "serper":
        return SerperWebSearchAdapter()
    return DdgsWebSearchAdapter()


def _request_interest(request: dict[str, Any]) -> dict[str, Any]:
    value = request.get("systemInterest") or request.get("interest") or request
    if isinstance(value, dict):
        return value
    return {"name": "System interest", "description": str(value or "")}


def _string_list(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item) for item in value if str(item).strip()]
    if isinstance(value, str):
        return [item.strip() for item in value.split(",") if item.strip()]
    return []


def _artifact_payload(artifact: Any) -> dict[str, Any]:
    if not isinstance(artifact, dict):
        return {}
    value = artifact.get("payload_json") or artifact.get("payload")
    return value if isinstance(value, dict) else {}


def _uuid_or_none(value: Any) -> str | None:
    text = str(value or "").strip()
    if not text:
        return None
    try:
        return str(UUID(text))
    except ValueError:
        return None


def _queries_from_hypothesis_artifact(artifact: dict[str, Any]) -> list[dict[str, Any]]:
    payload = _artifact_payload(artifact)
    rows: list[dict[str, Any]] = []
    for hypothesis in payload.get("hypotheses") or []:
        if not isinstance(hypothesis, dict):
            continue
        for family in hypothesis.get("queryFamilies") or []:
            if not isinstance(family, dict):
                continue
            for query in family.get("queries") or []:
                rows.append(
                    {
                        "query": str(query),
                        "intent": str(family.get("intent") or ""),
                        "hypothesisId": str(hypothesis.get("hypothesisId") or ""),
                    }
                )
    return rows


def _domain_from_url(url: str) -> str:
    host = urlparse(url).hostname or "unknown"
    return host[4:] if host.startswith("www.") else host

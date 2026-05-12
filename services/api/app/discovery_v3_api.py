from __future__ import annotations

import uuid
from typing import Any, Literal

from fastapi import HTTPException
from psycopg.types.json import Json
from pydantic import BaseModel, ConfigDict, Field

from services.api.app.database import build_database_url, query_all, query_count, query_one
from services.api.app.pagination import build_paginated_response
from services.api.app.sequence_worker_boundary import (
    SequenceQueueDispatchError,
    dispatch_sequence_run_job,
)
from services.workers.app.discovery_v3_coverage import compute_coverage
from services.workers.app.discovery_v3_eval import run_fixture_replay_eval
from services.workers.app.discovery_v3_graph import compile_interest_graph
from services.workers.app.discovery_v3_contracts import evaluate_source_contract
from services.workers.app.discovery_v3_autopilot import (
    build_simple_target_payload,
    list_autopilot_profiles,
    simplify_config_deterministically,
)
from services.workers.app.discovery_v3_llm_tasks import explain_endpoint_deterministically
from services.workers.app.task_engine.adapters.source_registrar import PostgresSourceRegistrarAdapter


DISCOVERY_V3_RUNNER_SEQUENCE_TITLE = "Default Discovery V3 Runner"
DISCOVERY_V3_RUNNER_SEQUENCE_CREATED_BY = "system:discovery_v3_api"
DISCOVERY_V3_RUNNER_SEQUENCE_TAGS = ["default", "discovery", "v3", "runner"]
DISCOVERY_V3_RUNNER_TASK_GRAPH = [
    {
        "key": "discovery_v3_run",
        "module": "discovery.v3.run",
        "enabled": True,
        "options": {},
        "retry": {"attempts": 1, "delay_ms": 1000},
        "timeout_ms": 420000,
    }
]


class DiscoveryV3TargetCreatePayload(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    origin_kind: Literal[
        "system_interest",
        "user_interest",
        "manual_prompt",
        "source_channel",
        "coverage_gap",
        "underperforming_source",
        "discovered_entity",
        "discovered_domain",
        "social_signal_cluster",
    ] = Field(alias="originKind")
    origin_id: str | None = Field(default=None, alias="originId")
    title: str
    description: str | None = None
    priority: float = 1.0
    seed_topics: list[str] = Field(default_factory=list, alias="seedTopics")
    seed_entities: list[str] = Field(default_factory=list, alias="seedEntities")
    seed_geos: list[str] = Field(default_factory=list, alias="seedGeos")
    seed_languages: list[str] = Field(default_factory=list, alias="seedLanguages")
    seed_urls: list[str] = Field(default_factory=list, alias="seedUrls")
    seed_domains: list[str] = Field(default_factory=list, alias="seedDomains")
    graph_json: dict[str, Any] = Field(default_factory=dict, alias="graphJson")
    policy_json: dict[str, Any] = Field(default_factory=dict, alias="policyJson")
    autopilot_json: dict[str, Any] = Field(default_factory=dict, alias="autopilotJson")
    created_by: str | None = Field(default=None, alias="createdBy")


class DiscoveryV3TargetUpdatePayload(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    title: str | None = None
    description: str | None = None
    status: Literal["active", "paused", "archived"] | None = None
    priority: float | None = None
    seed_topics: list[str] | None = Field(default=None, alias="seedTopics")
    seed_entities: list[str] | None = Field(default=None, alias="seedEntities")
    seed_geos: list[str] | None = Field(default=None, alias="seedGeos")
    seed_languages: list[str] | None = Field(default=None, alias="seedLanguages")
    seed_urls: list[str] | None = Field(default=None, alias="seedUrls")
    seed_domains: list[str] | None = Field(default=None, alias="seedDomains")
    graph_json: dict[str, Any] | None = Field(default=None, alias="graphJson")
    policy_json: dict[str, Any] | None = Field(default=None, alias="policyJson")
    autopilot_json: dict[str, Any] | None = Field(default=None, alias="autopilotJson")


class DiscoveryV3RunCreatePayload(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    target_id: str = Field(alias="targetId")
    run_kind: Literal[
        "bootstrap",
        "gap_fill",
        "source_expand",
        "replacement",
        "hidden_signal_scan",
        "direct_signal_scan",
        "social_scan",
        "maintenance",
        "manual",
    ] = Field(default="manual", alias="runKind")
    trigger_kind: str = Field(default="api", alias="triggerKind")
    max_depth: int = Field(default=3, ge=1, le=5, alias="maxDepth")
    max_hypotheses: int = Field(default=120, ge=1, alias="maxHypotheses")
    max_search_results: int = Field(default=800, ge=0, alias="maxSearchResults")
    max_domains: int = Field(default=400, ge=0, alias="maxDomains")
    max_endpoints: int = Field(default=700, ge=0, alias="maxEndpoints")
    max_social_items: int = Field(default=1000, ge=0, alias="maxSocialItems")
    provider_execution_enabled: bool = Field(default=False, alias="providerExecutionEnabled")
    created_by: str | None = Field(default=None, alias="createdBy")


class DiscoveryV3DispatchQueuedRunsPayload(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    target_id: str | None = Field(default=None, alias="targetId")
    run_ids: list[str] = Field(default_factory=list, alias="runIds")
    limit: int = Field(default=25, ge=1, le=50)
    include_already_dispatched: bool = Field(default=False, alias="includeAlreadyDispatched")
    requested_by: str | None = Field(default=None, alias="requestedBy")
    reason: str | None = None


class DiscoveryV3EndpointDecisionPayload(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    reviewed_by: str | None = Field(default=None, alias="reviewedBy")
    reason: str | None = None
    enabled: bool = True
    tags: list[str] = Field(default_factory=list)
    operator_config: dict[str, Any] = Field(default_factory=dict, alias="operatorConfig")


class DiscoveryV3ContractEvaluatePayload(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    metrics: dict[str, Any] = Field(default_factory=dict)
    evaluated_by: str | None = Field(default=None, alias="evaluatedBy")


class DiscoveryV3RepairProviderPayload(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    repair_kind: str = Field(default="repair_provider_auth", alias="repairKind")
    requested_by: str | None = Field(default=None, alias="requestedBy")
    reason: str | None = None


class DiscoveryV3EvalRunPayload(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    config_json: dict[str, Any] = Field(default_factory=dict, alias="configJson")
    requested_by: str | None = Field(default=None, alias="requestedBy")


class DiscoveryV3SimpleTargetPayload(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    prompt: str
    title: str | None = None
    description: str | None = None
    seed_topics: list[str] = Field(default_factory=list, alias="seedTopics")
    seed_entities: list[str] = Field(default_factory=list, alias="seedEntities")
    seed_geos: list[str] = Field(default_factory=list, alias="seedGeos")
    seed_languages: list[str] = Field(default_factory=list, alias="seedLanguages")
    seed_urls: list[str] = Field(default_factory=list, alias="seedUrls")
    seed_domains: list[str] = Field(default_factory=list, alias="seedDomains")
    autopilot_profile: str = Field(default="balanced", alias="autopilotProfile")
    created_by: str | None = Field(default=None, alias="createdBy")


class DiscoveryV3SourceActionPayload(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    target_id: str = Field(alias="targetId")
    max_depth: int = Field(default=2, ge=1, le=5, alias="maxDepth")
    max_hypotheses: int = Field(default=60, ge=1, alias="maxHypotheses")
    max_search_results: int = Field(default=120, ge=0, alias="maxSearchResults")
    max_domains: int = Field(default=80, ge=0, alias="maxDomains")
    max_endpoints: int = Field(default=120, ge=0, alias="maxEndpoints")
    max_social_items: int = Field(default=0, ge=0, alias="maxSocialItems")
    provider_execution_enabled: bool = Field(default=False, alias="providerExecutionEnabled")
    requested_by: str | None = Field(default=None, alias="requestedBy")


TABLES: dict[str, dict[str, str]] = {
    "targets": {"table": "discovery_targets", "id": "target_id", "order": "updated_at desc"},
    "runs": {"table": "discovery_runs", "id": "run_id", "order": "created_at desc"},
    "hypotheses": {"table": "discovery_hypotheses", "id": "hypothesis_id", "order": "created_at desc"},
    "domains": {"table": "discovery_domain_inventory", "id": "domain_id", "order": "updated_at desc"},
    "endpoints": {"table": "discovery_source_endpoints", "id": "endpoint_id", "order": "updated_at desc"},
    "actions": {"table": "discovery_actions", "id": "action_id", "order": "created_at desc"},
    "contracts": {"table": "discovery_source_contracts", "id": "contract_id", "order": "updated_at desc"},
    "claims": {"table": "discovery_claims", "id": "claim_id", "order": "updated_at desc"},
    "negative-evidence": {
        "table": "discovery_negative_evidence",
        "id": "negative_evidence_id",
        "order": "created_at desc",
    },
    "provider-health": {"table": "discovery_provider_health", "id": "provider_id", "order": "updated_at desc"},
    "identities": {"table": "discovery_source_identities", "id": "source_identity_id", "order": "updated_at desc"},
    "eval-suites": {"table": "discovery_eval_suites", "id": "eval_suite_id", "order": "created_at desc"},
    "eval-runs": {"table": "discovery_eval_runs", "id": "eval_run_id", "order": "created_at desc"},
    "llm-decisions": {"table": "discovery_llm_decisions", "id": "decision_id", "order": "created_at desc"},
}


def _row_or_404(row: dict[str, Any] | None, label: str) -> dict[str, Any]:
    if row is None:
        raise HTTPException(status_code=404, detail=f"{label} was not found.")
    return row


def _where_for_filters(filters: dict[str, Any]) -> tuple[str, list[Any]]:
    clauses: list[str] = []
    params: list[Any] = []
    for column, value in filters.items():
        if value is None or value == "":
            continue
        clauses.append(f"{column} = %s")
        params.append(value)
    return (" where " + " and ".join(clauses), params) if clauses else ("", params)


def list_v3_records(
    kind: str,
    *,
    page: int = 1,
    page_size: int = 50,
    status: str | None = None,
    target_id: str | None = None,
) -> dict[str, Any]:
    meta = TABLES[kind]
    filters: dict[str, Any] = {}
    if kind not in {"provider-health", "identities", "eval-suites", "eval-runs"}:
        filters["status"] = status
    if kind == "domains":
        filters["first_seen_target_id"] = target_id
    elif kind in {
        "runs",
        "hypotheses",
        "endpoints",
        "actions",
        "contracts",
        "claims",
        "negative-evidence",
        "llm-decisions",
    }:
        filters["target_id"] = target_id
    where_sql, params = _where_for_filters(filters)
    offset = (max(1, page) - 1) * page_size
    total = query_count(f"select count(*) as total from {meta['table']}{where_sql}", tuple(params))
    rows = query_all(
        f"select * from {meta['table']}{where_sql} order by {meta['order']} limit %s offset %s",
        (*params, page_size, offset),
    )
    return build_paginated_response(rows, max(1, page), page_size, total)


def get_v3_record(kind: str, record_id: str) -> dict[str, Any]:
    meta = TABLES[kind]
    return _row_or_404(
        query_one(f"select * from {meta['table']} where {meta['id']} = %s", (record_id,)),
        kind,
    )


def create_target(payload: DiscoveryV3TargetCreatePayload) -> dict[str, Any]:
    row = query_one(
        """
        insert into discovery_targets (
          origin_kind, origin_id, title, description, priority,
          seed_topics, seed_entities, seed_geos, seed_languages,
          seed_urls, seed_domains, graph_json, policy_json,
          autopilot_json, created_by
        )
        values (
          %s, %s, %s, %s, %s,
          %s, %s, %s, %s,
          %s, %s, %s::jsonb, %s::jsonb,
          %s::jsonb, %s
        )
        returning *
        """,
        (
            payload.origin_kind,
            payload.origin_id,
            payload.title,
            payload.description,
            payload.priority,
            payload.seed_topics,
            payload.seed_entities,
            payload.seed_geos,
            payload.seed_languages,
            payload.seed_urls,
            payload.seed_domains,
            Json(payload.graph_json),
            Json(payload.policy_json),
            Json(payload.autopilot_json),
            payload.created_by,
        ),
    )
    return _row_or_404(row, "Discovery target")


def create_simple_target(payload: DiscoveryV3SimpleTargetPayload) -> dict[str, Any]:
    simple = build_simple_target_payload(payload.model_dump(by_alias=True))
    simple["graph_json"] = compile_interest_graph(simple)
    return create_target(
        DiscoveryV3TargetCreatePayload(
            originKind=simple["origin_kind"],
            originId=simple.get("origin_id"),
            title=simple["title"],
            description=simple.get("description"),
            seedTopics=simple.get("seed_topics", []),
            seedEntities=simple.get("seed_entities", []),
            seedGeos=simple.get("seed_geos", []),
            seedLanguages=simple.get("seed_languages", []),
            seedUrls=simple.get("seed_urls", []),
            seedDomains=simple.get("seed_domains", []),
            graphJson=simple.get("graph_json", {}),
            policyJson=simple.get("policy_json", {}),
            autopilotJson=simple.get("autopilot_json", {}),
            createdBy=simple.get("created_by"),
        )
    )


def get_autopilot_profiles() -> dict[str, Any]:
    return {"items": list_autopilot_profiles()}


def _ensure_discovery_v3_runner_sequence() -> str:
    row = query_one(
        """
        select sequence_id::text as sequence_id
        from sequences
        where title = %s
          and created_by = %s
          and status <> 'archived'
        order by updated_at desc, created_at desc
        limit 1
        """,
        (
            DISCOVERY_V3_RUNNER_SEQUENCE_TITLE,
            DISCOVERY_V3_RUNNER_SEQUENCE_CREATED_BY,
        ),
    )
    if row is not None:
        return str(row["sequence_id"])

    row = query_one(
        """
        insert into sequences (
          title, description, task_graph, status, trigger_event, cron,
          max_runs, tags, created_by
        )
        values (%s, %s, %s::jsonb, 'active', null, null, null, %s::text[], %s)
        returning sequence_id::text as sequence_id
        """,
        (
            DISCOVERY_V3_RUNNER_SEQUENCE_TITLE,
            "Default Sequence Runner entrypoint for Discovery V3 runs created through API/MCP.",
            Json(DISCOVERY_V3_RUNNER_TASK_GRAPH),
            DISCOVERY_V3_RUNNER_SEQUENCE_TAGS,
            DISCOVERY_V3_RUNNER_SEQUENCE_CREATED_BY,
        ),
    )
    if row is None:
        raise HTTPException(status_code=500, detail="Discovery runner sequence was not created.")
    return str(row["sequence_id"])


def _mark_sequence_dispatch_failed(
    *,
    sequence_run_id: str,
    discovery_run_id: str,
    sequence_id: str,
    error_text: str,
) -> None:
    query_one(
        """
        update sequence_runs
        set status = 'failed', finished_at = now(), error_text = %s
        where run_id = %s
        returning run_id
        """,
        (error_text, sequence_run_id),
    )
    query_one(
        """
        update discovery_runs
        set summary_json = summary_json || %s::jsonb
        where run_id = %s
        returning run_id
        """,
        (
            Json(
                {
                    "sequenceDispatch": {
                        "sequenceId": sequence_id,
                        "sequenceRunId": sequence_run_id,
                        "dispatchStatus": "failed",
                        "error": error_text,
                    }
                }
            ),
            discovery_run_id,
        ),
    )


def _attach_sequence_dispatch(
    run: dict[str, Any],
    *,
    dispatch_source: str = "discovery_v3_api",
    requested_by: str | None = None,
) -> dict[str, Any]:
    run_id = str(run["run_id"])
    target_id = str(run["target_id"])
    sequence_id = _ensure_discovery_v3_runner_sequence()
    sequence_run_id = str(uuid.uuid4())
    trigger_meta = {
        "source": dispatch_source,
        "discoveryRunId": run_id,
        "targetId": target_id,
        "runKind": run.get("run_kind"),
        "triggerKind": run.get("trigger_kind"),
    }
    if requested_by or run.get("created_by"):
        trigger_meta["requestedBy"] = requested_by or run["created_by"]

    query_one(
        """
        insert into sequence_runs (
          run_id, sequence_id, retry_of_run_id, status, context_json,
          trigger_type, trigger_meta
        )
        values (%s, %s, null, 'pending', %s::jsonb, 'api', %s::jsonb)
        returning run_id
        """,
        (
            sequence_run_id,
            sequence_id,
            Json(
                {
                    "run_id": run_id,
                    "runId": run_id,
                    "target_id": target_id,
                    "targetId": target_id,
                }
            ),
            Json(trigger_meta),
        ),
    )

    try:
        dispatch_sequence_run_job(sequence_run_id, sequence_id)
    except SequenceQueueDispatchError as error:
        error_text = str(error) or "Failed to enqueue discovery run sequence."
        _mark_sequence_dispatch_failed(
            sequence_run_id=sequence_run_id,
            discovery_run_id=run_id,
            sequence_id=sequence_id,
            error_text=error_text,
        )
        raise HTTPException(status_code=503, detail=error_text) from error
    except Exception as error:  # pragma: no cover - runtime dependent
        error_text = str(error) or "Failed to enqueue discovery run sequence."
        _mark_sequence_dispatch_failed(
            sequence_run_id=sequence_run_id,
            discovery_run_id=run_id,
            sequence_id=sequence_id,
            error_text=error_text,
        )
        raise HTTPException(status_code=503, detail=error_text) from error

    dispatch_metadata = {
        "sequenceId": sequence_id,
        "sequenceRunId": sequence_run_id,
        "dispatchStatus": "enqueued",
    }
    updated = query_one(
        """
        update discovery_runs
        set summary_json = summary_json || %s::jsonb
        where run_id = %s
        returning *
        """,
        (Json({"sequenceDispatch": dispatch_metadata}), run_id),
    )
    return {
        **(updated or run),
        "sequenceDispatch": dispatch_metadata,
    }


def _operator_run_summary(
    *,
    provider_execution_enabled: bool,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    summary = dict(extra or {})
    if provider_execution_enabled:
        summary["providerExecutionEnabled"] = True
        summary["providerExecutionScope"] = "bounded_operator_approved"
    return summary


def simplify_config(payload: DiscoveryV3SimpleTargetPayload) -> dict[str, Any]:
    return simplify_config_deterministically(payload.model_dump(by_alias=True))


def update_target(target_id: str, payload: DiscoveryV3TargetUpdatePayload) -> dict[str, Any]:
    updates = payload.model_dump(exclude_unset=True, by_alias=False)
    if not updates:
        return get_v3_record("targets", target_id)
    assignments: list[str] = []
    params: list[Any] = []
    json_fields = {"graph_json", "policy_json", "autopilot_json"}
    for field, value in updates.items():
        if field in json_fields:
            assignments.append(f"{field} = %s::jsonb")
            params.append(Json(value))
        else:
            assignments.append(f"{field} = %s")
            params.append(value)
    params.append(target_id)
    row = query_one(
        f"""
        update discovery_targets
        set {", ".join(assignments)}, updated_at = now()
        where target_id = %s
        returning *
        """,
        tuple(params),
    )
    return _row_or_404(row, "Discovery target")


def create_run(payload: DiscoveryV3RunCreatePayload) -> dict[str, Any]:
    row = query_one(
        """
        insert into discovery_runs (
          target_id, run_kind, trigger_kind, max_depth, max_hypotheses,
          max_search_results, max_domains, max_endpoints, max_social_items,
          summary_json, created_by
        )
        values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s)
        returning *
        """,
        (
            payload.target_id,
            payload.run_kind,
            payload.trigger_kind,
            payload.max_depth,
            payload.max_hypotheses,
            payload.max_search_results,
            payload.max_domains,
            payload.max_endpoints,
            payload.max_social_items,
            Json(_operator_run_summary(provider_execution_enabled=payload.provider_execution_enabled)),
            payload.created_by,
        ),
    )
    return _attach_sequence_dispatch(_row_or_404(row, "Discovery run"))


def dispatch_queued_runs(payload: DiscoveryV3DispatchQueuedRunsPayload) -> dict[str, Any]:
    clauses = ["status = 'queued'", "started_at is null"]
    params: list[Any] = []
    if payload.target_id:
        clauses.append("target_id = %s")
        params.append(payload.target_id)
    if payload.run_ids:
        clauses.append("run_id = any(%s::uuid[])")
        params.append(payload.run_ids)
    if not payload.include_already_dispatched:
        clauses.append("not (summary_json ? 'sequenceDispatch')")
    where_sql = " and ".join(clauses)
    rows = query_all(
        f"""
        select *
        from discovery_runs
        where {where_sql}
        order by created_at asc
        limit %s
        """,
        (*params, payload.limit),
    )
    dispatched: list[dict[str, Any]] = []
    failures: list[dict[str, Any]] = []
    for row in rows:
        run_id = str(row["run_id"])
        try:
            updated = _attach_sequence_dispatch(
                row,
                dispatch_source="discovery_v3_queue_repair",
                requested_by=payload.requested_by,
            )
        except HTTPException as error:
            failures.append(
                {
                    "runId": run_id,
                    "statusCode": error.status_code,
                    "error": str(error.detail),
                }
            )
            break
        except Exception as error:  # pragma: no cover - defensive runtime guard
            failures.append({"runId": run_id, "error": str(error)})
            break
        dispatched.append(
            {
                "runId": run_id,
                "targetId": str(row["target_id"]),
                "runKind": row.get("run_kind"),
                "sequenceDispatch": updated.get("sequenceDispatch"),
            }
        )
    return {
        "requested": {
            "targetId": payload.target_id,
            "runIds": payload.run_ids,
            "limit": payload.limit,
            "includeAlreadyDispatched": payload.include_already_dispatched,
            "requestedBy": payload.requested_by,
            "reason": payload.reason,
        },
        "matched": len(rows),
        "dispatchedCount": len(dispatched),
        "failureCount": len(failures),
        "dispatched": dispatched,
        "failures": failures,
    }


def cancel_run(run_id: str) -> dict[str, Any]:
    row = query_one(
        """
        update discovery_runs
        set status = 'cancelled', finished_at = coalesce(finished_at, now())
        where run_id = %s and status in ('queued', 'running')
        returning *
        """,
        (run_id,),
    )
    return _row_or_404(row or query_one("select * from discovery_runs where run_id = %s", (run_id,)), "Discovery run")


def latest_coverage(target_id: str) -> dict[str, Any]:
    row = query_one(
        """
        select *
        from discovery_coverage_snapshots
        where target_id = %s
        order by created_at desc
        limit 1
        """,
        (target_id,),
    )
    return _row_or_404(row, "Discovery coverage snapshot")


def explain_coverage(target_id: str) -> dict[str, Any]:
    coverage = latest_coverage(target_id)
    coverage_json = coverage.get("coverage_json") if isinstance(coverage.get("coverage_json"), dict) else {}
    gaps = coverage.get("gaps_json") if isinstance(coverage.get("gaps_json"), list) else []
    return {
        "targetId": target_id,
        "coverageScore": coverage.get("coverage_score"),
        "summary": coverage.get("summary_json") or {},
        "roles": coverage_json.get("roles") or {},
        "gaps": gaps,
        "whyNotComplete": [
            f"{gap.get('sourceRole')} missing/weak: {gap.get('reason') or 'coverage gap'}"
            for gap in gaps
            if isinstance(gap, dict)
        ],
        "nextBestActions": [
            {"action": "expand_gap", "sourceRole": gap.get("sourceRole"), "gapScore": gap.get("gapScore")}
            for gap in gaps
            if isinstance(gap, dict)
        ],
    }


def refresh_coverage(target_id: str) -> dict[str, Any]:
    target = get_v3_record("targets", target_id)
    inventory = query_all(
        """
        select *
        from discovery_source_inventory_view
        where target_id = %s or target_id is null
        order by updated_at desc
        limit 500
        """,
        (target_id,),
    )
    graph = target.get("graph_json") or compile_interest_graph(target)
    coverage = compute_coverage(target_id=target_id, graph=graph, source_inventory=inventory)
    row = query_one(
        """
        insert into discovery_coverage_snapshots (
          target_id, coverage_json, gaps_json, source_inventory_json,
          summary_json, coverage_score, source_count, strong_source_count,
          missing_role_count
        )
        values (%s, %s::jsonb, %s::jsonb, %s::jsonb, %s::jsonb, %s, %s, %s, %s)
        returning *
        """,
        (
            target_id,
            Json(coverage["coverage_json"]),
            Json(coverage["gaps_json"]),
            Json(coverage["source_inventory_json"]),
            Json({"generatedBy": "api.refresh_coverage.v3"}),
            coverage["coverage_score"],
            coverage["source_count"],
            coverage["strong_source_count"],
            coverage["missing_role_count"],
        ),
    )
    if row:
        query_one(
            """
            update discovery_targets
            set last_coverage_snapshot_id = %s, updated_at = now()
            where target_id = %s
            returning target_id
            """,
            (row["coverage_snapshot_id"], target_id),
        )
    return _row_or_404(row, "Discovery coverage snapshot")


def promote_endpoint(endpoint_id: str, payload: DiscoveryV3EndpointDecisionPayload) -> dict[str, Any]:
    endpoint = get_v3_record("endpoints", endpoint_id)
    if endpoint.get("source_channel_id"):
        return endpoint
    try:
        return PostgresSourceRegistrarAdapter(build_database_url()).register_endpoint_source(
            endpoint=endpoint,
            enabled=payload.enabled,
            created_by=payload.reviewed_by,
            tags=payload.tags,
            operator_config=payload.operator_config,
            reason=payload.reason,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


def reject_endpoint(endpoint_id: str, payload: DiscoveryV3EndpointDecisionPayload) -> dict[str, Any]:
    row = query_one(
        """
        update discovery_source_endpoints
        set status = 'rejected',
            recommended_action = 'reject',
            rejection_reason = %s,
            reviewed_by = %s,
            reviewed_at = now(),
            updated_at = now()
        where endpoint_id = %s
        returning *
        """,
        (payload.reason, payload.reviewed_by, endpoint_id),
    )
    return _row_or_404(row, "Discovery endpoint")


def mark_endpoint_duplicate(endpoint_id: str, payload: DiscoveryV3EndpointDecisionPayload) -> dict[str, Any]:
    row = query_one(
        """
        update discovery_source_endpoints
        set status = 'duplicate',
            recommended_action = 'reject',
            rejection_reason = coalesce(%s, 'duplicate_endpoint'),
            reviewed_by = %s,
            reviewed_at = now(),
            updated_at = now()
        where endpoint_id = %s
        returning *
        """,
        (payload.reason, payload.reviewed_by, endpoint_id),
    )
    return _row_or_404(row, "Discovery endpoint")


def expand_endpoint(endpoint_id: str, payload: DiscoveryV3EndpointDecisionPayload) -> dict[str, Any]:
    endpoint = get_v3_record("endpoints", endpoint_id)
    action = query_one(
        """
        insert into discovery_actions (
          target_id, endpoint_id, action_type, status, requested_by, reason, payload_json
        )
        values (%s, %s, 'expand_endpoint', 'queued', %s, %s, %s::jsonb)
        returning *
        """,
        (
            endpoint.get("target_id"),
            endpoint_id,
            payload.reviewed_by,
            payload.reason,
            Json(payload.model_dump(by_alias=True)),
        ),
    )
    return _row_or_404(action, "Discovery action")


def explain_endpoint(endpoint_id: str) -> dict[str, Any]:
    endpoint = get_v3_record("endpoints", endpoint_id)
    return {"endpointId": endpoint_id, **explain_endpoint_deterministically(endpoint)}


def diagnose_run(run_id: str) -> dict[str, Any]:
    run = get_v3_record("runs", run_id)
    summary = run.get("summary_json") if isinstance(run.get("summary_json"), dict) else {}
    provider_errors = int(summary.get("providerHealthEventCount") or 0)
    no_evidence = not summary.get("endpointCount") and not summary.get("domainCount") and not summary.get("searchResultCount")
    diagnosis = []
    if provider_errors:
        diagnosis.append({"failureMode": "provider_errors_high", "severity": 0.75, "evidence": ["provider health events recorded"]})
    if no_evidence:
        diagnosis.append({"failureMode": "no_new_evidence", "severity": 0.55, "evidence": ["run summary contains no endpoint/domain/search counts"]})
    return {
        "runId": run_id,
        "diagnosis": diagnosis,
        "repairPlan": [
            {"repairKind": "switch_provider", "priority": 0.8, "params": {}}
            for item in diagnosis
            if item["failureMode"] == "provider_errors_high"
        ],
        "shouldRerun": bool(diagnosis),
        "confidence": 0.5 if diagnosis else 0.2,
    }


def evaluate_contract(contract_id: str, payload: DiscoveryV3ContractEvaluatePayload) -> dict[str, Any]:
    contract_row = get_v3_record("contracts", contract_id)
    result = evaluate_source_contract(contract_row.get("contract_json") or {}, payload.metrics)
    trust = result["trust"]
    row = query_one(
        """
        update discovery_source_contracts
        set status = %s,
            last_evaluation_at = now(),
            last_passed_at = case when %s then now() else last_passed_at end,
            last_failed_at = case when %s then last_failed_at else now() end,
            health_score = %s,
            contract_fit_score = %s,
            useful_yield_score = %s,
            noise_score = %s,
            freshness_score = %s,
            coverage_contribution = %s,
            downstream_weight = %s,
            failure_reason = %s,
            updated_at = now()
        where contract_id = %s
        returning *
        """,
        (
            result["status"],
            result["passed"],
            result["passed"],
            result["healthScore"],
            result["contractFitScore"],
            result["usefulYieldScore"],
            result["noiseScore"],
            result["freshnessScore"],
            trust["coverageContribution"],
            trust["downstreamWeight"],
            ",".join(result["failureReasons"]) or None,
            contract_id,
        ),
    )
    if row and row.get("source_channel_id"):
        query_one(
            """
            update source_channels
            set config_json = jsonb_set(
              jsonb_set(
                jsonb_set(
                  jsonb_set(config_json, '{discovery,trustStage}', to_jsonb(%s::text), true),
                  '{discovery,coverageContribution}', to_jsonb(%s::double precision),
                  true
                ),
                '{discovery,downstreamWeight}', to_jsonb(%s::double precision),
                true
              ),
              '{discovery,evidenceContract}', %s::jsonb,
              true
            ),
            updated_at = now()
            where channel_id = %s
            returning channel_id
            """,
            (
                trust["trustStage"],
                trust["coverageContribution"],
                trust["downstreamWeight"],
                Json(contract_row.get("contract_json") or {}),
                row["source_channel_id"],
            ),
        )
    return _row_or_404(row, "Discovery contract")


def clear_negative_evidence_cooldown(negative_evidence_id: str) -> dict[str, Any]:
    row = query_one(
        """
        update discovery_negative_evidence
        set cooldown_until = null
        where negative_evidence_id = %s
        returning *
        """,
        (negative_evidence_id,),
    )
    return _row_or_404(row, "Discovery negative evidence")


def repair_provider(provider_id: str, payload: DiscoveryV3RepairProviderPayload) -> dict[str, Any]:
    action = query_one(
        """
        insert into discovery_repairs (
          repair_kind, trigger_kind, diagnosis_json, action_plan_json, status
        )
        values (%s, 'provider_health', %s::jsonb, %s::jsonb, 'queued')
        returning *
        """,
        (
            payload.repair_kind,
            Json({"providerId": provider_id, "reason": payload.reason}),
            Json({"requestedBy": payload.requested_by}),
        ),
    )
    query_one(
        """
        update discovery_provider_health
        set status = case when status = 'auth_failed' then 'degraded' else status end,
            cooldown_until = null,
            updated_at = now()
        where provider_id = %s
        returning provider_id
        """,
        (provider_id,),
    )
    return _row_or_404(action, "Discovery repair")


def run_eval_suite(eval_suite_id: str, payload: DiscoveryV3EvalRunPayload) -> dict[str, Any]:
    cases = query_all(
        """
        select *
        from discovery_eval_cases
        where eval_suite_id = %s
        order by created_at
        """,
        (eval_suite_id,),
    )
    metrics = run_fixture_replay_eval(cases)
    row = query_one(
        """
        insert into discovery_eval_runs (eval_suite_id, config_json, metrics_json)
        values (%s, %s::jsonb, %s::jsonb)
        returning *
        """,
        (
            eval_suite_id,
            Json(payload.config_json | {"requestedBy": payload.requested_by}),
            Json({"status": "completed", **metrics}),
        ),
    )
    return _row_or_404(row, "Discovery eval run")


def expand_source(channel_id: str, payload: DiscoveryV3SourceActionPayload) -> dict[str, Any]:
    row = query_one(
        """
        insert into discovery_runs (
          target_id, run_kind, trigger_kind, max_depth, max_hypotheses,
          max_search_results, max_domains, max_endpoints, max_social_items,
          summary_json, created_by
        )
        values (%s, 'source_expand', 'api', %s, %s, %s, %s, %s, %s, %s::jsonb, %s)
        returning *
        """,
        (
            payload.target_id,
            payload.max_depth,
            payload.max_hypotheses,
            payload.max_search_results,
            payload.max_domains,
            payload.max_endpoints,
            payload.max_social_items,
            Json(
                _operator_run_summary(
                    provider_execution_enabled=payload.provider_execution_enabled,
                    extra={"sourceChannelId": channel_id},
                )
            ),
            payload.requested_by,
        ),
    )
    return _attach_sequence_dispatch(_row_or_404(row, "Discovery run"))


def replace_source_candidates(channel_id: str, payload: DiscoveryV3SourceActionPayload) -> dict[str, Any]:
    row = query_one(
        """
        insert into discovery_runs (
          target_id, run_kind, trigger_kind, max_depth, max_hypotheses,
          max_search_results, max_domains, max_endpoints, max_social_items,
          summary_json, created_by
        )
        values (%s, 'replacement', 'api', %s, %s, %s, %s, %s, %s, %s::jsonb, %s)
        returning *
        """,
        (
            payload.target_id,
            payload.max_depth,
            payload.max_hypotheses,
            payload.max_search_results,
            payload.max_domains,
            payload.max_endpoints,
            payload.max_social_items,
            Json(
                _operator_run_summary(
                    provider_execution_enabled=payload.provider_execution_enabled,
                    extra={"sourceChannelId": channel_id},
                )
            ),
            payload.requested_by,
        ),
    )
    return _attach_sequence_dispatch(_row_or_404(row, "Discovery run"))


def get_summary() -> dict[str, Any]:
    row = query_one(
        """
        select
          (select count(*)::int from discovery_targets where status = 'active') as active_targets,
          (select count(*)::int from discovery_runs where status in ('queued', 'running')) as active_runs,
          (select count(*)::int from discovery_source_endpoints where status in ('candidate', 'promotable', 'manual_review')) as review_endpoints,
          (select count(*)::int from discovery_source_contracts where status = 'probation') as probation_sources,
          (select count(*)::int from discovery_claims where status in ('candidate', 'needs_control')) as open_claims,
          (select count(*)::int from discovery_provider_health where status <> 'healthy') as unhealthy_providers
        """
    )
    return row or {}

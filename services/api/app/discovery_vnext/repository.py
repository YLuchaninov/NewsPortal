from __future__ import annotations

from typing import Any

from fastapi import HTTPException

from services.api.app.database import query_all, query_count, query_one
from services.api.app.pagination import build_paginated_response


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

from __future__ import annotations

from typing import Any

from fastapi import HTTPException
from psycopg.types.json import Json

from signalops.api.database import query_all, query_one
from signalops.api.discovery_vnext.models import DiscoveryVNextRunCreatePayload, DiscoveryVNextRunStartPayload
from signalops.api.discovery_vnext.policy import resolve_required_policy_payload
from signalops.api.discovery_vnext.providers import _assert_live_runtime_allowed, _effective_run_budget, _search_provider_from_request
from signalops.api.discovery_vnext.repository import get_vnext_record
from signalops.api.discovery_vnext.run_lifecycle import complete_run as _complete_run
from signalops.api.discovery_vnext.run_steps import execute_run_steps

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



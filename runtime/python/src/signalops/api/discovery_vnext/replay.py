from __future__ import annotations

from typing import Any

from fastapi import HTTPException
from psycopg.types.json import Json

from signalops.api.database import query_one
from signalops.api.discovery_vnext.acquisition import create_candidates_from_payload, normalize_candidates
from signalops.api.discovery_vnext.models import (
    DiscoveryVNextCandidateCreatePayload,
    DiscoveryVNextReplayPayload,
    DiscoveryVNextRoutePreviewPayload,
    DiscoveryVNextRunCreatePayload,
)
from signalops.api.discovery_vnext.policy import resolve_required_policy_payload
from signalops.api.discovery_vnext.providers import _json_safe
from signalops.api.discovery_vnext.repository import get_vnext_record
from signalops.api.discovery_vnext.routing import preview_route
from signalops.api.discovery_vnext.run_lifecycle import (
    complete_run as _complete_run,
    finish_run_step as _finish_run_step,
    start_run_step as _start_run_step,
)
from signalops.api.discovery_vnext.run_steps import execute_run_steps
from signalops.api.discovery_vnext.runs import create_run

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


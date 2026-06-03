from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from fastapi import APIRouter, FastAPI, Query

from services.api.app import discovery_vnext_api as vnext


def register_discovery_routes(app: FastAPI, deps: Mapping[str, Any]) -> None:
    del deps
    router = APIRouter()

    router.post("/maintenance/discovery/brief/preview")(vnext.preview_brief)
    router.post("/maintenance/discovery/artifacts/validate")(vnext.validate_artifact)
    router.post("/maintenance/discovery/artifacts", status_code=201)(
        vnext.create_artifact_from_payload
    )
    router.post("/maintenance/discovery/runs", status_code=201)(vnext.create_run)
    router.post("/maintenance/discovery/runs/start", status_code=201)(vnext.start_run)
    router.post("/maintenance/discovery/runs/{run_id}/diagnose")(vnext.diagnose_run)
    router.post("/maintenance/discovery/runs/{run_id}/cancel")(vnext.cancel_run)
    router.post("/maintenance/discovery/mega-loop/preview")(vnext.preview_mega_loop)
    router.post("/maintenance/discovery/candidates/normalize")(vnext.normalize_candidates)
    router.post("/maintenance/discovery/candidates", status_code=201)(
        vnext.create_candidates_from_payload
    )
    router.post("/maintenance/discovery/probe/plan/preview")(vnext.preview_probe_plan)
    router.post("/maintenance/discovery/probe/execute")(vnext.execute_probe_from_payload)
    router.post("/maintenance/discovery/understand/preview")(vnext.preview_source_understanding)
    router.post("/maintenance/discovery/route/preview")(vnext.preview_route)
    router.post("/maintenance/discovery/routing-decisions/apply")(vnext.apply_routing_decision)
    router.post("/maintenance/discovery/probation/handoff")(vnext.apply_probation_handoff_from_payload)
    router.post("/maintenance/discovery/policies/validate")(vnext.validate_policy)
    router.post("/maintenance/discovery/policies/activate", status_code=201)(vnext.activate_policy)
    router.post("/maintenance/discovery/llm-gateway", status_code=201)(vnext.run_llm_gateway)
    router.post("/maintenance/discovery/replay", status_code=201)(vnext.start_replay)
    router.post("/maintenance/discovery/rollback/prepare", status_code=201)(vnext.prepare_rollback)
    router.post("/maintenance/discovery/rollback/apply")(vnext.apply_rollback)
    router.post("/maintenance/discovery/feedback", status_code=201)(vnext.submit_feedback)

    for public_name, kind in (
        ("runs", "runs"),
        ("artifacts", "artifacts"),
        ("candidates", "candidates"),
        ("source-inventory", "source-inventory"),
        ("policies", "policies"),
        ("adapter-backlog", "adapter-backlog"),
        ("feedback", "feedback"),
        ("replay-runs", "replay-runs"),
        ("rollback-groups", "rollback-groups"),
        ("rollback-actions", "rollback-actions"),
        ("eval-runs", "eval-runs"),
        ("run-steps", "run-steps"),
        ("query-attempts", "query-attempts"),
        ("llm-gateway-events", "llm-gateway-events"),
        ("monitoring-state", "monitoring-state"),
        ("source-observations", "source-observations"),
    ):
        router.get(f"/maintenance/discovery/{public_name}")(
            _build_vnext_list_handler(kind)
        )
        router.get(f"/maintenance/discovery/{public_name}/{{record_id}}")(
            _build_vnext_get_handler(kind)
        )

    app.include_router(router)


def _build_vnext_list_handler(kind: str):
    def handler(
        page: int = Query(1, ge=1),
        pageSize: int = Query(50, ge=1, le=200),
        status: str | None = None,
        artifactType: str | None = None,
        interestId: str | None = None,
        currentState: str | None = None,
        sourceVoice: str | None = None,
        artifactFreshnessKind: str | None = None,
        signalProductionMode: str | None = None,
    ) -> dict[str, Any]:
        return vnext.list_vnext_records(
            kind,
            page=page,
            page_size=pageSize,
            status=status,
            artifact_type=artifactType,
            interest_id=interestId,
            current_state=currentState,
            source_voice=sourceVoice,
            artifact_freshness_kind=artifactFreshnessKind,
            signal_production_mode=signalProductionMode,
        )

    return handler


def _build_vnext_get_handler(kind: str):
    def handler(record_id: str) -> dict[str, Any]:
        return vnext.get_vnext_record(kind, record_id)

    return handler

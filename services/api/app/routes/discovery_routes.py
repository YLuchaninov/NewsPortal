from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from fastapi import APIRouter, Body, FastAPI, Query

from services.api.app import discovery_source_priors_api as source_priors
from services.api.app import discovery_v3_api as v3


def register_discovery_routes(app: FastAPI, deps: Mapping[str, Any]) -> None:
    del deps
    router = APIRouter()

    router.get("/maintenance/discovery/summary")(v3.get_summary)
    router.get("/maintenance/discovery/autopilot-profiles")(v3.get_autopilot_profiles)
    router.post("/maintenance/discovery/config/simplify")(v3.simplify_config)

    router.get("/maintenance/discovery/targets")(_list_targets)
    router.post("/maintenance/discovery/targets", status_code=201)(v3.create_target)
    router.post("/maintenance/discovery/targets/create-simple", status_code=201)(v3.create_simple_target)
    router.get("/maintenance/discovery/targets/{target_id}")(_get_target)
    router.patch("/maintenance/discovery/targets/{target_id}")(v3.update_target)
    router.get("/maintenance/discovery/targets/{target_id}/coverage")(v3.latest_coverage)
    router.get("/maintenance/discovery/targets/{target_id}/coverage/explain")(v3.explain_coverage)
    router.post("/maintenance/discovery/targets/{target_id}/refresh-coverage")(v3.refresh_coverage)
    router.post("/maintenance/discovery/targets/{target_id}/expand-gap")(_expand_gap)

    router.get("/maintenance/discovery/runs")(_list_runs)
    router.post("/maintenance/discovery/runs", status_code=201)(v3.create_run)
    router.post("/maintenance/discovery/runs/dispatch-queued")(v3.dispatch_queued_runs)
    router.get("/maintenance/discovery/runs/{run_id}")(_get_run)
    router.post("/maintenance/discovery/runs/{run_id}/diagnose")(v3.diagnose_run)
    router.post("/maintenance/discovery/runs/{run_id}/cancel")(v3.cancel_run)

    router.get("/maintenance/discovery/source-priors")(_list_source_priors)
    router.post("/maintenance/discovery/source-priors/evaluate")(source_priors.evaluate_source_prior)
    router.post("/maintenance/discovery/source-priors/apply")(source_priors.apply_source_prior)

    for public_name, kind in (
        ("hypotheses", "hypotheses"),
        ("domains", "domains"),
        ("endpoints", "endpoints"),
        ("actions", "actions"),
        ("contracts", "contracts"),
        ("claims", "claims"),
        ("negative-evidence", "negative-evidence"),
        ("provider-health", "provider-health"),
        ("identities", "identities"),
        ("eval-suites", "eval-suites"),
        ("eval-runs", "eval-runs"),
        ("llm-decisions", "llm-decisions"),
    ):
        router.get(f"/maintenance/discovery/{public_name}")(
            _build_list_handler(kind)
        )
        router.get(f"/maintenance/discovery/{public_name}/{{record_id}}")(
            _build_get_handler(kind)
        )

    router.post("/maintenance/discovery/endpoints/{endpoint_id}/promote")(v3.promote_endpoint)
    router.get("/maintenance/discovery/endpoints/{endpoint_id}/explain")(v3.explain_endpoint)
    router.post("/maintenance/discovery/endpoints/{endpoint_id}/reject")(v3.reject_endpoint)
    router.post("/maintenance/discovery/endpoints/{endpoint_id}/expand")(v3.expand_endpoint)
    router.post("/maintenance/discovery/endpoints/{endpoint_id}/mark-duplicate")(
        v3.mark_endpoint_duplicate
    )
    router.post("/maintenance/discovery/contracts/{contract_id}/evaluate")(v3.evaluate_contract)
    router.post("/maintenance/discovery/providers/{provider_id}/repair")(v3.repair_provider)
    router.post("/maintenance/discovery/negative-evidence/{negative_evidence_id}/clear-cooldown")(
        v3.clear_negative_evidence_cooldown
    )
    router.post("/maintenance/discovery/eval-suites/{eval_suite_id}/run")(v3.run_eval_suite)
    router.post("/maintenance/discovery/sources/{channel_id}/expand")(v3.expand_source)
    router.post("/maintenance/discovery/sources/{channel_id}/replace-candidates")(v3.replace_source_candidates)

    app.include_router(router)


def _list_targets(
    page: int = Query(1, ge=1),
    pageSize: int = Query(50, ge=1, le=200),
    status: str | None = None,
) -> dict[str, Any]:
    return v3.list_v3_records(
        "targets",
        page=page,
        page_size=pageSize,
        status=status,
    )


def _get_target(target_id: str) -> dict[str, Any]:
    return v3.get_v3_record("targets", target_id)


def _expand_gap(
    target_id: str,
    payload: dict[str, Any] = Body(default_factory=dict),
) -> dict[str, Any]:
    payload = {key: value for key, value in payload.items() if key not in {"targetId", "target_id"}}
    return v3.create_run(
        v3.DiscoveryV3RunCreatePayload(
            targetId=target_id,
            runKind="gap_fill",
            triggerKind="coverage_gap",
            **payload,
        )
    )


def _list_runs(
    page: int = Query(1, ge=1),
    pageSize: int = Query(50, ge=1, le=200),
    status: str | None = None,
    targetId: str | None = None,
) -> dict[str, Any]:
    return v3.list_v3_records(
        "runs",
        page=page,
        page_size=pageSize,
        status=status,
        target_id=targetId,
    )


def _get_run(run_id: str) -> dict[str, Any]:
    return v3.get_v3_record("runs", run_id)


def _list_source_priors(
    page: int = Query(1, ge=1),
    pageSize: int = Query(50, ge=1, le=200),
    targetId: str | None = None,
    channelId: str | None = None,
    endpointId: str | None = None,
    contractId: str | None = None,
) -> dict[str, Any]:
    return source_priors.list_source_priors(
        page=page,
        page_size=pageSize,
        target_id=targetId,
        channel_id=channelId,
        endpoint_id=endpointId,
        contract_id=contractId,
    )


def _build_list_handler(kind: str):
    def handler(
        page: int = Query(1, ge=1),
        pageSize: int = Query(50, ge=1, le=200),
        status: str | None = None,
        targetId: str | None = None,
    ) -> dict[str, Any]:
        return v3.list_v3_records(
            kind,
            page=page,
            page_size=pageSize,
            status=status,
            target_id=targetId,
        )

    return handler


def _build_get_handler(kind: str):
    def handler(record_id: str) -> dict[str, Any]:
        return v3.get_v3_record(kind, record_id)

    return handler

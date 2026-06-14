from __future__ import annotations

from typing import Any

from fastapi import HTTPException

from signalops.api.discovery_vnext.acquisition import execute_candidate_acquisition
from signalops.api.discovery_vnext.artifacts import create_artifact
from signalops.api.discovery_vnext.briefs import preview_brief, preview_mega_loop
from signalops.api.discovery_vnext.common import artifact_payload, request_interest, string_list
from signalops.api.discovery_vnext.llm_gateway import run_llm_gateway
from signalops.api.discovery_vnext.models import (
    DiscoveryVNextBriefPreviewPayload,
    DiscoveryVNextLlmGatewayPayload,
    DiscoveryVNextMegaLoopPreviewPayload,
    DiscoveryVNextProbeExecutePayload,
    DiscoveryVNextRoutingApplyPayload,
)
from signalops.api.discovery_vnext.policy import resolve_required_policy_payload
from signalops.api.discovery_vnext.probing import execute_full_probe_understand_route, execute_probe_from_payload
from signalops.api.discovery_vnext.providers import _effective_run_budget
from signalops.api.discovery_vnext.run_lifecycle import finish_run_step as _finish_run_step, start_run_step as _start_run_step
from signalops.api.discovery_vnext.source_inventory import _domain_from_url
from signalops.api.discovery_vnext.source_inventory_actions import apply_routing_decision

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
    interest = request_interest(request)

    if run_kind in {"brief_compile", "full"}:
        step = _start_run_step(run_id, "brief_compile", interest)
        brief = preview_brief(
            DiscoveryVNextBriefPreviewPayload(
                interestId=interest.get("interestId"),
                name=str(interest.get("name") or "System interest"),
                description=str(interest.get("description") or ""),
                positive_texts=string_list(interest.get("positive_texts") or interest.get("positiveTexts")),
                negative_texts=string_list(interest.get("negative_texts") or interest.get("negativeTexts")),
                candidate_positive_signals=string_list(
                    interest.get("candidate_positive_signals") or interest.get("candidatePositiveSignals")
                ),
                candidate_negative_signals=string_list(
                    interest.get("candidate_negative_signals") or interest.get("candidateNegativeSignals")
                ),
                geographies=string_list(interest.get("geographies")),
                languages=string_list(interest.get("languages")),
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

    brief_payload = artifact_payload(result.get("briefArtifact")) or request.get("discoveryBrief") or {}
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



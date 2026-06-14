from __future__ import annotations

from typing import Any

from signalops.api.database import query_one
from signalops.api.discovery_vnext.artifacts import create_artifact
from signalops.api.discovery_vnext.common import artifact_payload
from signalops.api.discovery_vnext.llm_gateway import run_llm_gateway
from signalops.api.discovery_vnext.models import (
    DiscoveryVNextLlmGatewayPayload,
    DiscoveryVNextProbationHandoffPayload,
    DiscoveryVNextProbeExecutePayload,
    DiscoveryVNextProbePlanPreviewPayload,
    DiscoveryVNextRoutingApplyPayload,
    DiscoveryVNextScopeResolvePayload,
    DiscoveryVNextUnderstandPayload,
)
from signalops.api.discovery_vnext.policy import resolve_required_policy_payload
from signalops.api.discovery_vnext.source_inventory import _domain_from_url, apply_probation_handoff_from_payload, source_identity_key
from signalops.api.discovery_vnext.source_inventory_actions import apply_routing_decision
from signalops.workers.discovery_vnext_artifacts import validate_artifact_payload
from signalops.workers.discovery_vnext_probe import build_probe_plan, execute_probe_plan
from signalops.workers.discovery_vnext_scope_resolution import resolve_source_scope
from signalops.workers.discovery_vnext_understanding import synthesize_source_understanding

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
    scope_payload = artifact_payload(preview) or preview.get("payload") or {}
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
        probe_payload = artifact_payload(probe_artifact)
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
        scope_payload = artifact_payload(scope_artifact)
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
        source_payload = artifact_payload(understanding) or understanding.get("payload") or {}
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
        routing_payload = artifact_payload(routing_artifact)
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
        payload = artifact_payload(artifact)
        if isinstance(payload, dict):
            decisions.append(str(payload.get("decision") or ""))
    scope_counts: dict[str, int] = {}
    for row in scope_resolutions:
        artifact = row.get("sourceScopeResolutionArtifact") if isinstance(row.get("sourceScopeResolutionArtifact"), dict) else {}
        payload = artifact_payload(artifact)
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
        if float((artifact_payload(row.get("sourceScopeResolutionArtifact") if isinstance(row.get("sourceScopeResolutionArtifact"), dict) else {}).get("sourceScopeConfidence") or 0) < 0.65)
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


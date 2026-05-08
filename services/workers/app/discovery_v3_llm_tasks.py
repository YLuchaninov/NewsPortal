from __future__ import annotations

from typing import Any

from .discovery_v3_llm_gateway import DiscoveryV3LlmGateway
from .discovery_v3_llm_schemas import (
    ConfigSimplificationOutput,
    DiscoveryGraphOutput,
    EndpointExplanationOutput,
    RunDiagnosisOutput,
    SkepticOutput,
)


def _deterministic_graph_fallback(payload: dict[str, Any]) -> dict[str, Any]:
    graph = dict(payload.get("graph") if isinstance(payload.get("graph"), dict) else {})
    return {
        "coreTopic": str(graph.get("coreTopic") or payload.get("title") or "Discovery target"),
        "entities": list(graph.get("entities") or []),
        "aliases": list(graph.get("aliases") or []),
        "subtopics": list(graph.get("subtopics") or []),
        "eventTypes": list(graph.get("eventTypes") or []),
        "directSignalPhrases": list(graph.get("directSignalPhrases") or []),
        "hiddenSignalPhrases": list(graph.get("hiddenSignalPhrases") or []),
        "sourceRoleHints": list(graph.get("sourceRoleHints") or []),
        "geos": list(graph.get("geos") or []),
        "languages": list(graph.get("languages") or ["en"]),
        "localizedTerms": dict(graph.get("localizedTerms") or {}),
        "negativePatterns": list(graph.get("negativePatterns") or []),
        "providerHints": [],
        "assumptions": [],
        "confidence": 0.0,
    }


async def expand_graph_with_llm(
    *,
    gateway: DiscoveryV3LlmGateway | None,
    target: dict[str, Any],
    graph: dict[str, Any],
) -> dict[str, Any]:
    if gateway is None:
        return _deterministic_graph_fallback({"graph": graph, **target})
    return await gateway.run_json_task(
        task_name="discovery.graph.compile",
        input_payload={"target": target, "graph": graph},
        schema_model=DiscoveryGraphOutput,
        fallback_factory=lambda payload: _deterministic_graph_fallback({"graph": payload.get("graph"), **target}),
        refs={"target_id": target.get("target_id")},
        prompt=(
            "Expand this discovery graph with entities, aliases, direct and hidden signal phrases, "
            "localized terms, provider hints and assumptions. Return JSON only."
        ),
    )


def fallback_skeptic_accept(payload: dict[str, Any]) -> dict[str, Any]:
    del payload
    return {
        "decision": "accept",
        "disagreementScore": 0.0,
        "maxSeverity": 0.0,
        "summary": "Deterministic fallback accepted the bounded hypothesis pack.",
        "critiques": [],
        "repairPatches": [],
        "addedIdeas": [],
        "rejectHypotheses": [],
        "manualReviewItems": [],
        "globalWarnings": [],
    }


async def constructive_skeptic_review(
    *,
    gateway: DiscoveryV3LlmGateway | None,
    payload: dict[str, Any],
    target_id: str | None = None,
    run_id: str | None = None,
) -> dict[str, Any]:
    if gateway is None:
        return fallback_skeptic_accept(payload)
    return await gateway.run_json_task(
        task_name="discovery.constructive_skeptic.review",
        input_payload=payload,
        schema_model=SkepticOutput,
        fallback_factory=fallback_skeptic_accept,
        refs={"target_id": target_id, "run_id": run_id},
        prompt=(
            "Review Explorer hypotheses constructively. Add only bounded missing angles, "
            "negative controls, provider warnings and repair patches that fix concrete weaknesses. Return JSON only."
        ),
    )


async def verification_skeptic_review(
    *,
    gateway: DiscoveryV3LlmGateway | None,
    payload: dict[str, Any],
    target_id: str | None = None,
    run_id: str | None = None,
) -> dict[str, Any]:
    if gateway is None:
        return fallback_skeptic_accept(payload)
    return await gateway.run_json_task(
        task_name="discovery.verification_skeptic.review",
        input_payload=payload,
        schema_model=SkepticOutput,
        fallback_factory=fallback_skeptic_accept,
        refs={"target_id": target_id, "run_id": run_id},
        prompt=(
            "Verify the repaired hypothesis pack. Add at most blocking issues; persistent disagreement "
            "must become manual_review or reject. Return JSON only."
        ),
    )


def explain_endpoint_deterministically(endpoint: dict[str, Any]) -> dict[str, Any]:
    why_found = []
    why_not = []
    missing = []
    if endpoint.get("source_role"):
        why_found.append(f"Matches source role {endpoint['source_role']}.")
    if endpoint.get("endpoint_kind"):
        why_found.append(f"Classified as {endpoint['endpoint_kind']}.")
    evidence_score = float(endpoint.get("evidence_score") or 0)
    extraction = float(endpoint.get("extraction_ready_score") or 0)
    action = str(endpoint.get("recommended_action") or "review")
    if action not in {"auto_promote", "manual_promote"}:
        why_not.append(f"Policy action is {action}.")
    if evidence_score < 0.7:
        missing.append("strong probe evidence")
    if extraction < 0.6:
        missing.append("stable extraction readiness")
    return {
        "whyFound": why_found,
        "whyNotPromoted": why_not,
        "missingEvidence": missing,
        "deterministicPolicyResult": {
            "status": endpoint.get("status"),
            "recommendedAction": action,
            "totalScore": endpoint.get("total_score"),
            "evidenceScore": evidence_score,
            "extractionReadyScore": extraction,
        },
        "nextBestAction": action,
    }


async def explain_endpoint_with_llm(
    *,
    gateway: DiscoveryV3LlmGateway | None,
    endpoint: dict[str, Any],
) -> dict[str, Any]:
    def fallback(payload: dict[str, Any]) -> dict[str, Any]:
        return explain_endpoint_deterministically(dict(payload.get("endpoint") or {}))

    if gateway is None:
        return fallback({"endpoint": endpoint})
    return await gateway.run_json_task(
        task_name="discovery.endpoint.review",
        input_payload={"endpoint": endpoint},
        schema_model=EndpointExplanationOutput,
        fallback_factory=fallback,
        refs={"target_id": endpoint.get("target_id"), "endpoint_id": endpoint.get("endpoint_id")},
        prompt="Explain why this endpoint was found, why it was not promoted, missing evidence and next action.",
    )


async def diagnose_run_with_llm(
    *,
    gateway: DiscoveryV3LlmGateway | None,
    run: dict[str, Any],
    metrics: dict[str, Any],
) -> dict[str, Any]:
    def fallback(payload: dict[str, Any]) -> dict[str, Any]:
        return {
            "diagnosis": [],
            "repairPlan": [],
            "shouldRerun": bool(payload.get("metrics", {}).get("providerHealthEventCount", 0)),
            "confidence": 0.0,
        }

    if gateway is None:
        return fallback({"metrics": metrics})
    return await gateway.run_json_task(
        task_name="discovery.run.diagnose",
        input_payload={"run": run, "metrics": metrics},
        schema_model=RunDiagnosisOutput,
        fallback_factory=fallback,
        refs={"target_id": run.get("target_id"), "run_id": run.get("run_id")},
        prompt="Diagnose this discovery run from observed metrics only and recommend allowed repairs.",
    )


async def simplify_config_with_llm(
    *,
    gateway: DiscoveryV3LlmGateway | None,
    prompt_text: str,
    autopilot_profile: str = "balanced",
) -> dict[str, Any]:
    def fallback(payload: dict[str, Any]) -> dict[str, Any]:
        return {
            "title": str(payload.get("prompt") or "Discovery target")[:120],
            "description": str(payload.get("prompt") or ""),
            "seedTopics": [str(payload.get("prompt") or "")],
            "seedEntities": [],
            "seedGeos": [],
            "seedLanguages": ["en"],
            "autopilotProfile": str(payload.get("autopilotProfile") or "balanced"),
            "policyHints": {},
            "assumptions": [],
        }

    if gateway is None:
        return fallback({"prompt": prompt_text, "autopilotProfile": autopilot_profile})
    return await gateway.run_json_task(
        task_name="discovery.config.simplify",
        input_payload={"prompt": prompt_text, "autopilotProfile": autopilot_profile},
        schema_model=ConfigSimplificationOutput,
        fallback_factory=fallback,
        prompt="Simplify this operator request into a discovery target draft and safe autopilot profile.",
    )

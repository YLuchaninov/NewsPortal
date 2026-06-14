from __future__ import annotations

from typing import Any

from signalops.api.database import query_all
from signalops.api.discovery_vnext.models import (
    DiscoveryVNextBriefPreviewPayload,
    DiscoveryVNextMegaLoopPreviewPayload,
)
from signalops.api.discovery_vnext.policy import resolve_required_policy_payload
from signalops.workers.discovery_vnext_brief import compile_discovery_brief
from signalops.workers.discovery_vnext_megaloop import run_mega_loop_preview

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



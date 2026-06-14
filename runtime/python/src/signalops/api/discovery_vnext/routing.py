from __future__ import annotations

from typing import Any

from signalops.api.discovery_vnext.models import DiscoveryVNextRoutePreviewPayload
from signalops.api.discovery_vnext.policy import resolve_required_policy_payload
from signalops.workers.discovery_vnext_artifacts import validate_artifact_envelope, validate_artifact_payload, validation_json
from signalops.workers.discovery_vnext_routing import route_source_understanding

def preview_route(payload: DiscoveryVNextRoutePreviewPayload) -> dict[str, Any]:
    source_understanding = dict(payload.source_understanding)
    source_understanding.setdefault("yieldIndependent", True)
    issues = validate_artifact_envelope(
        {
            "artifactType": "SourceUnderstanding",
            "schemaVersion": "2.0",
            "status": "generated",
            "payload": source_understanding,
        }
    )
    if issues:
        return {
            "routingDecision": None,
            "sourceUnderstandingValidation": validation_json(issues),
        }
    routing_decision = route_source_understanding(
        source_understanding,
        policy=resolve_required_policy_payload(payload.policy, "discovery-routing"),
        provider_type=payload.provider_type,
        access_pattern=payload.access_pattern,
    )
    return {
        "routingDecision": routing_decision,
        "routingDecisionValidation": validation_json(
            validate_artifact_payload("RoutingDecision", routing_decision)
        ),
    }



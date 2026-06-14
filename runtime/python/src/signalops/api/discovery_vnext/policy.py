from __future__ import annotations

from hashlib import sha256
from typing import Any

from fastapi import HTTPException
from psycopg.types.json import Json

from signalops.api.database import query_one
from signalops.api.discovery_vnext.models import DiscoveryVNextPolicyActivatePayload

def resolve_required_policy_payload(policy: dict[str, Any], policy_name: str) -> dict[str, Any]:
    if policy:
        return policy
    row = get_required_active_policy(policy_name)
    definition = row.get("definition_json") or row.get("definitionJson")
    if not isinstance(definition, dict) or not definition:
        raise HTTPException(
            status_code=503,
            detail=f"Required Discovery vNext policy is invalid: {policy_name}.",
        )
    return definition



def _sample_review_required(
    routing_decision: dict[str, Any],
    source_understanding: dict[str, Any],
    policy: dict[str, Any],
) -> bool:
    decision = str(routing_decision.get("decision") or "")
    if decision not in {"auto_register_probation", "cheap_watch"}:
        return False
    percent = int(policy.get("sampleReviewPercent") or policy.get("sample_review_percent") or 0)
    if percent <= 0:
        return False
    percent = min(100, percent)
    seed = "|".join(
        [
            str(source_understanding.get("sourceUrl") or ""),
            str(source_understanding.get("sourceVoice") or ""),
            str(source_understanding.get("signalProductionMode") or ""),
        ]
    )
    bucket = int(sha256(seed.encode("utf-8")).hexdigest()[:8], 16) % 100
    return bucket < percent


def validate_policy(payload: DiscoveryVNextPolicyActivatePayload) -> dict[str, Any]:
    issues: list[dict[str, str]] = []
    if not payload.definition:
        issues.append({"path": "$.definition", "code": "required", "message": "Policy definition must not be empty."})
    if payload.policy_type == "routing" and payload.definition.get("yieldIndependent") is not True:
        issues.append({"path": "$.definition.yieldIndependent", "code": "required", "message": "Routing policy must be yield-independent."})
    if payload.policy_type == "probe" and int(payload.definition.get("maxBrowserRequests") or 0) > 0 and not payload.definition.get("browserProbeExplicitlyAllowed"):
        issues.append({"path": "$.definition.maxBrowserRequests", "code": "browser_escalation_not_allowed", "message": "Browser probes require an explicit policy flag."})
    return {"policyValid": not issues, "errors": issues}


def activate_policy(payload: DiscoveryVNextPolicyActivatePayload) -> dict[str, Any]:
    validation = validate_policy(payload)
    if not validation["policyValid"]:
        raise HTTPException(status_code=422, detail=validation)
    query_one(
        """
        update discovery_policies
        set status = 'archived'
        where policy_name = %s
          and policy_type = %s
          and status = 'active'
        returning policy_id
        """,
        (payload.policy_name, payload.policy_type),
    )
    row = query_one(
        """
        insert into discovery_policies (
          policy_name,
          policy_version,
          policy_type,
          status,
          definition_json,
          created_by,
          activated_at
        )
        values (%s, %s, %s, 'active', %s, %s, now())
        on conflict (policy_name, policy_version)
        do update set
          policy_type = excluded.policy_type,
          status = 'active',
          definition_json = excluded.definition_json,
          created_by = excluded.created_by,
          activated_at = now()
        returning *
        """,
        (
            payload.policy_name,
            payload.policy_version,
            payload.policy_type,
            Json(payload.definition),
            payload.created_by,
        ),
    )
    return row or {}


def get_required_active_policy(policy_name: str) -> dict[str, Any]:
    row = query_one(
        """
        select *
        from discovery_policies
        where policy_name = %s
          and status = 'active'
        order by activated_at desc nulls last, created_at desc
        limit 1
        """,
        (policy_name,),
    )
    if not row:
        raise HTTPException(status_code=503, detail=f"Required Discovery vNext policy is missing: {policy_name}.")
    return row


from __future__ import annotations

from typing import Any

from fastapi import HTTPException
from psycopg.types.json import Json

from signalops.api.database import query_all, query_one
from signalops.api.discovery_vnext.artifacts import create_artifact
from signalops.api.discovery_vnext.common import artifact_payload, uuid_or_none as _uuid_or_none
from signalops.api.discovery_vnext.models import (
    DiscoveryVNextRollbackPreparePayload,
    DiscoveryVNextRoutingApplyPayload,
    DiscoveryVNextSourceInventoryActionPayload,
    DiscoveryVNextSourceInventoryExplainPayload,
    DiscoveryVNextSourceInventoryResolveScopesPayload,
)
from signalops.api.discovery_vnext.orchestration_helpers import looks_like_document_url, reresolve_reason_code
from signalops.api.discovery_vnext.policy import _sample_review_required, resolve_required_policy_payload
from signalops.api.discovery_vnext.repository import get_vnext_record
from signalops.api.discovery_vnext.rollback import prepare_rollback
from signalops.api.discovery_vnext.source_inventory import _inventory_state_for_decision, source_identity_key
from signalops.api.discovery_vnext.source_sync import insert_source_sync_event
from signalops.workers.discovery_vnext_routing import route_source_understanding
from signalops.workers.discovery_vnext_scope_resolution import resolve_source_scope

def apply_routing_decision(payload: DiscoveryVNextRoutingApplyPayload) -> dict[str, Any]:
    source_understanding = dict(payload.source_understanding)
    source_understanding.setdefault("candidateId", payload.candidate_id)
    source_understanding.setdefault("sourceUrl", payload.canonical_url)
    source_understanding.setdefault("yieldIndependent", True)

    source_artifact = create_artifact(
        "SourceUnderstanding",
        source_understanding,
        vnext_run_id=payload.vnext_run_id or payload.run_id,
        interest_id=payload.interest_id,
        candidate_id=payload.candidate_id,
        parent_artifact_ids=payload.parent_artifact_ids,
        created_by=payload.created_by,
    )
    if source_artifact.get("status") == "rejected":
        return {
            "sourceUnderstandingArtifact": source_artifact,
            "routingDecisionArtifact": None,
            "sourceInventory": None,
            "adapterBacklogItem": None,
        }

    routing_decision = route_source_understanding(
        {
            **source_understanding,
            "artifactId": str(source_artifact.get("artifact_id") or source_artifact.get("artifactId") or ""),
        },
        policy=resolve_required_policy_payload(payload.policy, "discovery-routing"),
        provider_type=payload.provider_type,
        access_pattern=payload.access_pattern,
    )
    sample_review_required = _sample_review_required(routing_decision, source_understanding, payload.policy)
    if sample_review_required:
        routing_decision = {
            **routing_decision,
            "sampleReviewRequired": True,
            "sampleReviewReason": "policy_sample_review_for_auto_routed_source",
        }
    routing_artifact = create_artifact(
        "RoutingDecision",
        routing_decision,
        vnext_run_id=payload.vnext_run_id or payload.run_id,
        interest_id=payload.interest_id,
        candidate_id=payload.candidate_id,
        parent_artifact_ids=[str(source_artifact.get("artifact_id") or "")],
        policy_version=str(routing_decision.get("policyVersion") or ""),
        created_by=payload.created_by,
        status="applied",
    )
    payload.source_identity_key = source_identity_key(
        canonical_url=payload.canonical_url,
        provider_type=payload.provider_type,
        source_understanding=source_understanding,
    )
    inventory = upsert_source_inventory(
        payload,
        source_artifact_id=str(source_artifact["artifact_id"]),
        routing_artifact_id=str(routing_artifact["artifact_id"]),
        decision=str(routing_decision["decision"]),
    )
    monitoring_state = upsert_monitoring_state(
        source_inventory_id=str(inventory["source_inventory_id"]),
        decision=str(routing_decision["decision"]),
        routing_decision=routing_decision,
    )
    observation = create_source_observation(
        source_inventory_id=str(inventory["source_inventory_id"]),
        observation_kind="risk_signal",
        observation={
            "sourceScopeResolutionArtifactId": source_understanding.get("sourceScopeResolutionArtifactId"),
            "sourceUnderstandingArtifactId": str(source_artifact["artifact_id"]),
            "routingDecisionArtifactId": str(routing_artifact["artifact_id"]),
            "decision": routing_decision["decision"],
            "scoreComponents": routing_decision.get("scoreComponents") or {},
            "sampleReviewRequired": sample_review_required,
            "sampleReviewReason": routing_decision.get("sampleReviewReason"),
        },
    )
    scope_observation = None
    if isinstance(source_understanding.get("sourceScopeResolution"), dict):
        scope_observation = create_source_observation(
            source_inventory_id=str(inventory["source_inventory_id"]),
            observation_kind="scope_resolution",
            observation={
                "sourceScopeResolutionArtifactId": source_understanding.get("sourceScopeResolutionArtifactId"),
                "candidateUrl": source_understanding["sourceScopeResolution"].get("candidateUrl"),
                "resolvedSourceUrl": source_understanding["sourceScopeResolution"].get("resolvedSourceUrl"),
                "sourceScopeType": source_understanding["sourceScopeResolution"].get("sourceScopeType"),
                "sourceScopeConfidence": source_understanding["sourceScopeResolution"].get("sourceScopeConfidence"),
            },
        )
    backlog_item = None
    if routing_decision["decision"] == "adapter_backlog":
        backlog_item = create_adapter_backlog_item(
            payload,
            source_inventory_id=str(inventory["source_inventory_id"]),
            reason=routing_decision,
        )
    rollback_group = None
    if routing_decision["decision"] in {"auto_register_probation", "cheap_watch", "adapter_backlog"}:
        rollback_group = prepare_rollback(
            DiscoveryVNextRollbackPreparePayload(
                sourceInventoryId=str(inventory["source_inventory_id"]),
                reason=f"Rollback prepared for {routing_decision['decision']} routing.",
                createdBy=payload.created_by,
            )
        )
    return {
        "sourceUnderstandingArtifact": source_artifact,
        "routingDecisionArtifact": routing_artifact,
        "sourceInventory": inventory,
        "monitoringState": monitoring_state,
        "sourceObservation": observation,
        "scopeObservation": scope_observation,
        "adapterBacklogItem": backlog_item,
        "rollback": rollback_group,
    }



def upsert_source_inventory(
    payload: DiscoveryVNextRoutingApplyPayload,
    *,
    source_artifact_id: str,
    routing_artifact_id: str,
    decision: str,
) -> dict[str, Any]:
    inventory_state = _inventory_state_for_decision(decision)
    row = query_one(
        """
        insert into source_inventory (
          canonical_domain,
          canonical_url,
          source_identity_key,
          current_state,
          current_provider_type,
          latest_source_scope_resolution_artifact_id,
          latest_source_understanding_artifact_id,
          latest_routing_decision_artifact_id,
          seed_item_url,
          resolved_source_url,
          source_scope_type,
          source_scope_confidence,
          monitoring_entry_urls_json,
          item_extraction_hints_json,
          source_voice,
          artifact_freshness_kind,
          signal_production_mode,
          source_role_confidence,
          inventory_reason,
          monitoring_policy_json,
          risk_json,
          tags
        )
        values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        on conflict (source_identity_key)
        do update set
          canonical_domain = excluded.canonical_domain,
          canonical_url = excluded.canonical_url,
          current_state = excluded.current_state,
          current_provider_type = excluded.current_provider_type,
          latest_source_scope_resolution_artifact_id = excluded.latest_source_scope_resolution_artifact_id,
          latest_source_understanding_artifact_id = excluded.latest_source_understanding_artifact_id,
          latest_routing_decision_artifact_id = excluded.latest_routing_decision_artifact_id,
          seed_item_url = excluded.seed_item_url,
          resolved_source_url = excluded.resolved_source_url,
          source_scope_type = excluded.source_scope_type,
          source_scope_confidence = excluded.source_scope_confidence,
          monitoring_entry_urls_json = excluded.monitoring_entry_urls_json,
          item_extraction_hints_json = excluded.item_extraction_hints_json,
          source_voice = excluded.source_voice,
          artifact_freshness_kind = excluded.artifact_freshness_kind,
          signal_production_mode = excluded.signal_production_mode,
          source_role_confidence = excluded.source_role_confidence,
          inventory_reason = excluded.inventory_reason,
          monitoring_policy_json = excluded.monitoring_policy_json,
          risk_json = excluded.risk_json,
          tags = (
            select array(
              select distinct tag
              from unnest(source_inventory.tags || excluded.tags) as tag
            )
          ),
          updated_at = now()
        returning *
        """,
        (
            payload.canonical_domain,
            payload.canonical_url,
            payload.source_identity_key,
            inventory_state,
            payload.provider_type,
            _uuid_or_none(payload.source_understanding.get("sourceScopeResolutionArtifactId")),
            source_artifact_id,
            routing_artifact_id,
            payload.source_understanding.get("seedItemUrl"),
            payload.source_understanding.get("sourceUrl"),
            payload.source_understanding.get("sourceScopeType"),
            payload.source_understanding.get("sourceScopeResolution", {}).get("sourceScopeConfidence")
            if isinstance(payload.source_understanding.get("sourceScopeResolution"), dict)
            else None,
            Json(
                payload.source_understanding.get("sourceScopeResolution", {}).get("monitoringEntryUrls")
                if isinstance(payload.source_understanding.get("sourceScopeResolution"), dict)
                else []
            ),
            Json(
                payload.source_understanding.get("sourceScopeResolution", {}).get("itemExtractionHints")
                if isinstance(payload.source_understanding.get("sourceScopeResolution"), dict)
                else {}
            ),
            payload.source_understanding.get("sourceVoice"),
            payload.source_understanding.get("artifactFreshnessKind"),
            payload.source_understanding.get("signalProductionMode"),
            payload.source_understanding.get("sourceRoleConfidence"),
            payload.source_understanding.get("reasonToKeep"),
            Json({"accessPattern": payload.access_pattern, "createdBy": payload.created_by}),
            Json(payload.source_understanding.get("risk") or {}),
            ["discovery-vnext", inventory_state, payload.provider_type],
        ),
    )
    return row or {}


def create_adapter_backlog_item(
    payload: DiscoveryVNextRoutingApplyPayload,
    *,
    source_inventory_id: str,
    reason: dict[str, Any],
) -> dict[str, Any]:
    adapter_need = str(reason.get("adapterNeed") or "")
    if adapter_need not in {"api_key", "custom_adapter", "auth_config", "parser", "browser_support", "unsupported_format"}:
        adapter_need = "auth_config" if payload.access_pattern == "requires_auth" else "custom_adapter"
    row = query_one(
        """
        insert into adapter_backlog (
          source_inventory_id,
          candidate_id,
          adapter_need,
          reason_json,
          priority,
          status
        )
        values (%s, %s, %s, %s, 'normal', 'open')
        returning *
        """,
        (
            source_inventory_id,
            payload.candidate_id,
            adapter_need,
            Json(reason),
        ),
    )
    return row or {}



def upsert_monitoring_state(
    *,
    source_inventory_id: str,
    decision: str,
    routing_decision: dict[str, Any],
) -> dict[str, Any] | None:
    mode = {
        "auto_register_probation": "probation",
        "cheap_watch": "cheap_watch",
        "inventory": "paused",
        "inventory_low_priority": "paused",
        "manual_review": "paused",
        "adapter_backlog": "paused",
        "blocked": "paused",
        "rejected_structural": "paused",
    }.get(decision, "paused")
    interval = 1800 if mode == "probation" else 3600 if mode == "cheap_watch" else None
    row = query_one(
        """
        insert into source_monitoring_state (
          source_inventory_id,
          monitoring_mode,
          effective_poll_interval_seconds,
          next_due_at,
          health_json
        )
        values (%s, %s, %s, case when %s::integer is null then null else now() + (%s::integer || ' seconds')::interval end, %s)
        on conflict (source_inventory_id)
        do update set
          monitoring_mode = excluded.monitoring_mode,
          effective_poll_interval_seconds = excluded.effective_poll_interval_seconds,
          next_due_at = excluded.next_due_at,
          health_json = excluded.health_json,
          updated_at = now()
        returning *
        """,
        (
            source_inventory_id,
            mode,
            interval,
            interval,
            interval,
            Json({"routingDecision": routing_decision.get("decision"), "policyVersion": routing_decision.get("policyVersion")}),
        ),
    )
    return row


def create_source_observation(
    *,
    source_inventory_id: str,
    observation_kind: str,
    observation: dict[str, Any],
) -> dict[str, Any]:
    row = query_one(
        """
        insert into source_observations (
          source_inventory_id,
          observation_kind,
          observation_json
        )
        values (%s, %s, %s)
        returning *
        """,
        (source_inventory_id, observation_kind, Json(observation)),
    )
    return row or {}



def explain_source_inventory(payload: DiscoveryVNextSourceInventoryExplainPayload) -> dict[str, Any]:
    inventory = get_vnext_record("source-inventory", payload.source_inventory_id)
    artifact_ids = [
        str(value)
        for value in (
            inventory.get("latest_source_scope_resolution_artifact_id"),
            inventory.get("latest_source_understanding_artifact_id"),
            inventory.get("latest_routing_decision_artifact_id"),
        )
        if value
    ]
    artifacts = []
    if artifact_ids:
        artifacts = query_all(
            """
            select artifact_id, artifact_type, status, parent_artifact_ids, candidate_id, payload_json, validation_json, created_at
            from discovery_artifacts
            where artifact_id = any(%s::uuid[])
            order by created_at
            """,
            (artifact_ids,),
        )
    observations = query_all(
        """
        select observation_kind, observation_json, observed_at
        from source_observations
        where source_inventory_id = %s
        order by observed_at desc
        limit 50
        """,
        (payload.source_inventory_id,),
    )
    return {
        "sourceInventory": inventory,
        "lineage": {
            "sourceScopeResolutionArtifactId": inventory.get("latest_source_scope_resolution_artifact_id"),
            "sourceUnderstandingArtifactId": inventory.get("latest_source_understanding_artifact_id"),
            "routingDecisionArtifactId": inventory.get("latest_routing_decision_artifact_id"),
            "registeredChannelId": inventory.get("registered_channel_id"),
        },
        "artifacts": artifacts,
        "observations": observations,
    }


def resolve_source_inventory_scopes(payload: DiscoveryVNextSourceInventoryResolveScopesPayload) -> dict[str, Any]:
    rows = _source_inventory_rows_for_resolution(payload.source_inventory_ids, payload.limit)
    previews: list[dict[str, Any]] = []
    applied: list[dict[str, Any]] = []
    for row in rows:
        canonical_url = str(row.get("canonical_url") or row.get("resolved_source_url") or "")
        probe_report = {
            "candidateUrl": canonical_url,
            "accessPattern": "public",
            "technicalObservability": {
                "observable": True,
                "score": 0.35,
                "feedValid": row.get("current_provider_type") == "rss",
                "hasRecurringStructure": row.get("current_state") in {"cheap_watch", "probation_channel", "stable_channel"},
                "providerFailuresAreTelemetryOnly": True,
            },
            "probeCost": {"requestsAttempted": 0, "bounded": True},
            "observations": [],
            "providerFailures": [],
        }
        preview = resolve_source_scope(
            candidate={"canonicalUrl": canonical_url, "canonicalDomain": row.get("canonical_domain")},
            probe_report=probe_report,
        )
        previews.append({"sourceInventoryId": row.get("source_inventory_id"), "preview": preview})
        scope_payload = artifact_payload(preview) or preview.get("payload") or {}
        if payload.apply and scope_payload:
            applied.append(_apply_inventory_scope_metadata(row, scope_payload, payload.created_by))
    destructive_actions = [
        item
        for item in applied
        if isinstance(item, dict) and isinstance(item.get("pausedChannel"), dict)
    ]
    return {
        "status": "applied" if payload.apply else "preview",
        "count": len(previews),
        "previews": previews,
        "applied": applied,
        "destructiveActions": destructive_actions,
        "destructiveConfirmationRequired": False,
    }


def apply_source_inventory_action(payload: DiscoveryVNextSourceInventoryActionPayload) -> dict[str, Any]:
    if payload.action == "re_resolve":
        return resolve_source_inventory_scopes(
            DiscoveryVNextSourceInventoryResolveScopesPayload(
                sourceInventoryIds=[payload.source_inventory_id],
                limit=1,
                apply=True,
                createdBy=payload.created_by,
            )
        )
    if payload.action == "promote_resolved_scope":
        return _update_inventory_state_action(payload, "inventory")
    if payload.action == "demote_to_context":
        return _update_inventory_state_action(payload, "inventory_context")
    if payload.action == "move_to_adapter_backlog":
        return _update_inventory_state_action(payload, "adapter_backlog")
    if payload.action in {"confirm_scope", "reject_scope"}:
        return _confirm_inventory_scope_action(payload)
    raise HTTPException(status_code=422, detail="Unsupported source inventory action.")



def _source_inventory_rows_for_resolution(source_inventory_ids: list[str], limit: int) -> list[dict[str, Any]]:
    ids = [str(item) for item in source_inventory_ids if str(item).strip()]
    if ids:
        return query_all(
            """
            select *
            from source_inventory
            where source_inventory_id::text = any(%s::text[])
            order by updated_at desc
            limit %s
            """,
            (ids, limit),
        )
    return query_all(
        """
        select *
        from source_inventory
        where current_state in ('inventory', 'inventory_context', 'cheap_watch', 'probation_channel', 'manual_review', 'adapter_backlog')
        order by updated_at desc
        limit %s
        """,
        (limit,),
    )


def _apply_inventory_scope_metadata(row: dict[str, Any], scope_payload: dict[str, Any], created_by: str) -> dict[str, Any]:
    scope_type = str(scope_payload.get("sourceScopeType") or "unknown")
    current_state = str(row.get("current_state") or "inventory")
    next_state = {
        "single_item": "inventory_context",
        "context_page": "inventory_context",
        "document_collection": "adapter_backlog",
        "api_endpoint": "adapter_backlog",
        "search_endpoint": "adapter_backlog",
        "blocked_or_unusable": "blocked",
        "unknown": "manual_review",
    }.get(scope_type, current_state)
    should_pause_projection = bool(row.get("registered_channel_id")) and (
        scope_type in {"single_item", "context_page", "blocked_or_unusable"}
        or looks_like_document_url(str(row.get("canonical_url") or row.get("resolved_source_url") or ""))
    )
    rollback_group = None
    paused_channel = None
    if should_pause_projection:
        rollback_group = prepare_rollback(
            DiscoveryVNextRollbackPreparePayload(
                sourceInventoryId=str(row["source_inventory_id"]),
                reason=f"Auto-pausing forbidden Discovery projection after scope re-resolution: {scope_type}.",
                createdBy=created_by,
            )
        )
        paused_channel = query_one(
            """
            update source_channels
            set is_active = false,
                updated_at = now()
            where channel_id = %s
              and is_active = true
            returning channel_id, is_active
            """,
            (row.get("registered_channel_id"),),
        )
        if paused_channel:
            insert_source_sync_event(str(paused_channel["channel_id"]))
    updated = query_one(
        """
        update source_inventory
        set current_state = %s,
            seed_item_url = %s,
            resolved_source_url = %s,
            source_scope_type = %s,
            source_scope_confidence = %s,
            monitoring_entry_urls_json = %s,
            item_extraction_hints_json = %s,
            scope_confirmation_json = jsonb_build_object('mode', 'maintenance_re_resolution', 'createdBy', %s::text, 'appliedAt', now()),
            updated_at = now()
        where source_inventory_id = %s
        returning *
        """,
        (
            next_state,
            scope_payload.get("seedItemUrl"),
            scope_payload.get("resolvedSourceUrl"),
            scope_type,
            scope_payload.get("sourceScopeConfidence"),
            Json(scope_payload.get("monitoringEntryUrls") or []),
            Json(scope_payload.get("itemExtractionHints") or {}),
            created_by,
            row.get("source_inventory_id"),
        ),
    )
    if updated:
        create_source_observation(
            source_inventory_id=str(updated["source_inventory_id"]),
            observation_kind="scope_resolution",
            observation={
                "mode": "maintenance_re_resolution",
                "reasonCode": reresolve_reason_code(scope_type, should_pause_projection),
                "beforeState": {
                    "currentState": current_state,
                    "registeredChannelId": str(row.get("registered_channel_id") or "") or None,
                    "canonicalUrl": row.get("canonical_url"),
                    "resolvedSourceUrl": row.get("resolved_source_url"),
                    "sourceScopeType": row.get("source_scope_type"),
                },
                "afterState": {
                    "currentState": next_state,
                    "registeredChannelId": str(updated.get("registered_channel_id") or "") or None,
                    "resolvedSourceUrl": scope_payload.get("resolvedSourceUrl"),
                    "sourceScopeType": scope_type,
                    "pausedChannel": paused_channel,
                },
                "rollbackGroupId": (rollback_group or {}).get("rollbackGroup", {}).get("rollback_group_id"),
                "candidateUrl": scope_payload.get("candidateUrl"),
                "resolvedSourceUrl": scope_payload.get("resolvedSourceUrl"),
                "sourceScopeType": scope_type,
                "sourceScopeConfidence": scope_payload.get("sourceScopeConfidence"),
            },
        )
    return {
        "sourceInventory": updated or {},
        "pausedChannel": paused_channel,
        "rollback": rollback_group,
        "reasonCode": reresolve_reason_code(scope_type, should_pause_projection),
    }


def _update_inventory_state_action(
    payload: DiscoveryVNextSourceInventoryActionPayload,
    current_state: str,
) -> dict[str, Any]:
    inventory = query_one(
        """
        update source_inventory
        set current_state = %s,
            scope_confirmation_json = coalesce(scope_confirmation_json, '{}'::jsonb)
              || jsonb_build_object('lastAction', %s::text, 'reason', %s::text, 'createdBy', %s::text, 'appliedAt', now()),
            updated_at = now()
        where source_inventory_id = %s
        returning *
        """,
        (
            current_state,
            payload.action,
            payload.reason,
            payload.created_by,
            payload.source_inventory_id,
        ),
    )
    if not inventory:
        raise HTTPException(status_code=404, detail="Source inventory record was not found.")
    observation = create_source_observation(
        source_inventory_id=str(inventory["source_inventory_id"]),
        observation_kind="scope_resolution",
        observation={
            "mode": "operator_action",
            "action": payload.action,
            "reason": payload.reason,
            "createdBy": payload.created_by,
            "currentState": current_state,
        },
    )
    return {
        "sourceInventory": inventory,
        "sourceObservation": observation,
        "destructiveConfirmationRequired": False,
    }


def _confirm_inventory_scope_action(payload: DiscoveryVNextSourceInventoryActionPayload) -> dict[str, Any]:
    confirmation = "confirmed" if payload.action == "confirm_scope" else "rejected"
    inventory = query_one(
        """
        update source_inventory
        set scope_confirmation_json = coalesce(scope_confirmation_json, '{}'::jsonb)
              || jsonb_build_object('scopeStatus', %s::text, 'reason', %s::text, 'createdBy', %s::text, 'appliedAt', now()),
            updated_at = now()
        where source_inventory_id = %s
        returning *
        """,
        (
            confirmation,
            payload.reason,
            payload.created_by,
            payload.source_inventory_id,
        ),
    )
    if not inventory:
        raise HTTPException(status_code=404, detail="Source inventory record was not found.")
    observation = create_source_observation(
        source_inventory_id=str(inventory["source_inventory_id"]),
        observation_kind="scope_resolution",
        observation={
            "mode": "operator_confirmation",
            "scopeStatus": confirmation,
            "reason": payload.reason,
            "createdBy": payload.created_by,
        },
    )
    return {
        "sourceInventory": inventory,
        "sourceObservation": observation,
        "destructiveConfirmationRequired": False,
    }

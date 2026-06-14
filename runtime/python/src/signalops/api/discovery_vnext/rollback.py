from __future__ import annotations

from typing import Any

from fastapi import HTTPException
from psycopg.types.json import Json

from signalops.api.database import query_one
from signalops.api.discovery_vnext.models import (
    DiscoveryVNextRollbackApplyPayload,
    DiscoveryVNextRollbackPreparePayload,
)
from signalops.api.discovery_vnext.providers import _json_safe
from signalops.api.discovery_vnext.repository import get_vnext_record
from signalops.api.discovery_vnext.source_sync import insert_source_sync_event

def prepare_rollback(payload: DiscoveryVNextRollbackPreparePayload) -> dict[str, Any]:
    inventory = get_vnext_record("source-inventory", payload.source_inventory_id)
    prepared = {
        "sourceInventoryId": payload.source_inventory_id,
        "registeredChannelId": str(inventory["registered_channel_id"]) if inventory.get("registered_channel_id") else None,
        "currentState": inventory.get("current_state"),
        "vnextOwned": "discovery-vnext" in (inventory.get("tags") or []),
    }
    group = query_one(
        """
        insert into discovery_rollback_groups (
          source_inventory_id,
          registered_channel_id,
          reason,
          status,
          prepared_json,
          created_by
        )
        values (%s, %s, %s, 'prepared', %s, %s)
        returning *
        """,
        (
            payload.source_inventory_id,
            inventory.get("registered_channel_id"),
            payload.reason,
            Json(prepared),
            payload.created_by,
        ),
    )
    actions = [
        _create_rollback_action(
            str(group["rollback_group_id"]),
            "restore_inventory_state",
            "source_inventory",
            payload.source_inventory_id,
            {"targetState": "inventory", "previousState": inventory.get("current_state")},
        )
    ]
    if inventory.get("registered_channel_id"):
        actions.append(
            _create_rollback_action(
                str(group["rollback_group_id"]),
                "pause_channel",
                "source_channel",
                str(inventory["registered_channel_id"]),
                {"isActive": False},
            )
        )
        actions.append(
            _create_rollback_action(
                str(group["rollback_group_id"]),
                "emit_sync",
                "outbox_event",
                None,
                {"eventType": "source.channel.sync.requested"},
            )
        )
    return {"rollbackGroup": group, "rollbackActions": actions}


def apply_rollback(payload: DiscoveryVNextRollbackApplyPayload) -> dict[str, Any]:
    if not payload.confirm:
        raise HTTPException(status_code=422, detail="Rollback requires confirm=true.")
    group = get_vnext_record("rollback-groups", payload.rollback_group_id)
    if group.get("status") != "prepared":
        raise HTTPException(status_code=409, detail="Rollback group is not prepared.")
    channel_id = group.get("registered_channel_id")
    paused_channel = None
    if channel_id:
        paused_channel = query_one(
            """
            update source_channels
            set is_active = false,
                updated_at = now()
            where channel_id = %s
              and config_json->'discovery'->>'version' = 'vnext-1'
            returning channel_id, is_active
            """,
            (channel_id,),
        )
        if not paused_channel:
            raise HTTPException(status_code=409, detail="Rollback refused: channel is not vNext-owned.")
        insert_source_sync_event(str(channel_id))
    inventory = query_one(
        """
        update source_inventory
        set current_state = 'inventory',
            registered_channel_id = null,
            updated_at = now()
        where source_inventory_id = %s
        returning *
        """,
        (group.get("source_inventory_id"),),
    )
    query_one(
        """
        update discovery_rollback_actions
        set status = 'applied',
            applied_at = now(),
            result_json = %s
        where rollback_group_id = %s
        returning rollback_action_id
        """,
        (Json({"appliedBy": payload.applied_by}), payload.rollback_group_id),
    )
    updated_group = query_one(
        """
        update discovery_rollback_groups
        set status = 'applied',
            applied_by = %s,
            applied_at = now(),
            result_json = %s
        where rollback_group_id = %s
        returning *
        """,
        (
            payload.applied_by,
            Json(_json_safe({"pausedChannel": paused_channel, "sourceInventory": inventory})),
            payload.rollback_group_id,
        ),
    )
    return {"rollbackGroup": updated_group, "pausedChannel": paused_channel, "sourceInventory": inventory}



def _create_rollback_action(
    rollback_group_id: str,
    action_type: str,
    target_type: str,
    target_id: str | None,
    action: dict[str, Any],
) -> dict[str, Any]:
    row = query_one(
        """
        insert into discovery_rollback_actions (
          rollback_group_id,
          action_type,
          target_type,
          target_id,
          action_json
        )
        values (%s, %s, %s, %s, %s)
        returning *
        """,
        (rollback_group_id, action_type, target_type, target_id, Json(action)),
    )
    return row or {}



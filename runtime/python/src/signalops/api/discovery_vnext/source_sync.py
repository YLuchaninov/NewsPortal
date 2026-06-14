from __future__ import annotations

from typing import Any

from psycopg.types.json import Json

from signalops.api.database import query_one


def insert_source_sync_event(channel_id: str) -> dict[str, Any]:
    row = query_one(
        """
        insert into outbox_events (
          event_id,
          event_type,
          aggregate_type,
          aggregate_id,
          payload_json
        )
        values (gen_random_uuid(), 'source.channel.sync.requested', 'source_channel', %s, %s)
        returning *
        """,
        (channel_id, Json({"channelId": channel_id, "source": "discovery_vnext_rollback"})),
    )
    return row or {}



from __future__ import annotations

import json
import uuid
import hashlib
from collections.abc import Mapping
from typing import Any

import psycopg
from psycopg.types.json import Json

from .runtime_json import make_json_safe
from .runtime_values import coerce_bool
from .worker_queues import PROCESSING_STATE_ORDER


def suppress_downstream_outbox(job: Any) -> bool:
    job_data = job.data if isinstance(getattr(job, "data", None), Mapping) else {}
    return coerce_bool(job_data.get("suppressDownstreamOutbox")) or coerce_bool(
        job_data.get("sequenceRuntime")
    )


def advance_processing_state(current_state: str | None, target_state: str) -> str:
    current_rank = PROCESSING_STATE_ORDER.get(current_state or "raw", 0)
    target_rank = PROCESSING_STATE_ORDER[target_state]
    return target_state if target_rank > current_rank else str(current_state or target_state)


def compute_content_hash(value: Any) -> str:
    safe_value = make_json_safe(value)
    payload = json.dumps(
        safe_value,
        ensure_ascii=True,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


async def is_event_processed(
    cursor: psycopg.AsyncCursor[Any],
    consumer_name: str,
    event_id: str,
) -> bool:
    await cursor.execute(
        """
        select 1
        from inbox_processed_events
        where consumer_name = %s and event_id = %s
        """,
        (consumer_name, event_id),
    )
    return await cursor.fetchone() is not None


async def record_processed_event(
    cursor: psycopg.AsyncCursor[Any],
    consumer_name: str,
    event_id: str,
) -> None:
    await cursor.execute(
        """
        insert into inbox_processed_events (consumer_name, event_id)
        values (%s, %s)
        on conflict (consumer_name, event_id) do nothing
        """,
        (consumer_name, event_id),
    )


async def insert_outbox_event(
    cursor: psycopg.AsyncCursor[Any],
    event_type: str,
    aggregate_type: str,
    aggregate_id: uuid.UUID,
    payload: dict[str, Any],
) -> None:
    await cursor.execute(
        """
        insert into outbox_events (
          event_id,
          event_type,
          aggregate_type,
          aggregate_id,
          payload_json
        )
        values (%s, %s, %s, %s, %s::jsonb)
        """,
        (
            str(uuid.uuid4()),
            event_type,
            aggregate_type,
            aggregate_id,
            Json(make_json_safe(payload)),
        ),
    )


async def ensure_published_outbox_event(
    *,
    event_id: str,
    event_type: str,
    aggregate_type: str,
    aggregate_id: str,
    payload: dict[str, Any],
) -> None:
    from .runtime_db import open_connection

    async with await open_connection() as connection:
        async with connection.transaction():
            async with connection.cursor() as cursor:
                await cursor.execute(
                    """
                    insert into outbox_events (
                      event_id,
                      event_type,
                      aggregate_type,
                      aggregate_id,
                      payload_json,
                      status,
                      published_at,
                      attempt_count,
                      error_message
                    )
                    values (%s, %s, %s, %s, %s::jsonb, 'published', now(), 1, null)
                    on conflict (event_id) do update
                    set
                      event_type = excluded.event_type,
                      aggregate_type = excluded.aggregate_type,
                      aggregate_id = excluded.aggregate_id,
                      payload_json = excluded.payload_json,
                      status = 'published',
                      published_at = now(),
                      attempt_count = greatest(outbox_events.attempt_count, 1),
                      error_message = null
                    """,
                    (
                        event_id,
                        event_type,
                        aggregate_type,
                        aggregate_id,
                        Json(make_json_safe(payload)),
                    ),
                )

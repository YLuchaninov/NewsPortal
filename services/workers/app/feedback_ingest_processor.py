from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

from psycopg.types.json import Json

from .worker_queues import FEEDBACK_INGEST_CONSUMER


@dataclass(frozen=True)
class FeedbackIngestProcessorDependencies:
    open_connection: Callable[[], Awaitable[Any]]
    is_event_processed: Callable[..., Awaitable[bool]]
    record_processed_event: Callable[..., Awaitable[None]]


def build_feedback_ingest_processor_dependencies() -> FeedbackIngestProcessorDependencies:
    from . import main as legacy_main

    return FeedbackIngestProcessorDependencies(
        open_connection=legacy_main.open_connection,
        is_event_processed=legacy_main.is_event_processed,
        record_processed_event=legacy_main.record_processed_event,
    )


async def process_feedback_ingest_with_dependencies(
    job: Any,
    _job_token: str,
    deps: FeedbackIngestProcessorDependencies,
) -> dict[str, Any]:
    event_id = str(job.data.get("eventId"))
    notification_id = str(job.data.get("notificationId"))
    doc_id = str(job.data.get("docId"))
    user_id = str(job.data.get("userId"))

    if not event_id or event_id == "None" or not notification_id or not doc_id or not user_id:
        raise ValueError("Feedback ingest worker expected notificationId, docId, and userId.")

    connection = await deps.open_connection()
    async with connection:
        async with connection.transaction():
            async with connection.cursor() as cursor:
                if await deps.is_event_processed(
                    cursor,
                    FEEDBACK_INGEST_CONSUMER,
                    event_id,
                ):
                    return {"status": "duplicate-event", "notificationId": notification_id}

                await cursor.execute(
                    """
                    select count(*)::int as helpful_count
                    from notification_feedback
                    where notification_id = %s and feedback_value = 'helpful'
                    """,
                    (notification_id,),
                )
                helpful_row = await cursor.fetchone()
                await cursor.execute(
                    """
                    update notification_log
                    set
                      delivery_payload_json = delivery_payload_json || %s::jsonb,
                      updated_at = now()
                    where notification_id = %s
                    """,
                    (
                        Json(
                            {
                                "feedback": {
                                    "helpfulCount": int(helpful_row["helpful_count"] or 0)
                                }
                            }
                        ),
                        notification_id,
                    ),
                )
                await deps.record_processed_event(
                    cursor,
                    FEEDBACK_INGEST_CONSUMER,
                    event_id,
                )

    return {
        "status": "processed",
        "notificationId": notification_id,
        "docId": doc_id,
        "userId": user_id,
    }


async def process_feedback_ingest(job: Any, job_token: str) -> dict[str, Any]:
    return await process_feedback_ingest_with_dependencies(
        job,
        job_token,
        build_feedback_ingest_processor_dependencies(),
    )

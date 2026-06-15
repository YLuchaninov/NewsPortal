from __future__ import annotations

import uuid
from typing import Any

from psycopg.types.json import Json

from .reindex_runtime_jobs import build_reindex_cancellation_key
from .runtime_db import open_connection
from .runtime_json import make_json_safe
from .worker_events import insert_outbox_event
from .worker_queues import INTEREST_CENTROIDS_INDEX_NAME, REINDEX_REQUESTED_EVENT


def build_interest_auto_repair_job_options(
    *,
    user_id: str,
    interest_id: str,
    source_version: int,
) -> dict[str, Any]:
    return {
        "batchSize": 100,
        "retroNotifications": "skip",
        "replayExistingSignalCandidates": True,
        "systemFeedOnly": True,
        "userId": user_id,
        "interestId": interest_id,
        "sourceVersion": source_version,
        "requestSource": "interest_compile",
    }


async def queue_interest_auto_repair_job(
    *,
    user_id: str,
    interest_id: str,
    source_version: int,
) -> dict[str, Any]:
    reindex_job_id = uuid.uuid4()
    options_json = build_interest_auto_repair_job_options(
        user_id=user_id,
        interest_id=interest_id,
        source_version=source_version,
    )
    cancellation_key = build_reindex_cancellation_key(
        index_name=INTEREST_CENTROIDS_INDEX_NAME,
        job_kind="repair",
        options_json=options_json,
    )

    async with await open_connection() as connection:
        async with connection.transaction():
            async with connection.cursor() as cursor:
                await cursor.execute(
                    "select pg_advisory_xact_lock(hashtext(%s))",
                    (cancellation_key,),
                )
                await cursor.execute(
                    """
                    insert into reindex_jobs (
                      reindex_job_id,
                      index_name,
                      job_kind,
                      options_json,
                      requested_by_user_id,
                      status,
                      cancellation_key
                    )
                    values (%s, %s, 'repair', %s::jsonb, %s, 'queued', %s)
                    """,
                    (
                        reindex_job_id,
                        INTEREST_CENTROIDS_INDEX_NAME,
                        Json(make_json_safe(options_json)),
                        user_id,
                        cancellation_key,
                    ),
                )
                await cursor.execute(
                    """
                    update reindex_jobs
                    set
                      status = 'cancelled',
                      finished_at = coalesce(finished_at, now()),
                      error_text = 'Cancelled because a newer same-lane reindex job was queued.',
                      superseded_by_reindex_job_id = %s,
                      updated_at = now()
                    where cancellation_key = %s
                      and reindex_job_id <> %s
                      and status = 'queued'
                    """,
                    (reindex_job_id, cancellation_key, reindex_job_id),
                )
                await cursor.execute(
                    """
                    update reindex_jobs
                    set
                      status = 'cancel_requested',
                      error_text = 'Cancellation requested because a newer same-lane reindex job was queued.',
                      superseded_by_reindex_job_id = %s,
                      updated_at = now()
                    where cancellation_key = %s
                      and reindex_job_id <> %s
                      and status in ('running', 'cancel_requested')
                    """,
                    (reindex_job_id, cancellation_key, reindex_job_id),
                )
                await insert_outbox_event(
                    cursor,
                    REINDEX_REQUESTED_EVENT,
                    "reindex_job",
                    reindex_job_id,
                    {
                        "reindexJobId": str(reindex_job_id),
                        "indexName": INTEREST_CENTROIDS_INDEX_NAME,
                        "jobKind": "repair",
                        "version": 1,
                    },
                )

    return {
        "status": "queued",
        "reindexJobId": str(reindex_job_id),
        "jobKind": "repair",
        "options": options_json,
        "cancellationKey": cancellation_key,
    }

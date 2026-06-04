from __future__ import annotations

import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

import psycopg

from .signal_candidate_repository import fetch_signal_candidate_for_update as default_fetch_signal_candidate_for_update
from .runtime_json import coerce_json_object
from .worker_events import (
    advance_processing_state,
    is_event_processed,
    record_processed_event,
)
from .worker_queues import NOTIFY_CONSUMER


@dataclass(frozen=True)
class SignalCandidateNotifyProcessorDependencies:
    open_connection: Callable[[], Awaitable[Any]]
    fetch_signal_candidate_for_update: Callable[
        [psycopg.AsyncCursor[Any], str],
        Awaitable[dict[str, Any]],
    ]
    fetch_recent_notification_history: Callable[..., Awaitable[list[dict[str, Any]]]]
    fetch_user_notification_preferences: Callable[..., Awaitable[dict[str, Any]]]
    fetch_user_notification_channels: Callable[..., Awaitable[list[dict[str, Any]]]]
    is_channel_enabled_by_preferences: Callable[[str, Any], bool]
    insert_notification_suppression: Callable[..., Awaitable[None]]
    insert_notification_log_row: Callable[..., Awaitable[uuid.UUID]]
    dispatch_channel_message: Callable[..., Any]
    update_notification_delivery_status: Callable[..., Awaitable[None]]


def build_signal_candidate_notify_processor_dependencies(
    *,
    open_connection: Callable[[], Awaitable[Any]] | None = None,
    fetch_signal_candidate_for_update: Callable[
        [psycopg.AsyncCursor[Any], str],
        Awaitable[dict[str, Any]],
    ] = default_fetch_signal_candidate_for_update,
    fetch_recent_notification_history: Callable[..., Awaitable[list[dict[str, Any]]]]
    | None = None,
    fetch_user_notification_preferences: Callable[..., Awaitable[dict[str, Any]]] | None = None,
    fetch_user_notification_channels: Callable[..., Awaitable[list[dict[str, Any]]]]
    | None = None,
    is_channel_enabled_by_preferences: Callable[[str, Any], bool]
    | None = None,
    insert_notification_suppression: Callable[..., Awaitable[None]] | None = None,
    insert_notification_log_row: Callable[..., Awaitable[uuid.UUID]]
    | None = None,
    dispatch_channel_message: Callable[..., Any] | None = None,
    update_notification_delivery_status: Callable[..., Awaitable[None]] | None = None,
) -> SignalCandidateNotifyProcessorDependencies:
    if open_connection is None:
        from .runtime_db import open_connection as default_open_connection

        open_connection = default_open_connection
    if dispatch_channel_message is None:
        from .delivery import dispatch_channel_message as default_dispatch_channel_message

        dispatch_channel_message = default_dispatch_channel_message
    if is_channel_enabled_by_preferences is None:
        from .notification_preferences import (
            is_channel_enabled_by_preferences as default_is_channel_enabled_by_preferences,
        )

        is_channel_enabled_by_preferences = default_is_channel_enabled_by_preferences
    if (
        fetch_recent_notification_history is None
        or fetch_user_notification_preferences is None
        or fetch_user_notification_channels is None
        or insert_notification_suppression is None
        or insert_notification_log_row is None
        or update_notification_delivery_status is None
    ):
        from .notification_runtime import (
            fetch_recent_notification_history as default_fetch_recent_notification_history,
            fetch_user_notification_channels as default_fetch_user_notification_channels,
            fetch_user_notification_preferences as default_fetch_user_notification_preferences,
            insert_notification_log_row as default_insert_notification_log_row,
            insert_notification_suppression as default_insert_notification_suppression,
            update_notification_delivery_status as default_update_notification_delivery_status,
        )

        if fetch_recent_notification_history is None:
            fetch_recent_notification_history = default_fetch_recent_notification_history
        if fetch_user_notification_preferences is None:
            fetch_user_notification_preferences = default_fetch_user_notification_preferences
        if fetch_user_notification_channels is None:
            fetch_user_notification_channels = default_fetch_user_notification_channels
        if insert_notification_suppression is None:
            insert_notification_suppression = default_insert_notification_suppression
        if insert_notification_log_row is None:
            insert_notification_log_row = default_insert_notification_log_row
        if update_notification_delivery_status is None:
            update_notification_delivery_status = default_update_notification_delivery_status

    return SignalCandidateNotifyProcessorDependencies(
        open_connection=open_connection,
        fetch_signal_candidate_for_update=fetch_signal_candidate_for_update,
        fetch_recent_notification_history=fetch_recent_notification_history,
        fetch_user_notification_preferences=fetch_user_notification_preferences,
        fetch_user_notification_channels=fetch_user_notification_channels,
        is_channel_enabled_by_preferences=is_channel_enabled_by_preferences,
        insert_notification_suppression=insert_notification_suppression,
        insert_notification_log_row=insert_notification_log_row,
        dispatch_channel_message=dispatch_channel_message,
        update_notification_delivery_status=update_notification_delivery_status,
    )


async def process_notify_with_dependencies(
    job: Any,
    _job_token: str,
    deps: SignalCandidateNotifyProcessorDependencies,
) -> dict[str, Any]:
    event_id = str(job.data.get("eventId"))
    doc_id = str(job.data.get("docId"))

    if not event_id or event_id == "None" or not doc_id or doc_id == "None":
        raise ValueError("Notify worker expected eventId and docId.")

    sent_count = 0
    suppressed_count = 0
    llm_review_count = 0

    connection = await deps.open_connection()
    async with connection:
        async with connection.transaction():
            async with connection.cursor() as cursor:
                if await is_event_processed(cursor, NOTIFY_CONSUMER, event_id):
                    return {"status": "duplicate-event", "docId": doc_id}

                signal_candidate = await deps.fetch_signal_candidate_for_update(cursor, doc_id)
                await cursor.execute(
                    """
                    select
                      interest_match_id,
                      user_id,
                      interest_id,
                      event_cluster_id,
                      score_interest,
                      score_user,
                      decision,
                      explain_json
                    from interest_match_results
                    where doc_id = %s
                    order by user_id, score_user desc, score_interest desc, created_at desc
                    """,
                    (signal_candidate["doc_id"],),
                )
                match_rows = list(await cursor.fetchall())
                best_by_user: dict[str, dict[str, Any]] = {}
                for row in match_rows:
                    user_key = str(row["user_id"])
                    if user_key not in best_by_user:
                        best_by_user[user_key] = row

                for match_row in best_by_user.values():
                    user_id = uuid.UUID(str(match_row["user_id"]))
                    interest_id = uuid.UUID(str(match_row["interest_id"]))
                    cluster_id = match_row.get("event_cluster_id")
                    explain_json = coerce_json_object(match_row.get("explain_json"))
                    major_update = bool(explain_json.get("majorUpdate"))
                    if str(signal_candidate.get("visibility_state") or "visible") == "blocked":
                        await deps.insert_notification_suppression(
                            cursor,
                            user_id=user_id,
                            interest_id=interest_id,
                            notification_id=None,
                            doc_id=signal_candidate["doc_id"],
                            family_id=signal_candidate.get("family_id"),
                            cluster_id=cluster_id,
                            reason="signal_candidate_blocked",
                        )
                        suppressed_count += 1
                        continue

                    history = await deps.fetch_recent_notification_history(
                        cursor,
                        user_id=user_id,
                        interest_id=interest_id,
                        cluster_id=cluster_id,
                        family_id=signal_candidate.get("family_id"),
                    )
                    if (
                        history
                        and not major_update
                        and float(match_row.get("score_interest") or 0.0) < 0.9
                    ):
                        await deps.insert_notification_suppression(
                            cursor,
                            user_id=user_id,
                            interest_id=interest_id,
                            notification_id=None,
                            doc_id=signal_candidate["doc_id"],
                            family_id=signal_candidate.get("family_id"),
                            cluster_id=cluster_id,
                            reason="recent_send_history",
                        )
                        suppressed_count += 1
                        continue

                    if match_row["decision"] == "gray_zone":
                        await deps.insert_notification_suppression(
                            cursor,
                            user_id=user_id,
                            interest_id=interest_id,
                            notification_id=None,
                            doc_id=signal_candidate["doc_id"],
                            family_id=signal_candidate.get("family_id"),
                            cluster_id=cluster_id,
                            reason="interest_gray_zone_llm_disabled",
                        )
                        suppressed_count += 1
                        continue

                    if match_row["decision"] != "notify":
                        continue

                    title = str(signal_candidate.get("title") or "Signal update")
                    body = str(signal_candidate.get("lead") or signal_candidate.get("body") or "")[:500]
                    notification_preferences = await deps.fetch_user_notification_preferences(
                        cursor,
                        user_id,
                    )
                    channels = await deps.fetch_user_notification_channels(cursor, user_id)
                    for channel in channels:
                        channel_type = str(channel["channel_type"])
                        if not deps.is_channel_enabled_by_preferences(
                            channel_type,
                            notification_preferences,
                        ):
                            await deps.insert_notification_suppression(
                                cursor,
                                user_id=user_id,
                                interest_id=interest_id,
                                notification_id=None,
                                doc_id=signal_candidate["doc_id"],
                                family_id=signal_candidate.get("family_id"),
                                cluster_id=cluster_id,
                                reason=f"preference_disabled:{channel_type}",
                            )
                            suppressed_count += 1
                            continue

                        notification_id = await deps.insert_notification_log_row(
                            cursor,
                            user_id=user_id,
                            interest_id=interest_id,
                            doc_id=signal_candidate["doc_id"],
                            cluster_id=cluster_id,
                            channel_type=channel_type,
                            status="queued",
                            title=title,
                            body=body,
                            decision_reason="notify",
                            delivery_payload_json={
                                "interestMatchId": str(match_row["interest_match_id"])
                            },
                        )
                        attempt = deps.dispatch_channel_message(
                            channel_type,
                            coerce_json_object(channel.get("config_json")),
                            title,
                            body,
                        )
                        await deps.update_notification_delivery_status(
                            cursor,
                            notification_id=notification_id,
                            status=attempt.status,
                            delivery_payload_json={
                                "interestMatchId": str(match_row["interest_match_id"]),
                                "detail": attempt.detail,
                            },
                        )
                        if attempt.status == "sent":
                            sent_count += 1
                        else:
                            suppressed_count += 1

                if sent_count > 0:
                    next_state = advance_processing_state(
                        signal_candidate.get("processing_state"),
                        "notified",
                    )
                    await cursor.execute(
                        """
                        update signal_candidates
                        set
                          processing_state = %s,
                          updated_at = now()
                        where doc_id = %s
                        """,
                        (next_state, signal_candidate["doc_id"]),
                    )
                await record_processed_event(cursor, NOTIFY_CONSUMER, event_id)

    return {
        "status": "notified",
        "docId": doc_id,
        "sentCount": sent_count,
        "suppressedCount": suppressed_count,
        "llmReviewCount": llm_review_count,
    }


async def process_notify(job: Any, job_token: str) -> dict[str, Any]:
    return await process_notify_with_dependencies(
        job,
        job_token,
        build_signal_candidate_notify_processor_dependencies(),
    )

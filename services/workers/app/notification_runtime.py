from __future__ import annotations

import uuid
from collections.abc import Mapping, Sequence
from datetime import datetime, timedelta, timezone
from typing import Any

import psycopg
from psycopg.types.json import Json

from .delivery import dispatch_channel_message
from .digests import (
    DigestItem,
    build_digest_subject,
    coerce_digest_cadence,
    coerce_digest_send_hour,
    coerce_digest_send_minute,
    compute_next_digest_run_at,
    render_digest_html,
    render_digest_text,
    validate_timezone_name,
)
from .notification_preferences import normalize_notification_preferences
from .runtime_db import open_connection
from .runtime_json import coerce_text_list, make_json_safe
from .scoring import is_major_update, parse_datetime


async def fetch_recent_notification_history(
    cursor: psycopg.AsyncCursor[Any],
    *,
    user_id: uuid.UUID,
    interest_id: uuid.UUID,
    cluster_id: uuid.UUID | None,
    family_id: uuid.UUID | None,
) -> list[dict[str, Any]]:
    await cursor.execute(
        """
        select
          notification_id,
          status,
          created_at,
          doc_id,
          event_cluster_id,
          interest_id
        from notification_log
        where user_id = %s
          and (
            interest_id = %s
            or (%s::uuid is not null and event_cluster_id = %s::uuid)
            or (%s::uuid is not null and doc_id in (
              select doc_id from articles where family_id = %s::uuid
            ))
          )
          and created_at >= now() - interval '24 hours'
        order by created_at desc
        limit 20
        """,
        (user_id, interest_id, cluster_id, cluster_id, family_id, family_id),
    )
    return list(await cursor.fetchall())


async def compute_novelty_score(
    cursor: psycopg.AsyncCursor[Any],
    *,
    user_id: uuid.UUID,
    interest_id: uuid.UUID,
    cluster_id: uuid.UUID | None,
    family_id: uuid.UUID | None,
    article_features: Mapping[str, Sequence[str]],
) -> tuple[float, bool]:
    history = await fetch_recent_notification_history(
        cursor,
        user_id=user_id,
        interest_id=interest_id,
        cluster_id=cluster_id,
        family_id=family_id,
    )
    if not history:
        return 1.0, False

    if cluster_id is None:
        return 0.0, False

    await cursor.execute(
        """
        select
          ec.top_entities,
          ec.top_places
        from event_clusters ec
        where ec.cluster_id = %s
        """,
        (cluster_id,),
    )
    cluster_row = await cursor.fetchone()
    if cluster_row is None:
        return 0.0, False

    major_update = is_major_update(
        existing_entities=coerce_text_list(cluster_row.get("top_entities")),
        existing_places=coerce_text_list(cluster_row.get("top_places")),
        existing_numbers=[],
        incoming_entities=coerce_text_list(article_features.get("entities")),
        incoming_places=coerce_text_list(article_features.get("places")),
        incoming_numbers=coerce_text_list(article_features.get("numbers")),
    )
    if major_update:
        return 0.4, True
    return 0.0, False


async def fetch_user_notification_channels(
    cursor: psycopg.AsyncCursor[Any],
    user_id: uuid.UUID,
) -> list[dict[str, Any]]:
    await cursor.execute(
        """
        select
          channel_binding_id::text as channel_binding_id,
          channel_type,
          is_enabled,
          config_json,
          verified_at
        from user_notification_channels
        where user_id = %s
          and is_enabled = true
          and channel_type in ('web_push', 'telegram')
        order by channel_type, created_at
        """,
        (user_id,),
    )
    return list(await cursor.fetchall())


async def fetch_user_notification_preferences(
    cursor: psycopg.AsyncCursor[Any],
    user_id: uuid.UUID,
) -> dict[str, bool]:
    await cursor.execute(
        """
        select notification_preferences
        from user_profiles
        where user_id = %s
        limit 1
        """,
        (user_id,),
    )
    row = await cursor.fetchone()
    preferences = row.get("notification_preferences") if row else {}
    return normalize_notification_preferences(preferences if isinstance(preferences, dict) else None)


async def insert_notification_log_row(
    cursor: psycopg.AsyncCursor[Any],
    *,
    user_id: uuid.UUID,
    interest_id: uuid.UUID | None,
    doc_id: uuid.UUID,
    cluster_id: uuid.UUID | None,
    channel_type: str,
    status: str,
    title: str,
    body: str,
    decision_reason: str,
    delivery_payload_json: dict[str, Any],
) -> uuid.UUID:
    await cursor.execute(
        """
        insert into notification_log (
          user_id,
          interest_id,
          doc_id,
          event_cluster_id,
          channel_type,
          status,
          title,
          body,
          decision_reason,
          delivery_payload_json
        )
        values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb)
        returning notification_id
        """,
        (
            user_id,
            interest_id,
            doc_id,
            cluster_id,
            channel_type,
            status,
            title,
            body,
            decision_reason,
            Json(make_json_safe(delivery_payload_json)),
        ),
    )
    row = await cursor.fetchone()
    return row["notification_id"]


async def update_notification_delivery_status(
    cursor: psycopg.AsyncCursor[Any],
    *,
    notification_id: uuid.UUID,
    status: str,
    delivery_payload_json: dict[str, Any],
) -> None:
    await cursor.execute(
        """
        update notification_log
        set
          status = %s,
          delivery_payload_json = %s::jsonb,
          sent_at = case when %s = 'sent' then coalesce(sent_at, now()) else sent_at end,
          updated_at = now()
        where notification_id = %s
        """,
        (
            status,
            Json(make_json_safe(delivery_payload_json)),
            status,
            notification_id,
        ),
    )


async def fetch_user_digest_channel(
    cursor: psycopg.AsyncCursor[Any],
    user_id: uuid.UUID,
) -> dict[str, Any] | None:
    await cursor.execute(
        """
        select
          channel_binding_id::text as channel_binding_id,
          config_json,
          verified_at
        from user_notification_channels
        where user_id = %s
          and channel_type = 'email_digest'
          and is_enabled = true
        order by created_at desc
        limit 1
        """,
        (user_id,),
    )
    return await cursor.fetchone()


async def insert_digest_delivery_log_row(
    cursor: psycopg.AsyncCursor[Any],
    *,
    user_id: uuid.UUID,
    digest_kind: str,
    cadence: str | None,
    status: str,
    recipient_email: str,
    subject: str,
    body_text: str,
    body_html: str,
    metadata_json: dict[str, Any] | None = None,
    error_text: str | None = None,
) -> uuid.UUID:
    await cursor.execute(
        """
        insert into digest_delivery_log (
          user_id,
          digest_kind,
          cadence,
          status,
          recipient_email,
          subject,
          body_text,
          body_html,
          metadata_json,
          error_text
        )
        values (%s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s)
        returning digest_delivery_id
        """,
        (
            user_id,
            digest_kind,
            cadence,
            status,
            recipient_email,
            subject,
            body_text,
            body_html,
            Json(make_json_safe(metadata_json or {})),
            error_text,
        ),
    )
    row = await cursor.fetchone()
    return row["digest_delivery_id"]


async def upsert_digest_delivery_items(
    cursor: psycopg.AsyncCursor[Any],
    *,
    digest_delivery_id: uuid.UUID,
    content_item_ids: Sequence[str],
) -> None:
    for index, content_item_id in enumerate(content_item_ids):
        await cursor.execute(
            """
            insert into digest_delivery_items (
              digest_delivery_id,
              item_position,
              content_item_id
            )
            values (%s, %s, %s)
            on conflict (digest_delivery_id, item_position) do update
            set content_item_id = excluded.content_item_id
            """,
            (digest_delivery_id, index, content_item_id),
        )


async def update_digest_delivery_status(
    cursor: psycopg.AsyncCursor[Any],
    *,
    digest_delivery_id: uuid.UUID,
    status: str,
    error_text: str | None = None,
) -> None:
    await cursor.execute(
        """
        update digest_delivery_log
        set
          status = %s,
          error_text = %s,
          sent_at = case
            when %s = 'sent' then coalesce(sent_at, now())
            else sent_at
          end,
          updated_at = now()
        where digest_delivery_id = %s
        """,
        (status, error_text, status, digest_delivery_id),
    )


async def update_user_digest_settings_runtime_state(
    cursor: psycopg.AsyncCursor[Any],
    *,
    user_id: uuid.UUID,
    next_run_at: datetime | None,
    last_sent_at: datetime | None = None,
    last_delivery_status: str | None = None,
    last_delivery_error: str | None = None,
) -> None:
    await cursor.execute(
        """
        update user_digest_settings
        set
          next_run_at = %s,
          last_sent_at = coalesce(%s, last_sent_at),
          last_delivery_status = %s,
          last_delivery_error = %s,
          updated_at = now()
        where user_id = %s
        """,
        (
            next_run_at,
            last_sent_at,
            last_delivery_status,
            last_delivery_error,
            user_id,
        ),
    )


async def fetch_queued_manual_digest_rows(
    cursor: psycopg.AsyncCursor[Any],
    *,
    limit: int = 10,
) -> list[dict[str, Any]]:
    await cursor.execute(
        """
        select
          digest_delivery_id,
          user_id,
          recipient_email,
          subject,
          body_text,
          body_html
        from digest_delivery_log
        where digest_kind = 'manual_saved'
          and status = 'queued'
        order by requested_at asc
        limit %s
        """,
        (limit,),
    )
    return list(await cursor.fetchall())


async def fetch_due_digest_settings_rows(
    cursor: psycopg.AsyncCursor[Any],
    *,
    limit: int = 10,
) -> list[dict[str, Any]]:
    await cursor.execute(
        """
        select
          uds.user_id,
          uds.is_enabled,
          uds.cadence,
          uds.send_hour,
          uds.send_minute,
          uds.timezone,
          uds.skip_if_empty,
          uds.next_run_at,
          uds.last_sent_at,
          uds.last_delivery_status,
          uds.last_delivery_error
        from user_digest_settings uds
        where uds.is_enabled = true
          and (uds.next_run_at is null or uds.next_run_at <= now())
        order by coalesce(uds.next_run_at, uds.created_at) asc
        limit %s
        """,
        (limit,),
    )
    return list(await cursor.fetchall())


async def fetch_scheduled_digest_items(
    cursor: psycopg.AsyncCursor[Any],
    *,
    user_id: uuid.UUID,
    since_at: datetime | None,
    until_at: datetime,
) -> list[DigestItem]:
    await cursor.execute(
        """
        with ranked_matches as (
          select
            'editorial:' || a.doc_id::text as content_item_id,
            a.title,
            a.url,
            a.lead,
            coalesce(a.extracted_source_name, sc.name) as source_name,
            coalesce(a.published_at, a.ingested_at)::text as published_at,
            row_number() over (
              partition by coalesce(a.canonical_doc_id, a.doc_id)
              order by
                a.published_at desc nulls last,
                a.ingested_at desc,
                a.doc_id
            ) as family_rank
          from interest_match_results imr
          join articles a on a.doc_id = imr.doc_id
          join source_channels sc on sc.channel_id = a.channel_id
          left join final_selection_results fsr on fsr.doc_id = a.doc_id
          left join system_feed_results sfr on sfr.doc_id = a.doc_id
          where imr.user_id = %s
            and imr.decision = 'notify'
            and imr.created_at <= %s
            and (%s::timestamptz is null or imr.created_at > %s::timestamptz)
            and a.visibility_state = 'visible'
            and (
              case
                when fsr.doc_id is not null then coalesce(fsr.is_selected, false)
                else coalesce(sfr.eligible_for_feed, false)
              end
            ) = true
        )
        select
          content_item_id,
          title,
          url,
          lead,
          source_name,
          published_at
        from ranked_matches
        where family_rank = 1
        order by published_at desc nulls last, content_item_id
        """,
        (user_id, until_at, since_at, since_at),
    )
    rows = await cursor.fetchall()
    return [
        DigestItem(
            content_item_id=str(row.get("content_item_id") or ""),
            title=str(row.get("title") or "Untitled article"),
            url=str(row.get("url") or "").strip() or None,
            summary=str(row.get("lead") or "").strip() or None,
            source_name=str(row.get("source_name") or "").strip() or None,
            published_at=str(row.get("published_at") or "").strip() or None,
        )
        for row in rows
        if str(row.get("content_item_id") or "").strip()
    ]


async def process_queued_manual_digests() -> None:
    connection = await open_connection()
    async with connection:
        async with connection.transaction():
            async with connection.cursor() as cursor:
                rows = await fetch_queued_manual_digest_rows(cursor)
                for row in rows:
                    digest_delivery_id = row["digest_delivery_id"]
                    recipient_email = str(row.get("recipient_email") or "").strip()
                    if not recipient_email:
                        await update_digest_delivery_status(
                            cursor,
                            digest_delivery_id=digest_delivery_id,
                            status="failed",
                            error_text="Recipient email is missing.",
                        )
                        continue

                    attempt = dispatch_channel_message(
                        "email_digest",
                        {"email": recipient_email},
                        str(row.get("subject") or "Saved digest"),
                        str(row.get("body_text") or ""),
                        body_html=str(row.get("body_html") or "").strip() or None,
                    )
                    await update_digest_delivery_status(
                        cursor,
                        digest_delivery_id=digest_delivery_id,
                        status=attempt.status,
                        error_text=None if attempt.status == "sent" else attempt.detail,
                    )


async def process_due_scheduled_digests() -> None:
    now = datetime.now(timezone.utc)
    connection = await open_connection()
    async with connection:
        async with connection.transaction():
            async with connection.cursor() as cursor:
                rows = await fetch_due_digest_settings_rows(cursor)
                for row in rows:
                    user_id = row["user_id"]
                    cadence = coerce_digest_cadence(row.get("cadence"))
                    send_hour = coerce_digest_send_hour(row.get("send_hour"))
                    send_minute = coerce_digest_send_minute(row.get("send_minute"))
                    timezone_name = str(row.get("timezone") or "").strip()
                    next_run_at = parse_datetime(row.get("next_run_at"))
                    last_sent_at = parse_datetime(row.get("last_sent_at"))
                    skip_if_empty = bool(row.get("skip_if_empty", True))

                    try:
                        validated_timezone = validate_timezone_name(timezone_name)
                    except ValueError as error:
                        await update_user_digest_settings_runtime_state(
                            cursor,
                            user_id=user_id,
                            next_run_at=None,
                            last_delivery_status="failed",
                            last_delivery_error=str(error),
                        )
                        continue

                    if next_run_at is None:
                        initialized_next_run = compute_next_digest_run_at(
                            now=now,
                            cadence=cadence,
                            timezone_name=validated_timezone,
                            send_hour=send_hour,
                            send_minute=send_minute,
                        )
                        await update_user_digest_settings_runtime_state(
                            cursor,
                            user_id=user_id,
                            next_run_at=initialized_next_run,
                            last_delivery_status="queued",
                            last_delivery_error=None,
                        )
                        continue

                    recipient_channel = await fetch_user_digest_channel(cursor, user_id)
                    recipient_email = (
                        str(
                            (
                                recipient_channel.get("config_json")
                                if recipient_channel and isinstance(recipient_channel.get("config_json"), dict)
                                else {}
                            ).get("email")
                            or ""
                        ).strip()
                    )
                    next_scheduled_run = compute_next_digest_run_at(
                        now=now,
                        cadence=cadence,
                        timezone_name=validated_timezone,
                        send_hour=send_hour,
                        send_minute=send_minute,
                        base_run_at=next_run_at,
                    )

                    if not recipient_email:
                        await update_user_digest_settings_runtime_state(
                            cursor,
                            user_id=user_id,
                            next_run_at=next_scheduled_run,
                            last_delivery_status="failed",
                            last_delivery_error="Connected digest email is missing.",
                        )
                        continue

                    run_cutoff = now
                    items = await fetch_scheduled_digest_items(
                        cursor,
                        user_id=user_id,
                        since_at=last_sent_at,
                        until_at=run_cutoff,
                    )
                    subject = build_digest_subject(
                        digest_kind="scheduled_matches",
                        item_count=len(items),
                        cadence=cadence,
                    )

                    if not items and skip_if_empty:
                        await insert_digest_delivery_log_row(
                            cursor,
                            user_id=user_id,
                            digest_kind="scheduled_matches",
                            cadence=cadence,
                            status="skipped_empty",
                            recipient_email=recipient_email,
                            subject=subject,
                            body_text="",
                            body_html="",
                            metadata_json={
                                "itemCount": 0,
                                "skipIfEmpty": True,
                            },
                        )
                        await update_user_digest_settings_runtime_state(
                            cursor,
                            user_id=user_id,
                            next_run_at=next_scheduled_run,
                            last_delivery_status="skipped_empty",
                            last_delivery_error=None,
                        )
                        continue

                    intro = (
                        "New personalized matches from the system-selected collection since your last successful digest."
                    )
                    body_text = render_digest_text(
                        heading=subject,
                        intro=intro,
                        items=items,
                    )
                    body_html = render_digest_html(
                        heading=subject,
                        intro=intro,
                        items=items,
                    )
                    digest_delivery_id = await insert_digest_delivery_log_row(
                        cursor,
                        user_id=user_id,
                        digest_kind="scheduled_matches",
                        cadence=cadence,
                        status="queued",
                        recipient_email=recipient_email,
                        subject=subject,
                        body_text=body_text,
                        body_html=body_html,
                        metadata_json={
                            "itemCount": len(items),
                            "scheduledRunAt": next_run_at.isoformat(),
                            "windowEnd": run_cutoff.isoformat(),
                            "windowStart": last_sent_at.isoformat() if last_sent_at else None,
                        },
                    )
                    await upsert_digest_delivery_items(
                        cursor,
                        digest_delivery_id=digest_delivery_id,
                        content_item_ids=[item.content_item_id for item in items],
                    )
                    attempt = dispatch_channel_message(
                        "email_digest",
                        {"email": recipient_email},
                        subject,
                        body_text,
                        body_html=body_html,
                    )
                    await update_digest_delivery_status(
                        cursor,
                        digest_delivery_id=digest_delivery_id,
                        status=attempt.status,
                        error_text=None if attempt.status == "sent" else attempt.detail,
                    )
                    if attempt.status == "sent":
                        await update_user_digest_settings_runtime_state(
                            cursor,
                            user_id=user_id,
                            next_run_at=next_scheduled_run,
                            last_sent_at=run_cutoff,
                            last_delivery_status="sent",
                            last_delivery_error=None,
                        )
                    else:
                        await update_user_digest_settings_runtime_state(
                            cursor,
                            user_id=user_id,
                            next_run_at=now + timedelta(minutes=15),
                            last_delivery_status="failed",
                            last_delivery_error=attempt.detail,
                        )


async def insert_notification_suppression(
    cursor: psycopg.AsyncCursor[Any],
    *,
    user_id: uuid.UUID,
    interest_id: uuid.UUID | None,
    notification_id: uuid.UUID | None,
    doc_id: uuid.UUID | None,
    family_id: uuid.UUID | None,
    cluster_id: uuid.UUID | None,
    reason: str,
) -> None:
    await cursor.execute(
        """
        insert into notification_suppression (
          user_id,
          interest_id,
          notification_id,
          doc_id,
          family_id,
          event_cluster_id,
          reason
        )
        values (%s, %s, %s, %s, %s, %s, %s)
        """,
        (
            user_id,
            interest_id,
            notification_id,
            doc_id,
            family_id,
            cluster_id,
            reason,
        ),
    )

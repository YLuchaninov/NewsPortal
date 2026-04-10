import type { APIRoute } from "astro";
import { randomUUID } from "node:crypto";

import {
  buildFlashRedirect,
  requestPrefersHtmlNavigation
} from "../../lib/server/browser-flow";
import { getPool, queryRows } from "../../lib/server/db";
import { readRequestPayload } from "../../lib/server/request";
import {
  buildExpiredSessionCookie,
  resolveWebSession
} from "../../lib/server/auth";
import {
  parseNotificationChannelConfig,
  type NotificationChannelType
} from "../../lib/server/notification-channels";

export const prerender = false;
export const GET: APIRoute = async ({ request }) => {
  const session = await resolveWebSession(request);
  if (!session) {
    return Response.json({ channels: [] }, { status: 200 });
  }

  const channels = await queryRows(
    `
      select
        unc.*,
        last_delivery.status as last_status,
        last_delivery.sent_at as last_sent_at
      from user_notification_channels unc
      left join lateral (
        select delivery.status, delivery.sent_at
        from (
          select nl.status, nl.sent_at, nl.created_at
          from notification_log nl
          where unc.channel_type <> 'email_digest'
            and nl.user_id = unc.user_id
            and nl.channel_type = unc.channel_type
          union all
          select ddl.status, ddl.sent_at, ddl.requested_at as created_at
          from digest_delivery_log ddl
          where unc.channel_type = 'email_digest'
            and ddl.user_id = unc.user_id
        ) delivery
        order by delivery.sent_at desc nulls last, delivery.created_at desc
        limit 1
      ) last_delivery on true
      where unc.user_id = $1
      order by unc.channel_type, unc.created_at desc
    `,
    [session.userId]
  );
  return Response.json({ channels });
};

export const POST: APIRoute = async ({ request }) => {
  const browserRequest = requestPrefersHtmlNavigation(request);
  const session = await resolveWebSession(request);
  if (!session) {
    if (browserRequest) {
      return buildFlashRedirect(request, {
        section: "auth",
        status: "error",
        message: "Please start a session to continue.",
        setCookie: buildExpiredSessionCookie()
      });
    }
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const payload = await readRequestPayload(request);
  const channelType = String(payload.channelType ?? "") as NotificationChannelType;
  if (!["web_push", "telegram", "email_digest"].includes(channelType)) {
    if (browserRequest) {
      return buildFlashRedirect(request, {
        section: "preferences",
        status: "error",
        message: "Invalid channel type."
      });
    }
    return Response.json({ error: "Invalid channel type." }, { status: 400 });
  }

  let configJson: Record<string, unknown>;
  try {
    configJson = parseNotificationChannelConfig(
      channelType,
      payload,
      session.identity.email ?? null
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Invalid notification channel payload.";
    if (browserRequest) {
      return buildFlashRedirect(request, {
        section: "preferences",
        status: "error",
        message: errorMessage
      });
    }
    return Response.json(
      {
        error: errorMessage
      },
      { status: 400 }
    );
  }

  const pool = getPool();
  const existing = await pool.query<{ channel_binding_id: string }>(
    `
      select channel_binding_id::text as channel_binding_id
      from user_notification_channels
      where user_id = $1 and channel_type = $2
      order by created_at desc
      limit 1
    `,
    [session.userId, channelType]
  );

  if (existing.rows[0]) {
    await pool.query(
      `
        update user_notification_channels
        set
          config_json = $3::jsonb,
          is_enabled = true,
          updated_at = now(),
          verified_at = coalesce(verified_at, now())
        where channel_binding_id = $1 and user_id = $2
      `,
      [existing.rows[0].channel_binding_id, session.userId, JSON.stringify(configJson)]
    );
    if (browserRequest) {
      return buildFlashRedirect(request, {
        section: "preferences",
        status: "success",
        message: "Channel connected"
      });
    }
    return Response.json({ updated: true });
  }

  await pool.query(
    `
      insert into user_notification_channels (
        channel_binding_id,
        user_id,
        channel_type,
        is_enabled,
        config_json,
        verified_at
      )
      values ($1, $2, $3, true, $4::jsonb, now())
    `,
    [randomUUID(), session.userId, channelType, JSON.stringify(configJson)]
  );

  if (browserRequest) {
    return buildFlashRedirect(request, {
      section: "preferences",
      status: "success",
      message: "Channel connected"
    });
  }

  return Response.json({ created: true }, { status: 201 });
};

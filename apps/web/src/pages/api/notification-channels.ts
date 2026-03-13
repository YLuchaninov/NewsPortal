import type { APIRoute } from "astro";
import { randomUUID } from "node:crypto";

import { getPool, queryRows } from "../../lib/server/db";
import { readRequestPayload } from "../../lib/server/request";
import { resolveWebSession } from "../../lib/server/auth";

export const prerender = false;
export const GET: APIRoute = async ({ request }) => {
  const session = await resolveWebSession(request);
  if (!session) {
    return Response.json({ channels: [] }, { status: 200 });
  }

  const channels = await queryRows(
    `
      select *
      from user_notification_channels
      where user_id = $1
      order by created_at desc
    `,
    [session.userId]
  );
  return Response.json({ channels });
};

export const POST: APIRoute = async ({ request }) => {
  const session = await resolveWebSession(request);
  if (!session) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const payload = await readRequestPayload(request);
  const channelType = String(payload.channelType ?? "");
  if (!["web_push", "telegram", "email_digest"].includes(channelType)) {
    return Response.json({ error: "Invalid channel type." }, { status: 400 });
  }

  const configJson =
    channelType === "telegram"
      ? { chat_id: String(payload.chatId ?? "") }
      : channelType === "email_digest"
        ? { email: String(payload.email ?? session.identity.email ?? "") }
        : {
            subscription: payload.subscription ? JSON.parse(String(payload.subscription)) : {}
          };

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

  return Response.json({ created: true }, { status: 201 });
};

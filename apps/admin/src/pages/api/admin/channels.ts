import type { APIRoute } from "astro";
import { randomUUID } from "node:crypto";

import { resolveAdminSession } from "../../../lib/server/auth";
import { getPool } from "../../../lib/server/db";
import { readRequestPayload } from "../../../lib/server/request";

export const prerender = false;
export const POST: APIRoute = async ({ request }) => {
  const session = await resolveAdminSession(request);
  if (!session || !session.roles.includes("admin")) {
    return Response.json({ error: "Forbidden." }, { status: 403 });
  }

  const payload = await readRequestPayload(request);
  const channelId = String(payload.channelId ?? "");
  const providerType = String(payload.providerType ?? "rss");
  const name = String(payload.name ?? "").trim();
  const fetchUrl = String(payload.fetchUrl ?? "").trim();
  const language = String(payload.language ?? "en").trim();
  const isActive = String(payload.isActive ?? "true") === "true";
  if (!name) {
    return Response.json({ error: "Channel name is required." }, { status: 400 });
  }

  const pool = getPool();
  const existingProvider = await pool.query<{ provider_id: string }>(
    `
      select provider_id::text as provider_id
      from source_providers
      where provider_type = $1
      limit 1
    `,
    [providerType]
  );
  const providerId = existingProvider.rows[0]?.provider_id ?? null;

  if (channelId) {
    await pool.query(
      `
        update source_channels
        set
          provider_id = $2,
          provider_type = $3,
          name = $4,
          fetch_url = $5,
          language = $6,
          is_active = $7,
          updated_at = now()
        where channel_id = $1
      `,
      [channelId, providerId, providerType, name, fetchUrl || null, language || null, isActive]
    );
    return Response.json({ updated: true });
  }

  const createdChannelId = randomUUID();
  await pool.query(
    `
      insert into source_channels (
        channel_id,
        provider_id,
        provider_type,
        name,
        fetch_url,
        language,
        is_active
      )
      values ($1, $2, $3, $4, $5, $6, $7)
    `,
    [createdChannelId, providerId, providerType, name, fetchUrl || null, language || null, isActive]
  );
  return Response.json({ channelId: createdChannelId }, { status: 201 });
};

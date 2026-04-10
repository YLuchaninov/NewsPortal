import type { APIRoute } from "astro";

import { getPool } from "../../lib/server/db";
import { readRequestPayload } from "../../lib/server/request";
import {
  buildExpiredSessionCookie,
  resolveWebSession,
} from "../../lib/server/auth";
import {
  loadDigestSettings,
  saveDigestSettings,
} from "../../lib/server/digest-settings";

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const session = await resolveWebSession(request);
  if (!session) {
    return Response.json({ digestSettings: null }, { status: 200 });
  }

  const digestSettings = await loadDigestSettings(getPool(), session.userId);
  return Response.json({ digestSettings });
};

export const POST: APIRoute = async ({ request }) => {
  const session = await resolveWebSession(request);
  if (!session) {
    return Response.json(
      { error: "Unauthorized." },
      {
        status: 401,
        headers: {
          "Set-Cookie": buildExpiredSessionCookie(),
        },
      }
    );
  }

  try {
    const digestSettings = await saveDigestSettings(
      getPool(),
      session.userId,
      await readRequestPayload(request)
    );
    return Response.json({ updated: true, digestSettings });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Unable to save digest settings.",
      },
      { status: 400 }
    );
  }
};

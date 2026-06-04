import type { APIRoute } from "astro";
import { WEB_BFF_ACTION_PAYLOAD_SCHEMAS } from "@signalops/contracts";

import { getPool } from "../../lib/server/db";
import { resolveWebSession } from "../../lib/server/auth";
import { prepareWebAction } from "../../lib/server/web-action";
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
  const action = await prepareWebAction(request, {
    authSetCookie: true,
    actionToken: { scope: "digest-settings" },
    payloadSchema: WEB_BFF_ACTION_PAYLOAD_SCHEMAS["digest-settings"],
    payloadBoundaryName: "digest-settings payload",
  });
  if (!action.ok) {
    return action.response;
  }
  const { payload, session } = action.context;
  if (!session) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const digestSettings = await saveDigestSettings(
      getPool(),
      session.userId,
      payload
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

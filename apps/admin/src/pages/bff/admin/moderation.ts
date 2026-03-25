import type { APIRoute } from "astro";
import { randomUUID } from "node:crypto";

import {
  buildAdminSignInPath,
  buildFlashRedirect,
  requestPrefersHtmlNavigation,
  resolveAdminRedirectPath,
} from "../../../lib/server/browser-flow";
import {
  buildExpiredAdminSessionCookie,
  resolveAdminSession
} from "../../../lib/server/auth";
import { getPool } from "../../../lib/server/db";
import { readRequestPayload } from "../../../lib/server/request";

export const prerender = false;
export const POST: APIRoute = async ({ request }) => {
  const browserRequest = requestPrefersHtmlNavigation(request);
  const payload = await readRequestPayload(request);
  const redirectTo = resolveAdminRedirectPath(
    request,
    String(payload.redirectTo ?? request.headers.get("referer") ?? ""),
    "/articles"
  );
  const session = await resolveAdminSession(request);
  if (!session || !session.roles.includes("admin")) {
    if (browserRequest) {
      return buildFlashRedirect(request, {
        section: "auth",
        status: "error",
        message: "Please sign in as an admin to continue.",
        setCookie: buildExpiredAdminSessionCookie(),
        redirectTo: buildAdminSignInPath(request, redirectTo)
      });
    }
    return Response.json({ error: "Forbidden." }, { status: 403 });
  }

  const docId = String(payload.docId ?? "");
  const actionType = String(payload.actionType ?? "");
  const reason = String(payload.reason ?? "");
  if (!docId || !["block", "unblock"].includes(actionType)) {
    if (browserRequest) {
      return buildFlashRedirect(request, {
        section: "articles",
        status: "error",
        message: "Invalid moderation payload.",
        redirectTo
      });
    }
    return Response.json({ error: "Invalid moderation payload." }, { status: 400 });
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(
      `
        update articles
        set
          visibility_state = $2,
          updated_at = now()
        where doc_id = $1
      `,
      [docId, actionType === "block" ? "blocked" : "visible"]
    );
    await client.query(
      `
        insert into article_moderation_actions (
          moderation_action_id,
          doc_id,
          admin_user_id,
          action_type,
          reason
        )
        values ($1, $2, $3, $4, $5)
      `,
      [randomUUID(), docId, session.userId, actionType, reason || null]
    );
    await client.query(
      `
        insert into audit_log (
          actor_user_id,
          action_type,
          entity_type,
          entity_id,
          payload_json
        )
        values ($1, 'article_moderation', 'article', $2, $3::jsonb)
      `,
      [session.userId, docId, JSON.stringify({ actionType, reason })]
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    if (browserRequest) {
      return buildFlashRedirect(request, {
        section: "articles",
        status: "error",
        message: "Unable to update article moderation right now.",
        redirectTo
      });
    }
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Moderation failed."
      },
      {
        status: 500
      }
    );
  } finally {
    client.release();
  }

  if (browserRequest) {
    return buildFlashRedirect(request, {
      section: "articles",
      status: "success",
      message: actionType === "block" ? "Article blocked" : "Article unblocked",
      redirectTo
    });
  }

  return Response.json({ ok: true });
};

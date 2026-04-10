import type { APIRoute } from "astro";

import { readRuntimeConfig } from "@newsportal/config";
import { createNewsPortalSdk, type NewsPortalSdkOptions } from "@newsportal/sdk";

import {
  buildAdminSignInPath,
  buildFlashRedirect,
  requestPrefersHtmlNavigation,
  resolveAdminRedirectPath,
} from "../../../../lib/server/browser-flow";
import {
  buildExpiredAdminSessionCookie,
  resolveAdminSession,
} from "../../../../lib/server/auth";
import { getPool } from "../../../../lib/server/db";
import { readRequestPayload } from "../../../../lib/server/request";

export const prerender = false;

async function writeAuditLog(
  actorUserId: string,
  entityId: string,
  payloadJson: Record<string, unknown>
): Promise<void> {
  await getPool().query(
    `
      insert into audit_log (
        actor_user_id,
        action_type,
        entity_type,
        entity_id,
        payload_json
      )
      values ($1, 'article_enrichment_retry', 'article', $2, $3::jsonb)
    `,
    [actorUserId, entityId, JSON.stringify(payloadJson)]
  );
}

function buildSdkOptions(): NewsPortalSdkOptions {
  const runtimeConfig = readRuntimeConfig(process.env, { defaultAppBaseUrl: "http://127.0.0.1:4322/" });
  return {
    baseUrl: runtimeConfig.apiBaseUrl,
    fetchImpl: fetch,
  };
}

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
        redirectTo: buildAdminSignInPath(request, redirectTo),
      });
    }
    return Response.json({ error: "Forbidden." }, { status: 403 });
  }

  try {
    const docId = String(payload.docId ?? "").trim();
    if (!docId) {
      throw new Error("Article ID is required.");
    }

    const sdk = createNewsPortalSdk(buildSdkOptions());
    const run = await sdk.retryArticleEnrichment<Record<string, unknown>>(docId, {
      requestedBy: session.userId,
    });

    await writeAuditLog(session.userId, docId, {
      runId: run.run_id ?? null,
      sequenceId: run.sequence_id ?? null,
      status: run.status ?? null,
    });

    if (browserRequest) {
      return buildFlashRedirect(request, {
        section: "articles",
        status: "success",
        message: "Enrichment retry queued",
        redirectTo,
      });
    }

    return Response.json(run, { status: 202 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to queue article enrichment retry.";
    if (browserRequest) {
      return buildFlashRedirect(request, {
        section: "articles",
        status: "error",
        message,
        redirectTo,
      });
    }
    return Response.json({ error: message }, { status: 400 });
  }
};

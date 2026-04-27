import type { APIRoute } from "astro";

import { readRuntimeConfig } from "@newsportal/config";
import { createNewsPortalSdk } from "@newsportal/sdk";

import {
  buildAdminSignInPath,
  buildFlashRedirect,
  requestPrefersHtmlNavigation,
  resolveAdminRedirectPath,
} from "../../../lib/server/browser-flow";
import {
  buildExpiredAdminSessionCookie,
  resolveAdminSession,
} from "../../../lib/server/auth";
import { getPool } from "../../../lib/server/db";
import { readRequestPayload } from "../../../lib/server/request";

export const prerender = false;

function readBooleanField(value: unknown): boolean {
  if (typeof value !== "string") {
    return value === true;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "on" || normalized === "true" || normalized === "1" || normalized === "yes";
}

export const POST: APIRoute = async ({ request }) => {
  const browserRequest = requestPrefersHtmlNavigation(request);
  const redirectTo = resolveAdminRedirectPath(
    request,
    request.headers.get("referer"),
    "/analysis"
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

  const payload = await readRequestPayload(request);
  const runtimeConfig = readRuntimeConfig(process.env, {
    defaultAppBaseUrl: "http://127.0.0.1:4322/",
  });
  const sdk = createNewsPortalSdk({
    baseUrl: runtimeConfig.apiBaseUrl,
    fetchImpl: fetch,
  });
  const subjectTypes = [
    ...(readBooleanField(payload.subjectArticle) ? ["article"] : []),
    ...(readBooleanField(payload.subjectWebResource) ? ["web_resource"] : []),
    ...(readBooleanField(payload.subjectStoryCluster) ? ["story_cluster"] : []),
  ];
  const modules = [
    ...(readBooleanField(payload.moduleNer) ? ["ner"] : []),
    ...(readBooleanField(payload.moduleSentiment) ? ["sentiment"] : []),
    ...(readBooleanField(payload.moduleCategory) ? ["category"] : []),
    ...(readBooleanField(payload.moduleClusterSummary) ? ["cluster_summary"] : []),
    ...(readBooleanField(payload.moduleStructuredExtraction) ? ["structured_extraction"] : []),
    ...(readBooleanField(payload.moduleLabels) ? ["system_interest_labels"] : []),
    ...(readBooleanField(payload.moduleGate) ? ["content_filter"] : []),
  ];
  const defaultSubjectTypes = ["article", "web_resource", "story_cluster"];
  const defaultModules = [
    "ner",
    "sentiment",
    "category",
    "cluster_summary",
    "system_interest_labels",
    "content_filter",
  ];
  const requestPayload = {
    subjectTypes: subjectTypes.length > 0 ? subjectTypes : defaultSubjectTypes,
    modules: modules.length > 0 ? modules : defaultModules,
    missingOnly: readBooleanField(payload.missingOnly),
    policyKey: String(payload.policyKey ?? "default_recent_content_gate").trim() || "default_recent_content_gate",
    batchSize: Number.parseInt(String(payload.batchSize ?? "100"), 10) || 100,
    maxTextChars: Number.parseInt(String(payload.maxTextChars ?? "50000"), 10) || 50_000,
    requestedByUserId: session.userId,
  };
  try {
    const queued = await sdk.requestContentAnalysisBackfill<Record<string, unknown>>(
      requestPayload
    );
    await getPool().query(
      `
        insert into audit_log (
          actor_user_id,
          action_type,
          entity_type,
          entity_id,
          payload_json
        )
        values ($1, 'content_analysis_backfill_requested', 'reindex_job', $2, $3::jsonb)
      `,
      [
        session.userId,
        String(queued.reindexJobId ?? ""),
        JSON.stringify({ request: requestPayload, queued }),
      ]
    );
    if (browserRequest) {
      return buildFlashRedirect(request, {
        section: "analysis",
        status: "success",
        message: "Content analysis backfill queued",
        redirectTo,
      });
    }
    return Response.json(queued, { status: 202 });
  } catch (error) {
    if (browserRequest) {
      return buildFlashRedirect(request, {
        section: "analysis",
        status: "error",
        message: "Unable to queue content analysis backfill right now.",
        redirectTo,
      });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to queue backfill." },
      { status: 500 }
    );
  }
};

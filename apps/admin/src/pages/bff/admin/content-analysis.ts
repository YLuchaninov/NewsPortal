import type { APIRoute } from "astro";

import { readRuntimeConfig } from "@signalops/config";
import { createSignalOpsSdk } from "@signalops/sdk";

import {
  adminActionError,
  adminActionSuccess,
  insertAdminAuditLog,
  prepareAdminAction,
} from "../../../lib/server/admin-action";
import { getPool } from "../../../lib/server/db";

export const prerender = false;

function readBooleanField(value: unknown): boolean {
  if (typeof value !== "string") {
    return value === true;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "on" || normalized === "true" || normalized === "1" || normalized === "yes";
}

export const POST: APIRoute = async ({ request }) => {
  const action = await prepareAdminAction(request, {
    fallbackRedirectPath: "/analysis",
    actionToken: { scope: "content-analysis" },
  });
  if (!action.ok) {
    return action.response;
  }

  const { payload, session } = action.context;
  const runtimeConfig = readRuntimeConfig(process.env, {
    defaultAppBaseUrl: "http://127.0.0.1:4322/",
  });
  const sdk = createSignalOpsSdk({
    baseUrl: runtimeConfig.apiBaseUrl,
    fetchImpl: fetch,
  });
  const subjectTypes = [
    ...(readBooleanField(payload.subjectSignalCandidate) ? ["signal_candidate"] : []),
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
  const defaultSubjectTypes = ["signal_candidate", "web_resource", "story_cluster"];
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
    await insertAdminAuditLog(getPool(), {
      actorUserId: session.userId,
      actionType: "content_analysis_backfill_requested",
      entityType: "reindex_job",
      entityId: String(queued.reindexJobId ?? ""),
      payloadJson: { request: requestPayload, queued },
    });
    return adminActionSuccess(action.context, {
      section: "analysis",
      message: "Content analysis backfill queued",
      status: 202,
      json: queued,
    });
  } catch (error) {
    return adminActionError(action.context, {
      section: "analysis",
      message: "Unable to queue content analysis backfill right now.",
      status: 500,
      json: { error: error instanceof Error ? error.message : "Failed to queue backfill." },
    });
  }
};

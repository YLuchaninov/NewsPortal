import type { APIRoute } from "astro";

import { readRuntimeConfig } from "@signalops/config";
import { createSignalOpsSdk, type SignalOpsSdkOptions } from "@signalops/sdk";

import {
  adminActionError,
  adminActionSuccess,
  insertAdminAuditLog,
  prepareAdminAction,
  readRequiredAdminText,
} from "../../../../lib/server/admin-action";
import { getPool } from "../../../../lib/server/db";

export const prerender = false;

function buildSdkOptions(): SignalOpsSdkOptions {
  const runtimeConfig = readRuntimeConfig(process.env, { defaultAppBaseUrl: "http://127.0.0.1:4322/" });
  return {
    baseUrl: runtimeConfig.apiBaseUrl,
    fetchImpl: fetch,
  };
}

export const POST: APIRoute = async ({ request }) => {
  const action = await prepareAdminAction(request, {
    fallbackRedirectPath: "/articles",
    actionToken: { scope: "articles.enrichment-retry" },
  });
  if (!action.ok) {
    return action.response;
  }

  try {
    const { payload, session } = action.context;
    const docId = readRequiredAdminText(payload, "docId", "Article ID is required.");

    const sdk = createSignalOpsSdk(buildSdkOptions());
    const run = await sdk.retryArticleEnrichment<Record<string, unknown>>(docId, {
      requestedBy: session.userId,
    });

    await insertAdminAuditLog(getPool(), {
      actorUserId: session.userId,
      actionType: "article_enrichment_retry",
      entityType: "article",
      entityId: docId,
      payloadJson: {
        runId: run.run_id ?? null,
        sequenceId: run.sequence_id ?? null,
        status: run.status ?? null,
      },
    });

    return adminActionSuccess(action.context, {
      section: "articles",
      message: "Enrichment retry queued",
      status: 202,
      json: run,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to queue article enrichment retry.";
    return adminActionError(action.context, {
      section: "articles",
      message,
      status: 400,
    });
  }
};

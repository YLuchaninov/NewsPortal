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
    fallbackRedirectPath: "/signal-candidates",
    actionToken: { scope: "signal_candidates.enrichment-retry" },
  });
  if (!action.ok) {
    return action.response;
  }

  try {
    const { payload, session } = action.context;
    const docId = readRequiredAdminText(payload, "docId", "SignalCandidate ID is required.");

    const sdk = createSignalOpsSdk(buildSdkOptions());
    const run = await sdk.retrySignalCandidateEnrichment<Record<string, unknown>>(docId, {
      requestedBy: session.userId,
    });

    await insertAdminAuditLog(getPool(), {
      actorUserId: session.userId,
      actionType: "signal_candidate_enrichment_retry",
      entityType: "signal_candidate",
      entityId: docId,
      payloadJson: {
        runId: run.run_id ?? null,
        sequenceId: run.sequence_id ?? null,
        status: run.status ?? null,
      },
    });

    return adminActionSuccess(action.context, {
      section: "signal_candidates",
      message: "Enrichment retry queued",
      status: 202,
      json: run,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to queue signal_candidate enrichment retry.";
    return adminActionError(action.context, {
      section: "signal_candidates",
      message,
      status: 400,
    });
  }
};

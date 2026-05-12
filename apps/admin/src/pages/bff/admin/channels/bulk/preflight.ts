import type { APIRoute } from "astro";

import { buildAdminSignInPath } from "../../../../../lib/server/browser-flow";
import { buildExpiredAdminSessionCookie } from "../../../../../lib/server/auth";
import { prepareAdminAction } from "../../../../../lib/server/admin-action";
import {
  planBulkOnboarding,
  readBulkPayload,
} from "./shared";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const action = await prepareAdminAction(request, {
    fallbackRedirectPath: "/channels/import",
    actionToken: { scope: "channels.bulk.preflight" },
    payloadReader: readBulkPayload,
    authJson: (authRequest, redirectTo) => ({
      error: "Please sign in as an admin to continue.",
      redirectTo: buildAdminSignInPath(authRequest, redirectTo),
      setCookie: buildExpiredAdminSessionCookie({ request: authRequest }),
    }),
  });
  if (!action.ok) {
    return action.response;
  }

  try {
    const bulkPayload = action.context.payload;
    const importPlan = await planBulkOnboarding(bulkPayload.channelsPayload);

    return Response.json({
      ok: true,
      wouldCreate: importPlan.summary.wouldCreate,
      wouldUpdate: importPlan.summary.wouldUpdate,
      matchedByChannelId: importPlan.summary.matchedByChannelId,
      matchedByFetchUrl: importPlan.summary.matchedByFetchUrl,
      items: importPlan.items,
      providerBreakdown: importPlan.summary.providerBreakdown,
      blocked: importPlan.blocked,
      warnings: importPlan.warnings,
      planFingerprint: importPlan.planFingerprint,
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Bulk import preflight failed.",
      },
      {
        status: 400,
      }
    );
  }
};

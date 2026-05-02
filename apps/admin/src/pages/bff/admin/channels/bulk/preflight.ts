import type { APIRoute } from "astro";

import { buildAdminSignInPath } from "../../../../../lib/server/browser-flow";
import { buildExpiredAdminSessionCookie } from "../../../../../lib/server/auth";
import { prepareAdminAction } from "../../../../../lib/server/admin-action";
import {
  parseBulkChannels,
  planBulkImport,
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
    const channels = parseBulkChannels(bulkPayload.channelsPayload);
    const importPlan = await planBulkImport(channels);

    return Response.json({
      ok: true,
      wouldCreate: importPlan.wouldCreate,
      wouldUpdate: importPlan.wouldUpdate,
      matchedByChannelId: importPlan.matchedByChannelId,
      matchedByFetchUrl: importPlan.matchedByFetchUrl,
      items: importPlan.items,
      providerBreakdown: importPlan.providerBreakdown,
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

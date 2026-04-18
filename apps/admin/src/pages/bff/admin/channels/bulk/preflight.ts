import type { APIRoute } from "astro";

import {
  buildAdminSignInPath,
  resolveAdminRedirectPath
} from "../../../../../lib/server/browser-flow";
import {
  buildExpiredAdminSessionCookie,
  resolveAdminSession
} from "../../../../../lib/server/auth";
import {
  parseBulkChannels,
  planBulkImport,
  readBulkPayload
} from "./shared";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const redirectTo = resolveAdminRedirectPath(
    request,
    request.headers.get("referer"),
    "/channels/import"
  );
  const session = await resolveAdminSession(request);
  if (!session || !session.roles.includes("admin")) {
    return Response.json(
      {
        error: "Please sign in as an admin to continue.",
        redirectTo: buildAdminSignInPath(request, redirectTo),
        setCookie: buildExpiredAdminSessionCookie()
      },
      { status: 403 }
    );
  }

  try {
    const bulkPayload = await readBulkPayload(request);
    const channels = parseBulkChannels(
      bulkPayload.providerType,
      bulkPayload.channelsPayload
    );
    const importPlan = await planBulkImport(
      bulkPayload.providerType,
      channels
    );

    return Response.json({
      ok: true,
      providerType: bulkPayload.providerType,
      wouldCreate: importPlan.wouldCreate,
      wouldUpdate: importPlan.wouldUpdate,
      matchedByChannelId: importPlan.matchedByChannelId,
      matchedByFetchUrl: importPlan.matchedByFetchUrl,
      items: importPlan.items
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Bulk import preflight failed."
      },
      {
        status: 400
      }
    );
  }
};

import type { APIRoute } from "astro";

import {
  buildAdminSignInPath,
  buildFlashRedirect,
  requestPrefersHtmlNavigation,
  resolveAdminRedirectPath,
} from "../../../../lib/server/browser-flow";
import {
  buildExpiredAdminSessionCookie,
  resolveAdminSession
} from "../../../../lib/server/auth";
import {
  executeBulkImport,
  formatBulkImportSuccessMessage,
  parseBulkChannels,
  planBulkImport,
  readBulkPayload
} from "./bulk/shared";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const browserRequest = requestPrefersHtmlNavigation(request);
  let redirectTo = resolveAdminRedirectPath(
    request,
    request.headers.get("referer"),
    "/channels/import"
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

  try {
    const bulkPayload = await readBulkPayload(request);
    redirectTo = resolveAdminRedirectPath(
      request,
      String(bulkPayload.redirectTo ?? request.headers.get("referer") ?? ""),
      "/channels/import"
    );
    const channels = parseBulkChannels(
      bulkPayload.providerType,
      bulkPayload.channelsPayload
    );
    const importPlan = await planBulkImport(
      bulkPayload.providerType,
      channels
    );
    const overwriteCount = importPlan.wouldUpdate;
    const overwriteConfirmed = bulkPayload.confirmOverwrite;

    if (overwriteCount > 0 && !overwriteConfirmed) {
      throw new Error(
        `Bulk import includes ${overwriteCount} existing channel${overwriteCount === 1 ? "" : "s"}. Confirm overwrite before applying updates.`
      );
    }

    const result = await executeBulkImport(
      bulkPayload.providerType,
      importPlan.channels
    );

    if (browserRequest) {
      return buildFlashRedirect(request, {
        section: "channels",
        status: "success",
        message: formatBulkImportSuccessMessage(
          bulkPayload.providerType,
          result.createdChannelIds.length,
          result.updatedChannelIds.length
        ),
        redirectTo
      });
    }

    return Response.json({
      providerType: bulkPayload.providerType,
      createdChannelIds: result.createdChannelIds,
      updatedChannelIds: result.updatedChannelIds,
      createdCount: result.createdChannelIds.length,
      updatedCount: result.updatedChannelIds.length,
      overwriteCount,
      matchedByChannelId: importPlan.matchedByChannelId,
      matchedByFetchUrl: importPlan.matchedByFetchUrl
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Failed to import RSS channels.";
    if (browserRequest) {
      return buildFlashRedirect(request, {
        section: "channels",
        status: "error",
        message: errorMessage,
        redirectTo
      });
    }
    return Response.json(
      {
        error: errorMessage
      },
      {
        status: 400
      }
    );
  }
};

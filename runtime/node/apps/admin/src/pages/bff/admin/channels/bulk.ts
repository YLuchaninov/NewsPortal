import type { APIRoute } from "astro";

import {
  adminActionError,
  adminActionSuccess,
  prepareAdminAction,
} from "../../../../lib/server/admin-action";
import {
  executeBulkImport,
  formatBulkImportSuccessMessage,
  parseBulkChannels,
  planBulkOnboarding,
  planBulkImport,
  readBulkPayload
} from "./bulk/shared";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const action = await prepareAdminAction(request, {
    fallbackRedirectPath: "/channels/import",
    actionToken: { scope: "channels.bulk" },
    payloadReader: readBulkPayload,
  });
  if (!action.ok) {
    return action.response;
  }

  try {
    const bulkPayload = action.context.payload;
    const onboardingPlan = await planBulkOnboarding(bulkPayload.channelsPayload);
    if (onboardingPlan.blocked.length > 0) {
      throw new Error(
        `Bulk import has ${onboardingPlan.blocked.length} blocked source${onboardingPlan.blocked.length === 1 ? "" : "s"}: ${onboardingPlan.blocked
          .slice(0, 3)
          .map((item) => `row ${item.index + 1} status=${item.status}`)
          .join(", ")}. Run validation and use channel alternatives or a supported provider shape before importing.`
      );
    }
    const channels = parseBulkChannels(bulkPayload.channelsPayload);
    const importPlan = await planBulkImport(channels);
    const overwriteCount = importPlan.wouldUpdate;
    const overwriteConfirmed = bulkPayload.confirmOverwrite;

    if (overwriteCount > 0 && !overwriteConfirmed) {
      throw new Error(
        `Bulk import includes ${overwriteCount} existing channel${overwriteCount === 1 ? "" : "s"}. Confirm overwrite before applying updates.`
      );
    }

    const result = await executeBulkImport(importPlan.channels);

    return adminActionSuccess(action.context, {
      section: "channels",
      message: formatBulkImportSuccessMessage(result),
      json: {
        createdChannelIds: result.createdChannelIds,
        updatedChannelIds: result.updatedChannelIds,
        createdCount: result.createdChannelIds.length,
        updatedCount: result.updatedChannelIds.length,
        overwriteCount,
        matchedByChannelId: importPlan.matchedByChannelId,
        matchedByFetchUrl: importPlan.matchedByFetchUrl,
        providerBreakdown: result.providerBreakdown,
      },
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Failed to import channels.";
    return adminActionError(action.context, {
      section: "channels",
      message: errorMessage,
      status: 400,
    });
  }
};

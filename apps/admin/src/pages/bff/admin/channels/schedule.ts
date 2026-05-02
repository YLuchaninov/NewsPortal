import type { APIRoute } from "astro";

import {
  adminActionError,
  adminActionSuccess,
  prepareAdminAction,
} from "../../../../lib/server/admin-action";
import { getPool } from "../../../../lib/server/db";
import {
  applyChannelSchedulePatch,
  parseChannelSchedulePatchInput
} from "../../../../lib/server/channel-scheduling";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const action = await prepareAdminAction(request, {
    fallbackRedirectPath: "/channels",
    actionToken: { scope: "channels.schedule" },
  });
  if (!action.ok) {
    return action.response;
  }

  try {
    const { payload } = action.context;
    const patch = parseChannelSchedulePatchInput(payload);
    const result = await applyChannelSchedulePatch(getPool(), patch);

    return adminActionSuccess(action.context, {
      section: "channels",
      message: "Schedule applied",
      json: {
        updated: true,
        updatedCount: result.updatedCount,
      },
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Failed to patch channel scheduling.";
    return adminActionError(action.context, {
      section: "channels",
      message: errorMessage,
      status: 400,
    });
  }
};

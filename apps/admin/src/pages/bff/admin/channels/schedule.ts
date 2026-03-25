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
import { getPool } from "../../../../lib/server/db";
import {
  applyChannelSchedulePatch,
  parseChannelSchedulePatchInput
} from "../../../../lib/server/channel-scheduling";
import { readRequestPayload } from "../../../../lib/server/request";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const browserRequest = requestPrefersHtmlNavigation(request);
  const redirectTo = resolveAdminRedirectPath(
    request,
    request.headers.get("referer"),
    "/channels"
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
    const payload = await readRequestPayload(request);
    const patch = parseChannelSchedulePatchInput(payload);
    const result = await applyChannelSchedulePatch(getPool(), patch);

    if (browserRequest) {
      return buildFlashRedirect(request, {
        section: "channels",
        status: "success",
        message: "Schedule applied",
        redirectTo
      });
    }

    return Response.json({
      updated: true,
      updatedCount: result.updatedCount
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Failed to patch channel scheduling.";
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

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
  countRssChannelsRequiringOverwriteConfirmation,
  parseBulkRssAdminChannelInputs,
  upsertRssChannels
} from "../../../../lib/server/rss-channels";

export const prerender = false;

interface BulkPayload {
  channelsPayload: unknown;
  confirmOverwrite: boolean;
  redirectTo: string | null;
}

async function readBulkPayload(request: Request): Promise<BulkPayload> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const payload = (await request.json()) as unknown;

    if (Array.isArray(payload)) {
      return {
        channelsPayload: payload,
        confirmOverwrite: false,
        redirectTo: null
      };
    }

    if (payload != null && typeof payload === "object" && Array.isArray((payload as { channels?: unknown }).channels)) {
      const bulkPayload = payload as {
        channels: unknown[];
        confirmOverwrite?: unknown;
        redirectTo?: unknown;
      };

      return {
        channelsPayload: bulkPayload.channels,
        confirmOverwrite: readConfirmedOverwrite(bulkPayload.confirmOverwrite),
        redirectTo: String(bulkPayload.redirectTo ?? "").trim() || null
      };
    }

    throw new Error('Bulk RSS payload must be a JSON array or an object with a "channels" array.');
  }

  const formData = await request.formData();
  const rawJson = String(formData.get("channelsJson") ?? "").trim();

  if (!rawJson) {
    throw new Error('Bulk RSS form payload must include "channelsJson".');
  }

  try {
    return {
      channelsPayload: JSON.parse(rawJson) as unknown,
      confirmOverwrite: readConfirmedOverwrite(formData.get("confirmOverwrite")),
      redirectTo: String(formData.get("redirectTo") ?? "").trim() || null
    };
  } catch {
    throw new Error("Bulk RSS form payload must contain valid JSON.");
  }
}

function readConfirmedOverwrite(value: unknown): boolean {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

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
    const channels = parseBulkRssAdminChannelInputs(bulkPayload.channelsPayload);
    const overwriteCount = countRssChannelsRequiringOverwriteConfirmation(channels);
    const overwriteConfirmed = bulkPayload.confirmOverwrite;

    if (overwriteCount > 0 && !overwriteConfirmed) {
      throw new Error(
        `Bulk import includes ${overwriteCount} existing channel${overwriteCount === 1 ? "" : "s"}. Confirm overwrite before applying updates.`
      );
    }

    const result = await upsertRssChannels(getPool(), channels);

    if (browserRequest) {
      return buildFlashRedirect(request, {
        section: "channels",
        status: "success",
        message:
          overwriteCount > 0
            ? `Imported ${result.createdChannelIds.length} new channel${result.createdChannelIds.length === 1 ? "" : "s"} and updated ${result.updatedChannelIds.length} existing channel${result.updatedChannelIds.length === 1 ? "" : "s"}`
            : "Channels imported",
        redirectTo
      });
    }

    return Response.json({
      createdChannelIds: result.createdChannelIds,
      updatedChannelIds: result.updatedChannelIds,
      createdCount: result.createdChannelIds.length,
      updatedCount: result.updatedChannelIds.length,
      overwriteCount
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

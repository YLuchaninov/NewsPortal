import type { APIRoute } from "astro";

import {
  buildAdminSignInPath,
  buildFlashRedirect,
  requestPrefersHtmlNavigation,
  resolveAdminAppPath,
  resolveAdminRedirectPath,
} from "../../../lib/server/browser-flow";
import {
  buildExpiredAdminSessionCookie,
  resolveAdminSession,
} from "../../../lib/server/auth";
import { getPool } from "../../../lib/server/db";
import { readRequestPayload } from "../../../lib/server/request";
import { deleteOrArchiveSourceChannel } from "../../../lib/server/source-channels";
import {
  parseApiAdminChannelInput,
  upsertApiChannels,
} from "../../../lib/server/api-channels";
import {
  parseEmailImapAdminChannelInput,
  upsertEmailImapChannels,
} from "../../../lib/server/email-imap-channels";
import {
  parseRssAdminChannelInput,
  upsertRssChannels,
} from "../../../lib/server/rss-channels";
import {
  parseWebsiteAdminChannelInput,
  upsertWebsiteChannels,
} from "../../../lib/server/website-channels";
import {
  formatAdminChannelProviderLabel,
  isAdminChannelProviderType,
  type AdminChannelProviderType,
} from "../../../lib/channel-providers";

export const prerender = false;

type ChannelIntent = "save" | "delete";

type ChannelWriteInput =
  | ReturnType<typeof parseRssAdminChannelInput>
  | ReturnType<typeof parseWebsiteAdminChannelInput>
  | ReturnType<typeof parseApiAdminChannelInput>
  | ReturnType<typeof parseEmailImapAdminChannelInput>;

type ChannelWriteResult = {
  createdChannelIds: string[];
  updatedChannelIds: string[];
  authConfiguredChannelIds: string[];
  authClearedChannelIds: string[];
};

function resolveChannelIntent(payload: Record<string, unknown>): ChannelIntent {
  return String(payload.intent ?? "save").trim() === "delete" ? "delete" : "save";
}

function resolveChannelEditPath(request: Request, channelId: string): string {
  return resolveAdminAppPath(request, `/channels/${channelId}/edit`);
}

function resolveProviderType(payload: Record<string, unknown>): AdminChannelProviderType {
  const normalized = String(payload.providerType ?? "rss").trim();
  if (!isAdminChannelProviderType(normalized)) {
    throw new Error(`Unsupported channel providerType "${normalized || "unknown"}".`);
  }
  return normalized;
}

function formatProviderLabel(providerType: AdminChannelProviderType | string): string {
  return isAdminChannelProviderType(providerType)
    ? formatAdminChannelProviderLabel(providerType)
    : providerType;
}

function parseChannelInput(
  providerType: AdminChannelProviderType,
  payload: Record<string, unknown>
): ChannelWriteInput {
  switch (providerType) {
    case "website":
      return parseWebsiteAdminChannelInput(payload);
    case "api":
      return parseApiAdminChannelInput(payload);
    case "email_imap":
      return parseEmailImapAdminChannelInput(payload);
    case "rss":
    default:
      return parseRssAdminChannelInput(payload);
  }
}

async function upsertChannelInput(
  providerType: AdminChannelProviderType,
  channel: ChannelWriteInput
): Promise<ChannelWriteResult> {
  const pool = getPool();
  switch (providerType) {
    case "website":
      return upsertWebsiteChannels(
        pool,
        [channel as ReturnType<typeof parseWebsiteAdminChannelInput>]
      );
    case "api":
      return upsertApiChannels(
        pool,
        [channel as ReturnType<typeof parseApiAdminChannelInput>]
      );
    case "email_imap":
      return upsertEmailImapChannels(
        pool,
        [channel as ReturnType<typeof parseEmailImapAdminChannelInput>]
      );
    case "rss":
    default:
      return upsertRssChannels(pool, [channel as ReturnType<typeof parseRssAdminChannelInput>]);
  }
}

async function writeAuditLog(
  actorUserId: string,
  actionType: string,
  entityId: string,
  payloadJson: Record<string, unknown>
): Promise<void> {
  await getPool().query(
    `
      insert into audit_log (
        actor_user_id,
        action_type,
        entity_type,
        entity_id,
        payload_json
      )
      values ($1, $2, 'channel', $3, $4::jsonb)
    `,
    [actorUserId, actionType, entityId, JSON.stringify(payloadJson)]
  );
}

export const POST: APIRoute = async ({ request }) => {
  const browserRequest = requestPrefersHtmlNavigation(request);
  const payload = await readRequestPayload(request);
  const redirectTo = resolveAdminRedirectPath(
    request,
    String(payload.redirectTo ?? request.headers.get("referer") ?? ""),
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
        redirectTo: buildAdminSignInPath(request, redirectTo),
      });
    }
    return Response.json({ error: "Forbidden." }, { status: 403 });
  }

  try {
    const pool = getPool();
    const intent = resolveChannelIntent(payload);

    if (intent === "delete") {
      const channelId = String(payload.channelId ?? "").trim();
      if (!channelId) {
        throw new Error("Channel ID is required for delete.");
      }

      const result = await deleteOrArchiveSourceChannel(pool, channelId);
      const providerLabel = formatProviderLabel(result.providerType);
      await writeAuditLog(
        session.userId,
        result.mode === "delete" ? "channel_deleted" : "channel_archived",
        channelId,
        {
          storedItemCount: result.storedItemCount,
          mode: result.mode,
          providerType: result.providerType,
        }
      );

      if (browserRequest) {
        return buildFlashRedirect(request, {
          section: "channels",
          status: "success",
          message:
            result.mode === "delete"
              ? `${providerLabel} channel deleted`
              : `${providerLabel} channel archived because it already has stored items`,
          redirectTo:
            result.mode === "delete"
              ? resolveAdminAppPath(request, "/channels")
              : redirectTo,
        });
      }

      return Response.json({
        ok: true,
        mode: result.mode,
        storedItemCount: result.storedItemCount,
        providerType: result.providerType,
      });
    }

    const providerType = resolveProviderType(payload);
    const channel = parseChannelInput(providerType, payload);
    const result = await upsertChannelInput(providerType, channel);
    const channelId = channel.channelId ?? result.createdChannelIds[0] ?? null;
    const entityPath = channelId ? resolveChannelEditPath(request, channelId) : redirectTo;
    const providerLabel = formatProviderLabel(channel.providerType);

    if (channelId) {
      await writeAuditLog(
        session.userId,
        channel.channelId ? "channel_updated" : "channel_created",
        channelId,
        {
          name: channel.name,
          isActive: channel.isActive,
          providerType: channel.providerType,
          pollIntervalSeconds: channel.pollIntervalSeconds,
        }
      );

      if (result.authConfiguredChannelIds.includes(channelId)) {
        await writeAuditLog(session.userId, "channel_auth_configured", channelId, {
          providerType: channel.providerType,
        });
      }

      if (result.authClearedChannelIds.includes(channelId)) {
        await writeAuditLog(session.userId, "channel_auth_cleared", channelId, {
          providerType: channel.providerType,
        });
      }
    }

    if (browserRequest) {
      return buildFlashRedirect(request, {
        section: "channels",
        status: "success",
        message: channel.channelId ? `${providerLabel} channel updated` : `${providerLabel} channel created`,
        redirectTo: channel.channelId ? redirectTo : entityPath,
      });
    }

    if (channel.channelId) {
      return Response.json({
        updated: true,
        channelId: channel.channelId,
        updatedChannelIds: result.updatedChannelIds,
      });
    }

    return Response.json(
      {
        channelId,
        createdChannelIds: result.createdChannelIds,
      },
      { status: 201 }
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Failed to update channel.";
    if (browserRequest) {
      return buildFlashRedirect(request, {
        section: "channels",
        status: "error",
        message: errorMessage,
        redirectTo,
      });
    }
    return Response.json(
      {
        error: errorMessage,
      },
      {
        status: 400,
      }
    );
  }
};

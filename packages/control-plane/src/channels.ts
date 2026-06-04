import { assertAdminChannelPayload } from "@signalops/contracts";
import type { Pool } from "pg";

import {
  deleteOrArchiveSourceChannel,
} from "./source-channels";
import {
  parseApiAdminChannelInput,
  upsertApiChannels,
} from "./api-channels";
import {
  parseEmailImapAdminChannelInput,
  upsertEmailImapChannels,
} from "./email-imap-channels";
import {
  parseRssAdminChannelInput,
  upsertRssChannels,
} from "./rss-channels";
import {
  parseWebsiteAdminChannelInput,
  upsertWebsiteChannels,
} from "./website-channels";
import {
  formatAdminChannelProviderLabel,
  isAdminChannelProviderType,
  type AdminChannelProviderType,
} from "./channel-providers";
import { writeAuditLog } from "./audit";

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

function stripAdminActionEnvelope(
  payload: Record<string, unknown>
): Record<string, unknown> {
  const channelPayload = { ...payload };
  delete channelPayload.intent;
  delete channelPayload.redirectTo;
  return channelPayload;
}

function resolveProviderType(payload: Record<string, unknown>): AdminChannelProviderType {
  const normalized = String(payload.providerType ?? "rss").trim();
  if (!isAdminChannelProviderType(normalized)) {
    throw new Error(`Unsupported channel providerType "${normalized || "unknown"}".`);
  }
  return normalized;
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
  pool: Pool,
  providerType: AdminChannelProviderType,
  channel: ChannelWriteInput,
  actorUserId: string
): Promise<ChannelWriteResult> {
  switch (providerType) {
    case "website":
      return upsertWebsiteChannels(
        pool,
        [channel as ReturnType<typeof parseWebsiteAdminChannelInput>],
        actorUserId
      );
    case "api":
      return upsertApiChannels(
        pool,
        [channel as ReturnType<typeof parseApiAdminChannelInput>],
        actorUserId
      );
    case "email_imap":
      return upsertEmailImapChannels(
        pool,
        [channel as ReturnType<typeof parseEmailImapAdminChannelInput>],
        actorUserId
      );
    case "rss":
    default:
      return upsertRssChannels(
        pool,
        [channel as ReturnType<typeof parseRssAdminChannelInput>],
        actorUserId
      );
  }
}

export interface SavedChannelResult {
  channelId: string | null;
  providerType: AdminChannelProviderType;
  providerLabel: string;
  created: boolean;
  authConfigured: boolean;
  authCleared: boolean;
  createdChannelIds: string[];
  updatedChannelIds: string[];
}

export async function saveChannelFromPayload(
  pool: Pool,
  actorUserId: string,
  payload: Record<string, unknown>
): Promise<SavedChannelResult> {
  const channelPayload = stripAdminActionEnvelope(payload);
  assertAdminChannelPayload(channelPayload, {
    boundaryName: "control-plane channel payload",
  });
  const providerType = resolveProviderType(channelPayload);
  const channel = parseChannelInput(providerType, channelPayload);
  const result = await upsertChannelInput(pool, providerType, channel, actorUserId);
  const channelId = channel.channelId ?? result.createdChannelIds[0] ?? null;
  const providerLabel = formatAdminChannelProviderLabel(channel.providerType);

  if (channelId) {
    await writeAuditLog(pool, {
      actorUserId,
      actionType: channel.channelId ? "channel_updated" : "channel_created",
      entityType: "channel",
      entityId: channelId,
      payloadJson: {
        name: channel.name,
        isActive: channel.isActive,
        providerType: channel.providerType,
        pollIntervalSeconds: channel.pollIntervalSeconds,
      },
    });

    if (result.authConfiguredChannelIds.includes(channelId)) {
      await writeAuditLog(pool, {
        actorUserId,
        actionType: "channel_auth_configured",
        entityType: "channel",
        entityId: channelId,
        payloadJson: {
          providerType: channel.providerType,
        },
      });
    }

    if (result.authClearedChannelIds.includes(channelId)) {
      await writeAuditLog(pool, {
        actorUserId,
        actionType: "channel_auth_cleared",
        entityType: "channel",
        entityId: channelId,
        payloadJson: {
          providerType: channel.providerType,
        },
      });
    }
  }

  return {
    channelId,
    providerType,
    providerLabel,
    created: !channel.channelId,
    authConfigured: Boolean(channelId && result.authConfiguredChannelIds.includes(channelId)),
    authCleared: Boolean(channelId && result.authClearedChannelIds.includes(channelId)),
    createdChannelIds: result.createdChannelIds,
    updatedChannelIds: result.updatedChannelIds,
  };
}

export async function deleteChannelWithAudit(
  pool: Pool,
  actorUserId: string,
  channelId: string
): Promise<{
  mode: "delete" | "archive";
  storedItemCount: number;
  providerType: string;
  providerLabel: string;
}> {
  const result = await deleteOrArchiveSourceChannel(pool, channelId);
  const providerLabel = isAdminChannelProviderType(result.providerType)
    ? formatAdminChannelProviderLabel(result.providerType)
    : result.providerType;

  await writeAuditLog(pool, {
    actorUserId,
    actionType: result.mode === "delete" ? "channel_deleted" : "channel_archived",
    entityType: "channel",
    entityId: channelId,
    payloadJson: {
      storedItemCount: result.storedItemCount,
      mode: result.mode,
      providerType: result.providerType,
    },
  });

  return {
    ...result,
    providerLabel,
  };
}

export async function setChannelActiveStateWithAudit(
  pool: Pool,
  actorUserId: string,
  channelId: string,
  isActive: boolean,
  reason?: string | null
): Promise<{
  ok: true;
  channelId: string;
  name: string;
  providerType: string;
  providerLabel: string;
  isActive: boolean;
}> {
  const result = await pool.query(
    `
      update source_channels
         set is_active = $2,
             updated_at = now()
       where channel_id = $1::uuid
       returning channel_id::text as "channelId",
                 name,
                 provider_type as "providerType",
                 is_active as "isActive"
    `,
    [channelId, isActive]
  );
  const row = result.rows[0] as
    | {
        channelId: string;
        name: string;
        providerType: string;
        isActive: boolean;
      }
    | undefined;
  if (!row) {
    throw new Error(`Channel ${channelId} was not found.`);
  }

  const providerLabel = isAdminChannelProviderType(row.providerType)
    ? formatAdminChannelProviderLabel(row.providerType)
    : row.providerType;

  await writeAuditLog(pool, {
    actorUserId,
    actionType: isActive ? "channel_activated" : "channel_deactivated",
    entityType: "channel",
    entityId: channelId,
    payloadJson: {
      isActive,
      providerType: row.providerType,
      reason: reason ?? null,
    },
  });

  return {
    ok: true,
    channelId: row.channelId,
    name: row.name,
    providerType: row.providerType,
    providerLabel,
    isActive: row.isActive,
  };
}

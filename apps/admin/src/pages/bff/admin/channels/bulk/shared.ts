import type { Pool } from "pg";

import {
  ADMIN_CHANNEL_PROVIDER_TYPES,
  formatAdminChannelProviderLabel,
  isAdminChannelProviderType,
  type AdminChannelProviderType
} from "../../../../../lib/channel-providers";
import { getPool } from "../../../../../lib/server/db";
import {
  parseApiAdminChannelInput,
  planApiBulkImport,
  upsertApiChannels,
  type ApiBulkImportPlan,
  type NormalizedApiAdminChannelInput,
  type UpsertApiChannelsResult
} from "../../../../../lib/server/api-channels";
import {
  parseEmailImapAdminChannelInput,
  planEmailImapBulkImport,
  upsertEmailImapChannels,
  type EmailImapBulkImportPlan,
  type NormalizedEmailImapAdminChannelInput,
  type UpsertEmailImapChannelsResult
} from "../../../../../lib/server/email-imap-channels";
import {
  parseRssAdminChannelInput,
  planRssBulkImport,
  upsertRssChannels,
  type NormalizedRssAdminChannelInput,
  type RssBulkImportPlan,
  type UpsertRssChannelsResult
} from "../../../../../lib/server/rss-channels";
import {
  parseWebsiteAdminChannelInput,
  planWebsiteBulkImport,
  upsertWebsiteChannels,
  type NormalizedWebsiteAdminChannelInput,
  type UpsertWebsiteChannelsResult,
  type WebsiteBulkImportPlan
} from "../../../../../lib/server/website-channels";

export interface BulkPayload {
  channelsPayload: unknown;
  confirmOverwrite: boolean;
  redirectTo: string | null;
}

export type BulkImportChannel =
  | NormalizedRssAdminChannelInput
  | NormalizedWebsiteAdminChannelInput
  | NormalizedApiAdminChannelInput
  | NormalizedEmailImapAdminChannelInput;

export interface ParsedBulkImportChannel {
  index: number;
  providerType: AdminChannelProviderType;
  channel: BulkImportChannel;
}

type ProviderBulkImportPlan =
  | RssBulkImportPlan
  | WebsiteBulkImportPlan
  | ApiBulkImportPlan
  | EmailImapBulkImportPlan;

type ProviderBulkImportExecutionResult =
  | UpsertRssChannelsResult
  | UpsertWebsiteChannelsResult
  | UpsertApiChannelsResult
  | UpsertEmailImapChannelsResult;

type ProviderBulkImportPlanItem = {
  index: number;
  name: string;
  fetchUrl: string;
  action: "create" | "update";
  matchType: "create" | "channelId" | "fetchUrl";
  channelId: string | null;
  existingName: string | null;
  existingFetchUrl: string | null;
};

export interface BulkImportPlanItem extends ProviderBulkImportPlanItem {
  providerType: AdminChannelProviderType;
}

export interface BulkImportProviderBreakdown {
  providerType: AdminChannelProviderType;
  total: number;
  wouldCreate: number;
  wouldUpdate: number;
}

export interface BulkImportExecutionBreakdown {
  providerType: AdminChannelProviderType;
  createdCount: number;
  updatedCount: number;
}

export interface BulkImportPlan {
  channels: ParsedBulkImportChannel[];
  wouldCreate: number;
  wouldUpdate: number;
  matchedByChannelId: number;
  matchedByFetchUrl: number;
  items: BulkImportPlanItem[];
  providerBreakdown: BulkImportProviderBreakdown[];
}

export interface BulkImportExecutionResult {
  createdChannelIds: string[];
  updatedChannelIds: string[];
  authConfiguredChannelIds: string[];
  authClearedChannelIds: string[];
  providerBreakdown: BulkImportExecutionBreakdown[];
}

function readBulkImportProviderTypeHint(
  value: unknown
): AdminChannelProviderType | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  if (isAdminChannelProviderType(normalized)) {
    return normalized;
  }
  throw new Error(
    `Bulk import currently supports only ${ADMIN_CHANNEL_PROVIDER_TYPES.join(", ")} channels.`
  );
}

function resolveBulkImportRowProviderType(
  payload: Record<string, unknown>,
  index: number
): AdminChannelProviderType {
  const providerType =
    readBulkImportProviderTypeHint(payload.providerType) ??
    readBulkImportProviderTypeHint(payload.provider_type);
  if (!providerType) {
    throw new Error(
      `Bulk channel at index ${index} must include providerType (${ADMIN_CHANNEL_PROVIDER_TYPES.join(", ")}).`
    );
  }
  return providerType;
}

function readConfirmedOverwrite(value: unknown): boolean {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

export async function readBulkPayload(request: Request): Promise<BulkPayload> {
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

    if (
      payload != null &&
      typeof payload === "object" &&
      Array.isArray((payload as { channels?: unknown }).channels)
    ) {
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

    throw new Error('Bulk import payload must be a JSON array or an object with "channels".');
  }

  const formData = await request.formData();
  const rawJson = String(formData.get("channelsJson") ?? "").trim();

  if (!rawJson) {
    throw new Error('Bulk import form payload must include "channelsJson".');
  }

  try {
    return {
      channelsPayload: JSON.parse(rawJson) as unknown,
      confirmOverwrite: readConfirmedOverwrite(formData.get("confirmOverwrite")),
      redirectTo: String(formData.get("redirectTo") ?? "").trim() || null
    };
  } catch {
    throw new Error("Bulk import form payload must contain valid JSON.");
  }
}

export function parseBulkChannels(
  channelsPayload: unknown
): ParsedBulkImportChannel[] {
  if (!Array.isArray(channelsPayload)) {
    throw new Error("Bulk import payload must be a JSON array of channel objects.");
  }

  if (channelsPayload.length === 0) {
    throw new Error("Bulk import payload must include at least one channel.");
  }

  return channelsPayload.map((row, index) => {
    if (row == null || typeof row !== "object" || Array.isArray(row)) {
      throw new Error(`Bulk channel at index ${index} must be an object.`);
    }

    const payload = row as Record<string, unknown>;
    try {
      const providerType = resolveBulkImportRowProviderType(payload, index);

      switch (providerType) {
        case "website":
          return {
            index,
            providerType,
            channel: parseWebsiteAdminChannelInput(payload)
          };
        case "api":
          return {
            index,
            providerType,
            channel: parseApiAdminChannelInput(payload)
          };
        case "email_imap":
          return {
            index,
            providerType,
            channel: parseEmailImapAdminChannelInput(payload)
          };
        case "rss":
        default:
          return {
            index,
            providerType,
            channel: parseRssAdminChannelInput(payload)
          };
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown bulk validation failure";
      throw new Error(`Bulk channel at index ${index} is invalid: ${message}`, {
        cause: error
      });
    }
  });
}

function groupParsedBulkChannels(
  channels: ParsedBulkImportChannel[]
): Map<AdminChannelProviderType, ParsedBulkImportChannel[]> {
  const grouped = new Map<AdminChannelProviderType, ParsedBulkImportChannel[]>();

  for (const channel of channels) {
    const existing = grouped.get(channel.providerType);
    if (existing) {
      existing.push(channel);
      continue;
    }
    grouped.set(channel.providerType, [channel]);
  }

  return grouped;
}

function sortProviderBreakdown<T extends { providerType: AdminChannelProviderType }>(
  breakdown: T[]
): T[] {
  return [...breakdown].sort(
    (left, right) =>
      ADMIN_CHANNEL_PROVIDER_TYPES.indexOf(left.providerType) -
      ADMIN_CHANNEL_PROVIDER_TYPES.indexOf(right.providerType)
  );
}

async function planProviderGroup(
  pool: Pool,
  providerType: AdminChannelProviderType,
  channels: ParsedBulkImportChannel[]
): Promise<ProviderBulkImportPlan> {
  switch (providerType) {
    case "website":
      return planWebsiteBulkImport(
        pool,
        channels.map((channel) => channel.channel as NormalizedWebsiteAdminChannelInput)
      );
    case "api":
      return planApiBulkImport(
        pool,
        channels.map((channel) => channel.channel as NormalizedApiAdminChannelInput)
      );
    case "email_imap":
      return planEmailImapBulkImport(
        pool,
        channels.map((channel) => channel.channel as NormalizedEmailImapAdminChannelInput)
      );
    case "rss":
    default:
      return planRssBulkImport(
        pool,
        channels.map((channel) => channel.channel as NormalizedRssAdminChannelInput)
      );
  }
}

export async function planBulkImportWithPool(
  pool: Pool,
  channels: ParsedBulkImportChannel[]
): Promise<BulkImportPlan> {
  const grouped = groupParsedBulkChannels(channels);
  const plannedChannels = new Array<ParsedBulkImportChannel>(channels.length);
  const items: BulkImportPlanItem[] = [];
  const providerBreakdown: BulkImportProviderBreakdown[] = [];
  let wouldCreate = 0;
  let wouldUpdate = 0;
  let matchedByChannelId = 0;
  let matchedByFetchUrl = 0;

  for (const providerType of ADMIN_CHANNEL_PROVIDER_TYPES) {
    const providerChannels = grouped.get(providerType) ?? [];
    if (providerChannels.length === 0) {
      continue;
    }

    const plan = await planProviderGroup(pool, providerType, providerChannels);
    providerBreakdown.push({
      providerType,
      total: providerChannels.length,
      wouldCreate: plan.wouldCreate,
      wouldUpdate: plan.wouldUpdate
    });
    wouldCreate += plan.wouldCreate;
    wouldUpdate += plan.wouldUpdate;
    matchedByChannelId += plan.matchedByChannelId;
    matchedByFetchUrl += plan.matchedByFetchUrl;

    plan.channels.forEach((channel, localIndex) => {
      const original = providerChannels[localIndex];
      plannedChannels[original.index] = {
        index: original.index,
        providerType,
        channel
      };
    });

    (plan.items as ProviderBulkImportPlanItem[]).forEach((item) => {
      const original = providerChannels[item.index];
      items.push({
        ...item,
        index: original.index,
        providerType
      });
    });
  }

  return {
    channels: plannedChannels,
    wouldCreate,
    wouldUpdate,
    matchedByChannelId,
    matchedByFetchUrl,
    items: items.sort((left, right) => left.index - right.index),
    providerBreakdown: sortProviderBreakdown(providerBreakdown)
  };
}

export async function planBulkImport(
  channels: ParsedBulkImportChannel[]
): Promise<BulkImportPlan> {
  return planBulkImportWithPool(getPool(), channels);
}

async function executeProviderGroup(
  pool: Pool,
  providerType: AdminChannelProviderType,
  channels: ParsedBulkImportChannel[]
): Promise<ProviderBulkImportExecutionResult> {
  switch (providerType) {
    case "website":
      return upsertWebsiteChannels(
        pool,
        channels.map((channel) => channel.channel as NormalizedWebsiteAdminChannelInput)
      );
    case "api":
      return upsertApiChannels(
        pool,
        channels.map((channel) => channel.channel as NormalizedApiAdminChannelInput)
      );
    case "email_imap":
      return upsertEmailImapChannels(
        pool,
        channels.map((channel) => channel.channel as NormalizedEmailImapAdminChannelInput)
      );
    case "rss":
    default:
      return upsertRssChannels(
        pool,
        channels.map((channel) => channel.channel as NormalizedRssAdminChannelInput)
      );
  }
}

export async function executeBulkImportWithPool(
  pool: Pool,
  channels: ParsedBulkImportChannel[]
): Promise<BulkImportExecutionResult> {
  const grouped = groupParsedBulkChannels(channels);
  const createdChannelIds: string[] = [];
  const updatedChannelIds: string[] = [];
  const authConfiguredChannelIds: string[] = [];
  const authClearedChannelIds: string[] = [];
  const providerBreakdown: BulkImportExecutionBreakdown[] = [];

  for (const providerType of ADMIN_CHANNEL_PROVIDER_TYPES) {
    const providerChannels = grouped.get(providerType) ?? [];
    if (providerChannels.length === 0) {
      continue;
    }

    const result = await executeProviderGroup(pool, providerType, providerChannels);
    createdChannelIds.push(...result.createdChannelIds);
    updatedChannelIds.push(...result.updatedChannelIds);
    authConfiguredChannelIds.push(...result.authConfiguredChannelIds);
    authClearedChannelIds.push(...result.authClearedChannelIds);
    providerBreakdown.push({
      providerType,
      createdCount: result.createdChannelIds.length,
      updatedCount: result.updatedChannelIds.length
    });
  }

  return {
    createdChannelIds,
    updatedChannelIds,
    authConfiguredChannelIds,
    authClearedChannelIds,
    providerBreakdown: sortProviderBreakdown(providerBreakdown)
  };
}

export async function executeBulkImport(
  channels: ParsedBulkImportChannel[]
): Promise<BulkImportExecutionResult> {
  return executeBulkImportWithPool(getPool(), channels);
}

function formatBulkImportProviderSummary(
  providerBreakdown: Array<
    BulkImportProviderBreakdown | BulkImportExecutionBreakdown
  >
): string {
  return providerBreakdown
    .map((item) => {
      const total =
        "total" in item
          ? item.total
          : item.createdCount + item.updatedCount;
      return `${formatAdminChannelProviderLabel(item.providerType)} ${total}`;
    })
    .join(", ");
}

export function formatBulkImportSuccessMessage(
  result: BulkImportExecutionResult
): string {
  const createdCount = result.createdChannelIds.length;
  const updatedCount = result.updatedChannelIds.length;
  const providerSummary = formatBulkImportProviderSummary(result.providerBreakdown);

  if (updatedCount > 0) {
    return `Imported ${createdCount} new channel${createdCount === 1 ? "" : "s"} and updated ${updatedCount} existing channel${updatedCount === 1 ? "" : "s"}${providerSummary ? ` (${providerSummary})` : ""}`;
  }

  return `Imported ${createdCount} channel${createdCount === 1 ? "" : "s"}${providerSummary ? ` (${providerSummary})` : ""}`;
}

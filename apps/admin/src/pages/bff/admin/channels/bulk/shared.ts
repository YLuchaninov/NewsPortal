import { formatAdminChannelProviderLabel } from "../../../../../lib/channel-providers";
import { getPool } from "../../../../../lib/server/db";
import {
  parseBulkRssAdminChannelInputs,
  planRssBulkImport,
  upsertRssChannels,
  type NormalizedRssAdminChannelInput,
  type RssBulkImportPlan
} from "../../../../../lib/server/rss-channels";
import {
  parseBulkWebsiteAdminChannelInputs,
  planWebsiteBulkImport,
  upsertWebsiteChannels,
  type NormalizedWebsiteAdminChannelInput,
  type WebsiteBulkImportPlan
} from "../../../../../lib/server/website-channels";

export type BulkImportProviderType = "rss" | "website";

export interface BulkPayload {
  providerType: BulkImportProviderType;
  channelsPayload: unknown;
  confirmOverwrite: boolean;
  redirectTo: string | null;
}

export type BulkImportPlan = RssBulkImportPlan | WebsiteBulkImportPlan;
export type BulkImportChannels =
  | NormalizedRssAdminChannelInput[]
  | NormalizedWebsiteAdminChannelInput[];

function resolveBulkImportProviderType(value: unknown): BulkImportProviderType {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized || normalized === "rss") {
    return "rss";
  }
  if (normalized === "website") {
    return "website";
  }
  throw new Error("Bulk import currently supports only RSS and website channels.");
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
        providerType: "rss",
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
        providerType?: unknown;
        channels: unknown[];
        confirmOverwrite?: unknown;
        redirectTo?: unknown;
      };

      return {
        providerType: resolveBulkImportProviderType(bulkPayload.providerType),
        channelsPayload: bulkPayload.channels,
        confirmOverwrite: readConfirmedOverwrite(bulkPayload.confirmOverwrite),
        redirectTo: String(bulkPayload.redirectTo ?? "").trim() || null
      };
    }

    throw new Error(
      'Bulk import payload must be a JSON array or an object with "providerType" and "channels".'
    );
  }

  const formData = await request.formData();
  const rawJson = String(formData.get("channelsJson") ?? "").trim();

  if (!rawJson) {
    throw new Error('Bulk import form payload must include "channelsJson".');
  }

  try {
    return {
      providerType: resolveBulkImportProviderType(formData.get("providerType")),
      channelsPayload: JSON.parse(rawJson) as unknown,
      confirmOverwrite: readConfirmedOverwrite(formData.get("confirmOverwrite")),
      redirectTo: String(formData.get("redirectTo") ?? "").trim() || null
    };
  } catch {
    throw new Error("Bulk import form payload must contain valid JSON.");
  }
}

export function parseBulkChannels(
  providerType: BulkImportProviderType,
  channelsPayload: unknown
): BulkImportChannels {
  switch (providerType) {
    case "website":
      return parseBulkWebsiteAdminChannelInputs(channelsPayload);
    case "rss":
    default:
      return parseBulkRssAdminChannelInputs(channelsPayload);
  }
}

export async function planBulkImport(
  providerType: BulkImportProviderType,
  channels: BulkImportChannels
): Promise<BulkImportPlan> {
  const pool = getPool();
  switch (providerType) {
    case "website":
      return planWebsiteBulkImport(
        pool,
        channels as NormalizedWebsiteAdminChannelInput[]
      );
    case "rss":
    default:
      return planRssBulkImport(pool, channels as NormalizedRssAdminChannelInput[]);
  }
}

export async function executeBulkImport(
  providerType: BulkImportProviderType,
  channels: BulkImportChannels
) {
  const pool = getPool();
  switch (providerType) {
    case "website":
      return upsertWebsiteChannels(
        pool,
        channels as NormalizedWebsiteAdminChannelInput[]
      );
    case "rss":
    default:
      return upsertRssChannels(pool, channels as NormalizedRssAdminChannelInput[]);
  }
}

export function formatBulkImportSuccessMessage(
  providerType: BulkImportProviderType,
  createdCount: number,
  updatedCount: number
): string {
  const providerLabel = formatAdminChannelProviderLabel(providerType);
  if (updatedCount > 0) {
    return `Imported ${createdCount} new ${providerLabel.toLowerCase()} channel${createdCount === 1 ? "" : "s"} and updated ${updatedCount} existing channel${updatedCount === 1 ? "" : "s"}`;
  }
  return `${providerLabel} channels imported`;
}

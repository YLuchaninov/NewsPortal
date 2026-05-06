import {
  executeBulkImportWithPool,
  formatBulkImportSuccessMessage,
  parseBulkChannels,
  planBulkImportWithPool,
  type BulkImportChannel,
  type BulkImportExecutionBreakdown,
  type BulkImportExecutionResult,
  type BulkImportPlan,
  type BulkImportPlanItem,
  type BulkImportProviderBreakdown,
  type ParsedBulkImportChannel
} from "@newsportal/control-plane";

import { getPool } from "../../../../../lib/server/db";

export type {
  BulkImportChannel,
  BulkImportExecutionBreakdown,
  BulkImportExecutionResult,
  BulkImportPlan,
  BulkImportPlanItem,
  BulkImportProviderBreakdown,
  ParsedBulkImportChannel
};

export { formatBulkImportSuccessMessage, parseBulkChannels };
export { executeBulkImportWithPool, planBulkImportWithPool };

export interface BulkPayload extends Record<string, unknown> {
  channelsPayload: unknown;
  confirmOverwrite: boolean;
  redirectTo: string | null;
}

function readConfirmedOverwrite(value: unknown): boolean {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

function isAdminActionTokenPayloadKey(key: string): boolean {
  return (
    key === "adminActionToken" ||
    key === "_adminActionToken" ||
    key === "adminActionTokens" ||
    key.startsWith("adminActionToken:") ||
    key.startsWith("adminActionToken_")
  );
}

function readAdminActionTokenPayloadFields(
  payload: Record<string, unknown>
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(payload).filter(([key]) => isAdminActionTokenPayloadKey(key))
  );
}

function readAdminActionTokenFormFields(formData: FormData): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const key of [
    "adminActionToken",
    "_adminActionToken",
    "adminActionTokens",
    "adminActionToken:channels.bulk",
    "adminActionToken_channels_bulk"
  ]) {
    const value = formData.get(key);
    if (value !== null) {
      fields[key] = value;
    }
  }
  return fields;
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
        redirectTo: String(bulkPayload.redirectTo ?? "").trim() || null,
        ...readAdminActionTokenPayloadFields(payload as Record<string, unknown>)
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
      redirectTo: String(formData.get("redirectTo") ?? "").trim() || null,
      ...readAdminActionTokenFormFields(formData)
    };
  } catch {
    throw new Error("Bulk import form payload must contain valid JSON.");
  }
}

export async function planBulkImport(
  channels: ParsedBulkImportChannel[]
): Promise<BulkImportPlan> {
  return planBulkImportWithPool(getPool(), channels);
}

export async function executeBulkImport(
  channels: ParsedBulkImportChannel[]
): Promise<BulkImportExecutionResult> {
  return executeBulkImportWithPool(getPool(), channels);
}

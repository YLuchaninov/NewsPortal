import {
  normalizeMaxPollIntervalSeconds,
  isBetaIngestProviderType,
  type SourceProviderType
} from "@signalops/contracts";
import { resetSourceChannelRuntimeStateForManualSchedule } from "@signalops/control-plane";
import type { Pool } from "pg";

export interface ChannelSchedulePatchInput {
  channelIds: string[];
  providerType: SourceProviderType | null;
  pollIntervalSeconds: number;
  adaptiveEnabled: boolean;
  maxPollIntervalSeconds: number;
}

function readOptionalString(value: unknown): string | null {
  if (value == null) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized ? normalized : null;
}

function readBoolean(value: unknown, fallback: boolean, fieldName: string): boolean {
  if (value == null || value === "") {
    return fallback;
  }
  if (typeof value === "boolean") {
    return value;
  }

  const normalized = String(value).trim().toLowerCase();
  if (normalized === "true") {
    return true;
  }
  if (normalized === "false") {
    return false;
  }

  throw new Error(`Scheduling field "${fieldName}" must be a boolean.`);
}

function readPositiveInteger(value: unknown, fieldName: string): number {
  const parsed =
    typeof value === "number" && Number.isInteger(value)
      ? value
      : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Scheduling field "${fieldName}" must be a positive integer.`);
  }
  return parsed;
}

function readOptionalPositiveInteger(value: unknown, fieldName: string): number | null {
  if (value == null || value === "") {
    return null;
  }
  return readPositiveInteger(value, fieldName);
}

function parseChannelIds(payload: Record<string, unknown>): string[] {
  const rawJson = readOptionalString(payload.channelIdsJson);
  if (rawJson) {
    const parsed = JSON.parse(rawJson) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error('Scheduling field "channelIdsJson" must be a JSON array.');
    }

    return parsed
      .map((value) => String(value).trim())
      .filter(Boolean);
  }

  const rawCsv = readOptionalString(payload.channelIdsCsv);
  if (!rawCsv) {
    return [];
  }

  return rawCsv
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function parseChannelSchedulePatchInput(
  payload: Record<string, unknown>
): ChannelSchedulePatchInput {
  const pollIntervalSeconds = readPositiveInteger(
    payload.pollIntervalSeconds,
    "pollIntervalSeconds"
  );
  const providerTypeRaw = readOptionalString(payload.providerType);
  const providerType =
    providerTypeRaw && isBetaIngestProviderType(providerTypeRaw)
      ? providerTypeRaw
      : providerTypeRaw
        ? (() => {
            throw new Error(`Unsupported providerType "${providerTypeRaw}".`);
          })()
        : null;
  const channelIds = parseChannelIds(payload);

  if (channelIds.length === 0 && !providerType) {
    throw new Error("Scheduling patch requires channelIds or providerType.");
  }

  return {
    channelIds,
    providerType,
    pollIntervalSeconds,
    adaptiveEnabled: readBoolean(payload.adaptiveEnabled, true, "adaptiveEnabled"),
    maxPollIntervalSeconds: normalizeMaxPollIntervalSeconds(
      pollIntervalSeconds,
      readOptionalPositiveInteger(payload.maxPollIntervalSeconds, "maxPollIntervalSeconds")
    )
  };
}

export async function applyChannelSchedulePatch(
  pool: Pool,
  patch: ChannelSchedulePatchInput
): Promise<{ updatedCount: number }> {
  const client = await pool.connect();

  try {
    await client.query("begin");

    const predicateSql =
      patch.channelIds.length > 0
        ? `
            where channel_id = any($1::uuid[])
              ${patch.providerType ? "and provider_type = $2" : ""}
          `
        : `
            where provider_type = $1
          `;
    const predicateParams =
      patch.channelIds.length > 0
        ? patch.providerType
          ? [patch.channelIds, patch.providerType]
          : [patch.channelIds]
        : [patch.providerType];

    const updated = await client.query<{ channel_id: string }>(
      `
        update source_channels
        set
          poll_interval_seconds = $${predicateParams.length + 1},
          updated_at = now()
        ${predicateSql}
        returning channel_id::text
      `,
      [...predicateParams, patch.pollIntervalSeconds]
    );

    if (updated.rowCount === 0) {
      throw new Error("Scheduling patch did not match any channels.");
    }

    for (const row of updated.rows) {
      await resetSourceChannelRuntimeStateForManualSchedule(client, {
        channelId: row.channel_id,
        adaptiveEnabled: patch.adaptiveEnabled,
        pollIntervalSeconds: patch.pollIntervalSeconds,
        maxPollIntervalSeconds: patch.maxPollIntervalSeconds
      });
    }

    await client.query("commit");
    return {
      updatedCount: updated.rowCount ?? 0
    };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

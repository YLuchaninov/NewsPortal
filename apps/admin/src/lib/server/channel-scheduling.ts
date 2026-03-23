import {
  normalizeMaxPollIntervalSeconds,
  type SourceProviderType
} from "@newsportal/contracts";
import type { Pool } from "pg";

const ALLOWED_PROVIDER_TYPES: SourceProviderType[] = [
  "rss",
  "website",
  "api",
  "email_imap",
  "youtube"
];

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
    providerTypeRaw && ALLOWED_PROVIDER_TYPES.includes(providerTypeRaw as SourceProviderType)
      ? (providerTypeRaw as SourceProviderType)
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
      await client.query(
        `
          insert into source_channel_runtime_state (
            channel_id,
            adaptive_enabled,
            effective_poll_interval_seconds,
            max_poll_interval_seconds,
            next_due_at,
            adaptive_step,
            last_result_kind,
            consecutive_no_change_polls,
            consecutive_failures,
            adaptive_reason,
            updated_at
          )
          values ($1, $2, $3, $4, now() + make_interval(secs => $3), 0, null, 0, 0, 'manual_schedule_reset', now())
          on conflict (channel_id)
          do update
          set
            adaptive_enabled = excluded.adaptive_enabled,
            effective_poll_interval_seconds = excluded.effective_poll_interval_seconds,
            max_poll_interval_seconds = excluded.max_poll_interval_seconds,
            next_due_at = excluded.next_due_at,
            adaptive_step = excluded.adaptive_step,
            last_result_kind = excluded.last_result_kind,
            consecutive_no_change_polls = excluded.consecutive_no_change_polls,
            consecutive_failures = excluded.consecutive_failures,
            adaptive_reason = excluded.adaptive_reason,
            updated_at = excluded.updated_at
        `,
        [
          row.channel_id,
          patch.adaptiveEnabled,
          patch.pollIntervalSeconds,
          patch.maxPollIntervalSeconds
        ]
      );
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

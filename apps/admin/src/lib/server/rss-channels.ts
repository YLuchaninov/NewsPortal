import { randomUUID } from "node:crypto";

import {
  normalizeMaxPollIntervalSeconds,
  parseRssChannelConfig,
  type RssChannelConfig
} from "@newsportal/contracts";
import type { Pool } from "pg";

const DEFAULT_RSS_CONFIG = parseRssChannelConfig({});
const DEFAULT_LANGUAGE = "en";
const DEFAULT_POLL_INTERVAL_SECONDS = 300;

export interface NormalizedRssAdminChannelInput {
  channelId?: string;
  providerType: "rss";
  name: string;
  fetchUrl: string;
  language: string | null;
  isActive: boolean;
  pollIntervalSeconds: number;
  adaptiveEnabled: boolean;
  maxPollIntervalSeconds: number;
  maxItemsPerPoll: number;
  requestTimeoutMs: number;
  userAgent: string;
  preferContentEncoded: boolean;
}

export interface UpsertRssChannelsResult {
  createdChannelIds: string[];
  updatedChannelIds: string[];
}

export type RssChannelDeleteMode = "delete" | "archive";

export interface DeleteOrArchiveRssChannelResult {
  mode: RssChannelDeleteMode;
  articleCount: number;
}

function readOptionalString(value: unknown): string | null {
  if (value == null) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized ? normalized : null;
}

function readRequiredString(value: unknown, fieldName: string): string {
  const normalized = readOptionalString(value);
  if (!normalized) {
    throw new Error(`RSS channel field "${fieldName}" is required.`);
  }
  return normalized;
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

  throw new Error(`RSS channel field "${fieldName}" must be a boolean.`);
}

function readPositiveInteger(value: unknown, fallback: number, fieldName: string): number {
  if (value == null || value === "") {
    return fallback;
  }

  const parsed =
    typeof value === "number" && Number.isInteger(value) ? value : Number.parseInt(String(value), 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`RSS channel field "${fieldName}" must be a positive integer.`);
  }

  return parsed;
}

function readOptionalPositiveInteger(value: unknown, fieldName: string): number | null {
  if (value == null || value === "") {
    return null;
  }

  const parsed =
    typeof value === "number" && Number.isInteger(value) ? value : Number.parseInt(String(value), 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`RSS channel field "${fieldName}" must be a positive integer.`);
  }

  return parsed;
}

function validateHttpUrl(rawUrl: string): string {
  let parsed: URL;

  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('RSS channel field "fetchUrl" must be a valid absolute URL.');
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error('RSS channel field "fetchUrl" must use http or https.');
  }

  return parsed.toString();
}

function normalizeRssConfig(payload: Record<string, unknown>): RssChannelConfig {
  return parseRssChannelConfig({
    maxItemsPerPoll: readPositiveInteger(
      payload.maxItemsPerPoll,
      DEFAULT_RSS_CONFIG.maxItemsPerPoll,
      "maxItemsPerPoll"
    ),
    requestTimeoutMs: readPositiveInteger(
      payload.requestTimeoutMs,
      DEFAULT_RSS_CONFIG.requestTimeoutMs,
      "requestTimeoutMs"
    ),
    userAgent: readOptionalString(payload.userAgent) ?? DEFAULT_RSS_CONFIG.userAgent,
    preferContentEncoded: readBoolean(
      payload.preferContentEncoded,
      DEFAULT_RSS_CONFIG.preferContentEncoded,
      "preferContentEncoded"
    )
  });
}

export function parseRssAdminChannelInput(payload: Record<string, unknown>): NormalizedRssAdminChannelInput {
  const providerType = readOptionalString(payload.providerType) ?? "rss";
  if (providerType !== "rss") {
    throw new Error("Only RSS channels are supported by this admin surface.");
  }

  const config = normalizeRssConfig(payload);
  const pollIntervalSeconds = readPositiveInteger(
    payload.pollIntervalSeconds,
    DEFAULT_POLL_INTERVAL_SECONDS,
    "pollIntervalSeconds"
  );
  const maxPollIntervalSeconds = normalizeMaxPollIntervalSeconds(
    pollIntervalSeconds,
    readOptionalPositiveInteger(payload.maxPollIntervalSeconds, "maxPollIntervalSeconds")
  );

  return {
    channelId: readOptionalString(payload.channelId) ?? undefined,
    providerType: "rss",
    name: readRequiredString(payload.name, "name"),
    fetchUrl: validateHttpUrl(readRequiredString(payload.fetchUrl, "fetchUrl")),
    language: readOptionalString(payload.language) ?? DEFAULT_LANGUAGE,
    isActive: readBoolean(payload.isActive, true, "isActive"),
    pollIntervalSeconds,
    adaptiveEnabled: readBoolean(payload.adaptiveEnabled, true, "adaptiveEnabled"),
    maxPollIntervalSeconds,
    maxItemsPerPoll: config.maxItemsPerPoll,
    requestTimeoutMs: config.requestTimeoutMs,
    userAgent: config.userAgent,
    preferContentEncoded: config.preferContentEncoded
  };
}

export function parseBulkRssAdminChannelInputs(payload: unknown): NormalizedRssAdminChannelInput[] {
  if (!Array.isArray(payload)) {
    throw new Error('Bulk RSS payload must contain a "channels" array.');
  }

  return payload.map((entry, index) => {
    if (entry == null || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`Bulk RSS channel at index ${index} must be an object.`);
    }

    try {
      return parseRssAdminChannelInput(entry as Record<string, unknown>);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown bulk RSS validation failure";
      throw new Error(`Bulk RSS channel at index ${index} is invalid: ${message}`, {
        cause: error
      });
    }
  });
}

export function resolveRssChannelDeleteMode(articleCount: number): RssChannelDeleteMode {
  return articleCount > 0 ? "archive" : "delete";
}

export function countRssChannelsRequiringOverwriteConfirmation(
  channels: NormalizedRssAdminChannelInput[]
): number {
  return channels.filter((channel) => Boolean(channel.channelId)).length;
}

export async function upsertRssChannels(
  pool: Pool,
  channels: NormalizedRssAdminChannelInput[]
): Promise<UpsertRssChannelsResult> {
  const providerLookup = await pool.query<{ provider_id: string }>(
    `
      select provider_id::text as provider_id
      from source_providers
      where provider_type = 'rss'
      limit 1
    `
  );
  const providerId = providerLookup.rows[0]?.provider_id ?? null;
  const client = await pool.connect();
  const createdChannelIds: string[] = [];
  const updatedChannelIds: string[] = [];

  try {
    await client.query("begin");

    for (const channel of channels) {
      const configJson = JSON.stringify({
        maxItemsPerPoll: channel.maxItemsPerPoll,
        requestTimeoutMs: channel.requestTimeoutMs,
        userAgent: channel.userAgent,
        preferContentEncoded: channel.preferContentEncoded
      });

      if (channel.channelId) {
        const updateResult = await client.query(
          `
            update source_channels
            set
              provider_id = $2,
              provider_type = 'rss',
              name = $3,
              fetch_url = $4,
              language = $5,
              is_active = $6,
              poll_interval_seconds = $7,
              config_json = $8::jsonb,
              updated_at = now()
            where channel_id = $1
          `,
          [
            channel.channelId,
            providerId,
            channel.name,
            channel.fetchUrl,
            channel.language,
            channel.isActive,
            channel.pollIntervalSeconds,
            configJson
          ]
        );
        if (updateResult.rowCount !== 1) {
          throw new Error(`RSS channel ${channel.channelId} was not found.`);
        }
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
            channel.channelId,
            channel.adaptiveEnabled,
            channel.pollIntervalSeconds,
            channel.maxPollIntervalSeconds
          ]
        );
        updatedChannelIds.push(channel.channelId);
        continue;
      }

      const channelId = randomUUID();
      await client.query(
        `
          insert into source_channels (
            channel_id,
            provider_id,
            provider_type,
            name,
            fetch_url,
            language,
            is_active,
            poll_interval_seconds,
            config_json
          )
          values ($1, $2, 'rss', $3, $4, $5, $6, $7, $8::jsonb)
        `,
        [
          channelId,
          providerId,
          channel.name,
          channel.fetchUrl,
          channel.language,
          channel.isActive,
          channel.pollIntervalSeconds,
          configJson
        ]
      );
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
          values ($1, $2, $3, $4, now(), 0, null, 0, 0, null, now())
          on conflict (channel_id) do nothing
        `,
        [
          channelId,
          channel.adaptiveEnabled,
          channel.pollIntervalSeconds,
          channel.maxPollIntervalSeconds
        ]
      );
      createdChannelIds.push(channelId);
    }

    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }

  return {
    createdChannelIds,
    updatedChannelIds
  };
}

export async function deleteOrArchiveRssChannel(
  pool: Pool,
  channelId: string
): Promise<DeleteOrArchiveRssChannelResult> {
  const client = await pool.connect();

  try {
    await client.query("begin");

    const channelLookup = await client.query<{ article_count: number }>(
      `
        select (
          select count(*)::int
          from articles a
          where a.channel_id = sc.channel_id
        ) as article_count
        from source_channels sc
        where sc.channel_id = $1
          and sc.provider_type = 'rss'
        limit 1
      `,
      [channelId]
    );

    const articleCount = channelLookup.rows[0]?.article_count;
    if (articleCount == null) {
      throw new Error(`RSS channel ${channelId} was not found.`);
    }

    const mode = resolveRssChannelDeleteMode(articleCount);
    if (mode === "archive") {
      await client.query(
        `
          update source_channels
          set
            is_active = false,
            updated_at = now()
          where channel_id = $1
        `,
        [channelId]
      );
      await client.query(
        `
          update source_channel_runtime_state
          set
            next_due_at = null,
            adaptive_reason = 'archived_from_admin',
            updated_at = now()
          where channel_id = $1
        `,
        [channelId]
      );
    } else {
      const deleted = await client.query(
        `
          delete from source_channels
          where channel_id = $1
            and provider_type = 'rss'
          returning channel_id
        `,
        [channelId]
      );
      if (deleted.rowCount !== 1) {
        throw new Error(`RSS channel ${channelId} was not found.`);
      }
    }

    await client.query("commit");

    return {
      mode,
      articleCount
    };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

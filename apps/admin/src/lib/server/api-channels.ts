import { randomUUID } from "node:crypto";

import {
  DEFAULT_CHANNEL_ENRICHMENT_MIN_BODY_LENGTH,
  normalizeMaxPollIntervalSeconds,
  parseApiChannelConfig,
  parseSourceChannelAuthConfig,
  serializeSourceChannelAuthConfig,
  type ApiChannelConfig,
} from "@newsportal/contracts";
import type { Pool } from "pg";

const DEFAULT_API_CONFIG = parseApiChannelConfig({});
const DEFAULT_LANGUAGE = "en";
const DEFAULT_POLL_INTERVAL_SECONDS = 300;

type AuthorizationHeaderUpdateMode = "preserve" | "replace" | "clear" | "disabled";

interface AuthorizationHeaderUpdate {
  mode: AuthorizationHeaderUpdateMode;
  authorizationHeader: string | null;
}

export interface NormalizedApiAdminChannelInput {
  channelId?: string;
  providerType: "api";
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
  itemsPath: string;
  titleField: string;
  leadField: string;
  bodyField: string;
  urlField: string;
  publishedAtField: string;
  externalIdField: string;
  languageField: string;
  enrichmentEnabled: boolean;
  enrichmentMinBodyLength: number;
  authorizationHeaderUpdate: AuthorizationHeaderUpdate;
}

export interface UpsertApiChannelsResult {
  createdChannelIds: string[];
  updatedChannelIds: string[];
  authConfiguredChannelIds: string[];
  authClearedChannelIds: string[];
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
    throw new Error(`API channel field "${fieldName}" is required.`);
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

  throw new Error(`API channel field "${fieldName}" must be a boolean.`);
}

function readPositiveInteger(value: unknown, fallback: number, fieldName: string): number {
  if (value == null || value === "") {
    return fallback;
  }

  const parsed =
    typeof value === "number" && Number.isInteger(value) ? value : Number.parseInt(String(value), 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`API channel field "${fieldName}" must be a positive integer.`);
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
    throw new Error(`API channel field "${fieldName}" must be a positive integer.`);
  }

  return parsed;
}

function validateHttpUrl(rawUrl: string): string {
  let parsed: URL;

  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('API channel field "fetchUrl" must be a valid absolute URL.');
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error('API channel field "fetchUrl" must use http or https.');
  }

  return parsed.toString();
}

function normalizeApiConfig(payload: Record<string, unknown>): ApiChannelConfig {
  return parseApiChannelConfig({
    maxItemsPerPoll: readPositiveInteger(
      payload.maxItemsPerPoll,
      DEFAULT_API_CONFIG.maxItemsPerPoll,
      "maxItemsPerPoll"
    ),
    requestTimeoutMs: readPositiveInteger(
      payload.requestTimeoutMs,
      DEFAULT_API_CONFIG.requestTimeoutMs,
      "requestTimeoutMs"
    ),
    userAgent: readOptionalString(payload.userAgent) ?? DEFAULT_API_CONFIG.userAgent,
    itemsPath: readRequiredString(payload.itemsPath ?? DEFAULT_API_CONFIG.itemsPath, "itemsPath"),
    titleField: readRequiredString(payload.titleField ?? DEFAULT_API_CONFIG.titleField, "titleField"),
    leadField: readRequiredString(payload.leadField ?? DEFAULT_API_CONFIG.leadField, "leadField"),
    bodyField: readRequiredString(payload.bodyField ?? DEFAULT_API_CONFIG.bodyField, "bodyField"),
    urlField: readRequiredString(payload.urlField ?? DEFAULT_API_CONFIG.urlField, "urlField"),
    publishedAtField: readRequiredString(
      payload.publishedAtField ?? DEFAULT_API_CONFIG.publishedAtField,
      "publishedAtField"
    ),
    externalIdField: readRequiredString(
      payload.externalIdField ?? DEFAULT_API_CONFIG.externalIdField,
      "externalIdField"
    ),
    languageField: readRequiredString(
      payload.languageField ?? DEFAULT_API_CONFIG.languageField,
      "languageField"
    ),
  });
}

function resolveAuthorizationHeaderUpdate(
  payload: Record<string, unknown>,
  isUpdate: boolean
): AuthorizationHeaderUpdate {
  const authorizationHeader = readOptionalString(payload.authorizationHeader);
  const clearAuthorizationHeader = readBoolean(
    payload.clearAuthorizationHeader,
    false,
    "clearAuthorizationHeader"
  );

  if (clearAuthorizationHeader) {
    return {
      mode: "clear",
      authorizationHeader: null,
    };
  }

  if (authorizationHeader) {
    return {
      mode: "replace",
      authorizationHeader,
    };
  }

  return {
    mode: isUpdate ? "preserve" : "disabled",
    authorizationHeader: null,
  };
}

function resolveNextAuthorizationHeader(
  existingAuthConfigJson: unknown,
  update: AuthorizationHeaderUpdate
): string | null {
  if (update.mode === "replace") {
    return update.authorizationHeader;
  }

  if (update.mode === "clear" || update.mode === "disabled") {
    return null;
  }

  return parseSourceChannelAuthConfig(existingAuthConfigJson).authorizationHeader;
}

export function parseApiAdminChannelInput(payload: Record<string, unknown>): NormalizedApiAdminChannelInput {
  const providerType = readOptionalString(payload.providerType) ?? "api";
  if (providerType !== "api") {
    throw new Error("Only API channels are supported by this admin surface.");
  }

  const config = normalizeApiConfig(payload);
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
    providerType: "api",
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
    itemsPath: config.itemsPath,
    titleField: config.titleField,
    leadField: config.leadField,
    bodyField: config.bodyField,
    urlField: config.urlField,
    publishedAtField: config.publishedAtField,
    externalIdField: config.externalIdField,
    languageField: config.languageField,
    enrichmentEnabled: readBoolean(payload.enrichmentEnabled, true, "enrichmentEnabled"),
    enrichmentMinBodyLength: readPositiveInteger(
      payload.enrichmentMinBodyLength,
      DEFAULT_CHANNEL_ENRICHMENT_MIN_BODY_LENGTH,
      "enrichmentMinBodyLength"
    ),
    authorizationHeaderUpdate: resolveAuthorizationHeaderUpdate(
      payload,
      Boolean(readOptionalString(payload.channelId))
    ),
  };
}

export async function upsertApiChannels(
  pool: Pool,
  channels: NormalizedApiAdminChannelInput[]
): Promise<UpsertApiChannelsResult> {
  const providerLookup = await pool.query<{ provider_id: string }>(
    `
      select provider_id::text as provider_id
      from source_providers
      where provider_type = 'api'
      limit 1
    `
  );
  const providerId = providerLookup.rows[0]?.provider_id ?? null;
  const client = await pool.connect();
  const createdChannelIds: string[] = [];
  const updatedChannelIds: string[] = [];
  const authConfiguredChannelIds: string[] = [];
  const authClearedChannelIds: string[] = [];

  try {
    await client.query("begin");

    for (const channel of channels) {
      const configJson = JSON.stringify({
        maxItemsPerPoll: channel.maxItemsPerPoll,
        requestTimeoutMs: channel.requestTimeoutMs,
        userAgent: channel.userAgent,
        itemsPath: channel.itemsPath,
        titleField: channel.titleField,
        leadField: channel.leadField,
        bodyField: channel.bodyField,
        urlField: channel.urlField,
        publishedAtField: channel.publishedAtField,
        externalIdField: channel.externalIdField,
        languageField: channel.languageField,
      });

      if (channel.channelId) {
        const existingChannel = await client.query<{ auth_config_json: unknown }>(
          `
            select auth_config_json
            from source_channels
            where channel_id = $1
              and provider_type = 'api'
            for update
          `,
          [channel.channelId]
        );
        if (existingChannel.rowCount !== 1) {
          throw new Error(`API channel ${channel.channelId} was not found.`);
        }
        const nextAuthorizationHeader = resolveNextAuthorizationHeader(
          existingChannel.rows[0]?.auth_config_json,
          channel.authorizationHeaderUpdate
        );
        const authConfigJson = JSON.stringify(
          serializeSourceChannelAuthConfig({
            authorizationHeader: nextAuthorizationHeader,
          })
        );
        const updateResult = await client.query(
          `
            update source_channels
            set
              provider_id = $2,
              provider_type = 'api',
              name = $3,
              fetch_url = $4,
              homepage_url = $4,
              language = $5,
              is_active = $6,
              poll_interval_seconds = $7,
              config_json = $8::jsonb,
              auth_config_json = $9::jsonb,
              enrichment_enabled = $10,
              enrichment_min_body_length = $11,
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
            configJson,
            authConfigJson,
            channel.enrichmentEnabled,
            channel.enrichmentMinBodyLength,
          ]
        );
        if (updateResult.rowCount !== 1) {
          throw new Error(`API channel ${channel.channelId} was not found.`);
        }
        if (channel.authorizationHeaderUpdate.mode === "replace") {
          authConfiguredChannelIds.push(channel.channelId);
        } else if (channel.authorizationHeaderUpdate.mode === "clear") {
          authClearedChannelIds.push(channel.channelId);
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
            values ($1, $2, $3, $4, now() + make_interval(secs => $5), 0, null, 0, 0, 'manual_schedule_reset', now())
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
            channel.maxPollIntervalSeconds,
            channel.pollIntervalSeconds,
          ]
        );
        updatedChannelIds.push(channel.channelId);
        continue;
      }

      const channelId = randomUUID();
      const authConfigJson = JSON.stringify(
        serializeSourceChannelAuthConfig({
          authorizationHeader:
            channel.authorizationHeaderUpdate.mode === "replace"
              ? channel.authorizationHeaderUpdate.authorizationHeader
              : null,
        })
      );
      await client.query(
        `
          insert into source_channels (
            channel_id,
            provider_id,
            provider_type,
            name,
            fetch_url,
            homepage_url,
            language,
            is_active,
            poll_interval_seconds,
            config_json,
            auth_config_json,
            enrichment_enabled,
            enrichment_min_body_length
          )
          values ($1, $2, 'api', $3, $4, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, $11)
        `,
        [
          channelId,
          providerId,
          channel.name,
          channel.fetchUrl,
          channel.language,
          channel.isActive,
          channel.pollIntervalSeconds,
          configJson,
          authConfigJson,
          channel.enrichmentEnabled,
          channel.enrichmentMinBodyLength,
        ]
      );
      if (channel.authorizationHeaderUpdate.mode === "replace") {
        authConfiguredChannelIds.push(channelId);
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
          values ($1, $2, $3, $4, now(), 0, null, 0, 0, null, now())
          on conflict (channel_id) do nothing
        `,
        [
          channelId,
          channel.adaptiveEnabled,
          channel.pollIntervalSeconds,
          channel.maxPollIntervalSeconds,
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
    updatedChannelIds,
    authConfiguredChannelIds,
    authClearedChannelIds,
  };
}

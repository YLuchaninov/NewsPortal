import { randomUUID } from "node:crypto";

import {
  DEFAULT_CHANNEL_ENRICHMENT_MIN_BODY_LENGTH,
  normalizeMaxPollIntervalSeconds,
  parseEmailImapChannelConfig,
  type EmailImapChannelConfig,
} from "@newsportal/contracts";
import type { Pool } from "pg";

const DEFAULT_EMAIL_IMAP_CONFIG = parseEmailImapChannelConfig({});
const DEFAULT_LANGUAGE = "en";
const DEFAULT_POLL_INTERVAL_SECONDS = 300;

type PasswordUpdateMode = "preserve" | "replace";

interface PasswordUpdate {
  mode: PasswordUpdateMode;
  password: string | null;
}

export interface NormalizedEmailImapAdminChannelInput {
  channelId?: string;
  providerType: "email_imap";
  name: string;
  language: string | null;
  isActive: boolean;
  pollIntervalSeconds: number;
  adaptiveEnabled: boolean;
  maxPollIntervalSeconds: number;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  passwordUpdate: PasswordUpdate;
  mailbox: string;
  searchFrom: string | null;
  maxItemsPerPoll: number;
  enrichmentEnabled: boolean;
  enrichmentMinBodyLength: number;
}

export interface UpsertEmailImapChannelsResult {
  createdChannelIds: string[];
  updatedChannelIds: string[];
  authConfiguredChannelIds: string[];
  authClearedChannelIds: string[];
}

export interface EmailImapBulkImportPlanItem {
  index: number;
  name: string;
  fetchUrl: string;
  action: "create" | "update";
  matchType: "create" | "channelId";
  channelId: string | null;
  existingName: string | null;
  existingFetchUrl: string | null;
}

export interface EmailImapBulkImportPlan {
  channels: NormalizedEmailImapAdminChannelInput[];
  wouldCreate: number;
  wouldUpdate: number;
  matchedByChannelId: number;
  matchedByFetchUrl: 0;
  items: EmailImapBulkImportPlanItem[];
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
    throw new Error(`Email IMAP channel field "${fieldName}" is required.`);
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

  throw new Error(`Email IMAP channel field "${fieldName}" must be a boolean.`);
}

function readPositiveInteger(value: unknown, fallback: number, fieldName: string): number {
  if (value == null || value === "") {
    return fallback;
  }

  const parsed =
    typeof value === "number" && Number.isInteger(value) ? value : Number.parseInt(String(value), 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Email IMAP channel field "${fieldName}" must be a positive integer.`);
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
    throw new Error(`Email IMAP channel field "${fieldName}" must be a positive integer.`);
  }

  return parsed;
}

function normalizeHost(value: unknown): string {
  const host = readRequiredString(value, "host");
  if (/\s/.test(host)) {
    throw new Error('Email IMAP channel field "host" must not contain whitespace.');
  }
  return host;
}

function buildImapFetchUrl(host: string, port: number, secure: boolean, mailbox: string): string {
  const protocol = secure ? "imaps" : "imap";
  return `${protocol}://${host}:${port}/${encodeURIComponent(mailbox)}`;
}

function normalizeEmailImapConfig(
  payload: Record<string, unknown>,
  password: string
): EmailImapChannelConfig {
  return parseEmailImapChannelConfig({
    host: normalizeHost(payload.host),
    port: readPositiveInteger(payload.port, DEFAULT_EMAIL_IMAP_CONFIG.port, "port"),
    secure: readBoolean(payload.secure, DEFAULT_EMAIL_IMAP_CONFIG.secure, "secure"),
    username: readRequiredString(payload.username, "username"),
    password,
    mailbox: readRequiredString(payload.mailbox ?? DEFAULT_EMAIL_IMAP_CONFIG.mailbox, "mailbox"),
    searchFrom: readOptionalString(payload.searchFrom),
    maxItemsPerPoll: readPositiveInteger(
      payload.maxItemsPerPoll,
      DEFAULT_EMAIL_IMAP_CONFIG.maxItemsPerPoll,
      "maxItemsPerPoll"
    ),
  });
}

function resolvePasswordUpdate(
  payload: Record<string, unknown>,
  isUpdate: boolean
): PasswordUpdate {
  const password = readOptionalString(payload.password);

  if (password) {
    return {
      mode: "replace",
      password,
    };
  }

  if (isUpdate) {
    return {
      mode: "preserve",
      password: null,
    };
  }

  throw new Error('Email IMAP channel field "password" is required.');
}

function resolveNextPassword(
  existingConfigJson: unknown,
  update: PasswordUpdate
): string {
  if (update.mode === "replace") {
    return update.password ?? "";
  }

  return parseEmailImapChannelConfig(existingConfigJson).password;
}

export function parseEmailImapAdminChannelInput(
  payload: Record<string, unknown>
): NormalizedEmailImapAdminChannelInput {
  const providerType = readOptionalString(payload.providerType) ?? "email_imap";
  if (providerType !== "email_imap") {
    throw new Error("Only email IMAP channels are supported by this admin surface.");
  }

  const passwordUpdate = resolvePasswordUpdate(payload, Boolean(readOptionalString(payload.channelId)));
  const config = normalizeEmailImapConfig(
    payload,
    passwordUpdate.mode === "replace" ? passwordUpdate.password ?? "" : DEFAULT_EMAIL_IMAP_CONFIG.password
  );
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
    providerType: "email_imap",
    name: readRequiredString(payload.name, "name"),
    language: readOptionalString(payload.language) ?? DEFAULT_LANGUAGE,
    isActive: readBoolean(payload.isActive, true, "isActive"),
    pollIntervalSeconds,
    adaptiveEnabled: readBoolean(payload.adaptiveEnabled, true, "adaptiveEnabled"),
    maxPollIntervalSeconds,
    host: config.host,
    port: config.port,
    secure: config.secure,
    username: config.username,
    passwordUpdate,
    mailbox: config.mailbox,
    searchFrom: config.searchFrom ?? null,
    maxItemsPerPoll: config.maxItemsPerPoll,
    enrichmentEnabled: readBoolean(payload.enrichmentEnabled, true, "enrichmentEnabled"),
    enrichmentMinBodyLength: readPositiveInteger(
      payload.enrichmentMinBodyLength,
      DEFAULT_CHANNEL_ENRICHMENT_MIN_BODY_LENGTH,
      "enrichmentMinBodyLength"
    ),
  };
}

export function parseBulkEmailImapAdminChannelInputs(
  payload: unknown
): NormalizedEmailImapAdminChannelInput[] {
  if (!Array.isArray(payload)) {
    throw new Error('Bulk Email IMAP payload must contain a "channels" array.');
  }

  if (payload.length === 0) {
    throw new Error("Bulk Email IMAP payload must include at least one channel.");
  }

  return payload.map((channel, index) => {
    if (channel == null || typeof channel !== "object" || Array.isArray(channel)) {
      throw new Error(`Bulk Email IMAP channel at index ${index} must be an object.`);
    }

    try {
      return parseEmailImapAdminChannelInput(channel as Record<string, unknown>);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown bulk Email IMAP validation failure";
      throw new Error(`Bulk Email IMAP channel at index ${index} is invalid: ${message}`, {
        cause: error
      });
    }
  });
}

export async function planEmailImapBulkImport(
  pool: Pool,
  channels: NormalizedEmailImapAdminChannelInput[]
): Promise<EmailImapBulkImportPlan> {
  const explicitChannelIds = Array.from(
    new Set(
      channels
        .map((channel) => channel.channelId)
        .filter((channelId): channelId is string => Boolean(channelId))
    )
  );
  const existingRows =
    explicitChannelIds.length > 0
      ? await pool.query<{
          channel_id: string;
          name: string;
          fetch_url: string;
        }>(
          `
            select
              channel_id::text as channel_id,
              name,
              fetch_url
            from source_channels
            where
              provider_type = 'email_imap'
              and channel_id::text = any($1::text[])
          `,
          [explicitChannelIds]
        )
      : { rows: [] };

  const existingByChannelId = new Map(
    existingRows.rows.map((row) => [row.channel_id, row])
  );

  const items = channels.map((channel, index): EmailImapBulkImportPlanItem => {
    const fetchUrl = buildImapFetchUrl(
      channel.host,
      channel.port,
      channel.secure,
      channel.mailbox
    );

    if (!channel.channelId) {
      return {
        index,
        name: channel.name,
        fetchUrl,
        action: "create",
        matchType: "create",
        channelId: null,
        existingName: null,
        existingFetchUrl: null
      };
    }

    const existing = existingByChannelId.get(channel.channelId);
    if (!existing) {
      throw new Error(`Email IMAP channel ${channel.channelId} was not found.`);
    }

    return {
      index,
      name: channel.name,
      fetchUrl,
      action: "update",
      matchType: "channelId",
      channelId: existing.channel_id,
      existingName: existing.name,
      existingFetchUrl: existing.fetch_url
    };
  });

  return {
    channels,
    wouldCreate: items.filter((item) => item.action === "create").length,
    wouldUpdate: items.filter((item) => item.action === "update").length,
    matchedByChannelId: items.filter((item) => item.matchType === "channelId").length,
    matchedByFetchUrl: 0,
    items
  };
}

export async function upsertEmailImapChannels(
  pool: Pool,
  channels: NormalizedEmailImapAdminChannelInput[]
): Promise<UpsertEmailImapChannelsResult> {
  const providerLookup = await pool.query<{ provider_id: string }>(
    `
      select provider_id::text as provider_id
      from source_providers
      where provider_type = 'email_imap'
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
      let persistedPassword = channel.passwordUpdate.password ?? "";
      if (channel.channelId && channel.passwordUpdate.mode === "preserve") {
        const existingChannel = await client.query<{ config_json: unknown }>(
          `
            select config_json
            from source_channels
            where channel_id = $1
              and provider_type = 'email_imap'
            for update
          `,
          [channel.channelId]
        );
        if (existingChannel.rowCount !== 1) {
          throw new Error(`Email IMAP channel ${channel.channelId} was not found.`);
        }
        persistedPassword = resolveNextPassword(
          existingChannel.rows[0]?.config_json,
          channel.passwordUpdate
        );
      }

      const configJson = JSON.stringify({
        host: channel.host,
        port: channel.port,
        secure: channel.secure,
        username: channel.username,
        password: persistedPassword,
        mailbox: channel.mailbox,
        searchFrom: channel.searchFrom,
        maxItemsPerPoll: channel.maxItemsPerPoll,
      });
      const fetchUrl = buildImapFetchUrl(
        channel.host,
        channel.port,
        channel.secure,
        channel.mailbox
      );

      if (channel.channelId) {
        const updateResult = await client.query(
          `
            update source_channels
            set
              provider_id = $2,
              provider_type = 'email_imap',
              name = $3,
              fetch_url = $4,
              homepage_url = null,
              language = $5,
              is_active = $6,
              poll_interval_seconds = $7,
              config_json = $8::jsonb,
              auth_config_json = '{}'::jsonb,
              enrichment_enabled = $9,
              enrichment_min_body_length = $10,
              updated_at = now()
            where channel_id = $1
          `,
          [
            channel.channelId,
            providerId,
            channel.name,
            fetchUrl,
            channel.language,
            channel.isActive,
            channel.pollIntervalSeconds,
            configJson,
            channel.enrichmentEnabled,
            channel.enrichmentMinBodyLength,
          ]
        );
        if (updateResult.rowCount !== 1) {
          throw new Error(`Email IMAP channel ${channel.channelId} was not found.`);
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
          values ($1, $2, 'email_imap', $3, $4, null, $5, $6, $7, $8::jsonb, '{}'::jsonb, $9, $10)
        `,
        [
          channelId,
          providerId,
          channel.name,
          fetchUrl,
          channel.language,
          channel.isActive,
          channel.pollIntervalSeconds,
          configJson,
          channel.enrichmentEnabled,
          channel.enrichmentMinBodyLength,
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
    authConfiguredChannelIds: [],
    authClearedChannelIds: [],
  };
}

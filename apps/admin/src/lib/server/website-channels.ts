import { randomUUID } from "node:crypto";

import {
  normalizeMaxPollIntervalSeconds,
  parseSourceChannelAuthConfig,
  parseWebsiteChannelConfig,
  serializeSourceChannelAuthConfig,
  type WebsiteChannelConfig
} from "@newsportal/contracts";
import type { Pool } from "pg";

const DEFAULT_WEBSITE_CONFIG = parseWebsiteChannelConfig({});
const DEFAULT_LANGUAGE = "en";
const DEFAULT_POLL_INTERVAL_SECONDS = 900;

type AuthorizationHeaderUpdateMode = "preserve" | "replace" | "clear" | "disabled";

interface AuthorizationHeaderUpdate {
  mode: AuthorizationHeaderUpdateMode;
  authorizationHeader: string | null;
}

export interface NormalizedWebsiteAdminChannelInput {
  channelId?: string;
  providerType: "website";
  name: string;
  fetchUrl: string;
  language: string | null;
  isActive: boolean;
  pollIntervalSeconds: number;
  adaptiveEnabled: boolean;
  maxPollIntervalSeconds: number;
  requestTimeoutMs: number;
  totalPollTimeoutMs: number;
  userAgent: string;
  maxResourcesPerPoll: number;
  crawlDelayMs: number;
  sitemapDiscoveryEnabled: boolean;
  feedDiscoveryEnabled: boolean;
  collectionDiscoveryEnabled: boolean;
  downloadDiscoveryEnabled: boolean;
  browserFallbackEnabled: boolean;
  collectionSeedUrls: string[];
  allowedUrlPatterns: string[];
  blockedUrlPatterns: string[];
  curated: WebsiteChannelConfig["curated"];
  authorizationHeaderUpdate: AuthorizationHeaderUpdate;
}

export interface UpsertWebsiteChannelsResult {
  createdChannelIds: string[];
  updatedChannelIds: string[];
  authConfiguredChannelIds: string[];
  authClearedChannelIds: string[];
}

export interface WebsiteBulkImportPlanItem {
  index: number;
  name: string;
  fetchUrl: string;
  action: "create" | "update";
  matchType: "create" | "channelId" | "fetchUrl";
  channelId: string | null;
  existingName: string | null;
  existingFetchUrl: string | null;
}

export interface WebsiteBulkImportPlan {
  channels: NormalizedWebsiteAdminChannelInput[];
  wouldCreate: number;
  wouldUpdate: number;
  matchedByChannelId: number;
  matchedByFetchUrl: number;
  items: WebsiteBulkImportPlanItem[];
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
    throw new Error(`Website channel field "${fieldName}" is required.`);
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

  throw new Error(`Website channel field "${fieldName}" must be a boolean.`);
}

function readPositiveInteger(value: unknown, fallback: number, fieldName: string): number {
  if (value == null || value === "") {
    return fallback;
  }

  const parsed =
    typeof value === "number" && Number.isInteger(value) ? value : Number.parseInt(String(value), 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Website channel field "${fieldName}" must be a positive integer.`);
  }

  return parsed;
}

function readOptionalPositiveInteger(value: unknown, fieldName: string): number | null {
  if (value == null || value === "") {
    return null;
  }

  return readPositiveInteger(value, 0, fieldName);
}

function readTextareaList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item).trim())
      .filter(Boolean);
  }

  const normalized = readOptionalString(value);
  if (!normalized) {
    return [];
  }

  return normalized
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function validateHttpUrl(rawUrl: string, fieldName: string): string {
  let parsed: URL;

  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`Website channel field "${fieldName}" must be a valid absolute URL.`);
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error(`Website channel field "${fieldName}" must use http or https.`);
  }

  return parsed.toString();
}

function normalizeWebsiteConfig(payload: Record<string, unknown>): WebsiteChannelConfig {
  return parseWebsiteChannelConfig({
    maxResourcesPerPoll: readPositiveInteger(
      payload.maxResourcesPerPoll,
      DEFAULT_WEBSITE_CONFIG.maxResourcesPerPoll,
      "maxResourcesPerPoll"
    ),
    requestTimeoutMs: readPositiveInteger(
      payload.requestTimeoutMs,
      DEFAULT_WEBSITE_CONFIG.requestTimeoutMs,
      "requestTimeoutMs"
    ),
    totalPollTimeoutMs: readPositiveInteger(
      payload.totalPollTimeoutMs,
      DEFAULT_WEBSITE_CONFIG.totalPollTimeoutMs,
      "totalPollTimeoutMs"
    ),
    userAgent: readOptionalString(payload.userAgent) ?? DEFAULT_WEBSITE_CONFIG.userAgent,
    sitemapDiscoveryEnabled: readBoolean(
      payload.sitemapDiscoveryEnabled,
      DEFAULT_WEBSITE_CONFIG.sitemapDiscoveryEnabled,
      "sitemapDiscoveryEnabled"
    ),
    feedDiscoveryEnabled: readBoolean(
      payload.feedDiscoveryEnabled,
      DEFAULT_WEBSITE_CONFIG.feedDiscoveryEnabled,
      "feedDiscoveryEnabled"
    ),
    collectionDiscoveryEnabled: readBoolean(
      payload.collectionDiscoveryEnabled,
      DEFAULT_WEBSITE_CONFIG.collectionDiscoveryEnabled,
      "collectionDiscoveryEnabled"
    ),
    downloadDiscoveryEnabled: readBoolean(
      payload.downloadDiscoveryEnabled,
      DEFAULT_WEBSITE_CONFIG.downloadDiscoveryEnabled,
      "downloadDiscoveryEnabled"
    ),
    browserFallbackEnabled: readBoolean(
      payload.browserFallbackEnabled,
      DEFAULT_WEBSITE_CONFIG.browserFallbackEnabled,
      "browserFallbackEnabled"
    ),
    maxBrowserFetchesPerPoll: DEFAULT_WEBSITE_CONFIG.maxBrowserFetchesPerPoll,
    allowedUrlPatterns: readTextareaList(payload.allowedUrlPatterns),
    blockedUrlPatterns: readTextareaList(payload.blockedUrlPatterns),
    collectionSeedUrls: readTextareaList(payload.collectionSeedUrls).map((url) =>
      validateHttpUrl(url, "collectionSeedUrls")
    ),
    downloadPatterns: DEFAULT_WEBSITE_CONFIG.downloadPatterns,
    crawlDelayMs: readPositiveInteger(
      payload.crawlDelayMs,
      DEFAULT_WEBSITE_CONFIG.crawlDelayMs,
      "crawlDelayMs"
    ),
    classification: DEFAULT_WEBSITE_CONFIG.classification,
    curated: {
      preferCollectionDiscovery: readBoolean(
        payload.curatedPreferCollectionDiscovery,
        DEFAULT_WEBSITE_CONFIG.curated.preferCollectionDiscovery,
        "curatedPreferCollectionDiscovery"
      ),
      preferBrowserFallback: readBoolean(
        payload.curatedPreferBrowserFallback,
        DEFAULT_WEBSITE_CONFIG.curated.preferBrowserFallback,
        "curatedPreferBrowserFallback"
      ),
      editorialUrlPatterns: readTextareaList(payload.curatedEditorialUrlPatterns),
      listingUrlPatterns: readTextareaList(payload.curatedListingUrlPatterns),
      entityUrlPatterns: readTextareaList(payload.curatedEntityUrlPatterns),
      documentUrlPatterns: readTextareaList(payload.curatedDocumentUrlPatterns),
      dataFileUrlPatterns: readTextareaList(payload.curatedDataFileUrlPatterns),
    },
    extraction: DEFAULT_WEBSITE_CONFIG.extraction
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
      authorizationHeader: null
    };
  }

  if (authorizationHeader) {
    return {
      mode: "replace",
      authorizationHeader
    };
  }

  return {
    mode: isUpdate ? "preserve" : "disabled",
    authorizationHeader: null
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

function normalizeMatchedWebsiteAuthorizationHeaderUpdate(
  update: AuthorizationHeaderUpdate
): AuthorizationHeaderUpdate {
  if (update.mode !== "disabled") {
    return update;
  }

  return {
    mode: "preserve",
    authorizationHeader: null
  };
}

export function parseWebsiteAdminChannelInput(
  payload: Record<string, unknown>
): NormalizedWebsiteAdminChannelInput {
  const providerType = readOptionalString(payload.providerType) ?? "website";
  if (providerType !== "website") {
    throw new Error("Only website channels are supported by this admin surface.");
  }

  const config = normalizeWebsiteConfig(payload);
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
    providerType: "website",
    name: readRequiredString(payload.name, "name"),
    fetchUrl: validateHttpUrl(readRequiredString(payload.fetchUrl, "fetchUrl"), "fetchUrl"),
    language: readOptionalString(payload.language) ?? DEFAULT_LANGUAGE,
    isActive: readBoolean(payload.isActive, true, "isActive"),
    pollIntervalSeconds,
    adaptiveEnabled: readBoolean(payload.adaptiveEnabled, true, "adaptiveEnabled"),
    maxPollIntervalSeconds,
    requestTimeoutMs: config.requestTimeoutMs,
    totalPollTimeoutMs: config.totalPollTimeoutMs,
    userAgent: config.userAgent,
    maxResourcesPerPoll: config.maxResourcesPerPoll,
    crawlDelayMs: config.crawlDelayMs,
    sitemapDiscoveryEnabled: config.sitemapDiscoveryEnabled,
    feedDiscoveryEnabled: config.feedDiscoveryEnabled,
    collectionDiscoveryEnabled: config.collectionDiscoveryEnabled,
    downloadDiscoveryEnabled: config.downloadDiscoveryEnabled,
    browserFallbackEnabled: config.browserFallbackEnabled,
    collectionSeedUrls: config.collectionSeedUrls,
    allowedUrlPatterns: config.allowedUrlPatterns,
    blockedUrlPatterns: config.blockedUrlPatterns,
    curated: config.curated,
    authorizationHeaderUpdate: resolveAuthorizationHeaderUpdate(
      payload,
      Boolean(readOptionalString(payload.channelId))
    )
  };
}

export function parseBulkWebsiteAdminChannelInputs(
  payload: unknown
): NormalizedWebsiteAdminChannelInput[] {
  if (!Array.isArray(payload)) {
    throw new Error('Bulk website payload must contain a "channels" array.');
  }

  if (payload.length === 0) {
    throw new Error("Bulk website payload must include at least one channel.");
  }

  return payload.map((entry, index) => {
    if (entry == null || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`Bulk website channel at index ${index} must be an object.`);
    }

    try {
      return parseWebsiteAdminChannelInput(entry as Record<string, unknown>);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown bulk website validation failure";
      throw new Error(`Bulk website channel at index ${index} is invalid: ${message}`, {
        cause: error
      });
    }
  });
}

export async function planWebsiteBulkImport(
  pool: Pool,
  channels: NormalizedWebsiteAdminChannelInput[]
): Promise<WebsiteBulkImportPlan> {
  const explicitChannelIds = Array.from(
    new Set(
      channels
        .map((channel) => channel.channelId)
        .filter((channelId): channelId is string => Boolean(channelId))
    )
  );
  const fetchUrls = Array.from(new Set(channels.map((channel) => channel.fetchUrl)));
  const existingRows =
    explicitChannelIds.length > 0 || fetchUrls.length > 0
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
              provider_type = 'website'
              and (
                channel_id::text = any($1::text[])
                or fetch_url = any($2::text[])
              )
          `,
          [explicitChannelIds, fetchUrls]
        )
      : { rows: [] };

  const existingByChannelId = new Map(
    existingRows.rows.map((row) => [row.channel_id, row])
  );
  const existingByFetchUrl = new Map<string, (typeof existingRows.rows)[number]>();

  for (const row of existingRows.rows) {
    const existing = existingByFetchUrl.get(row.fetch_url);
    if (existing && existing.channel_id !== row.channel_id) {
      throw new Error(
        `Bulk website import is ambiguous because fetchUrl ${row.fetch_url} matches multiple existing website channels.`
      );
    }
    existingByFetchUrl.set(row.fetch_url, row);
  }

  const plannedChannels: NormalizedWebsiteAdminChannelInput[] = [];
  const items: WebsiteBulkImportPlanItem[] = [];
  let wouldCreate = 0;
  let wouldUpdate = 0;
  let matchedByChannelId = 0;
  let matchedByFetchUrl = 0;

  channels.forEach((channel, index) => {
    const explicitMatch = channel.channelId
      ? existingByChannelId.get(channel.channelId) ?? null
      : null;
    const fetchUrlMatch = existingByFetchUrl.get(channel.fetchUrl) ?? null;

    if (channel.channelId && !explicitMatch) {
      throw new Error(`Website channel ${channel.channelId} was not found.`);
    }

    if (
      explicitMatch &&
      fetchUrlMatch &&
      explicitMatch.channel_id !== fetchUrlMatch.channel_id
    ) {
      throw new Error(
        `Bulk website channel at index ${index} is ambiguous: channelId ${channel.channelId} does not match the existing website channel for fetchUrl ${channel.fetchUrl}.`
      );
    }

    if (explicitMatch) {
      wouldUpdate += 1;
      matchedByChannelId += 1;
      plannedChannels.push(channel);
      items.push({
        index,
        name: channel.name,
        fetchUrl: channel.fetchUrl,
        action: "update",
        matchType: "channelId",
        channelId: explicitMatch.channel_id,
        existingName: explicitMatch.name,
        existingFetchUrl: explicitMatch.fetch_url
      });
      return;
    }

    if (fetchUrlMatch) {
      wouldUpdate += 1;
      matchedByFetchUrl += 1;
      plannedChannels.push({
        ...channel,
        channelId: fetchUrlMatch.channel_id,
        authorizationHeaderUpdate: normalizeMatchedWebsiteAuthorizationHeaderUpdate(
          channel.authorizationHeaderUpdate
        )
      });
      items.push({
        index,
        name: channel.name,
        fetchUrl: channel.fetchUrl,
        action: "update",
        matchType: "fetchUrl",
        channelId: fetchUrlMatch.channel_id,
        existingName: fetchUrlMatch.name,
        existingFetchUrl: fetchUrlMatch.fetch_url
      });
      return;
    }

    wouldCreate += 1;
    plannedChannels.push(channel);
    items.push({
      index,
      name: channel.name,
      fetchUrl: channel.fetchUrl,
      action: "create",
      matchType: "create",
      channelId: null,
      existingName: null,
      existingFetchUrl: null
    });
  });

  return {
    channels: plannedChannels,
    wouldCreate,
    wouldUpdate,
    matchedByChannelId,
    matchedByFetchUrl,
    items
  };
}

export async function upsertWebsiteChannels(
  pool: Pool,
  channels: NormalizedWebsiteAdminChannelInput[]
): Promise<UpsertWebsiteChannelsResult> {
  const providerLookup = await pool.query<{ provider_id: string }>(
    `
      select provider_id::text as provider_id
      from source_providers
      where provider_type = 'website'
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
        maxResourcesPerPoll: channel.maxResourcesPerPoll,
        requestTimeoutMs: channel.requestTimeoutMs,
        totalPollTimeoutMs: channel.totalPollTimeoutMs,
        userAgent: channel.userAgent,
        sitemapDiscoveryEnabled: channel.sitemapDiscoveryEnabled,
        feedDiscoveryEnabled: channel.feedDiscoveryEnabled,
        collectionDiscoveryEnabled: channel.collectionDiscoveryEnabled,
        downloadDiscoveryEnabled: channel.downloadDiscoveryEnabled,
        browserFallbackEnabled: channel.browserFallbackEnabled,
        maxBrowserFetchesPerPoll: DEFAULT_WEBSITE_CONFIG.maxBrowserFetchesPerPoll,
        allowedUrlPatterns: channel.allowedUrlPatterns,
        blockedUrlPatterns: channel.blockedUrlPatterns,
        collectionSeedUrls: channel.collectionSeedUrls,
        downloadPatterns: DEFAULT_WEBSITE_CONFIG.downloadPatterns,
        crawlDelayMs: channel.crawlDelayMs,
        classification: DEFAULT_WEBSITE_CONFIG.classification,
        curated: channel.curated,
        extraction: DEFAULT_WEBSITE_CONFIG.extraction
      });

      if (channel.channelId) {
        const existingChannel = await client.query<{ auth_config_json: unknown }>(
          `
            select auth_config_json
            from source_channels
            where channel_id = $1
              and provider_type = 'website'
            for update
          `,
          [channel.channelId]
        );
        if (existingChannel.rowCount !== 1) {
          throw new Error(`Website channel ${channel.channelId} was not found.`);
        }
        const nextAuthorizationHeader = resolveNextAuthorizationHeader(
          existingChannel.rows[0]?.auth_config_json,
          channel.authorizationHeaderUpdate
        );
        const authConfigJson = JSON.stringify(
          serializeSourceChannelAuthConfig({
            authorizationHeader: nextAuthorizationHeader
          })
        );
        const updateResult = await client.query(
          `
            update source_channels
            set
              provider_id = $2,
              provider_type = 'website',
              name = $3,
              fetch_url = $4,
              homepage_url = $4,
              language = $5,
              is_active = $6,
              poll_interval_seconds = $7,
              config_json = $8::jsonb,
              auth_config_json = $9::jsonb,
              enrichment_enabled = true,
              enrichment_min_body_length = 500,
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
            authConfigJson
          ]
        );
        if (updateResult.rowCount !== 1) {
          throw new Error(`Website channel ${channel.channelId} was not found.`);
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
            channel.pollIntervalSeconds
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
              : null
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
          values ($1, $2, 'website', $3, $4, $4, $5, $6, $7, $8::jsonb, $9::jsonb, true, 500)
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
          authConfigJson
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
    updatedChannelIds,
    authConfiguredChannelIds,
    authClearedChannelIds
  };
}

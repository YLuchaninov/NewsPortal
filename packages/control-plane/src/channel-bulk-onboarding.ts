import { createHash } from "node:crypto";

import type { Pool } from "pg";

import {
  ADMIN_CHANNEL_PROVIDER_TYPES,
  formatAdminChannelProviderLabel,
  isAdminChannelProviderType,
  type AdminChannelProviderType
} from "./channel-providers";
import {
  parseApiAdminChannelInput,
  planApiBulkImport,
  upsertApiChannels,
  type ApiBulkImportPlan,
  type NormalizedApiAdminChannelInput,
  type UpsertApiChannelsResult
} from "./api-channels";
import {
  parseEmailImapAdminChannelInput,
  planEmailImapBulkImport,
  upsertEmailImapChannels,
  type EmailImapBulkImportPlan,
  type NormalizedEmailImapAdminChannelInput,
  type UpsertEmailImapChannelsResult
} from "./email-imap-channels";
import {
  parseRssAdminChannelInput,
  planRssBulkImport,
  upsertRssChannels,
  type NormalizedRssAdminChannelInput,
  type RssBulkImportPlan,
  type UpsertRssChannelsResult
} from "./rss-channels";
import {
  parseWebsiteAdminChannelInput,
  planWebsiteBulkImport,
  upsertWebsiteChannels,
  type NormalizedWebsiteAdminChannelInput,
  type UpsertWebsiteChannelsResult,
  type WebsiteBulkImportPlan
} from "./website-channels";
import { writeAuditLog } from "./audit";

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

export type BulkOnboardingMode = "strict" | "allow_overrides";

export type BulkOnboardingItemStatus =
  | "ready_create"
  | "ready_update"
  | "duplicate"
  | "invalid_schema"
  | "provider_mismatch_risk"
  | "needs_override"
  | "api_mapping_required"
  | "adapter_required"
  | "unsupported";

export type ChannelProviderShapeClassification =
  | "feed_like"
  | "semantic_query_feed"
  | "website_page"
  | "api_like"
  | "email_imap"
  | "unknown";

export interface ChannelProviderShapeAlternative {
  providerType: AdminChannelProviderType | "adapter_required";
  fetchUrl: string | null;
  reason: string;
  requiresMapping?: boolean;
  requiresAdapter?: boolean;
}

export interface ChannelProviderShapeValidation {
  classification: ChannelProviderShapeClassification;
  blocker: string | null;
  recommendedProviderType: AdminChannelProviderType | "adapter_required" | null;
  recommendedAlternatives: ChannelProviderShapeAlternative[];
  feedProbeEvidence?: Record<string, unknown> | null;
}

export interface BulkOnboardingPlanOptions {
  mode?: BulkOnboardingMode;
  includeExisting?: boolean;
}

export interface BulkOnboardingApplyOptions extends BulkOnboardingPlanOptions {
  planFingerprint: string;
  confirm?: boolean;
  overrideReason?: string | null;
}

export interface BulkOnboardingPlanItem {
  index: number;
  status: BulkOnboardingItemStatus;
  providerType: AdminChannelProviderType | string | null;
  name: string | null;
  fetchUrl: string | null;
  action: "create" | "update" | "skip" | null;
  matchType: "create" | "channelId" | "fetchUrl" | "duplicate" | null;
  channelId: string | null;
  existingName: string | null;
  existingFetchUrl: string | null;
  warnings: string[];
  errors: string[];
  requiresOverride: boolean;
  recommendedAction?: string;
  validation?: ChannelProviderShapeValidation;
}

export interface BulkOnboardingSummary {
  total: number;
  readyCreate: number;
  readyUpdate: number;
  duplicate: number;
  invalidSchema: number;
  providerMismatchRisk: number;
  needsOverride: number;
  apiMappingRequired: number;
  adapterRequired: number;
  unsupported: number;
  blocked: number;
  wouldCreate: number;
  wouldUpdate: number;
  matchedByChannelId: number;
  matchedByFetchUrl: number;
  providerBreakdown: BulkImportProviderBreakdown[];
}

export interface BulkOnboardingPlan {
  planFingerprint: string;
  mode: BulkOnboardingMode;
  summary: BulkOnboardingSummary;
  items: BulkOnboardingPlanItem[];
  warnings: string[];
  blocked: BulkOnboardingPlanItem[];
  nextReadBack: Array<{ toolName: string; argumentsTemplate: Record<string, unknown> }>;
}

export interface BulkOnboardingApplyResult {
  planFingerprint: string;
  summary: {
    createdCount: number;
    updatedCount: number;
    skippedCount: number;
    failedCount: number;
  };
  items: Array<{
    index: number;
    status: "created" | "updated" | "skipped" | "failed";
    channelId: string | null;
    providerType: AdminChannelProviderType | string | null;
    reason: string | null;
  }>;
  createdChannelIds: string[];
  updatedChannelIds: string[];
  skipped: BulkOnboardingPlanItem[];
  failed: Array<{ index: number; reason: string }>;
  warnings: string[];
  nextReadBack: Array<{ toolName: string; argumentsTemplate: Record<string, unknown> }>;
}

export interface BulkOnboardingVerifyResult {
  reportKind: "channel_onboarding";
  verifiedAt: string;
  summary: {
    requestedChannels: number;
    foundChannels: number;
    missingChannelIds: string[];
    acquisitionSucceeded: number;
    websiteProjected: number;
    websiteProjectedRejected: number;
  };
  channels: Array<Record<string, unknown>>;
  websitePipeline: {
    note: string;
    countsByDecision: Array<Record<string, unknown>>;
  };
  providerShapeRisks: Array<Record<string, unknown>>;
  samples?: {
    fetchRuns: Array<Record<string, unknown>>;
    webResources: Array<Record<string, unknown>>;
  };
  warnings: string[];
  nextReadBack: Array<{ toolName: string; argumentsTemplate: Record<string, unknown> }>;
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

async function hydrateFetchUrlMatches(
  pool: Pool,
  channels: ParsedBulkImportChannel[]
): Promise<{
  channels: ParsedBulkImportChannel[];
  fetchUrlMatchedIndexes: Set<number>;
}> {
  const candidates = channels.filter(
    (entry) =>
      !entry.channel.channelId &&
      entry.providerType !== "website" &&
      "fetchUrl" in entry.channel &&
      normalizeString(entry.channel.fetchUrl)
  );
  if (candidates.length === 0) {
    return { channels, fetchUrlMatchedIndexes: new Set() };
  }

  const providerTypes = Array.from(new Set(candidates.map((entry) => entry.providerType)));
  const fetchUrls = Array.from(
    new Set(
      candidates
        .map((entry) => ("fetchUrl" in entry.channel ? entry.channel.fetchUrl : ""))
        .filter(Boolean)
    )
  );
  const existingRows = await pool.query<{
    channel_id: string;
    provider_type: AdminChannelProviderType;
    fetch_url: string;
  }>(
    `
      select channel_id::text as channel_id,
             provider_type,
             fetch_url
      from source_channels
      where provider_type = any($1::text[])
        and fetch_url = any($2::text[])
    `,
    [providerTypes, fetchUrls]
  );
  const existingByKey = new Map<string, (typeof existingRows.rows)[number]>();
  for (const row of existingRows.rows) {
    const key = `${row.provider_type}:${row.fetch_url}`;
    const existing = existingByKey.get(key);
    if (existing && existing.channel_id !== row.channel_id) {
      throw new Error(
        `Bulk import is ambiguous because ${row.provider_type} fetchUrl ${row.fetch_url} matches multiple existing channels.`
      );
    }
    existingByKey.set(key, row);
  }

  const fetchUrlMatchedIndexes = new Set<number>();
  const hydrated = channels.map((entry) => {
    if (
      entry.channel.channelId ||
      entry.providerType === "website" ||
      !("fetchUrl" in entry.channel)
    ) {
      return entry;
    }
    const existing = existingByKey.get(`${entry.providerType}:${entry.channel.fetchUrl}`);
    if (!existing) {
      return entry;
    }
    fetchUrlMatchedIndexes.add(entry.index);
    return {
      ...entry,
      channel: {
        ...entry.channel,
        channelId: existing.channel_id
      } as BulkImportChannel
    };
  });

  return { channels: hydrated, fetchUrlMatchedIndexes };
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
  const hydrated = await hydrateFetchUrlMatches(pool, channels);
  const grouped = groupParsedBulkChannels(hydrated.channels);
  const plannedChannels = new Array<ParsedBulkImportChannel>(hydrated.channels.length);
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
    const providerFetchUrlMatches = (plan.items as ProviderBulkImportPlanItem[]).filter((item) => {
      const original = providerChannels[item.index];
      return hydrated.fetchUrlMatchedIndexes.has(original.index);
    }).length;
    matchedByChannelId += plan.matchedByChannelId - providerFetchUrlMatches;
    matchedByFetchUrl += plan.matchedByFetchUrl + providerFetchUrlMatches;

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
      const fetchUrlMatched = hydrated.fetchUrlMatchedIndexes.has(original.index);
      items.push({
        ...item,
        index: original.index,
        matchType: fetchUrlMatched ? "fetchUrl" : item.matchType,
        providerType
      });
    });
  }

  return {
    channels: plannedChannels.filter(Boolean),
    wouldCreate,
    wouldUpdate,
    matchedByChannelId,
    matchedByFetchUrl,
    items: items.sort((left, right) => left.index - right.index),
    providerBreakdown: sortProviderBreakdown(providerBreakdown)
  };
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

function normalizeString(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeUrlKey(value: unknown): string {
  const raw = normalizeString(value);
  if (!raw) {
    return "";
  }
  try {
    const url = new URL(raw);
    url.hash = "";
    url.search = "";
    url.hostname = url.hostname.toLowerCase();
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.toString();
  } catch {
    return raw.toLowerCase().replace(/\/+$/, "");
  }
}

const SOURCE_IDENTITY_NON_SEMANTIC_QUERY_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "fbclid",
  "gclid",
  "dclid",
  "mc_cid",
  "mc_eid",
  "ref",
  "source",
  "count",
  "limit",
  "page",
  "per_page"
]);

function isSemanticQueryFeedUrl(url: URL): boolean {
  const hostname = url.hostname.toLowerCase();
  const pathname = url.pathname.replace(/\/+$/, "").toLowerCase() || "/";
  const hasMeaningfulQuery = Array.from(url.searchParams.keys()).some((key) => {
    const normalized = key.trim().toLowerCase();
    return (
      normalized &&
      !normalized.startsWith("utm_") &&
      !SOURCE_IDENTITY_NON_SEMANTIC_QUERY_PARAMS.has(normalized)
    );
  });
  if (!hasMeaningfulQuery) {
    return false;
  }
  return (
    hostname.includes("rss") ||
    hostname.includes("feeds") ||
    /(^|\/)(feed|feeds|rss|atom|search\.rss)(\/|\.|$)/i.test(pathname) ||
    /\.(rss|atom|xml)$/i.test(pathname) ||
    hostname.includes("feedburner")
  );
}

function normalizeSourceIdentityUrlKey(
  value: unknown,
  options: { preserveSemanticQuery?: boolean } = {}
): string {
  const raw = normalizeString(value);
  if (!raw) {
    return "";
  }

  try {
    const url = new URL(raw);
    const preserveSearchParams = options.preserveSemanticQuery === true || isSemanticQueryFeedUrl(url);
    const semanticSearchEntries = preserveSearchParams
      ? Array.from(url.searchParams.entries())
          .map(([key, entryValue]) => [key.trim().toLowerCase(), entryValue.trim()] as const)
          .filter(
            ([key, entryValue]) =>
              key &&
              entryValue &&
              !key.startsWith("utm_") &&
              !SOURCE_IDENTITY_NON_SEMANTIC_QUERY_PARAMS.has(key)
          )
          .sort(([leftKey, leftValue], [rightKey, rightValue]) => {
            const keyComparison = leftKey.localeCompare(rightKey);
            return keyComparison === 0 ? leftValue.localeCompare(rightValue) : keyComparison;
          })
      : [];

    url.hash = "";
    url.search = "";
    url.hostname = url.hostname.toLowerCase();
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";

    if (semanticSearchEntries.length > 0) {
      const semanticSearch = new URLSearchParams();
      semanticSearchEntries.forEach(([key, entryValue]) => semanticSearch.append(key, entryValue));
      url.search = semanticSearch.toString();
    }

    return url.toString();
  } catch {
    return raw.toLowerCase().replace(/\/+$/, "");
  }
}

function isFeedLikeUrl(value: unknown): boolean {
  const raw = normalizeString(value);
  if (!raw) {
    return false;
  }
  try {
    const url = new URL(raw);
    if (isSemanticQueryFeedUrl(url) || url.hostname.toLowerCase().includes("rss")) {
      return true;
    }
  } catch {
    // Fall through to normalized path-based checks.
  }
  const normalized = normalizeUrlKey(value);
  if (!normalized) {
    return false;
  }
  try {
    const url = new URL(normalized);
    if (isSemanticQueryFeedUrl(url)) {
      return true;
    }
  } catch {
    // Fall through to path-based checks.
  }
  return (
    /(^|\/)(feed|feeds|rss|atom)(\/|\.|$)/i.test(normalized) ||
    /\.(rss|atom|xml)$/i.test(normalized) ||
    normalized.includes("feedburner")
  );
}

function isApiLikeUrl(value: unknown): boolean {
  const normalized = normalizeUrlKey(value);
  if (!normalized) {
    return false;
  }
  try {
    const url = new URL(normalized);
    const path = url.pathname.toLowerCase();
    if (isSemanticQueryFeedUrl(url) || isFeedLikeUrl(url.toString())) {
      return false;
    }
    return (
      /(^|\/)(api|graphql|openapi|swagger)(\/|\.|$)/i.test(path) ||
      /\.(json|ndjson)$/i.test(path) ||
      (url.searchParams.has("format") &&
        String(url.searchParams.get("format")).toLowerCase() === "json")
    );
  } catch {
    return /(^|\/)(api|graphql|openapi|swagger)(\/|\.|$)/i.test(normalized) ||
      /\.(json|ndjson)$/i.test(normalized);
  }
}

function isWebsiteOnlyUrl(value: unknown): boolean {
  const raw = normalizeString(value);
  if (!raw || isFeedLikeUrl(raw)) {
    return false;
  }
  try {
    const url = new URL(raw);
    const path = url.pathname.replace(/\/+$/, "");
    return !path || path === "/" || !/\.(rss|atom|xml)$/i.test(path);
  } catch {
    return false;
  }
}

function readFeedProbeEvidence(payload: Record<string, unknown>): Record<string, unknown> | null {
  const evidence = payload.feedProbeEvidence ?? payload.feed_probe_evidence;
  if (evidence != null && typeof evidence === "object" && !Array.isArray(evidence)) {
    return evidence as Record<string, unknown>;
  }
  const validation = payload.validation;
  if (validation != null && typeof validation === "object" && !Array.isArray(validation)) {
    const nested = (validation as Record<string, unknown>).feedProbeEvidence;
    if (nested != null && typeof nested === "object" && !Array.isArray(nested)) {
      return nested as Record<string, unknown>;
    }
  }
  return null;
}

function hasValidFeedProbeEvidence(
  payload: Record<string, unknown>,
  fetchUrl: string | null
): boolean {
  const evidence = readFeedProbeEvidence(payload);
  if (!evidence) {
    return false;
  }
  const valid = evidence.isValidRss ?? evidence.is_valid_rss;
  if (valid !== true) {
    return false;
  }
  const evidenceUrl = normalizeUrlKey(
    evidence.feedUrl ?? evidence.feed_url ?? evidence.finalUrl ?? evidence.final_url
  );
  const normalizedFetchUrl = normalizeUrlKey(fetchUrl);
  return !evidenceUrl || !normalizedFetchUrl || evidenceUrl === normalizedFetchUrl;
}

function readSourceCandidateStatus(payload: Record<string, unknown>): string | null {
  const status = normalizeString(
    payload.sourceCandidateStatus ?? payload.candidateStatus ?? payload.alternativeStatus
  );
  return status || null;
}

export function classifyChannelProviderShape(
  providerType: AdminChannelProviderType | string | null,
  fetchUrl: string | null
): ChannelProviderShapeClassification {
  if (providerType === "email_imap") {
    return "email_imap";
  }
  if (!normalizeString(fetchUrl)) {
    return "unknown";
  }
  try {
    const url = new URL(String(fetchUrl));
    if (isSemanticQueryFeedUrl(url)) {
      return "semantic_query_feed";
    }
  } catch {
    // Fall through to other checks.
  }
  if (isFeedLikeUrl(fetchUrl)) {
    return "feed_like";
  }
  if (isApiLikeUrl(fetchUrl)) {
    return "api_like";
  }
  if (isWebsiteOnlyUrl(fetchUrl)) {
    return "website_page";
  }
  return "unknown";
}

export function buildProviderShapeValidation(
  providerType: AdminChannelProviderType | string | null,
  fetchUrl: string | null,
  payload: Record<string, unknown> = {}
): ChannelProviderShapeValidation {
  const classification = classifyChannelProviderShape(providerType, fetchUrl);
  const feedProbeEvidence = readFeedProbeEvidence(payload);
  const alternatives: ChannelProviderShapeAlternative[] = [];
  let blocker: string | null = null;
  let recommendedProviderType: AdminChannelProviderType | "adapter_required" | null;

  if (classification === "api_like" && providerType !== "api") {
    blocker = "api_mapping_required";
    recommendedProviderType = "api";
    alternatives.push({
      providerType: "api",
      fetchUrl,
      reason: "URL shape looks like a structured API endpoint; configure API field mappings instead of onboarding it as RSS/website.",
      requiresMapping: true
    });
  } else if (providerType === "rss" && classification === "website_page") {
    if (hasValidFeedProbeEvidence(payload, fetchUrl)) {
      recommendedProviderType = "rss";
    } else {
      blocker = "rss_requires_feed_evidence";
      recommendedProviderType = "website";
      alternatives.push({
        providerType: "website",
        fetchUrl,
        reason: "URL looks like a website page/root. Use website ingestion or run channel alternatives to discover a real feed URL."
      });
      alternatives.push({
        providerType: "rss",
        fetchUrl: null,
        reason: "Run feed autodiscovery; only onboard RSS when fetchers feed-probe validates a discovered RSS/Atom/JSON Feed."
      });
    }
  } else if (providerType === "website" && ["feed_like", "semantic_query_feed"].includes(classification)) {
    recommendedProviderType = "rss";
    alternatives.push({
      providerType: "rss",
      fetchUrl,
      reason: "URL looks feed-like; RSS is usually the safer provider when the feed probe validates it."
    });
  } else if (providerType === "api" && classification !== "api_like") {
    recommendedProviderType = "api";
  } else {
    recommendedProviderType = isAdminChannelProviderType(String(providerType ?? ""))
      ? (providerType as AdminChannelProviderType)
      : null;
  }

  return {
    classification,
    blocker,
    recommendedProviderType,
    recommendedAlternatives: alternatives,
    ...(feedProbeEvidence ? { feedProbeEvidence } : {})
  };
}

function rowDedupeKey(
  providerType: AdminChannelProviderType,
  payload: Record<string, unknown>
): string {
  if (providerType === "email_imap") {
    return [
      providerType,
      normalizeString(payload.host).toLowerCase(),
      normalizeString(payload.username).toLowerCase(),
      normalizeString(payload.mailbox).toLowerCase() || "inbox"
    ].join(":");
  }
  return `${providerType}:${normalizeSourceIdentityUrlKey(payload.fetchUrl, {
    preserveSemanticQuery: providerType === "api",
  })}`;
}

function parseBulkOnboardingRow(
  row: unknown,
  index: number
): { parsed?: ParsedBulkImportChannel; item?: BulkOnboardingPlanItem } {
  if (row == null || typeof row !== "object" || Array.isArray(row)) {
    return {
      item: {
        index,
        status: "invalid_schema",
        providerType: null,
        name: null,
        fetchUrl: null,
        action: "skip",
        matchType: null,
        channelId: null,
        existingName: null,
        existingFetchUrl: null,
        warnings: [],
        errors: ["Source row must be an object."],
        requiresOverride: false,
        validation: {
          classification: "unknown",
          blocker: "invalid_schema",
          recommendedProviderType: null,
          recommendedAlternatives: []
        }
      }
    };
  }

  const payload = row as Record<string, unknown>;
  let providerType: AdminChannelProviderType;
  try {
    providerType = resolveBulkImportRowProviderType(payload, index);
  } catch (error) {
    return {
      item: {
        index,
        status: isAdminChannelProviderType(normalizeString(payload.providerType))
          ? "invalid_schema"
          : "unsupported",
        providerType: normalizeString(payload.providerType) || null,
        name: normalizeString(payload.name) || null,
        fetchUrl: normalizeString(payload.fetchUrl) || null,
        action: "skip",
        matchType: null,
        channelId: null,
        existingName: null,
        existingFetchUrl: null,
        warnings: [],
        errors: [error instanceof Error ? error.message : "Unsupported providerType."],
        requiresOverride: false,
        validation: {
          classification: "unknown",
          blocker: "unsupported_provider",
          recommendedProviderType: null,
          recommendedAlternatives: []
        }
      }
    };
  }

  try {
    const parsed = parseBulkChannels([payload])[0];
    return {
      parsed: {
        ...parsed,
        index,
        providerType
      }
    };
  } catch (error) {
    return {
      item: {
        index,
        status: "invalid_schema",
        providerType,
        name: normalizeString(payload.name) || null,
        fetchUrl: normalizeString(payload.fetchUrl) || null,
        action: "skip",
        matchType: null,
        channelId: null,
        existingName: null,
        existingFetchUrl: null,
        warnings: [],
        errors: [error instanceof Error ? error.message : "Invalid source row."],
        requiresOverride: false,
        validation: buildProviderShapeValidation(
          providerType,
          normalizeString(payload.fetchUrl) || null,
          payload
        )
      }
    };
  }
}

function stableNormalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableNormalize);
  }
  if (value != null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableNormalize(entry)])
    );
  }
  return value;
}

function fingerprintPlan(input: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(stableNormalize(input)))
    .digest("hex")
    .slice(0, 24);
}

async function readExistingChannelIdRows(
  pool: Pool,
  parsedRows: ParsedBulkImportChannel[]
): Promise<Map<string, { channelId: string; providerType: AdminChannelProviderType; name: string | null; fetchUrl: string | null }>> {
  const channelIds = Array.from(
    new Set(
      parsedRows
        .map((row) => normalizeString(row.channel.channelId))
        .filter(Boolean)
    )
  );
  if (channelIds.length === 0) {
    return new Map();
  }
  const result = await pool.query<{
    channel_id: string;
    provider_type: AdminChannelProviderType;
    name: string | null;
    fetch_url: string | null;
  }>(
    `
      select channel_id::text as channel_id,
             provider_type,
             name,
             fetch_url
      from source_channels
      where channel_id::text = any($1::text[])
    `,
    [channelIds]
  );
  return new Map(
    result.rows.map((row) => [
      row.channel_id,
      {
        channelId: row.channel_id,
        providerType: row.provider_type,
        name: row.name ?? null,
        fetchUrl: row.fetch_url ?? null
      }
    ])
  );
}

function nextBulkReadBack(channelIds: string[] = []) {
  return [
    {
      toolName: "channels.bulk_onboard.verify",
      argumentsTemplate: { channelIds, includeSamples: true }
    },
    {
      toolName: "operator.report.verify",
      argumentsTemplate: {
        reportKind: "channel_onboarding",
        entityIds: { channelIds },
        includeSamples: true
      }
    }
  ];
}

function buildPlanSummary(
  items: BulkOnboardingPlanItem[],
  importPlan: BulkImportPlan
): BulkOnboardingSummary {
  const count = (status: BulkOnboardingItemStatus) =>
    items.filter((item) => item.status === status).length;
  const blocked = items.filter(
    (item) =>
      item.status === "duplicate" ||
      item.status === "invalid_schema" ||
      item.status === "unsupported" ||
      item.status === "api_mapping_required" ||
      item.status === "adapter_required" ||
      item.status === "needs_override"
  ).length;

  return {
    total: items.length,
    readyCreate: count("ready_create"),
    readyUpdate: count("ready_update"),
    duplicate: count("duplicate"),
    invalidSchema: count("invalid_schema"),
    providerMismatchRisk: count("provider_mismatch_risk"),
    needsOverride: count("needs_override"),
    apiMappingRequired: count("api_mapping_required"),
    adapterRequired: count("adapter_required"),
    unsupported: count("unsupported"),
    blocked,
    wouldCreate: importPlan.wouldCreate,
    wouldUpdate: importPlan.wouldUpdate,
    matchedByChannelId: importPlan.matchedByChannelId,
    matchedByFetchUrl: importPlan.matchedByFetchUrl,
    providerBreakdown: importPlan.providerBreakdown
  };
}

export async function planChannelBulkOnboardingWithPool(
  pool: Pool,
  sources: unknown,
  options: BulkOnboardingPlanOptions = {}
): Promise<BulkOnboardingPlan> {
  if (!Array.isArray(sources)) {
    throw new Error("sources must be an array of channel payload objects.");
  }
  if (sources.length === 0) {
    throw new Error("sources must include at least one source.");
  }

  const mode = options.mode ?? "strict";
  const parsedRows: ParsedBulkImportChannel[] = [];
  const earlyItems: BulkOnboardingPlanItem[] = [];
  const seenKeys = new Map<string, number>();

  sources.forEach((row, index) => {
    const parsed = parseBulkOnboardingRow(row, index);
    if (parsed.item) {
      earlyItems.push(parsed.item);
      return;
    }
    if (!parsed.parsed) {
      return;
    }

    const payload = row as Record<string, unknown>;
    const key = rowDedupeKey(parsed.parsed.providerType, payload);
    const firstIndex = seenKeys.get(key);
    if (key && firstIndex != null) {
      earlyItems.push({
        index,
        status: "duplicate",
        providerType: parsed.parsed.providerType,
        name: normalizeString(payload.name) || parsed.parsed.channel.name,
        fetchUrl: normalizeString(payload.fetchUrl) || null,
        action: "skip",
        matchType: "duplicate",
        channelId: null,
        existingName: null,
        existingFetchUrl: null,
        warnings: [`Duplicate of source row ${firstIndex}; only the first matching source is actionable.`],
        errors: [],
        requiresOverride: false,
        validation: buildProviderShapeValidation(
          parsed.parsed.providerType,
          normalizeString(payload.fetchUrl) || null,
          payload
        )
      });
      return;
    }
    if (key) {
      seenKeys.set(key, index);
    }
    parsedRows.push(parsed.parsed);
  });

  const existingChannelIdRows = await readExistingChannelIdRows(pool, parsedRows);
  const validParsedRows: ParsedBulkImportChannel[] = [];
  for (const parsed of parsedRows) {
    const channelId = normalizeString(parsed.channel.channelId);
    if (!channelId) {
      validParsedRows.push(parsed);
      continue;
    }
    const existing = existingChannelIdRows.get(channelId);
    const rawPayload =
      sources[parsed.index] != null &&
      typeof sources[parsed.index] === "object" &&
      !Array.isArray(sources[parsed.index])
        ? (sources[parsed.index] as Record<string, unknown>)
        : {};
    if (!existing) {
      earlyItems.push({
        index: parsed.index,
        status: "invalid_schema",
        providerType: parsed.providerType,
        name: parsed.channel.name,
        fetchUrl: "fetchUrl" in parsed.channel ? parsed.channel.fetchUrl : null,
        action: "skip",
        matchType: "channelId",
        channelId,
        existingName: null,
        existingFetchUrl: null,
        warnings: [
          "channelId is for updating existing channels only; omit channelId when creating a source."
        ],
        errors: [`Channel ${channelId} was not found.`],
        requiresOverride: false,
        recommendedAction:
          "Omit channelId for creates; use an existing channelId only for updates.",
        validation: buildProviderShapeValidation(
          parsed.providerType,
          "fetchUrl" in parsed.channel ? parsed.channel.fetchUrl : null,
          rawPayload
        )
      });
      continue;
    }
    if (existing.providerType !== parsed.providerType) {
      earlyItems.push({
        index: parsed.index,
        status: "invalid_schema",
        providerType: parsed.providerType,
        name: parsed.channel.name,
        fetchUrl: "fetchUrl" in parsed.channel ? parsed.channel.fetchUrl : null,
        action: "skip",
        matchType: "channelId",
        channelId,
        existingName: existing.name,
        existingFetchUrl: existing.fetchUrl,
        warnings: [
          `Existing channelId belongs to providerType=${existing.providerType}, not ${parsed.providerType}.`
        ],
        errors: ["Provider mismatch for existing channelId."],
        requiresOverride: false,
        recommendedAction:
          "Use the existing channel's providerType for updates, or omit channelId to plan a new source.",
        validation: buildProviderShapeValidation(
          parsed.providerType,
          "fetchUrl" in parsed.channel ? parsed.channel.fetchUrl : null,
          rawPayload
        )
      });
      continue;
    }
    validParsedRows.push(parsed);
  }

  const importPlan =
    validParsedRows.length > 0
      ? await planBulkImportWithPool(pool, validParsedRows)
      : {
          channels: [],
          wouldCreate: 0,
          wouldUpdate: 0,
          matchedByChannelId: 0,
          matchedByFetchUrl: 0,
          items: [],
          providerBreakdown: []
        };

  const plannedItems = new Map<number, BulkImportPlanItem>();
  importPlan.items.forEach((item) => plannedItems.set(item.index, item));

  const items: BulkOnboardingPlanItem[] = [...earlyItems];
  for (const parsed of validParsedRows) {
    const planned = plannedItems.get(parsed.index);
    if (!planned) {
      items.push({
        index: parsed.index,
        status: "invalid_schema",
        providerType: parsed.providerType,
        name: parsed.channel.name,
        fetchUrl: "fetchUrl" in parsed.channel ? parsed.channel.fetchUrl : null,
        action: "skip",
        matchType: null,
        channelId: null,
        existingName: null,
        existingFetchUrl: null,
        warnings: [],
        errors: ["Provider preflight did not return a plan item for this source."],
        requiresOverride: false,
        validation: buildProviderShapeValidation(
          parsed.providerType,
          "fetchUrl" in parsed.channel ? parsed.channel.fetchUrl : null
        )
      });
      continue;
    }

    const warnings: string[] = [];
    let status: BulkOnboardingItemStatus =
      planned.action === "update" ? "ready_update" : "ready_create";
    let requiresOverride = false;
    const rawPayload =
      sources[parsed.index] != null &&
      typeof sources[parsed.index] === "object" &&
      !Array.isArray(sources[parsed.index])
        ? (sources[parsed.index] as Record<string, unknown>)
        : {};
    const validation = buildProviderShapeValidation(
      parsed.providerType,
      planned.fetchUrl,
      rawPayload
    );
    const sourceCandidateStatus = readSourceCandidateStatus(rawPayload);

    if (
      parsed.providerType === "rss" &&
      sourceCandidateStatus === "needs_probe" &&
      !hasValidFeedProbeEvidence(rawPayload, planned.fetchUrl)
    ) {
      status = "unsupported";
      warnings.push(
        "RSS alternative candidate is still marked needs_probe. Run feed autodiscovery/probe and include valid feedProbeEvidence before onboarding."
      );
    } else if (validation.blocker === "api_mapping_required") {
      status = "api_mapping_required";
      warnings.push(
        "Source URL looks API-like. Configure an API channel with item/field mappings instead of importing it as RSS or website."
      );
    } else if (validation.blocker === "rss_requires_feed_evidence") {
      status = "needs_override";
      requiresOverride = true;
      warnings.push(
        "RSS source looks like a website page/root URL. Use providerType=website unless you have external feed-validation evidence."
      );
    } else if (
      parsed.providerType === "website" &&
      ["feed_like", "semantic_query_feed"].includes(validation.classification)
    ) {
      status = "provider_mismatch_risk";
      warnings.push(
        "Website source URL looks feed-like. This is allowed, but RSS may be the better provider if the URL is a valid feed."
      );
    }

    if (status === "needs_override" && mode === "strict") {
      warnings.push("Strict mode blocks this row until apply is retried with mode=allow_overrides and overrideReason.");
    }

    items.push({
      index: parsed.index,
      status,
      providerType: parsed.providerType,
      name: planned.name,
      fetchUrl: planned.fetchUrl,
      action: planned.action,
      matchType: planned.matchType,
      channelId: planned.channelId,
      existingName: planned.existingName,
      existingFetchUrl: planned.existingFetchUrl,
      warnings,
      errors: [],
      requiresOverride,
      validation
    });
  }

  const sortedItems = items.sort((left, right) => left.index - right.index);
  const warnings = sortedItems.flatMap((item) =>
    item.warnings.map((warning) => `source[${item.index}]: ${warning}`)
  );
  const summary = buildPlanSummary(sortedItems, importPlan);
  const planFingerprint = fingerprintPlan({
    mode,
    sources: sources.map((source) => stableNormalize(source)),
    items: sortedItems.map((item) => ({
      index: item.index,
      status: item.status,
      providerType: item.providerType,
      action: item.action,
      matchType: item.matchType,
      channelId: item.channelId,
      existingFetchUrl: item.existingFetchUrl,
      fetchUrl: item.fetchUrl,
      validation: item.validation
    })),
    summary: {
      readyCreate: summary.readyCreate,
      readyUpdate: summary.readyUpdate,
      needsOverride: summary.needsOverride,
      apiMappingRequired: summary.apiMappingRequired,
      adapterRequired: summary.adapterRequired,
      duplicate: summary.duplicate,
      invalidSchema: summary.invalidSchema,
      unsupported: summary.unsupported,
      matchedByChannelId: summary.matchedByChannelId,
      matchedByFetchUrl: summary.matchedByFetchUrl
    }
  });

  return {
    planFingerprint,
    mode,
    summary,
    items: sortedItems,
    warnings,
    blocked: sortedItems.filter(
      (item) =>
        item.status === "duplicate" ||
        item.status === "invalid_schema" ||
        item.status === "unsupported" ||
        item.status === "api_mapping_required" ||
        item.status === "adapter_required" ||
        item.status === "needs_override"
    ),
    nextReadBack: nextBulkReadBack()
  };
}

function isActionableBulkStatus(
  status: BulkOnboardingItemStatus,
  mode: BulkOnboardingMode,
  overrideReason: string | null
): boolean {
  if (status === "ready_create" || status === "ready_update" || status === "provider_mismatch_risk") {
    return true;
  }
  return status === "needs_override" && mode === "allow_overrides" && Boolean(overrideReason);
}

async function writeBulkAuditLogs(
  pool: Pool,
  actorUserId: string,
  channels: ParsedBulkImportChannel[],
  result: BulkImportExecutionResult,
  overrideReason: string | null
) {
  const channelIds = [...result.createdChannelIds, ...result.updatedChannelIds];
  for (const channelId of channelIds) {
    const channel = channels.find((entry) => entry.channel.channelId === channelId);
    await writeAuditLog(pool, {
      actorUserId,
      actionType: result.createdChannelIds.includes(channelId)
        ? "channel_created"
        : "channel_updated",
      entityType: "channel",
      entityId: channelId,
      payloadJson: {
        source: "mcp_bulk_onboarding",
        providerType: channel?.providerType ?? null,
        overrideReason
      }
    });
  }
}

export async function applyChannelBulkOnboardingWithPool(
  pool: Pool,
  actorUserId: string,
  sources: unknown,
  options: BulkOnboardingApplyOptions
): Promise<BulkOnboardingApplyResult> {
  const overrideReason = normalizeString(options.overrideReason) || null;
  const plan = await planChannelBulkOnboardingWithPool(pool, sources, {
    mode: options.mode,
    includeExisting: options.includeExisting
  });

  if (plan.planFingerprint !== options.planFingerprint) {
    throw new Error(
      "Bulk onboarding plan is stale. Re-run channels.bulk_onboard.plan and apply the new planFingerprint."
    );
  }
  const actionableItems = plan.items.filter((item) =>
    isActionableBulkStatus(item.status, plan.mode, overrideReason)
  );
  if (plan.summary.needsOverride > 0 && plan.mode !== "allow_overrides") {
    throw new Error("mode=allow_overrides is required for sources with status=needs_override.");
  }
  if (plan.summary.needsOverride > 0 && options.confirm !== true) {
    throw new Error("confirm=true is required for sources with status=needs_override.");
  }
  if (actionableItems.some((item) => item.action === "update") && options.confirm !== true) {
    throw new Error("confirm=true is required when the bulk onboarding plan updates existing channels.");
  }
  if (plan.summary.needsOverride > 0 && !overrideReason) {
    throw new Error("overrideReason is required for sources with status=needs_override.");
  }

  const actionableIndexes = new Set(actionableItems.map((item) => item.index));
  const planItemByIndex = new Map(plan.items.map((item) => [item.index, item]));
  const parsedRows = (sources as unknown[]).flatMap((row, index) => {
    if (!actionableIndexes.has(index)) {
      return [];
    }
    const planItem = planItemByIndex.get(index);
    const rowWithMatchedChannel =
      row != null &&
      typeof row === "object" &&
      !Array.isArray(row) &&
      planItem?.action === "update" &&
      planItem.channelId
        ? { ...(row as Record<string, unknown>), channelId: planItem.channelId }
        : row;
    const parsed = parseBulkOnboardingRow(rowWithMatchedChannel, index);
    return parsed.parsed ? [parsed.parsed] : [];
  });
  const result =
    parsedRows.length > 0
      ? await executeBulkImportWithPool(pool, parsedRows)
      : {
          createdChannelIds: [],
          updatedChannelIds: [],
          authConfiguredChannelIds: [],
          authClearedChannelIds: [],
          providerBreakdown: []
        };

  await writeBulkAuditLogs(pool, actorUserId, parsedRows, result, overrideReason);

  const createdIds = [...result.createdChannelIds];
  const updatedIds = [...result.updatedChannelIds];
  const appliedByIndex = new Map<number, { status: "created" | "updated"; channelId: string | null }>();
  let createCursor = 0;
  let updateCursor = 0;
  for (const item of plan.items) {
    if (!actionableIndexes.has(item.index)) {
      continue;
    }
    if (item.action === "update") {
      appliedByIndex.set(item.index, {
        status: "updated",
        channelId: item.channelId ?? updatedIds[updateCursor++] ?? null
      });
      continue;
    }
    appliedByIndex.set(item.index, {
      status: "created",
      channelId: createdIds[createCursor++] ?? null
    });
  }

  const items = plan.items.map((item) => {
    const applied = appliedByIndex.get(item.index);
    if (applied) {
      return {
        index: item.index,
        status: applied.status,
        channelId: applied.channelId,
        providerType: item.providerType,
        reason: null
      };
    }
    return {
      index: item.index,
      status: "skipped" as const,
      channelId: item.channelId,
      providerType: item.providerType,
      reason: item.errors[0] ?? item.warnings[0] ?? `status=${item.status}`
    };
  });
  const skipped = plan.items.filter((item) => !actionableIndexes.has(item.index));
  const channelIds = [...createdIds, ...updatedIds];

  return {
    planFingerprint: plan.planFingerprint,
    summary: {
      createdCount: createdIds.length,
      updatedCount: updatedIds.length,
      skippedCount: skipped.length,
      failedCount: 0
    },
    items,
    createdChannelIds: createdIds,
    updatedChannelIds: updatedIds,
    skipped,
    failed: [],
    warnings: plan.warnings,
    nextReadBack: nextBulkReadBack(channelIds)
  };
}

export async function verifyChannelBulkOnboardingWithPool(
  pool: Pool,
  channelIds: string[],
  includeSamples = false
): Promise<BulkOnboardingVerifyResult> {
  const requestedIds = [...new Set(channelIds.map((id) => normalizeString(id)).filter(Boolean))];
  const channelResult = await pool.query(
    `
      select sc.channel_id::text as "channelId",
             sc.name,
             sc.provider_type as "providerType",
             sc.is_active as "isActive",
             sc.fetch_url as "fetchUrl",
             sc.updated_at as "updatedAt",
             (select count(*)::int from signal_candidates a where a.channel_id = sc.channel_id) as "signalCandidateCount",
             (select count(*)::int from channel_fetch_runs cfr where cfr.channel_id = sc.channel_id) as "fetchRunCount",
             (select count(*)::int from channel_fetch_runs cfr where cfr.channel_id = sc.channel_id and cfr.outcome_kind in ('success', 'new_content')) as "successfulFetchRunCount",
             (select count(*)::int from web_resources wr where wr.channel_id = sc.channel_id) as "webResourceCount",
             (select count(*)::int from web_resources wr where wr.channel_id = sc.channel_id and wr.projected_signal_candidate_id is not null) as "projectedSignalCandidateCount",
             (
               select count(*)::int
               from web_resources wr
               join final_selection_results fsr on fsr.doc_id = wr.projected_signal_candidate_id
               where wr.channel_id = sc.channel_id and fsr.final_decision = 'selected'
             ) as "selectedProjectedSignalCandidateCount",
             (
               select count(*)::int
               from web_resources wr
               join final_selection_results fsr on fsr.doc_id = wr.projected_signal_candidate_id
               where wr.channel_id = sc.channel_id and fsr.final_decision = 'rejected'
             ) as "rejectedProjectedSignalCandidateCount",
             (
               select count(*)::int
               from web_resources wr
               join final_selection_results fsr on fsr.doc_id = wr.projected_signal_candidate_id
               where wr.channel_id = sc.channel_id and fsr.final_decision = 'gray_zone'
             ) as "grayZoneProjectedSignalCandidateCount"
      from source_channels sc
      where cardinality($1::text[]) = 0 or sc.channel_id::text = any($1::text[])
      order by sc.updated_at desc
      limit 100
    `,
    [requestedIds]
  );
  const foundIds = new Set(channelResult.rows.map((row) => String(row.channelId)));
  const missingChannelIds = requestedIds.filter((id) => !foundIds.has(id));
  const decisionCounts = await pool.query(
    `
      select sc.channel_id::text as "channelId",
             sc.name,
             coalesce(fsr.final_decision, 'not_projected') as "finalDecision",
             wr.projection_state as "projectionState",
             count(*)::int as count
      from source_channels sc
      join web_resources wr on wr.channel_id = sc.channel_id
      left join final_selection_results fsr on fsr.doc_id = wr.projected_signal_candidate_id
      where (cardinality($1::text[]) = 0 or sc.channel_id::text = any($1::text[]))
        and sc.provider_type = 'website'
      group by sc.channel_id, sc.name, coalesce(fsr.final_decision, 'not_projected'), wr.projection_state
      order by sc.name, coalesce(fsr.final_decision, 'not_projected'), wr.projection_state
    `,
    [requestedIds]
  );

  const samples = includeSamples
    ? {
        fetchRuns: (
          await pool.query(
            `
              select cfr.fetch_run_id::text as "runId",
                     cfr.channel_id::text as "channelId",
                     cfr.provider_type as "providerType",
                     cfr.outcome_kind as "outcomeKind",
                     cfr.started_at as "startedAt",
                     cfr.finished_at as "completedAt",
                     cfr.error_text as "errorMessage"
              from channel_fetch_runs cfr
              where cardinality($1::text[]) = 0 or cfr.channel_id::text = any($1::text[])
              order by cfr.started_at desc
              limit 20
            `,
            [requestedIds]
          )
        ).rows,
        webResources: (
          await pool.query(
            `
              select wr.resource_id::text as "resourceId",
                     wr.channel_id::text as "channelId",
                     wr.url,
                     wr.resource_kind as "resourceKind",
                     wr.extraction_state as "extractionState",
                     wr.projection_state as "projectionState",
                     wr.projected_signal_candidate_id::text as "projectedSignalCandidateId",
                     fsr.final_decision as "finalDecision",
                     fsr.verification_state as "verificationState"
              from web_resources wr
              left join final_selection_results fsr on fsr.doc_id = wr.projected_signal_candidate_id
              where cardinality($1::text[]) = 0 or wr.channel_id::text = any($1::text[])
              order by wr.updated_at desc
              limit 20
            `,
            [requestedIds]
          )
        ).rows
      }
    : undefined;

  const acquisitionSucceeded = channelResult.rows.filter((row) => {
    const providerType = String(row.providerType ?? "");
    const fetchRuns = Number(row.fetchRunCount ?? 0);
    const signal_candidates = Number(row.signalCandidateCount ?? 0);
    const resources = Number(row.webResourceCount ?? 0);
    return fetchRuns > 0 || signal_candidates > 0 || (providerType === "website" && resources > 0);
  }).length;
  const websiteProjected = channelResult.rows.reduce(
    (sum, row) => sum + Number(row.projectedSignalCandidateCount ?? 0),
    0
  );
  const websiteProjectedRejected = channelResult.rows.reduce(
    (sum, row) => sum + Number(row.rejectedProjectedSignalCandidateCount ?? 0),
    0
  );
  const warnings: string[] = [];
  if (missingChannelIds.length > 0) {
    warnings.push("Some requested channelIds were not found in source_channels.");
  }
  if (websiteProjectedRejected > 0) {
    warnings.push(
      "Some website resources projected into signal_candidates and were rejected downstream by final_selection_results; that is selection/content policy behavior, not channel onboarding failure."
    );
  }
  const providerShapeRisks = channelResult.rows
    .map((row) => ({
      channelId: row.channelId,
      name: row.name,
      providerType: row.providerType,
      fetchUrl: row.fetchUrl,
      validation: buildProviderShapeValidation(
        String(row.providerType ?? ""),
        String(row.fetchUrl ?? "")
      ),
    }))
    .filter((row) => row.validation.blocker);
  if (providerShapeRisks.length > 0) {
    warnings.push(
      `${providerShapeRisks.length} channel${providerShapeRisks.length === 1 ? "" : "s"} have provider-shape blockers; run channels.alternatives.plan before judging source quality.`
    );
  }

  return {
    reportKind: "channel_onboarding",
    verifiedAt: new Date().toISOString(),
    summary: {
      requestedChannels: requestedIds.length,
      foundChannels: channelResult.rows.length,
      missingChannelIds,
      acquisitionSucceeded,
      websiteProjected,
      websiteProjectedRejected
    },
    channels: channelResult.rows,
    websitePipeline: {
      note:
        "Website onboarding is verified in stages: channel row, fetch/acquisition, web_resources, projection, then downstream final selection. resource_only/projected/projected-but-rejected are distinct states.",
      countsByDecision: decisionCounts.rows
    },
    providerShapeRisks,
    ...(samples ? { samples } : {}),
    warnings,
    nextReadBack: nextBulkReadBack(requestedIds)
  };
}

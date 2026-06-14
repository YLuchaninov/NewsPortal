import type { Pool } from "pg";

import {
  ADMIN_CHANNEL_PROVIDER_TYPES,
  type AdminChannelProviderType
} from "./channel-providers";
import {
  planApiBulkImport,
  type NormalizedApiAdminChannelInput,
} from "./api-channels";
import {
  planEmailImapBulkImport,
  type NormalizedEmailImapAdminChannelInput,
} from "./email-imap-channels";
import {
  planRssBulkImport,
  type NormalizedRssAdminChannelInput,
} from "./rss-channels";
import {
  planWebsiteBulkImport,
  type NormalizedWebsiteAdminChannelInput,
} from "./website-channels";
import {
  buildProviderShapeValidation,
  hasValidFeedProbeEvidence,
  readSourceCandidateStatus,
} from "./channel-provider-shape";
import type {
  BulkImportChannel,
  BulkImportPlan,
  BulkImportPlanItem,
  BulkImportProviderBreakdown,
  BulkOnboardingItemStatus,
  BulkOnboardingPlan,
  BulkOnboardingPlanItem,
  BulkOnboardingPlanOptions,
  BulkOnboardingSummary,
  ParsedBulkImportChannel,
  ProviderBulkImportPlan,
  ProviderBulkImportPlanItem,
} from "./channel-bulk-onboarding-model";
export {
  buildProviderShapeValidation,
  classifyChannelProviderShape
} from "./channel-provider-shape";
export type {
  ChannelProviderShapeAlternative,
  ChannelProviderShapeClassification,
  ChannelProviderShapeValidation
} from "./channel-provider-shape";
export type {
  BulkImportChannel,
  BulkImportExecutionBreakdown,
  BulkImportExecutionResult,
  BulkImportPlan,
  BulkImportPlanItem,
  BulkImportProviderBreakdown,
  BulkOnboardingApplyOptions,
  BulkOnboardingApplyResult,
  BulkOnboardingItemStatus,
  BulkOnboardingMode,
  BulkOnboardingPlan,
  BulkOnboardingPlanItem,
  BulkOnboardingPlanOptions,
  BulkOnboardingSummary,
  BulkOnboardingVerifyResult,
  ParsedBulkImportChannel,
} from "./channel-bulk-onboarding-model";

import {
  fingerprintPlan,
  normalizeString,
  parseBulkOnboardingRow,
  rowDedupeKey,
  stableNormalize,
} from "./channel-bulk-onboarding-parsing";

export function groupParsedBulkChannels(
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

export function sortProviderBreakdown<T extends { providerType: AdminChannelProviderType }>(
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

export function nextBulkReadBack(channelIds: string[] = []) {
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

import type { Pool } from "pg";

import {
  ADMIN_CHANNEL_PROVIDER_TYPES,
  type AdminChannelProviderType
} from "./channel-providers";
import {
  upsertApiChannels,
  type NormalizedApiAdminChannelInput,
} from "./api-channels";
import {
  upsertEmailImapChannels,
  type NormalizedEmailImapAdminChannelInput,
} from "./email-imap-channels";
import {
  upsertRssChannels,
  type NormalizedRssAdminChannelInput,
} from "./rss-channels";
import {
  upsertWebsiteChannels,
  type NormalizedWebsiteAdminChannelInput,
} from "./website-channels";
import { writeAuditLog } from "./audit";
import type {
  BulkImportExecutionBreakdown,
  BulkImportExecutionResult,
  BulkOnboardingApplyOptions,
  BulkOnboardingApplyResult,
  BulkOnboardingItemStatus,
  BulkOnboardingMode,
  ParsedBulkImportChannel,
  ProviderBulkImportExecutionResult,
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
  normalizeString,
  parseBulkOnboardingRow,
} from "./channel-bulk-onboarding-parsing";
import {
  groupParsedBulkChannels,
  nextBulkReadBack,
  planChannelBulkOnboardingWithPool,
  sortProviderBreakdown,
} from "./channel-bulk-onboarding-planning";

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

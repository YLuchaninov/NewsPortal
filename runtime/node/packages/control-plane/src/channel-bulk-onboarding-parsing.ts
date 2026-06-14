import { createHash } from "node:crypto";

import {
  ADMIN_CHANNEL_PROVIDER_TYPES,
  isAdminChannelProviderType,
  type AdminChannelProviderType
} from "./channel-providers";
import {
  parseApiAdminChannelInput,
} from "./api-channels";
import {
  parseEmailImapAdminChannelInput,
} from "./email-imap-channels";
import {
  parseRssAdminChannelInput,
} from "./rss-channels";
import {
  parseWebsiteAdminChannelInput,
} from "./website-channels";
import {
  buildProviderShapeValidation,
  normalizeSourceIdentityUrlKey,
} from "./channel-provider-shape";
import type {
  BulkOnboardingPlanItem,
  ParsedBulkImportChannel,
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


export function normalizeString(value: unknown): string {
  return String(value ?? "").trim();
}

export function rowDedupeKey(
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

export function parseBulkOnboardingRow(
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

export function stableNormalize(value: unknown): unknown {
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

export function fingerprintPlan(input: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(stableNormalize(input)))
    .digest("hex")
    .slice(0, 24);
}

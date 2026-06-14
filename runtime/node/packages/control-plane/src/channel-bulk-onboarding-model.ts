import type {
  ApiBulkImportPlan,
  NormalizedApiAdminChannelInput,
  UpsertApiChannelsResult,
} from "./api-channels";
import type { AdminChannelProviderType } from "./channel-providers";
import type { ChannelProviderShapeValidation } from "./channel-provider-shape";
import type {
  EmailImapBulkImportPlan,
  NormalizedEmailImapAdminChannelInput,
  UpsertEmailImapChannelsResult,
} from "./email-imap-channels";
import type {
  NormalizedRssAdminChannelInput,
  RssBulkImportPlan,
  UpsertRssChannelsResult,
} from "./rss-channels";
import type {
  NormalizedWebsiteAdminChannelInput,
  UpsertWebsiteChannelsResult,
  WebsiteBulkImportPlan,
} from "./website-channels";

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

export type ProviderBulkImportPlan =
  | RssBulkImportPlan
  | WebsiteBulkImportPlan
  | ApiBulkImportPlan
  | EmailImapBulkImportPlan;

export type ProviderBulkImportExecutionResult =
  | UpsertRssChannelsResult
  | UpsertWebsiteChannelsResult
  | UpsertApiChannelsResult
  | UpsertEmailImapChannelsResult;

export type ProviderBulkImportPlanItem = {
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

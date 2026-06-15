import type { ChannelProviderShapeValidation } from "./channel-bulk-onboarding";

export type ChannelBottleneckFailureBucket =
  | "healthy"
  | "working_noisy"
  | "working_low_yield"
  | "broken_fetch"
  | "provider_shape_mismatch"
  | "adapter_required"
  | "rate_limited"
  | "robots_blocked"
  | "projection_blocked"
  | "gone_404"
  | "auth_or_blocked_403"
  | "not_acceptable_406"
  | "malformed_feed"
  | "html_instead_of_feed"
  | "timeout_dns_tls"
  | "too_large";

export type ChannelBottleneckRepairLane =
  | "none"
  | "monitor_quality"
  | "deep_alternatives"
  | "configure_adapter"
  | "respect_rate_limit"
  | "access_or_auth_required"
  | "polite_retry"
  | "projection_repair";

export type ChannelSourceClass = "operator_like" | "test_or_audit_like" | "unknown";

export interface ChannelBottleneckListOptions {
  page?: number;
  pageSize?: number;
  channelIds?: string[];
  providerType?: string;
  failureBucket?: string;
  repairLane?: string;
  q?: string;
}

export interface ChannelBottleneckRow {
  channelId: string;
  name: string;
  providerType: string;
  adapterKey: string | null;
  researchMode: string | null;
  tosRisk: string | null;
  sourceRole: string | null;
  sourceClass: ChannelSourceClass;
  fetchUrl: string | null;
  isActive: boolean;
  activeState: "active" | "paused";
  pollIntervalSeconds: number;
  effectivePollIntervalSeconds: number;
  maxPollIntervalSeconds: number;
  nextDueAt: string | null;
  repairDue: boolean;
  lastOutcomeKind: string | null;
  lastHttpStatus: number | null;
  lastErrorText: string | null;
  consecutiveFailures: number;
  consecutiveNoChangePolls: number;
  adaptiveReason: string | null;
  outcomes24h: Record<string, number>;
  outcomes7d: Record<string, number>;
  runStats24h: {
    runs: number;
    failures: number;
    fetchedItems: number;
    newItems: number;
    duplicates: number;
  };
  runStats7d: {
    runs: number;
    failures: number;
    fetchedItems: number;
    newItems: number;
    duplicates: number;
  };
  contentStats: {
    signalCandidateCount: number;
    selectedRows: number;
    selectedUniqueContent: number;
    grayRows: number;
    rejectedRows: number;
    visibleSignalCandidates: number;
    duplicateSignalCandidates: number;
  };
  projectionStats: {
    resources: number;
    projectedResources: number;
    resourceOnly: number;
    extractionFailed: number;
    projectedSelected: number;
    projectedGray: number;
    projectedRejected: number;
  };
  providerShapeValidation: ChannelProviderShapeValidation;
  failureBucket: ChannelBottleneckFailureBucket;
  repairLane: ChannelBottleneckRepairLane;
  legacyDdgsInternalBridge: boolean;
  legacyBridgeWarning: string | null;
}

export interface ChannelBottleneckList {
  generatedAt: string;
  page: number;
  pageSize: number;
  total: number;
  items: ChannelBottleneckRow[];
}

export interface ChannelBottleneckSummary {
  generatedAt: string;
  totalChannels: number;
  activeChannels: number;
  technicalBottlenecks: number;
  workingNoisy: number;
  workingLowYield: number;
  byFailureBucket: Array<{ failureBucket: ChannelBottleneckFailureBucket; count: number }>;
  byRepairLane: Array<{ repairLane: ChannelBottleneckRepairLane; count: number }>;
  byProvider: Array<{ providerType: string; count: number; technicalBottlenecks: number }>;
  bySourceClass: Array<{
    sourceClass: ChannelSourceClass;
    count: number;
    activeChannels: number;
    technicalBottlenecks: number;
  }>;
  nextReadBack: Array<Record<string, unknown>>;
}

export class ChannelBottleneckNotFoundError extends Error {
  constructor(channelId: string) {
    super(`Channel ${channelId} was not found in the source bottleneck read model.`);
    this.name = "ChannelBottleneckNotFoundError";
  }
}

export interface RawChannelBottleneckRow {
  channelId: string;
  name: string;
  providerType: string;
  adapterKey: string | null;
  researchMode: string | null;
  tosRisk: string | null;
  sourceRole: string | null;
  sourceClassConfig: string | null;
  testArtifactMarker: string | null;
  fetchUrl: string | null;
  isActive: boolean;
  pollIntervalSeconds: number;
  effectivePollIntervalSeconds: number;
  maxPollIntervalSeconds: number;
  nextDueAt: string | null;
  consecutiveFailures: number;
  consecutiveNoChangePolls: number;
  adaptiveReason: string | null;
  lastOutcomeKind: string | null;
  lastHttpStatus: number | null;
  lastErrorText: string | null;
  lastProviderMetrics: Record<string, unknown> | null;
  outcomeCounts24h: Record<string, unknown> | null;
  outcomeCounts7d: Record<string, unknown> | null;
  runCount24h: number;
  failureCount24h: number;
  fetchedItemCount24h: number;
  newItemCount24h: number;
  duplicateCount24h: number;
  runCount7d: number;
  failureCount7d: number;
  fetchedItemCount7d: number;
  newItemCount7d: number;
  duplicateCount7d: number;
  signalCandidateCount: number;
  selectedRows: number;
  selectedUniqueContent: number;
  grayRows: number;
  rejectedRows: number;
  visibleSignalCandidates: number;
  duplicateSignalCandidates: number;
  webResourceCount: number;
  projectedResourceCount: number;
  resourceOnlyCount: number;
  extractionFailedCount: number;
  projectedSelectedRows: number;
  projectedGrayRows: number;
  projectedRejectedRows: number;
}

export type AdminLiveUpdateSurface =
  | "dashboard"
  | "reindex"
  | "observability"
  | "user-interests"
  | "automation";

export interface AdminCollectionSignal {
  total: number;
  revision: string;
}

export interface AdminLlmBudgetSnapshot {
  enabled: boolean;
  monthlyBudgetCents: number;
  monthToDateCostCents: number;
  remainingMonthlyBudgetCents: number | null;
  monthlyQuotaReached: boolean;
  acceptGrayZoneOnBudgetExhaustion: boolean;
  revision: string;
}

export interface AdminDashboardSummarySnapshot {
  activeNews: number;
  processedToday: number;
  totalUsers: number;
  overdueChannels: number;
  fetchFailures24h: number;
  llmReviewCount24h: number;
  newContent24h: number;
  attentionChannels: number;
  queuedReindexJobs: number;
  runningReindexJobs: number;
  llmBudgetEnabled: boolean;
  llmMonthlyBudgetCents: number;
  llmMonthToDateCostCents: number;
  llmRemainingMonthlyBudgetCents: number | null;
  llmMonthlyQuotaReached: boolean;
  llmAcceptGrayZoneOnBudgetExhaustion: boolean;
  revision: string;
}

export interface AdminDashboardLiveSnapshot {
  surface: "dashboard";
  fetchedAt: string;
  revision: string;
  hasPendingWork: boolean;
  summary: AdminDashboardSummarySnapshot;
  fetchRuns: AdminCollectionSignal;
}

export interface AdminReindexJobSnapshot {
  reindexJobId: string;
  indexName: string;
  jobKind: string;
  status: string;
  createdAt: string | null;
  createdAtLabel: string | null;
  processedArticles: number | null;
  totalArticles: number | null;
  progressLabel: string | null;
  selectionProfileSnapshot: {
    activeProfiles: number;
    totalProfiles: number;
    compatibilityProfiles: number;
    templatesWithProfiles: number;
    maxVersion: number;
  } | null;
  selectionProfileSummary: string | null;
  revision: string;
}

export interface AdminReindexJobsSnapshot {
  total: number;
  page: number;
  totalPages: number;
  hasPrev: boolean;
  hasNext: boolean;
  queuedCount: number;
  runningCount: number;
  revision: string;
  items: AdminReindexJobSnapshot[];
}

export interface AdminReindexLiveSnapshot {
  surface: "reindex";
  fetchedAt: string;
  revision: string;
  hasPendingWork: boolean;
  jobs: AdminReindexJobsSnapshot;
}

export interface AdminObservabilityWindowSnapshot {
  reviewCount: number;
  totalTokens: number;
  costEstimateUsd: number;
  avgLatencyMs: number;
  revision: string;
}

export interface AdminObservabilityLiveSnapshot {
  surface: "observability";
  fetchedAt: string;
  revision: string;
  hasPendingWork: boolean;
  usage24h: AdminObservabilityWindowSnapshot;
  usage7d: AdminObservabilityWindowSnapshot;
  llmBudget: AdminLlmBudgetSnapshot;
  fetchRuns: AdminCollectionSignal;
  llmReviews: AdminCollectionSignal;
}

export type AdminUserInterestCompileTone =
  | "success"
  | "warning"
  | "muted"
  | "error";

export interface AdminUserInterestStatusSnapshot {
  interestId: string;
  compileStatus: string;
  compileLabel: string;
  compileTone: AdminUserInterestCompileTone;
  compileDetail: string | null;
  errorText: string | null;
  updatedAt: string | null;
  hasCompiledSnapshot: boolean;
  enabled: boolean;
  version: number;
}

export interface AdminUserInterestCountsSnapshot {
  total: number;
  enabledCount: number;
  compiledCount: number;
  queuedCount: number;
  failedCount: number;
  revision: string;
}

export interface AdminUserInterestsLiveSnapshot {
  surface: "user-interests";
  fetchedAt: string;
  revision: string;
  hasPendingWork: boolean;
  targetUserId: string;
  counts: AdminUserInterestCountsSnapshot;
  interests: AdminUserInterestStatusSnapshot[];
}

export interface AdminAutomationLiveSnapshot {
  surface: "automation";
  fetchedAt: string;
  revision: string;
  hasPendingWork: boolean;
  sequenceId: string | null;
  selectedRunId: string | null;
  summary: {
    totalSequences: number;
    activeSequences: number;
    draftSequences: number;
    archivedSequences: number;
    recentRuns: number;
    pendingRuns: number;
    failedRuns: number;
    completedRuns: number;
    recentOutboxEvents: number;
    pendingOutboxEvents: number;
    failedOutboxEvents: number;
    revision: string;
  };
  runs: {
    total: number;
    revision: string;
    items: Record<string, unknown>[];
  };
  outbox: {
    total: number;
    revision: string;
    items: Record<string, unknown>[];
  };
}

export type AdminLiveUpdatesSnapshot =
  | AdminDashboardLiveSnapshot
  | AdminReindexLiveSnapshot
  | AdminObservabilityLiveSnapshot
  | AdminUserInterestsLiveSnapshot
  | AdminAutomationLiveSnapshot;

export interface AdminLiveUpdatesResponse {
  sessionActive: boolean;
  snapshot: AdminLiveUpdatesSnapshot | null;
}

export interface AdminLiveUpdateDelayInput {
  hidden: boolean;
  snapshot: AdminLiveUpdatesSnapshot | null;
  consecutiveFailures: number;
}

export interface AdminLiveUpdatesEventDetail {
  snapshot: AdminLiveUpdatesSnapshot;
  previousSnapshot: AdminLiveUpdatesSnapshot | null;
  hasChanged: boolean;
}

export interface NewsPortalAdminLiveUpdatesStore {
  snapshot: AdminLiveUpdatesSnapshot | null;
  activeSurface: AdminLiveUpdateSurface | null;
  forceRefresh?: () => void;
}

export const ADMIN_LIVE_UPDATES_EVENT = "newsportal:admin-live-updates";
export const ADMIN_LIVE_UPDATES_IDLE_POLL_MS = 15_000;
export const ADMIN_LIVE_UPDATES_FAST_POLL_MS = 3_000;
export const ADMIN_LIVE_UPDATES_MAX_BACKOFF_MS = 60_000;

function normalizeRevisionPart(value: unknown): string {
  if (value == null) {
    return "";
  }
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

export function buildAdminLiveRevision(parts: unknown[]): string {
  return parts.map((part) => normalizeRevisionPart(part)).join("|");
}

export function isAdminLiveSurfaceSnapshot<TSurface extends AdminLiveUpdateSurface>(
  snapshot: AdminLiveUpdatesSnapshot | null | undefined,
  surface: TSurface
): snapshot is Extract<AdminLiveUpdatesSnapshot, { surface: TSurface }> {
  return snapshot?.surface === surface;
}

export function snapshotHasPendingWork(
  snapshot: AdminLiveUpdatesSnapshot | null
): boolean {
  return snapshot?.hasPendingWork === true;
}

export function resolveAdminLiveUpdateDelay(
  input: AdminLiveUpdateDelayInput
): number | null {
  if (input.hidden) {
    return null;
  }

  const baseDelay = snapshotHasPendingWork(input.snapshot)
    ? ADMIN_LIVE_UPDATES_FAST_POLL_MS
    : ADMIN_LIVE_UPDATES_IDLE_POLL_MS;

  if (input.consecutiveFailures <= 0) {
    return baseDelay;
  }

  return Math.min(
    ADMIN_LIVE_UPDATES_MAX_BACKOFF_MS,
    baseDelay * Math.max(2, input.consecutiveFailures + 1)
  );
}

export function serializeAdminLiveUpdatesResponse(
  snapshot: AdminLiveUpdatesSnapshot | null
): AdminLiveUpdatesResponse {
  return {
    sessionActive: snapshot !== null,
    snapshot,
  };
}

declare global {
  interface Window {
    __newsportalAdminLiveUpdates?: NewsPortalAdminLiveUpdatesStore;
  }
}

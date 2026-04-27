import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE } from "@newsportal/contracts";
import { readRuntimeConfig } from "@newsportal/config";
import { createNewsPortalSdk } from "@newsportal/sdk";

import {
  loadAutomationExecutionsData,
  loadAutomationOverviewData,
} from "./automation-workspace";
import {
  buildAdminLiveRevision,
  type AdminAutomationLiveSnapshot,
  type AdminCollectionSignal,
  type AdminDashboardLiveSnapshot,
  type AdminDashboardSummarySnapshot,
  type AdminLlmBudgetSnapshot,
  type AdminLiveUpdateSurface,
  type AdminLiveUpdatesSnapshot,
  type AdminObservabilityLiveSnapshot,
  type AdminObservabilityWindowSnapshot,
  type AdminReindexJobSnapshot,
  type AdminReindexJobsSnapshot,
  type AdminReindexLiveSnapshot,
  type AdminUserInterestStatusSnapshot,
  type AdminUserInterestsLiveSnapshot,
} from "../live-updates";
import { getPool } from "./db";
import { resolveAdminUserInterestCompileState } from "./user-interest-admin-page";
import {
  findAdminUserInterestTarget,
  listAdminUserInterests,
} from "./user-interests";

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function asInt(value: unknown, fallback = 0): number {
  const parsed =
    typeof value === "number" && Number.isFinite(value)
      ? value
      : Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asFloat(value: unknown, fallback = 0): number {
  const parsed =
    typeof value === "number" && Number.isFinite(value)
      ? value
      : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeMaybeText(value: unknown): string | null {
  const normalized = normalizeText(value);
  return normalized ? normalized : null;
}

function createSdk() {
  const runtimeConfig = readRuntimeConfig(process.env, {
    defaultAppBaseUrl: "http://127.0.0.1:4322/",
  });
  return createNewsPortalSdk({
    baseUrl: runtimeConfig.apiBaseUrl,
    fetchImpl: fetch,
  });
}

function buildCollectionSignal(
  total: number,
  latest: JsonRecord | null,
  parts: unknown[]
): AdminCollectionSignal {
  return {
    total,
    revision: buildAdminLiveRevision([
      total,
      latest ? parts.map((part) => latest[part as keyof JsonRecord]) : "none",
    ]),
  };
}

async function readPendingReindexCounts(): Promise<{
  queuedCount: number;
  runningCount: number;
}> {
  const result = await getPool().query<{
    queued_count: number;
    running_count: number;
  }>(
    `
      select
        count(*) filter (where status = 'queued')::int as queued_count,
        count(*) filter (where status = 'running')::int as running_count
      from reindex_jobs
      where status in ('queued', 'running')
    `
  );

  return {
    queuedCount: result.rows[0]?.queued_count ?? 0,
    runningCount: result.rows[0]?.running_count ?? 0,
  };
}

async function loadDashboardSnapshot(): Promise<AdminDashboardLiveSnapshot> {
  const sdk = createSdk();
  const [summaryRaw, fetchRunsPage, pendingCounts] = await Promise.all([
    sdk.getDashboardSummary<JsonRecord>(),
    sdk.listFetchRunsPage<JsonRecord>({ page: 1, pageSize: 1 }),
    readPendingReindexCounts(),
  ]);

  const latestFetchRun = fetchRunsPage.items[0] ?? null;
  const summary: AdminDashboardSummarySnapshot = {
    activeNews: asInt(summaryRaw.active_news, 0),
    processedToday: asInt(summaryRaw.processed_today, 0),
    totalUsers: asInt(summaryRaw.total_users, 0),
    overdueChannels: asInt(summaryRaw.overdue_channels, 0),
    fetchFailures24h: asInt(summaryRaw.fetch_failures_24h, 0),
    llmReviewCount24h: asInt(summaryRaw.llm_review_count_24h, 0),
    newContent24h: asInt(summaryRaw.fetch_new_content_24h, 0),
    attentionChannels: asInt(summaryRaw.attention_channels, 0),
    queuedReindexJobs: pendingCounts.queuedCount,
    runningReindexJobs: pendingCounts.runningCount,
    llmBudgetEnabled: summaryRaw.llm_review_enabled === true,
    llmMonthlyBudgetCents: asInt(summaryRaw.llm_monthly_budget_cents, 0),
    llmMonthToDateCostCents: asInt(summaryRaw.llm_month_to_date_cost_cents, 0),
    llmRemainingMonthlyBudgetCents:
      summaryRaw.llm_remaining_monthly_budget_cents == null
        ? null
        : asInt(summaryRaw.llm_remaining_monthly_budget_cents, 0),
    llmMonthlyQuotaReached: summaryRaw.llm_monthly_quota_reached === true,
    llmAcceptGrayZoneOnBudgetExhaustion:
      summaryRaw.llm_accept_gray_zone_on_budget_exhaustion === true,
    revision: buildAdminLiveRevision([
      summaryRaw.active_news,
      summaryRaw.processed_today,
      summaryRaw.total_users,
      summaryRaw.overdue_channels,
      summaryRaw.fetch_failures_24h,
      summaryRaw.llm_review_count_24h,
      summaryRaw.fetch_new_content_24h,
      summaryRaw.attention_channels,
      pendingCounts.queuedCount,
      pendingCounts.runningCount,
      summaryRaw.llm_review_enabled,
      summaryRaw.llm_monthly_budget_cents,
      summaryRaw.llm_month_to_date_cost_cents,
      summaryRaw.llm_remaining_monthly_budget_cents,
      summaryRaw.llm_monthly_quota_reached,
      summaryRaw.llm_accept_gray_zone_on_budget_exhaustion,
    ]),
  };

  const fetchRuns = buildCollectionSignal(fetchRunsPage.total, latestFetchRun, [
    "channel_id",
    "started_at",
    "outcome_kind",
    "new_article_count",
  ]);

  return {
    surface: "dashboard",
    fetchedAt: new Date().toISOString(),
    revision: buildAdminLiveRevision([summary.revision, fetchRuns.revision]),
    hasPendingWork:
      summary.queuedReindexJobs > 0 || summary.runningReindexJobs > 0,
    summary,
    fetchRuns,
  };
}

function readUsageWindow(
  usageSummary: JsonRecord,
  windowName: "24h" | "7d"
): AdminObservabilityWindowSnapshot {
  const windowRecord = asRecord(usageSummary[windowName]);
  return {
    reviewCount: asInt(windowRecord.review_count, 0),
    totalTokens: asInt(windowRecord.total_tokens, 0),
    costEstimateUsd: asFloat(windowRecord.cost_estimate_usd, 0),
    avgLatencyMs: asFloat(windowRecord.avg_latency_ms, 0),
    revision: buildAdminLiveRevision([
      windowName,
      windowRecord.review_count,
      windowRecord.total_tokens,
      windowRecord.cost_estimate_usd,
      windowRecord.avg_latency_ms,
    ]),
  };
}

function readLlmBudgetSnapshot(summary: JsonRecord): AdminLlmBudgetSnapshot {
  return {
    enabled: summary.enabled === true,
    monthlyBudgetCents: asInt(summary.monthlyBudgetCents, 0),
    monthToDateCostCents: asInt(summary.monthToDateCostCents, 0),
    remainingMonthlyBudgetCents:
      summary.remainingMonthlyBudgetCents == null
        ? null
        : asInt(summary.remainingMonthlyBudgetCents, 0),
    monthlyQuotaReached: summary.monthlyQuotaReached === true,
    acceptGrayZoneOnBudgetExhaustion:
      summary.acceptGrayZoneOnBudgetExhaustion === true,
    revision: buildAdminLiveRevision([
      summary.enabled,
      summary.monthlyBudgetCents,
      summary.monthToDateCostCents,
      summary.remainingMonthlyBudgetCents,
      summary.monthlyQuotaReached,
      summary.acceptGrayZoneOnBudgetExhaustion,
    ]),
  };
}

async function loadObservabilitySnapshot(): Promise<AdminObservabilityLiveSnapshot> {
  const sdk = createSdk();
  const [usageSummary, llmBudgetSummary, fetchRunsPage, llmReviewsPage] = await Promise.all([
    sdk.getLlmUsageSummary<JsonRecord>(),
    sdk.getLlmBudgetSummary<JsonRecord>(),
    sdk.listFetchRunsPage<JsonRecord>({ page: 1, pageSize: 1 }),
    sdk.listLlmReviewsPage<JsonRecord>({ page: 1, pageSize: 1 }),
  ]);

  const usage24h = readUsageWindow(usageSummary, "24h");
  const usage7d = readUsageWindow(usageSummary, "7d");
  const llmBudget = readLlmBudgetSnapshot(llmBudgetSummary);
  const fetchRuns = buildCollectionSignal(fetchRunsPage.total, fetchRunsPage.items[0] ?? null, [
    "channel_id",
    "started_at",
    "outcome_kind",
    "new_article_count",
  ]);
  const llmReviews = buildCollectionSignal(
    llmReviewsPage.total,
    llmReviewsPage.items[0] ?? null,
    ["doc_id", "created_at", "review_decision", "model_name"]
  );

  return {
    surface: "observability",
    fetchedAt: new Date().toISOString(),
    revision: buildAdminLiveRevision([
      usage24h.revision,
      usage7d.revision,
      llmBudget.revision,
      fetchRuns.revision,
      llmReviews.revision,
    ]),
    hasPendingWork: false,
    usage24h,
    usage7d,
    llmBudget,
    fetchRuns,
    llmReviews,
  };
}

function readProgressValues(job: JsonRecord): {
  processedArticles: number | null;
  totalArticles: number | null;
  progressLabel: string | null;
} {
  const options = asRecord(job.options_json);
  const progress = asRecord(options.progress);
  const processedArticles = Number(
    progress.processedArticles ?? progress.processedContentItems ?? NaN
  );
  const totalArticles = Number(
    progress.totalArticles ?? progress.totalContentItems ?? NaN
  );

  if (
    !Number.isFinite(processedArticles) ||
    !Number.isFinite(totalArticles) ||
    totalArticles <= 0
  ) {
    return {
      processedArticles: null,
      totalArticles: null,
      progressLabel: null,
    };
  }

  return {
    processedArticles,
    totalArticles,
    progressLabel: `${processedArticles}/${totalArticles} content items`,
  };
}

function mapReindexJob(job: JsonRecord): AdminReindexJobSnapshot {
  const progress = readProgressValues(job);
  const selectionProfileSummary = normalizeMaybeText(
    job.selection_profile_summary
  );
  const createdAt =
    normalizeMaybeText(job.created_at) ?? normalizeMaybeText(job.requested_at);
  const selectionProfileSnapshotRecord = asRecord(job.selection_profile_snapshot);
  const selectionProfileSnapshot =
    Object.keys(selectionProfileSnapshotRecord).length > 0
      ? {
          activeProfiles: asInt(selectionProfileSnapshotRecord.activeProfiles, 0),
          totalProfiles: asInt(selectionProfileSnapshotRecord.totalProfiles, 0),
          compatibilityProfiles: asInt(
            selectionProfileSnapshotRecord.compatibilityProfiles,
            0
          ),
          templatesWithProfiles: asInt(
            selectionProfileSnapshotRecord.templatesWithProfiles,
            0
          ),
          maxVersion: asInt(selectionProfileSnapshotRecord.maxVersion, 0),
        }
      : null;
  return {
    reindexJobId: normalizeText(job.reindex_job_id),
    indexName: normalizeText(job.index_name) || "—",
    jobKind: normalizeText(job.job_kind) || "rebuild",
    status: normalizeText(job.status) || "pending",
    createdAt,
    createdAtLabel: createdAt,
    processedArticles: progress.processedArticles,
    totalArticles: progress.totalArticles,
    progressLabel: progress.progressLabel,
    selectionProfileSnapshot,
    selectionProfileSummary,
    revision: buildAdminLiveRevision([
      job.reindex_job_id,
      job.status,
      progress.processedArticles,
      progress.totalArticles,
      selectionProfileSnapshot,
      selectionProfileSummary,
      job.updated_at,
      job.created_at,
      job.requested_at,
    ]),
  };
}

async function loadReindexSnapshot(input: {
  page?: number;
  pageSize?: number;
}): Promise<AdminReindexLiveSnapshot> {
  const sdk = createSdk();
  const page = input.page && input.page > 0 ? input.page : DEFAULT_PAGE;
  const pageSize =
    input.pageSize && input.pageSize > 0 ? input.pageSize : DEFAULT_PAGE_SIZE;
  const [jobsPage, pendingCounts] = await Promise.all([
    sdk.listReindexJobsPage<JsonRecord>({ page, pageSize }),
    readPendingReindexCounts(),
  ]);

  const items = jobsPage.items.map(mapReindexJob);
  const jobs: AdminReindexJobsSnapshot = {
    total: jobsPage.total,
    page: jobsPage.page,
    totalPages: jobsPage.totalPages,
    hasPrev: jobsPage.hasPrev,
    hasNext: jobsPage.hasNext,
    queuedCount: pendingCounts.queuedCount,
    runningCount: pendingCounts.runningCount,
    revision: buildAdminLiveRevision([
      jobsPage.total,
      jobsPage.page,
      jobsPage.totalPages,
      pendingCounts.queuedCount,
      pendingCounts.runningCount,
      items.map((item) => item.revision),
    ]),
    items,
  };

  return {
    surface: "reindex",
    fetchedAt: new Date().toISOString(),
    revision: jobs.revision,
    hasPendingWork: jobs.queuedCount > 0 || jobs.runningCount > 0,
    jobs,
  };
}

async function loadUserInterestsSnapshot(input: {
  userId: string;
}): Promise<AdminUserInterestsLiveSnapshot> {
  const userId = normalizeText(input.userId);
  if (!userId) {
    throw new Error("User id is required for user-interest live updates.");
  }

  const pool = getPool();
  const target = await findAdminUserInterestTarget(pool, { userId });
  if (!target) {
    throw new Error("User not found.");
  }

  const interests = await listAdminUserInterests(pool, target.userId);
  const mappedInterests: AdminUserInterestStatusSnapshot[] = interests.map(
    (interest) => {
      const compileState = resolveAdminUserInterestCompileState(interest);
      return {
        interestId: normalizeText(interest.interest_id),
        compileStatus: normalizeText(interest.compile_status) || "pending",
        compileLabel: compileState.label,
        compileTone: compileState.tone,
        compileDetail: compileState.detail,
        errorText: normalizeMaybeText(interest.error_text),
        updatedAt: normalizeMaybeText(interest.updated_at),
        hasCompiledSnapshot: Boolean(interest.compiled_json),
        enabled: interest.enabled !== false,
        version: asInt(interest.version, 1),
      };
    }
  );

  const total = mappedInterests.length;
  const enabledCount = mappedInterests.filter((interest) => interest.enabled).length;
  const compiledCount = mappedInterests.filter(
    (interest) => interest.compileStatus === "compiled"
  ).length;
  const queuedCount = mappedInterests.filter(
    (interest) => interest.compileStatus === "queued"
  ).length;
  const failedCount = mappedInterests.filter(
    (interest) => interest.compileStatus === "failed"
  ).length;
  const countsRevision = buildAdminLiveRevision([
    target.userId,
    total,
    enabledCount,
    compiledCount,
    queuedCount,
    failedCount,
  ]);

  return {
    surface: "user-interests",
    fetchedAt: new Date().toISOString(),
    revision: buildAdminLiveRevision([
      countsRevision,
      mappedInterests.map((interest) => [
        interest.interestId,
        interest.compileStatus,
        interest.compileDetail,
        interest.errorText,
        interest.updatedAt,
        interest.hasCompiledSnapshot,
        interest.enabled,
        interest.version,
      ]),
    ]),
    hasPendingWork: queuedCount > 0,
    targetUserId: target.userId,
    counts: {
      total,
      enabledCount,
      compiledCount,
      queuedCount,
      failedCount,
      revision: countsRevision,
    },
    interests: mappedInterests,
  };
}

async function loadAutomationSnapshot(input: {
  page?: number;
  pageSize?: number;
  sequenceId?: string;
  runId?: string;
}): Promise<AdminAutomationLiveSnapshot> {
  const sequenceId = normalizeMaybeText(input.sequenceId);
  if (sequenceId) {
    const executions = await loadAutomationExecutionsData({
      sequenceId,
      page: input.page ?? 1,
      pageSize: input.pageSize ?? 8,
      runId: input.runId ?? null,
    });
    const summary = {
      totalSequences: 1,
      activeSequences: normalizeText(executions.sequence.status) === "active" ? 1 : 0,
      draftSequences: normalizeText(executions.sequence.status) === "draft" ? 1 : 0,
      archivedSequences: normalizeText(executions.sequence.status) === "archived" ? 1 : 0,
      recentRuns: executions.runsPage.total,
      pendingRuns: executions.runsPage.items.filter((run) => normalizeText(run.status) === "pending").length,
      failedRuns: executions.runsPage.items.filter((run) => normalizeText(run.status) === "failed").length,
      completedRuns: executions.runsPage.items.filter((run) => normalizeText(run.status) === "completed").length,
      recentOutboxEvents: executions.outboxEvents.length,
      pendingOutboxEvents: executions.outboxEvents.filter((event) => normalizeText(event.status) === "pending").length,
      failedOutboxEvents: executions.outboxEvents.filter((event) => normalizeText(event.status) === "failed").length,
      revision: buildAdminLiveRevision([
        executions.sequence.updated_at,
        executions.runsPage.total,
        executions.runsPage.items.map((run) => [run.run_id, run.status, run.error_text, run.finished_at]),
        executions.outboxEvents.map((event) => [event.event_id, event.status, event.created_at]),
      ]),
    };

    return {
      surface: "automation",
      fetchedAt: new Date().toISOString(),
      revision: buildAdminLiveRevision([
        summary.revision,
        sequenceId,
        executions.selectedRunId,
      ]),
      hasPendingWork: summary.pendingRuns > 0 || summary.pendingOutboxEvents > 0,
      sequenceId,
      selectedRunId: executions.selectedRunId || null,
      summary,
      runs: {
        total: executions.runsPage.total,
        revision: buildAdminLiveRevision(
          executions.runsPage.items.map((run) => [run.run_id, run.status, run.finished_at, run.error_text])
        ),
        items: executions.runsPage.items,
      },
      outbox: {
        total: executions.outboxEvents.length,
        revision: buildAdminLiveRevision(
          executions.outboxEvents.map((event) => [event.event_id, event.status, event.created_at])
        ),
        items: executions.outboxEvents,
      },
    };
  }

  const overview = await loadAutomationOverviewData({
    page: input.page ?? 1,
    pageSize: input.pageSize ?? 12,
  });

  return {
    surface: "automation",
    fetchedAt: new Date().toISOString(),
    revision: buildAdminLiveRevision([
      overview.summary.totalSequences,
      overview.summary.pendingRuns,
      overview.summary.failedRuns,
      overview.recentRuns.map((run) => [run.run_id, run.status, run.finished_at, run.error_text]),
      overview.outboxEvents.map((event) => [event.event_id, event.status, event.created_at]),
    ]),
    hasPendingWork: overview.summary.pendingRuns > 0 || overview.summary.pendingOutboxEvents > 0,
    sequenceId: null,
    selectedRunId: null,
    summary: {
      ...overview.summary,
      revision: buildAdminLiveRevision(Object.values(overview.summary)),
    },
    runs: {
      total: overview.recentRuns.length,
      revision: buildAdminLiveRevision(
        overview.recentRuns.map((run) => [run.run_id, run.status, run.finished_at, run.error_text])
      ),
      items: overview.recentRuns,
    },
    outbox: {
      total: overview.outboxEvents.length,
      revision: buildAdminLiveRevision(
        overview.outboxEvents.map((event) => [event.event_id, event.status, event.created_at])
      ),
      items: overview.outboxEvents,
    },
  };
}

export async function loadAdminLiveUpdatesSnapshot(input: {
  surface: AdminLiveUpdateSurface;
  page?: number;
  pageSize?: number;
  userId?: string;
  sequenceId?: string;
  runId?: string;
}): Promise<AdminLiveUpdatesSnapshot> {
  if (input.surface === "dashboard") {
    return loadDashboardSnapshot();
  }
  if (input.surface === "reindex") {
    return loadReindexSnapshot({
      page: input.page,
      pageSize: input.pageSize,
    });
  }
  if (input.surface === "observability") {
    return loadObservabilitySnapshot();
  }
  if (input.surface === "automation") {
    return loadAutomationSnapshot({
      page: input.page,
      pageSize: input.pageSize,
      sequenceId: input.sequenceId,
      runId: input.runId,
    });
  }
  return loadUserInterestsSnapshot({
    userId: input.userId ?? "",
  });
}

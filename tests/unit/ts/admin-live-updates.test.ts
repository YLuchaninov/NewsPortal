import assert from "node:assert/strict";
import test from "node:test";

import {
  ADMIN_LIVE_UPDATES_FAST_POLL_MS,
  ADMIN_LIVE_UPDATES_IDLE_POLL_MS,
  buildAdminLiveRevision,
  isAdminLiveSurfaceSnapshot,
  resolveAdminLiveUpdateDelay,
  serializeAdminLiveUpdatesResponse,
  type AdminDashboardLiveSnapshot,
  type AdminReindexLiveSnapshot,
} from "../../../apps/admin/src/lib/live-updates.ts";

function createDashboardSnapshot(): AdminDashboardLiveSnapshot {
  return {
    surface: "dashboard",
    fetchedAt: "2026-03-27T12:00:00Z",
    revision: "dashboard-v1",
    hasPendingWork: false,
    summary: {
      activeNews: 10,
      processedToday: 4,
      totalUsers: 7,
      overdueChannels: 1,
      fetchFailures24h: 0,
      llmReviewCount24h: 3,
      newContent24h: 2,
      attentionChannels: 1,
      queuedReindexJobs: 0,
      runningReindexJobs: 0,
      llmBudgetEnabled: true,
      llmMonthlyBudgetCents: 500,
      llmMonthToDateCostCents: 120,
      llmRemainingMonthlyBudgetCents: 380,
      llmMonthlyQuotaReached: false,
      llmAcceptGrayZoneOnBudgetExhaustion: false,
      revision: "summary-v1",
    },
    fetchRuns: {
      total: 8,
      revision: "fetch-runs-v1",
    },
  };
}

function createReindexSnapshot(): AdminReindexLiveSnapshot {
  return {
    surface: "reindex",
    fetchedAt: "2026-03-27T12:00:00Z",
    revision: "reindex-v1",
    hasPendingWork: true,
    jobs: {
      total: 2,
      page: 1,
      totalPages: 1,
      hasPrev: false,
      hasNext: false,
      queuedCount: 1,
      runningCount: 1,
      revision: "jobs-v1",
      items: [
        {
          reindexJobId: "job-1",
          indexName: "interest_centroids",
          jobKind: "backfill",
          status: "running",
          createdAt: "2026-03-27T11:59:00Z",
          processedArticles: 10,
          totalArticles: 42,
          progressLabel: "10/42 articles",
          revision: "job-1-v1",
        },
      ],
    },
  };
}

test("buildAdminLiveRevision keeps ordered revision parts", () => {
  assert.equal(
    buildAdminLiveRevision(["dashboard", 10, "2026-03-27T12:00:00Z"]),
    "dashboard|10|2026-03-27T12:00:00Z"
  );
});

test("resolveAdminLiveUpdateDelay switches between idle, fast, hidden, and backoff polling", () => {
  const idleSnapshot = createDashboardSnapshot();
  const busySnapshot = createReindexSnapshot();

  assert.equal(
    resolveAdminLiveUpdateDelay({
      hidden: false,
      snapshot: idleSnapshot,
      consecutiveFailures: 0,
    }),
    ADMIN_LIVE_UPDATES_IDLE_POLL_MS
  );

  assert.equal(
    resolveAdminLiveUpdateDelay({
      hidden: false,
      snapshot: busySnapshot,
      consecutiveFailures: 0,
    }),
    ADMIN_LIVE_UPDATES_FAST_POLL_MS
  );

  assert.equal(
    resolveAdminLiveUpdateDelay({
      hidden: true,
      snapshot: busySnapshot,
      consecutiveFailures: 0,
    }),
    null
  );

  assert.equal(
    resolveAdminLiveUpdateDelay({
      hidden: false,
      snapshot: busySnapshot,
      consecutiveFailures: 2,
    }),
    ADMIN_LIVE_UPDATES_FAST_POLL_MS * 3
  );
});

test("surface guard narrows admin snapshots to the expected page payload", () => {
  const dashboardSnapshot = createDashboardSnapshot();
  const reindexSnapshot = createReindexSnapshot();

  assert.equal(isAdminLiveSurfaceSnapshot(dashboardSnapshot, "dashboard"), true);
  assert.equal(isAdminLiveSurfaceSnapshot(dashboardSnapshot, "reindex"), false);
  assert.equal(isAdminLiveSurfaceSnapshot(reindexSnapshot, "reindex"), true);
});

test("serializeAdminLiveUpdatesResponse preserves session and no-session shapes", () => {
  const snapshot = createDashboardSnapshot();

  assert.deepEqual(serializeAdminLiveUpdatesResponse(null), {
    sessionActive: false,
    snapshot: null,
  });

  assert.deepEqual(serializeAdminLiveUpdatesResponse(snapshot), {
    sessionActive: true,
    snapshot,
  });
});

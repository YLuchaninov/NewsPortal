import assert from "node:assert/strict";
import test from "node:test";

import type { AdminReindexJobSnapshot } from "../../../apps/admin/src/lib/live-updates.ts";

function createJob(): AdminReindexJobSnapshot {
  return {
    reindexJobId: "job-1",
    indexName: "interest_centroids",
    jobKind: "backfill",
    status: "completed",
    createdAt: "2026-04-10T12:00:00Z",
    createdAtLabel: "2026-04-10T12:00:00Z",
    processedArticles: 24,
    totalArticles: 24,
    progressLabel: "24/24 content items",
    selectionProfileSnapshot: {
      activeProfiles: 3,
      totalProfiles: 4,
      compatibilityProfiles: 3,
      templatesWithProfiles: 3,
      maxVersion: 7,
    },
    selectionProfileSummary: "3/4 active | 3 compatibility | 3 template-bound | max v7",
    revision: "job-1-v1",
  };
}

test("reindex live snapshot contract carries structured selection-profile replay provenance", () => {
  const job = createJob();

  assert.equal(job.selectionProfileSnapshot?.activeProfiles, 3);
  assert.equal(job.selectionProfileSnapshot?.totalProfiles, 4);
  assert.equal(job.selectionProfileSnapshot?.compatibilityProfiles, 3);
  assert.equal(job.selectionProfileSnapshot?.templatesWithProfiles, 3);
  assert.equal(job.selectionProfileSnapshot?.maxVersion, 7);
  assert.equal(
    job.selectionProfileSummary,
    "3/4 active | 3 compatibility | 3 template-bound | max v7"
  );
  assert.equal(job.createdAtLabel, "2026-04-10T12:00:00Z");
});

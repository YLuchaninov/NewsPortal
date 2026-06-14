import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

import { LiveReindexJobsSection } from "../../../runtime/node/apps/admin/src/components/LiveReindexJobsSection.tsx";
import type { AdminReindexJobSnapshot } from "../../../runtime/node/apps/admin/src/lib/live-updates.ts";

type CreateElement = (
  type: unknown,
  props?: Record<string, unknown> | null,
  ...children: unknown[]
) => unknown;

const requireFromAdmin = createRequire(
  new URL("../../../runtime/node/apps/admin/package.json", import.meta.url)
);
const React = requireFromAdmin("react") as { createElement: CreateElement };
const { renderToStaticMarkup } = requireFromAdmin("react-dom/server") as {
  renderToStaticMarkup(element: unknown): string;
};
(globalThis as { React?: unknown }).React = React;

function createJob(): AdminReindexJobSnapshot {
  return {
    reindexJobId: "job-1",
    indexName: "interest_centroids",
    jobKind: "backfill",
    status: "completed",
    cancellable: false,
    createdAt: "2026-04-10T12:00:00Z",
    createdAtLabel: "2026-04-10T12:00:00Z",
    processedSignalCandidates: 24,
    totalSignalCandidates: 24,
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

test("reindex jobs section renders Cancel only for queued and running jobs", () => {
  const queuedJob = {
    ...createJob(),
    reindexJobId: "job-queued",
    status: "queued",
    cancellable: true,
  };
  const runningJob = {
    ...createJob(),
    reindexJobId: "job-running",
    status: "running",
    cancellable: true,
  };
  const cancellingJob = {
    ...createJob(),
    reindexJobId: "job-cancelling",
    status: "cancel_requested",
    cancellable: false,
  };
  const completedJob = {
    ...createJob(),
    reindexJobId: "job-completed",
    status: "completed",
    cancellable: false,
  };

  const markup = renderToStaticMarkup(
    React.createElement(LiveReindexJobsSection, {
      initialJobs: {
        total: 4,
        page: 1,
        totalPages: 1,
        hasPrev: false,
        hasNext: false,
        queuedCount: 1,
        runningCount: 1,
        cancellingCount: 1,
        revision: "jobs-v1",
        items: [queuedJob, runningJob, cancellingJob, completedJob],
      },
      currentPage: 1,
      currentPath: "/reindex",
      cancelAction: "/bff/admin/reindex",
      adminActionToken: "token-1",
    })
  );

  const cancelButtons = markup.match(/>\s*Cancel\s*<\/button>/g) ?? [];
  assert.equal(cancelButtons.length, 2);
  assert.match(markup, />cancelling<\/span>/);
  assert.match(markup, />1 cancelling<\/span>/);
});

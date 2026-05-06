import assert from "node:assert/strict";
import test from "node:test";

import {
  buildReindexCancellationKey,
  cancelReindexJob,
  queueReindexJobWithSupersession,
} from "../../../packages/control-plane/src/reindex.ts";

class FakePgClient {
  calls: Array<{ sql: string; params: unknown[] }> = [];
  rows: Array<Record<string, unknown>[]> = [];
  rowCounts: number[] = [];

  constructor(input?: {
    rows?: Array<Record<string, unknown>[]>;
    rowCounts?: number[];
  }) {
    this.rows = input?.rows ?? [];
    this.rowCounts = input?.rowCounts ?? [];
  }

  async query(sql: string, params: unknown[] = []) {
    this.calls.push({ sql, params });
    return {
      rows: this.rows.shift() ?? [],
      rowCount: this.rowCounts.shift() ?? 0,
    };
  }
}

test("reindex cancellation key ignores runtime result fields and batch size", () => {
  const first = buildReindexCancellationKey({
    indexName: "interest_centroids",
    jobKind: "backfill",
    optionsJson: {
      batchSize: 25,
      progress: { processedArticles: 10 },
      docIds: ["b", "a"],
      includeEnrichment: false,
    },
  });
  const second = buildReindexCancellationKey({
    indexName: "interest_centroids",
    jobKind: "backfill",
    optionsJson: {
      batchSize: 500,
      backfill: { processedArticles: 99 },
      docIds: ["a", "b"],
      includeEnrichment: false,
    },
  });

  assert.equal(first, second);
});

test("queueReindexJobWithSupersession cancels queued and requests running same-lane jobs", async () => {
  const client = new FakePgClient({ rowCounts: [0, 0, 2, 1, 0] });
  const result = await queueReindexJobWithSupersession(client as never, {
    reindexJobId: "job-new",
    eventId: "event-new",
    indexName: "interest_centroids",
    jobKind: "backfill",
    optionsJson: { batchSize: 100, includeEnrichment: false },
    requestedByUserId: "user-1",
  });

  assert.equal(result.reindexJobId, "job-new");
  assert.equal(result.eventId, "event-new");
  assert.equal(result.cancelledQueuedCount, 2);
  assert.equal(result.cancellationRequestedCount, 1);
  assert.match(client.calls[0]?.sql ?? "", /pg_advisory_xact_lock/);
  assert.match(client.calls[1]?.sql ?? "", /insert into public\.reindex_jobs/i);
  assert.match(client.calls[2]?.sql ?? "", /status = 'cancelled'/);
  assert.match(client.calls[3]?.sql ?? "", /status = 'cancel_requested'/);
  assert.match(client.calls[4]?.sql ?? "", /insert into public\.outbox_events/i);
});

test("cancelReindexJob transitions queued and running jobs", async () => {
  const queuedClient = new FakePgClient({ rows: [[{ status: "queued" }]], rowCounts: [0, 1] });
  const queued = await cancelReindexJob(queuedClient as never, {
    reindexJobId: "job-queued",
  });
  assert.deepEqual(queued, {
    reindexJobId: "job-queued",
    previousStatus: "queued",
    status: "cancelled",
    changed: true,
    terminal: true,
  });
  assert.match(queuedClient.calls[1]?.sql ?? "", /status = 'cancelled'/);

  const runningClient = new FakePgClient({ rows: [[{ status: "running" }]], rowCounts: [0, 1] });
  const running = await cancelReindexJob(runningClient as never, {
    reindexJobId: "job-running",
  });
  assert.equal(running.status, "cancel_requested");
  assert.equal(running.terminal, false);
  assert.match(runningClient.calls[1]?.sql ?? "", /status = 'cancel_requested'/);

  const cancellingClient = new FakePgClient({ rows: [[{ status: "cancel_requested" }]] });
  const cancelling = await cancelReindexJob(cancellingClient as never, {
    reindexJobId: "job-cancelling",
  });
  assert.deepEqual(cancelling, {
    reindexJobId: "job-cancelling",
    previousStatus: "cancel_requested",
    status: "cancel_requested",
    changed: false,
    terminal: false,
  });
  assert.equal(cancellingClient.calls.length, 1);
});

test("cancelReindexJob leaves terminal jobs unchanged", async () => {
  const client = new FakePgClient({ rows: [[{ status: "completed" }]] });
  const result = await cancelReindexJob(client as never, {
    reindexJobId: "job-done",
  });

  assert.deepEqual(result, {
    reindexJobId: "job-done",
    previousStatus: "completed",
    status: "completed",
    changed: false,
    terminal: true,
  });
  assert.equal(client.calls.length, 1);
});

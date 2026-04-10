import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSequenceCancelApiPayload,
  buildSequenceCreateApiPayload,
  buildSequenceManualRunApiPayload,
  buildSequenceUpdateApiPayload,
  isSequenceRunCancellable,
  resolveSequenceAdminIntent,
  resolveSequenceOperatorSummary,
} from "../../../apps/admin/src/lib/server/automation.ts";

test("buildSequenceCreateApiPayload normalizes create fields for the maintenance API", () => {
  const payload = buildSequenceCreateApiPayload(
    {
      title: "  Sequence 1  ",
      description: "  Manual admin sequence  ",
      status: "active",
      triggerEvent: " article.ingest.requested ",
      cron: " */15 * * * * ",
      maxRuns: "3",
      tags: "ops, admin\nmanual",
      createdBy: "",
      taskGraph: JSON.stringify([
        {
          key: "normalize",
          module: "article.normalize",
          options: {},
        },
      ]),
    },
    "admin-user-1"
  );

  assert.deepEqual(payload, {
    title: "Sequence 1",
    description: "Manual admin sequence",
    taskGraph: [
      {
        key: "normalize",
        module: "article.normalize",
        options: {},
      },
    ],
    status: "active",
    triggerEvent: "article.ingest.requested",
    cron: "*/15 * * * *",
    maxRuns: 3,
    tags: ["ops", "admin", "manual"],
    createdBy: "admin-user-1",
  });
});

test("buildSequenceUpdateApiPayload keeps nullable maintenance fields explicit", () => {
  const payload = buildSequenceUpdateApiPayload({
    title: "Sequence 1 updated",
    description: "",
    status: "draft",
    triggerEvent: "",
    cron: "",
    maxRuns: "",
    tags: "",
    createdBy: "",
    taskGraph: JSON.stringify([
      {
        key: "notify",
        module: "article.notify",
        options: {},
      },
    ]),
  });

  assert.deepEqual(payload, {
    title: "Sequence 1 updated",
    description: null,
    taskGraph: [
      {
        key: "notify",
        module: "article.notify",
        options: {},
      },
    ],
    status: "draft",
    triggerEvent: null,
    cron: null,
    maxRuns: null,
    tags: [],
    createdBy: null,
  });
});

test("buildSequenceManualRunApiPayload parses context and trigger meta JSON objects", () => {
  const payload = buildSequenceManualRunApiPayload(
    {
      contextJson: '{"doc_id":"doc-1","manual":true}',
      triggerMeta: '{"sourceEventId":"event-1"}',
    },
    "admin-user-1"
  );

  assert.deepEqual(payload, {
    contextJson: {
      doc_id: "doc-1",
      manual: true,
    },
    triggerMeta: {
      sourceEventId: "event-1",
      requestedFrom: "admin",
    },
    requestedBy: "admin-user-1",
  });
});

test("buildSequenceCancelApiPayload keeps blank cancel reasons nullable", () => {
  assert.deepEqual(buildSequenceCancelApiPayload({ reason: "  " }), { reason: null });
  assert.deepEqual(buildSequenceCancelApiPayload({ reason: "Operator requested stop." }), {
    reason: "Operator requested stop.",
  });
});

test("sequence admin helpers expose intent routing and recent-state summaries", () => {
  assert.equal(resolveSequenceAdminIntent({ intent: "run_sequence" }), "run_sequence");
  assert.equal(resolveSequenceAdminIntent({ intent: "unknown" }), "create_sequence");
  assert.equal(isSequenceRunCancellable("pending"), true);
  assert.equal(isSequenceRunCancellable("completed"), false);

  const summary = resolveSequenceOperatorSummary({
    sequences: [
      { status: "active" },
      { status: "draft" },
      { status: "archived" },
    ],
    runs: [
      { status: "pending" },
      { status: "completed" },
      { status: "failed" },
    ],
    outboxEvents: [
      { status: "pending" },
      { status: "published" },
      { status: "failed" },
    ],
  });

  assert.deepEqual(summary, {
    totalSequences: 3,
    activeSequences: 1,
    draftSequences: 1,
    archivedSequences: 1,
    recentRuns: 3,
    pendingRuns: 1,
    failedRuns: 1,
    completedRuns: 1,
    recentOutboxEvents: 3,
    pendingOutboxEvents: 1,
    failedOutboxEvents: 1,
  });
});

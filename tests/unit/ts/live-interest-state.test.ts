import assert from "node:assert/strict";
import test from "node:test";

import {
  buildInterestPageState,
  replaceLiveInterestRecords,
  resolveInterestRepairState,
} from "../../../apps/web/src/lib/live-interest-state.ts";

test("replaceLiveInterestRecords reflects queued to compiled and queued to failed transitions", () => {
  const previous = [
    {
      interest_id: "interest-1",
      compile_status: "queued",
      updated_at: "2026-03-26T10:00:00Z",
    },
  ];

  const compiled = replaceLiveInterestRecords(previous, [
    {
      interest_id: "interest-1",
      compile_status: "compiled",
      updated_at: "2026-03-26T10:05:00Z",
    },
  ]);
  assert.equal(compiled[0]?.compile_status, "compiled");

  const failed = replaceLiveInterestRecords(previous, [
    {
      interest_id: "interest-1",
      compile_status: "failed",
      updated_at: "2026-03-26T10:06:00Z",
    },
  ]);
  assert.equal(failed[0]?.compile_status, "failed");
});

test("buildInterestPageState keeps page slices coherent after create and delete mutations", () => {
  const baseRecords = [
    { interest_id: "interest-7" },
    { interest_id: "interest-6" },
    { interest_id: "interest-5" },
    { interest_id: "interest-4" },
    { interest_id: "interest-3" },
    { interest_id: "interest-2" },
    { interest_id: "interest-1" },
  ];

  const thirdPage = buildInterestPageState(baseRecords, 3, 3);
  assert.equal(thirdPage.page, 3);
  assert.deepEqual(thirdPage.items.map((item) => item.interest_id), ["interest-1"]);

  const afterDelete = buildInterestPageState(baseRecords.slice(0, 6), 3, 3);
  assert.equal(afterDelete.page, 2);
  assert.deepEqual(
    afterDelete.items.map((item) => item.interest_id),
    ["interest-4", "interest-3", "interest-2"]
  );

  const afterCreate = buildInterestPageState(
    [{ interest_id: "interest-8" }, ...baseRecords],
    3,
    3
  );
  assert.equal(afterCreate.page, 3);
  assert.deepEqual(
    afterCreate.items.map((item) => item.interest_id),
    ["interest-2", "interest-1"]
  );
});

test("resolveInterestRepairState parses running progress and failed repair jobs", () => {
  assert.deepEqual(
    resolveInterestRepairState("interest-1", [
      {
        reindexJobId: "job-1",
        status: "running",
        interestId: "interest-1",
        processedArticles: 12,
        totalArticles: 30,
        finishedAt: null,
        errorText: null,
      },
    ]),
    {
      tone: "warning",
      label: "Syncing matches",
      detail: "12/30 historical articles",
    }
  );

  assert.deepEqual(
    resolveInterestRepairState("interest-1", [
      {
        reindexJobId: "job-1",
        status: "failed",
        interestId: "interest-1",
        processedArticles: null,
        totalArticles: null,
        finishedAt: null,
        errorText: "queue timeout",
      },
    ]),
    {
      tone: "error",
      label: "Match sync failed",
      detail: "queue timeout",
    }
  );

  assert.equal(resolveInterestRepairState("missing", []), null);
});

import assert from "node:assert/strict";
import test from "node:test";

import { runWithConcurrency } from "../../../services/fetchers/src/scheduler.ts";

test("runWithConcurrency keeps item order and respects the concurrency ceiling", async () => {
  let inFlight = 0;
  let maxInFlight = 0;

  const results = await runWithConcurrency([1, 2, 3, 4, 5], 2, async (item) => {
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((resolve) => setTimeout(resolve, item % 2 === 0 ? 5 : 10));
    inFlight -= 1;
    return item * 10;
  });

  assert.equal(maxInFlight, 2);
  assert.deepEqual(
    results.map((result) =>
      result.status === "fulfilled" ? result.value : String(result.reason)
    ),
    [10, 20, 30, 40, 50]
  );
});

test("runWithConcurrency captures rejections without aborting later tasks", async () => {
  const visited: number[] = [];

  const results = await runWithConcurrency([1, 2, 3], 3, async (item) => {
    visited.push(item);
    if (item === 2) {
      throw new Error("channel failed");
    }
    return `ok-${item}`;
  });

  assert.deepEqual(visited.sort((left, right) => left - right), [1, 2, 3]);
  assert.equal(results[0]?.status, "fulfilled");
  assert.equal(results[1]?.status, "rejected");
  assert.equal(results[2]?.status, "fulfilled");
  assert.equal(
    results[1]?.status === "rejected" ? (results[1].reason as Error).message : "",
    "channel failed"
  );
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  computeAdaptiveTransition,
  resolveRuntimeState
} from "../../../services/fetchers/src/adaptive-scheduling.ts";

test("resolveRuntimeState applies base interval defaults and caps", () => {
  const state = resolveRuntimeState(300, null);

  assert.equal(state.adaptiveEnabled, true);
  assert.equal(state.effectivePollIntervalSeconds, 300);
  assert.equal(state.maxPollIntervalSeconds, 4800);
  assert.equal(state.adaptiveStep, 0);
  assert.equal(state.consecutiveNoChangePolls, 0);
  assert.equal(state.consecutiveFailures, 0);
});

test("computeAdaptiveTransition escalates no-change polls on the configured ladder", () => {
  const first = computeAdaptiveTransition({
    basePollIntervalSeconds: 300,
    fetchedAt: "2026-03-23T10:00:00.000Z",
    outcome: "no_change"
  });
  const second = computeAdaptiveTransition({
    basePollIntervalSeconds: 300,
    fetchedAt: "2026-03-23T10:10:00.000Z",
    outcome: "no_change",
    state: first
  });

  assert.equal(first.effectivePollIntervalSeconds, 600);
  assert.equal(first.adaptiveStep, 1);
  assert.equal(first.consecutiveNoChangePolls, 1);
  assert.equal(first.nextDueAt, "2026-03-23T10:10:00.000Z");
  assert.equal(second.effectivePollIntervalSeconds, 1200);
  assert.equal(second.adaptiveStep, 2);
  assert.equal(second.consecutiveNoChangePolls, 2);
  assert.equal(second.nextDueAt, "2026-03-23T10:30:00.000Z");
});

test("computeAdaptiveTransition resets to base interval after new content", () => {
  const slowed = computeAdaptiveTransition({
    basePollIntervalSeconds: 900,
    fetchedAt: "2026-03-23T10:00:00.000Z",
    outcome: "no_change",
    state: {
      adaptiveStep: 2,
      effectivePollIntervalSeconds: 3600,
      maxPollIntervalSeconds: 14400,
      consecutiveNoChangePolls: 3
    }
  });
  const reset = computeAdaptiveTransition({
    basePollIntervalSeconds: 900,
    fetchedAt: "2026-03-23T10:15:00.000Z",
    outcome: "new_content",
    state: slowed
  });

  assert.equal(reset.effectivePollIntervalSeconds, 900);
  assert.equal(reset.adaptiveStep, 0);
  assert.equal(reset.consecutiveNoChangePolls, 0);
  assert.equal(reset.consecutiveFailures, 0);
  assert.equal(reset.nextDueAt, "2026-03-23T10:30:00.000Z");
  assert.equal(reset.adaptiveReason, "reset_on_new_content");
});

test("computeAdaptiveTransition keeps failure backoff separate from freshness adaptation", () => {
  const state = computeAdaptiveTransition({
    basePollIntervalSeconds: 300,
    fetchedAt: "2026-03-23T10:00:00.000Z",
    outcome: "no_change"
  });
  const rateLimited = computeAdaptiveTransition({
    basePollIntervalSeconds: 300,
    fetchedAt: "2026-03-23T10:05:00.000Z",
    outcome: "rate_limited",
    retryAfterSeconds: 1800,
    state
  });
  const hardFailure = computeAdaptiveTransition({
    basePollIntervalSeconds: 300,
    fetchedAt: "2026-03-23T10:35:00.000Z",
    outcome: "hard_failure",
    state: rateLimited
  });

  assert.equal(rateLimited.effectivePollIntervalSeconds, 600);
  assert.equal(rateLimited.adaptiveStep, 1);
  assert.equal(rateLimited.consecutiveNoChangePolls, 1);
  assert.equal(rateLimited.consecutiveFailures, 1);
  assert.equal(rateLimited.nextDueAt, "2026-03-23T10:35:00.000Z");
  assert.equal(rateLimited.adaptiveReason, "rate_limited_backoff");
  assert.equal(hardFailure.effectivePollIntervalSeconds, 600);
  assert.equal(hardFailure.consecutiveFailures, 2);
  assert.equal(hardFailure.nextDueAt, "2026-03-23T10:45:00.000Z");
  assert.equal(hardFailure.adaptiveReason, "hard_failure_needs_attention");
});

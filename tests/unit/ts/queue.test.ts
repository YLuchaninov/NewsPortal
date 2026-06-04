import assert from "node:assert/strict";
import test from "node:test";

import {
  SIGNAL_CANDIDATE_CRITERIA_MATCHED_EVENT,
  SIGNAL_CANDIDATE_CLUSTERED_EVENT,
  SIGNAL_CANDIDATE_EMBEDDED_EVENT,
  SIGNAL_CANDIDATE_INGEST_REQUESTED_EVENT,
  SIGNAL_CANDIDATE_INTERESTS_MATCHED_EVENT,
  SIGNAL_CANDIDATE_NORMALIZED_EVENT,
  CRITERION_COMPILE_REQUESTED_EVENT,
  FETCH_QUEUE,
  FOUNDATION_SMOKE_EVENT,
  FOUNDATION_SMOKE_QUEUE,
  INTEREST_COMPILE_REQUESTED_EVENT,
  LLM_REVIEW_REQUESTED_EVENT,
  NOTIFICATION_FEEDBACK_RECORDED_EVENT,
  OUTBOX_EVENT_QUEUE_MAP,
  REINDEX_QUEUE,
  REINDEX_REQUESTED_EVENT,
  RESOURCE_INGEST_REQUESTED_EVENT,
  SEQUENCE_QUEUE,
  SEQUENCE_MANAGED_OUTBOX_EVENTS,
  SEQUENCE_RUN_STATUSES,
  SEQUENCE_STATUSES,
  SEQUENCE_TASK_RUN_STATUSES,
  SEQUENCE_TRIGGER_TYPES,
  isSignalCandidateOutboxEvent,
  isCriterionCompileOutboxEvent,
  isInterestCompileOutboxEvent,
  isLlmReviewOutboxEvent,
  isNotificationFeedbackOutboxEvent,
  isResourceOutboxEvent,
  isSequenceManagedOutboxEvent,
  isReindexOutboxEvent,
  buildOutboxEventQueueMap
} from "../../../packages/contracts/src/queue.ts";

test("default outbox queue map keeps only non-sequence relay fanout", () => {
  const queueMap = buildOutboxEventQueueMap();

  assert.deepEqual(queueMap[FOUNDATION_SMOKE_EVENT], [FOUNDATION_SMOKE_QUEUE]);
  assert.deepEqual(queueMap["source.channel.sync.requested"], [FETCH_QUEUE]);
  assert.equal(queueMap[SIGNAL_CANDIDATE_INGEST_REQUESTED_EVENT], undefined);
  assert.deepEqual(queueMap, OUTBOX_EVENT_QUEUE_MAP);
});

test("legacy embed fanout option is a no-op after sequence-first cutover", () => {
  const queueMap = buildOutboxEventQueueMap({ enableEmbedFanout: true });

  assert.deepEqual(queueMap, OUTBOX_EVENT_QUEUE_MAP);
});

test("sequence-managed events are explicit after relay cutover", () => {
  assert.deepEqual(SEQUENCE_MANAGED_OUTBOX_EVENTS, [
    SIGNAL_CANDIDATE_INGEST_REQUESTED_EVENT,
    RESOURCE_INGEST_REQUESTED_EVENT,
    INTEREST_COMPILE_REQUESTED_EVENT,
    CRITERION_COMPILE_REQUESTED_EVENT,
    LLM_REVIEW_REQUESTED_EVENT,
    NOTIFICATION_FEEDBACK_RECORDED_EVENT,
    REINDEX_REQUESTED_EVENT
  ]);
  assert.equal(isSequenceManagedOutboxEvent(SIGNAL_CANDIDATE_INGEST_REQUESTED_EVENT), true);
  assert.equal(isSequenceManagedOutboxEvent("source.channel.sync.requested"), false);
});

test("event classifiers distinguish signal_candidate, compile, review, feedback and reindex events", () => {
  assert.equal(isSignalCandidateOutboxEvent(SIGNAL_CANDIDATE_INGEST_REQUESTED_EVENT), true);
  assert.equal(isSignalCandidateOutboxEvent(SIGNAL_CANDIDATE_CRITERIA_MATCHED_EVENT), true);
  assert.equal(isSignalCandidateOutboxEvent(INTEREST_COMPILE_REQUESTED_EVENT), false);
  assert.equal(isResourceOutboxEvent(RESOURCE_INGEST_REQUESTED_EVENT), true);
  assert.equal(isResourceOutboxEvent(SIGNAL_CANDIDATE_INGEST_REQUESTED_EVENT), false);

  assert.equal(isInterestCompileOutboxEvent(INTEREST_COMPILE_REQUESTED_EVENT), true);
  assert.equal(isCriterionCompileOutboxEvent(CRITERION_COMPILE_REQUESTED_EVENT), true);
  assert.equal(isLlmReviewOutboxEvent(LLM_REVIEW_REQUESTED_EVENT), true);
  assert.equal(
    isNotificationFeedbackOutboxEvent(NOTIFICATION_FEEDBACK_RECORDED_EVENT),
    true
  );
  assert.equal(isReindexOutboxEvent(REINDEX_REQUESTED_EVENT), true);
  assert.equal(isReindexOutboxEvent("unknown.event"), false);
});

test("sequence engine cutover contracts keep q.sequence outside fallback fanout", () => {
  const mappedQueues = Object.values(OUTBOX_EVENT_QUEUE_MAP).flatMap((queueNames) => queueNames);

  assert.equal(SEQUENCE_QUEUE, "q.sequence");
  assert.equal(mappedQueues.includes(SEQUENCE_QUEUE), false);
  assert.equal(mappedQueues.includes(REINDEX_QUEUE), false);
  assert.deepEqual(SEQUENCE_STATUSES, ["draft", "active", "archived"]);
  assert.deepEqual(SEQUENCE_RUN_STATUSES, [
    "pending",
    "running",
    "completed",
    "failed",
    "cancelled"
  ]);
  assert.deepEqual(SEQUENCE_TASK_RUN_STATUSES, [
    "pending",
    "running",
    "completed",
    "failed",
    "skipped"
  ]);
  assert.deepEqual(SEQUENCE_TRIGGER_TYPES, ["manual", "cron", "agent", "api", "event"]);
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  ARTICLE_CRITERIA_MATCHED_EVENT,
  ARTICLE_CLUSTERED_EVENT,
  ARTICLE_EMBEDDED_EVENT,
  ARTICLE_INGEST_REQUESTED_EVENT,
  ARTICLE_INTERESTS_MATCHED_EVENT,
  ARTICLE_NORMALIZED_EVENT,
  CLUSTER_QUEUE,
  CRITERION_COMPILE_REQUESTED_EVENT,
  CRITERIA_MATCH_QUEUE,
  DEDUP_QUEUE,
  EMBED_QUEUE,
  FEEDBACK_INGEST_QUEUE,
  INTEREST_MATCH_QUEUE,
  INTEREST_COMPILE_REQUESTED_EVENT,
  LLM_REVIEW_QUEUE,
  LLM_REVIEW_REQUESTED_EVENT,
  NOTIFICATION_FEEDBACK_RECORDED_EVENT,
  NOTIFY_QUEUE,
  OUTBOX_EVENT_QUEUE_MAP,
  REINDEX_QUEUE,
  REINDEX_REQUESTED_EVENT,
  isArticleOutboxEvent,
  isCriterionCompileOutboxEvent,
  isInterestCompileOutboxEvent,
  isLlmReviewOutboxEvent,
  isNotificationFeedbackOutboxEvent,
  isReindexOutboxEvent,
  buildOutboxEventQueueMap
} from "../../../packages/contracts/src/queue.ts";

test("default outbox queue map keeps normalized articles on dedup only", () => {
  const queueMap = buildOutboxEventQueueMap();

  assert.deepEqual(queueMap[ARTICLE_NORMALIZED_EVENT], [DEDUP_QUEUE]);
  assert.deepEqual(queueMap, OUTBOX_EVENT_QUEUE_MAP);
});

test("embed fanout adds embed queue for normalized articles", () => {
  const queueMap = buildOutboxEventQueueMap({ enableEmbedFanout: true });

  assert.deepEqual(queueMap[ARTICLE_NORMALIZED_EVENT], [DEDUP_QUEUE, EMBED_QUEUE]);
});

test("embedded articles route to criteria, criteria-matched articles route to cluster, and clustered articles route to interests", () => {
  assert.deepEqual(OUTBOX_EVENT_QUEUE_MAP[ARTICLE_EMBEDDED_EVENT], [CRITERIA_MATCH_QUEUE]);
  assert.deepEqual(OUTBOX_EVENT_QUEUE_MAP[ARTICLE_CRITERIA_MATCHED_EVENT], [CLUSTER_QUEUE]);
  assert.deepEqual(OUTBOX_EVENT_QUEUE_MAP[ARTICLE_CLUSTERED_EVENT], [INTEREST_MATCH_QUEUE]);
  assert.equal(OUTBOX_EVENT_QUEUE_MAP[ARTICLE_CLUSTERED_EVENT].includes(CLUSTER_QUEUE), false);
});

test("queue map preserves terminal routing contracts for downstream events", () => {
  assert.deepEqual(OUTBOX_EVENT_QUEUE_MAP[ARTICLE_INTERESTS_MATCHED_EVENT], [NOTIFY_QUEUE]);
  assert.deepEqual(OUTBOX_EVENT_QUEUE_MAP[LLM_REVIEW_REQUESTED_EVENT], [LLM_REVIEW_QUEUE]);
  assert.deepEqual(OUTBOX_EVENT_QUEUE_MAP[NOTIFICATION_FEEDBACK_RECORDED_EVENT], [
    FEEDBACK_INGEST_QUEUE
  ]);
  assert.deepEqual(OUTBOX_EVENT_QUEUE_MAP[REINDEX_REQUESTED_EVENT], [REINDEX_QUEUE]);
});

test("event classifiers distinguish article, compile, review, feedback and reindex events", () => {
  assert.equal(isArticleOutboxEvent(ARTICLE_INGEST_REQUESTED_EVENT), true);
  assert.equal(isArticleOutboxEvent(ARTICLE_CRITERIA_MATCHED_EVENT), true);
  assert.equal(isArticleOutboxEvent(INTEREST_COMPILE_REQUESTED_EVENT), false);

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

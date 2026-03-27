import { randomUUID } from "node:crypto";

import { Queue } from "bullmq";
import {
  ARTICLE_CRITERIA_MATCHED_EVENT,
  ARTICLE_CLUSTERED_EVENT,
  ARTICLE_EMBEDDED_EVENT,
  ARTICLE_INTERESTS_MATCHED_EVENT,
  CLUSTER_QUEUE,
  CRITERIA_MATCH_QUEUE,
  FEEDBACK_INGEST_QUEUE,
  INTEREST_MATCH_QUEUE,
  LLM_REVIEW_QUEUE,
  LLM_REVIEW_REQUESTED_EVENT,
  NOTIFICATION_FEEDBACK_RECORDED_EVENT,
  NOTIFY_QUEUE,
  REINDEX_QUEUE,
  REINDEX_REQUESTED_EVENT,
  buildOutboxEventQueueMap
} from "@newsportal/contracts";

import { loadRelayConfig } from "../config";
import { createPgPool, createRedisConnection } from "../db";
import { OutboxRelay } from "../relay";

async function expectJob(
  queue: Queue,
  eventId: string
): Promise<{
  name: string;
  data: Record<string, unknown>;
}> {
  const job = await queue.getJob(eventId);

  if (!job) {
    throw new Error(`Expected BullMQ job ${eventId} in ${queue.name} but none was found.`);
  }

  return {
    name: job.name,
    data: job.data as Record<string, unknown>
  };
}

function expectThinKeys(
  payload: Record<string, unknown>,
  expectedKeys: string[],
  label: string
): void {
  const actualKeys = Object.keys(payload).sort();
  const normalizedExpected = [...expectedKeys].sort();

  if (actualKeys.join(",") !== normalizedExpected.join(",")) {
    throw new Error(
      `${label} payload is not thin. Expected keys ${normalizedExpected.join(", ")}, got ${actualKeys.join(", ")}.`
    );
  }
}

async function main(): Promise<void> {
  const config = loadRelayConfig();
  const pool = createPgPool(config);
  const redis = createRedisConnection(config);
  const relay = new OutboxRelay(pool, redis, config.outboxBatchSize, {
    queueMap: buildOutboxEventQueueMap({
      enableEmbedFanout: true
    })
  });
  const clusterQueue = new Queue(CLUSTER_QUEUE, { connection: redis });
  const criteriaMatchQueue = new Queue(CRITERIA_MATCH_QUEUE, { connection: redis });
  const interestMatchQueue = new Queue(INTEREST_MATCH_QUEUE, { connection: redis });
  const notifyQueue = new Queue(NOTIFY_QUEUE, { connection: redis });
  const llmReviewQueue = new Queue(LLM_REVIEW_QUEUE, { connection: redis });
  const feedbackQueue = new Queue(FEEDBACK_INGEST_QUEUE, { connection: redis });
  const reindexQueue = new Queue(REINDEX_QUEUE, { connection: redis });

  try {
    const docId = randomUUID();
    const interestId = randomUUID();
    const notificationId = randomUUID();
    const userId = randomUUID();
    const promptTemplateId = randomUUID();
    const reindexJobId = randomUUID();
    const embeddedEventId = randomUUID();
    const clusteredEventId = randomUUID();
    const criteriaMatchedEventId = randomUUID();
    const matchedEventId = randomUUID();
    const llmReviewEventId = randomUUID();
    const feedbackEventId = randomUUID();
    const reindexEventId = randomUUID();

    await relay.enqueueOutboxRow({
      event_id: embeddedEventId,
      event_type: ARTICLE_EMBEDDED_EVENT,
      aggregate_type: "article",
      aggregate_id: docId,
      payload_json: {
        docId,
        version: 1
      }
    });
    await relay.enqueueOutboxRow({
      event_id: clusteredEventId,
      event_type: ARTICLE_CLUSTERED_EVENT,
      aggregate_type: "article",
      aggregate_id: docId,
      payload_json: {
        docId,
        version: 1
      }
    });
    await relay.enqueueOutboxRow({
      event_id: criteriaMatchedEventId,
      event_type: ARTICLE_CRITERIA_MATCHED_EVENT,
      aggregate_type: "article",
      aggregate_id: docId,
      payload_json: {
        docId,
        version: 1
      }
    });
    await relay.enqueueOutboxRow({
      event_id: matchedEventId,
      event_type: ARTICLE_INTERESTS_MATCHED_EVENT,
      aggregate_type: "article",
      aggregate_id: docId,
      payload_json: {
        docId,
        version: 1
      }
    });
    await relay.enqueueOutboxRow({
      event_id: llmReviewEventId,
      event_type: LLM_REVIEW_REQUESTED_EVENT,
      aggregate_type: "interest",
      aggregate_id: interestId,
      payload_json: {
        docId,
        scope: "interest",
        targetId: interestId,
        promptTemplateId,
        version: 1
      }
    });
    await relay.enqueueOutboxRow({
      event_id: feedbackEventId,
      event_type: NOTIFICATION_FEEDBACK_RECORDED_EVENT,
      aggregate_type: "notification",
      aggregate_id: notificationId,
      payload_json: {
        notificationId,
        docId,
        userId,
        interestId,
        version: 1
      }
    });
    await relay.enqueueOutboxRow({
      event_id: reindexEventId,
      event_type: REINDEX_REQUESTED_EVENT,
      aggregate_type: "reindex",
      aggregate_id: reindexJobId,
      payload_json: {
        reindexJobId,
        indexName: "event_cluster_centroids",
        version: 1
      }
    });

    const criteriaMatchJob = await expectJob(criteriaMatchQueue, embeddedEventId);
    const clusterJob = await expectJob(clusterQueue, criteriaMatchedEventId);
    const interestMatchJob = await expectJob(interestMatchQueue, clusteredEventId);
    const notifyJob = await expectJob(notifyQueue, matchedEventId);
    const llmReviewJob = await expectJob(llmReviewQueue, llmReviewEventId);
    const feedbackJob = await expectJob(feedbackQueue, feedbackEventId);
    const reindexJob = await expectJob(reindexQueue, reindexEventId);

    if (
      criteriaMatchJob.name !== ARTICLE_EMBEDDED_EVENT ||
      clusterJob.name !== ARTICLE_CRITERIA_MATCHED_EVENT ||
      interestMatchJob.name !== ARTICLE_CLUSTERED_EVENT
    ) {
      throw new Error("criteria-gated clustering routing reached the wrong queue job names.");
    }
    if (notifyJob.name !== ARTICLE_INTERESTS_MATCHED_EVENT) {
      throw new Error("article.interests.matched routed to the wrong queue job name.");
    }
    if (llmReviewJob.name !== LLM_REVIEW_REQUESTED_EVENT) {
      throw new Error("llm.review.requested routed to the wrong queue job name.");
    }
    if (feedbackJob.name !== NOTIFICATION_FEEDBACK_RECORDED_EVENT) {
      throw new Error("notification.feedback.recorded routed to the wrong queue job name.");
    }
    if (reindexJob.name !== REINDEX_REQUESTED_EVENT) {
      throw new Error("reindex.requested routed to the wrong queue job name.");
    }

    expectThinKeys(
      criteriaMatchJob.data,
      ["docId", "eventId", "jobId", "version"],
      "article.embedded -> criteria"
    );
    expectThinKeys(
      clusterJob.data,
      ["docId", "eventId", "jobId", "version"],
      "article.criteria.matched -> cluster"
    );
    expectThinKeys(
      interestMatchJob.data,
      ["docId", "eventId", "jobId", "version"],
      "article.clustered -> interests"
    );
    expectThinKeys(
      notifyJob.data,
      ["docId", "eventId", "jobId", "version"],
      "article.interests.matched"
    );
    expectThinKeys(
      llmReviewJob.data,
      ["docId", "eventId", "jobId", "promptTemplateId", "scope", "targetId", "version"],
      "llm.review.requested"
    );
    expectThinKeys(
      feedbackJob.data,
      ["docId", "eventId", "interestId", "jobId", "notificationId", "userId", "version"],
      "notification.feedback.recorded"
    );
    expectThinKeys(
      reindexJob.data,
      ["eventId", "indexName", "jobId", "reindexJobId", "version"],
      "reindex.requested"
    );

    console.log(
      `Phase 4/5 relay routing smoke passed: ${embeddedEventId} reached ${CRITERIA_MATCH_QUEUE}, ${criteriaMatchedEventId} reached ${CLUSTER_QUEUE}, ${clusteredEventId} reached ${INTEREST_MATCH_QUEUE}, ${matchedEventId} reached ${NOTIFY_QUEUE}, ${llmReviewEventId} reached ${LLM_REVIEW_QUEUE}, ${feedbackEventId} reached ${FEEDBACK_INGEST_QUEUE}, and ${reindexEventId} reached ${REINDEX_QUEUE}.`
    );
  } finally {
    await relay.close();
    await clusterQueue.close();
    await criteriaMatchQueue.close();
    await interestMatchQueue.close();
    await notifyQueue.close();
    await llmReviewQueue.close();
    await feedbackQueue.close();
    await reindexQueue.close();
    await redis.quit();
    await pool.end();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});

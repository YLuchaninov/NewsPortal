import { randomUUID } from "node:crypto";

import { Queue } from "bullmq";
import {
  ARTICLE_NORMALIZED_EVENT,
  CRITERION_COMPILE_QUEUE,
  CRITERION_COMPILE_REQUESTED_EVENT,
  buildOutboxEventQueueMap,
  DEDUP_QUEUE,
  EMBED_QUEUE,
  INTEREST_COMPILE_QUEUE,
  INTEREST_COMPILE_REQUESTED_EVENT
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

async function main(): Promise<void> {
  const config = loadRelayConfig();
  const pool = createPgPool(config);
  const redis = createRedisConnection(config);
  const relay = new OutboxRelay(pool, redis, config.outboxBatchSize, {
    queueMap: buildOutboxEventQueueMap({
      enableEmbedFanout: true
    })
  });
  const dedupQueue = new Queue(DEDUP_QUEUE, { connection: redis });
  const embedQueue = new Queue(EMBED_QUEUE, { connection: redis });
  const interestQueue = new Queue(INTEREST_COMPILE_QUEUE, { connection: redis });
  const criterionQueue = new Queue(CRITERION_COMPILE_QUEUE, { connection: redis });

  try {
    const docId = randomUUID();
    const interestId = randomUUID();
    const criterionId = randomUUID();
    const normalizedEventId = randomUUID();
    const interestEventId = randomUUID();
    const criterionEventId = randomUUID();

    await relay.enqueueOutboxRow({
      event_id: normalizedEventId,
      event_type: ARTICLE_NORMALIZED_EVENT,
      aggregate_type: "article",
      aggregate_id: docId,
      payload_json: {
        docId,
        version: 1
      }
    });
    await relay.enqueueOutboxRow({
      event_id: interestEventId,
      event_type: INTEREST_COMPILE_REQUESTED_EVENT,
      aggregate_type: "interest",
      aggregate_id: interestId,
      payload_json: {
        interestId,
        version: 2
      }
    });
    await relay.enqueueOutboxRow({
      event_id: criterionEventId,
      event_type: CRITERION_COMPILE_REQUESTED_EVENT,
      aggregate_type: "criterion",
      aggregate_id: criterionId,
      payload_json: {
        criterionId,
        version: 3
      }
    });

    const dedupJob = await expectJob(dedupQueue, normalizedEventId);
    const embedJob = await expectJob(embedQueue, normalizedEventId);
    const interestJob = await expectJob(interestQueue, interestEventId);
    const criterionJob = await expectJob(criterionQueue, criterionEventId);

    if (dedupJob.name !== ARTICLE_NORMALIZED_EVENT || embedJob.name !== ARTICLE_NORMALIZED_EVENT) {
      throw new Error("article.normalized fanout routed to the wrong queue job names.");
    }

    if (dedupJob.data.docId !== docId || embedJob.data.docId !== docId) {
      throw new Error("article.normalized fanout lost the docId payload.");
    }

    const expectedArticlePayloadKeys = ["docId", "eventId", "jobId", "version"];
    const dedupPayloadKeys = Object.keys(dedupJob.data).sort();
    const embedPayloadKeys = Object.keys(embedJob.data).sort();

    if (dedupPayloadKeys.join(",") !== expectedArticlePayloadKeys.join(",")) {
      throw new Error(
        `Phase 3 dedup payload is not thin. Expected keys ${expectedArticlePayloadKeys.join(", ")}, got ${dedupPayloadKeys.join(", ")}.`
      );
    }

    if (embedPayloadKeys.join(",") !== expectedArticlePayloadKeys.join(",")) {
      throw new Error(
        `Phase 3 embed payload is not thin. Expected keys ${expectedArticlePayloadKeys.join(", ")}, got ${embedPayloadKeys.join(", ")}.`
      );
    }

    if (interestJob.data.interestId !== interestId || interestJob.data.version !== 2) {
      throw new Error("interest.compile.requested payload did not preserve interestId/version.");
    }

    if (criterionJob.data.criterionId !== criterionId || criterionJob.data.version !== 3) {
      throw new Error("criterion.compile.requested payload did not preserve criterionId/version.");
    }

    console.log(
      `Phase 3 relay routing smoke passed: ${normalizedEventId} fanned out to ${DEDUP_QUEUE} + ${EMBED_QUEUE}, ${interestEventId} reached ${INTEREST_COMPILE_QUEUE}, and ${criterionEventId} reached ${CRITERION_COMPILE_QUEUE}.`
    );
  } finally {
    await relay.close();
    await dedupQueue.close();
    await embedQueue.close();
    await interestQueue.close();
    await criterionQueue.close();
    await redis.quit();
    await pool.end();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});

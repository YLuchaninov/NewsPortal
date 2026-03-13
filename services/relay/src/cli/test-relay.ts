import { Queue } from "bullmq";
import { FOUNDATION_SMOKE_QUEUE } from "@newsportal/contracts";

import { loadRelayConfig } from "../config";
import { createPgPool, createRedisConnection } from "../db";
import { OutboxRelay } from "../relay";
import { insertFoundationSmokeEvent, waitForPublishedEvent } from "../outbox";

async function main(): Promise<void> {
  const config = loadRelayConfig();
  const pool = createPgPool(config);
  const redis = createRedisConnection(config);
  const relay = new OutboxRelay(pool, redis, config.outboxBatchSize);
  const queue = new Queue(FOUNDATION_SMOKE_QUEUE, {
    connection: redis
  });

  try {
    const eventId = await insertFoundationSmokeEvent(pool);
    await relay.pollOnce();
    const outboxEvent = await waitForPublishedEvent(pool, eventId, 15000);

    if (outboxEvent.status !== "published") {
      throw new Error(
        `Outbox event ${eventId} finished with status ${outboxEvent.status}: ${outboxEvent.errorMessage ?? "no error message"}`
      );
    }

    const job = await queue.getJob(eventId);

    if (!job) {
      throw new Error(
        `Relay marked outbox event ${eventId} as published but BullMQ job was not found.`
      );
    }

    const payloadKeys = Object.keys(job.data as Record<string, unknown>).sort();
    const expectedKeys = ["aggregateId", "aggregateType", "eventId", "jobId", "version"];

    if (payloadKeys.join(",") !== expectedKeys.join(",")) {
      throw new Error(
        `Foundation relay payload is not thin. Expected keys ${expectedKeys.join(", ")}, got ${payloadKeys.join(", ")}.`
      );
    }

    console.log(
      `Relay smoke test passed: ${eventId} was published to ${FOUNDATION_SMOKE_QUEUE}.`
    );
  } finally {
    await relay.close();
    await queue.close();
    await redis.quit();
    await pool.end();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});

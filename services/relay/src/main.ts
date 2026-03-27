import Fastify from "fastify";
import { buildOutboxEventQueueMap, createHealthResponse } from "@newsportal/contracts";

import { loadRelayConfig } from "./config";
import {
  checkPostgres,
  checkRedis,
  createPgPool,
  createRedisConnection
} from "./db";
import { OutboxRelay } from "./relay";
import { PostgresSequenceRoutingRepository } from "./sequence-routing";

const config = loadRelayConfig();
const pool = createPgPool(config);
const redis = createRedisConnection(config);
const relay = new OutboxRelay(pool, redis, config.outboxBatchSize, {
  queueMap: buildOutboxEventQueueMap(),
  sequenceRouting: {
    enabled: config.enableSequenceRouting,
    repository: new PostgresSequenceRoutingRepository()
  }
});
const app = Fastify({
  logger: true
});

let relayInterval: NodeJS.Timeout | undefined;

app.get("/health", async () => {
  await checkPostgres(pool);
  await checkRedis(redis);

  const relayState = relay.getState();

  return createHealthResponse("relay", {
    database: "ok",
    redis: "ok",
    isPolling: String(relayState.isPolling),
    sequenceRoutingEnabled: String(config.enableSequenceRouting),
    publishedCount: String(relayState.publishedCount),
    failedCount: String(relayState.failedCount),
    lastPollCompletedAt: relayState.lastPollCompletedAt ?? "never"
  });
});

async function shutdown(signal: string): Promise<void> {
  if (relayInterval) {
    clearInterval(relayInterval);
  }

  app.log.info({ signal }, "Shutting down relay foundation.");
  await app.close();
  await relay.close();
  await redis.quit();
  await pool.end();
  process.exit(0);
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

async function main(): Promise<void> {
  await checkPostgres(pool);
  await checkRedis(redis);
  await relay.pollOnce();

  relayInterval = setInterval(() => {
    void relay.pollOnce().catch((error) => {
      app.log.error({ error }, "Relay poll failed.");
    });
  }, config.outboxPollIntervalMs);

  await app.listen({
    host: "0.0.0.0",
    port: config.relayPort
  });
}

void main().catch(async (error) => {
  app.log.error({ error }, "Relay startup failed.");
  await relay.close();
  await redis.quit();
  await pool.end();
  process.exit(1);
});

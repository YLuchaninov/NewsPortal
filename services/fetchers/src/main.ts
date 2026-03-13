import Fastify from "fastify";

import { loadFetchersConfig } from "./config";
import { checkPostgres, createPgPool } from "./db";
import { RssFetcherService } from "./fetchers";

const config = loadFetchersConfig();
const pool = createPgPool(config);
const service = new RssFetcherService(pool, config);
const app = Fastify({
  logger: true
});

let pollInterval: NodeJS.Timeout | undefined;

app.get("/health", async () => {
  await checkPostgres(pool);
  return service.createHealthResponse();
});

async function shutdown(signal: string): Promise<void> {
  if (pollInterval) {
    clearInterval(pollInterval);
  }

  app.log.info({ signal }, "Shutting down fetchers.");
  await app.close();
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
  try {
    await service.pollOnce();
  } catch (error) {
    app.log.error({ error }, "Initial fetchers poll failed.");
  }

  pollInterval = setInterval(() => {
    void service.pollOnce().catch((error) => {
      app.log.error({ error }, "Fetchers poll failed.");
    });
  }, config.fetchersPollIntervalMs);

  await app.listen({
    host: "0.0.0.0",
    port: config.fetchersPort
  });
}

void main().catch(async (error) => {
  app.log.error({ error }, "Fetchers startup failed.");
  await pool.end();
  process.exit(1);
});

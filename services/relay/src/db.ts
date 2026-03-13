import IORedis from "ioredis";
import { Pool } from "pg";

import type { RelayConfig } from "./config";

export function createPgPool(config: RelayConfig): Pool {
  return new Pool({
    connectionString: config.databaseUrl
  });
}

export function createRedisConnection(config: RelayConfig): IORedis {
  return new IORedis(config.redisUrl, {
    maxRetriesPerRequest: null
  });
}

export async function checkPostgres(pool: Pool): Promise<void> {
  await pool.query("select 1");
}

export async function checkRedis(connection: IORedis): Promise<void> {
  await connection.ping();
}

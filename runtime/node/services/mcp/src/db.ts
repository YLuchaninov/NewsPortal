import { Pool } from "pg";

import type { McpServiceConfig } from "./config";

export function createPgPool(config: McpServiceConfig): Pool {
  return new Pool({
    connectionString: config.databaseUrl,
  });
}

export async function checkPostgres(pool: Pool): Promise<void> {
  await pool.query("select 1");
}

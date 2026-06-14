import { Pool } from "pg";

import type { FetchersConfig } from "./config";

export function createPgPool(config: FetchersConfig): Pool {
  return new Pool({
    connectionString: config.databaseUrl
  });
}

export async function checkPostgres(pool: Pool): Promise<void> {
  await pool.query("select 1");
}

import { Pool, type QueryResultRow } from "pg";

type PoolRegistry = typeof globalThis & Record<string, Pool | undefined>;

function buildDatabaseUrl(): string {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const user = process.env.POSTGRES_USER ?? "signalops";
  const password = process.env.POSTGRES_PASSWORD ?? "signalops";
  const host = process.env.POSTGRES_HOST ?? "127.0.0.1";
  const port =
    process.env.POSTGRES_PORT ??
    (host === "127.0.0.1" || host === "localhost" ? "55432" : "5432");
  const database = process.env.POSTGRES_DB ?? "signalops";
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
}

export function getBffPool(globalKey: string): Pool {
  const registry = globalThis as PoolRegistry;
  registry[globalKey] ??= new Pool({
    connectionString: buildDatabaseUrl(),
  });
  return registry[globalKey];
}

export async function queryBffRows<T extends QueryResultRow>(
  pool: Pool,
  text: string,
  params: unknown[] = []
): Promise<T[]> {
  const result = await pool.query<T>(text, params);
  return result.rows;
}

export async function queryBffOne<T extends QueryResultRow>(
  pool: Pool,
  text: string,
  params: unknown[] = []
): Promise<T | null> {
  const rows = await queryBffRows<T>(pool, text, params);
  return rows[0] ?? null;
}

import { Pool, type QueryResultRow } from "pg";

declare global {
  var __newsportalAdminPool: Pool | undefined;
}

function buildDatabaseUrl(): string {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const user = process.env.POSTGRES_USER ?? "newsportal";
  const password = process.env.POSTGRES_PASSWORD ?? "newsportal";
  const host = process.env.POSTGRES_HOST ?? "127.0.0.1";
  const port =
    process.env.POSTGRES_PORT ??
    (host === "127.0.0.1" || host === "localhost" ? "55432" : "5432");
  const database = process.env.POSTGRES_DB ?? "newsportal";
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
}

export function getPool(): Pool {
  if (!globalThis.__newsportalAdminPool) {
    globalThis.__newsportalAdminPool = new Pool({
      connectionString: buildDatabaseUrl()
    });
  }

  return globalThis.__newsportalAdminPool;
}

export async function queryRows<T extends QueryResultRow>(
  text: string,
  params: unknown[] = []
): Promise<T[]> {
  const result = await getPool().query<T>(text, params);
  return result.rows;
}

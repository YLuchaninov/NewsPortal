import type { Pool } from "pg";

export function readCountField(row: Record<string, unknown> | undefined, field: string): number {
  return Number(row?.[field] ?? 0);
}

export async function queryCount(pool: Pool, sql: string, params: unknown[] = []): Promise<number> {
  const result = await pool.query<Record<string, unknown>>(sql, params);
  const row = result.rows[0] ?? {};
  return Number(row.total ?? row.count ?? 0);
}

export async function countQuery(
  pool: Pool,
  sql: string,
  params: unknown[] = []
): Promise<Array<Record<string, unknown>>> {
  const result = await pool.query<Record<string, unknown>>(sql, params);
  return result.rows;
}

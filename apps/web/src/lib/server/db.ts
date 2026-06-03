import { getBffPool, queryBffOne, queryBffRows } from "@newsportal/bff-server";
import type { Pool, QueryResultRow } from "pg";

declare global {
  var __newsportalWebPool: Pool | undefined;
}

export function getPool(): Pool {
  return getBffPool("__newsportalWebPool");
}

export async function queryRows<T extends QueryResultRow>(
  text: string,
  params: unknown[] = []
): Promise<T[]> {
  return queryBffRows<T>(getPool(), text, params);
}

export async function queryOne<T extends QueryResultRow>(
  text: string,
  params: unknown[] = []
): Promise<T | null> {
  return queryBffOne<T>(getPool(), text, params);
}

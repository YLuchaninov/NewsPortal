import { getBffPool, queryBffRows } from "@newsportal/bff-server";
import type { Pool, QueryResultRow } from "pg";

declare global {
  var __newsportalAdminPool: Pool | undefined;
}

export function getPool(): Pool {
  return getBffPool("__newsportalAdminPool");
}

export async function queryRows<T extends QueryResultRow>(
  text: string,
  params: unknown[] = []
): Promise<T[]> {
  return queryBffRows<T>(getPool(), text, params);
}

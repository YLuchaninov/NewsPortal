import { getBffPool, queryBffRows } from "@signalops/bff-server";
import type { Pool, QueryResultRow } from "pg";

declare global {
  var __signalopsAdminPool: Pool | undefined;
}

export function getPool(): Pool {
  return getBffPool("__signalopsAdminPool");
}

export async function queryRows<T extends QueryResultRow>(
  text: string,
  params: unknown[] = []
): Promise<T[]> {
  return queryBffRows<T>(getPool(), text, params);
}

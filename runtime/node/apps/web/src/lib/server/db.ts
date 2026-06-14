import { getBffPool, queryBffOne, queryBffRows } from "@signalops/bff-server";
import type { Pool, QueryResultRow } from "pg";

declare global {
  var __signalopsWebPool: Pool | undefined;
}

export function getPool(): Pool {
  return getBffPool("__signalopsWebPool");
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

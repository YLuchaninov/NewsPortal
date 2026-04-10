import test from "node:test";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";

import { upsertArticleObservation } from "../../../services/fetchers/src/document-observations";

test("upsertArticleObservation persists a pending article observation keyed by article origin", async () => {
  const calls: Array<{ sql: string; params: unknown[] | undefined }> = [];
  const client = {
    async query(sql: string, params?: unknown[]) {
      calls.push({ sql, params });
      return { rows: [] };
    },
  } as unknown as PoolClient;

  await upsertArticleObservation(client, "doc-123");

  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /insert into document_observations/i);
  assert.match(calls[0].sql, /pending_canonicalization/);
  assert.match(calls[0].sql, /on conflict \(origin_type, origin_id\) do update/i);
  assert.deepEqual(calls[0].params, ["doc-123"]);
});

import assert from "node:assert/strict";
import test from "node:test";

import { RssFetcherService } from "../../../services/fetchers/src/fetchers.ts";

function createConfig() {
  return {
    databaseUrl: "postgresql://newsportal:newsportal@127.0.0.1:55432/newsportal",
    fetchersPort: 4100,
    fetchersPollIntervalMs: 5000,
    fetchersBatchSize: 10,
    fetchersConcurrency: 2,
    defaultRequestTimeoutMs: 10000,
    defaultUserAgent: "test-agent",
    enrichmentEnabled: true,
    enrichmentConcurrency: 2,
    enrichmentTimeoutMs: 15000,
    enrichmentUserAgent: "test-agent",
    enrichmentMaxOembedPerArticle: 2,
    enrichmentOembedTimeoutMs: 10000,
    enrichmentPerDomainConcurrency: 1,
    enrichmentPerDomainMinIntervalMs: 0,
  };
}

test("pollLoadedChannelSafely skips polling when the channel lease is already held", async () => {
  const clientQueries: Array<{ sql: string; params: unknown[] | undefined }> = [];
  const client = {
    query: async (sql: string, params?: unknown[]) => {
      clientQueries.push({ sql, params });
      return { rows: [{ locked: false }] };
    },
    release: () => undefined,
  };
  const pool = {
    connect: async () => client,
    query: async () => ({ rows: [] }),
  };
  const service = new RssFetcherService(pool as any, createConfig() as any);

  let polled = 0;
  (service as any).pollLoadedChannel = async () => {
    polled += 1;
  };

  await (service as any).pollLoadedChannelSafely({
    channelId: "channel-1",
  });

  assert.equal(polled, 0);
  assert.equal(clientQueries.length, 1);
  assert.match(clientQueries[0]?.sql ?? "", /pg_try_advisory_lock/);
});

test("pollLoadedChannelSafely unlocks the channel lease after a successful poll", async () => {
  const clientQueries: Array<{ sql: string; params: unknown[] | undefined }> = [];
  const client = {
    query: async (sql: string, params?: unknown[]) => {
      clientQueries.push({ sql, params });
      if (sql.includes("pg_try_advisory_lock")) {
        return { rows: [{ locked: true }] };
      }
      if (sql.includes("pg_advisory_unlock")) {
        return { rows: [{ pg_advisory_unlock: true }] };
      }
      return { rows: [] };
    },
    release: () => undefined,
  };
  const pool = {
    connect: async () => client,
    query: async () => ({ rows: [] }),
  };
  const service = new RssFetcherService(pool as any, createConfig() as any);

  let polled = 0;
  (service as any).pollLoadedChannel = async () => {
    polled += 1;
  };

  await (service as any).pollLoadedChannelSafely({
    channelId: "channel-2",
  });

  assert.equal(polled, 1);
  assert.equal(clientQueries.length, 2);
  assert.match(clientQueries[0]?.sql ?? "", /pg_try_advisory_lock/);
  assert.match(clientQueries[1]?.sql ?? "", /pg_advisory_unlock/);
});

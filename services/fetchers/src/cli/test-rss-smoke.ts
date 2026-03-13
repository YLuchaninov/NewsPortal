import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Pool } from "pg";

import { loadFetchersConfig } from "../config";
import { createPgPool } from "../db";
import { RssFetcherService } from "../fetchers";

interface WaitOptions {
  timeoutMs: number;
  pollIntervalMs: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitForCondition(
  predicate: () => Promise<boolean>,
  options: WaitOptions
): Promise<void> {
  const deadline = Date.now() + options.timeoutMs;

  while (Date.now() < deadline) {
    if (await predicate()) {
      return;
    }

    await sleep(options.pollIntervalMs);
  }

  throw new Error("Timed out waiting for RSS smoke assertions to complete.");
}

async function startFixtureServer(feedXml: string): Promise<{
  close: () => Promise<void>;
  url: string;
}> {
  const etag = `"smoke-feed-v1"`;
  const lastModified = "Fri, 13 Mar 2026 09:00:00 GMT";
  const server = createServer(
    (request: IncomingMessage, response: ServerResponse): void => {
      if (request.url !== "/rss.xml") {
        response.writeHead(404);
        response.end("not found");
        return;
      }

      if (
        request.headers["if-none-match"] === etag ||
        request.headers["if-modified-since"] === lastModified
      ) {
        response.writeHead(304, {
          ETag: etag,
          "Last-Modified": lastModified
        });
        response.end();
        return;
      }

      response.writeHead(200, {
        "content-type": "application/rss+xml; charset=utf-8",
        ETag: etag,
        "Last-Modified": lastModified
      });
      response.end(feedXml);
    }
  );

  await new Promise<void>((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => resolve());
    server.on("error", reject);
  });

  const address = server.address();

  if (!address || typeof address === "string") {
    throw new Error("Fixture server did not bind to an IPv4 port.");
  }

  return {
    url: `http://127.0.0.1:${address.port}/rss.xml`,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    }
  };
}

async function seedSmokeChannel(pool: Pool, fetchUrl: string): Promise<string> {
  const result = await pool.query<{ channelId: string }>(
    `
      insert into source_channels (
        provider_type,
        name,
        fetch_url,
        homepage_url,
        config_json,
        language,
        poll_interval_seconds
      )
      values (
        'rss',
        'RSS smoke test channel',
        $1,
        'https://example.com',
        $2::jsonb,
        'en',
        3600
      )
      returning channel_id::text as "channelId"
    `,
    [
      fetchUrl,
      JSON.stringify({
        maxItemsPerPoll: 10,
        requestTimeoutMs: 5000,
        userAgent: "NewsPortalFetchers/SmokeTest",
        preferContentEncoded: true
      })
    ]
  );

  return result.rows[0].channelId;
}

async function waitForProcessedArticle(pool: Pool, channelId: string): Promise<void> {
  await waitForCondition(
    async () => {
      const result = await pool.query<{ count: string }>(
        `
          select count(*)::text as count
          from articles
          where
            channel_id = $1
            and processing_state = 'deduped'
        `,
        [channelId]
      );

      return result.rows[0]?.count === "1";
    },
    {
      timeoutMs: 20000,
      pollIntervalMs: 500
    }
  );
}

async function assertSmokeRows(pool: Pool, channelId: string): Promise<void> {
  const articleResult = await pool.query<{
    processingState: string;
    canonicalDocId: string | null;
    familyId: string | null;
    isExactDuplicate: boolean;
    isNearDuplicate: boolean;
  }>(
    `
      select
        processing_state as "processingState",
        canonical_doc_id::text as "canonicalDocId",
        family_id::text as "familyId",
        is_exact_duplicate as "isExactDuplicate",
        is_near_duplicate as "isNearDuplicate"
      from articles
      where channel_id = $1
    `,
    [channelId]
  );

  if (articleResult.rowCount !== 1) {
    throw new Error(`Expected exactly one article row, found ${articleResult.rowCount}.`);
  }

  const article = articleResult.rows[0];

  if (article.processingState !== "deduped") {
    throw new Error(`Expected article.processing_state to be deduped, got ${article.processingState}.`);
  }

  if (!article.canonicalDocId || !article.familyId) {
    throw new Error("Expected canonical_doc_id and family_id to be populated.");
  }

  if (article.isExactDuplicate || article.isNearDuplicate) {
    throw new Error("Expected the first smoke article to remain non-duplicate.");
  }

  const externalRefResult = await pool.query<{ count: string }>(
    `
      select count(*)::text as count
      from article_external_refs
      where channel_id = $1
    `,
    [channelId]
  );

  if (externalRefResult.rows[0]?.count !== "1") {
    throw new Error("Expected one article_external_refs row for the smoke channel.");
  }

  const cursorResult = await pool.query<{ count: string }>(
    `
      select count(*)::text as count
      from fetch_cursors
      where
        channel_id = $1
        and cursor_type in ('etag', 'timestamp')
    `,
    [channelId]
  );

  if (cursorResult.rows[0]?.count !== "2") {
    throw new Error("Expected etag and timestamp fetch_cursors rows for the smoke channel.");
  }

  const outboxResult = await pool.query<{ count: string }>(
    `
      select count(*)::text as count
      from outbox_events
      where
        aggregate_type = 'article'
        and aggregate_id in (
          select doc_id
          from articles
          where channel_id = $1
        )
        and event_type in ('article.ingest.requested', 'article.normalized')
        and status = 'published'
    `,
    [channelId]
  );

  if (outboxResult.rows[0]?.count !== "2") {
    throw new Error("Expected published outbox rows for article.ingest.requested and article.normalized.");
  }

  const inboxResult = await pool.query<{ count: string }>(
    `
      select count(*)::text as count
      from inbox_processed_events
      where consumer_name in ('worker.normalize', 'worker.dedup')
    `
  );

  if (Number.parseInt(inboxResult.rows[0]?.count ?? "0", 10) < 2) {
    throw new Error("Expected worker.normalize and worker.dedup inbox rows.");
  }
}

async function assertIdempotentRefetch(
  service: RssFetcherService,
  pool: Pool,
  channelId: string
): Promise<void> {
  await service.pollChannel(channelId);

  const articleResult = await pool.query<{ count: string }>(
    `
      select count(*)::text as count
      from articles
      where channel_id = $1
    `,
    [channelId]
  );

  if (articleResult.rows[0]?.count !== "1") {
    throw new Error("Expected RSS refetch to avoid creating duplicate article rows.");
  }
}

async function main(): Promise<void> {
  const config = loadFetchersConfig();
  const pool = createPgPool(config);
  const service = new RssFetcherService(pool, config);
  const smokeRunId = randomUUID();
  const fixturesDirectory = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../fixtures"
  );
  const fixtureXml = (
    await readFile(path.join(fixturesDirectory, "smoke-feed.xml"), "utf8")
  )
    .replaceAll("smoke-item-1", `smoke-item-${smokeRunId}`)
    .replaceAll("Smoke Test Article", `Smoke Test Article ${smokeRunId}`)
    .replaceAll("smoke-article", `smoke-article-${smokeRunId}`)
    .replaceAll(
      "Smoke summary for the first phase 2 article.",
      `Smoke summary for the first phase 2 article ${smokeRunId}.`
    )
    .replaceAll(
      "This article should move from raw to normalized and then deduped.",
      `This article should move from raw to normalized and then deduped for run ${smokeRunId}.`
    );
  const fixtureServer = await startFixtureServer(fixtureXml);

  try {
    const channelId = await seedSmokeChannel(pool, fixtureServer.url);
    await service.pollChannel(channelId);
    await waitForProcessedArticle(pool, channelId);
    await assertSmokeRows(pool, channelId);
    await assertIdempotentRefetch(service, pool, channelId);
    console.log(`RSS smoke test passed for channel ${channelId}.`);
  } finally {
    await fixtureServer.close();
    await pool.end();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});

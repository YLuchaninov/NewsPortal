import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import type { Pool } from "pg";

import { loadFetchersConfig } from "../config";
import { createPgPool } from "../db";
import { RssFetcherService } from "../fetchers";

interface WaitOptions {
  timeoutMs: number;
  pollIntervalMs: number;
}

interface ArticleRow {
  docId: string;
  title: string;
  body: string;
  fullContentHtml: string | null;
  enrichmentState: string;
  processingState: string;
  hasMedia: boolean;
}

const PROCESSING_STATE_ORDER: Record<string, number> = {
  raw: 0,
  normalized: 1,
  deduped: 2,
  embedded: 3,
  clustered: 4,
  matched: 5,
  notified: 6,
};

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

  throw new Error("Timed out waiting for enrichment smoke assertions.");
}

function longFeedBody(runId: string): string {
  return Array.from({ length: 32 }, (_, index) => `Long feed sentinel ${runId} paragraph ${index + 1}.`).join(
    " "
  );
}

function articleHtml(runId: string, title: string, bodyLabel: string, imageUrl: string): string {
  const paragraphs = Array.from(
    { length: 12 },
    (_, index) =>
      `<p>${bodyLabel} ${runId} expanded paragraph ${index + 1} with Brussels, Warsaw, and EU AI policy details.</p>`
  ).join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>${title}</title>
    <meta name="author" content="Fixture Reporter ${runId}">
    <meta property="og:image" content="${imageUrl}">
  </head>
  <body>
    <article>
      ${paragraphs}
      <img src="${imageUrl}" alt="${title}">
    </article>
  </body>
</html>`;
}

async function startFixtureServer(runId: string): Promise<{
  close: () => Promise<void>;
  feedUrl: string;
}> {
  const server = createServer((request: IncomingMessage, response: ServerResponse): void => {
    const host = request.headers.host ?? "127.0.0.1";
    const baseUrl = `http://${host}`;
    const shortTitle = `Enrichment short article ${runId}`;
    const longTitle = `Enrichment long article ${runId}`;
    const failedTitle = `Enrichment failing article ${runId}`;
    const shortArticleUrl = `${baseUrl}/articles/short.html`;
    const longArticleUrl = `${baseUrl}/articles/long.html`;
    const failedArticleUrl = `${baseUrl}/articles/failure.html`;
    const shortImageUrl = `${baseUrl}/media/short.jpg`;
    const failureImageUrl = `${baseUrl}/media/failure.jpg`;

    if (request.url === "/feed.xml") {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Enrichment Smoke Feed ${runId}</title>
    <link>https://newsportal.local/enrichment-smoke</link>
    <description>Local enrichment smoke feed ${runId}</description>
    <language>en</language>
    <item>
      <guid>enrichment-short-${runId}</guid>
      <title>${shortTitle}</title>
      <link>${shortArticleUrl}</link>
      <description><![CDATA[Short feed body ${runId}.]]></description>
      <content:encoded><![CDATA[<p>Short feed body ${runId}.</p>]]></content:encoded>
      <pubDate>${new Date().toUTCString()}</pubDate>
    </item>
    <item>
      <guid>enrichment-long-${runId}</guid>
      <title>${longTitle}</title>
      <link>${longArticleUrl}</link>
      <description><![CDATA[${longFeedBody(runId)}]]></description>
      <content:encoded><![CDATA[<p>${longFeedBody(runId)}</p>]]></content:encoded>
      <pubDate>${new Date().toUTCString()}</pubDate>
    </item>
    <item>
      <guid>enrichment-failed-${runId}</guid>
      <title>${failedTitle}</title>
      <link>${failedArticleUrl}</link>
      <description><![CDATA[Failure feed sentinel ${runId}.]]></description>
      <content:encoded><![CDATA[<p>Failure feed sentinel ${runId}.</p>]]></content:encoded>
      <enclosure url="${failureImageUrl}" type="image/jpeg" />
      <pubDate>${new Date().toUTCString()}</pubDate>
    </item>
  </channel>
</rss>`;
      response.writeHead(200, {
        "content-type": "application/rss+xml; charset=utf-8",
      });
      response.end(xml);
      return;
    }

    if (request.url === "/articles/short.html") {
      response.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
      });
      response.end(articleHtml(runId, shortTitle, "Expanded enrichment paragraph", shortImageUrl));
      return;
    }

    if (request.url === "/articles/long.html") {
      response.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
      });
      response.end(articleHtml(runId, longTitle, "Expanded long-page paragraph", shortImageUrl));
      return;
    }

    if (request.url === "/articles/failure.html") {
      response.writeHead(500, {
        "content-type": "text/plain; charset=utf-8",
      });
      response.end("simulated extraction failure");
      return;
    }

    if (request.url === "/media/short.jpg" || request.url === "/media/failure.jpg") {
      response.writeHead(200, {
        "content-type": "image/jpeg",
      });
      response.end("fixture-image");
      return;
    }

    response.writeHead(404, {
      "content-type": "text/plain; charset=utf-8",
    });
    response.end("not found");
  });

  await new Promise<void>((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => resolve());
    server.on("error", reject);
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Enrichment fixture server did not bind to an IPv4 port.");
  }

  return {
    feedUrl: `http://127.0.0.1:${address.port}/feed.xml`,
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
    },
  };
}

async function seedChannel(pool: Pool, feedUrl: string): Promise<string> {
  const result = await pool.query<{ channelId: string }>(
    `
      insert into source_channels (
        provider_type,
        name,
        fetch_url,
        config_json,
        language,
        poll_interval_seconds,
        enrichment_enabled,
        enrichment_min_body_length
      )
      values (
        'rss',
        $1,
        $2,
        $3::jsonb,
        'en',
        3600,
        true,
        500
      )
      returning channel_id::text as "channelId"
    `,
    [
      `Enrichment smoke channel ${randomUUID()}`,
      feedUrl,
      JSON.stringify({
        maxItemsPerPoll: 10,
        requestTimeoutMs: 5000,
        userAgent: "NewsPortalFetchers/EnrichmentSmoke",
        preferContentEncoded: true,
      }),
    ]
  );

  return result.rows[0].channelId;
}

async function fetchArticleRows(pool: Pool, channelId: string): Promise<ArticleRow[]> {
  const result = await pool.query<ArticleRow>(
    `
      select
        doc_id::text as "docId",
        title,
        body,
        full_content_html as "fullContentHtml",
        enrichment_state as "enrichmentState",
        processing_state as "processingState",
        has_media as "hasMedia"
      from articles
      where channel_id = $1
      order by title asc
    `,
    [channelId]
  );

  return result.rows;
}

async function countMediaAssets(pool: Pool, docId: string): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `
      select count(*)::text as count
      from article_media_assets
      where doc_id = $1
    `,
    [docId]
  );
  return Number(result.rows[0]?.count ?? "0");
}

async function assertEnrichmentRows(pool: Pool, channelId: string, runId: string): Promise<void> {
  await waitForCondition(
    async () => {
      const rows = await fetchArticleRows(pool, channelId);
      if (rows.length !== 3) {
        return false;
      }

      const states = Object.fromEntries(rows.map((row) => [row.title, row]));
      const shortRow = states[`Enrichment short article ${runId}`];
      const longRow = states[`Enrichment long article ${runId}`];
      const failedRow = states[`Enrichment failing article ${runId}`];
      if (!shortRow || !longRow || !failedRow) {
        return false;
      }

      return (
        shortRow.enrichmentState === "enriched" &&
        longRow.enrichmentState === "skipped" &&
        failedRow.enrichmentState === "failed" &&
        (PROCESSING_STATE_ORDER[shortRow.processingState] ?? 0) >= PROCESSING_STATE_ORDER.embedded &&
        (PROCESSING_STATE_ORDER[longRow.processingState] ?? 0) >= PROCESSING_STATE_ORDER.embedded &&
        (PROCESSING_STATE_ORDER[failedRow.processingState] ?? 0) >= PROCESSING_STATE_ORDER.embedded
      );
    },
    {
      timeoutMs: 45000,
      pollIntervalMs: 1000,
    }
  );

  const rows = await fetchArticleRows(pool, channelId);
  const byTitle = Object.fromEntries(rows.map((row) => [row.title, row]));
  const shortRow = byTitle[`Enrichment short article ${runId}`];
  const longRow = byTitle[`Enrichment long article ${runId}`];
  const failedRow = byTitle[`Enrichment failing article ${runId}`];

  if (!shortRow.body.includes(`Expanded enrichment paragraph ${runId}`)) {
    throw new Error("Expected short-body article to use the extracted article content.");
  }
  if (!shortRow.hasMedia || (await countMediaAssets(pool, shortRow.docId)) < 1) {
    throw new Error("Expected short-body article enrichment to persist preview media.");
  }

  if (!longRow.body.includes(`Long feed sentinel ${runId}`)) {
    throw new Error("Expected long-body article to preserve the original feed body.");
  }
  if (longRow.body.includes(`Expanded long-page paragraph ${runId}`)) {
    throw new Error("Expected long-body article to skip full-article extraction.");
  }
  if (!longRow.fullContentHtml?.includes(`Long feed sentinel ${runId}`)) {
    throw new Error("Expected skipped article to retain feed HTML in full_content_html.");
  }

  if (!failedRow.body.includes(`Failure feed sentinel ${runId}`)) {
    throw new Error("Expected failed article enrichment to preserve the original feed body.");
  }
  if (!failedRow.hasMedia || (await countMediaAssets(pool, failedRow.docId)) < 1) {
    throw new Error("Expected failed article enrichment to keep feed media assets.");
  }

  const taskRunResult = await pool.query<{ count: string }>(
    `
      select count(*)::text as count
      from sequence_task_runs str
      join sequence_runs sr on sr.run_id = str.run_id
      where str.task_key = 'enrichment'
        and sr.context_json ->> 'doc_id' in (
          select doc_id::text
          from articles
          where channel_id = $1
        )
    `,
    [channelId]
  );

  if (Number(taskRunResult.rows[0]?.count ?? "0") < 3) {
    throw new Error("Expected sequence task runs to record one enrichment step per article.");
  }
}

async function main(): Promise<void> {
  const config = loadFetchersConfig();
  const pool = createPgPool(config);
  const service = new RssFetcherService(pool, config);
  const runId = randomUUID();
  const fixtureServer = await startFixtureServer(runId);

  try {
    const channelId = await seedChannel(pool, fixtureServer.feedUrl);
    await service.pollChannel(channelId);
    await assertEnrichmentRows(pool, channelId, runId);
    console.log(`Enrichment smoke test passed for channel ${channelId}.`);
  } finally {
    await fixtureServer.close();
    await pool.end();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});

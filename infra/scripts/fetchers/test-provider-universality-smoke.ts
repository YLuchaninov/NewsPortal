import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import type { Pool } from "pg";

import { loadFetchersConfig } from "../../../services/fetchers/src/config";
import { createPgPool } from "../../../services/fetchers/src/db";
import { pollEmailImapProviderChannel } from "../../../services/fetchers/src/fetcher-email-imap-poller";
import type {
  ChannelPollCompletion,
  CursorMap,
  PersistSignalCandidateInput,
  SourceChannelRow
} from "../../../services/fetchers/src/fetcher-persistence";
import { RssFetcherService } from "../../../services/fetchers/src/fetchers";

interface FetchRunRow {
  outcomeKind: string;
  httpStatus: number | null;
  errorMessage: string | null;
  providerMetricsJson: Record<string, unknown> | null;
}

interface FixtureState {
  apiAuthorizationHeaders: string[];
  apiCustomHeaders: string[];
  apiBodies: unknown[];
}

interface ServiceInternals {
  loadChannelById(channelId: string): Promise<SourceChannelRow | null>;
  loadCursorMap(channelId: string): Promise<CursorMap>;
  persistInputsWithPreflight(
    channelId: string,
    inputs: readonly PersistSignalCandidateInput[]
  ): Promise<{ ingestedCount: number; duplicateCount: number }>;
  markChannelSuccess(
    channel: SourceChannelRow,
    completion: ChannelPollCompletion
  ): Promise<void>;
}

function readAuthorizationHeader(request: IncomingMessage): string | null {
  const value = request.headers.authorization;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function unauthorized(response: ServerResponse): void {
  response.writeHead(401, {
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify({ error: "unauthorized" }));
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf-8").trim();
  return raw ? JSON.parse(raw) as unknown : null;
}

async function startApiFixtureServer(input: {
  runId: string;
  authorizationHeader: string;
  customHeader: string;
  state: FixtureState;
}): Promise<{
  baseUrl: string;
  apiUrl: string;
  close: () => Promise<void>;
}> {
  const server = createServer((request: IncomingMessage, response: ServerResponse): void => {
    void (async () => {
      const host = request.headers.host ?? "127.0.0.1";
      const baseUrl = `http://${host}`;
      const requestUrl = new URL(request.url ?? "/", baseUrl);

      if (requestUrl.pathname !== "/api/news") {
        response.writeHead(404, { "content-type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ error: "not_found" }));
        return;
      }

      const authorizationHeader = readAuthorizationHeader(request);
      if (authorizationHeader !== input.authorizationHeader) {
        unauthorized(response);
        return;
      }
      input.state.apiAuthorizationHeaders.push(authorizationHeader);
      input.state.apiCustomHeaders.push(String(request.headers["x-provider-fixture"] ?? ""));
      input.state.apiBodies.push(await readJsonBody(request));

      const page = requestUrl.searchParams.get("page") ?? "1";
      response.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      });

      if (page === "1") {
        response.end(JSON.stringify({
          items: [
            {
              id: `api-${input.runId}-1`,
              title: `API provider story ${input.runId} A`,
              lead: `API provider lead ${input.runId} A`,
              body: `API provider body ${input.runId} A`,
              url: `/stories/api-${input.runId}-a`,
              publishedAt: "2026-04-07T10:00:00.000Z",
              lang: "en",
            },
          ],
          nextUrl: `${baseUrl}/api/news?page=2`,
        }));
        return;
      }

      response.end(JSON.stringify({
        items: [
          {
            id: `api-${input.runId}-2`,
            title: `API provider story ${input.runId} B`,
            lead: `API provider lead ${input.runId} B`,
            body: `API provider body ${input.runId} B`,
            url: `${baseUrl}/stories/api-${input.runId}-b`,
            publishedAt: "2026-04-07T10:05:00.000Z",
            lang: "en",
          },
        ],
        nextUrl: `${baseUrl}/api/news?page=3`,
      }));
    })().catch((error) => {
      response.writeHead(500, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => resolve());
    server.on("error", reject);
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("API fixture server did not bind to an IPv4 port.");
  }

  const baseUrl = `http://127.0.0.1:${address.port}`;
  return {
    baseUrl,
    apiUrl: `${baseUrl}/api/news?page=1`,
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

async function seedApiChannel(
  pool: Pool,
  input: {
    runId: string;
    fetchUrl: string;
    authorizationHeader: string;
    customHeader: string;
  }
): Promise<string> {
  const result = await pool.query<{ channelId: string }>(
    `
      insert into source_channels (
        provider_type,
        name,
        fetch_url,
        homepage_url,
        config_json,
        auth_config_json,
        language,
        poll_interval_seconds,
        enrichment_enabled,
        enrichment_min_body_length
      )
      values (
        'api',
        $1,
        $2,
        $2,
        $3::jsonb,
        $4::jsonb,
        'en',
        300,
        true,
        500
      )
      returning channel_id::text as "channelId"
    `,
    [
      `API provider universality ${input.runId}`,
      input.fetchUrl,
      JSON.stringify({
        maxItemsPerPoll: 5,
        requestTimeoutMs: 5000,
        userAgent: "SignalOpsFetchers/ProviderUniversalitySmoke",
        requestMethod: "POST",
        requestHeaders: {
          "x-provider-fixture": input.customHeader,
        },
        requestBodyJson: {
          query: `provider-${input.runId}`,
        },
        pagination: {
          mode: "next_url",
          nextUrlPath: "nextUrl",
          maxPagesPerPoll: 2,
        },
        itemsPath: "items",
        titleField: "title",
        leadField: "lead",
        bodyField: "body",
        urlField: "url",
        publishedAtField: "publishedAt",
        externalIdField: "id",
        languageField: "lang",
      }),
      JSON.stringify({ authorizationHeader: input.authorizationHeader }),
    ]
  );
  return result.rows[0].channelId;
}

async function seedEmailImapChannel(pool: Pool, runId: string): Promise<string> {
  const result = await pool.query<{ channelId: string }>(
    `
      insert into source_channels (
        provider_type,
        name,
        fetch_url,
        homepage_url,
        config_json,
        auth_config_json,
        language,
        poll_interval_seconds,
        enrichment_enabled,
        enrichment_min_body_length
      )
      values (
        'email_imap',
        $1,
        null,
        null,
        $2::jsonb,
        '{}'::jsonb,
        'en',
        300,
        true,
        500
      )
      returning channel_id::text as "channelId"
    `,
    [
      `Email IMAP provider universality ${runId}`,
      JSON.stringify({
        host: "imap.provider-universality.local",
        port: 993,
        secure: true,
        username: `imap-user-${runId}`,
        password: `imap-password-${runId}`,
        mailbox: "INBOX",
        searchFrom: "alerts@example.com",
        searchSinceHours: 24,
        maxMessageBytes: 200000,
        bodyPreference: "html",
        maxItemsPerPoll: 10,
      }),
    ]
  );
  return result.rows[0].channelId;
}

function createFakeImapClient(runId: string) {
  let connected = false;
  let loggedOut = false;
  return {
    async connect(): Promise<void> {
      connected = true;
    },
    async mailboxOpen(mailbox: string, options?: { readOnly?: boolean }): Promise<{ uidValidity: string }> {
      assert.equal(connected, true);
      assert.equal(mailbox, "INBOX");
      assert.equal(options?.readOnly, true);
      return { uidValidity: `uidv-${runId}` };
    },
    async *fetch() {
      yield {
        uid: 1,
        envelope: {
          subject: `Ignored IMAP sender ${runId}`,
          messageId: `<ignored-${runId}@example.com>`,
          from: [{ address: "noise@example.com" }],
        },
        internalDate: new Date("2026-04-07T11:00:00.000Z"),
        size: 512,
        source: Buffer.from(`From: noise@example.com
Message-ID: <ignored-${runId}@example.com>
Subject: Ignored IMAP sender ${runId}
Content-Type: text/plain; charset=utf-8

This message should be skipped by sender filtering.
`),
      };
      yield {
        uid: 2,
        envelope: {
          subject: `IMAP provider story ${runId}`,
          messageId: `<imap-${runId}@example.com>`,
          from: [{ address: "alerts@example.com" }],
        },
        internalDate: new Date("2026-04-07T11:05:00.000Z"),
        size: 1024,
        source: Buffer.from(`From: alerts@example.com
Message-ID: <imap-${runId}@example.com>
Subject: IMAP provider story ${runId}
MIME-Version: 1.0
Content-Type: text/html; charset=utf-8

<html><body><p>IMAP provider body ${runId}</p><a href="https://example.com/imap-${runId}">Read more</a></body></html>
`),
      };
    },
    async logout(): Promise<void> {
      loggedOut = true;
    },
    get loggedOut(): boolean {
      return loggedOut;
    },
  };
}

async function fetchLatestRun(pool: Pool, channelId: string): Promise<FetchRunRow> {
  const result = await pool.query<FetchRunRow>(
    `
      select
        outcome_kind as "outcomeKind",
        http_status as "httpStatus",
        error_text as "errorMessage",
        provider_metrics_json as "providerMetricsJson"
      from channel_fetch_runs
      where channel_id = $1
      order by started_at desc
      limit 1
    `,
    [channelId]
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error(`Expected a fetch run for channel ${channelId}.`);
  }
  return row;
}

async function countSignalCandidates(pool: Pool, channelId: string): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `
      select count(*)::text as count
      from signal_candidates
      where channel_id = $1
    `,
    [channelId]
  );
  return Number.parseInt(result.rows[0]?.count ?? "0", 10);
}

async function fetchCursor(pool: Pool, channelId: string, cursorType: string): Promise<{
  cursorValue: string | null;
  cursorJson: Record<string, unknown> | null;
}> {
  const result = await pool.query<{
    cursorValue: string | null;
    cursorJson: Record<string, unknown> | null;
  }>(
    `
      select
        cursor_value as "cursorValue",
        cursor_json as "cursorJson"
      from fetch_cursors
      where channel_id = $1
        and cursor_type = $2
      limit 1
    `,
    [channelId, cursorType]
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error(`Expected cursor ${cursorType} for channel ${channelId}.`);
  }
  return row;
}

async function cleanupSmokeArtifacts(pool: Pool, channelIds: string[]): Promise<void> {
  if (channelIds.length === 0) {
    return;
  }

  const signalCandidateIds = (
    await pool.query<{ docId: string }>(
      `
        select doc_id::text as "docId"
        from signal_candidates
        where channel_id = any($1::uuid[])
      `,
      [channelIds]
    )
  ).rows.map((row) => row.docId);

  if (signalCandidateIds.length > 0) {
    await pool.query(
      `
        delete from sequence_task_runs
        where run_id in (
          select run_id
          from sequence_runs
          where context_json ->> 'doc_id' = any($1::text[])
        )
      `,
      [signalCandidateIds]
    );
    await pool.query(
      `
        delete from sequence_runs
        where context_json ->> 'doc_id' = any($1::text[])
      `,
      [signalCandidateIds]
    );
    await pool.query(
      `
        delete from outbox_events
        where aggregate_id::text = any($1::text[])
      `,
      [signalCandidateIds]
    );
  }

  await pool.query(
    `
      delete from signal_candidates
      where channel_id = any($1::uuid[])
    `,
    [channelIds]
  );
  await pool.query(
    `
      delete from source_channels
      where channel_id = any($1::uuid[])
    `,
    [channelIds]
  );
}

async function main(): Promise<void> {
  const runId = randomUUID().slice(0, 8);
  const apiAuthorizationHeader = `Bearer api-${runId}`;
  const apiCustomHeader = `fixture-${runId}`;
  const fixtureState: FixtureState = {
    apiAuthorizationHeaders: [],
    apiCustomHeaders: [],
    apiBodies: [],
  };
  const config = loadFetchersConfig();
  const pool = createPgPool(config);
  const service = new RssFetcherService(pool, config);
  const internals = service as unknown as ServiceInternals;
  const channelIds: string[] = [];
  let apiFixtureServer: Awaited<ReturnType<typeof startApiFixtureServer>> | null = null;

  try {
    apiFixtureServer = await startApiFixtureServer({
      runId,
      authorizationHeader: apiAuthorizationHeader,
      customHeader: apiCustomHeader,
      state: fixtureState,
    });
    const apiChannelId = await seedApiChannel(pool, {
      runId,
      fetchUrl: apiFixtureServer.apiUrl,
      authorizationHeader: apiAuthorizationHeader,
      customHeader: apiCustomHeader,
    });
    channelIds.push(apiChannelId);

    const imapChannelId = await seedEmailImapChannel(pool, runId);
    channelIds.push(imapChannelId);

    await service.pollChannel(apiChannelId);
    const apiRun = await fetchLatestRun(pool, apiChannelId);
    assert.equal(apiRun.outcomeKind, "new_content");
    assert.equal(apiRun.httpStatus, 200);
    assert.equal(await countSignalCandidates(pool, apiChannelId), 2);
    assert.deepEqual(
      fixtureState.apiAuthorizationHeaders,
      [apiAuthorizationHeader, apiAuthorizationHeader],
      "Expected both API pages to receive the configured Authorization header."
    );
    assert.deepEqual(
      fixtureState.apiCustomHeaders,
      [apiCustomHeader, apiCustomHeader],
      "Expected both API pages to receive the configured provider header."
    );
    assert.deepEqual(
      fixtureState.apiBodies,
      [{ query: `provider-${runId}` }, { query: `provider-${runId}` }],
      "Expected POST pagination to preserve the configured JSON request body."
    );
    const apiPageCursor = await fetchCursor(pool, apiChannelId, "api_page_token");
    assert.equal(apiPageCursor.cursorJson?.provider, "api");
    assert.equal(apiPageCursor.cursorJson?.paginationMode, "next_url");

    const imapChannel = await internals.loadChannelById(imapChannelId);
    assert.ok(imapChannel, "Expected the seeded IMAP channel to load.");
    const fakeClient = createFakeImapClient(runId);
    await pollEmailImapProviderChannel(imapChannel, new Date().toISOString(), {
      loadCursorMap: internals.loadCursorMap.bind(service),
      persistInputsWithPreflight: internals.persistInputsWithPreflight.bind(service),
      markChannelSuccess: internals.markChannelSuccess.bind(service),
      createClient: () => fakeClient,
    });
    assert.equal(fakeClient.loggedOut, true);

    const imapRun = await fetchLatestRun(pool, imapChannelId);
    assert.equal(imapRun.outcomeKind, "new_content");
    assert.equal(await countSignalCandidates(pool, imapChannelId), 1);
    assert.equal(imapRun.providerMetricsJson?.provider, "email_imap");
    assert.equal(imapRun.providerMetricsJson?.scannedCount, 2);
    assert.equal(imapRun.providerMetricsJson?.selectedCount, 1);
    assert.equal(imapRun.providerMetricsJson?.skippedSenderCount, 1);
    const imapCursor = await fetchCursor(pool, imapChannelId, "imap_uid");
    assert.equal(imapCursor.cursorValue, "2");
    assert.equal(imapCursor.cursorJson?.uidValidity, `uidv-${runId}`);

    console.log(
      JSON.stringify(
        {
          status: "provider-universality-ok",
          providersVerified: ["api", "email_imap"],
          apiChannelId,
          imapChannelId,
          apiSignalCandidates: 2,
          imapSignalCandidates: 1,
        },
        null,
        2
      )
    );
  } finally {
    try {
      await cleanupSmokeArtifacts(pool, channelIds);
    } finally {
      await apiFixtureServer?.close().catch(() => undefined);
      await pool.end();
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

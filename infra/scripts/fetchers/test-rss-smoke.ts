import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Pool } from "pg";

import { loadFetchersConfig } from "../../../services/fetchers/src/config";
import { createPgPool } from "../../../services/fetchers/src/db";
import { RssFetcherService } from "../../../services/fetchers/src/fetchers";

interface WaitOptions {
  timeoutMs: number;
  pollIntervalMs: number;
}

interface SmokeOptions {
  duplicatePreflightOnly: boolean;
}

interface RssSmokeProcessingDiagnostics {
  latestSignalCandidate: {
    docId: string;
    processingState: string | null;
    title: string | null;
    ingestedAt: Date | null;
    updatedAt: Date | null;
  } | null;
  latestSequenceRun: {
    runId: string;
    sequenceId: string | null;
    status: string;
    currentTaskKey: string | null;
    errorText: string | null;
    startedAt: Date | null;
    updatedAt: Date | null;
  } | null;
  latestTaskRun: {
    taskRunId: string;
    taskKey: string;
    module: string | null;
    status: string;
    errorText: string | null;
    startedAt: Date | null;
    updatedAt: Date | null;
  } | null;
}

const PROCESSING_STATE_ORDER: Record<string, number> = {
  raw: 0,
  normalized: 1,
  deduped: 2,
  embedded: 3,
  clustered: 4,
  matched: 5,
  notified: 6
};
const RSS_SIGNAL_CANDIDATE_PROCESSING_TIMEOUT_MS = 180000;

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
          Connection: "close",
          ETag: etag,
          "Last-Modified": lastModified
        });
        response.end();
        return;
      }

      response.writeHead(200, {
        "content-type": "application/rss+xml; charset=utf-8",
        Connection: "close",
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
        userAgent: "SignalOpsFetchers/SmokeTest",
        preferContentEncoded: true
      })
    ]
  );

  return result.rows[0].channelId;
}

async function readProcessingDiagnostics(
  pool: Pool,
  channelId: string
): Promise<RssSmokeProcessingDiagnostics> {
  const signalCandidateResult = await pool.query<{
    docId: string;
    processingState: string | null;
    title: string | null;
    ingestedAt: Date | null;
    updatedAt: Date | null;
  }>(
    `
      select
        doc_id::text as "docId",
        processing_state as "processingState",
        title,
        ingested_at as "ingestedAt",
        updated_at as "updatedAt"
      from signal_candidates
      where channel_id = $1
      order by ingested_at desc
      limit 1
    `,
    [channelId]
  );
  const latestSignalCandidate = signalCandidateResult.rows[0] ?? null;

  const sequenceRunResult = await pool.query<{
    runId: string;
    sequenceId: string | null;
    status: string;
    currentTaskKey: string | null;
    errorText: string | null;
    startedAt: Date | null;
    updatedAt: Date | null;
  }>(
    `
      select
        run_id::text as "runId",
        sequence_id::text as "sequenceId",
        status,
        null::text as "currentTaskKey",
        error_text as "errorText",
        started_at as "startedAt",
        coalesce(finished_at, started_at, created_at) as "updatedAt"
      from sequence_runs
      where context_json ->> 'doc_id' in (
        select doc_id::text
        from signal_candidates
        where channel_id = $1
      )
      order by coalesce(finished_at, started_at, created_at) desc
      limit 1
    `,
    [channelId]
  );
  const latestSequenceRun = sequenceRunResult.rows[0] ?? null;

  const taskRunResult = await pool.query<{
    taskRunId: string;
    taskKey: string;
    module: string | null;
    status: string;
    errorText: string | null;
    startedAt: Date | null;
    updatedAt: Date | null;
  }>(
    `
      select
        task_run_id::text as "taskRunId",
        task_key as "taskKey",
        module,
        status,
        error_text as "errorText",
        started_at as "startedAt",
        coalesce(finished_at, started_at, created_at) as "updatedAt"
      from sequence_task_runs
      where run_id in (
        select run_id
        from sequence_runs
        where context_json ->> 'doc_id' in (
          select doc_id::text
          from signal_candidates
          where channel_id = $1
        )
      )
      order by coalesce(finished_at, started_at, created_at) desc
      limit 1
    `,
    [channelId]
  );

  return {
    latestSignalCandidate,
    latestSequenceRun,
    latestTaskRun: taskRunResult.rows[0] ?? null
  };
}

async function waitForProcessedSignalCandidate(pool: Pool, channelId: string): Promise<void> {
  try {
    await waitForCondition(
      async () => {
        const result = await pool.query<{ processingState: string | null }>(
          `
            select processing_state as "processingState"
            from signal_candidates
            where channel_id = $1
            order by ingested_at desc
            limit 1
          `,
          [channelId]
        );

        const processingState = result.rows[0]?.processingState ?? "raw";
        return (
          (PROCESSING_STATE_ORDER[processingState] ?? 0) >= PROCESSING_STATE_ORDER.deduped
        );
      },
      {
        timeoutMs: RSS_SIGNAL_CANDIDATE_PROCESSING_TIMEOUT_MS,
        pollIntervalMs: 500
      }
    );
  } catch (error) {
    const diagnostics = await readProcessingDiagnostics(pool, channelId);
    throw new Error(
      `Timed out waiting for RSS smoke signal_candidate to reach deduped or later. Diagnostics: ${JSON.stringify(diagnostics)}. Cause: ${
        error instanceof Error ? error.message : String(error)
      }`,
      { cause: error }
    );
  }
}

async function assertSmokeRows(
  pool: Pool,
  channelId: string,
  options: SmokeOptions
): Promise<void> {
  const signalCandidateResult = await pool.query<{
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
      from signal_candidates
      where channel_id = $1
    `,
    [channelId]
  );

  if (signalCandidateResult.rowCount !== 1) {
    throw new Error(`Expected exactly one signal_candidate row, found ${signalCandidateResult.rowCount}.`);
  }

  const signal_candidate = signalCandidateResult.rows[0];

  if ((PROCESSING_STATE_ORDER[signal_candidate.processingState] ?? 0) < PROCESSING_STATE_ORDER.deduped) {
    throw new Error(
      `Expected signal_candidate.processing_state to reach deduped or later, got ${signal_candidate.processingState}.`
    );
  }

  if (!options.duplicatePreflightOnly && (!signal_candidate.canonicalDocId || !signal_candidate.familyId)) {
    throw new Error("Expected canonical_doc_id and family_id to be populated.");
  }

  if (signal_candidate.isExactDuplicate || signal_candidate.isNearDuplicate) {
    throw new Error("Expected the first smoke signal_candidate to remain non-duplicate.");
  }

  if (!options.duplicatePreflightOnly) {
    const observationResult = await pool.query<{
      canonicalDocumentId: string | null;
      duplicateKind: string;
      observationState: string;
    }>(
      `
        select
          canonical_document_id::text as "canonicalDocumentId",
          duplicate_kind as "duplicateKind",
          observation_state as "observationState"
        from document_observations
        where
          origin_type = 'signal_candidate'
          and origin_id in (
            select doc_id
            from signal_candidates
            where channel_id = $1
          )
      `,
      [channelId]
    );

    if (observationResult.rowCount !== 1) {
      throw new Error(
        `Expected exactly one document_observations row, found ${observationResult.rowCount}.`
      );
    }

    const observation = observationResult.rows[0];
    if (observation.canonicalDocumentId !== signal_candidate.canonicalDocId) {
      throw new Error("Expected document_observations to point at the signal candidate canonical document.");
    }
    if (observation.duplicateKind !== "canonical") {
      throw new Error(
        `Expected the first observation duplicate_kind to be canonical, got ${observation.duplicateKind}.`
      );
    }
    if (observation.observationState !== "canonicalized") {
      throw new Error(
        `Expected the first observation_state to be canonicalized, got ${observation.observationState}.`
      );
    }

    const canonicalDocumentResult = await pool.query<{
      canonicalUrl: string;
      observationCount: string;
    }>(
      `
        select
          canonical_url as "canonicalUrl",
          observation_count::text as "observationCount"
        from canonical_documents
        where canonical_document_id = $1::uuid
      `,
      [signal_candidate.canonicalDocId]
    );

    if (canonicalDocumentResult.rowCount !== 1) {
      throw new Error(
        `Expected exactly one canonical_documents row, found ${canonicalDocumentResult.rowCount}.`
      );
    }

    const canonicalDocument = canonicalDocumentResult.rows[0];
    if (
      !canonicalDocument.canonicalUrl.startsWith("https://example.com/signal-candidates/smoke-signal_candidate-") ||
      canonicalDocument.canonicalUrl.includes("?")
    ) {
      throw new Error(
        `Expected canonical_documents.canonical_url to preserve the smoke signal_candidate URL, got ${canonicalDocument.canonicalUrl}.`
      );
    }
    if (canonicalDocument.observationCount !== "1") {
      throw new Error(
        `Expected canonical_documents.observation_count to equal 1, got ${canonicalDocument.observationCount}.`
      );
    }
  }

  const externalRefResult = await pool.query<{ count: string }>(
    `
      select count(*)::text as count
      from signal_candidate_external_refs
      where channel_id = $1
    `,
    [channelId]
  );

  if (externalRefResult.rows[0]?.count !== "1") {
    throw new Error("Expected one signal_candidate_external_refs row for the smoke channel.");
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
        aggregate_type = 'signal_candidate'
        and aggregate_id in (
          select doc_id
          from signal_candidates
          where channel_id = $1
        )
        and event_type = 'signal_candidate.ingest.requested'
        and status = 'published'
    `,
    [channelId]
  );

  if (outboxResult.rows[0]?.count !== "1") {
    throw new Error("Expected one published outbox row for signal_candidate.ingest.requested.");
  }

  const suppressedIntermediateResult = await pool.query<{ count: string }>(
    `
      select count(*)::text as count
      from outbox_events
      where
        aggregate_type = 'signal_candidate'
        and aggregate_id in (
          select doc_id
          from signal_candidates
          where channel_id = $1
        )
        and event_type = 'signal_candidate.normalized'
    `,
    [channelId]
  );

  if (suppressedIntermediateResult.rows[0]?.count !== "0") {
    throw new Error("Expected sequence-first runtime to suppress signal_candidate.normalized outbox rows.");
  }

  const sequenceRunResult = await pool.query<{ count: string }>(
    `
      select count(*)::text as count
      from sequence_runs
      where trigger_meta ->> 'eventType' = 'signal_candidate.ingest.requested'
        and context_json ->> 'doc_id' in (
          select doc_id::text
          from signal_candidates
          where channel_id = $1
        )
    `,
    [channelId]
  );

  if (sequenceRunResult.rows[0]?.count !== "1") {
    throw new Error("Expected one sequence_run for the RSS signal_candidate ingest trigger.");
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
  const beforeCounts = await pool.query<{
    signalCandidateCount: string;
    outboxCount: string;
    sequenceRunCount: string;
  }>(
    `
      select
        (
          select count(*)::text
          from signal_candidates
          where channel_id = $1
        ) as "signalCandidateCount",
        (
          select count(*)::text
          from outbox_events
          where
            aggregate_type = 'signal_candidate'
            and aggregate_id in (
              select doc_id
              from signal_candidates
              where channel_id = $1
            )
            and event_type = 'signal_candidate.ingest.requested'
            and status = 'published'
        ) as "outboxCount",
        (
          select count(*)::text
          from sequence_runs
          where trigger_meta ->> 'eventType' = 'signal_candidate.ingest.requested'
            and context_json ->> 'doc_id' in (
              select doc_id::text
              from signal_candidates
              where channel_id = $1
            )
        ) as "sequenceRunCount"
    `,
    [channelId]
  );

  await service.pollChannel(channelId);

  const afterCounts = await pool.query<{
    signalCandidateCount: string;
    outboxCount: string;
    sequenceRunCount: string;
  }>(
    `
      select
        (
          select count(*)::text
          from signal_candidates
          where channel_id = $1
        ) as "signalCandidateCount",
        (
          select count(*)::text
          from outbox_events
          where
            aggregate_type = 'signal_candidate'
            and aggregate_id in (
              select doc_id
              from signal_candidates
              where channel_id = $1
            )
            and event_type = 'signal_candidate.ingest.requested'
            and status = 'published'
        ) as "outboxCount",
        (
          select count(*)::text
          from sequence_runs
          where trigger_meta ->> 'eventType' = 'signal_candidate.ingest.requested'
            and context_json ->> 'doc_id' in (
              select doc_id::text
              from signal_candidates
              where channel_id = $1
            )
        ) as "sequenceRunCount"
    `,
    [channelId]
  );

  if (afterCounts.rows[0]?.signalCandidateCount !== beforeCounts.rows[0]?.signalCandidateCount) {
    throw new Error("Expected RSS refetch to avoid creating duplicate signal_candidate rows.");
  }

  if (afterCounts.rows[0]?.outboxCount !== beforeCounts.rows[0]?.outboxCount) {
    throw new Error("Expected RSS refetch to avoid creating duplicate signal_candidate outbox rows.");
  }

  if (afterCounts.rows[0]?.sequenceRunCount !== beforeCounts.rows[0]?.sequenceRunCount) {
    throw new Error("Expected RSS refetch to avoid creating duplicate sequence runs.");
  }
}

function parseSmokeOptions(argv: readonly string[]): SmokeOptions {
  return {
    duplicatePreflightOnly: argv.includes("--duplicate-preflight-only")
  };
}

async function main(): Promise<void> {
  const options = parseSmokeOptions(process.argv.slice(2));
  const config = loadFetchersConfig();
  const pool = createPgPool(config);
  const service = new RssFetcherService(pool, config);
  const smokeRunId = randomUUID();
  const fixturesDirectory = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../fixtures/fetchers"
  );
  const fixtureXml = (
    await readFile(path.join(fixturesDirectory, "smoke-feed.xml"), "utf8")
  )
    .replaceAll("smoke-item-1", `smoke-item-${smokeRunId}`)
    .replaceAll("Smoke Test SignalCandidate", `Smoke Test SignalCandidate ${smokeRunId}`)
    .replaceAll("smoke-signal_candidate", `smoke-signal_candidate-${smokeRunId}`)
    .replaceAll(
      "Smoke summary for the first phase 2 signal_candidate.",
      `Smoke summary for the first phase 2 signal_candidate ${smokeRunId}.`
    )
    .replaceAll(
      "This signal_candidate should move from raw to normalized and then deduped.",
      `This signal_candidate should move from raw to normalized and then deduped for run ${smokeRunId}.`
    );
  const fixtureServer = await startFixtureServer(fixtureXml);

  try {
    const channelId = await seedSmokeChannel(pool, fixtureServer.url);
    await service.pollChannel(channelId);
    await waitForProcessedSignalCandidate(pool, channelId);
    await assertSmokeRows(pool, channelId, options);
    await assertIdempotentRefetch(service, pool, channelId);
    const modeLabel = options.duplicatePreflightOnly ? "duplicate-preflight" : "full";
    console.log(`RSS smoke test (${modeLabel}) passed for channel ${channelId}.`);
  } finally {
    await fixtureServer.close();
    await pool.end();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});

import { createHash, randomUUID } from "node:crypto";

import type { PoolClient } from "pg";

import { REINDEX_REQUESTED_EVENT } from "@signalops/contracts";

const REINDEX_RUNTIME_OPTION_KEYS = new Set([
  "backfill",
  "contentAnalysis",
  "progress",
  "rebuild",
  "result",
  "selectionProfileSnapshot",
]);
const REINDEX_BATCH_ONLY_OPTION_KEYS = new Set(["batchSize"]);
export type ReindexActiveStatus = "queued" | "running" | "cancel_requested";

export interface QueueReindexJobInput {
  reindexJobId?: string;
  eventId?: string;
  indexName: string;
  jobKind: string;
  optionsJson: Record<string, unknown>;
  requestedByUserId: string | null;
}

export interface QueueReindexJobResult {
  reindexJobId: string;
  eventId: string;
  cancellationKey: string;
  cancelledQueuedCount: number;
  cancellationRequestedCount: number;
}

export interface CancelReindexJobResult {
  reindexJobId: string;
  previousStatus: string;
  status: string;
  changed: boolean;
  terminal: boolean;
}

function normalizeForCancellation(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeForCancellation(item))
      .sort((left, right) => stableStringify(left).localeCompare(stableStringify(right)));
  }
  if (value != null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => (
          !REINDEX_RUNTIME_OPTION_KEYS.has(key) &&
          !REINDEX_BATCH_ONLY_OPTION_KEYS.has(key)
        ))
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nestedValue]) => [key, normalizeForCancellation(nestedValue)])
    );
  }
  return value ?? null;
}

function stableStringify(value: unknown): string {
  if (value != null && typeof value === "object" && !Array.isArray(value)) {
    return JSON.stringify(
      Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, nestedValue]) => [key, normalizeForCancellation(nestedValue)])
      )
    );
  }
  return JSON.stringify(value);
}

export function buildReindexCancellationKey(input: {
  indexName: string;
  jobKind: string;
  optionsJson?: Record<string, unknown>;
}): string {
  const normalizedOptions = stableStringify(normalizeForCancellation(input.optionsJson ?? {}));
  const digest = createHash("sha256").update(normalizedOptions).digest("hex");
  return [
    "reindex",
    input.indexName,
    input.jobKind,
    "sha256",
    digest,
  ].join(":");
}

export async function queueReindexJobWithSupersession(
  client: PoolClient,
  input: QueueReindexJobInput
): Promise<QueueReindexJobResult> {
  const reindexJobId = input.reindexJobId ?? randomUUID();
  const eventId = input.eventId ?? randomUUID();
  const cancellationKey = buildReindexCancellationKey({
    indexName: input.indexName,
    jobKind: input.jobKind,
    optionsJson: input.optionsJson,
  });

  await client.query("select pg_advisory_xact_lock(hashtext($1))", [cancellationKey]);
  await client.query(
    `
      insert into public.reindex_jobs (
        reindex_job_id,
        index_name,
        job_kind,
        options_json,
        requested_by_user_id,
        status,
        cancellation_key
      )
      values ($1, $2, $3, $4::jsonb, $5, 'queued', $6)
    `,
    [
      reindexJobId,
      input.indexName,
      input.jobKind,
      JSON.stringify(input.optionsJson),
      input.requestedByUserId,
      cancellationKey,
    ]
  );

  const cancelledQueued = await client.query(
    `
      update public.reindex_jobs
      set
        status = 'cancelled',
        finished_at = coalesce(finished_at, now()),
        error_text = 'Cancelled because a newer same-lane reindex job was queued.',
        superseded_by_reindex_job_id = $2,
        updated_at = now()
      where cancellation_key = $1
        and reindex_job_id <> $2
        and status = 'queued'
    `,
    [cancellationKey, reindexJobId]
  );
  const cancellationRequested = await client.query(
    `
      update public.reindex_jobs
      set
        status = 'cancel_requested',
        error_text = 'Cancellation requested because a newer same-lane reindex job was queued.',
        superseded_by_reindex_job_id = $2,
        updated_at = now()
      where cancellation_key = $1
        and reindex_job_id <> $2
        and status in ('running', 'cancel_requested')
    `,
    [cancellationKey, reindexJobId]
  );

  await client.query(
    `
      insert into public.outbox_events (
        event_id,
        event_type,
        aggregate_type,
        aggregate_id,
        payload_json
      )
      values ($1, $2, 'reindex_job', $3, $4::jsonb)
    `,
    [
      eventId,
      REINDEX_REQUESTED_EVENT,
      reindexJobId,
      JSON.stringify({
        reindexJobId,
        indexName: input.indexName,
        jobKind: input.jobKind,
        version: 1,
      }),
    ]
  );

  return {
    reindexJobId,
    eventId,
    cancellationKey,
    cancelledQueuedCount: cancelledQueued.rowCount ?? 0,
    cancellationRequestedCount: cancellationRequested.rowCount ?? 0,
  };
}

export async function cancelReindexJob(
  client: PoolClient,
  input: {
    reindexJobId: string;
    reason?: string | null;
  }
): Promise<CancelReindexJobResult> {
  const reason = input.reason?.trim() || "Cancelled by operator.";
  const result = await client.query<{
    status: string;
  }>(
    `
      select status
      from public.reindex_jobs
      where reindex_job_id = $1
      for update
    `,
    [input.reindexJobId]
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error(`Reindex job ${input.reindexJobId} was not found.`);
  }

  if (row.status === "queued") {
    await client.query(
      `
        update public.reindex_jobs
        set
          status = 'cancelled',
          finished_at = coalesce(finished_at, now()),
          error_text = $2,
          updated_at = now()
        where reindex_job_id = $1
      `,
      [input.reindexJobId, reason]
    );
    return {
      reindexJobId: input.reindexJobId,
      previousStatus: row.status,
      status: "cancelled",
      changed: true,
      terminal: true,
    };
  }

  if (row.status === "running") {
    await client.query(
      `
        update public.reindex_jobs
        set
          status = 'cancel_requested',
          error_text = $2,
          updated_at = now()
        where reindex_job_id = $1
      `,
      [input.reindexJobId, reason]
    );
    return {
      reindexJobId: input.reindexJobId,
      previousStatus: row.status,
      status: "cancel_requested",
      changed: true,
      terminal: false,
    };
  }

  if (row.status === "cancel_requested") {
    return {
      reindexJobId: input.reindexJobId,
      previousStatus: row.status,
      status: row.status,
      changed: false,
      terminal: false,
    };
  }

  return {
    reindexJobId: input.reindexJobId,
    previousStatus: row.status,
    status: row.status,
    changed: false,
    terminal: true,
  };
}

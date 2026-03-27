import { randomUUID } from "node:crypto";

import { Queue } from "bullmq";
import {
  LLM_REVIEW_REQUESTED_EVENT,
  NOTIFICATION_FEEDBACK_RECORDED_EVENT,
  REINDEX_REQUESTED_EVENT,
  SEQUENCE_QUEUE
} from "@newsportal/contracts";
import type { Pool } from "pg";

import { loadRelayConfig } from "../config";
import { createPgPool, createRedisConnection } from "../db";
import { waitForPublishedEvent } from "../outbox";
import { OutboxRelay } from "../relay";
import { PostgresSequenceRoutingRepository } from "../sequence-routing";

interface ActiveSequenceRow {
  sequenceId: string;
}

interface SequenceRunRow {
  runId: string;
  sequenceId: string;
  status: string;
  contextJson: Record<string, unknown>;
  triggerMeta: Record<string, unknown>;
}

interface SequenceManagedSmokeInput {
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
  expectedContext: Record<string, unknown>;
  label: string;
}

async function insertOutboxEvent(
  pool: Pool,
  input: {
    eventType: string;
    aggregateType: string;
    aggregateId: string;
    payload: Record<string, unknown>;
  }
): Promise<string> {
  const eventId = randomUUID();

  await pool.query(
    `
      insert into outbox_events (
        event_id,
        event_type,
        aggregate_type,
        aggregate_id,
        payload_json
      )
      values ($1, $2, $3, $4, $5::jsonb)
    `,
    [
      eventId,
      input.eventType,
      input.aggregateType,
      input.aggregateId,
      JSON.stringify(input.payload)
    ]
  );

  return eventId;
}

async function listActiveSequencesByTrigger(
  pool: Pool,
  triggerEvent: string
): Promise<readonly string[]> {
  const result = await pool.query<ActiveSequenceRow>(
    `
      select sequence_id::text as "sequenceId"
      from sequences
      where status = 'active'
        and trigger_event = $1
      order by created_at asc, sequence_id asc
    `,
    [triggerEvent]
  );

  return result.rows.map((row) => row.sequenceId);
}

async function listSequenceRunsForEvent(
  pool: Pool,
  eventId: string
): Promise<readonly SequenceRunRow[]> {
  const result = await pool.query<SequenceRunRow>(
    `
      select
        run_id::text as "runId",
        sequence_id::text as "sequenceId",
        status,
        context_json as "contextJson",
        trigger_meta as "triggerMeta"
      from sequence_runs
      where trigger_meta ->> 'eventId' = $1
      order by created_at asc, run_id asc
    `,
    [eventId]
  );

  return result.rows;
}

function assertRecordContains(
  actual: Record<string, unknown>,
  expected: Record<string, unknown>,
  label: string
): void {
  for (const [key, value] of Object.entries(expected)) {
    if (actual[key] !== value) {
      throw new Error(
        `${label} expected ${key}=${JSON.stringify(value)}, got ${JSON.stringify(actual[key])}.`
      );
    }
  }
}

function expectThinSequencePayload(
  payload: Record<string, unknown>,
  expectedRunId: string,
  expectedSequenceId: string
): void {
  const actualKeys = Object.keys(payload).sort();
  const expectedKeys = ["jobId", "runId", "sequenceId"];

  if (actualKeys.join(",") !== expectedKeys.join(",")) {
    throw new Error(
      `Sequence payload is not thin. Expected keys ${expectedKeys.join(", ")}, got ${actualKeys.join(", ")}.`
    );
  }

  if (
    payload.jobId !== expectedRunId ||
    payload.runId !== expectedRunId ||
    payload.sequenceId !== expectedSequenceId
  ) {
    throw new Error(
      `Sequence payload lost run identity. Expected run=${expectedRunId} sequence=${expectedSequenceId}, got ${JSON.stringify(payload)}.`
    );
  }
}

async function assertSequenceManagedRouting(
  pool: Pool,
  relay: OutboxRelay,
  queue: Queue,
  input: SequenceManagedSmokeInput
): Promise<void> {
  const activeSequenceIds = await listActiveSequencesByTrigger(pool, input.eventType);

  if (activeSequenceIds.length === 0) {
    throw new Error(`Expected at least one active sequence for ${input.eventType}.`);
  }

  const eventId = await insertOutboxEvent(pool, {
    eventType: input.eventType,
    aggregateType: input.aggregateType,
    aggregateId: input.aggregateId,
    payload: input.payload
  });

  await relay.pollOnce();

  const outboxEvent = await waitForPublishedEvent(pool, eventId, 15000);
  if (outboxEvent.status !== "published") {
    throw new Error(
      `${input.label} outbox event ${eventId} finished with status ${outboxEvent.status}: ${outboxEvent.errorMessage ?? "no error message"}`
    );
  }

  const runs = await listSequenceRunsForEvent(pool, eventId);
  if (runs.length !== activeSequenceIds.length) {
    throw new Error(
      `${input.label} expected ${activeSequenceIds.length} sequence runs, got ${runs.length}.`
    );
  }

  for (const run of runs) {
    if (!activeSequenceIds.includes(run.sequenceId)) {
      throw new Error(
        `${input.label} created unexpected sequence ${run.sequenceId} for event ${eventId}.`
      );
    }
    if (run.status !== "pending") {
      throw new Error(`${input.label} run ${run.runId} expected pending status, got ${run.status}.`);
    }

    assertRecordContains(run.contextJson, input.expectedContext, `${input.label} context`);
    assertRecordContains(
      run.contextJson,
      {
        event_id: eventId
      },
      `${input.label} context`
    );
    assertRecordContains(
      run.triggerMeta,
      {
        eventId,
        eventType: input.eventType,
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId
      },
      `${input.label} triggerMeta`
    );

    const job = await queue.getJob(run.runId);
    if (!job) {
      throw new Error(`${input.label} expected q.sequence job ${run.runId} but none was found.`);
    }
    if (job.name !== "sequence.run") {
      throw new Error(`${input.label} expected queue job name sequence.run, got ${job.name}.`);
    }

    expectThinSequencePayload(
      job.data as Record<string, unknown>,
      run.runId,
      run.sequenceId
    );
  }
}

async function main(): Promise<void> {
  const config = loadRelayConfig();
  const pool = createPgPool(config);
  const redis = createRedisConnection(config);
  const relay = new OutboxRelay(pool, redis, config.outboxBatchSize, {
    sequenceRouting: {
      enabled: config.enableSequenceRouting,
      repository: new PostgresSequenceRoutingRepository()
    }
  });
  const sequenceQueue = new Queue(SEQUENCE_QUEUE, { connection: redis });

  try {
    const docId = randomUUID();
    const criterionId = randomUUID();
    const notificationId = randomUUID();
    const userId = randomUUID();
    const promptTemplateId = randomUUID();
    const reindexJobId = randomUUID();

    await assertSequenceManagedRouting(pool, relay, sequenceQueue, {
      eventType: LLM_REVIEW_REQUESTED_EVENT,
      aggregateType: "criterion",
      aggregateId: criterionId,
      payload: {
        docId,
        scope: "criterion",
        targetId: criterionId,
        promptTemplateId,
        version: 1
      },
      expectedContext: {
        doc_id: docId,
        scope: "criterion",
        target_id: criterionId,
        prompt_template_id: promptTemplateId,
        version: 1
      },
      label: "llm.review.requested"
    });

    await assertSequenceManagedRouting(pool, relay, sequenceQueue, {
      eventType: NOTIFICATION_FEEDBACK_RECORDED_EVENT,
      aggregateType: "notification",
      aggregateId: notificationId,
      payload: {
        notificationId,
        docId,
        userId,
        version: 1
      },
      expectedContext: {
        notification_id: notificationId,
        doc_id: docId,
        user_id: userId,
        version: 1
      },
      label: "notification.feedback.recorded"
    });

    await assertSequenceManagedRouting(pool, relay, sequenceQueue, {
      eventType: REINDEX_REQUESTED_EVENT,
      aggregateType: "reindex",
      aggregateId: reindexJobId,
      payload: {
        reindexJobId,
        indexName: "event_cluster_centroids",
        version: 1
      },
      expectedContext: {
        reindex_job_id: reindexJobId,
        index_name: "event_cluster_centroids",
        version: 1
      },
      label: "reindex.requested"
    });

    console.log(
      `Phase 4/5 relay routing smoke passed: LLM review, feedback ingest, and reindex triggers created PostgreSQL-backed sequence runs and thin ${SEQUENCE_QUEUE} jobs.`
    );
  } finally {
    await relay.close();
    await sequenceQueue.close();
    await redis.quit();
    await pool.end();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});

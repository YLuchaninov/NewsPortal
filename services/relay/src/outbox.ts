import { randomUUID } from "node:crypto";

import { FOUNDATION_SMOKE_EVENT } from "@newsportal/contracts";
import type { Pool } from "pg";

interface InsertOutboxEventInput {
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
}

interface OutboxEventRow {
  eventId: string;
  status: "pending" | "published" | "failed";
  publishedAt: string | null;
  errorMessage: string | null;
}

async function insertOutboxEvent(
  pool: Pool,
  input: InsertOutboxEventInput
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

export async function insertFoundationSmokeEvent(pool: Pool): Promise<string> {
  const aggregateId = randomUUID();

  return insertOutboxEvent(pool, {
    eventType: FOUNDATION_SMOKE_EVENT,
    aggregateType: "system",
    aggregateId,
    payload: {
      source: "relay-cli-smoke"
    }
  });
}

async function getOutboxEvent(
  pool: Pool,
  eventId: string
): Promise<OutboxEventRow | null> {
  const result = await pool.query<OutboxEventRow>(
    `
      select
        event_id::text as "eventId",
        status,
        published_at::text as "publishedAt",
        error_message as "errorMessage"
      from outbox_events
      where event_id = $1
    `,
    [eventId]
  );

  return result.rows[0] ?? null;
}

export async function waitForPublishedEvent(
  pool: Pool,
  eventId: string,
  timeoutMs: number
): Promise<OutboxEventRow> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const eventRow = await getOutboxEvent(pool, eventId);

    if (!eventRow) {
      throw new Error(`Outbox event ${eventId} was not found.`);
    }

    if (eventRow.status === "published" || eventRow.status === "failed") {
      return eventRow;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 250);
    });
  }

  throw new Error(`Timed out waiting for outbox event ${eventId} to publish.`);
}

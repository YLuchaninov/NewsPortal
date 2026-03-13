import { randomUUID } from "node:crypto";

import type { PoolClient } from "pg";

export async function insertOutboxEvent(
  client: PoolClient,
  input: {
    eventType: string;
    aggregateType: string;
    aggregateId: string;
    payload: Record<string, unknown>;
  }
): Promise<string> {
  const eventId = randomUUID();

  await client.query(
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

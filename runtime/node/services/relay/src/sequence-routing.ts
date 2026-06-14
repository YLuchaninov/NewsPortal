import type { QueryResultRow } from "pg";

export interface RelaySqlClient {
  query<ResultRow extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[]
  ): Promise<{ rows: ResultRow[] }>;
}

export interface ActiveSequenceRoute {
  sequenceId: string;
}

export interface SequenceRunCreateInput {
  sequenceId: string;
  contextJson: Record<string, unknown>;
  triggerType: "event";
  triggerMeta: Record<string, unknown>;
}

export interface CreatedSequenceRun {
  runId: string;
  sequenceId: string;
}

export interface SequenceRoutingRepository {
  listActiveSequencesByTrigger(
    client: RelaySqlClient,
    triggerEvent: string
  ): Promise<readonly ActiveSequenceRoute[]>;

  createSequenceRun(
    client: RelaySqlClient,
    input: SequenceRunCreateInput
  ): Promise<CreatedSequenceRun>;
}

interface ActiveSequenceRouteRow extends QueryResultRow {
  sequenceId: string;
}

interface CreatedSequenceRunRow extends QueryResultRow {
  runId: string;
  sequenceId: string;
}

export class PostgresSequenceRoutingRepository
  implements SequenceRoutingRepository
{
  async listActiveSequencesByTrigger(
    client: RelaySqlClient,
    triggerEvent: string
  ): Promise<readonly ActiveSequenceRoute[]> {
    const result = await client.query<ActiveSequenceRouteRow>(
      `
        select
          sequence_id::text as "sequenceId"
        from sequences
        where status = 'active'
          and trigger_event = $1
        order by created_at asc, sequence_id asc
      `,
      [triggerEvent]
    );

    return result.rows.map((row) => ({
      sequenceId: row.sequenceId
    }));
  }

  async createSequenceRun(
    client: RelaySqlClient,
    input: SequenceRunCreateInput
  ): Promise<CreatedSequenceRun> {
    const result = await client.query<CreatedSequenceRunRow>(
      `
        insert into sequence_runs (
          sequence_id,
          status,
          context_json,
          trigger_type,
          trigger_meta
        )
        values ($1, 'pending', $2::jsonb, $3, $4::jsonb)
        returning
          run_id::text as "runId",
          sequence_id::text as "sequenceId"
      `,
      [
        input.sequenceId,
        JSON.stringify(input.contextJson),
        input.triggerType,
        JSON.stringify(input.triggerMeta)
      ]
    );

    const row = result.rows[0];

    if (!row) {
      throw new Error(`Failed to create a sequence run for sequence ${input.sequenceId}.`);
    }

    return {
      runId: row.runId,
      sequenceId: row.sequenceId
    };
  }
}

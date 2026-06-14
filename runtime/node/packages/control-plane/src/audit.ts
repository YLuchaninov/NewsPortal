import type { Pool, PoolClient } from "pg";

type Queryable = Pick<Pool, "query"> | Pick<PoolClient, "query">;

export interface AuditLogInput {
  actorUserId: string;
  actionType: string;
  entityType: string;
  entityId: string | null;
  payloadJson: Record<string, unknown>;
}

export async function writeAuditLog(
  queryable: Queryable,
  input: AuditLogInput
): Promise<void> {
  await queryable.query(
    `
      insert into audit_log (
        actor_user_id,
        action_type,
        entity_type,
        entity_id,
        payload_json
      )
      values ($1, $2, $3, $4, $5::jsonb)
    `,
    [
      input.actorUserId,
      input.actionType,
      input.entityType,
      input.entityId,
      JSON.stringify(input.payloadJson),
    ]
  );
}

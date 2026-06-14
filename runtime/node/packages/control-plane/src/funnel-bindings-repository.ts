import type { Pool } from "pg";

import { writeAuditLog } from "./audit";

export async function bindSystemInterestToFunnel(
  pool: Pool,
  actorUserId: string,
  input: {
    funnelId: string;
    interestTemplateId: string;
    laneId?: string | null;
    bindingRole?: string | null;
  }
): Promise<{
  funnelId: string;
  interestTemplateId: string;
  laneId: string | null;
  bindingRole: string;
  bound: boolean;
}> {
  const bindingRole = input.bindingRole ?? "manual_tuning";
  await pool.query(
    `
      insert into funnel_system_interest_bindings (
        funnel_id,
        lane_id,
        interest_template_id,
        binding_role
      )
      values ($1, $2, $3, coalesce($4, 'manual_tuning'))
      on conflict (funnel_id, interest_template_id) do update
      set
        lane_id = coalesce(excluded.lane_id, funnel_system_interest_bindings.lane_id),
        binding_role = excluded.binding_role,
        created_at = funnel_system_interest_bindings.created_at
    `,
    [
      input.funnelId,
      input.laneId ?? null,
      input.interestTemplateId,
      bindingRole,
    ]
  );
  await writeAuditLog(pool, {
    actorUserId,
    actionType: "funnel_system_interest_bound",
    entityType: "operator_funnel",
    entityId: input.funnelId,
    payloadJson: {
      interestTemplateId: input.interestTemplateId,
      laneId: input.laneId ?? null,
      bindingRole,
    },
  });
  return {
    funnelId: input.funnelId,
    interestTemplateId: input.interestTemplateId,
    laneId: input.laneId ?? null,
    bindingRole,
    bound: true,
  };
}

export async function bindTemplateToFunnel(
  pool: Pool,
  actorUserId: string,
  input: {
    funnelId: string;
    promptTemplateId: string;
    laneId?: string | null;
    bindingRole?: string | null;
  }
): Promise<{
  funnelId: string;
  promptTemplateId: string;
  laneId: string | null;
  bindingRole: string;
  bound: boolean;
}> {
  const bindingRole = input.bindingRole ?? "manual_tuning";
  await pool.query(
    `
      insert into funnel_template_bindings (
        funnel_id,
        lane_id,
        prompt_template_id,
        binding_role
      )
      values ($1, $2, $3, coalesce($4, 'manual_tuning'))
      on conflict (funnel_id, prompt_template_id) do update
      set
        lane_id = coalesce(excluded.lane_id, funnel_template_bindings.lane_id),
        binding_role = excluded.binding_role,
        created_at = funnel_template_bindings.created_at
    `,
    [
      input.funnelId,
      input.laneId ?? null,
      input.promptTemplateId,
      bindingRole,
    ]
  );
  await writeAuditLog(pool, {
    actorUserId,
    actionType: "funnel_template_bound",
    entityType: "operator_funnel",
    entityId: input.funnelId,
    payloadJson: {
      promptTemplateId: input.promptTemplateId,
      laneId: input.laneId ?? null,
      bindingRole,
    },
  });
  return {
    funnelId: input.funnelId,
    promptTemplateId: input.promptTemplateId,
    laneId: input.laneId ?? null,
    bindingRole,
    bound: true,
  };
}

export async function bindSourceChannelToFunnel(
  pool: Pool,
  actorUserId: string,
  input: {
    funnelId: string;
    channelId: string;
    laneId?: string | null;
    sourceRole?: string | null;
    bindingRole?: string | null;
  }
): Promise<{
  funnelId: string;
  channelId: string;
  laneId: string | null;
  sourceRole: string;
  bindingRole: string;
  bound: boolean;
}> {
  const sourceRole = input.sourceRole ?? "context_only";
  const bindingRole = input.bindingRole ?? "manual_tuning";
  await pool.query(
    `
      insert into funnel_source_bindings (
        funnel_id,
        lane_id,
        channel_id,
        source_role,
        binding_role
      )
      values ($1, $2, $3, coalesce($4, 'context_only'), coalesce($5, 'manual_tuning'))
      on conflict (funnel_id, channel_id) do update
      set
        lane_id = coalesce(excluded.lane_id, funnel_source_bindings.lane_id),
        source_role = excluded.source_role,
        binding_role = excluded.binding_role,
        created_at = funnel_source_bindings.created_at
    `,
    [
      input.funnelId,
      input.laneId ?? null,
      input.channelId,
      sourceRole,
      bindingRole,
    ]
  );
  await writeAuditLog(pool, {
    actorUserId,
    actionType: "funnel_source_channel_bound",
    entityType: "operator_funnel",
    entityId: input.funnelId,
    payloadJson: {
      channelId: input.channelId,
      laneId: input.laneId ?? null,
      sourceRole,
      bindingRole,
    },
  });
  return {
    funnelId: input.funnelId,
    channelId: input.channelId,
    laneId: input.laneId ?? null,
    sourceRole,
    bindingRole,
    bound: true,
  };
}

export async function bindReindexJobToFunnel(
  pool: Pool,
  actorUserId: string,
  input: {
    funnelId: string;
    reindexJobId: string;
    laneId?: string | null;
    planId?: string | null;
    bindingRole?: string | null;
    verificationTarget?: string | null;
    metadataJson?: Record<string, unknown> | null;
  }
): Promise<{
  funnelId: string;
  reindexJobId: string;
  laneId: string | null;
  planId: string | null;
  bindingRole: string;
  verificationTarget: string;
  bound: boolean;
}> {
  const bindingRole = input.bindingRole ?? "manual_tuning";
  const verificationTarget = input.verificationTarget ?? "replay";
  const metadataJson = input.metadataJson ?? {};
  await pool.query(
    `
      insert into funnel_reindex_job_bindings (
        funnel_id,
        lane_id,
        reindex_job_id,
        plan_id,
        binding_role,
        verification_target,
        metadata_json
      )
      values ($1, $2, $3, $4, coalesce($5, 'manual_tuning'), coalesce($6, 'replay'), $7::jsonb)
      on conflict (funnel_id, reindex_job_id) do update
      set
        lane_id = coalesce(excluded.lane_id, funnel_reindex_job_bindings.lane_id),
        plan_id = coalesce(excluded.plan_id, funnel_reindex_job_bindings.plan_id),
        binding_role = excluded.binding_role,
        verification_target = excluded.verification_target,
        metadata_json = excluded.metadata_json,
        updated_at = now()
    `,
    [
      input.funnelId,
      input.laneId ?? null,
      input.reindexJobId,
      input.planId ?? null,
      bindingRole,
      verificationTarget,
      JSON.stringify(metadataJson),
    ]
  );
  await writeAuditLog(pool, {
    actorUserId,
    actionType: "funnel_reindex_job_bound",
    entityType: "operator_funnel",
    entityId: input.funnelId,
    payloadJson: {
      reindexJobId: input.reindexJobId,
      laneId: input.laneId ?? null,
      planId: input.planId ?? null,
      bindingRole,
      verificationTarget,
    },
  });
  return {
    funnelId: input.funnelId,
    reindexJobId: input.reindexJobId,
    laneId: input.laneId ?? null,
    planId: input.planId ?? null,
    bindingRole,
    verificationTarget,
    bound: true,
  };
}

import type { Pool } from "pg";

import { writeAuditLog } from "./audit";
import type {
  FunnelStatus,
  OperatorFunnelRecord,
  Queryable,
  UpdateOperatorFunnelLaneInput,
} from "./funnel-model";
import { asRecord, iso } from "./funnel-model";

function mapFunnelRow(row: Record<string, unknown>): OperatorFunnelRecord {
  return {
    funnelId: String(row.funnelId ?? row.funnel_id ?? ""),
    name: String(row.name ?? ""),
    goal: String(row.goal ?? ""),
    status: String(row.status ?? "draft") as FunnelStatus,
    ownerUserId: row.ownerUserId == null ? null : String(row.ownerUserId),
    createdFromIdeaJson: asRecord(row.createdFromIdeaJson),
    defaultPolicyJson: asRecord(row.defaultPolicyJson),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    laneCount: Number(row.laneCount ?? 0),
    interestCount: Number(row.interestCount ?? 0),
    sourceCount: Number(row.sourceCount ?? 0),
    templateCount: Number(row.templateCount ?? 0),
    selectedCount: Number(row.selectedCount ?? 0),
    grayCount: Number(row.grayCount ?? 0),
    rejectedCount: Number(row.rejectedCount ?? 0),
  };
}

export async function listOperatorFunnels(
  queryable: Queryable,
  input: {
    status?: string | null;
    page?: number;
    pageSize?: number;
    allowedFunnelIds?: readonly string[] | null;
  } = {}
): Promise<{ items: OperatorFunnelRecord[]; page: number; pageSize: number; total: number }> {
  const page = Math.max(1, Number(input.page ?? 1));
  const pageSize = Math.min(Math.max(1, Number(input.pageSize ?? 25)), 100);
  const status = String(input.status ?? "").trim();
  const params: unknown[] = [];
  const whereParts: string[] = [];
  if (status) {
    whereParts.push(`f.status = $${params.push(status)}`);
  }
  const allowedFunnelIds = Array.isArray(input.allowedFunnelIds)
    ? input.allowedFunnelIds.filter((entry) => String(entry ?? "").trim())
    : [];
  if (allowedFunnelIds.length > 0) {
    whereParts.push(`f.funnel_id = any($${params.push(allowedFunnelIds)}::uuid[])`);
  }
  const where = whereParts.length > 0 ? `where ${whereParts.join(" and ")}` : "";
  const count = await queryable.query<{ total: number }>(
    `select count(*)::int as total from operator_funnels f ${where}`,
    params
  );
  params.push(pageSize, (page - 1) * pageSize);
  const rows = await queryable.query<Record<string, unknown>>(
    `
      select
        f.funnel_id::text as "funnelId",
        f.name,
        f.goal,
        f.status,
        f.owner_user_id::text as "ownerUserId",
        f.created_from_idea_json as "createdFromIdeaJson",
        f.default_policy_json as "defaultPolicyJson",
        f.created_at as "createdAt",
        f.updated_at as "updatedAt",
        coalesce(lanes.count, 0)::int as "laneCount",
        coalesce(interests.count, 0)::int as "interestCount",
        coalesce(sources.count, 0)::int as "sourceCount",
        coalesce(templates.count, 0)::int as "templateCount",
        coalesce(selection.selected_count, 0)::int as "selectedCount",
        coalesce(selection.gray_count, 0)::int as "grayCount",
        coalesce(selection.rejected_count, 0)::int as "rejectedCount"
      from operator_funnels f
      left join lateral (
        select count(*)::int from funnel_lanes l where l.funnel_id = f.funnel_id
      ) lanes on true
      left join lateral (
        select count(*)::int from funnel_system_interest_bindings b where b.funnel_id = f.funnel_id
      ) interests on true
      left join lateral (
        select count(*)::int from funnel_source_bindings b where b.funnel_id = f.funnel_id
      ) sources on true
      left join lateral (
        select count(*)::int from funnel_template_bindings b where b.funnel_id = f.funnel_id
      ) templates on true
      left join lateral (
        select
          count(distinct fsr.doc_id) filter (where fsr.final_decision = 'selected')::int as selected_count,
          count(distinct fsr.doc_id) filter (where fsr.final_decision = 'gray_zone')::int as gray_count,
          count(distinct fsr.doc_id) filter (where fsr.final_decision = 'rejected')::int as rejected_count
        from final_selection_results fsr
        join interest_filter_results ifr
          on ifr.doc_id = fsr.doc_id
          and ifr.filter_scope = 'system_criterion'
        join criteria c on c.criterion_id = ifr.criterion_id
        join funnel_system_interest_bindings b
          on b.interest_template_id = c.source_interest_template_id
        where b.funnel_id = f.funnel_id
      ) selection on true
      ${where}
      order by f.updated_at desc, f.created_at desc
      limit $${params.length - 1} offset $${params.length}
    `,
    params
  );
  return {
    items: rows.rows.map(mapFunnelRow),
    page,
    pageSize,
    total: Number(count.rows[0]?.total ?? 0),
  };
}

export async function readOperatorFunnel(
  queryable: Queryable,
  funnelId: string
): Promise<Record<string, unknown> | null> {
  const result = await queryable.query<Record<string, unknown>>(
    `
      select
        f.funnel_id::text as "funnelId",
        f.name,
        f.goal,
        f.status,
        f.owner_user_id::text as "ownerUserId",
        f.created_from_idea_json as "createdFromIdeaJson",
        f.default_policy_json as "defaultPolicyJson",
        f.created_at as "createdAt",
        f.updated_at as "updatedAt",
        coalesce(
          (
            select jsonb_agg(
              jsonb_build_object(
                'laneId', l.lane_id,
                'name', l.name,
                'laneType', l.lane_type,
                'routingMode', l.routing_mode,
                'policy', l.policy_json,
                'evidenceContract', l.evidence_contract_json
              )
              order by l.created_at
            )
            from funnel_lanes l
            where l.funnel_id = f.funnel_id
          ),
          '[]'::jsonb
        ) as lanes,
        coalesce(
          (
            select jsonb_agg(
              jsonb_build_object(
                'interestTemplateId', b.interest_template_id,
                'laneId', b.lane_id,
                'bindingRole', b.binding_role,
                'name', it.name,
                'isActive', it.is_active
              )
              order by it.updated_at desc
            )
            from funnel_system_interest_bindings b
            join interest_templates it on it.interest_template_id = b.interest_template_id
            where b.funnel_id = f.funnel_id
          ),
          '[]'::jsonb
        ) as "systemInterests",
        coalesce(
          (
            select jsonb_agg(
              jsonb_build_object(
                'channelId', b.channel_id,
                'laneId', b.lane_id,
                'sourceRole', b.source_role,
                'bindingRole', b.binding_role,
                'name', sc.name,
                'providerType', sc.provider_type,
                'isActive', sc.is_active
              )
              order by sc.updated_at desc
            )
            from funnel_source_bindings b
            join source_channels sc on sc.channel_id = b.channel_id
            where b.funnel_id = f.funnel_id
          ),
          '[]'::jsonb
        ) as sources,
        coalesce(
          (
            select jsonb_agg(
              jsonb_build_object(
                'promptTemplateId', b.prompt_template_id,
                'laneId', b.lane_id,
                'bindingRole', b.binding_role,
                'name', t.name,
                'scope', t.scope,
                'purpose', t.purpose,
                'isActive', t.is_active
              )
              order by t.updated_at desc
            )
            from funnel_template_bindings b
            join llm_prompt_templates t on t.prompt_template_id = b.prompt_template_id
            where b.funnel_id = f.funnel_id
          ),
          '[]'::jsonb
        ) as templates
      from operator_funnels f
      where f.funnel_id = $1
      limit 1
    `,
    [funnelId]
  );
  return result.rows[0] ?? null;
}

export async function createOperatorFunnel(
  pool: Pool,
  actorUserId: string,
  input: {
    name: string;
    goal?: string;
    status?: FunnelStatus;
    createdFromIdeaJson?: Record<string, unknown>;
    defaultPolicyJson?: Record<string, unknown>;
  }
): Promise<{ funnelId: string }> {
  const result = await pool.query<{ funnel_id: string }>(
    `
      insert into operator_funnels (
        name,
        goal,
        status,
        owner_user_id,
        created_from_idea_json,
        default_policy_json
      )
      values ($1, $2, $3, $4, $5::jsonb, $6::jsonb)
      returning funnel_id::text
    `,
    [
      input.name,
      input.goal ?? "",
      input.status ?? "draft",
      actorUserId,
      JSON.stringify(input.createdFromIdeaJson ?? {}),
      JSON.stringify(input.defaultPolicyJson ?? {}),
    ]
  );
  const funnelId = result.rows[0]?.funnel_id ?? "";
  await writeAuditLog(pool, {
    actorUserId,
    actionType: "operator_funnel_created",
    entityType: "operator_funnel",
    entityId: funnelId,
    payloadJson: { name: input.name, status: input.status ?? "draft" },
  });
  return { funnelId };
}

export async function updateOperatorFunnel(
  pool: Pool,
  actorUserId: string,
  input: {
    funnelId: string;
    name?: string;
    goal?: string;
    status?: FunnelStatus;
    defaultPolicyJson?: Record<string, unknown>;
  }
): Promise<{ funnelId: string; updated: boolean }> {
  const current = await readOperatorFunnel(pool, input.funnelId);
  if (!current) {
    return { funnelId: input.funnelId, updated: false };
  }
  await pool.query(
    `
      update operator_funnels
      set
        name = coalesce($2, name),
        goal = coalesce($3, goal),
        status = coalesce($4, status),
        default_policy_json = coalesce($5::jsonb, default_policy_json),
        updated_at = now()
      where funnel_id = $1
    `,
    [
      input.funnelId,
      input.name ?? null,
      input.goal ?? null,
      input.status ?? null,
      input.defaultPolicyJson ? JSON.stringify(input.defaultPolicyJson) : null,
    ]
  );
  await writeAuditLog(pool, {
    actorUserId,
    actionType: "operator_funnel_updated",
    entityType: "operator_funnel",
    entityId: input.funnelId,
    payloadJson: {
      name: input.name,
      goal: input.goal,
      status: input.status,
    },
  });
  return { funnelId: input.funnelId, updated: true };
}

export async function updateOperatorFunnelLane(
  pool: Pool,
  actorUserId: string,
  input: UpdateOperatorFunnelLaneInput
): Promise<{
  funnelId: string;
  laneId: string;
  updated: boolean;
  lane: Record<string, unknown> | null;
}> {
  const current = await pool.query<Record<string, unknown>>(
    `
      select
        lane_id::text as "laneId",
        funnel_id::text as "funnelId",
        name,
        lane_type as "laneType",
        routing_mode as "routingMode",
        policy_json as "policyJson",
        evidence_contract_json as "evidenceContractJson"
      from funnel_lanes
      where funnel_id = $1
        and lane_id = $2
      limit 1
    `,
    [input.funnelId, input.laneId]
  );
  const before = current.rows[0] ?? null;
  if (!before) {
    return { funnelId: input.funnelId, laneId: input.laneId, updated: false, lane: null };
  }

  const result = await pool.query<Record<string, unknown>>(
    `
      update funnel_lanes
      set
        name = coalesce($3, name),
        lane_type = coalesce($4, lane_type),
        routing_mode = coalesce($5, routing_mode),
        policy_json = coalesce($6::jsonb, policy_json),
        evidence_contract_json = coalesce($7::jsonb, evidence_contract_json),
        updated_at = now()
      where funnel_id = $1
        and lane_id = $2
      returning
        lane_id::text as "laneId",
        funnel_id::text as "funnelId",
        name,
        lane_type as "laneType",
        routing_mode as "routingMode",
        policy_json as "policyJson",
        evidence_contract_json as "evidenceContractJson",
        updated_at as "updatedAt"
    `,
    [
      input.funnelId,
      input.laneId,
      input.name ?? null,
      input.laneType ?? null,
      input.routingMode ?? null,
      input.policyJson ? JSON.stringify(input.policyJson) : null,
      input.evidenceContractJson ? JSON.stringify(input.evidenceContractJson) : null,
    ]
  );
  const lane = result.rows[0] ?? null;
  await writeAuditLog(pool, {
    actorUserId,
    actionType: "operator_funnel_lane_updated",
    entityType: "operator_funnel_lane",
    entityId: input.laneId,
    payloadJson: {
      funnelId: input.funnelId,
      before,
      after: lane,
    },
  });
  return { funnelId: input.funnelId, laneId: input.laneId, updated: Boolean(lane), lane };
}

export async function archiveOperatorFunnel(
  pool: Pool,
  actorUserId: string,
  funnelId: string
): Promise<{ funnelId: string; archived: boolean }> {
  const result = await updateOperatorFunnel(pool, actorUserId, {
    funnelId,
    status: "archived",
  });
  return { funnelId, archived: result.updated };
}

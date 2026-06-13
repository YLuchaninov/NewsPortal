import { createHash } from "node:crypto";

import type { Pool, PoolClient } from "pg";

import { writeAuditLog } from "./audit";

type Queryable = Pick<Pool, "query"> | Pick<PoolClient, "query">;

export const FUNNEL_LANE_TYPES = [
  "explicit_marker",
  "hidden_intent",
  "mixed_split",
  "context_only",
  "unknown",
] as const;

export const FUNNEL_ROUTING_MODES = [
  "direct_select",
  "evidence_led_review",
  "llm_approved",
  "hold_for_calibration",
  "acquisition_only",
] as const;

export const FUNNEL_STATUSES = ["draft", "active", "paused", "archived"] as const;

export type FunnelLaneType = (typeof FUNNEL_LANE_TYPES)[number];
export type FunnelRoutingMode = (typeof FUNNEL_ROUTING_MODES)[number];
export type FunnelStatus = (typeof FUNNEL_STATUSES)[number];
export type FunnelPlanValidationStatus = "ready" | "blocked" | "requires_operator_choice";

export interface OperatorFunnelRecord {
  funnelId: string;
  name: string;
  goal: string;
  status: FunnelStatus;
  ownerUserId: string | null;
  createdFromIdeaJson: Record<string, unknown>;
  defaultPolicyJson: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  laneCount: number;
  interestCount: number;
  sourceCount: number;
  templateCount: number;
  selectedCount: number;
  grayCount: number;
  rejectedCount: number;
}

export interface FunnelLaneDraft {
  name: string;
  laneType: FunnelLaneType;
  routingMode: FunnelRoutingMode;
  policy: Record<string, unknown>;
  evidenceContract: Record<string, unknown>;
}

export interface UpdateOperatorFunnelLaneInput {
  funnelId: string;
  laneId: string;
  name?: string;
  laneType?: FunnelLaneType;
  routingMode?: FunnelRoutingMode;
  policyJson?: Record<string, unknown>;
  evidenceContractJson?: Record<string, unknown>;
}

export interface FunnelPlanIssue {
  severity: "info" | "warning" | "error";
  code: string;
  message: string;
  path?: string;
  guidance?: string;
}

export interface FunnelPlanValidationResult {
  status: FunnelPlanValidationStatus;
  liveStateHash: string;
  blockers: FunnelPlanIssue[];
  warnings: FunnelPlanIssue[];
  infos: FunnelPlanIssue[];
  nextActions: string[];
}

export interface FunnelAutoplanResult {
  readOnly: true;
  generatedAt: string;
  planFingerprint: string;
  liveStateHash: string;
  operatorExperience: "novice" | "expert";
  funnelId: string | null;
  funnelDraft: {
    name: string;
    goal: string;
    status: FunnelStatus;
  } | null;
  suggestedAction: "create_new" | "attach_existing" | "split_or_choose" | "calibrate";
  lanes: FunnelLaneDraft[];
  systemInterestDrafts: Array<Record<string, unknown>>;
  llmTemplateDrafts: Array<Record<string, unknown>>;
  sourcePlan: Record<string, unknown>;
  replayPlan: Record<string, unknown>;
  verificationPlan: Record<string, unknown>;
  doNotDoYet: string[];
  blockedUntil: string[];
  manualTuningPath: Record<string, unknown>;
}

export interface StageFunnelPlanResult {
  status: "staged" | "blocked";
  planId: string | null;
  planFingerprint: string;
  liveStateHash: string;
  validation: FunnelPlanValidationResult;
  lanes?: Array<{
    laneId: string;
    name: string;
    laneType: FunnelLaneType;
    routingMode: FunnelRoutingMode;
  }>;
  nextReadBack: Array<{ toolName: string; argumentsTemplate: Record<string, unknown> }>;
}

function iso(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  const date = new Date(String(value ?? ""));
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry ?? "").trim()).filter(Boolean);
  }
  return String(value ?? "")
    .split(/\r?\n|,/u)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeText(value: unknown): string {
  return String(value ?? "").toLowerCase().replace(/\s+/gu, " ").trim();
}

function titleFromIdea(idea: string): string {
  const trimmed = idea.trim();
  if (!trimmed) {
    return "Untitled funnel";
  }
  const compact = trimmed.length > 72 ? `${trimmed.slice(0, 69).trim()}...` : trimmed;
  return compact[0]?.toUpperCase() + compact.slice(1);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function hashValue(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function isLabelLikeCue(value: unknown): boolean {
  const cue = String(value ?? "").trim();
  return Boolean(cue) && /^[a-z0-9]+(?:[_-][a-z0-9]+)+$/iu.test(cue);
}

function hasAny(text: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

const EXPLICIT_PATTERNS = [
  /\brequest\s+for\s+(proposal|quote|vendor|supplier|partner)\b/iu,
  /\b(rfp|rfq|tender|bid|procurement|proposal|vendor\s+needed|supplier\s+needed)\b/iu,
  /\b(looking\s+for|seeking|need|needs)\s+(a\s+)?(vendor|supplier)\b/iu,
];

const HIDDEN_PATTERNS = [
  /\b(long[-\s]?term|legacy|migration|moderni[sz]ation|integration|capacity|scale|cost\s+pressure|replace|takeover|implementation|partner|developer|development|delivery)\b/iu,
  /\b(struggling|blocked|delayed|backlog|support\s+burden|technical\s+debt|manual\s+process)\b/iu,
];

const CONTEXT_PATTERNS = [
  /\b(report|analysis|trend|market|funding|launch|partnership|case\s+study|thought\s+leadership|tutorial|guide)\b/iu,
];

function classifyIdea(idea: string): FunnelLaneType[] {
  const text = normalizeText(idea);
  if (!text) {
    return ["unknown"];
  }
  const explicit = hasAny(text, EXPLICIT_PATTERNS);
  const hidden = hasAny(text, HIDDEN_PATTERNS);
  const context = hasAny(text, CONTEXT_PATTERNS);
  if (explicit && hidden) {
    return ["explicit_marker", "hidden_intent"];
  }
  if (explicit) {
    return ["explicit_marker"];
  }
  if (hidden) {
    return ["hidden_intent"];
  }
  if (context) {
    return ["context_only"];
  }
  return ["unknown"];
}

function laneDefaults(laneType: FunnelLaneType): Pick<FunnelLaneDraft, "routingMode" | "policy" | "evidenceContract"> {
  if (laneType === "explicit_marker") {
    return {
      routingMode: "evidence_led_review",
      policy: {
        signalVisibility: "explicit_marker",
        autoSelectMode: "evidence_or_llm",
        autoSelectMinPositiveGroups: 3,
        autoSelectMinCueHits: 4,
        autoSelectRequiresNoNoise: true,
        autoSelectRequiresNoTechnicalVeto: true,
        llmReviewMode: "optional_high_value_only",
      },
      evidenceContract: {
        requiresIndependentEvidenceGroups: true,
        rejectsContextOnlyEvidence: true,
      },
    };
  }
  if (laneType === "hidden_intent") {
    return {
      routingMode: "llm_approved",
      policy: {
        signalVisibility: "hidden_intent",
        autoSelectMode: "llm_approved",
        autoSelectMinPositiveGroups: 2,
        autoSelectMinCueHits: 3,
        autoSelectRequiresNoNoise: true,
        autoSelectRequiresNoTechnicalVeto: true,
        llmReviewMode: "always",
      },
      evidenceContract: {
        deterministicEvidenceCanRecoverToReview: true,
        selectedRequiresLlmApprove: true,
      },
    };
  }
  if (laneType === "context_only") {
    return {
      routingMode: "acquisition_only",
      policy: {
        signalVisibility: "unknown",
        autoSelectMode: "disabled",
        llmReviewMode: "disabled",
      },
      evidenceContract: {
        selectedAlone: false,
        requiresDownstreamLaneMatch: true,
      },
    };
  }
  if (laneType === "mixed_split") {
    return {
      routingMode: "hold_for_calibration",
      policy: {
        signalVisibility: "mixed",
        autoSelectMode: "disabled",
        llmReviewMode: "optional_high_value_only",
      },
      evidenceContract: {
        splitRequired: true,
      },
    };
  }
  return {
    routingMode: "hold_for_calibration",
    policy: {
      signalVisibility: "unknown",
      autoSelectMode: "disabled",
      llmReviewMode: "disabled",
    },
    evidenceContract: {
      calibrationRequired: true,
    },
  };
}

function buildLaneDraft(laneType: FunnelLaneType): FunnelLaneDraft {
  const defaults = laneDefaults(laneType);
  const label = laneType.replace(/_/gu, " ");
  return {
    name: label[0]?.toUpperCase() + label.slice(1),
    laneType,
    ...defaults,
  };
}

function isFunnelLaneType(value: string): value is FunnelLaneType {
  return FUNNEL_LANE_TYPES.includes(value as FunnelLaneType);
}

function isFunnelRoutingMode(value: string): value is FunnelRoutingMode {
  return FUNNEL_ROUTING_MODES.includes(value as FunnelRoutingMode);
}

function readPlanLaneDrafts(plan: Record<string, unknown>): FunnelLaneDraft[] {
  const lanes = Array.isArray(plan.lanes) ? plan.lanes : [];
  return lanes.flatMap((laneValue): FunnelLaneDraft[] => {
    const lane = asRecord(laneValue);
    const laneTypeValue = String(lane.laneType ?? lane.lane_type ?? "").trim();
    if (!isFunnelLaneType(laneTypeValue)) {
      return [];
    }
    const defaults = laneDefaults(laneTypeValue);
    const routingModeValue = String(lane.routingMode ?? lane.routing_mode ?? defaults.routingMode).trim();
    const routingMode = isFunnelRoutingMode(routingModeValue)
      ? routingModeValue
      : defaults.routingMode;
    const name = String(lane.name ?? buildLaneDraft(laneTypeValue).name).trim();
    return [
      {
        name: name || buildLaneDraft(laneTypeValue).name,
        laneType: laneTypeValue,
        routingMode,
        policy: { ...defaults.policy, ...asRecord(lane.policy) },
        evidenceContract: {
          ...defaults.evidenceContract,
          ...asRecord(lane.evidenceContract ?? lane.evidence_contract),
        },
      },
    ];
  });
}

function buildCandidateSignalGroups(laneType: FunnelLaneType): {
  positive: Array<Record<string, unknown>>;
  negative: Array<Record<string, unknown>>;
} {
  if (laneType === "explicit_marker") {
    return {
      positive: [
        { name: "direct_request", tier: "buyer_intent", cues: ["looking for vendor", "need a supplier", "request for proposal"] },
        { name: "procurement_process", tier: "project_intent", cues: ["submit proposal", "deadline for bids", "scope of work"] },
        { name: "delivery_object", tier: "project_intent", cues: ["implementation partner", "build and maintain", "project delivery"] },
      ],
      negative: [
        { name: "seller_marketing", tier: "context", cues: ["case study", "we help companies", "our services"] },
        { name: "directory_wrapper", tier: "context", cues: ["browse vendors", "top companies", "category page"] },
      ],
    };
  }
  if (laneType === "hidden_intent") {
    return {
      positive: [
        { name: "operational_pressure", tier: "buyer_intent", cues: ["manual process", "delivery backlog", "support burden"] },
        { name: "change_object", tier: "project_intent", cues: ["legacy migration", "system integration", "modernization project"] },
        { name: "external_partner_fit", tier: "project_intent", cues: ["long-term partner", "implementation support", "delivery partner"] },
      ],
      negative: [
        { name: "generic_commentary", tier: "context", cues: ["best practices", "tutorial", "market trends"] },
        { name: "hiring_noise", tier: "context", cues: ["we are hiring", "job opening", "join our team"] },
      ],
    };
  }
  return {
    positive: [
      { name: "representative_evidence", tier: "context", cues: ["observable cue from candidate text"] },
    ],
    negative: [
      { name: "near_miss_noise", tier: "context", cues: ["generic commentary", "navigation page"] },
    ],
  };
}

export async function computeFunnelLiveStateHash(queryable: Queryable): Promise<string> {
  const result = await queryable.query<Record<string, unknown>>(
    `
      select
        (select count(*)::int from operator_funnels) as "funnelCount",
        (select count(*)::int from funnel_lanes) as "laneCount",
        (select count(*)::int from interest_templates) as "interestCount",
        (select count(*)::int from llm_prompt_templates) as "templateCount",
        (select count(*)::int from source_channels) as "channelCount",
        (select count(*)::int from final_selection_results) as "selectionResultCount",
        greatest(
          coalesce((select max(updated_at) from operator_funnels), 'epoch'::timestamptz),
          coalesce((select max(updated_at) from funnel_lanes), 'epoch'::timestamptz),
          coalesce((select max(updated_at) from interest_templates), 'epoch'::timestamptz),
          coalesce((select max(updated_at) from llm_prompt_templates), 'epoch'::timestamptz),
          coalesce((select max(updated_at) from source_channels), 'epoch'::timestamptz)
        ) as "maxUpdatedAt"
    `
  );
  return hashValue(result.rows[0] ?? {});
}

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

export async function buildOperatorFunnelAutoplan(
  queryable: Queryable,
  input: {
    idea?: unknown;
    funnelId?: unknown;
    operatorExperience?: unknown;
  }
): Promise<FunnelAutoplanResult> {
  const idea = String(input.idea ?? "").trim();
  const operatorExperience =
    String(input.operatorExperience ?? "novice").trim() === "expert" ? "expert" : "novice";
  const funnelId = String(input.funnelId ?? "").trim() || null;
  const liveStateHash = await computeFunnelLiveStateHash(queryable);
  const laneTypes = classifyIdea(idea);
  const lanes = laneTypes.map(buildLaneDraft);
  const primaryLaneType = laneTypes[0] ?? "unknown";
  const groups = buildCandidateSignalGroups(primaryLaneType);
  const title = titleFromIdea(idea);
  const planCore = {
    version: "2.0",
    idea,
    funnelId,
    lanes,
    operatorExperience,
    generatedAt: new Date().toISOString(),
  };
  const planFingerprint = hashValue({ liveStateHash, planCore });
  const requiresLlmReview = lanes.some((lane) => lane.routingMode === "llm_approved");
  return {
    readOnly: true,
    generatedAt: planCore.generatedAt,
    planFingerprint,
    liveStateHash,
    operatorExperience,
    funnelId,
    funnelDraft: funnelId
      ? null
      : {
          name: title,
          goal: idea,
          status: "draft",
        },
    suggestedAction:
      laneTypes.length > 1 ? "split_or_choose" : primaryLaneType === "unknown" ? "calibrate" : funnelId ? "attach_existing" : "create_new",
    lanes,
    systemInterestDrafts: lanes.map((lane) => ({
      name: `${title} / ${lane.name}`,
      description: idea || `Autopilot generated ${lane.name} lane.`,
      positive_texts: [idea || "Representative item-level evidence for this funnel lane."],
      negative_texts: ["Generic commentary without active item-level evidence."],
      must_have_terms: [],
      short_tokens_required: [],
      allowed_content_kinds: ["editorial", "listing", "document", "data_file", "api_payload"],
      candidate_positive_signal_groups: groups.positive,
      candidate_negative_signal_groups: groups.negative,
      selection_profile_signal_visibility: lane.policy.signalVisibility,
      selection_profile_auto_select_mode: lane.policy.autoSelectMode,
      selection_profile_llm_review_mode: lane.policy.llmReviewMode,
      selection_profile_auto_select_min_positive_groups: lane.policy.autoSelectMinPositiveGroups,
      selection_profile_auto_select_min_cue_hits: lane.policy.autoSelectMinCueHits,
      selection_profile_auto_select_requires_no_noise: lane.policy.autoSelectRequiresNoNoise,
      selection_profile_auto_select_requires_no_technical_veto:
        lane.policy.autoSelectRequiresNoTechnicalVeto,
    })),
    llmTemplateDrafts: requiresLlmReview
      ? [
          {
            name: `${title} selection review`,
            scope: "criteria",
            purpose: "selection_review",
            templateText:
              'Review this candidate for the configured funnel lane. Return JSON only: {"decision":"approve|reject|uncertain","score":0.0,"reason":"..."}.\nTitle: {title}\nLead: {lead}\nBody: {body}\nContext: {context}',
          },
        ]
      : [],
    sourcePlan: {
      sourceRoles: [
        "direct_intent",
        "formal_notice",
        "community_hidden_signal",
        "context_only",
        "negative_control",
        "adapter_required",
        "technical_repair",
      ],
      guidance:
        "Sources can be shared acquisition inventory, but sourceRole is bound per funnel and is not semantic proof.",
    },
    replayPlan: {
      mode: "bounded",
      maxDocIdsPerChunk: requiresLlmReview ? 25 : 50,
      fullReplayRequiresOverride: true,
      tool: "maintenance.reindex.request",
    },
    verificationPlan: {
      tools: [
        "operator.funnel.verify",
        "operator.report.verify",
        "operator.selection.precision_audit",
        "signal_candidates.holds.summary",
      ],
    },
    doNotDoYet: [
      "Do not broaden hidden lanes with hard keyword gates.",
      "Do not treat source acquisition proof as selected-signal proof.",
      "Do not run full replay before bounded replay proves the direction.",
    ],
    blockedUntil: [
      "Plan validates as ready.",
      "Affected entities are read back after write.",
      "Bounded replay/report verification proves effect.",
    ],
    manualTuningPath: {
      supported: true,
      route: "manual_tuning",
      tools: ["system_interests.update", "llm_templates.update", "channels.bulk_onboard.apply"],
      requirements: ["funnelId or explicit shared/global scope", "read-back", "verification target"],
    },
  };
}

function addIssue(
  issues: FunnelPlanIssue[],
  severity: FunnelPlanIssue["severity"],
  code: string,
  message: string,
  extra: Pick<FunnelPlanIssue, "path" | "guidance"> = {}
): void {
  issues.push({ severity, code, message, ...extra });
}

export async function validateOperatorFunnelPlan(
  queryable: Queryable,
  input: {
    plan: Record<string, unknown>;
    expectedLiveStateHash?: string | null;
  }
): Promise<FunnelPlanValidationResult> {
  const liveStateHash = await computeFunnelLiveStateHash(queryable);
  const issues: FunnelPlanIssue[] = [];
  if (input.expectedLiveStateHash && input.expectedLiveStateHash !== liveStateHash) {
    addIssue(
      issues,
      "error",
      "stale_live_state",
      "Live funnel state changed after the plan was generated.",
      { guidance: "Run operator.funnel.autoplan again before writing." }
    );
  }

  const lanes = Array.isArray(input.plan.lanes) ? input.plan.lanes : [];
  if (lanes.length === 0) {
    addIssue(issues, "error", "missing_lanes", "Plan must contain at least one funnel lane.");
  }
  for (const [index, laneValue] of lanes.entries()) {
    const lane = asRecord(laneValue);
    const laneType = String(lane.laneType ?? lane.lane_type ?? "");
    const policy = asRecord(lane.policy);
    if (laneType === "mixed") {
      addIssue(
        issues,
        "error",
        "mixed_lane_not_split",
        "Mixed signals must be split into explicit/hidden lane-like entries.",
        { path: `lanes[${index}]` }
      );
    }
    if (laneType === "context_only" && String(policy.autoSelectMode ?? "disabled") !== "disabled") {
      addIssue(
        issues,
        "error",
        "context_only_auto_select",
        "Context-only lanes cannot auto-select by themselves.",
        { path: `lanes[${index}].policy.autoSelectMode` }
      );
    }
  }

  const drafts = Array.isArray(input.plan.systemInterestDrafts)
    ? input.plan.systemInterestDrafts
    : [];
  for (const [index, draftValue] of drafts.entries()) {
    const draft = asRecord(draftValue);
    const visibility = String(draft.selection_profile_signal_visibility ?? "");
    const hasHardGates =
      asStringArray(draft.must_have_terms).length > 0 ||
      asStringArray(draft.short_tokens_required).length > 0;
    if ((visibility === "hidden_intent" || visibility === "unknown") && hasHardGates) {
      addIssue(
        issues,
        "error",
        "hidden_hard_gate",
        "Hidden/unknown lanes cannot use hard lexical gates without mandatory marker proof.",
        { path: `systemInterestDrafts[${index}]` }
      );
    }
    for (const polarity of ["candidate_positive_signal_groups", "candidate_negative_signal_groups"]) {
      const groups = Array.isArray(draft[polarity]) ? (draft[polarity] as unknown[]) : [];
      for (const [groupIndex, groupValue] of groups.entries()) {
        const group = asRecord(groupValue);
        const cues = asStringArray(group.cues);
        if (cues.length === 0) {
          addIssue(
            issues,
            "warning",
            "candidate_group_without_cues",
            "Candidate signal groups need literal observable cue fragments.",
            { path: `systemInterestDrafts[${index}].${polarity}[${groupIndex}]` }
          );
        }
        for (const cue of cues) {
          if (isLabelLikeCue(cue)) {
            addIssue(
              issues,
              "warning",
              "label_like_candidate_cue",
              "Candidate cue looks like a conceptual label rather than observable text.",
              { path: `systemInterestDrafts[${index}].${polarity}[${groupIndex}].cues` }
            );
          }
        }
      }
    }
  }

  const llmTemplates = Array.isArray(input.plan.llmTemplateDrafts)
    ? input.plan.llmTemplateDrafts
    : [];
  for (const [index, templateValue] of llmTemplates.entries()) {
    const template = asRecord(templateValue);
    const purpose = String(template.purpose ?? "selection_review");
    const templateText = String(template.templateText ?? template.template_text ?? "");
    const influencesSelected = template.influencesSelected === true;
    if (purpose === "selection_review") {
      for (const required of ["decision", "score", "reason"]) {
        if (!templateText.includes(required)) {
          addIssue(
            issues,
            "error",
            "bad_selection_review_contract",
            `selection_review template must require canonical JSON field "${required}".`,
            { path: `llmTemplateDrafts[${index}].templateText` }
          );
        }
      }
    } else if (influencesSelected) {
      addIssue(
        issues,
        "error",
        "non_review_template_selected_effect",
        "Only selection_review templates may affect selected decisions.",
        { path: `llmTemplateDrafts[${index}]` }
      );
    }
  }

  const blockers = issues.filter((issue) => issue.severity === "error");
  const warnings = issues.filter((issue) => issue.severity === "warning");
  const infos = issues.filter((issue) => issue.severity === "info");
  return {
    status: blockers.length > 0 ? "blocked" : "ready",
    liveStateHash,
    blockers,
    warnings,
    infos,
      nextActions:
      blockers.length > 0
        ? ["Fix blockers, then run operator.funnel.validate_plan again."]
        : ["Stage the plan, apply scoped writes, read back entities, then run bounded replay and operator.funnel.verify."],
  };
}

async function upsertFunnelLanesFromPlan(
  pool: Pool,
  actorUserId: string,
  funnelId: string,
  plan: Record<string, unknown>
): Promise<NonNullable<StageFunnelPlanResult["lanes"]>> {
  const lanes = readPlanLaneDrafts(plan);
  const materialized: NonNullable<StageFunnelPlanResult["lanes"]> = [];
  for (const lane of lanes) {
    const existing = await pool.query<{ laneId: string }>(
      `
        select lane_id::text as "laneId"
        from funnel_lanes
        where funnel_id = $1
          and lower(name) = lower($2)
        limit 1
      `,
      [funnelId, lane.name]
    );
    const existingLaneId = existing.rows[0]?.laneId ?? null;
    const result = existingLaneId
      ? await pool.query<{ laneId: string }>(
          `
            update funnel_lanes
            set
              lane_type = $3,
              routing_mode = $4,
              policy_json = $5::jsonb,
              evidence_contract_json = $6::jsonb,
              updated_at = now()
            where lane_id = $1
              and funnel_id = $2
            returning lane_id::text as "laneId"
          `,
          [
            existingLaneId,
            funnelId,
            lane.laneType,
            lane.routingMode,
            JSON.stringify(lane.policy),
            JSON.stringify(lane.evidenceContract),
          ]
        )
      : await pool.query<{ laneId: string }>(
          `
            insert into funnel_lanes (
              funnel_id,
              name,
              lane_type,
              routing_mode,
              policy_json,
              evidence_contract_json
            )
            values ($1, $2, $3, $4, $5::jsonb, $6::jsonb)
            returning lane_id::text as "laneId"
          `,
          [
            funnelId,
            lane.name,
            lane.laneType,
            lane.routingMode,
            JSON.stringify(lane.policy),
            JSON.stringify(lane.evidenceContract),
          ]
        );
    const laneId = result.rows[0]?.laneId ?? existingLaneId;
    if (laneId) {
      materialized.push({
        laneId,
        name: lane.name,
        laneType: lane.laneType,
        routingMode: lane.routingMode,
      });
    }
  }
  if (materialized.length > 0) {
    await writeAuditLog(pool, {
      actorUserId,
      actionType: "operator_funnel_lanes_staged",
      entityType: "operator_funnel",
      entityId: funnelId,
      payloadJson: {
        laneCount: materialized.length,
        laneIds: materialized.map((lane) => lane.laneId),
      },
    });
  }
  return materialized;
}

export async function stageOperatorFunnelPlan(
  pool: Pool,
  actorUserId: string,
  input: {
    funnelId?: string | null;
    plan: Record<string, unknown>;
    expectedLiveStateHash?: string | null;
    expiresAt?: string | null;
  }
): Promise<StageFunnelPlanResult> {
  const validation = await validateOperatorFunnelPlan(pool, {
    plan: input.plan,
    expectedLiveStateHash: input.expectedLiveStateHash ?? null,
  });
  const planFingerprint = hashValue({
    liveStateHash: validation.liveStateHash,
    plan: input.plan,
  });
  if (validation.status !== "ready") {
    return {
      status: "blocked",
      planId: null,
      planFingerprint,
      liveStateHash: validation.liveStateHash,
      validation,
      nextReadBack: [{ toolName: "operator.funnel.validate_plan", argumentsTemplate: {} }],
    };
  }
  const result = await pool.query<{ plan_id: string }>(
    `
      insert into operator_funnel_plans (
        funnel_id,
        plan_fingerprint,
        live_state_hash,
        plan_json,
        validation_json,
        status,
        created_by_user_id,
        expires_at
      )
      values ($1, $2, $3, $4::jsonb, $5::jsonb, 'staged', $6, coalesce($7::timestamptz, now() + interval '24 hours'))
      returning plan_id::text
    `,
    [
      input.funnelId ?? null,
      planFingerprint,
      validation.liveStateHash,
      JSON.stringify(input.plan),
      JSON.stringify(validation),
      actorUserId,
      input.expiresAt ?? null,
    ]
  );
  const planId = result.rows[0]?.plan_id ?? null;
  const lanes = input.funnelId
    ? await upsertFunnelLanesFromPlan(pool, actorUserId, input.funnelId, input.plan)
    : [];
  await writeAuditLog(pool, {
    actorUserId,
    actionType: "operator_funnel_plan_staged",
    entityType: "operator_funnel_plan",
    entityId: planId,
    payloadJson: { funnelId: input.funnelId ?? null, planFingerprint, laneCount: lanes.length },
  });
  return {
    status: "staged",
    planId,
    planFingerprint,
    liveStateHash: validation.liveStateHash,
    validation,
    lanes,
    nextReadBack: [
      { toolName: "operator.funnels.read", argumentsTemplate: { funnelId: input.funnelId ?? "<new-funnel-id>" } },
      { toolName: "operator.funnel.verify", argumentsTemplate: { funnelId: input.funnelId ?? "<new-funnel-id>" } },
    ],
  };
}

export async function verifyOperatorFunnel(
  queryable: Queryable,
  input: {
    funnelId?: string | null;
    includeSamples?: boolean;
    allowedFunnelIds?: readonly string[] | null;
  }
): Promise<Record<string, unknown>> {
  const funnelId = String(input.funnelId ?? "").trim();
  const params: unknown[] = [];
  const whereParts: string[] = [];
  if (funnelId) {
    whereParts.push(`f.funnel_id = $${params.push(funnelId)}`);
  }
  const allowedFunnelIds = Array.isArray(input.allowedFunnelIds)
    ? input.allowedFunnelIds.filter((entry) => String(entry ?? "").trim())
    : [];
  if (!funnelId && allowedFunnelIds.length > 0) {
    whereParts.push(`f.funnel_id = any($${params.push(allowedFunnelIds)}::uuid[])`);
  }
  const funnelWhere = whereParts.length > 0 ? `where ${whereParts.join(" and ")}` : "";
  const summary = await queryable.query<Record<string, unknown>>(
    `
      select
        count(distinct f.funnel_id)::int as "funnelCount",
        count(distinct l.lane_id)::int as "laneCount",
        count(distinct sib.interest_template_id)::int as "interestCount",
        count(distinct fsb.channel_id)::int as "sourceCount",
        count(distinct ftb.prompt_template_id)::int as "templateCount",
        count(distinct frjb.reindex_job_id)::int as "replayJobCount",
        count(distinct fsr.doc_id) filter (where fsr.final_decision = 'selected')::int as "selectedCount",
        count(distinct fsr.doc_id) filter (where fsr.final_decision = 'gray_zone')::int as "grayCount",
        count(distinct fsr.doc_id) filter (where fsr.final_decision = 'rejected')::int as "rejectedCount",
        count(distinct fsr.doc_id) filter (where coalesce(fsr.explain_json ->> 'selectionReason', '') = 'evidence_led_candidate_signal')::int as "evidenceLedSelected",
        count(distinct fsr.doc_id) filter (where coalesce(fsr.explain_json ->> 'selectionReason', '') = 'llm_approved_signal')::int as "llmApprovedSelected"
      from operator_funnels f
      left join funnel_lanes l on l.funnel_id = f.funnel_id
      left join funnel_system_interest_bindings sib on sib.funnel_id = f.funnel_id
      left join funnel_source_bindings fsb on fsb.funnel_id = f.funnel_id
      left join funnel_template_bindings ftb on ftb.funnel_id = f.funnel_id
      left join funnel_reindex_job_bindings frjb on frjb.funnel_id = f.funnel_id
      left join criteria c on c.source_interest_template_id = sib.interest_template_id
      left join interest_filter_results ifr
        on ifr.criterion_id = c.criterion_id
        and ifr.filter_scope = 'system_criterion'
      left join final_selection_results fsr on fsr.doc_id = ifr.doc_id
      ${funnelWhere}
    `,
    params
  );
  const warnings: FunnelPlanIssue[] = [];
  const row = summary.rows[0] ?? {};
  if (Number(row.funnelCount ?? 0) === 0) {
    addIssue(warnings, "warning", "funnel_not_found", "No funnel matched this verification scope.");
  }
  if (Number(row.templateCount ?? 0) === 0) {
    addIssue(warnings, "warning", "no_funnel_templates", "No LLM templates are bound to this funnel scope.");
  }
  const samples =
    input.includeSamples === true
      ? await readFunnelSelectionSamples(queryable, { funnelId, allowedFunnelIds })
      : [];
  return {
    verifiedAt: new Date().toISOString(),
    funnelId: funnelId || null,
    counts: row,
    samples,
    warnings,
    nextActions: [
      "Inspect selected and hold samples by funnel/lane.",
      "Run bounded replay before expanding scope.",
      "Use manual tuning only with funnel context or explicit shared/global scope.",
    ],
  };
}

async function readFunnelSelectionSamples(
  queryable: Queryable,
  input: { funnelId?: string | null; allowedFunnelIds?: readonly string[] | null }
): Promise<Array<Record<string, unknown>>> {
  const funnelId = String(input.funnelId ?? "").trim();
  const params: unknown[] = [];
  const whereParts: string[] = [];
  if (funnelId) {
    whereParts.push(`f.funnel_id = $${params.push(funnelId)}`);
  }
  const allowedFunnelIds = Array.isArray(input.allowedFunnelIds)
    ? input.allowedFunnelIds.filter((entry) => String(entry ?? "").trim())
    : [];
  if (!funnelId && allowedFunnelIds.length > 0) {
    whereParts.push(`f.funnel_id = any($${params.push(allowedFunnelIds)}::uuid[])`);
  }
  const funnelWhere = whereParts.length > 0 ? `where ${whereParts.join(" and ")}` : "";
  const result = await queryable.query<Record<string, unknown>>(
    `
      select distinct on (fsr.doc_id, f.funnel_id, l.lane_id)
        f.funnel_id::text as "funnelId",
        f.name as "funnelName",
        l.lane_id::text as "laneId",
        l.name as "laneName",
        l.lane_type as "laneType",
        l.routing_mode as "routingMode",
        sib.binding_role as "interestBindingRole",
        c.source_interest_template_id::text as "interestTemplateId",
        fsb.source_role as "sourceRole",
        fsb.binding_role as "sourceBindingRole",
        a.channel_id::text as "channelId",
        sc.name as "channelName",
        fsr.doc_id::text as "docId",
        a.title,
        a.url,
        fsr.final_decision as "finalDecision",
        fsr.verification_state as "verificationState",
        coalesce(fsr.explain_json ->> 'selectionReason', '') as "selectionReason",
        coalesce(fsr.explain_json ->> 'selectionBlockerReason', '') as "selectionBlockerReason",
        coalesce(fsr.explain_json ->> 'holdReason', '') as "holdReason",
        fsr.explain_json -> 'funnelRuntimeAttribution' as "funnelRuntimeAttribution",
        coalesce(
          fsr.explain_json ->> 'candidateSignalTier',
          fsr.explain_json #>> '{semanticSignalSummary,candidateSignalTier}',
          'unknown'
        ) as "candidateSignalTier",
        coalesce((fsr.explain_json ->> 'candidateSignalAutoSelectCount')::int, 0) as "candidateSignalAutoSelectCount",
        coalesce((fsr.explain_json ->> 'candidateSignalUpliftCount')::int, 0) as "candidateSignalUpliftCount",
        fsr.updated_at as "selectionUpdatedAt"
      from operator_funnels f
      join funnel_system_interest_bindings sib on sib.funnel_id = f.funnel_id
      left join funnel_lanes l on l.lane_id = sib.lane_id
      join criteria c on c.source_interest_template_id = sib.interest_template_id
      join interest_filter_results ifr
        on ifr.criterion_id = c.criterion_id
        and ifr.filter_scope = 'system_criterion'
      join final_selection_results fsr on fsr.doc_id = ifr.doc_id
      left join signal_candidates a on a.doc_id = fsr.doc_id
      left join source_channels sc on sc.channel_id = a.channel_id
      left join funnel_source_bindings fsb
        on fsb.funnel_id = f.funnel_id
        and fsb.channel_id = a.channel_id
      ${funnelWhere}
      order by
        fsr.doc_id,
        f.funnel_id,
        l.lane_id,
        case fsr.final_decision
          when 'selected' then 0
          when 'gray_zone' then 1
          else 2
        end,
        fsr.updated_at desc
      limit 25
    `,
    params
  );
  return result.rows;
}

export async function auditOperatorFunnelOverlap(
  queryable: Queryable,
  input: { funnelIds?: string[]; includeSamples?: boolean; allowedFunnelIds?: readonly string[] | null } = {}
): Promise<Record<string, unknown>> {
  const funnelIds = Array.isArray(input.funnelIds) ? input.funnelIds.filter(Boolean) : [];
  const scopedFunnelIds =
    funnelIds.length > 0
      ? funnelIds
      : Array.isArray(input.allowedFunnelIds)
        ? input.allowedFunnelIds.filter((entry) => String(entry ?? "").trim())
        : [];
  const params: unknown[] = [];
  const where =
    scopedFunnelIds.length > 0
      ? `where b.funnel_id = any($${params.push(scopedFunnelIds)}::uuid[])`
      : "";
  const result = await queryable.query<Record<string, unknown>>(
    `
      select
        b.interest_template_id::text as "interestTemplateId",
        count(distinct b.funnel_id)::int as "funnelCount",
        jsonb_agg(distinct b.funnel_id::text) as "funnelIds"
      from funnel_system_interest_bindings b
      ${where}
      group by b.interest_template_id
      having count(distinct b.funnel_id) > 1
      order by count(distinct b.funnel_id) desc
      limit 50
    `,
    params
  );
  return {
    auditedAt: new Date().toISOString(),
    funnelIds: scopedFunnelIds,
    sharedSystemInterests: result.rows,
    warnings:
      result.rows.length > 0
        ? [
            {
              severity: "warning",
              code: "shared_interest_overlap",
              message:
                "Some system interests are bound to multiple funnels; verify that this is intended shared/manual behavior.",
            },
          ]
        : [],
  };
}

export interface FunnelContentScopeInput {
  funnelId?: string | null;
  laneId?: string | null;
  allowedFunnelIds?: readonly string[] | null;
}

export interface ListFunnelContentInput extends FunnelContentScopeInput {
  page?: number | null;
  pageSize?: number | null;
  q?: string | null;
  channelId?: string | null;
  selectedOnly?: boolean;
  sort?: "latest" | "oldest" | "title_asc" | "title_desc" | null;
}

export interface ReadFunnelContentAttributionInput extends FunnelContentScopeInput {
  docId: string;
}

function readFunnelContentPageWindow(input: Pick<ListFunnelContentInput, "page" | "pageSize">) {
  const page = Math.max(1, Number(input.page ?? 1));
  const pageSize = Math.min(Math.max(1, Number(input.pageSize ?? 25)), 100);
  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize,
  };
}

function buildFunnelContentScopeWhere(
  input: FunnelContentScopeInput,
  params: unknown[],
  tableAlias = "f"
): string[] {
  const whereParts: string[] = [];
  const funnelId = String(input.funnelId ?? "").trim();
  if (funnelId) {
    whereParts.push(`${tableAlias}.funnel_id = $${params.push(funnelId)}::uuid`);
  } else {
    const allowedFunnelIds = Array.isArray(input.allowedFunnelIds)
      ? input.allowedFunnelIds.filter((entry) => String(entry ?? "").trim())
      : [];
    if (allowedFunnelIds.length > 0) {
      whereParts.push(`${tableAlias}.funnel_id = any($${params.push(allowedFunnelIds)}::uuid[])`);
    }
  }
  const laneId = String(input.laneId ?? "").trim();
  if (laneId) {
    whereParts.push(`l.lane_id = $${params.push(laneId)}::uuid`);
  }
  return whereParts;
}

function funnelContentBaseCte(whereSql: string): string {
  return `
    with scoped as (
      select distinct on (a.doc_id, f.funnel_id, l.lane_id)
        a.doc_id::text as "docId",
        a.doc_id::text as "contentItemId",
        a.title,
        a.lead,
        a.url,
        a.content_kind as "contentKind",
        a.content_format as "contentFormat",
        a.published_at as "publishedAt",
        a.ingested_at as "ingestedAt",
        a.channel_id::text as "channelId",
        sc.name as "channelName",
        f.funnel_id::text as "funnelId",
        f.name as "funnelName",
        l.lane_id::text as "laneId",
        l.name as "laneName",
        l.lane_type as "laneType",
        l.routing_mode as "routingMode",
        fsb.source_role as "sourceRole",
        sib.interest_template_id::text as "interestTemplateId",
        sib.binding_role as "interestBindingRole",
        fsr.final_decision as "finalDecision",
        fsr.is_selected as "isSelected",
        fsr.verification_state as "verificationState",
        coalesce(fsr.explain_json ->> 'selectionReason', '') as "selectionReason",
        coalesce(fsr.explain_json ->> 'selectionBlockerReason', '') as "selectionBlockerReason",
        coalesce(fsr.explain_json ->> 'holdReason', '') as "holdReason",
        coalesce(
          fsr.explain_json ->> 'candidateSignalTier',
          fsr.explain_json #>> '{semanticSignalSummary,candidateSignalTier}',
          'unknown'
        ) as "candidateSignalTier",
        fsr.updated_at as "selectionUpdatedAt"
      from operator_funnels f
      join funnel_system_interest_bindings sib on sib.funnel_id = f.funnel_id
      left join funnel_lanes l on l.lane_id = sib.lane_id
      join criteria c on c.source_interest_template_id = sib.interest_template_id
      join interest_filter_results ifr
        on ifr.criterion_id = c.criterion_id
        and ifr.filter_scope = 'system_criterion'
      join final_selection_results fsr on fsr.doc_id = ifr.doc_id
      join signal_candidates a on a.doc_id = fsr.doc_id
      left join source_channels sc on sc.channel_id = a.channel_id
      left join funnel_source_bindings fsb
        on fsb.funnel_id = f.funnel_id
        and fsb.channel_id = a.channel_id
      ${whereSql}
      order by a.doc_id, f.funnel_id, l.lane_id, fsr.updated_at desc
    )
  `;
}

function readFunnelContentOrderBy(sort: ListFunnelContentInput["sort"]): string {
  if (sort === "oldest") {
    return `"publishedAt" asc nulls last, "selectionUpdatedAt" asc nulls last`;
  }
  if (sort === "title_asc") {
    return `lower(title) asc, "publishedAt" desc nulls last`;
  }
  if (sort === "title_desc") {
    return `lower(title) desc, "publishedAt" desc nulls last`;
  }
  return `"publishedAt" desc nulls last, "selectionUpdatedAt" desc nulls last`;
}

export async function listFunnelContentItems(
  queryable: Queryable,
  input: ListFunnelContentInput = {}
): Promise<Record<string, unknown>> {
  const { page, pageSize, offset } = readFunnelContentPageWindow(input);
  const params: unknown[] = [];
  const whereParts = buildFunnelContentScopeWhere(input, params);
  if (input.selectedOnly === true) {
    whereParts.push(`fsr.final_decision = 'selected'`);
  }
  const channelId = String(input.channelId ?? "").trim();
  if (channelId) {
    whereParts.push(`a.channel_id = $${params.push(channelId)}::uuid`);
  }
  const q = String(input.q ?? "").trim();
  if (q) {
    whereParts.push(
      `(a.title ilike $${params.push(`%${q}%`)} or a.lead ilike $${params.length} or a.url ilike $${params.length})`
    );
  }
  const whereSql = whereParts.length > 0 ? `where ${whereParts.join(" and ")}` : "";
  const cte = funnelContentBaseCte(whereSql);
  const total = await queryable.query<{ total: number }>(
    `${cte} select count(*)::int as total from scoped`,
    params
  );
  const items = await queryable.query<Record<string, unknown>>(
    `
      ${cte}
      select *
      from scoped
      order by ${readFunnelContentOrderBy(input.sort)}
      limit $${params.length + 1} offset $${params.length + 2}
    `,
    [...params, pageSize, offset]
  );
  return {
    page,
    pageSize,
    total: Number(total.rows[0]?.total ?? 0),
    scope: {
      funnelId: input.funnelId ?? null,
      laneId: input.laneId ?? null,
      selectedOnly: input.selectedOnly === true,
    },
    items: items.rows,
  };
}

export async function readFunnelContentAttribution(
  queryable: Queryable,
  input: ReadFunnelContentAttributionInput
): Promise<Array<Record<string, unknown>>> {
  const params: unknown[] = [input.docId];
  const whereParts = [`a.doc_id = $1::uuid`, ...buildFunnelContentScopeWhere(input, params)];
  const cte = funnelContentBaseCte(`where ${whereParts.join(" and ")}`);
  const result = await queryable.query<Record<string, unknown>>(
    `
      ${cte}
      select *
      from scoped
      order by "selectionUpdatedAt" desc nulls last
      limit 25
    `,
    params
  );
  return result.rows;
}

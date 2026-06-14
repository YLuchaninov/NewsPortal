import type { Pool } from "pg";

import { writeAuditLog } from "./audit";
import { computeFunnelLiveStateHash } from "./funnel-live-state";
import type {
  FunnelPlanIssue,
  FunnelPlanValidationResult,
  Queryable,
  StageFunnelPlanResult,
} from "./funnel-model";
import {
  asRecord,
  asStringArray,
  hashValue,
  isLabelLikeCue,
  readPlanLaneDrafts,
} from "./funnel-model";

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

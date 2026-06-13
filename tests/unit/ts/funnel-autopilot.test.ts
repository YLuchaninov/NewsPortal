import assert from "node:assert/strict";
import test from "node:test";

import {
  buildOperatorFunnelAutoplan,
  stageOperatorFunnelPlan,
  updateOperatorFunnelLane,
  validateOperatorFunnelPlan,
  verifyOperatorFunnel,
} from "../../../packages/control-plane/src/funnels.ts";

function makeFakePool(funnelCount = 1) {
  return {
    async query(sql: string) {
      if (/funnelCount/u.test(sql)) {
        return {
          rows: [
            {
              funnelCount,
              laneCount: funnelCount,
              interestCount: funnelCount > 0 ? 2 : 0,
              templateCount: funnelCount > 0 ? 1 : 0,
              channelCount: funnelCount > 0 ? 3 : 0,
              selectionResultCount: 0,
              maxUpdatedAt: "2026-06-12T00:00:00.000Z",
            },
          ],
        };
      }
      return { rows: [] };
    },
  };
}

const fakePool = makeFakePool();
const emptyPool = makeFakePool(0);

test("Funnel Autopilot creates hidden-intent lanes for indirect long-term partner ideas", async () => {
  const plan = await buildOperatorFunnelAutoplan(emptyPool, {
    idea: "large company needs a long-term implementation partner for legacy migration",
    operatorExperience: "novice",
  });

  assert.equal(plan.suggestedAction, "create_new");
  assert.equal(plan.lanes.length, 1);
  assert.equal(plan.lanes[0].laneType, "hidden_intent");
  assert.equal(plan.lanes[0].routingMode, "llm_approved");
  assert.equal(plan.systemInterestDrafts[0].selection_profile_auto_select_mode, "llm_approved");
  assert.deepEqual(plan.systemInterestDrafts[0].must_have_terms, []);
  assert.ok(JSON.stringify(plan.llmTemplateDrafts).includes("decision"));
});

test("Funnel Autopilot splits mixed explicit and hidden ideas into separate lanes", async () => {
  const plan = await buildOperatorFunnelAutoplan(fakePool, {
    idea: "request for proposal for a long-term implementation partner",
  });

  assert.equal(plan.suggestedAction, "split_or_choose");
  assert.deepEqual(
    plan.lanes.map((lane) => lane.laneType),
    ["explicit_marker", "hidden_intent"],
  );
});

test("Funnel Autopilot attaches scoped setup when funnel id is supplied", async () => {
  const plan = await buildOperatorFunnelAutoplan(fakePool, {
    idea: "large company needs a long-term implementation partner for legacy migration",
    funnelId: "11111111-1111-4111-8111-111111111111",
  });

  assert.equal(plan.suggestedAction, "attach_existing");
  assert.equal(plan.funnelDraft, null);
});

test("Funnel plan validation blocks hidden hard gates", async () => {
  const validation = await validateOperatorFunnelPlan(fakePool, {
    plan: {
      lanes: [
        {
          laneType: "hidden_intent",
          policy: { autoSelectMode: "llm_approved" },
        },
      ],
      systemInterestDrafts: [
        {
          selection_profile_signal_visibility: "hidden_intent",
          must_have_terms: ["vendor"],
          short_tokens_required: [],
        },
      ],
    },
  });

  assert.equal(validation.status, "blocked");
  assert.match(JSON.stringify(validation.blockers), /hidden_hard_gate/);
});

test("Funnel plan validation blocks bad selection_review contracts", async () => {
  const validation = await validateOperatorFunnelPlan(fakePool, {
    plan: {
      lanes: [{ laneType: "hidden_intent", policy: { autoSelectMode: "llm_approved" } }],
      systemInterestDrafts: [],
      llmTemplateDrafts: [
        {
          purpose: "selection_review",
          templateText: "Return JSON with is_signal and confidence.",
        },
      ],
    },
  });

  assert.equal(validation.status, "blocked");
  assert.match(JSON.stringify(validation.blockers), /bad_selection_review_contract/);
});

test("Funnel plan validation blocks stale live state hash", async () => {
  const validation = await validateOperatorFunnelPlan(fakePool, {
    expectedLiveStateHash: "not-current",
    plan: {
      lanes: [{ laneType: "unknown", policy: { autoSelectMode: "disabled" } }],
      systemInterestDrafts: [],
    },
  });

  assert.equal(validation.status, "blocked");
  assert.match(JSON.stringify(validation.blockers), /stale_live_state/);
});

test("Funnel plan staging materializes lane skeletons for scoped manual writes", async () => {
  const queries: string[] = [];
  const auditActions: string[] = [];
  let laneInsertCount = 0;
  const pool = {
    async query(sql: string, params?: unknown[]) {
      queries.push(sql);
      if (/insert into audit_log/u.test(sql)) {
        auditActions.push(String(params?.[1] ?? ""));
      }
      if (/funnelCount/u.test(sql)) {
        return {
          rows: [
            {
              funnelCount: 1,
              laneCount: 0,
              interestCount: 0,
              templateCount: 0,
              channelCount: 0,
              selectionResultCount: 0,
              maxUpdatedAt: "2026-06-12T00:00:00.000Z",
            },
          ],
        };
      }
      if (/insert into operator_funnel_plans/u.test(sql)) {
        return { rows: [{ plan_id: "99999999-9999-4999-8999-999999999999" }] };
      }
      if (/select lane_id::text as "laneId"/u.test(sql)) {
        return { rows: [] };
      }
      if (/insert into funnel_lanes/u.test(sql)) {
        laneInsertCount += 1;
        return { rows: [{ laneId: "22222222-2222-4222-8222-222222222222" }] };
      }
      return { rows: [] };
    },
  };

  const staged = await stageOperatorFunnelPlan(
    pool,
    "11111111-1111-4111-8111-111111111111",
    {
      funnelId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      plan: {
        lanes: [
          {
            name: "Hidden intent",
            laneType: "hidden_intent",
            routingMode: "llm_approved",
            policy: { autoSelectMode: "llm_approved" },
            evidenceContract: { selectedRequiresLlmApprove: true },
          },
        ],
      },
    }
  );

  assert.equal(staged.status, "staged");
  assert.equal(staged.lanes?.[0]?.laneId, "22222222-2222-4222-8222-222222222222");
  assert.equal(staged.lanes?.[0]?.laneType, "hidden_intent");
  assert.equal(laneInsertCount, 1);
  assert.ok(auditActions.includes("operator_funnel_lanes_staged"));
});

test("Funnel lane update edits routing policy and writes audit trail", async () => {
  const auditActions: string[] = [];
  const queries: Array<{ sql: string; params?: unknown[] }> = [];
  const pool = {
    async query(sql: string, params?: unknown[]) {
      queries.push({ sql, params });
      if (/from funnel_lanes/u.test(sql)) {
        return {
          rows: [
            {
              laneId: "22222222-2222-4222-8222-222222222222",
              funnelId: "11111111-1111-4111-8111-111111111111",
              name: "Hidden intent",
              laneType: "hidden_intent",
              routingMode: "llm_approved",
              policyJson: { autoSelectMode: "llm_approved" },
              evidenceContractJson: { selectedRequiresLlmApprove: true },
            },
          ],
        };
      }
      if (/update funnel_lanes/u.test(sql)) {
        return {
          rows: [
            {
              laneId: "22222222-2222-4222-8222-222222222222",
              funnelId: "11111111-1111-4111-8111-111111111111",
              name: "Hidden intent tuned",
              laneType: "hidden_intent",
              routingMode: "hold_for_calibration",
              policyJson: { autoSelectMode: "disabled" },
              evidenceContractJson: { selectedRequiresLlmApprove: true },
              updatedAt: "2026-06-12T00:00:00.000Z",
            },
          ],
        };
      }
      if (/insert into audit_log/u.test(sql)) {
        auditActions.push(String(params?.[1] ?? ""));
      }
      return { rows: [] };
    },
  };

  const result = await updateOperatorFunnelLane(
    pool,
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    {
      funnelId: "11111111-1111-4111-8111-111111111111",
      laneId: "22222222-2222-4222-8222-222222222222",
      name: "Hidden intent tuned",
      laneType: "hidden_intent",
      routingMode: "hold_for_calibration",
      policyJson: { autoSelectMode: "disabled" },
      evidenceContractJson: { selectedRequiresLlmApprove: true },
    }
  );

  assert.equal(result.updated, true);
  assert.equal(result.lane?.name, "Hidden intent tuned");
  assert.ok(auditActions.includes("operator_funnel_lane_updated"));
  assert.match(JSON.stringify(queries), /autoSelectMode/);
});

test("Funnel verification samples explain lane and source-role attribution", async () => {
  const queries: string[] = [];
  const pool = {
    async query(sql: string) {
      queries.push(sql);
      if (/count\(distinct f\.funnel_id\)::int as "funnelCount"/u.test(sql)) {
        return {
          rows: [
            {
              funnelCount: 1,
              laneCount: 1,
              interestCount: 1,
              sourceCount: 1,
              templateCount: 1,
              selectedCount: 1,
              grayCount: 0,
              rejectedCount: 0,
              evidenceLedSelected: 1,
              llmApprovedSelected: 0,
            },
          ],
        };
      }
      if (/select distinct on \(fsr\.doc_id, f\.funnel_id, l\.lane_id\)/u.test(sql)) {
        return {
          rows: [
            {
              funnelId: "11111111-1111-4111-8111-111111111111",
              funnelName: "Long-term developer demand",
              laneId: "22222222-2222-4222-8222-222222222222",
              laneType: "hidden_intent",
              routingMode: "llm_approved",
              sourceRole: "community_hidden_signal",
              docId: "33333333-3333-4333-8333-333333333333",
              finalDecision: "selected",
              selectionReason: "llm_approved_signal",
              candidateSignalTier: "project_intent",
            },
          ],
        };
      }
      return { rows: [] };
    },
  };

  const result = await verifyOperatorFunnel(pool, {
    funnelId: "11111111-1111-4111-8111-111111111111",
    includeSamples: true,
  });
  const samples = result.samples as Array<Record<string, unknown>>;

  assert.equal(samples.length, 1);
  assert.equal(samples[0].laneType, "hidden_intent");
  assert.equal(samples[0].sourceRole, "community_hidden_signal");
  assert.equal(samples[0].selectionReason, "llm_approved_signal");
  assert.match(queries.join("\n"), /funnel_source_bindings/);
});

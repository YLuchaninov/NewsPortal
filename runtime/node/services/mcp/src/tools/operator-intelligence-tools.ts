import { type JsonSchema } from "@signalops/contracts";
import {
  auditOperatorFunnelOverlap,
  archiveOperatorFunnel,
  buildOperatorFunnelAutoplan,
  createOperatorFunnel,
  getMcpTokenAllowedFunnelIds,
  getSourceFamilyCoverageWithPool,
  listOperatorFunnels,
  readOperatorFunnel,
  stageOperatorFunnelPlan,
  updateOperatorFunnel,
  validateOperatorFunnelPlan,
  verifyOperatorFunnel,
  type FunnelStatus,
} from "@signalops/control-plane";

import {
  JsonRpcError,
  createReadTool,
  createWriteTool,
  readBooleanFlag,
  readOptionalString,
  readPageArgs,
  readRequiredString,
  requireMcpTokenFunnelAccess,
  type McpToolContext,
  type McpToolDefinition,
} from "./shared";
import { readStringArray } from "./content-analysis-helpers";
import {
  EVIDENCE_LANE_TYPE_VALUES,
  HARD_GATE_POLICY_VALUES,
  OPERATING_DOMAIN_VALUES,
  OPERATOR_CHANGE_INTENT_VALUES,
  OPERATOR_CLEANUP_INTENT_VALUES,
  OPERATOR_FLOW_MODE_VALUES,
  OPERATOR_FLOW_SYMPTOM_VALUES,
  OPERATOR_TUNING_LAYER_VALUES,
  OPERATOR_UPDATE_RISK_VALUES,
  SIGNAL_VISIBILITY_VALUES,
  buildFunnelAudit,
  buildFunnelAutoplan,
  buildFunnelIterationRecommendation,
  buildOperatorFlowRoute,
  buildSelectionDashboard,
  buildSelectionPrecisionAudit,
  buildSelectionReindexPlan,
  buildSystemHealth,
  explainOperatorIssue,
  recommendOperatorTuning,
  verifyOperatorEffect,
} from "../operating-intelligence";

const operatorFlowRouteSchema = {
  type: "object",
  properties: {
    sessionGoal: { type: "string" },
    domain: {
      type: "string",
      enum: [...OPERATING_DOMAIN_VALUES],
    },
    objective: {
      type: "string",
      enum: [
        "increase_recall",
        "increase_precision",
        "reduce_cost",
        "debug_source",
        "stabilize_discovery",
      ],
    },
    symptoms: {
      type: "array",
      items: {
        type: "string",
        enum: [...OPERATOR_FLOW_SYMPTOM_VALUES],
      },
    },
    operationMode: {
      type: "string",
      enum: [...OPERATOR_FLOW_MODE_VALUES],
    },
    operatorOverrideReason: { type: "string" },
    affectedScope: { type: "array", items: { type: "string" } },
    changeIntent: {
      type: "string",
      enum: [...OPERATOR_CHANGE_INTENT_VALUES],
    },
    cleanupIntent: {
      type: "string",
      enum: [...OPERATOR_CLEANUP_INTENT_VALUES],
    },
    tuningLayer: {
      type: "string",
      enum: [...OPERATOR_TUNING_LAYER_VALUES],
    },
    updateRisk: {
      type: "string",
      enum: [...OPERATOR_UPDATE_RISK_VALUES],
    },
    signalVisibility: {
      type: "string",
      enum: [...SIGNAL_VISIBILITY_VALUES],
    },
    evidenceLaneType: {
      type: "string",
      enum: [...EVIDENCE_LANE_TYPE_VALUES],
    },
    hardGatePolicy: {
      type: "string",
      enum: [...HARD_GATE_POLICY_VALUES],
    },
    residualBucket: { type: "string" },
    reportKind: { type: "string" },
    includeSamples: { type: "boolean" },
    funnelId: { type: "string" },
    laneId: { type: "string" },
  },
  additionalProperties: false,
} satisfies JsonSchema;

const operatorSystemHealthSchema = {
  type: "object",
  properties: {
    domains: {
      type: "array",
      items: {
        type: "string",
        enum: [...OPERATING_DOMAIN_VALUES],
      },
    },
    sinceHours: { type: "number" },
    includeSamples: { type: "boolean" },
  },
  additionalProperties: false,
} satisfies JsonSchema;

const operatorIssueExplainSchema = {
  type: "object",
  required: ["symptom"],
  properties: {
    symptom: { type: "string" },
    domain: {
      type: "string",
      enum: [...OPERATING_DOMAIN_VALUES],
    },
    entityIds: {
      type: "object",
      additionalProperties: true,
    },
    sinceHours: { type: "number" },
    includeSamples: { type: "boolean" },
  },
  additionalProperties: false,
} satisfies JsonSchema;

const operatorTuningRecommendSchema = {
  type: "object",
  required: ["domain"],
  properties: {
    domain: {
      type: "string",
      enum: [...OPERATING_DOMAIN_VALUES],
    },
    objective: {
      type: "string",
      enum: [
        "increase_recall",
        "increase_precision",
        "reduce_cost",
        "debug_source",
        "stabilize_discovery",
      ],
    },
    entityIds: {
      type: "object",
      additionalProperties: true,
    },
    residualBucket: { type: "string" },
    operationMode: {
      type: "string",
      enum: [...OPERATOR_FLOW_MODE_VALUES],
    },
    operatorOverrideReason: { type: "string" },
    affectedScope: { type: "array", items: { type: "string" } },
    changeIntent: {
      type: "string",
      enum: [...OPERATOR_CHANGE_INTENT_VALUES],
    },
    cleanupIntent: {
      type: "string",
      enum: [...OPERATOR_CLEANUP_INTENT_VALUES],
    },
    tuningLayer: {
      type: "string",
      enum: [...OPERATOR_TUNING_LAYER_VALUES],
    },
    updateRisk: {
      type: "string",
      enum: [...OPERATOR_UPDATE_RISK_VALUES],
    },
    signalVisibility: {
      type: "string",
      enum: [...SIGNAL_VISIBILITY_VALUES],
    },
    evidenceLaneType: {
      type: "string",
      enum: [...EVIDENCE_LANE_TYPE_VALUES],
    },
    hardGatePolicy: {
      type: "string",
      enum: [...HARD_GATE_POLICY_VALUES],
    },
    sinceHours: { type: "number" },
    includeSamples: { type: "boolean" },
    funnelId: { type: "string" },
    laneId: { type: "string" },
  },
  additionalProperties: false,
} satisfies JsonSchema;

const operatorEffectVerifySchema = {
  type: "object",
  required: ["domain"],
  properties: {
    domain: {
      type: "string",
      enum: [...OPERATING_DOMAIN_VALUES],
    },
    changeRef: { type: "string" },
    entityIds: {
      type: "object",
      additionalProperties: true,
    },
    baselineWindowHours: { type: "number" },
    comparisonWindowHours: { type: "number" },
    includeSamples: { type: "boolean" },
    funnelId: { type: "string" },
    laneId: { type: "string" },
  },
  additionalProperties: false,
} satisfies JsonSchema;

const operatorFunnelAuditSchema = {
  type: "object",
  required: ["objective", "referenceEvidenceKind"],
  properties: {
    objective: { type: "string" },
    referenceEvidenceKind: {
      type: "string",
      enum: ["reference_text", "reference_bundle", "admin_settings", "json_asset", "portable_funnel_guidance"],
    },
    referenceId: { type: "string" },
    referenceText: { type: "string" },
    referenceBundleKey: { type: "string" },
    domainPrefix: { type: "string" },
    includeDiscovery: { type: "boolean" },
    includeSamples: { type: "boolean" },
  },
  additionalProperties: false,
} satisfies JsonSchema;

const operatorFunnelAutoplanSchema = {
  type: "object",
  properties: {
    objective: { type: "string" },
    idea: { type: "string" },
    funnelId: { type: "string" },
    operatorExperience: { type: "string", enum: ["novice", "expert"] },
    excludedOutcomes: { type: "array", items: { type: "string" } },
    regions: { type: "array", items: { type: "string" } },
    languages: { type: "array", items: { type: "string" } },
    rareSignal: { type: "boolean" },
    domainPrefix: { type: "string" },
    maxNewChannels: { type: "number" },
    timeboxHours: { type: "number" },
    includeSamples: { type: "boolean" },
  },
  additionalProperties: false,
} satisfies JsonSchema;

const operatorFunnelsListSchema = {
  type: "object",
  properties: {
    status: { type: "string", enum: ["draft", "active", "paused", "archived"] },
    page: { type: "number" },
    pageSize: { type: "number" },
  },
  additionalProperties: false,
} satisfies JsonSchema;

const operatorFunnelsReadSchema = {
  type: "object",
  required: ["funnelId"],
  properties: {
    funnelId: { type: "string" },
  },
  additionalProperties: false,
} satisfies JsonSchema;

const operatorFunnelsCreateSchema = {
  type: "object",
  required: ["name"],
  properties: {
    name: { type: "string" },
    goal: { type: "string" },
    status: { type: "string", enum: ["draft", "active", "paused", "archived"] },
    createdFromIdeaJson: { type: "object", additionalProperties: true },
    defaultPolicyJson: { type: "object", additionalProperties: true },
  },
  additionalProperties: false,
} satisfies JsonSchema;

const operatorFunnelsUpdateSchema = {
  type: "object",
  required: ["funnelId"],
  properties: {
    funnelId: { type: "string" },
    name: { type: "string" },
    goal: { type: "string" },
    status: { type: "string", enum: ["draft", "active", "paused", "archived"] },
    defaultPolicyJson: { type: "object", additionalProperties: true },
  },
  additionalProperties: false,
} satisfies JsonSchema;

const operatorFunnelsArchiveSchema = {
  type: "object",
  required: ["funnelId", "confirm"],
  properties: {
    funnelId: { type: "string" },
    confirm: { type: "boolean" },
  },
  additionalProperties: false,
} satisfies JsonSchema;

const operatorFunnelValidatePlanSchema = {
  type: "object",
  required: ["plan"],
  properties: {
    plan: { type: "object", additionalProperties: true },
    expectedLiveStateHash: { type: "string" },
  },
  additionalProperties: false,
} satisfies JsonSchema;

const operatorFunnelStagePlanSchema = {
  type: "object",
  required: ["plan"],
  properties: {
    funnelId: { type: "string" },
    plan: { type: "object", additionalProperties: true },
    expectedLiveStateHash: { type: "string" },
    expiresAt: { type: "string" },
  },
  additionalProperties: false,
} satisfies JsonSchema;

const operatorFunnelVerifySchema = {
  type: "object",
  properties: {
    funnelId: { type: "string" },
    includeSamples: { type: "boolean" },
  },
  additionalProperties: false,
} satisfies JsonSchema;

const operatorFunnelsOverlapAuditSchema = {
  type: "object",
  properties: {
    funnelIds: { type: "array", items: { type: "string" } },
    includeSamples: { type: "boolean" },
  },
  additionalProperties: false,
} satisfies JsonSchema;

const operatorFunnelIterationRecommendSchema = {
  type: "object",
  required: ["objective"],
  properties: {
    objective: { type: "string" },
    domainPrefix: { type: "string" },
    includeSamples: { type: "boolean" },
  },
  additionalProperties: false,
} satisfies JsonSchema;

const operatorSelectionPrecisionAuditSchema = {
  type: "object",
  properties: {
    docIds: { type: "array", items: { type: "string" } },
    pageSize: { type: "number" },
    includeSamples: { type: "boolean" },
    funnelId: { type: "string" },
    laneId: { type: "string" },
  },
  additionalProperties: false,
} satisfies JsonSchema;

const emptyReadSchema = {
  type: "object",
  properties: {
    funnelId: { type: "string" },
    laneId: { type: "string" },
  },
  additionalProperties: false,
} satisfies JsonSchema;

const operatorSelectionReindexPlanSchema = {
  type: "object",
  properties: {
    docIds: { type: "array", items: { type: "string" } },
    chunkSize: { type: "number" },
    maxDocIds: { type: "number" },
    reason: { type: "string" },
    includeSamples: { type: "boolean" },
    funnelId: { type: "string" },
    laneId: { type: "string" },
    funnelPlanId: { type: "string" },
    planFingerprint: { type: "string" },
    changeMode: {
      type: "string",
      enum: ["autopilot_setup", "manual_tuning", "expert_override"],
    },
  },
  additionalProperties: false,
} satisfies JsonSchema;

const discoverySourceFamiliesCoverageSchema = {
  type: "object",
  properties: {
    includeExamples: { type: "boolean" },
  },
  additionalProperties: false,
} satisfies JsonSchema;

function requireUnrestrictedFunnelCreateToken(
  token: McpToolContext["token"],
  toolName: string
): void {
  if (getMcpTokenAllowedFunnelIds(token).length === 0) {
    return;
  }
  throw new JsonRpcError(
    -32004,
    `${toolName} requires an unrestricted MCP token because it creates a new funnel outside the token's existing funnel scope.`,
    {
      statusCode: 403,
      data: {
        code: "funnel_bound_token_cannot_create_funnel",
        requiredAction:
          "Use an unrestricted operator token or create the funnel in admin, then issue a token bound to that funnel.",
      },
    }
  );
}

function withReadFunnelScope(
  token: McpToolContext["token"],
  args: Record<string, unknown>
): Record<string, unknown> {
  const funnelId = readOptionalString(args.funnelId);
  const allowedFunnelIds = getMcpTokenAllowedFunnelIds(token);
  if (funnelId) {
    requireMcpTokenFunnelAccess(token, funnelId);
    return args;
  }
  if (allowedFunnelIds.length === 1) {
    return { ...args, funnelId: allowedFunnelIds[0] };
  }
  if (allowedFunnelIds.length > 1) {
    throw new JsonRpcError(
      -32004,
      "This MCP token is bound to multiple funnels; pass funnelId for a scoped operator read.",
      {
        statusCode: 403,
        data: {
          path: "funnelId",
          allowedFunnelIds,
          requiredAction:
            "Pass the funnelId to avoid accidentally reading global operator diagnostics.",
        },
      }
    );
  }
  return args;
}

export const OPERATOR_INTELLIGENCE_MCP_TOOLS: readonly McpToolDefinition[] = [
  createReadTool(
    "operator.flow.route",
    "Route an operator session to the correct advisory flow, intent, required read-back, blocked actions, and proof gates before recommendations, writes, or final claims.",
    operatorFlowRouteSchema,
    async ({ token }, args) => buildOperatorFlowRoute(withReadFunnelScope(token, args))
  ),
  createReadTool(
    "operator.funnels.list",
    "List Funnel Autopilot 2.0 funnels with lane, binding and selection summary counts. Existing read tokens remain valid; future clients may request read.funnels scope.",
    operatorFunnelsListSchema,
    async ({ pool, token }, args) =>
      listOperatorFunnels(pool, {
        status: readOptionalString(args.status),
        allowedFunnelIds: getMcpTokenAllowedFunnelIds(token),
        ...readPageArgs(args),
      })
  ),
  createReadTool(
    "operator.funnels.read",
    "Read one Funnel Autopilot 2.0 funnel with lanes, system-interest bindings, source bindings and template bindings.",
    operatorFunnelsReadSchema,
    async ({ pool, token }, args) => {
      const funnelId = readRequiredString(args.funnelId, "funnelId");
      requireMcpTokenFunnelAccess(token, funnelId);
      const funnel = await readOperatorFunnel(pool, funnelId);
      if (!funnel) {
        throw new JsonRpcError(-32602, "funnelId was not found.", {
          statusCode: 404,
          data: { path: "funnelId" },
        });
      }
      return funnel;
    }
  ),
  createWriteTool(
    "operator.funnels.create",
    "Create a Funnel Autopilot 2.0 funnel shell. Use operator.funnel.autoplan and operator.funnel.stage_plan for guarded setup of lanes, interests, templates, sources and replay.",
    "write.funnels",
    operatorFunnelsCreateSchema,
    async ({ pool, token }, args) => {
      requireUnrestrictedFunnelCreateToken(token, "operator.funnels.create");
      return createOperatorFunnel(pool, token.issuedByUserId, {
        name: readRequiredString(args.name, "name"),
        goal: readOptionalString(args.goal) ?? "",
        status: (readOptionalString(args.status) ?? "draft") as FunnelStatus,
        createdFromIdeaJson: (args.createdFromIdeaJson as Record<string, unknown> | undefined) ?? {},
        defaultPolicyJson: (args.defaultPolicyJson as Record<string, unknown> | undefined) ?? {},
      });
    }
  ),
  createWriteTool(
    "operator.funnels.update",
    "Update Funnel Autopilot 2.0 funnel metadata. This does not mutate lane bindings, source bindings, templates, interests or replay jobs.",
    "write.funnels",
    operatorFunnelsUpdateSchema,
    async ({ pool, token }, args) => {
      const funnelId = readRequiredString(args.funnelId, "funnelId");
      requireMcpTokenFunnelAccess(token, funnelId);
      return updateOperatorFunnel(pool, token.issuedByUserId, {
        funnelId,
        name: readOptionalString(args.name) ?? undefined,
        goal: readOptionalString(args.goal) ?? undefined,
        status: readOptionalString(args.status) as FunnelStatus | undefined,
        defaultPolicyJson: args.defaultPolicyJson as Record<string, unknown> | undefined,
      });
    }
  ),
  createWriteTool(
    "operator.funnels.archive",
    "Archive a Funnel Autopilot 2.0 funnel without deleting shared sources, templates, interests or historical reports.",
    "write.funnels",
    operatorFunnelsArchiveSchema,
    async ({ pool, token }, args) => {
      if (!readBooleanFlag(args.confirm, "confirm")) {
        throw new JsonRpcError(-32602, "confirm=true is required to archive a funnel.", {
          statusCode: 400,
          data: { path: "confirm" },
        });
      }
      const funnelId = readRequiredString(args.funnelId, "funnelId");
      requireMcpTokenFunnelAccess(token, funnelId);
      return archiveOperatorFunnel(pool, token.issuedByUserId, funnelId);
    }
  ),
  createReadTool(
    "operator.system.health",
    "Read DB/API-backed operational health across channels, website pipeline, selection, content analysis, LLM budget, discovery, sequences, and cleanup state.",
    operatorSystemHealthSchema,
    async (context, args) => buildSystemHealth(context, args)
  ),
  createReadTool(
    "operator.issue.explain",
    "Explain a concrete operational symptom with source-of-truth evidence, likely causes, stale-data warnings, and next read-back checks.",
    operatorIssueExplainSchema,
    async (context, args) => explainOperatorIssue(context, args)
  ),
  createReadTool(
    "operator.tuning.recommend",
    "Recommend bounded fine-tuning changes without mutating anything. Returns choices, expected effect, verification plan, and suggested guarded tool calls.",
    operatorTuningRecommendSchema,
    async (context, args) => recommendOperatorTuning(context, withReadFunnelScope(context.token, args))
  ),
  createReadTool(
    "operator.effect.verify",
    "Compare before/after operational metrics for a recent change. This is read-only effect verification, not causal proof.",
    operatorEffectVerifySchema,
    async (context, args) => verifyOperatorEffect(context, withReadFunnelScope(context.token, args))
  ),
  createReadTool(
    "operator.funnel.audit",
    "Read-only funnel calibration audit. Compares reference/manual evidence with live system interests, LLM templates, selection residuals, discovery/source gaps and returns portable recommendations without mutating anything.",
    operatorFunnelAuditSchema,
    async (context, args) => buildFunnelAudit(context, args)
  ),
  createReadTool(
    "operator.funnel.autoplan",
    "Read-only Funnel Autopilot planner. With idea/funnelId it builds Funnel Autopilot 2.0 lanes and guarded plan drafts; without idea it preserves the existing coverage-first source-family planner.",
    operatorFunnelAutoplanSchema,
    async (context, args) => {
      requireMcpTokenFunnelAccess(context.token, readOptionalString(args.funnelId));
      if (
        readOptionalString(args.idea) ||
        readOptionalString(args.funnelId) ||
        readOptionalString(args.operatorExperience)
      ) {
        return buildOperatorFunnelAutoplan(context.pool, args);
      }
      return buildFunnelAutoplan(context, args);
    }
  ),
  createReadTool(
    "operator.funnel.validate_plan",
    "Validate a Funnel Autopilot 2.0 plan before any MCP/admin writes. Blocks stale plans, unsafe hidden gates, mixed-without-split, context-only selection, and bad selection_review contracts.",
    operatorFunnelValidatePlanSchema,
    async ({ pool }, args) =>
      validateOperatorFunnelPlan(pool, {
        plan: args.plan as Record<string, unknown>,
        expectedLiveStateHash: readOptionalString(args.expectedLiveStateHash),
      })
  ),
  createWriteTool(
    "operator.funnel.stage_plan",
    "Stage a validated Funnel Autopilot 2.0 plan. This does not apply system interests, templates, channels or replay jobs; it records planFingerprint/liveStateHash for guarded follow-through.",
    "write.funnels",
    operatorFunnelStagePlanSchema,
    async ({ pool, token }, args) => {
      const funnelId = readOptionalString(args.funnelId);
      if (funnelId) {
        requireMcpTokenFunnelAccess(token, funnelId);
      } else {
        requireUnrestrictedFunnelCreateToken(token, "operator.funnel.stage_plan");
      }
      return stageOperatorFunnelPlan(pool, token.issuedByUserId, {
        funnelId,
        plan: args.plan as Record<string, unknown>,
        expectedLiveStateHash: readOptionalString(args.expectedLiveStateHash),
        expiresAt: readOptionalString(args.expiresAt),
      });
    }
  ),
  createReadTool(
    "operator.funnel.verify",
    "Verify Funnel Autopilot 2.0 state for one funnel or all funnels: bindings, selected/gray/rejected counts, selected reasons and next safe actions.",
    operatorFunnelVerifySchema,
    async ({ pool, token }, args) => {
      const funnelId = readOptionalString(args.funnelId);
      requireMcpTokenFunnelAccess(token, funnelId);
      return verifyOperatorFunnel(pool, {
        funnelId,
        includeSamples: args.includeSamples === true,
        allowedFunnelIds: getMcpTokenAllowedFunnelIds(token),
      });
    }
  ),
  createReadTool(
    "operator.funnels.overlap.audit",
    "Read-only audit for multi-funnel overlap and shared system-interest bindings. Use before changing shared/manual tuning surfaces.",
    operatorFunnelsOverlapAuditSchema,
    async ({ pool, token }, args) => {
      const funnelIds = readStringArray(args.funnelIds);
      for (const funnelId of funnelIds) {
        requireMcpTokenFunnelAccess(token, funnelId);
      }
      return auditOperatorFunnelOverlap(pool, {
        funnelIds,
        allowedFunnelIds: getMcpTokenAllowedFunnelIds(token),
        includeSamples: args.includeSamples === true,
      });
    }
  ),
  createReadTool(
    "operator.funnel.iteration.recommend",
    "Read-only next-step recommendation for a coverage-first funnel iteration. Retains working noisy/low-yield semantic sources unless an operator explicitly disables them.",
    operatorFunnelIterationRecommendSchema,
    async (context, args) => buildFunnelIterationRecommendation(context, args)
  ),
  createReadTool(
    "operator.selection.precision_audit",
    "Read-only selected-content precision audit. Buckets selected rows into strong/probable/context/noise outcomes without creating a separate public selected gate.",
    operatorSelectionPrecisionAuditSchema,
    async (context, args) => buildSelectionPrecisionAudit(context, withReadFunnelScope(context.token, args))
  ),
  createReadTool(
    "operator.selection.dashboard",
    "Read-only count dashboard that separates raw signal_candidate observations from selected/public lead signals. Use this when signal_candidate totals appear inconsistent with selected signal yield.",
    emptyReadSchema,
    async (context, args) => buildSelectionDashboard(context, withReadFunnelScope(context.token, args))
  ),
  createReadTool(
    "operator.selection.reindex_plan",
    "Read-only bounded historical replay planner for final selection. Builds weak_selected, buyer_hold, and context_only docId buckets plus maintenance.reindex.request templates with retroNotifications=skip.",
    operatorSelectionReindexPlanSchema,
    async (context, args) => {
      requireMcpTokenFunnelAccess(context.token, readOptionalString(args.funnelId));
      return buildSelectionReindexPlan(context, args);
    }
  ),
  createReadTool(
    "discovery.source_families.coverage",
    "Read-only Discovery vNext source-family coverage report for coverage-first gap hunting.",
    discoverySourceFamiliesCoverageSchema,
    async (context, args) =>
      getSourceFamilyCoverageWithPool(context.pool, { includeExamples: args.includeExamples === true })
  ),
];


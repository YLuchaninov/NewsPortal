import {
  MCP_CONTENT_ANALYSIS_ARGUMENT_SCHEMAS,
  assertJsonSchema,
  validateJsonSchema,
  type JsonSchema,
} from "@signalops/contracts";
import { buildProviderShapeValidation, getSourceFamilyCoverageWithPool } from "@signalops/control-plane";

import { ADMIN_MCP_TOOLS } from "./tools/admin-tools";
import { CHANNEL_MCP_TOOLS } from "./tools/channels-tools";
import { CONTENT_MCP_TOOLS } from "./tools/content-tools";
import { DISCOVERY_MCP_TOOLS } from "./tools/discovery-tools";
import { INGRESS_ADAPTER_MCP_TOOLS } from "./tools/ingress-adapters-tools";
import { SEQUENCE_MCP_TOOLS } from "./tools/sequences-tools";
import { TEMPLATE_MCP_TOOLS } from "./tools/templates-tools";
import {
  JsonRpcError,
  createReadTool,
  createWriteTool,
  detailSchema,
  pagingSchema,
  readBooleanFlag,
  readOptionalString,
  readPageArgs,
  readPayload,
  readRequiredString,
  requireDestructiveConfirmation,
  requireScope,
  writeMcpMutationAudit,
  type McpToolContext,
  type McpToolDefinition,
} from "./tools/shared";
import {
  MCP_STRUCTURED_OUTPUT_SCHEMA,
  buildToolAnnotations,
  buildToolDescription,
} from "./context";
import {
  expectedShapeForSchema,
  normalizeContentAnalysisBackfillPayload,
  readEntityIds,
  readStringArray,
} from "./tools/content-analysis-helpers";
import {
  OPERATING_DOMAIN_VALUES,
  OPERATING_REPORT_KINDS,
  EVIDENCE_LANE_TYPE_VALUES,
  HARD_GATE_POLICY_VALUES,
  OPERATOR_CHANGE_INTENT_VALUES,
  OPERATOR_CLEANUP_INTENT_VALUES,
  OPERATOR_FLOW_SYMPTOM_VALUES,
  OPERATOR_FLOW_MODE_VALUES,
  OPERATOR_TUNING_LAYER_VALUES,
  OPERATOR_UPDATE_RISK_VALUES,
  SIGNAL_VISIBILITY_VALUES,
  buildFunnelAudit,
  buildFunnelAutoplan,
  buildFunnelIterationRecommendation,
  buildOperatorFlowRoute,
  buildOperationalReportVerification,
  buildSelectionPrecisionAudit,
  buildSelectionDashboard,
  buildSelectionReindexPlan,
  buildSystemHealth,
  explainOperatorIssue,
  nextReadBackForTool,
  recommendOperatorTuning,
  verifyOperatorEffect,
} from "./operating-intelligence";

const operatorReportVerifySchema = {
  type: "object",
  required: ["reportKind", "entityIds"],
  properties: {
    reportKind: {
      type: "string",
      enum: [
        "channel_onboarding",
        "discovery_run",
        "cleanup",
        "selection",
        ...OPERATING_REPORT_KINDS,
      ],
    },
    entityIds: {
      type: "object",
      properties: {
        channelIds: { type: "array", items: { type: "string" } },
        targetIds: { type: "array", items: { type: "string" } },
        runIds: { type: "array", items: { type: "string" } },
        artifactIds: { type: "array", items: { type: "string" } },
        candidateIds: { type: "array", items: { type: "string" } },
        sourceInventoryIds: { type: "array", items: { type: "string" } },
        endpointIds: { type: "array", items: { type: "string" } },
        contractIds: { type: "array", items: { type: "string" } },
        docIds: { type: "array", items: { type: "string" } },
        domainPrefix: { type: "string" },
      },
      additionalProperties: false,
    },
    includeSamples: { type: "boolean" },
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
  },
  additionalProperties: false,
} satisfies JsonSchema;

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
  required: ["objective"],
  properties: {
    objective: { type: "string" },
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
  },
  additionalProperties: false,
} satisfies JsonSchema;

const emptyReadSchema = {
  type: "object",
  properties: {},
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

const OPERATOR_INTELLIGENCE_MCP_TOOLS: readonly McpToolDefinition[] = [
  createReadTool(
    "operator.flow.route",
    "Route an operator session to the correct advisory flow, intent, required read-back, blocked actions, and proof gates before recommendations, writes, or final claims.",
    operatorFlowRouteSchema,
    async (_context, args) => buildOperatorFlowRoute(args)
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
    async (context, args) => recommendOperatorTuning(context, args)
  ),
  createReadTool(
    "operator.effect.verify",
    "Compare before/after operational metrics for a recent change. This is read-only effect verification, not causal proof.",
    operatorEffectVerifySchema,
    async (context, args) => verifyOperatorEffect(context, args)
  ),
  createReadTool(
    "operator.funnel.audit",
    "Read-only funnel calibration audit. Compares reference/manual evidence with live system interests, LLM templates, selection residuals, discovery/source gaps and returns portable recommendations without mutating anything.",
    operatorFunnelAuditSchema,
    async (context, args) => buildFunnelAudit(context, args)
  ),
  createReadTool(
    "operator.funnel.autoplan",
    "Read-only coverage-first funnel planner. Builds source-family, polling, repair, negative-control, and selection-tuning guidance without disabling noisy working sources.",
    operatorFunnelAutoplanSchema,
    async (context, args) => buildFunnelAutoplan(context, args)
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
    async (context, args) => buildSelectionPrecisionAudit(context, args)
  ),
  createReadTool(
    "operator.selection.dashboard",
    "Read-only count dashboard that separates raw signal_candidate observations from selected/public lead signals. Use this when signal_candidate totals appear inconsistent with selected signal yield.",
    emptyReadSchema,
    async (context) => buildSelectionDashboard(context)
  ),
  createReadTool(
    "operator.selection.reindex_plan",
    "Read-only bounded historical replay planner for final selection. Builds weak_selected, buyer_hold, and context_only docId buckets plus maintenance.reindex.request templates with retroNotifications=skip.",
    operatorSelectionReindexPlanSchema,
    async (context, args) => buildSelectionReindexPlan(context, args)
  ),
  createReadTool(
    "discovery.source_families.coverage",
    "Read-only Discovery vNext source-family coverage report for coverage-first gap hunting.",
    discoverySourceFamiliesCoverageSchema,
    async (context, args) =>
      getSourceFamilyCoverageWithPool(context.pool, { includeExamples: args.includeExamples === true })
  ),
];

const OPERATOR_REPORT_MCP_TOOLS: readonly McpToolDefinition[] = [
  createReadTool(
    "operator.report.verify",
    "Verify an operator report against DB-backed state before giving a final answer. Use this after onboarding channels, discovery runs, cleanup, or selection claims.",
    operatorReportVerifySchema,
    async (context, args) => {
      const { pool } = context;
      const reportKind = readRequiredString(args.reportKind, "reportKind");
      const entityIds = readEntityIds(args);
      const includeSamples = args.includeSamples === true;
      const warnings: string[] = [];
      const flowContext = {
        operationMode: args.operationMode,
        operatorOverrideReason: args.operatorOverrideReason,
        affectedScope: args.affectedScope,
        changeIntent: args.changeIntent,
        cleanupIntent: args.cleanupIntent,
        tuningLayer: args.tuningLayer,
        updateRisk: args.updateRisk,
        signalVisibility: args.signalVisibility,
        evidenceLaneType: args.evidenceLaneType,
        hardGatePolicy: args.hardGatePolicy,
      };

      if ((OPERATING_REPORT_KINDS as readonly string[]).includes(reportKind) || reportKind === "selection") {
        return buildOperationalReportVerification(context, reportKind, entityIds, includeSamples, flowContext);
      }

      if (reportKind === "channel_onboarding") {
        const channelIds = readStringArray(entityIds.channelIds);
        const channels = await pool.query(
          `
            select sc.channel_id::text as "channelId",
                   sc.name,
                   sc.provider_type as "providerType",
                   sc.is_active as "isActive",
                   sc.fetch_url as "fetchUrl",
                   sc.updated_at as "updatedAt",
                   (select count(*)::int from signal_candidates a where a.channel_id = sc.channel_id) as "signalCandidateCount",
                   (select count(*)::int from web_resources wr where wr.channel_id = sc.channel_id) as "webResourceCount",
                   (select count(*)::int from channel_fetch_runs cfr where cfr.channel_id = sc.channel_id) as "fetchRunCount"
            from source_channels sc
            where cardinality($1::text[]) = 0 or sc.channel_id::text = any($1::text[])
            order by sc.updated_at desc
            limit 50
          `,
          [channelIds]
        );
        const providerCounts = await pool.query(
          `
            select provider_type as "providerType",
                   is_active as "isActive",
                   count(*)::int as count
            from source_channels
            group by provider_type, is_active
            order by provider_type, is_active desc
          `
        );
        if (channelIds.length > 0 && channels.rows.length !== channelIds.length) {
          warnings.push("Some requested channelIds were not found in source_channels.");
        }
        const providerShapeRisks = channels.rows
          .map((row) => ({
            channelId: row.channelId,
            name: row.name,
            providerType: row.providerType,
            fetchUrl: row.fetchUrl,
            validation: buildProviderShapeValidation(
              String(row.providerType ?? ""),
              String(row.fetchUrl ?? "")
            ),
          }))
          .filter((row) => row.validation.blocker);
        if (providerShapeRisks.length > 0) {
          warnings.push(
            `${providerShapeRisks.length} channel${providerShapeRisks.length === 1 ? "" : "s"} have provider-shape blockers; use channels.alternatives.plan before interpreting them as source-quality failures.`
          );
        }
        return {
          reportKind,
          verifiedAt: new Date().toISOString(),
          staleReportNotes: warnings,
          counts: {
            requestedChannels: channelIds.length,
            foundChannels: channels.rows.length,
            byProvider: providerCounts.rows,
          },
          channels: channels.rows,
          providerShapeRisks,
        };
      }

      if (reportKind === "discovery_run") {
        const runIds = readStringArray(entityIds.runIds);
        const artifactIds = readStringArray(entityIds.artifactIds);
        const candidateIds = readStringArray(entityIds.candidateIds);
        const inventoryIds = readStringArray(entityIds.sourceInventoryIds);
        const hasEntityFilters = runIds.length + artifactIds.length + candidateIds.length + inventoryIds.length > 0;
        const runs = await pool.query(
          `
            select vnext_run_id::text as "runId",
                   run_kind as "runKind", trigger_kind as "triggerKind",
                   status, started_at as "startedAt", completed_at as "completedAt",
                   error_json as "errorJson", result_json as "resultJson", created_at as "createdAt"
            from discovery_vnext_runs
            where (cardinality($1::text[]) = 0 and $2 = false) or vnext_run_id::text = any($1::text[])
            order by created_at desc
            limit 25
          `,
          [runIds, hasEntityFilters]
        );
        const artifacts = await pool.query(
          `
            select artifact_id::text as "artifactId",
                   vnext_run_id::text as "runId",
                   artifact_type as "artifactType",
                   status,
                   policy_version as "policyVersion",
                   validation_json as "validationJson",
                   created_at as "createdAt"
            from discovery_artifacts
            where
              (
                (cardinality($1::text[]) = 0 and cardinality($2::text[]) = 0 and $3 = false)
                or vnext_run_id::text = any($1::text[])
                or artifact_id::text = any($2::text[])
              )
            order by created_at desc
            limit 25
          `,
          [runIds, artifactIds, hasEntityFilters]
        );
        const candidateStatusCounts = await pool.query(
          `
            select vnext_run_id::text as "runId",
                   status,
                   candidate_kind_guess as "candidateKindGuess",
                   count(*)::int as count
            from discovery_candidates
            where
              (
                (cardinality($1::text[]) = 0 and cardinality($2::text[]) = 0 and $3 = false)
                or vnext_run_id::text = any($1::text[])
                or candidate_id::text = any($2::text[])
              )
            group by vnext_run_id, status, candidate_kind_guess
            order by vnext_run_id, status, candidate_kind_guess
          `,
          [runIds, candidateIds, hasEntityFilters]
        );
        const inventoryStateCounts = await pool.query(
          `
            select current_state as "currentState",
                   current_provider_type as "providerType",
                   count(*)::int as count
            from source_inventory
            where
              (cardinality($1::text[]) = 0 and $2 = false)
              or source_inventory_id::text = any($1::text[])
            group by current_state, current_provider_type
            order by current_state, current_provider_type
          `,
          [inventoryIds, hasEntityFilters]
        );
        const adapterBacklogCounts = await pool.query(
          `
            select status, adapter_need as "adapterNeed", priority,
                   count(*)::int as count
            from adapter_backlog
            where
              (
                (cardinality($1::text[]) = 0 and cardinality($2::text[]) = 0 and $3 = false)
                or source_inventory_id::text = any($1::text[])
                or candidate_id::text = any($2::text[])
              )
            group by status, adapter_need, priority
            order by status, adapter_need, priority
          `,
          [inventoryIds, candidateIds, hasEntityFilters]
        );
        const recentObservations = await pool.query(
          `
            select so.source_inventory_id::text as "sourceInventoryId",
                   so.observation_kind as "observationKind",
                   so.observation_json as "observationJson",
                   so.observed_at as "observedAt"
            from source_observations so
            where (cardinality($1::text[]) = 0 and $2 = false) or so.source_inventory_id::text = any($1::text[])
            order by so.observed_at desc
            limit 25
          `,
          [inventoryIds, hasEntityFilters],
        );
        const runningRows = runs.rows.filter((row) =>
          ["queued", "running"].includes(String(row.status ?? ""))
        );
        if (runIds.length > 0 && runs.rows.length !== runIds.length) {
          warnings.push("Some requested discovery runIds were not found.");
        }
        if (runningRows.length > 0) {
          warnings.push(
            "Some discovery runs are still queued/running; report the discovery as in progress, not completed."
          );
        }
        const failedRows = runs.rows.filter(
          (row) => String(row.status ?? "") === "failed"
        );
        if (failedRows.length > 0) {
          warnings.push(
            "Some discovery vNext runs failed; inspect errorJson, artifacts, observations and adapter backlog before claiming coverage."
          );
        }
        const pendingInventoryCount = inventoryStateCounts.rows
          .filter((row) => ["manual_review", "adapter_backlog", "cheap_watch"].includes(String(row.currentState ?? "")))
          .reduce((sum, row) => sum + Number(row.count ?? 0), 0);
        if (pendingInventoryCount > 0) {
          warnings.push(
            `${pendingInventoryCount} discovery inventory rows still need watch/backlog/manual follow-up; do not report source onboarding as complete.`
          );
        }
        return {
          reportKind,
          verifiedAt: new Date().toISOString(),
          staleReportNotes: warnings,
          counts: {
            runs: runs.rows.length,
            artifacts: artifacts.rows.length,
            observationSamples: recentObservations.rows.length,
          },
          runs: runs.rows,
          artifacts: artifacts.rows,
          candidateStatusCounts: candidateStatusCounts.rows,
          inventoryStateCounts: inventoryStateCounts.rows,
          adapterBacklogCounts: adapterBacklogCounts.rows,
          recentObservations: includeSamples ? recentObservations.rows : [],
        };
      }

      if (reportKind === "cleanup") {
        const counts = await pool.query(
          `
            select
              (select count(*)::int from source_channels where is_active = true) as "activeChannels",
              (select count(*)::int from interest_templates where is_active = true) as "activeSystemInterests",
              (select count(*)::int from llm_prompt_templates where is_active = true) as "activeLlmTemplates",
              (select count(*)::int from discovery_vnext_runs where status in ('queued', 'running')) as "activeDiscoveryRuns",
              (select count(*)::int from source_inventory where current_state = 'probation_channel') as "probationDiscoverySources",
              (select count(*)::int from adapter_backlog where status in ('open', 'planned')) as "openAdapterBacklogItems",
              (select count(*)::int from sequences where status in ('draft', 'active')) as "activeSequences",
              (select count(*)::int from mcp_access_tokens where status = 'active' and (expires_at is null or expires_at > now())) as "activeMcpTokens"
          `
        );
        const protectedObjects = includeSamples
          ? await pool.query(
              `
                select 'sequence' as kind, sequence_id::text as id, title as name, created_by as "createdBy"
                from sequences
                where created_by like 'migration:%'
                order by kind, name
                limit 50
              `
            )
          : { rows: [] };
        return {
          reportKind,
          verifiedAt: new Date().toISOString(),
          flowMode: args.operationMode ?? "cleanup",
          changeIntent: args.changeIntent ?? null,
          cleanupIntent: args.cleanupIntent ?? null,
          tuningLayer: args.tuningLayer ?? null,
          updateRisk: args.updateRisk ?? null,
          proofStatus:
            args.operationMode === "expert_override" && !readOptionalString(args.operatorOverrideReason)
              ? "blocked"
              : "partial",
          missingProof:
            args.operationMode === "expert_override" && !readOptionalString(args.operatorOverrideReason)
              ? ["operatorOverrideReason is required before treating expert override cleanup as allowed."]
              : ["Cleanup proof requires inventory, lifecycle read-back and cleanup report verification."],
          operatorOverrideNotes:
            args.operationMode === "expert_override"
              ? [
                  readOptionalString(args.operatorOverrideReason)
                    ? `Expert override requested: ${readOptionalString(args.operatorOverrideReason)}.`
                    : "Expert override is blocked until operatorOverrideReason is supplied.",
                  "Override cannot skip final MCP read-back or cleanup report verification.",
                ]
              : ["Use expert_override only when an experienced operator explicitly chooses to deviate from cleanup flow."],
          intentSequence: [
            "read inventory for the affected entities",
            "classify retained evidence, reversible archive/deactivate actions, and destructive actions",
            "archive or deactivate before deleting whenever lineage matters",
            "use destructive tools only with existing scopes and confirm=true",
            "read back final lifecycle state and run operator.report.verify reportKind=cleanup",
          ],
          intentGuardrails: [
            "Do not delete retained audit evidence, protected system objects, or unknown artifacts from a cleanup label alone.",
            "Cleanup proof is lifecycle-state proof, not selection or source-quality proof.",
          ],
          intentProofRequired: [
            "admin.summary.get or relevant list/read inventory",
            "read-back after archive/deactivate/delete/revoke",
            "operator.report.verify reportKind=cleanup",
          ],
          intentBlockedUntil: [
            "Blocked until inventory, chosen reversible/destructive action list, read-back and cleanup report verification exist.",
          ],
          intentWarnings: [
            args.cleanupIntent
              ? `cleanupIntent=${String(args.cleanupIntent)} is advisory and does not bypass destructive confirmation.`
              : "cleanupIntent is optional, but clients should name it before broad cleanup recommendations.",
          ],
          staleReportNotes: warnings,
          counts: counts.rows[0] ?? {},
          protectedObjects: protectedObjects.rows,
        };
      }

      const docIds = readStringArray(entityIds.docIds);
      const selections = await pool.query(
        `
          select doc_id as "docId", final_decision as "finalDecision",
                 is_selected as "isSelected", verification_state as "verificationState",
                 matched_filter_count as "matchedFilterCount",
                 no_match_filter_count as "noMatchFilterCount",
                 gray_zone_filter_count as "grayZoneFilterCount",
                 updated_at as "updatedAt"
          from final_selection_results
          where cardinality($1::text[]) = 0 or doc_id::text = any($1::text[])
          order by updated_at desc
          limit $2
        `,
        [docIds, includeSamples ? 25 : 5]
      );
      const selectionCounts = await pool.query(
        `
          select final_decision as "finalDecision", count(*)::int as count
          from final_selection_results
          where cardinality($1::text[]) = 0 or doc_id::text = any($1::text[])
          group by final_decision
          order by final_decision
        `,
        [docIds]
      );
      const stalePassThrough = await pool.query(
        `
          select count(*)::int as "stalePassThroughCount"
          from final_selection_results fsr
          where (cardinality($1::text[]) = 0 or fsr.doc_id::text = any($1::text[]))
            and fsr.total_filter_count = 0
            and (
              fsr.is_selected = true
              or fsr.final_decision = 'selected'
              or fsr.compat_system_feed_decision = 'pass_through'
            )
            and not exists (
              select 1
              from interest_filter_results ifr
              where ifr.doc_id = fsr.doc_id
                and ifr.filter_scope = 'system_criterion'
            )
        `,
        [docIds]
      );
      const stalePassThroughSamples = includeSamples
        ? await pool.query(
            `
              select fsr.doc_id::text as "docId",
                     fsr.final_decision as "finalDecision",
                     fsr.compat_system_feed_decision as "compatSystemFeedDecision",
                     fsr.total_filter_count as "totalFilterCount",
                     fsr.updated_at as "updatedAt"
              from final_selection_results fsr
              where (cardinality($1::text[]) = 0 or fsr.doc_id::text = any($1::text[]))
                and fsr.total_filter_count = 0
                and (
                  fsr.is_selected = true
                  or fsr.final_decision = 'selected'
                  or fsr.compat_system_feed_decision = 'pass_through'
                )
                and not exists (
                  select 1
                  from interest_filter_results ifr
                  where ifr.doc_id = fsr.doc_id
                    and ifr.filter_scope = 'system_criterion'
                )
              order by fsr.updated_at desc
              limit 25
            `,
            [docIds]
          )
        : { rows: [] };
      const stalePassThroughCount = Number(
        stalePassThrough.rows[0]?.stalePassThroughCount ?? 0
      );
      if (stalePassThroughCount > 0) {
        warnings.push(
          "Stale selected/pass_through rows with total_filter_count=0 and no system_criterion interest_filter_results detected; likely selection backfill needed via maintenance.reindex.request jobKind=backfill."
        );
      }
      if (docIds.length > 0 && selections.rows.length !== docIds.length) {
        warnings.push("Some requested docIds were not found in final_selection_results.");
      }
      return {
        reportKind,
        verifiedAt: new Date().toISOString(),
        staleReportNotes: warnings,
        counts: {
          requestedDocs: docIds.length,
          foundSelections: selections.rows.length,
          byDecision: selectionCounts.rows,
          stalePassThroughCount,
        },
        selections: selections.rows,
        stalePassThroughSelections: stalePassThroughSamples.rows,
        recommendedAction:
          stalePassThroughCount > 0
            ? {
                tool: "maintenance.reindex.request",
                arguments: {
                  payload: {
                    indexName: "interest_centroids",
                    jobKind: "backfill",
                  },
                },
                reason:
                  "Replay existing signal_candidates through current system-interest criteria to refresh interest_filter_results and final_selection_results.",
              }
            : null,
      };
    }
  ),
];

export type { McpToolContext, McpToolDefinition } from "./tools/shared";

const CONTENT_ANALYSIS_MCP_TOOLS: readonly McpToolDefinition[] = [
  createReadTool(
    "content_analysis.list",
    "List persisted content analysis results.",
    {
      type: "object",
      properties: {
        page: { type: "number" },
        pageSize: { type: "number" },
        subjectType: { type: "string" },
        subjectId: { type: "string" },
        analysisType: { type: "string" },
        status: { type: "string" },
      },
      additionalProperties: false,
    },
    async ({ sdk }, args) =>
      sdk.listContentAnalysisResultsPage<Record<string, unknown>>({
        ...readPageArgs(args),
        subjectType: readOptionalString(args.subjectType) ?? undefined,
        subjectId: readOptionalString(args.subjectId) ?? undefined,
        analysisType: readOptionalString(args.analysisType) ?? undefined,
        status: readOptionalString(args.status) ?? undefined,
      })
  ),
  createReadTool(
    "content_analysis.read",
    "Read one persisted content analysis result.",
    detailSchema,
    async ({ sdk }, args) =>
      sdk.getContentAnalysisResult<Record<string, unknown>>(
        readRequiredString(args.analysisId, "analysisId")
      )
  ),
  createReadTool(
    "content_analysis_policies.list",
    "List content analysis module policies.",
    {
      type: "object",
      properties: {
        page: { type: "number" },
        pageSize: { type: "number" },
        module: { type: "string" },
      },
      additionalProperties: false,
    },
    async ({ sdk }, args) =>
      sdk.listContentAnalysisPoliciesPage<Record<string, unknown>>({
        ...readPageArgs(args),
        module: readOptionalString(args.module) ?? undefined,
      })
  ),
  createReadTool(
    "content_analysis_policies.read",
    "Read one content analysis module policy.",
    detailSchema,
    async ({ sdk }, args) =>
      sdk.getContentAnalysisPolicy<Record<string, unknown>>(
        readRequiredString(args.policyId, "policyId")
      )
  ),
  createWriteTool(
    "content_analysis.backfill.request",
    "Queue safe content-analysis replay for existing content. This refreshes NER/entities, sentiment, category, system-interest labels, and content-filter evidence only; it does not recompute signal_candidate.match_criteria, interest_filter_results, or final_selection_results. For old signal_candidates/current interests/selected or pass_through noise, use maintenance.reindex.request with jobKind=backfill. Default modules exclude structured_extraction; request that module explicitly when an LLM-backed extraction policy should run.",
    "write.sequences",
    MCP_CONTENT_ANALYSIS_ARGUMENT_SCHEMAS.backfillRequest,
    async ({ sdk, pool, token }, args) => {
      const payload =
        args.payload == null ? {} : normalizeContentAnalysisBackfillPayload(readPayload(args));
      const queued = await sdk.requestContentAnalysisBackfill<Record<string, unknown>>(payload);
      await writeMcpMutationAudit(pool, token, {
        actionType: "content_analysis_backfill_requested",
        entityType: "reindex_job",
        entityId: readOptionalString(queued.reindexJobId),
        payloadJson: { payload, queued },
      });
      return {
        ...queued,
        warnings: [
          "Content analysis backfill only refreshes analysis/label/filter evidence.",
          "It does not recompute signal_candidate.match_criteria, interest_filter_results, or final_selection_results; use maintenance.reindex.request jobKind=backfill for selection replay.",
        ],
      };
    }
  ),
  createReadTool(
    "content_entities.list",
    "List queryable NER entities.",
    {
      type: "object",
      properties: {
        page: { type: "number" },
        pageSize: { type: "number" },
        subjectType: { type: "string" },
        subjectId: { type: "string" },
        entityType: { type: "string" },
        entityText: { type: "string" },
        normalizedKey: { type: "string" },
      },
      additionalProperties: false,
    },
    async ({ sdk }, args) =>
      sdk.listContentEntitiesPage<Record<string, unknown>>({
        ...readPageArgs(args),
        subjectType: readOptionalString(args.subjectType) ?? undefined,
        subjectId: readOptionalString(args.subjectId) ?? undefined,
        entityType: readOptionalString(args.entityType) ?? undefined,
        entityText: readOptionalString(args.entityText) ?? undefined,
        normalizedKey: readOptionalString(args.normalizedKey) ?? undefined,
      })
  ),
  createReadTool(
    "content_labels.list",
    "List queryable content labels such as system-interest projections.",
    {
      type: "object",
      properties: {
        page: { type: "number" },
        pageSize: { type: "number" },
        subjectType: { type: "string" },
        subjectId: { type: "string" },
        labelType: { type: "string" },
        labelKey: { type: "string" },
        decision: { type: "string" },
      },
      additionalProperties: false,
    },
    async ({ sdk }, args) =>
      sdk.listContentLabelsPage<Record<string, unknown>>({
        ...readPageArgs(args),
        subjectType: readOptionalString(args.subjectType) ?? undefined,
        subjectId: readOptionalString(args.subjectId) ?? undefined,
        labelType: readOptionalString(args.labelType) ?? undefined,
        labelKey: readOptionalString(args.labelKey) ?? undefined,
        decision: readOptionalString(args.decision) ?? undefined,
      })
  ),
  createReadTool(
    "content_filter_policies.list",
    "List content filter/gate policies.",
    pagingSchema,
    async ({ sdk }, args) =>
      sdk.listContentFilterPoliciesPage<Record<string, unknown>>(readPageArgs(args))
  ),
  createReadTool(
    "content_filter_policies.read",
    "Read one content filter/gate policy.",
    detailSchema,
    async ({ sdk }, args) =>
      sdk.getContentFilterPolicy<Record<string, unknown>>(
        readRequiredString(args.filterPolicyId, "filterPolicyId")
      )
  ),
  createReadTool(
    "content_filter_results.list",
    "List persisted content filter/gate decisions.",
    {
      type: "object",
      properties: {
        page: { type: "number" },
        pageSize: { type: "number" },
        subjectType: { type: "string" },
        subjectId: { type: "string" },
        policyKey: { type: "string" },
        decision: { type: "string" },
        passed: { type: "boolean" },
      },
      additionalProperties: false,
    },
    async ({ sdk }, args) =>
      sdk.listContentFilterResultsPage<Record<string, unknown>>({
        ...readPageArgs(args),
        subjectType: readOptionalString(args.subjectType) ?? undefined,
        subjectId: readOptionalString(args.subjectId) ?? undefined,
        policyKey: readOptionalString(args.policyKey) ?? undefined,
        decision: readOptionalString(args.decision) ?? undefined,
        passed: typeof args.passed === "boolean" ? args.passed : undefined,
      })
  ),
  createWriteTool(
    "content_analysis_policies.create",
    "Create a content analysis module policy through the maintenance API.",
    "write.sequences",
    MCP_CONTENT_ANALYSIS_ARGUMENT_SCHEMAS.policyCreate,
    async ({ sdk, pool, token }, args) => {
      const payload = readPayload(args);
      const created = await sdk.createContentAnalysisPolicy<Record<string, unknown>>(payload);
      await writeMcpMutationAudit(pool, token, {
        actionType: "content_analysis_policy_created",
        entityType: "content_analysis_policy",
        entityId: readOptionalString(created.policy_id),
        payloadJson: { payload },
      });
      return created;
    }
  ),
  createWriteTool(
    "content_analysis_policies.update",
    "Update a content analysis module policy through the maintenance API.",
    "write.sequences",
    MCP_CONTENT_ANALYSIS_ARGUMENT_SCHEMAS.policyUpdate,
    async ({ sdk, pool, token }, args) => {
      const policyId = readRequiredString(args.policyId, "policyId");
      const payload = readPayload(args);
      if (
        payload.mode === "enforce" &&
        readBooleanFlag(payload.confirmEnforce, "confirmEnforce") !== true
      ) {
        throw new JsonRpcError(-32602, "confirmEnforce=true is required for enforce mode.", {
          statusCode: 400,
        });
      }
      delete payload.confirmEnforce;
      const updated = await sdk.updateContentAnalysisPolicy<Record<string, unknown>>(
        policyId,
        payload
      );
      await writeMcpMutationAudit(pool, token, {
        actionType: "content_analysis_policy_updated",
        entityType: "content_analysis_policy",
        entityId: policyId,
        payloadJson: { payload },
      });
      return updated;
    }
  ),
  createWriteTool(
    "content_filter_policies.create",
    "Create a content filter/gate policy through the maintenance API.",
    "write.sequences",
    MCP_CONTENT_ANALYSIS_ARGUMENT_SCHEMAS.filterPolicyCreate,
    async ({ sdk, pool, token }, args) => {
      const payload = readPayload(args);
      const created = await sdk.createContentFilterPolicy<Record<string, unknown>>(payload);
      await writeMcpMutationAudit(pool, token, {
        actionType: "content_filter_policy_created",
        entityType: "content_filter_policy",
        entityId: readOptionalString(created.filter_policy_id),
        payloadJson: { payload },
      });
      return created;
    }
  ),
  createWriteTool(
    "content_filter_policies.update",
    "Update a content filter/gate policy through the maintenance API.",
    "write.sequences",
    MCP_CONTENT_ANALYSIS_ARGUMENT_SCHEMAS.filterPolicyUpdate,
    async ({ sdk, pool, token }, args) => {
      const filterPolicyId = readRequiredString(args.filterPolicyId, "filterPolicyId");
      const payload = readPayload(args);
      if (
        payload.mode === "enforce" &&
        readBooleanFlag(payload.confirmEnforce, "confirmEnforce") !== true
      ) {
        throw new JsonRpcError(-32602, "confirmEnforce=true is required for enforce mode.", {
          statusCode: 400,
        });
      }
      delete payload.confirmEnforce;
      const updated = await sdk.updateContentFilterPolicy<Record<string, unknown>>(
        filterPolicyId,
        payload
      );
      await writeMcpMutationAudit(pool, token, {
        actionType: "content_filter_policy_updated",
        entityType: "content_filter_policy",
        entityId: filterPolicyId,
        payloadJson: { payload },
      });
      return updated;
    }
  ),
  createWriteTool(
    "content_filter_policies.preview",
    "Preview current persisted impact for a content filter/gate policy.",
    "write.sequences",
    MCP_CONTENT_ANALYSIS_ARGUMENT_SCHEMAS.filterPolicyPreview,
    async ({ sdk }, args) =>
      sdk.previewContentFilterPolicy<Record<string, unknown>>(
        readRequiredString(args.filterPolicyId, "filterPolicyId"),
        args.payload && typeof args.payload === "object" ? args.payload : {}
      )
  ),
] as const;

export const MCP_TOOLS: readonly McpToolDefinition[] = [
  ...ADMIN_MCP_TOOLS,
  ...TEMPLATE_MCP_TOOLS,
  ...CHANNEL_MCP_TOOLS,
  ...INGRESS_ADAPTER_MCP_TOOLS,
  ...CONTENT_MCP_TOOLS,
  ...SEQUENCE_MCP_TOOLS,
  ...DISCOVERY_MCP_TOOLS,
  ...CONTENT_ANALYSIS_MCP_TOOLS,
  ...OPERATOR_INTELLIGENCE_MCP_TOOLS,
  ...OPERATOR_REPORT_MCP_TOOLS,
] as const;

export function listMcpTools() {
  return MCP_TOOLS.map((tool) => ({
    name: tool.name,
    title: buildToolAnnotations(tool).title,
    description: buildToolDescription(tool),
    inputSchema: tool.inputSchema,
    outputSchema: MCP_STRUCTURED_OUTPUT_SCHEMA,
    annotations: buildToolAnnotations(tool),
  }));
}

export function resolveMcpTool(name: string): McpToolDefinition {
  const normalized = readRequiredString(name, "name");
  const tool = MCP_TOOLS.find((entry) => entry.name === normalized);
  if (!tool) {
    throw new JsonRpcError(-32601, `Unknown MCP tool "${normalized}".`, {
      statusCode: 404,
    });
  }
  return tool;
}

export async function executeMcpTool(
  context: McpToolContext,
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const tool = resolveMcpTool(name);
  await requireScope(context.token, tool.requiredScope);
  if (
    args.payload != null &&
    typeof args.payload === "object" &&
    !Array.isArray(args.payload) &&
    Object.prototype.hasOwnProperty.call(args.payload, "payload")
  ) {
    throw new JsonRpcError(
      -32602,
      `MCP tool "${tool.name}" arguments failed schema validation: payload.payload is not allowed.`,
      {
        statusCode: 400,
        data: {
          tool: tool.name,
          path: "payload.payload",
          code: "nested_payload_not_allowed",
          expectedShape: "arguments.payload must be the API payload object, not an envelope.",
        },
      }
    );
  }
  const argumentIssues = validateJsonSchema(args, tool.inputSchema);
  if (argumentIssues.length > 0) {
    const firstIssue = argumentIssues[0];
    throw new JsonRpcError(
      -32602,
      `MCP tool "${tool.name}" arguments failed schema validation: ${firstIssue?.message ?? "invalid arguments."}`,
      {
        statusCode: 400,
        data: {
          tool: tool.name,
          path: firstIssue?.path ?? "$",
          code: firstIssue?.code ?? "invalid_arguments",
          expectedShape: expectedShapeForSchema(tool.inputSchema),
        },
      }
    );
  }
  if (tool.destructive) {
    requireDestructiveConfirmation(context.token, args);
  }
  const result = await tool.handler(context, args);
  if (tool.outputSchema) {
    try {
      assertJsonSchema(result, tool.outputSchema, {
        boundaryName: `MCP tool "${tool.name}" result`,
      });
    } catch (error) {
      throw new JsonRpcError(
        -32603,
        error instanceof Error ? error.message : "MCP tool result failed schema validation.",
        {
          statusCode: 500,
          data: {
            tool: tool.name,
          },
        }
      );
    }
  }
  if (tool.requiredScope !== "read") {
    const readBack = nextReadBackForTool(tool.name);
    if (
      Object.keys(readBack).length > 0 &&
      result != null &&
      typeof result === "object" &&
      !Array.isArray(result)
    ) {
      return {
        ...(result as Record<string, unknown>),
        ...readBack,
      };
    }
  }
  return result;
}

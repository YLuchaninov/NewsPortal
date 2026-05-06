import {
  MCP_CONTENT_ANALYSIS_ARGUMENT_SCHEMAS,
  assertJsonSchema,
  validateJsonSchema,
  type JsonSchema,
} from "@newsportal/contracts";

import { ADMIN_MCP_TOOLS } from "./tools/admin-tools";
import { CHANNEL_MCP_TOOLS } from "./tools/channels-tools";
import { CONTENT_MCP_TOOLS } from "./tools/content-tools";
import { DISCOVERY_MCP_TOOLS } from "./tools/discovery-tools";
import { SEQUENCE_MCP_TOOLS } from "./tools/sequences-tools";
import { TEMPLATE_MCP_TOOLS } from "./tools/templates-tools";
import {
  JsonRpcError,
  createReadTool,
  createWriteTool,
  detailSchema,
  pagingSchema,
  readBooleanFlag,
  normalizePayloadStringListFields,
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
  OPERATING_DOMAIN_VALUES,
  OPERATING_REPORT_KINDS,
  buildOperationalReportVerification,
  buildSystemHealth,
  explainOperatorIssue,
  nextReadBackForTool,
  recommendOperatorTuning,
  verifyOperatorEffect,
} from "./operating-intelligence";

const CONTENT_ANALYSIS_SUBJECT_TYPES = ["article", "web_resource", "story_cluster"] as const;
const CONTENT_ANALYSIS_MODULES = [
  "ner",
  "sentiment",
  "category",
  "cluster_summary",
  "system_interest_labels",
  "content_filter",
  "structured_extraction",
] as const;

function normalizeContentAnalysisBackfillPayload(
  payload: Record<string, unknown>
): Record<string, unknown> {
  return normalizePayloadStringListFields(payload, {
    subjectTypes: { allowedValues: CONTENT_ANALYSIS_SUBJECT_TYPES },
    modules: { allowedValues: CONTENT_ANALYSIS_MODULES },
    subjectIds: undefined,
  });
}

function expectedShapeForSchema(schema: JsonSchema): Record<string, unknown> {
  const properties = schema.properties ? Object.keys(schema.properties) : [];
  return {
    type: schema.type ?? "any",
    required: [...(schema.required ?? [])],
    allowedProperties: properties,
    additionalProperties: schema.additionalProperties ?? true,
  };
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((entry) => readOptionalString(entry)).filter((entry): entry is string => Boolean(entry))
    : [];
}

function readEntityIds(args: Record<string, unknown>): Record<string, unknown> {
  const entityIds = args.entityIds;
  return entityIds != null && typeof entityIds === "object" && !Array.isArray(entityIds)
    ? (entityIds as Record<string, unknown>)
    : {};
}

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
        profileIds: { type: "array", items: { type: "string" } },
        missionIds: { type: "array", items: { type: "string" } },
        recallMissionIds: { type: "array", items: { type: "string" } },
        runIds: { type: "array", items: { type: "string" } },
        docIds: { type: "array", items: { type: "string" } },
      },
      additionalProperties: false,
    },
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

const OPERATOR_INTELLIGENCE_MCP_TOOLS: readonly McpToolDefinition[] = [
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

      if ((OPERATING_REPORT_KINDS as readonly string[]).includes(reportKind)) {
        return buildOperationalReportVerification(context, reportKind, entityIds, includeSamples);
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
                   (select count(*)::int from articles a where a.channel_id = sc.channel_id) as "articleCount",
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
        };
      }

      if (reportKind === "discovery_run") {
        const profileIds = readStringArray(entityIds.profileIds);
        const missionIds = readStringArray(entityIds.missionIds);
        const recallMissionIds = readStringArray(entityIds.recallMissionIds);
        const runIds = readStringArray(entityIds.runIds);
        const profiles = await pool.query(
          `
            select profile_id::text as "profileId", profile_key as "profileKey",
                   display_name as "displayName", status, version, updated_at as "updatedAt"
            from discovery_policy_profiles
            where cardinality($1::text[]) = 0 or profile_id::text = any($1::text[])
            order by updated_at desc
            limit 25
          `,
          [profileIds]
        );
        const missions = await pool.query(
          `
            select mission_id::text as "missionId", title, status,
                   interest_graph_status as "interestGraphStatus",
                   run_count as "runCount", last_run_at as "lastRunAt",
                   profile_id::text as "profileId",
                   (select count(*)::int from discovery_candidates dc where dc.mission_id = dm.mission_id) as "candidateCount"
            from discovery_missions dm
            where cardinality($1::text[]) = 0 or mission_id::text = any($1::text[])
            order by updated_at desc
            limit 25
          `,
          [missionIds]
        );
        const recallMissions = await pool.query(
          `
            select recall_mission_id::text as "recallMissionId", title, status,
                   mission_kind as "missionKind", max_candidates as "maxCandidates",
                   profile_id::text as "profileId",
                   (select count(*)::int from discovery_recall_candidates rc where rc.recall_mission_id = drm.recall_mission_id) as "candidateCount"
            from discovery_recall_missions drm
            where cardinality($1::text[]) = 0 or recall_mission_id::text = any($1::text[])
            order by updated_at desc
            limit 25
          `,
          [recallMissionIds]
        );
        const sequenceRuns = await pool.query(
          `
            select run_id::text as "runId", sequence_id::text as "sequenceId",
                   status, trigger_type as "triggerType",
                   context_json->>'mission_id' as "missionId",
                   trigger_meta->>'hypothesisId' as "hypothesisId",
                   started_at as "startedAt", finished_at as "finishedAt",
                   error_text as "errorText", created_at as "createdAt",
                   coalesce(finished_at, started_at, created_at) as "updatedAt"
            from sequence_runs
            where
              (cardinality($1::text[]) = 0 or run_id::text = any($1::text[]))
              and (
                cardinality($2::text[]) = 0
                or context_json->>'mission_id' = any($2::text[])
                or trigger_meta->>'missionId' = any($2::text[])
              )
            order by created_at desc
            limit 50
          `,
          [runIds, missionIds]
        );
        const relatedSequenceRuns = await pool.query(
          `
            select run_id::text as "runId", sequence_id::text as "sequenceId",
                   status, trigger_type as "triggerType",
                   context_json->>'mission_id' as "missionId",
                   trigger_meta->>'hypothesisId' as "hypothesisId",
                   started_at as "startedAt", finished_at as "finishedAt",
                   error_text as "errorText", created_at as "createdAt",
                   coalesce(finished_at, started_at, created_at) as "updatedAt"
            from sequence_runs
            where
              (
                (cardinality($1::text[]) = 0 and cardinality($2::text[]) = 0)
                or context_json->>'mission_id' = any($1::text[])
                or trigger_meta->>'missionId' = any($1::text[])
                or run_id::text = any($2::text[])
              )
            order by created_at desc
            limit 75
          `,
          [missionIds, runIds]
        );
        const taskRuns = await pool.query(
          `
            select tr.run_id::text as "runId",
                   sr.trigger_type as "triggerType",
                   sr.context_json->>'mission_id' as "missionId",
                   tr.task_index as "taskIndex",
                   tr.task_key as "taskKey",
                   tr.module,
                   tr.status,
                   tr.started_at as "startedAt",
                   tr.finished_at as "finishedAt",
                   tr.error_text as "errorText"
            from sequence_task_runs tr
            join sequence_runs sr on sr.run_id = tr.run_id
            where
              (
                (cardinality($1::text[]) = 0 and cardinality($2::text[]) = 0)
                or tr.run_id::text = any($1::text[])
                or sr.context_json->>'mission_id' = any($2::text[])
                or sr.trigger_meta->>'missionId' = any($2::text[])
              )
            order by sr.created_at desc, tr.task_index asc
            limit 100
          `,
          [runIds, missionIds]
        );
        const hypothesisStatusCounts = await pool.query(
          `
            select mission_id::text as "missionId",
                   status,
                   target_provider_type as "targetProviderType",
                   count(*)::int as count
            from discovery_hypotheses
            where cardinality($1::text[]) = 0 or mission_id::text = any($1::text[])
            group by mission_id, status, target_provider_type
            order by mission_id, status, target_provider_type
          `,
          [missionIds]
        );
        const candidateStatusCounts = await pool.query(
          `
            select mission_id::text as "missionId",
                   status,
                   provider_type as "providerType",
                   count(*)::int as count
            from discovery_candidates
            where cardinality($1::text[]) = 0 or mission_id::text = any($1::text[])
            group by mission_id, status, provider_type
            order by mission_id, status, provider_type
          `,
          [missionIds]
        );
        const runningRows = relatedSequenceRuns.rows.filter((row) =>
          ["pending", "running"].includes(String(row.status ?? ""))
        );
        if (runIds.length > 0 && sequenceRuns.rows.length !== runIds.length) {
          warnings.push("Some requested discovery sequence runIds were not found.");
        }
        if (missionIds.length > 0 && missions.rows.length !== missionIds.length) {
          warnings.push("Some requested discovery missionIds were not found.");
        }
        if (runningRows.length > 0) {
          warnings.push(
            "Some discovery sequence runs are still pending/running; report the discovery as in progress, not completed."
          );
        }
        const failedRows = relatedSequenceRuns.rows.filter(
          (row) => String(row.status ?? "") === "failed"
        );
        if (failedRows.length > 0) {
          warnings.push(
            "Some discovery child/parent sequence runs failed; inspect taskRuns.errorText before claiming yield."
          );
        }
        const failedTaskRows = taskRuns.rows.filter(
          (row) => String(row.status ?? "") === "failed"
        );
        if (failedTaskRows.length > 0) {
          warnings.push(
            "At least one discovery task failed; probe/search timeouts and no-result failures can mean low yield rather than successful source discovery."
          );
        }
        return {
          reportKind,
          verifiedAt: new Date().toISOString(),
          staleReportNotes: warnings,
          counts: {
            profiles: profiles.rows.length,
            missions: missions.rows.length,
            recallMissions: recallMissions.rows.length,
            sequenceRuns: sequenceRuns.rows.length,
            relatedSequenceRuns: relatedSequenceRuns.rows.length,
            taskRuns: taskRuns.rows.length,
          },
          profiles: profiles.rows,
          missions: missions.rows,
          recallMissions: recallMissions.rows,
          sequenceRuns: sequenceRuns.rows,
          relatedSequenceRuns: relatedSequenceRuns.rows,
          taskRuns: includeSamples ? taskRuns.rows.slice(0, 20) : [],
          hypothesisStatusCounts: hypothesisStatusCounts.rows,
          candidateStatusCounts: candidateStatusCounts.rows,
        };
      }

      if (reportKind === "cleanup") {
        const counts = await pool.query(
          `
            select
              (select count(*)::int from source_channels where is_active = true) as "activeChannels",
              (select count(*)::int from interest_templates where is_active = true) as "activeSystemInterests",
              (select count(*)::int from llm_prompt_templates where is_active = true) as "activeLlmTemplates",
              (select count(*)::int from discovery_missions where status in ('planned', 'active')) as "activeDiscoveryMissions",
              (select count(*)::int from discovery_recall_missions where status in ('planned', 'active')) as "activeRecallMissions",
              (select count(*)::int from discovery_hypothesis_classes where status = 'active') as "activeDiscoveryClasses",
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
                union all
                select 'discovery_class' as kind, class_key as id, display_name as name, 'system' as "createdBy"
                from discovery_hypothesis_classes
                where class_key in ('lexical', 'facet', 'actor', 'source_type', 'evidence_chain', 'contrarian')
                order by kind, name
                limit 50
              `
            )
          : { rows: [] };
        return {
          reportKind,
          verifiedAt: new Date().toISOString(),
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
          where cardinality($1::text[]) = 0 or doc_id = any($1::text[])
          order by updated_at desc
          limit $2
        `,
        [docIds, includeSamples ? 25 : 5]
      );
      const selectionCounts = await pool.query(
        `
          select final_decision as "finalDecision", count(*)::int as count
          from final_selection_results
          where cardinality($1::text[]) = 0 or doc_id = any($1::text[])
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
                  "Replay existing articles through current system-interest criteria to refresh interest_filter_results and final_selection_results.",
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
    "Queue safe content-analysis replay for existing content. This refreshes NER/entities, sentiment, category, system-interest labels, and content-filter evidence only; it does not recompute article.match_criteria, interest_filter_results, or final_selection_results. For old articles/current interests/selected or pass_through noise, use maintenance.reindex.request with jobKind=backfill. Default modules exclude structured_extraction; request that module explicitly when an LLM-backed extraction policy should run.",
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
          "It does not recompute article.match_criteria, interest_filter_results, or final_selection_results; use maintenance.reindex.request jobKind=backfill for selection replay.",
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

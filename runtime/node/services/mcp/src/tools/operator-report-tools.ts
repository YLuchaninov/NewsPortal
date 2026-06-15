import { type JsonSchema } from "@signalops/contracts";
import {
  buildProviderShapeValidation,
  getMcpTokenAllowedFunnelIds,
  verifyOperatorFunnel,
} from "@signalops/control-plane";

import {
  createReadTool,
  readOptionalString,
  readRequiredString,
  requireMcpTokenFunnelAccess,
  type McpToolDefinition,
} from "./shared";
import { readEntityIds, readStringArray } from "./content-analysis-helpers";
import {
  EVIDENCE_LANE_TYPE_VALUES,
  HARD_GATE_POLICY_VALUES,
  OPERATING_REPORT_KINDS,
  OPERATOR_CHANGE_INTENT_VALUES,
  OPERATOR_CLEANUP_INTENT_VALUES,
  OPERATOR_FLOW_MODE_VALUES,
  OPERATOR_TUNING_LAYER_VALUES,
  OPERATOR_UPDATE_RISK_VALUES,
  SIGNAL_VISIBILITY_VALUES,
  buildOperationalReportVerification,
} from "../operating-intelligence";

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
        funnelIds: { type: "array", items: { type: "string" } },
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

export const OPERATOR_REPORT_MCP_TOOLS: readonly McpToolDefinition[] = [
  createReadTool(
    "operator.report.verify",
    "Verify an operator report against DB-backed state before giving a final answer. Use this after onboarding channels, discovery runs, cleanup, or selection claims.",
    operatorReportVerifySchema,
    async (context, args) => {
      const { pool } = context;
      const reportKind = readRequiredString(args.reportKind, "reportKind");
      const requestedEntityIds = readEntityIds(args);
      const tokenAllowedFunnelIds = getMcpTokenAllowedFunnelIds(context.token);
      const requestedFunnelIds = readStringArray(requestedEntityIds.funnelIds);
      const effectiveFunnelIds =
        reportKind === "selection" && requestedFunnelIds.length === 0 && tokenAllowedFunnelIds.length > 0
          ? tokenAllowedFunnelIds
          : requestedFunnelIds;
      for (const funnelId of effectiveFunnelIds) {
        requireMcpTokenFunnelAccess(context.token, funnelId, "entityIds.funnelIds");
      }
      const entityIds =
        reportKind === "selection" && effectiveFunnelIds.length > 0
          ? { ...requestedEntityIds, funnelIds: effectiveFunnelIds }
          : requestedEntityIds;
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
        const report = await buildOperationalReportVerification(
          context,
          reportKind,
          entityIds,
          includeSamples,
          flowContext
        );
        const funnelIds = reportKind === "selection" ? effectiveFunnelIds : [];
        if (funnelIds.length === 0) {
          return report;
        }
        return {
          ...report,
          funnelScope: {
            funnelIds,
            verifications: await Promise.all(
              funnelIds.map((funnelId) =>
                verifyOperatorFunnel(pool, {
                  funnelId,
                  includeSamples,
                  allowedFunnelIds: tokenAllowedFunnelIds,
                })
              )
            ),
          },
        };
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
                 explain_json -> 'funnelRuntimeAttribution' as "funnelRuntimeAttribution",
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


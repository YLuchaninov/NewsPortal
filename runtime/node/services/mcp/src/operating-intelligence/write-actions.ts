import {
  buildCoverageFirstAutoplan,
  buildCoverageFirstIterationRecommendation,
  getSourceFamilyCoverageWithPool,
} from "@signalops/control-plane";

import { readOptionalInteger, readOptionalString } from "../protocol";
import type { McpToolContext } from "../tools/shared";
import {
  buildSelectionPrecisionAudit,
  listSignalCandidateHoldQuality,
} from "./read-model";
import { isRecord, readStringArray, uniqueStrings } from "./shared";

function boundedChunk<T>(items: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
}

function docIdFromRow(row: unknown): string | null {
  return isRecord(row) && typeof row.docId === "string" ? row.docId : null;
}

function buildReindexRequestTemplate(
  label: string,
  docIds: string[],
  reason: string,
  funnelScope: Record<string, unknown> = {}
) {
  const funnelId = readOptionalString(funnelScope.funnelId);
  const laneId = readOptionalString(funnelScope.laneId);
  const funnelPlanId = readOptionalString(funnelScope.funnelPlanId);
  const planFingerprint = readOptionalString(funnelScope.planFingerprint);
  const changeMode = readOptionalString(funnelScope.changeMode) ?? "manual_tuning";
  const scopedRequest =
    funnelId != null
      ? {
          funnelId,
          ...(laneId ? { laneId } : {}),
          ...(funnelPlanId ? { funnelPlanId } : {}),
          ...(planFingerprint ? { planFingerprint } : {}),
          changeMode,
          configurationScope: "funnel",
          verificationTarget: "replay",
        }
      : {};
  return {
    bucket: label,
    docIds,
    request: {
      ...scopedRequest,
      payload: {
        indexName: "interest_centroids",
        jobKind: "backfill",
        options: {
          docIds,
          retroNotifications: "skip",
          reason,
        },
      },
    },
  };
}

export async function buildSelectionReindexPlan(
  context: McpToolContext,
  args: Record<string, unknown> = {}
) {
  const requestedDocIds = readStringArray(args.docIds);
  const chunkSize = Math.min(Math.max(readOptionalInteger(args.chunkSize) ?? 25, 1), 50);
  const maxDocIds = Math.min(Math.max(readOptionalInteger(args.maxDocIds) ?? 100, 1), 500);
  const includeSamples = args.includeSamples !== false;
  const reason =
    readOptionalString(args.reason) ?? "selection calibration bounded historical replay";
  const funnelScope = {
    funnelId: readOptionalString(args.funnelId),
    laneId: readOptionalString(args.laneId),
    funnelPlanId: readOptionalString(args.funnelPlanId),
    planFingerprint: readOptionalString(args.planFingerprint),
    changeMode: readOptionalString(args.changeMode),
  };
  const precision = await buildSelectionPrecisionAudit(context, {
    docIds: requestedDocIds,
    pageSize: maxDocIds,
    includeSamples: true,
  });
  const samples = isRecord(precision.samples) ? precision.samples : {};
  const weakSelectedRows = Array.isArray(samples.weakSelected) ? samples.weakSelected : [];
  const weakSelectedDocIds = uniqueStrings(weakSelectedRows.map(docIdFromRow).filter(Boolean) as string[]);
  const contextOnlyDocIds = uniqueStrings(
    weakSelectedRows
      .filter((row) => isRecord(row) && isRecord(row.precision) && row.precision.outcome === "context_only")
      .map(docIdFromRow)
      .filter(Boolean) as string[]
  );

  const [projectHolds, buyerHolds, contextHolds] = await Promise.all([
    listSignalCandidateHoldQuality(context, { candidateSignalTier: "project_intent", pageSize: maxDocIds }),
    listSignalCandidateHoldQuality(context, { candidateSignalTier: "buyer_intent", pageSize: maxDocIds }),
    listSignalCandidateHoldQuality(context, { candidateSignalTier: "context", pageSize: maxDocIds }),
  ]);
  const buyerHoldRows = [
    ...(Array.isArray(projectHolds.items) ? projectHolds.items : []),
    ...(Array.isArray(buyerHolds.items) ? buyerHolds.items : []),
  ];
  const buyerHoldDocIds = uniqueStrings(buyerHoldRows.map(docIdFromRow).filter(Boolean) as string[]);
  const contextHoldDocIds = uniqueStrings(
    (Array.isArray(contextHolds.items) ? contextHolds.items : []).map(docIdFromRow).filter(Boolean) as string[]
  );

  const buckets = [
    {
      bucket: "weak_selected",
      docIds: weakSelectedDocIds.slice(0, maxDocIds),
      source: "operator.selection.precision_audit samples.weakSelected",
      purpose:
        "Replay selected rows classified as context_only/noise after tightening interests/templates.",
    },
    {
      bucket: "buyer_hold",
      docIds: buyerHoldDocIds.slice(0, maxDocIds),
      source: "signal_candidates.holds.list candidateSignalTier=project_intent,buyer_intent",
      purpose:
        "Replay held buyer/project candidates when increasing recall or recovering direct evidence.",
    },
    {
      bucket: "context_only",
      docIds: uniqueStrings([...contextOnlyDocIds, ...contextHoldDocIds]).slice(0, maxDocIds),
      source: "selection precision context_only rows plus signal_candidates.holds.list candidateSignalTier=context",
      purpose:
        "Replay context-only rows only to confirm they stay context/noise unless item-level buyer evidence appears.",
    },
  ];
  const chunks = buckets.flatMap((bucket) =>
    boundedChunk(bucket.docIds, chunkSize).map((docIds, index) =>
      buildReindexRequestTemplate(
        `${bucket.bucket}:${index + 1}`,
        docIds,
        `${reason}: ${bucket.bucket}`,
        funnelScope
      )
    )
  );
  return {
    generatedAt: new Date().toISOString(),
    readOnly: true,
    chunkSize,
    maxDocIds,
    requestedDocIds,
    buckets: buckets.map((bucket) => ({
      ...bucket,
      count: bucket.docIds.length,
      docIds: includeSamples ? bucket.docIds : [],
    })),
    chunks: includeSamples ? chunks : chunks.map((chunk) => ({ ...chunk, docIds: [], request: undefined })),
    funnelScope: funnelScope.funnelId
      ? {
          funnelId: funnelScope.funnelId,
          laneId: funnelScope.laneId ?? null,
          funnelPlanId: funnelScope.funnelPlanId ?? null,
          planFingerprint: funnelScope.planFingerprint ?? null,
          changeMode: funnelScope.changeMode ?? "manual_tuning",
          verificationTarget: "replay",
        }
      : null,
    recommendedOrder: ["weak_selected", "buyer_hold", "context_only"],
    mutationPolicy:
      "This planner is read-only. Queue only one bounded maintenance.reindex.request chunk at a time, keep retroNotifications=skip, and verify with maintenance.reindex_jobs.list plus operator.report.verify/operator.effect.verify before continuing.",
    nextReadBack: [
      "maintenance.reindex.request",
      "maintenance.reindex_jobs.list",
      "operator.report.verify reportKind=selection",
      "operator.report.verify reportKind=selection_hold_quality",
      "operator.effect.verify domain=selection",
    ],
    diagnostics: {
      precisionSummary: {
        inspectedSelectedCount: precision.inspectedSelectedCount,
        highQualityCount: precision.highQualityCount,
        weakSelectedCount: precision.weakSelectedCount,
        buckets: precision.buckets,
      },
      holdTotals: {
        projectIntent: projectHolds.total,
        buyerIntent: buyerHolds.total,
        context: contextHolds.total,
      },
    },
  };
}


export async function buildFunnelAutoplan(context: McpToolContext, args: Record<string, unknown>) {
  const includeExamples = args.includeSamples === true;
  const coverage = await getSourceFamilyCoverageWithPool(context.pool, { includeExamples });
  return {
    generatedAt: new Date().toISOString(),
    readOnly: true,
    mutationPolicy:
      "This plan does not mutate sources, discovery targets, templates, interests, replay jobs, or channel activation state. Apply bounded follow-through through explicit MCP tools only.",
    ...buildCoverageFirstAutoplan({
      objective: readOptionalString(args.objective) ?? undefined,
      maxNewChannels: readOptionalInteger(args.maxNewChannels) ?? undefined,
      coverage,
    }),
    currentSourceFamilyCoverage: coverage,
    recommendedMcpActions: [
      { tool: "discovery.source_families.coverage", arguments: { includeExamples } },
      { tool: "operator.report.verify", arguments: { reportKind: "source_family_balance", entityIds: {}, includeSamples: includeExamples } },
      { tool: "discovery.mega_loop.preview", arguments: { interest: readOptionalString(args.objective) ?? "coverage-first rare-signal funnel" } },
      { tool: "operator.selection.precision_audit", arguments: { includeSamples: includeExamples } },
    ],
    nextReadBack: [
      "discovery.source_families.coverage",
      "operator.report.verify reportKind=source_family_balance",
      "operator.funnel.iteration.recommend",
      "operator.report.verify reportKind=selection",
    ],
  };
}

export async function buildFunnelIterationRecommendation(
  context: McpToolContext,
  args: Record<string, unknown>
) {
  const includeExamples = args.includeSamples === true;
  const coverage = await getSourceFamilyCoverageWithPool(context.pool, { includeExamples });
  return {
    generatedAt: new Date().toISOString(),
    readOnly: true,
    mutationPolicy:
      "Recommendations never disable working noisy/low-yield semantic sources. Use explicit operator action and reason for any deactivation.",
    ...buildCoverageFirstIterationRecommendation({
      objective: readOptionalString(args.objective) ?? undefined,
      coverage,
    }),
    currentSourceFamilyCoverage: coverage,
  };
}


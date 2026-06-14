import { readOptionalInteger, readOptionalString } from "../protocol";
import type { McpToolContext } from "../tools/shared";
import { classifySelectionPrecisionRow } from "./selection-precision";
import {
  SELECTION_COUNTER_SEMANTICS,
  SELECTION_SCORE_THRESHOLDS,
  readSelectionPipelineDiagnostics,
} from "./selection-diagnostics";
import {
  appendSelectionFunnelScopeClause,
  appendSourceFunnelScopeClause,
  hasFunnelReadScope,
  readFunnelReadScope,
} from "./scope";
import {
  countQuery,
  isRecord,
  queryCount,
  readStringArray,
} from "./shared";

export async function buildSelectionDashboard(
  context: McpToolContext,
  args: Record<string, unknown> = {}
) {
  const { pool, sdk } = context;
  const scope = readFunnelReadScope(args);
  const rawParams: unknown[] = [];
  const rawScopeClause = appendSourceFunnelScopeClause(rawParams, scope, "a");
  const rawWhereSql = rawScopeClause ? `where ${rawScopeClause}` : "";
  const blockedParams: unknown[] = [];
  const blockedScopeClause = appendSourceFunnelScopeClause(blockedParams, scope, "a");
  const blockedWhereSql = [
    "visibility_state = 'blocked'",
    ...(blockedScopeClause ? [blockedScopeClause] : []),
  ].join(" and ");
  const pendingParams: unknown[] = [];
  const pendingScopeClause = appendSourceFunnelScopeClause(pendingParams, scope, "a");
  const pendingWhereSql = [
    "fsr.doc_id is null",
    ...(pendingScopeClause ? [pendingScopeClause] : []),
  ].join(" and ");
  const decisionParams: unknown[] = [];
  const decisionScopeClause = appendSelectionFunnelScopeClause(
    decisionParams,
    scope,
    "fsr"
  );
  const decisionWhereSql = decisionScopeClause ? `where ${decisionScopeClause}` : "";
  const scoped = hasFunnelReadScope(scope);
  const [
    rawSignalCandidateObservations,
    blockedSignalCandidateObservations,
    pendingSelectionRows,
    decisionRows,
    selectionPipelineDiagnostics,
    contentItemsPage,
  ] = await Promise.all([
    queryCount(
      pool,
      `select count(*)::int as total from signal_candidates a ${rawWhereSql}`,
      rawParams
    ),
    queryCount(
      pool,
      `
      select count(*)::int as total
      from signal_candidates a
      where ${blockedWhereSql}
      `,
      blockedParams
    ),
    queryCount(
      pool,
      `
      select count(*)::int as total
      from signal_candidates a
      left join final_selection_results fsr on fsr.doc_id = a.doc_id
      where ${pendingWhereSql}
      `,
      pendingParams
    ),
    pool.query<Record<string, unknown>>(
      `
      select
        coalesce(final_decision, 'unknown') as decision,
        count(*)::int as count,
        count(*) filter (where is_selected = true)::int as "selectedCount",
        count(*) filter (
          where coalesce(explain_json ->> 'selectionMode', '') = 'hold'
        )::int as "holdCount",
        count(*) filter (
          where coalesce(explain_json ->> 'selectionMode', '') = 'llm_review_pending'
            or coalesce((explain_json -> 'filterCounts' ->> 'llmReviewPending')::int, 0) > 0
        )::int as "llmReviewPendingCount"
      from final_selection_results fsr
      ${decisionWhereSql}
      group by coalesce(final_decision, 'unknown')
      order by decision
      `,
      decisionParams
    ),
    readSelectionPipelineDiagnostics(pool),
    scoped
      ? Promise.resolve({ total: null })
      : sdk.listContentItemsPage<Record<string, unknown>>({ page: 1, pageSize: 1 }),
  ]);
  const byDecision = decisionRows.rows.map((row) => ({
    decision: String(row.decision ?? "unknown"),
    count: Number(row.count ?? 0),
  }));
  const selectedSignalCandidateSignals = decisionRows.rows.reduce(
    (sum, row) => sum + Number(row.selectedCount ?? 0),
    0
  );
  const holdRows = decisionRows.rows.reduce((sum, row) => sum + Number(row.holdCount ?? 0), 0);
  const llmReviewPendingRows = decisionRows.rows.reduce(
    (sum, row) => sum + Number(row.llmReviewPendingCount ?? 0),
    0
  );
  const countForDecision = (decision: string) =>
    byDecision.find((entry) => entry.decision === decision)?.count ?? 0;
  const materializedSelectionRows = byDecision.reduce((sum, entry) => sum + entry.count, 0);
  const visibleContentItems = scoped
    ? selectedSignalCandidateSignals
    : Number(contentItemsPage.total ?? 0);
  const rejectedRows = countForDecision("rejected");
  const grayZoneRows = countForDecision("gray_zone");
  const diagnosticFlags = isRecord(selectionPipelineDiagnostics.diagnosticFlags)
    ? selectionPipelineDiagnostics.diagnosticFlags
    : {};
  const diagnosticHints = {
    zeroSelectedHighRejection: selectedSignalCandidateSignals === 0 && rejectedRows > 0,
    grayZoneCollapseSuspected: selectedSignalCandidateSignals === 0 && rejectedRows > 0 && grayZoneRows <= 1,
    pendingRowsPresent: pendingSelectionRows > 0,
    staleReplayPossible:
      pendingSelectionRows > 0 || materializedSelectionRows < rawSignalCandidateObservations,
    hardFilterCollapseSuspected: Boolean(diagnosticFlags.hardFilterCollapseSuspected),
    shortTokenPhraseMismatch: Boolean(diagnosticFlags.shortTokenPhraseMismatch),
    contentKindMismatch: Boolean(diagnosticFlags.contentKindMismatch),
    llmProviderEndpointError: Boolean(diagnosticFlags.llmProviderEndpointError),
    activeTestChannelNoise: Boolean(diagnosticFlags.activeTestChannelNoise),
    filterRowsNotCandidateRows: Boolean(diagnosticFlags.filterRowsNotCandidateRows),
    belowGrayThreshold: Boolean(diagnosticFlags.belowGrayThreshold),
    zeroCandidateSignalHits: Boolean(diagnosticFlags.zeroCandidateSignalHits),
    mixedProfileVersions: Boolean(diagnosticFlags.mixedProfileVersions),
    hardGateUnsafeForHiddenSignal: Boolean(diagnosticFlags.hardGateUnsafeForHiddenSignal),
    globalHardGateOnMixedSignal: Boolean(diagnosticFlags.globalHardGateOnMixedSignal),
    semanticEmbeddingsPresentButBelowThreshold: Boolean(
      diagnosticFlags.semanticEmbeddingsPresentButBelowThreshold
    ),
    interestCentroidsNotSelectionRootCause:
      isRecord(selectionPipelineDiagnostics.embeddingDiagnostics)
        ? selectionPipelineDiagnostics.embeddingDiagnostics.interestCentroidsNotSelectionRootCause
        : null,
    note:
      "Gray-zone collapse is not automatically precision improvement; verify replay freshness, residual distribution, rejected samples, selected quality, and hold quality.",
  };
  return {
    readOnly: true,
    sourceOfTruth: {
      rawSignalCandidateObservations: "signal_candidates",
      signalCandidateSelection: "final_selection_results",
      publicSelectedContent: "content_items",
    },
    funnelScope: {
      funnelId: scope.funnelId,
      laneId: scope.laneId,
      rawObservationScope: scoped ? "funnel_source_bindings" : "global",
      selectionScope: scoped ? "funnel_system_interest_bindings" : "global",
      pipelineDiagnosticsScope:
        "global: diagnostic counters remain corpus-wide until scoped pipeline diagnostics are implemented",
    },
    counts: {
      rawSignalCandidateObservations,
      materializedSelectionRows,
      pendingSelectionRows,
      selectedSignalCandidateSignals,
      visibleContentItems,
      rejectedRows,
      grayZoneRows,
      holdRows,
      llmReviewPendingRows,
      blockedSignalCandidateObservations,
      technicalFilterRows: Number(selectionPipelineDiagnostics.technicalFilterRows ?? 0),
      semanticEvaluatedRows: Number(selectionPipelineDiagnostics.semanticEvaluatedRows ?? 0),
      processedCandidateCount: Number(selectionPipelineDiagnostics.processedCandidateCount ?? 0),
      pendingCandidateCount: Number(selectionPipelineDiagnostics.pendingCandidateCount ?? 0),
      criteriaCount: Number(selectionPipelineDiagnostics.criteriaCount ?? 0),
      expectedResultRows: Number(selectionPipelineDiagnostics.expectedResultRows ?? 0),
      materializedResultRows: Number(selectionPipelineDiagnostics.materializedResultRows ?? 0),
    },
    byDecision,
    filterReasonCounts: selectionPipelineDiagnostics.filterReasonCounts ?? {},
    filterReasonBreakdown: selectionPipelineDiagnostics.filterReasonBreakdown ?? [],
    counterSemantics: selectionPipelineDiagnostics.counterSemantics ?? SELECTION_COUNTER_SEMANTICS,
    scoreThresholds: selectionPipelineDiagnostics.scoreThresholds ?? SELECTION_SCORE_THRESHOLDS,
    scoreDistribution: selectionPipelineDiagnostics.scoreDistribution ?? {},
    finalSelectionReasonBreakdown:
      selectionPipelineDiagnostics.finalSelectionReasonBreakdown ?? [],
    candidateSignalsConfigured: Boolean(selectionPipelineDiagnostics.candidateSignalsConfigured),
    candidateSignalsHitRate: Number(selectionPipelineDiagnostics.candidateSignalsHitRate ?? 0),
    positiveCueGroupHitCount: Number(
      selectionPipelineDiagnostics.positiveCueGroupHitCount ?? 0
    ),
    negativeCueGroupHitCount: Number(
      selectionPipelineDiagnostics.negativeCueGroupHitCount ?? 0
    ),
    zeroHitCueGroups: selectionPipelineDiagnostics.zeroHitCueGroups ?? [],
    labelLikeCueWarnings: selectionPipelineDiagnostics.labelLikeCueWarnings ?? [],
    candidateSignalsRecoveryRows: Number(
      selectionPipelineDiagnostics.candidateSignalsRecoveryRows ?? 0
    ),
    staleProfileDiagnostics: selectionPipelineDiagnostics.staleProfileDiagnostics ?? {},
    selectionPipelineDiagnostics,
    discrepancyExplanation:
      "signal_candidates.list and the admin Signal Candidates page show raw editorial observations. content_items.list and final_selection_results selected rows show public selected lead signals.",
    operatorGuidance:
      visibleContentItems === 0 && rawSignalCandidateObservations > 0
        ? "The corpus still exists for audit/replay, but strict selection currently exposes zero public selected signals. Classify acquisition, filter, semantic, gray-zone, LLM, and staleness layers before tuning."
        : "Compare rawSignalCandidateObservations with visibleContentItems before reporting signal yield.",
    diagnosticHints,
    readBackChecks: [
      "signal_candidates.list",
      "content_items.list",
      "signal_candidates.residuals.summary",
      "signal_candidates.residuals.list",
      "signal_candidates.explain",
      "system_interests.compile_status.list",
      "operator.report.verify reportKind=selection",
      "operator.selection.reindex_plan",
    ],
    sourceStatusGuidance:
      "Do not treat user-provided report channel counts or historical/transient failures as current truth. Read channels.bottlenecks.summary/list for current active source count and active failures now.",
    nextReadBack: {
      residualSummary: {
        tool: "signal_candidates.residuals.summary",
        arguments: {},
      },
      residualList: {
        tool: "signal_candidates.residuals.list",
        arguments: { pageSize: 25 },
      },
      representativeExplains: {
        tool: "signal_candidates.explain",
        arguments: { docId: "<docId-from-residuals-list>" },
      },
      compileStatus: {
        tool: "system_interests.compile_status.list",
        arguments: {},
      },
      selectionReport: {
        tool: "operator.report.verify",
        arguments: { reportKind: "selection", includeSamples: true },
      },
    },
  };
}

function readPageWindow(args: Record<string, unknown>, defaultPageSize = 25) {
  const page = Math.max(readOptionalInteger(args.page) ?? 1, 1);
  const pageSize = Math.min(
    Math.max(readOptionalInteger(args.pageSize) ?? defaultPageSize, 1),
    100
  );
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function holdQualityWhere(args: Record<string, unknown>) {
  const clauses = [
    `
      fsr.final_decision = 'gray_zone'
      and (
        coalesce(fsr.explain_json ->> 'selectionReason', '') in (
          'candidate_signal_hold',
          'semantic_hold',
          'candidate_signal_gray_zone'
        )
        or coalesce(fsr.explain_json ->> 'downstreamLossBucket', '') in (
          'gray_zone_hold',
          'context_candidate_not_selected',
          'buyer_intent_hold',
          'project_intent_hold',
          'llm_review_pending'
        )
      )
    `,
  ];
  const params: unknown[] = [];
  const candidateSignalTier = readOptionalString(args.candidateSignalTier);
  const verificationState = readOptionalString(args.verificationState);
  const downstreamLossBucket = readOptionalString(args.downstreamLossBucket);
  const q = readOptionalString(args.q);
  const docIds = readStringArray(args.docIds);
  if (candidateSignalTier) {
    params.push(candidateSignalTier);
    clauses.push(
      `coalesce(fsr.explain_json ->> 'candidateSignalTier', fsr.explain_json #>> '{semanticSignalSummary,candidateSignalTier}', 'unknown') = $${params.length}`
    );
  }
  if (verificationState) {
    params.push(verificationState);
    clauses.push(`coalesce(fsr.verification_state, '') = $${params.length}`);
  }
  if (downstreamLossBucket) {
    params.push(downstreamLossBucket);
    clauses.push(`coalesce(fsr.explain_json ->> 'downstreamLossBucket', '') = $${params.length}`);
  }
  if (q) {
    params.push(`%${q}%`);
    clauses.push(`(a.title ilike $${params.length} or coalesce(a.url, '') ilike $${params.length})`);
  }
  if (docIds.length > 0) {
    params.push(docIds);
    clauses.push(`fsr.doc_id::text = any($${params.length}::text[])`);
  }
  return { whereSql: clauses.map((clause) => `(${clause})`).join(" and "), params };
}

function holdQualitySelectSql() {
  return `
    select
      fsr.doc_id::text as "docId",
      a.title,
      a.url,
      a.published_at as "publishedAt",
      a.channel_id::text as "channelId",
      sc.name as "channelName",
      sc.provider_type as "providerType",
      fsr.final_decision as "finalDecision",
      fsr.is_selected as "isSelected",
      fsr.verification_state as "verificationState",
      coalesce(fsr.explain_json ->> 'selectionReason', '') as "selectionReason",
      coalesce(fsr.explain_json ->> 'downstreamLossBucket', '') as "downstreamLossBucket",
      coalesce(fsr.explain_json ->> 'selectionBlockerReason', '') as "selectionBlockerReason",
      coalesce(fsr.explain_json ->> 'holdReason', '') as "holdReason",
      coalesce(fsr.explain_json ->> 'candidateSignalTier', fsr.explain_json #>> '{semanticSignalSummary,candidateSignalTier}', 'unknown') as "candidateSignalTier",
      coalesce((fsr.explain_json ->> 'candidateSignalUpliftCount')::int, 0) as "candidateSignalUpliftCount",
      coalesce((fsr.explain_json #>> '{semanticSignalSummary,llmReviewPending}')::int, 0) as "llmReviewPendingCount",
      coalesce((fsr.explain_json #>> '{semanticSignalSummary,hold}')::int, 0) as "holdCount",
      fsr.explain_json as "finalSelectionExplain",
      (
        select jsonb_agg(
          jsonb_build_object(
            'criterionId', ifr.criterion_id::text,
            'semanticDecision', ifr.semantic_decision,
            'candidateSignals', ifr.explain_json -> 'candidateSignals',
            'llmReviewAllowed', coalesce((ifr.explain_json -> 'selectionProfile' ->> 'llmReviewAllowed')::boolean, false),
            'runtimeReviewState', ifr.explain_json -> 'runtimeReviewState',
            'filterReasons', ifr.explain_json -> 'filterReasons'
          )
          order by ifr.created_at desc
        )
        from interest_filter_results ifr
        where ifr.doc_id = fsr.doc_id
          and ifr.filter_scope = 'system_criterion'
          and (
            ifr.semantic_decision = 'gray_zone'
            or ifr.explain_json ? 'candidateSignals'
          )
      ) as "holdEvidence"
    from final_selection_results fsr
    join signal_candidates a on a.doc_id = fsr.doc_id
    left join source_channels sc on sc.channel_id = a.channel_id
  `;
}

export async function buildSignalCandidateHoldQualitySummary(
  { pool }: McpToolContext,
  args: Record<string, unknown>
) {
  const { whereSql, params } = holdQualityWhere(args);
  const [total, byTier, byBucket, byVerification, pendingLlm] = await Promise.all([
    countQuery(
      pool,
      `
        select count(*)::int as count
        from final_selection_results fsr
        join signal_candidates a on a.doc_id = fsr.doc_id
        where ${whereSql}
      `,
      params
    ),
    countQuery(
      pool,
      `
        select
          coalesce(fsr.explain_json ->> 'candidateSignalTier', fsr.explain_json #>> '{semanticSignalSummary,candidateSignalTier}', 'unknown') as tier,
          count(*)::int as count
        from final_selection_results fsr
        join signal_candidates a on a.doc_id = fsr.doc_id
        where ${whereSql}
        group by tier
        order by count desc, tier asc
      `,
      params
    ),
    countQuery(
      pool,
      `
        select coalesce(fsr.explain_json ->> 'downstreamLossBucket', 'unknown') as bucket,
               count(*)::int as count
        from final_selection_results fsr
        join signal_candidates a on a.doc_id = fsr.doc_id
        where ${whereSql}
        group by bucket
        order by count desc, bucket asc
      `,
      params
    ),
    countQuery(
      pool,
      `
        select coalesce(fsr.verification_state, 'unknown') as "verificationState",
               count(*)::int as count
        from final_selection_results fsr
        join signal_candidates a on a.doc_id = fsr.doc_id
        where ${whereSql}
        group by fsr.verification_state
        order by count desc, "verificationState" asc
      `,
      params
    ),
    countQuery(
      pool,
      `
        select count(*)::int as count
        from final_selection_results fsr
        join signal_candidates a on a.doc_id = fsr.doc_id
        where ${whereSql}
          and coalesce((fsr.explain_json #>> '{semanticSignalSummary,llmReviewPending}')::int, 0) > 0
      `,
      params
    ),
  ]);
  return {
    generatedAt: new Date().toISOString(),
    totalHolds: Number(total[0]?.count ?? 0),
    byCandidateSignalTier: byTier,
    byDownstreamLossBucket: byBucket,
    byVerificationState: byVerification,
    llmReviewPending: Number(pendingLlm[0]?.count ?? 0),
    interpretation: [
      "context candidates are diagnostics and should not be treated as selected evidence",
      "buyer_intent/project_intent holds are the preferred bounded replay pool",
      "source health and vNext routing telemetry are intentionally absent from selection eligibility",
    ],
  };
}

export async function listSignalCandidateHoldQuality(
  { pool }: McpToolContext,
  args: Record<string, unknown>
) {
  const { whereSql, params } = holdQualityWhere(args);
  const { page, pageSize, offset } = readPageWindow(args, 25);
  const items = await countQuery(
    pool,
    `
      ${holdQualitySelectSql()}
      where ${whereSql}
      order by
        case coalesce(fsr.explain_json ->> 'candidateSignalTier', fsr.explain_json #>> '{semanticSignalSummary,candidateSignalTier}', 'unknown')
          when 'project_intent' then 1
          when 'buyer_intent' then 2
          when 'context' then 3
          else 4
        end,
        fsr.updated_at desc
      limit $${params.length + 1}
      offset $${params.length + 2}
    `,
    [...params, pageSize, offset]
  );
  const total = await countQuery(
    pool,
    `
      select count(*)::int as count
      from final_selection_results fsr
      join signal_candidates a on a.doc_id = fsr.doc_id
      where ${whereSql}
    `,
    params
  );
  return {
    page,
    pageSize,
    total: Number(total[0]?.count ?? 0),
    items,
  };
}

export async function explainSignalCandidateHoldQuality(
  { pool }: McpToolContext,
  args: Record<string, unknown>
) {
  const docId = readOptionalString(args.docId) ?? readOptionalString(args.id);
  if (!docId) {
    throw new Error("docId is required.");
  }
  const result = await countQuery(
    pool,
    `
      ${holdQualitySelectSql()}
      where fsr.doc_id::text = $1
      limit 1
    `,
    [docId]
  );
  const row = result[0] ?? null;
  return {
    generatedAt: new Date().toISOString(),
    docId,
    hold: row,
    explanation: row
      ? [
          "whyNotSelected is derived from final_selection_results.explain_json and interest_filter_results candidateSignals",
          "candidateSignalTier=context is diagnostic only; prefer buyer_intent/project_intent for bounded replay",
        ]
      : ["No hold-quality row found for this docId."],
  };
}

function selectionPrecisionSelectSql() {
  return `
    select
      fsr.doc_id::text as "docId",
      a.title,
      a.lead,
      a.url,
      a.published_at as "publishedAt",
      a.channel_id::text as "channelId",
      sc.name as "channelName",
      sc.provider_type as "providerType",
      fsr.final_decision as "finalDecision",
      fsr.is_selected as "isSelected",
      fsr.verification_state as "verificationState",
      fsr.total_filter_count as "totalFilterCount",
      fsr.matched_filter_count as "matchedFilterCount",
      fsr.no_match_filter_count as "noMatchFilterCount",
      fsr.gray_zone_filter_count as "grayZoneFilterCount",
      fsr.technical_filtered_out_count as "technicalFilteredOutCount",
      coalesce(fsr.explain_json ->> 'selectionReason', '') as "selectionReason",
      coalesce(fsr.explain_json ->> 'downstreamLossBucket', '') as "downstreamLossBucket",
      coalesce(fsr.explain_json ->> 'candidateSignalTier', fsr.explain_json #>> '{semanticSignalSummary,candidateSignalTier}', '') as "candidateSignalTier",
      fsr.explain_json -> 'funnelRuntimeAttribution' as "funnelRuntimeAttribution",
      fsr.explain_json as "finalSelectionExplain",
      (
        select jsonb_agg(
          jsonb_build_object(
            'criterionId', ifr.criterion_id::text,
            'semanticDecision', ifr.semantic_decision,
            'technicalFilterState', ifr.technical_filter_state,
            'filterReasons', ifr.explain_json -> 'filterReasons',
            'candidateSignals', ifr.explain_json -> 'candidateSignals',
            'runtimeReviewState', ifr.explain_json -> 'runtimeReviewState',
            'score', ifr.semantic_score
          )
          order by ifr.created_at desc
        )
        from interest_filter_results ifr
        where ifr.doc_id = fsr.doc_id
          and ifr.filter_scope = 'system_criterion'
      ) as "selectionEvidence"
    from final_selection_results fsr
    join signal_candidates a on a.doc_id = fsr.doc_id
    left join source_channels sc on sc.channel_id = a.channel_id
  `;
}

export async function buildSelectionPrecisionAudit(
  { pool }: McpToolContext,
  args: Record<string, unknown> = {}
) {
  const docIds = readStringArray(args.docIds);
  const pageSize = Math.min(Math.max(readOptionalInteger(args.pageSize) ?? 100, 1), 200);
  const includeSamples = args.includeSamples !== false;
  const scope = readFunnelReadScope(args);
  const params: unknown[] = [];
  const clauses = ["fsr.is_selected = true", "fsr.final_decision = 'selected'"];
  if (docIds.length > 0) {
    params.push(docIds);
    clauses.push(`fsr.doc_id::text = any($${params.length}::text[])`);
  }
  const scopeClause = appendSelectionFunnelScopeClause(params, scope, "fsr");
  if (scopeClause) {
    clauses.push(scopeClause);
  }
  const rows = await countQuery(
    pool,
    `
      ${selectionPrecisionSelectSql()}
      where ${clauses.join(" and ")}
      order by fsr.updated_at desc
      limit $${params.length + 1}
    `,
    [...params, pageSize]
  );
  const classified = rows.map((row) => ({
    ...row,
    precision: classifySelectionPrecisionRow(row),
  }));
  const buckets = classified.reduce<Record<string, number>>((acc, row) => {
    const outcome = String((row.precision as Record<string, unknown>).outcome ?? "unknown");
    acc[outcome] = (acc[outcome] ?? 0) + 1;
    return acc;
  }, {});
  const highQualityCount =
    (buckets.strong_project_signal ?? 0) + (buckets.probable_signal ?? 0);
  const weakSelectedCount = (buckets.context_only ?? 0) + (buckets.noise ?? 0);
  const staleParams: unknown[] = [];
  const staleScopeClause = appendSelectionFunnelScopeClause(staleParams, scope, "fsr");
  const staleWhereSql = staleScopeClause ? `where ${staleScopeClause}` : "";
  const staleRows = await countQuery(
    pool,
    `
      select
        count(*) filter (
          where fsr.total_filter_count = 0
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
        )::int as "stalePassThroughCount",
        count(*) filter (
          where not exists (
            select 1
            from interest_filter_results ifr
            where ifr.doc_id = fsr.doc_id
              and ifr.filter_scope = 'system_criterion'
          )
        )::int as "missingInterestFilterResults"
      from final_selection_results fsr
      ${staleWhereSql}
    `,
    staleParams
  );
  const weakSamples = classified
    .filter((row) => ["context_only", "noise"].includes(String((row.precision as Record<string, unknown>).outcome)))
    .slice(0, 20);
  return {
    generatedAt: new Date().toISOString(),
    readOnly: true,
    funnelScope: {
      funnelId: scope.funnelId,
      laneId: scope.laneId,
      selectionScope: hasFunnelReadScope(scope) ? "funnel_system_interest_bindings" : "global",
    },
    inspectedSelectedCount: rows.length,
    highQualityCount,
    weakSelectedCount,
    buckets: {
      strong_project_signal: buckets.strong_project_signal ?? 0,
      probable_signal: buckets.probable_signal ?? 0,
      context_only: buckets.context_only ?? 0,
      noise: buckets.noise ?? 0,
    },
    staleSelection: staleRows[0] ?? {},
    interpretation: [
      "selected is the only web truth; this audit does not create a second public/private selected split",
      "context_only/noise selected rows are precision defects to fix through system interests, LLM templates, candidate-signal groups, and bounded replay",
      "source capability, source health, vNext routing telemetry, adapter risk, and search provider metadata are intentionally absent from selection eligibility",
    ],
    samples: includeSamples
      ? {
          weakSelected: weakSamples,
          highQuality: classified
            .filter((row) => ["strong_project_signal", "probable_signal"].includes(String((row.precision as Record<string, unknown>).outcome)))
            .slice(0, 20),
        }
      : {},
    recommendedMcpActions: [
      {
        tool: "operator.tuning.recommend",
        reason: "Choose increase_precision when context_only/noise selected rows repeat.",
        arguments: {
          domain: "selection",
          objective: "increase_precision",
          includeSamples: true,
          ...(scope.funnelId ? { funnelId: scope.funnelId } : {}),
          ...(scope.laneId ? { laneId: scope.laneId } : {}),
        },
      },
      {
        tool: "system_interests.update",
        reason:
          "Tune active interests/templates so negative/veto cues beat broad semantic similarity and context-only cues stay diagnostic.",
      },
      {
        tool: "maintenance.reindex.request",
        reason: "Replay weak selected docIds in bounded chunks after MCP/admin config changes.",
        arguments: {
          payload: {
            indexName: "interest_centroids",
            jobKind: "backfill",
            options: {
              docIds: weakSamples
                .map((row) => readOptionalString((row as Record<string, unknown>).docId))
                .filter((docId): docId is string => Boolean(docId)),
              includeEnrichment: false,
              forceEnrichment: false,
              reason: "selection-precision-cleanup",
            },
          },
          ...(scope.funnelId
            ? {
                funnelId: scope.funnelId,
                ...(scope.laneId ? { laneId: scope.laneId } : {}),
              }
            : {}),
        },
      },
    ],
    nextReadBack: [
      "operator.report.verify reportKind=selection",
      "signal_candidates.holds.summary",
      "signal_candidates.residuals.summary",
      "maintenance.reindex_jobs.list",
      "content_items.list",
    ],
  };
}

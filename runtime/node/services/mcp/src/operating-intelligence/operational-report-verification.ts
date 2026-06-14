import {
  getSourceFamilyCoverageWithPool,
  listChannelBottlenecksWithPool,
  summarizeChannelBottlenecksWithPool,
} from "@signalops/control-plane";

import { readOptionalString } from "../protocol";
import type { McpToolContext } from "../tools/shared";
import { OPERATING_DOMAIN_VALUES, type OperatingDomain } from "./model";
import {
  buildSelectionPrecisionAudit,
  buildSignalCandidateHoldQualitySummary,
  listSignalCandidateHoldQuality,
} from "./read-model";
import {
  SELECTION_COUNTER_SEMANTICS,
  SELECTION_SCORE_THRESHOLDS,
  readSelectionPipelineDiagnostics,
} from "./selection-diagnostics";
import {
  buildEvidenceLaneGuidance,
  buildOperatorFlowGuidance,
  buildOperatorIntentGuidance,
  buildStrictRecommendationLevels,
  inferHardGatePolicy,
  inferOperatorFlowMode,
  inferSignalVisibility,
  isRecord,
  issue,
  normalizeEvidenceLaneType,
  readAffectedScope,
  readStringArray,
} from "./shared";
import { buildSystemHealth } from "./guidance";
import { buildFunnelAudit } from "./funnel-audit";

export async function buildOperationalReportVerification(
  context: McpToolContext,
  reportKind: string,
  entityIds: Record<string, unknown>,
  includeSamples: boolean,
  flowContext: Record<string, unknown> = {}
) {
  const domainByKind: Record<string, OperatingDomain> = {
    system_health: "selection",
    channel_health: "channels",
    source_bottleneck: "channels",
    source_family_balance: "discovery",
    indirect_search_execution: "discovery",
    marketplace_extraction_quality: "discovery",
    funnel_calibration: "selection",
    selection_precision: "selection",
    website_pipeline: "website_pipeline",
    selection_tuning: "selection",
    selection_hold_quality: "selection",
    content_analysis: "content_analysis",
    llm_budget: "llm_budget",
    sequence_run: "sequences",
  };
  const domain = domainByKind[reportKind] ?? "selection";
  const flowMode = inferOperatorFlowMode({
    requested: flowContext.operationMode,
    domain,
    reportKind,
    residualBucket: reportKind === "selection" ? "0 selected/selection report verification" : reportKind,
  });
  const flowGuidance = buildOperatorFlowGuidance({
    mode: flowMode,
    operatorOverrideReason: readOptionalString(flowContext.operatorOverrideReason),
    affectedScope: readAffectedScope(flowContext.affectedScope),
  });
  const intentGuidance = buildOperatorIntentGuidance({
    mode: flowMode,
    domain,
    reportKind,
    residualBucket: reportKind,
    changeIntent: flowContext.changeIntent,
    cleanupIntent: flowContext.cleanupIntent,
    tuningLayer: flowContext.tuningLayer,
    updateRisk: flowContext.updateRisk,
  });
  const signalVisibility = inferSignalVisibility({
    requested: flowContext.signalVisibility,
    residualBucket: reportKind,
  });
  const evidenceLaneType = normalizeEvidenceLaneType(flowContext.evidenceLaneType);
  const hardGatePolicy = inferHardGatePolicy({
    requested: flowContext.hardGatePolicy,
    signalVisibility,
  });
  const evidenceLaneGuidance = buildEvidenceLaneGuidance({
    signalVisibility,
    evidenceLaneType,
    hardGatePolicy,
  });
  if (reportKind === "funnel_calibration") {
    const domainPrefix = readOptionalString(entityIds.domainPrefix) ?? null;
    const audit = await buildFunnelAudit(context, {
      objective: "funnel calibration report verification",
      referenceEvidenceKind: "portable_funnel_guidance",
      referenceText:
        "rare-signal funnel with buyer-side asks, formal procurement notices, wrapper-noise guardrails, empty must_have_terms baseline, null time window baseline, allowed content kinds including editorial listing document data_file api_payload, and adapter-required source policy",
      domainPrefix,
      includeDiscovery: true,
      includeSamples,
    });
    const liveStateSummary = audit.liveStateSummary as Record<string, unknown>;
    const drift = audit.drift as Record<string, unknown>;
    return {
      reportKind,
      verifiedAt: new Date().toISOString(),
      entityIds,
      domain,
      counts: {
        interests: liveStateSummary.interests,
        llmTemplates: liveStateSummary.llmTemplates,
        compileStatus: liveStateSummary.compileStatus,
        selectionCounts: liveStateSummary.selectionCounts,
        webVisibility: liveStateSummary.webVisibility,
        staleSelection: liveStateSummary.staleSelection,
        hardGateDrift: Array.isArray(drift.hardGateDrift) ? drift.hardGateDrift.length : 0,
        contentKindDrift: Array.isArray(drift.contentKindDrift)
          ? drift.contentKindDrift.length
          : 0,
        promptGuardrailDrift: Array.isArray(drift.promptGuardrailDrift)
          ? drift.promptGuardrailDrift.length
          : 0,
        duplicateInterestRisk: Array.isArray(drift.duplicateInterestRisk)
          ? drift.duplicateInterestRisk.length
          : 0,
        sourceRoleGap: Array.isArray(drift.sourceRoleGap) ? drift.sourceRoleGap.length : 0,
        adapterRequiredGap: Array.isArray(drift.adapterRequiredGap)
          ? drift.adapterRequiredGap.length
          : 0,
      },
      findings: audit.findings,
      warnings: (audit.findings as Array<Record<string, unknown>>).filter(
        (finding) => finding.severity === "warning"
      ),
      staleReportNotes: [
        "This verification is read-only and DB-backed.",
        "Reference bundles are calibration evidence, not runtime truth.",
        "Use MCP/admin config writes plus bounded maintenance.reindex.request chunks for any follow-through.",
      ],
      nextReadBack: [
        "operator.funnel.audit",
        "operator.report.verify reportKind=selection",
        "maintenance.reindex_jobs.list",
        "content_items.list",
      ],
    };
  }
  if (reportKind === "selection" || reportKind === "selection_precision") {
    const docIds = readStringArray(entityIds.docIds);
    const [audit, pipelineDiagnostics] = await Promise.all([
      buildSelectionPrecisionAudit(context, {
        docIds,
        pageSize: includeSamples ? 100 : 50,
        includeSamples,
      }),
      readSelectionPipelineDiagnostics(context.pool),
    ]);
    const strictRecommendation = buildStrictRecommendationLevels(
      "selection",
      "increase_recall",
      "0 selected/selection report verification",
      flowMode,
      flowGuidance.operator_override_allowed
    );
    const selectionMissingProof = [
      ...flowGuidance.missingProof,
      "Selected proof requires final_selection_results/content_items samples or bounded replay verification; processor counters alone are not sufficient.",
    ];
    const staleProfileDiagnostics = isRecord(pipelineDiagnostics.staleProfileDiagnostics)
      ? pipelineDiagnostics.staleProfileDiagnostics
      : {};
    const staleReplayPossible = Boolean(staleProfileDiagnostics.staleReplayPossible);
    const selectionProofStatus =
      flowGuidance.proofStatus === "blocked"
        ? "blocked"
        : staleReplayPossible
          ? "partial"
          : "partial";
    const mandatoryMarkerProofRequired =
      ["hidden_intent", "mixed", "unknown"].includes(signalVisibility) &&
      hardGatePolicy !== "allowed" &&
      isRecord(pipelineDiagnostics.diagnosticFlags) &&
      Boolean(
        pipelineDiagnostics.diagnosticFlags.hardGateUnsafeForHiddenSignal ||
          pipelineDiagnostics.diagnosticFlags.globalHardGateOnMixedSignal
      );
    return {
      reportKind,
      verifiedAt: new Date().toISOString(),
      entityIds,
      domain,
      signalVisibility,
      evidenceLaneType,
      evidenceLaneGuidance,
      hardGatePolicy,
      mandatoryMarkerProofRequired,
      candidateSignalsHitRate: Number(pipelineDiagnostics.candidateSignalsHitRate ?? 0),
      candidateSignalsQualityWarnings:
        pipelineDiagnostics.candidateSignalsQualityWarnings ?? [],
      stalenessWarnings: staleReplayPossible
        ? [
            "Selection report contains stale or mixed profile versions; replay explicit docIds and re-verify before claiming current effect.",
          ]
        : [],
      scoreThresholdDiagnostics: {
        thresholds: pipelineDiagnostics.scoreThresholds ?? SELECTION_SCORE_THRESHOLDS,
        distribution: pipelineDiagnostics.scoreDistribution ?? {},
        diagnosticFlags: pipelineDiagnostics.diagnosticFlags ?? {},
      },
      flowMode,
      flowSequence: flowGuidance.flowSequence,
      proofStatus: selectionProofStatus,
      missingProof: staleReplayPossible
        ? [
            ...selectionMissingProof,
            "Freshness proof is missing because staleFilterResultRows or mixedProfileVersions remain.",
          ]
        : selectionMissingProof,
      operatorOverrideNotes: flowGuidance.operatorOverrideNotes,
      changeIntent: intentGuidance.changeIntent,
      cleanupIntent: intentGuidance.cleanupIntent,
      tuningLayer: intentGuidance.tuningLayer,
      updateRisk: intentGuidance.updateRisk,
      intentSequence: intentGuidance.intentSequence,
      intentGuardrails: intentGuidance.intentGuardrails,
      intentProofRequired: intentGuidance.intentProofRequired,
      intentBlockedUntil: intentGuidance.intentBlockedUntil,
      intentWarnings: intentGuidance.intentWarnings,
      counts: {
        inspectedSelectedCount: audit.inspectedSelectedCount,
        highQualityCount: audit.highQualityCount,
        weakSelectedCount: audit.weakSelectedCount,
        buckets: audit.buckets,
        staleSelection: audit.staleSelection,
        technicalFilterRows: pipelineDiagnostics.technicalFilterRows,
        semanticEvaluatedRows: pipelineDiagnostics.semanticEvaluatedRows,
        processedCandidateCount: pipelineDiagnostics.processedCandidateCount,
        pendingCandidateCount: pipelineDiagnostics.pendingCandidateCount,
        criteriaCount: pipelineDiagnostics.criteriaCount,
        expectedResultRows: pipelineDiagnostics.expectedResultRows,
        materializedResultRows: pipelineDiagnostics.materializedResultRows,
        filterReasonCounts: pipelineDiagnostics.filterReasonCounts,
        staleFilterResultRows: staleProfileDiagnostics.staleFilterResultRows ?? 0,
        candidateSignalsRecoveryRows: pipelineDiagnostics.candidateSignalsRecoveryRows,
        candidateSignalsHitRate: pipelineDiagnostics.candidateSignalsHitRate,
      },
      pipelineDiagnostics,
      filterReasonBreakdown: pipelineDiagnostics.filterReasonBreakdown ?? [],
      counterSemantics: pipelineDiagnostics.counterSemantics ?? SELECTION_COUNTER_SEMANTICS,
      staleness: {
        pendingCandidateCount: pipelineDiagnostics.pendingCandidateCount,
        expectedResultRows: pipelineDiagnostics.expectedResultRows,
        materializedResultRows: pipelineDiagnostics.materializedResultRows,
        activeSelectionProfileVersion:
          Array.isArray(staleProfileDiagnostics.activeSelectionProfileVersions)
            ? staleProfileDiagnostics.activeSelectionProfileVersions
            : [],
        filterResultProfileVersions:
          Array.isArray(staleProfileDiagnostics.filterResultProfileVersions)
            ? staleProfileDiagnostics.filterResultProfileVersions
            : [],
        staleFilterResultRows: staleProfileDiagnostics.staleFilterResultRows ?? 0,
        mixedProfileVersions: Boolean(staleProfileDiagnostics.mixedProfileVersions),
        lastReplayJobId: staleProfileDiagnostics.lastReplayJobId ?? null,
        lastReplayCompletedAt: staleProfileDiagnostics.lastReplayCompletedAt ?? null,
        staleReplayPossible:
          Number(pipelineDiagnostics.pendingCandidateCount ?? 0) > 0 ||
          Number(pipelineDiagnostics.expectedResultRows ?? 0) !==
            Number(pipelineDiagnostics.materializedResultRows ?? 0) ||
          staleReplayPossible,
      },
      scoreThresholds: pipelineDiagnostics.scoreThresholds ?? SELECTION_SCORE_THRESHOLDS,
      scoreDistribution: pipelineDiagnostics.scoreDistribution ?? {},
      semanticEvaluatedRowsFresh: pipelineDiagnostics.semanticEvaluatedRowsFresh,
      technicalFilteredRowsFresh: pipelineDiagnostics.technicalFilteredRowsFresh,
      staleRowsByReason: pipelineDiagnostics.staleRowsByReason ?? [],
      finalSelectionReasonBreakdown: pipelineDiagnostics.finalSelectionReasonBreakdown ?? [],
      zeroHitCueGroups: pipelineDiagnostics.zeroHitCueGroups ?? [],
      labelLikeCueWarnings: pipelineDiagnostics.labelLikeCueWarnings ?? [],
      pendingRows: pipelineDiagnostics.pendingCandidateCount ?? 0,
      samples: includeSamples ? audit.samples : {},
      proofWarnings: [
        "criteriaMatches, interestMatches, filterReasonCounts, hard-filter counts and gray-zone changes are processor diagnostics, not selected-signal proof.",
        "Use filterReasonBreakdown.distinctCandidateCount before estimating candidate impact from filter rows.",
        "Do not report source/channel state from stale session notes; read channels.bottlenecks.summary/list for current active source count and active failures.",
        "Do not report intended system-interest profile/candidateSignals writes as applied until readBackVerification or system_interests.read plus compile status proves persisted state.",
      ],
      must_do_next: strictRecommendation.must_do_next,
      allowed_after: strictRecommendation.allowed_after,
      do_not_do_yet: strictRecommendation.do_not_do_yet,
      blocked_until: strictRecommendation.blocked_until,
      proofRequired: flowGuidance.proofRequired,
      warnings: [
        ...(audit.weakSelectedCount > 0
          ? [
              issue(
                "warning",
                "selection",
                "Selected rows include context-only or noise candidates.",
                {
                  weakSelectedCount: audit.weakSelectedCount,
                  buckets: audit.buckets,
                },
                [
                  "Fix selected precision through MCP/admin system interests, LLM templates, candidateSignals and bounded replay.",
                  "Do not add a separate public selected gate; selected itself must become web-safe.",
                ],
              ),
            ]
          : []),
        ...(isRecord(pipelineDiagnostics.diagnosticFlags) &&
        pipelineDiagnostics.diagnosticFlags.hardFilterCollapseSuspected
          ? [
              issue(
                "warning",
                "selection",
                "Hard filters are collapsing candidates before semantic evaluation.",
                {
                  technicalFilterRows: pipelineDiagnostics.technicalFilterRows,
                  semanticEvaluatedRows: pipelineDiagnostics.semanticEvaluatedRows,
                  filterReasonCounts: pipelineDiagnostics.filterReasonCounts,
                  filterReasonBreakdown: pipelineDiagnostics.filterReasonBreakdown,
                },
                [
                  "Start with filter reason breakdown, affected interest read-back and 10-30 representative rejected explains.",
                  "Repair invalid short_tokens_required phrases and content-kind mismatch before semantic/prototype tuning.",
                  "Replay only bounded docIds and verify after the replay completes.",
                ],
              ),
            ]
          : []),
      ],
      staleReportNotes: [
        "This verification is read-only and DB-backed.",
        "selected remains the only web truth; this report does not create internal/public selected divergence.",
        "criteriaMatches/interestMatches and hard-filter row counts are processor diagnostics, not selected-signal proof.",
        "Source health, source capability, vNext routing telemetry, adapter risk, and search provider metadata are acquisition diagnostics only.",
      ],
      nextReadBack: audit.nextReadBack,
    };
  }
  if (reportKind === "llm_budget") {
    const health = await buildSystemHealth(context, {
      domains: ["llm_budget"],
      includeSamples,
    });
    const strictRecommendation = buildStrictRecommendationLevels(
      "llm_budget",
      "reduce_cost",
      "0 LLM reviews",
      flowMode,
      flowGuidance.operator_override_allowed
    );
    const llmProviderErrors = isRecord(health.health)
      && Array.isArray(health.health.llmProviderErrors)
      ? health.health.llmProviderErrors
      : [];
    return {
      reportKind,
      verifiedAt: new Date().toISOString(),
      entityIds,
      domain,
      flowMode,
      flowSequence: flowGuidance.flowSequence,
      proofStatus: flowGuidance.proofStatus,
      missingProof: [
        ...flowGuidance.missingProof,
        "LLM review proof requires classification of no_reviewable_path, review_disabled, budget_exhausted, worker_not_running, provider_credentials_missing, or provider_endpoint_error.",
      ],
      operatorOverrideNotes: flowGuidance.operatorOverrideNotes,
      changeIntent: intentGuidance.changeIntent,
      cleanupIntent: intentGuidance.cleanupIntent,
      tuningLayer: intentGuidance.tuningLayer,
      updateRisk: intentGuidance.updateRisk,
      intentSequence: intentGuidance.intentSequence,
      intentGuardrails: intentGuidance.intentGuardrails,
      intentProofRequired: intentGuidance.intentProofRequired,
      intentBlockedUntil: intentGuidance.intentBlockedUntil,
      intentWarnings: intentGuidance.intentWarnings,
      counts: {
        llmProviderErrors,
        issueCount: health.issues.length,
      },
      warnings: health.issues,
      staleReportNotes: [
        "This verification is read-only and DB/API-backed.",
        "0 LLM spend may mean no reviewable path, review disabled, budget exhausted, worker not running, missing credentials, or provider endpoint/model error.",
        "Provider endpoint/model errors are preflight/provider failures, not budget tuning evidence.",
      ],
      must_do_next: strictRecommendation.must_do_next,
      allowed_after: strictRecommendation.allowed_after,
      do_not_do_yet: strictRecommendation.do_not_do_yet,
      blocked_until: strictRecommendation.blocked_until,
      proofRequired: flowGuidance.proofRequired,
      nextReadBack: [
        "llm_budget.summary",
        "operator.system.health domains=[llm_budget,selection]",
        "signal_candidates.residuals.summary",
        "operator.issue.explain",
      ],
    };
  }
  if (reportKind === "source_bottleneck") {
    const channelIds = readStringArray(entityIds.channelIds);
    const summary = await summarizeChannelBottlenecksWithPool(context.pool, { channelIds });
    const list = await listChannelBottlenecksWithPool(context.pool, {
      channelIds,
      pageSize: includeSamples ? 25 : 5,
    });
    return {
      reportKind,
      verifiedAt: new Date().toISOString(),
      entityIds,
      domain,
      flowMode,
      flowSequence: flowGuidance.flowSequence,
      proofStatus: flowGuidance.proofStatus,
      missingProof: [
        ...flowGuidance.missingProof,
        "Source repair proof requires current bottleneck/alternative read-back, apply read-back, and fetch/resource/source-inventory evidence.",
      ],
      operatorOverrideNotes: flowGuidance.operatorOverrideNotes,
      proofRequired: flowGuidance.proofRequired,
      changeIntent: intentGuidance.changeIntent,
      cleanupIntent: intentGuidance.cleanupIntent,
      tuningLayer: intentGuidance.tuningLayer,
      updateRisk: intentGuidance.updateRisk,
      intentSequence: intentGuidance.intentSequence,
      intentGuardrails: intentGuidance.intentGuardrails,
      intentProofRequired: intentGuidance.intentProofRequired,
      intentBlockedUntil: intentGuidance.intentBlockedUntil,
      intentWarnings: intentGuidance.intentWarnings,
      counts: summary,
      samples: includeSamples ? list.items : [],
      warnings: [
        ...(summary.technicalBottlenecks > 0
          ? [
              issue(
                "warning",
                "channels",
                "Source bottlenecks include technical repair lanes.",
                {
                  technicalBottlenecks: summary.technicalBottlenecks,
                  byFailureBucket: summary.byFailureBucket,
                  byRepairLane: summary.byRepairLane,
                },
                [
                  "Use channels.bottlenecks.list/explain before changing discovery or selection filters.",
                  "Low yield alone is not a fetch failure; repair transport/provider-shape bottlenecks separately.",
                ],
              ),
            ]
          : []),
      ],
      staleReportNotes: [
        "This verification is read-only and DB-backed.",
        "Source health does not select, rank, escalate, or publish content by itself.",
        "Repeat after async fetchers/discovery jobs finish if the report covers in-flight work.",
      ],
      nextReadBack: [
        "channels.bottlenecks.summary",
        "channels.bottlenecks.list",
        "channels.bottlenecks.explain",
        "channels.alternatives.plan",
      ],
    };
  }
  if (reportKind === "selection_hold_quality") {
    const docIds = readStringArray(entityIds.docIds);
    const args = docIds.length > 0 ? { docIds, pageSize: includeSamples ? 25 : 5 } : {};
    const summary = await buildSignalCandidateHoldQualitySummary(context, args);
    const list = await listSignalCandidateHoldQuality(context, {
      ...args,
      pageSize: includeSamples ? 25 : 5,
    });
    return {
      reportKind,
      verifiedAt: new Date().toISOString(),
      entityIds,
      domain,
      flowMode,
      flowSequence: flowGuidance.flowSequence,
      proofStatus: flowGuidance.proofStatus,
      missingProof: [
        ...flowGuidance.missingProof,
        "Hold-quality proof requires hold samples, bounded replay evidence, and selection report verification.",
      ],
      operatorOverrideNotes: flowGuidance.operatorOverrideNotes,
      proofRequired: flowGuidance.proofRequired,
      changeIntent: intentGuidance.changeIntent,
      cleanupIntent: intentGuidance.cleanupIntent,
      tuningLayer: intentGuidance.tuningLayer,
      updateRisk: intentGuidance.updateRisk,
      intentSequence: intentGuidance.intentSequence,
      intentGuardrails: intentGuidance.intentGuardrails,
      intentProofRequired: intentGuidance.intentProofRequired,
      intentBlockedUntil: intentGuidance.intentBlockedUntil,
      intentWarnings: intentGuidance.intentWarnings,
      counts: summary,
      samples: includeSamples ? list.items : [],
      warnings: [
        ...(summary.totalHolds > 0
          ? [
              issue(
                "warning",
                "selection",
                "Selection holds remain and should be split by candidate-signal tier before replay.",
                {
                  byCandidateSignalTier: summary.byCandidateSignalTier,
                  byDownstreamLossBucket: summary.byDownstreamLossBucket,
                },
                [
                  "Replay project_intent/buyer_intent holds first in chunks of 25.",
                  "Treat context-only holds as diagnostics, not useful selected evidence.",
                ],
              ),
            ]
          : []),
      ],
      staleReportNotes: [
        "This verification is read-only and DB-backed.",
        "Source priors/source health are intentionally not selection evidence.",
        "Use maintenance.reindex.request only with bounded docIds after inspecting hold quality.",
      ],
      nextReadBack: [
        "signal_candidates.holds.summary",
        "signal_candidates.holds.list",
        "signal_candidates.holds.explain",
        "maintenance.reindex_jobs.list",
        "operator.effect.verify",
      ],
    };
  }
  if (reportKind === "source_family_balance") {
    const coverage = await getSourceFamilyCoverageWithPool(context.pool, { includeExamples: includeSamples });
    return {
      reportKind,
      verifiedAt: new Date().toISOString(),
      entityIds,
      domain,
      counts: {
        missingFamilies: coverage.missingFamilies,
        lifecycleCounts: coverage.lifecycleCounts,
        retainedWorkingNoisyChannels: coverage.retainedWorkingNoisyChannels,
        retainedWorkingLowYieldChannels: coverage.retainedWorkingLowYieldChannels,
        negativeControlUsefulChannels: coverage.negativeControlUsefulChannels,
        technicalRepairChannels: coverage.technicalRepairChannels,
        operatorDisabledChannels: coverage.operatorDisabledChannels,
        risks: coverage.risks,
        families: coverage.families.map((row) => ({
          sourceFamily: row.sourceFamily,
          channels: row.channels,
          activeChannels: row.activeChannels,
          workingChannels: row.workingChannels,
          workingNoisySemanticMatch: row.workingNoisySemanticMatch,
          workingLowYield: row.workingLowYield,
          negativeControlUseful: row.negativeControlUseful,
          technicalBottlenecks: row.technicalBottlenecks,
          adapterRequired: row.adapterRequired,
          accessRequired: row.accessRequired,
          selectedRows: row.selectedRows,
          grayRows: row.grayRows,
          rejectedRows: row.rejectedRows,
        })),
      },
      samples: includeSamples ? coverage.families.flatMap((row) => row.examples) : [],
      warnings: [
        ...(coverage.missingFamilies.length > 0
          ? [
              issue(
                "warning",
                "discovery",
                "Coverage-first source-family balance has missing families.",
                { missingFamilies: coverage.missingFamilies, risks: coverage.risks },
                [
                  "Use operator.funnel.autoplan before adding broad channels.",
                  "Use bounded source-family additions instead of optimizing only for current yield.",
                ],
              ),
            ]
          : []),
        ...(coverage.technicalRepairChannels > 0
          ? [
              issue(
                "warning",
                "channels",
                "Some source-family inventory belongs in technical repair/access lanes.",
                { technicalRepairChannels: coverage.technicalRepairChannels },
                ["Repair transport/provider-shape/access blockers without disabling working noisy semantic sources."],
              ),
            ]
          : []),
      ],
      staleReportNotes: [
        "This verification is read-only and DB-backed.",
        "Working noisy, low-yield, and negative-control useful channels are retained acquisition inventory unless an operator explicitly disables them.",
        "Source family, lifecycle label, source health, vNext routing telemetry, and adapter risk cannot select, rank, escalate, or publish content.",
      ],
      autoDisablePolicy: coverage.autoDisablePolicy,
      recommendations: coverage.recommendations,
      nextReadBack: coverage.nextReadBack,
    };
  }
  if (reportKind === "indirect_search_execution") {
    const endpointCounts = await context.pool.query(`
      select
        count(*) filter (where tags @> array['indirect-search']::text[])::int as indirect_sources,
        count(*) filter (
          where tags @> array['indirect-search']::text[]
            and current_state in ('inventory', 'cheap_watch', 'adapter_backlog')
        )::int as watch_or_backlog_sources
      from source_inventory
    `);
    const channelCounts = await context.pool.query(`
      select
        coalesce(config_json #>> '{api,adapterKey}', config_json #>> '{adapter,adapterKey}', config_json #>> '{adapterKey}') as adapter_key,
        coalesce(config_json #>> '{api,sourceRole}', config_json #>> '{adapter,sourceRole}', config_json #>> '{sourceRole}') as source_role,
        count(*)::int as channels,
        count(*) filter (where is_active)::int as active_channels
      from source_channels
      where coalesce(config_json #>> '{api,adapterKey}', config_json #>> '{adapter,adapterKey}', config_json #>> '{adapterKey}')
        in ('ddgs_search', 'searxng_search', 'brave_search', 'tavily_search', 'exa_search', 'serpapi_google_news_research')
      group by 1, 2
      order by channels desc
    `);
    const signalCandidateCounts = await context.pool.query(`
      select
        coalesce(a.raw_payload_json ->> 'adapterKey', 'unknown') as adapter_key,
        count(*)::int as signal_candidates,
        count(*) filter (where fsr.final_decision = 'selected')::int as selected,
        count(*) filter (where fsr.final_decision = 'gray_zone')::int as held,
        count(*) filter (where fsr.final_decision = 'rejected')::int as rejected
      from signal_candidates a
      left join final_selection_results fsr on fsr.doc_id = a.doc_id
      where a.raw_payload_json ->> 'adapterKey'
        in ('ddgs_search', 'searxng_search', 'brave_search', 'tavily_search', 'exa_search', 'serpapi_google_news_research')
      group by 1
      order by signal_candidates desc
    `);
    const watchOrBacklogSources = Number(endpointCounts.rows[0]?.watch_or_backlog_sources ?? 0);
    return {
      reportKind,
      verifiedAt: new Date().toISOString(),
      entityIds,
      domain,
      counts: {
        indirectSources: Number(endpointCounts.rows[0]?.indirect_sources ?? 0),
        watchOrBacklogSources,
        channels: channelCounts.rows,
        signal_candidates: signalCandidateCounts.rows,
      },
      warnings: [
        ...(watchOrBacklogSources > 0 && channelCounts.rows.length === 0
          ? [
              issue(
                "warning",
                "discovery",
                "Indirect search inventory exists but no executable search channels are active.",
                { watchOrBacklogSources },
                ["Use discovery.candidates.create or adapter backlog policy, then channels.bulk_onboard.plan/apply/verify."]
              ),
            ]
          : []),
      ],
      nextReadBack: [
        "discovery.candidates.list",
        "discovery.adapter_backlog.list",
        "channels.bulk_onboard.plan",
        "fetch_runs.list",
        "signal_candidates.residuals.summary",
        "signal_candidates.holds.summary",
      ],
      staleReportNotes: [
        "This verification is read-only and DB-backed.",
        "Indirect search execution is acquisition-only and cannot influence selection by provider metadata.",
      ],
    };
  }
  if (reportKind === "marketplace_extraction_quality") {
    const quality = await context.pool.query(`
      select
        coalesce(a.raw_payload_json ->> 'adapterKey', 'unknown') as adapter_key,
        count(*)::int as signal_candidates,
        count(*) filter (where (a.raw_payload_json ->> 'extractionKind') = 'project_detail')::int as project_detail_signal_candidates,
        count(*) filter (where nullif(a.raw_payload_json ->> 'projectDetailConfidence', '')::float >= 0.55)::int as confident_project_details,
        count(*) filter (where (a.raw_payload_json ->> 'detailFetchAttempted')::boolean is true)::int as detail_fetch_attempted,
        count(*) filter (where fsr.final_decision = 'selected')::int as selected,
        count(*) filter (where fsr.final_decision = 'gray_zone')::int as held,
        count(*) filter (where fsr.final_decision = 'rejected')::int as rejected
      from signal_candidates a
      left join final_selection_results fsr on fsr.doc_id = a.doc_id
      where a.raw_payload_json ->> 'adapterKey'
        in ('peopleperhour_public_projects_research', 'freelancer_public_projects_research', 'guru_public_projects_research', 'malt_public_projects_research', 'contra_public_search_research', 'upwork_public_signal_research', 'linkedin_public_signal_research', 'discourse_search')
      group by 1
      order by signal_candidates desc
    `);
    return {
      reportKind,
      verifiedAt: new Date().toISOString(),
      entityIds,
      domain,
      counts: {
        byAdapter: quality.rows,
      },
      warnings: [
        ...(quality.rows.some(
          (row: Record<string, unknown>) =>
            Number(row.signal_candidates ?? 0) > 0 && Number(row.project_detail_signal_candidates ?? 0) === 0
        )
          ? [
              issue(
                "warning",
                "discovery",
                "Marketplace/forum acquisition produced items but no project-detail evidence.",
                { byAdapter: quality.rows },
                ["Inspect adapter HTML extraction and reject category/navigation wrappers before tuning selection."]
              ),
            ]
          : []),
      ],
      nextReadBack: ["signal_candidates.residuals.list", "signal_candidates.holds.list", "channels.bottlenecks.list"],
      staleReportNotes: [
        "This verification is read-only and DB-backed.",
        "Project-detail confidence is extraction evidence only and cannot select content by itself.",
      ],
    };
  }
  const health = await buildSystemHealth(context, {
    domains: reportKind === "system_health" ? OPERATING_DOMAIN_VALUES : [domain],
    includeSamples,
  });
  return {
    reportKind,
    verifiedAt: new Date().toISOString(),
    entityIds,
    domain,
    counts: health.health,
    warnings: health.issues,
    staleReportNotes: [
      "This verification is read-only and DB/API-backed.",
      "Repeat after async workers finish if the report covers an in-flight run.",
    ],
    nextReadBack: [
      "operator.system.health",
      "operator.issue.explain",
      "operator.effect.verify",
    ],
  };
}

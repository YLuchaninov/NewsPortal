import { readOptionalString } from "../protocol";
import type { McpToolContext } from "../tools/shared";
import { buildOperatorFlowRoute } from "./flow-routing";
import { OPERATING_DOMAIN_REGISTRY, type OperatingDomain } from "./model";
import { SELECTION_SCORE_THRESHOLDS, readSelectionPipelineDiagnostics } from "./selection-diagnostics";
import { hasFunnelReadScope, readFunnelReadScope } from "./scope";
import { readEntityIds, readSinceHours } from "./guidance-common";
import { explainOperatorIssue } from "./issue-explanation";
import { isRecord, normalizeText, uniqueStrings } from "./shared";

export async function recommendOperatorTuning(
  context: McpToolContext,
  args: Record<string, unknown>
) {
  const domain = (readOptionalString(args.domain) ?? "selection") as OperatingDomain;
  const objective = readOptionalString(args.objective) ?? "increase_precision";
  const residualBucket = readOptionalString(args.residualBucket);
  const sinceHours = readSinceHours(args.sinceHours, 24);
  const entityIds = readEntityIds(args.entityIds);
  const scope = readFunnelReadScope(args);
  const flowRoute = buildOperatorFlowRoute({
    ...args,
    domain,
    objective,
    residualBucket,
  });
  const flowMode = flowRoute.flowMode;
  const signalVisibility = flowRoute.signalVisibility;
  const evidenceLaneType = flowRoute.evidenceLaneType;
  const hardGatePolicy = flowRoute.hardGatePolicy;
  const selectionPipelineDiagnostics =
    domain === "selection" ? await readSelectionPipelineDiagnostics(context.pool) : {};
  const normalizedResidual = normalizeText(residualBucket);
  const selectionRecallContext =
    domain === "selection" &&
    (objective === "increase_recall" ||
      normalizedResidual.includes("0 selected") ||
      normalizedResidual.includes("zero selected") ||
      normalizedResidual.includes("semantic_rejected") ||
      normalizedResidual.includes("no_system_match") ||
      normalizedResidual.includes("technical_filter_rejected"));
  const mandatoryMarkerProofRequired = flowRoute.mandatoryMarkerProofRequired;
  const guide = OPERATING_DOMAIN_REGISTRY[domain];
  const issueExplanation = await explainOperatorIssue(context, {
    symptom: residualBucket ?? objective,
    domain,
    entityIds,
    sinceHours,
    includeSamples: args.includeSamples === true,
  });

  const recommendations = buildTuningRecommendations(domain, objective, residualBucket);
  const candidateSignalsHitRate = Number(
    selectionPipelineDiagnostics.candidateSignalsHitRate ?? 0
  );
  const candidateSignalsQualityWarnings = Array.isArray(
    selectionPipelineDiagnostics.candidateSignalsQualityWarnings
  )
    ? selectionPipelineDiagnostics.candidateSignalsQualityWarnings
    : [];
  const stalenessWarnings =
    isRecord(selectionPipelineDiagnostics.staleProfileDiagnostics) &&
    selectionPipelineDiagnostics.staleProfileDiagnostics.staleReplayPossible
      ? [
          "Selection filter rows include stale or mixed selection profile versions; read maintenance.reindex_jobs.list and replay explicit docIds before treating counters as current.",
        ]
      : [];
  const hiddenDoNotDoYet =
    selectionRecallContext && ["hidden_intent", "mixed", "unknown"].includes(signalVisibility)
      ? [
          "Do not add broad must-have terms for hidden/unknown recall recovery.",
          "Do not replace must-have terms with short_tokens_required as an OR keyword gate.",
          "Do not switch strictness=broad as the first response.",
          "Do not rewrite LLM templates or increase LLM budget before a reviewable path exists.",
          "Do not add more RSS/source volume before selection proof.",
          "Do not call discovery.brief.preview persisted Discovery proof.",
        ]
      : [];
  const hiddenMustDoNext =
    selectionRecallContext &&
    Boolean(selectionPipelineDiagnostics.candidateSignalsConfigured) &&
    candidateSignalsHitRate === 0
      ? [
          "Inspect 10-20 representative rejected docs and replace label-like candidateSignals cues with literal observable cue groups before changing hard gates or LLM settings.",
        ]
      : [];
  return {
    generatedAt: new Date().toISOString(),
    domain,
    objective,
    residualBucket,
    funnelScope: {
      funnelId: scope.funnelId,
      laneId: scope.laneId,
      scopeRequiredForFollowThrough: hasFunnelReadScope(scope),
    },
    flowRoute,
    signalVisibility,
    evidenceLaneType,
    evidenceLaneGuidance: flowRoute.evidenceLaneGuidance,
    hardGatePolicy,
    mandatoryMarkerProofRequired,
    candidateSignalsHitRate,
    candidateSignalsQualityWarnings,
    stalenessWarnings,
    scoreThresholdDiagnostics: {
      thresholds: selectionPipelineDiagnostics.scoreThresholds ?? SELECTION_SCORE_THRESHOLDS,
      distribution: selectionPipelineDiagnostics.scoreDistribution ?? {},
      diagnosticFlags: selectionPipelineDiagnostics.diagnosticFlags ?? {},
    },
    flowMode,
    flowSequence: flowRoute.flowSequence,
    operator_override_allowed: flowRoute.operator_override_allowed,
    operator_override_requires: flowRoute.operator_override_requires,
    proofRequired: flowRoute.proofRequired,
    proofStatus: flowRoute.proofStatus,
    missingProof: flowRoute.missingProof,
    operatorOverrideNotes: flowRoute.operatorOverrideNotes,
    changeIntent: flowRoute.changeIntent,
    cleanupIntent: flowRoute.cleanupIntent,
    tuningLayer: flowRoute.tuningLayer,
    updateRisk: flowRoute.updateRisk,
    intentSequence: flowRoute.intentSequence,
    intentGuardrails: flowRoute.intentGuardrails,
    intentProofRequired: flowRoute.intentProofRequired,
    intentBlockedUntil: flowRoute.intentBlockedUntil,
    intentWarnings: flowRoute.intentWarnings,
    diagnosis: issueExplanation.diagnosis,
    evidence: issueExplanation.evidence,
    tuningChoices: [
      "increase_recall",
      "increase_precision",
      "reduce_cost",
      "debug_source",
      "stabilize_discovery",
    ],
    recommendedChanges: recommendations.recommendedChanges,
    must_do_next: [...hiddenMustDoNext, ...flowRoute.mustDoNext],
    allowed_after: flowRoute.allowedAfter,
    do_not_do_yet: uniqueStrings([
      ...hiddenDoNotDoYet,
      ...flowRoute.doNotDoYet,
    ]),
    blocked_until: flowRoute.blockedUntil,
    riskLevel: recommendations.riskLevel,
    expectedEffect: recommendations.expectedEffect,
    verificationPlan: [
      ...(guide?.readBackChecks ?? []),
      "operator.effect.verify",
      "signalops://ops/health",
      "signalops://ops/issues",
    ],
    suggestedToolCalls: recommendations.suggestedToolCalls,
    scopedSuggestedToolContext: hasFunnelReadScope(scope)
      ? {
          funnelId: scope.funnelId,
          laneId: scope.laneId,
          instruction:
            "Carry these fields into scoped manual writes, bounded replay and report verification.",
        }
      : null,
    mutationPolicy:
      "This tool is advisory and read-only. Apply changes only through the suggested guarded MCP write tools after an operator chooses the objective.",
  };
}


function buildTuningRecommendations(
  domain: OperatingDomain,
  objective: string,
  residualBucket: string | null
) {
  const base = {
    riskLevel: "medium",
    expectedEffect: "Bounded configuration change with measurable read-back evidence.",
    recommendedChanges: [] as Array<Record<string, unknown>>,
    suggestedToolCalls: [] as Array<Record<string, unknown>>,
  };
  if (domain === "website_pipeline" || objective === "debug_source") {
    base.riskLevel = "low";
    base.expectedEffect =
      "Clarify whether the issue is source acquisition, resource projection, or downstream selection before changing policy.";
    base.recommendedChanges.push({
      target: "website channel/resource settings",
      action: "Inspect fetch runs and resources first; tune website discovery settings only for repeated extraction/projection failures.",
      reason: residualBucket ?? "website resources need source-of-truth diagnosis",
    });
    base.suggestedToolCalls.push(
      { toolName: "fetch_runs.list", argumentsTemplate: { channelId: "<channelId>" } },
      { toolName: "web_resources.list", argumentsTemplate: { channelId: "<channelId>", projection: "all" } }
    );
    return base;
  }
  if (domain === "llm_budget" || objective === "reduce_cost") {
    base.riskLevel = "medium";
    base.expectedEffect = "Reduce unnecessary LLM escalation while preserving deterministic selection evidence.";
    base.recommendedChanges.push({
      target: "LLM review/template policy",
      action: "Narrow review mode or template scope for repeated low-value gray-zone items.",
      reason: residualBucket ?? "cost or hold pressure",
    });
    base.suggestedToolCalls.push(
      { toolName: "llm_budget.summary", argumentsTemplate: {} },
      { toolName: "llm_templates.update", argumentsTemplate: { promptTemplateId: "<templateId>", payload: {} } }
    );
    return base;
  }
  if (domain === "discovery" || objective === "stabilize_discovery") {
    base.riskLevel = "medium";
    base.expectedEffect = "Improve Discovery vNext artifact, probe, routing, and inventory quality without forcing weak registrations.";
    base.recommendedChanges.push({
      target: "Discovery vNext policy and artifact flow",
      action: "Inspect runs, artifacts, candidates, source inventory, routing decisions, adapter backlog and active policies before changing thresholds; prove changes through replay eval.",
      reason: residualBucket ?? "discovery yield needs tuning",
    });
    base.suggestedToolCalls.push(
      { toolName: "discovery.artifacts.list", argumentsTemplate: { status: "rejected" } },
      { toolName: "discovery.source_inventory.list", argumentsTemplate: {} },
      { toolName: "discovery.eval_runs.list", argumentsTemplate: {} }
    );
    return base;
  }
  if (domain === "content_analysis") {
    base.riskLevel = "medium";
    base.expectedEffect = "Move only the policy/rule causing repeated hold/reject evidence.";
    base.recommendedChanges.push({
      target: "content analysis/filter policy",
      action: "Inspect failed or blocking filter results, then adjust one policy version.",
      reason: residualBucket ?? "content gating evidence",
    });
    base.suggestedToolCalls.push(
      { toolName: "content_filter_results.list", argumentsTemplate: { decision: "hold" } },
      { toolName: "content_filter_policies.update", argumentsTemplate: { filterPolicyId: "<policyId>", payload: {} } }
    );
    return base;
  }
  if (domain === "selection" && objective === "increase_recall" && residualBucket === "gray_zone_hold") {
    base.riskLevel = "medium";
    base.expectedEffect =
      "Re-evaluate held candidate-signal items in bounded chunks without loosening source health or web visibility rules.";
    base.recommendedChanges.push({
      target: "selection replay and candidate-signal hold policy",
      action:
        "Read hold-quality tiers, choose only buyer_intent/project_intent docId chunks of 25, queue maintenance.reindex.request jobKind=backfill with payload.options.docIds, then verify selection/hold-quality/report/effect before tuning interests.",
      reason:
        "gray_zone_hold can be caused by candidate-signal recovery plus strict hold policy; prove replay effects before changing criteria.",
    });
    base.suggestedToolCalls.push(
      { toolName: "signal_candidates.holds.summary", argumentsTemplate: {} },
      {
        toolName: "signal_candidates.holds.list",
        argumentsTemplate: { candidateSignalTier: "project_intent", pageSize: 25 },
      },
      { toolName: "signal_candidates.residuals.summary", argumentsTemplate: { downstreamLossBucket: "gray_zone_hold" } },
      {
        toolName: "signal_candidates.residuals.list",
        argumentsTemplate: { selectionMode: "hold", downstreamLossBucket: "project_intent_hold", pageSize: 25 },
      },
      {
        toolName: "maintenance.reindex.request",
        argumentsTemplate: {
          payload: {
            indexName: "interest_centroids",
            jobKind: "backfill",
            options: {
              docIds: ["<bounded-doc-id-list>"],
              batchSize: 25,
              includeEnrichment: false,
              forceEnrichment: false,
              reason: "selection-gray-zone-hold-bounded-replay",
              parentReindexJobId: "<failed-or-parent-reindex-job-id>",
            },
          },
        },
      },
      { toolName: "maintenance.reindex_jobs.list", argumentsTemplate: { pageSize: 10 } },
      { toolName: "operator.report.verify", argumentsTemplate: { reportKind: "selection", entityIds: {} } },
      {
        toolName: "operator.report.verify",
        argumentsTemplate: { reportKind: "selection_hold_quality", entityIds: {}, includeSamples: true },
      },
      {
        toolName: "operator.effect.verify",
        argumentsTemplate: {
          domain: "selection",
          changeRef: "selection-gray-zone-hold-bounded-replay",
          baselineWindowHours: 24,
          comparisonWindowHours: 6,
        },
      }
    );
    return base;
  }
  const normalizedResidual = normalizeText(residualBucket);
  const hardFilterRecallResidual =
    domain === "selection" &&
    objective === "increase_recall" &&
    (normalizedResidual.includes("technical_filter_rejected") ||
      normalizedResidual.includes("hard_filter") ||
      normalizedResidual.includes("short_tokens_required") ||
      normalizedResidual.includes("content_kind") ||
      normalizedResidual.includes("time_window") ||
      normalizedResidual.includes("must_have") ||
      normalizedResidual.includes("wrapper") ||
      normalizedResidual.includes("must_not"));
  if (hardFilterRecallResidual) {
    base.riskLevel = "medium";
    base.expectedEffect =
      "Recover candidates that are blocked before semantic evaluation by fixing the specific hard-filter constraint, then proving movement with bounded replay.";
    base.recommendedChanges.push(
      {
        target: "technical filter diagnosis",
        action:
          "Read operator.selection.dashboard filterReasonBreakdown first, compare filterRows with distinctCandidateCount, then inspect 10-30 representative rejected candidates before proposing any write.",
        reason:
          "technical_filter_rejected means candidates did not reach semantic or LLM review paths, and filter rows can overstate unique candidate impact when one candidate is evaluated across many criteria.",
      },
      {
        target: "affected system interest/profile",
        action:
          "Read the affected interest and compile status; repair short-token, content-kind, time-window, must-not or wrapper collapse only when representative rejected explains prove false negatives.",
        reason:
          "short_tokens_required is an extracted-token requirement; phrase gates belong in must_have_terms only when truly mandatory, and hidden-signal recovery belongs in candidateSignals.",
      },
      {
        target: "generic hard-filter guardrails",
        action:
          "Do not globally remove wrapper_directory_noise or switch strictness=broad as a first response. Treat broad mode only as a temporary bounded experiment with explicit docIds replay and selected/rejected sample verification.",
        reason:
          "Generic wrapper, time-window and must-not filters often block listing wrappers, source navigation, stale items, advice pages or seller noise; row counts alone do not prove recall loss.",
      },
      {
        target: "bounded proof",
        action:
          "Replay 25-50 explicit docIds from the dominant technical-filter residual, wait for maintenance.reindex_jobs.list, then verify operator.report.verify reportKind=selection includeSamples=true.",
        reason:
          "criteriaMatches/interestMatches and gray-zone collapse are not selected-signal proof.",
      }
    );
    base.suggestedToolCalls.push(
      { toolName: "operator.selection.dashboard", argumentsTemplate: {} },
      { toolName: "signal_candidates.residuals.summary", argumentsTemplate: { downstreamLossBucket: "technical_filter_rejected" } },
      { toolName: "signal_candidates.residuals.list", argumentsTemplate: { downstreamLossBucket: "technical_filter_rejected", pageSize: 30 } },
      { toolName: "signal_candidates.explain", argumentsTemplate: { docId: "<docId-from-residuals-list>" } },
      { toolName: "system_interests.read", argumentsTemplate: { interestTemplateId: "<affected-interest-id>" } },
      { toolName: "system_interests.compile_status.list", argumentsTemplate: {} },
      {
        toolName: "system_interests.update",
        argumentsTemplate: {
          interestTemplateId: "<interestId>",
          payload: {
            short_tokens_required: ["<token-like-values-only-or-empty>"],
            allowed_content_kinds: ["<preserve-existing-and-add-proven-observed-kind-if-needed>"],
            candidate_positive_signals: ["<bounded positive cue groups from representative evidence>"],
            candidate_negative_signals: ["<bounded near-miss negative cue groups from representative evidence>"],
          },
        },
      },
      {
        toolName: "maintenance.reindex.request",
        argumentsTemplate: {
          payload: {
            indexName: "interest_centroids",
            jobKind: "backfill",
            options: {
              docIds: ["<bounded-doc-id-list>"],
              batchSize: 25,
              includeEnrichment: false,
              forceEnrichment: false,
              reason: "selection-hard-filter-calibration",
            },
          },
        },
      },
      { toolName: "maintenance.reindex_jobs.list", argumentsTemplate: { pageSize: 10 } },
      { toolName: "operator.report.verify", argumentsTemplate: { reportKind: "selection", includeSamples: true } }
    );
    return base;
  }
  const semanticRecallResidual =
    domain === "selection" &&
    objective === "increase_recall" &&
    (normalizedResidual.includes("semantic_rejected") ||
      normalizedResidual.includes("no_system_match") ||
      normalizedResidual.includes("0 selected") ||
      normalizedResidual.includes("zero selected"));
  if (semanticRecallResidual) {
    base.riskLevel = "medium";
    base.expectedEffect =
      "Recover repeated near-miss candidates into reviewable paths through item-level evidence calibration without loosening unrelated interests or source acquisition.";
    base.recommendedChanges.push(
      {
        target: "selection residual diagnosis",
        action:
          "Inspect residual summary/list and 1-3 representative signal_candidates.explain rows before writing anything.",
        reason:
          "semantic_rejected/no_system_match means candidates did not reach a reviewable path; LLM review mode and broad positive terms do not bypass this layer.",
      },
      {
        target: "affected system interest",
        action:
          "Read the affected interest and compile status, then adjust candidateSignals and near-miss negative cue groups from repeated item-level evidence. Keep positive_texts edits secondary and use only representative full-text prototypes.",
        reason:
          "Hidden or operational signals often need cue-group evidence recovery rather than keyword expansion.",
      },
      {
        target: "bounded selection replay",
        action:
          "Replay only explicit docIds from the diagnosed residual bucket, wait for maintenance.reindex_jobs.list, then verify with operator.report.verify and operator.effect.verify.",
        reason:
          "Backfill counters and gray-zone collapse are not selected-signal proof.",
      }
    );
    base.suggestedToolCalls.push(
      { toolName: "signal_candidates.residuals.summary", argumentsTemplate: {} },
      { toolName: "signal_candidates.residuals.list", argumentsTemplate: { downstreamLossBucket: residualBucket ?? "semantic_rejected", pageSize: 25 } },
      { toolName: "signal_candidates.explain", argumentsTemplate: { docId: "<docId-from-residuals-list>" } },
      { toolName: "system_interests.read", argumentsTemplate: { interestTemplateId: "<affected-interest-id>" } },
      { toolName: "system_interests.compile_status.list", argumentsTemplate: {} },
      {
        toolName: "system_interests.update",
        argumentsTemplate: {
          interestTemplateId: "<interestId>",
          payload: {
            candidate_positive_signals: ["<bounded positive cue groups from representative evidence>"],
            candidate_negative_signals: ["<bounded near-miss negative cue groups from representative evidence>"],
          },
        },
      },
      {
        toolName: "maintenance.reindex.request",
        argumentsTemplate: {
          payload: {
            indexName: "interest_centroids",
            jobKind: "backfill",
            options: {
              docIds: ["<bounded-doc-id-list>"],
              batchSize: 25,
              includeEnrichment: false,
              forceEnrichment: false,
              reason: "selection-semantic-recall-calibration",
            },
          },
        },
      },
      { toolName: "maintenance.reindex_jobs.list", argumentsTemplate: { pageSize: 10 } },
      { toolName: "operator.report.verify", argumentsTemplate: { reportKind: "selection", includeSamples: true } },
      {
        toolName: "operator.effect.verify",
        argumentsTemplate: {
          domain: "selection",
          changeRef: "selection-semantic-recall-calibration",
          baselineWindowHours: 24,
          comparisonWindowHours: 6,
        },
      }
    );
    return base;
  }
  if (objective === "increase_recall") {
    base.expectedEffect = "Let more repeated near-miss items reach reviewable paths while monitoring false positives.";
    base.recommendedChanges.push({
      target: "system interest/profile",
      action:
        "Calibrate from residual summaries, representative explains, affected interest read-back, candidateSignals, near-miss negatives, and bounded docIds replay before changing strictness or semantic prototypes.",
      reason: residualBucket ?? "recall objective",
    });
  } else {
    base.expectedEffect = "Reject or hold more weak matches while monitoring missed valuable items.";
    base.recommendedChanges.push({
      target: "system interest/profile/filter",
      action: "Add negative signals or tighten policy for a repeated noisy pattern.",
      reason: residualBucket ?? "precision objective",
    });
  }
  base.suggestedToolCalls.push(
    { toolName: "signal_candidates.residuals.summary", argumentsTemplate: { downstreamLossBucket: residualBucket ?? undefined } },
    { toolName: "system_interests.update", argumentsTemplate: { interestTemplateId: "<interestId>", payload: {} } }
  );
  return base;
}

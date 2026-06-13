import { readOptionalString } from "../protocol";
import type {
  OperatingDomain,
  OperatorChangeIntent,
  OperatorFlowMode,
  OperatorFlowSymptom,
} from "./model";
import {
  buildEvidenceLaneGuidance,
  buildOperatorFlowGuidance,
  buildOperatorIntentGuidance,
  buildStrictRecommendationLevels,
  inferHardGatePolicy,
  inferOperatorFlowMode,
  inferSignalVisibility,
  normalizeEvidenceLaneType,
  normalizeOperatingDomain,
  normalizeText,
  readAffectedScope,
  readOperatorFlowSymptoms,
  uniqueStrings,
} from "./shared";

function inferOperatorFlowModeFromSymptoms(symptoms: readonly OperatorFlowSymptom[]): OperatorFlowMode | null {
  if (symptoms.includes("expert_override")) {
    return "expert_override";
  }
  if (symptoms.includes("cleanup")) {
    return "cleanup";
  }
  if (symptoms.includes("scenario_pack_rollout")) {
    return "scenario_pack_rollout";
  }
  if (symptoms.includes("source_failure") || symptoms.includes("source_onboarding")) {
    return "source_onboarding";
  }
  if (symptoms.includes("planned_update") || symptoms.includes("config_write") || symptoms.includes("model_update")) {
    return "planned_change";
  }
  if (
    symptoms.includes("zero_selected") ||
    symptoms.includes("zero_llm_reviews") ||
    symptoms.includes("technical_filter_rejected") ||
    symptoms.includes("semantic_rejected") ||
    symptoms.includes("discovery_quality_gap")
  ) {
    return "diagnostic";
  }
  return null;
}

function routeContextText(args: {
  sessionGoal?: string | null;
  residualBucket?: string | null;
  reportKind?: string | null;
  symptoms: readonly OperatorFlowSymptom[];
}) {
  return [args.sessionGoal, args.residualBucket, args.reportKind, ...args.symptoms]
    .filter(Boolean)
    .join(" ");
}

function inferOperatorFlowDomain(args: {
  requested?: unknown;
  sessionGoal?: string | null;
  residualBucket?: string | null;
  reportKind?: string | null;
  symptoms: readonly OperatorFlowSymptom[];
}): OperatingDomain {
  const requested = normalizeOperatingDomain(args.requested);
  if (requested) {
    return requested;
  }
  const contextText = normalizeText(routeContextText(args));
  if (args.symptoms.includes("cleanup") || contextText.includes("cleanup")) {
    return "cleanup";
  }
  if (
    args.symptoms.includes("source_failure") ||
    args.symptoms.includes("source_onboarding") ||
    contextText.includes("source") ||
    contextText.includes("channel") ||
    contextText.includes("rss") ||
    contextText.includes("website")
  ) {
    return "channels";
  }
  if (
    args.symptoms.includes("discovery_quality_gap") ||
    args.symptoms.includes("scenario_pack_rollout") ||
    contextText.includes("discovery")
  ) {
    return "discovery";
  }
  if (
    args.symptoms.includes("zero_llm_reviews") ||
    args.symptoms.includes("model_update") ||
    contextText.includes("llm") ||
    contextText.includes("model")
  ) {
    return "llm_budget";
  }
  if (contextText.includes("sequence")) {
    return "sequences";
  }
  if (contextText.includes("content analysis") || contextText.includes("policy")) {
    return "content_analysis";
  }
  return "selection";
}

function inferOperatorFlowObjective(args: {
  requested?: unknown;
  domain: OperatingDomain;
  symptoms: readonly OperatorFlowSymptom[];
}): string {
  const requested = readOptionalString(args.requested);
  if (requested) {
    return requested;
  }
  if (args.symptoms.includes("zero_selected") || args.symptoms.includes("semantic_rejected")) {
    return "increase_recall";
  }
  if (args.symptoms.includes("source_failure") || args.symptoms.includes("source_onboarding")) {
    return "debug_source";
  }
  if (args.symptoms.includes("discovery_quality_gap")) {
    return "stabilize_discovery";
  }
  if (args.symptoms.includes("zero_llm_reviews") || args.symptoms.includes("model_update")) {
    return "reduce_cost";
  }
  if (args.domain === "cleanup") {
    return "stabilize_discovery";
  }
  return "increase_precision";
}

function flowRouteMustRead(args: {
  domain: OperatingDomain;
  flowMode: OperatorFlowMode;
  changeIntent: OperatorChangeIntent | null;
  symptoms: readonly OperatorFlowSymptom[];
}) {
  const base = [
    "signalops://guide/playbooks/flow-routing",
    "signalops://guide/playbooks/operator-flow-modes",
    "signalops://guide/playbooks/change-intents",
  ];
  if (
    args.domain === "selection" ||
    args.changeIntent === "selection_tuning" ||
    args.symptoms.includes("zero_selected") ||
    args.symptoms.includes("semantic_rejected") ||
    args.symptoms.includes("technical_filter_rejected")
  ) {
    return uniqueStrings([
      ...base,
      "signalops://guide/playbooks/strict-next-steps",
      "signalops://guide/reference/hidden-signal-evidence-lanes",
      "signalops://guide/reference/selection-evidence-semantics",
      "operator.selection.dashboard",
      "signal_candidates.residuals.summary/list",
      "1-3 signal_candidates.explain rows",
      "system_interests.read",
      "system_interests.compile_status.list",
    ]);
  }
  if (args.domain === "llm_budget" || args.changeIntent === "llm_tuning") {
    return uniqueStrings([
      ...base,
      "signalops://guide/diagnostics/llm_budget",
      "llm_budget.summary",
      "operator.system.health",
      "operator.issue.explain",
      "selection residuals and representative explains when selection is involved",
    ]);
  }
  if (args.flowMode === "source_onboarding" || args.changeIntent === "source_tuning") {
    return uniqueStrings([
      ...base,
      "signalops://guide/scenarios/channels",
      "channels.bottlenecks.summary/list",
      "channels.alternatives.plan",
      "channels.bulk_onboard.plan/apply/verify when applying chosen sources",
      "operator.report.verify for source and selection claims separately",
    ]);
  }
  if (args.flowMode === "cleanup") {
    return uniqueStrings([
      ...base,
      "admin.summary.get",
      "relevant list/read inventory for affected entities",
      "operator.report.verify reportKind=cleanup",
    ]);
  }
  return uniqueStrings([
    ...base,
    "admin.summary.get",
    "relevant domain list/read tools",
    "operator.report.verify or operator.effect.verify before final claims",
  ]);
}

function flowRouteNextToolCalls(args: {
  domain: OperatingDomain;
  flowMode: OperatorFlowMode;
  changeIntent: OperatorChangeIntent | null;
  symptoms: readonly OperatorFlowSymptom[];
  residualBucket: string | null;
}) {
  if (
    args.domain === "selection" ||
    args.changeIntent === "selection_tuning" ||
    args.symptoms.includes("zero_selected") ||
    args.symptoms.includes("semantic_rejected") ||
    args.symptoms.includes("technical_filter_rejected")
  ) {
    return [
      { toolName: "operator.selection.dashboard", reason: "Read current selection counters, filter breakdown, staleness and hard-gate diagnostics." },
      { toolName: "signal_candidates.residuals.summary", reason: "Classify residual buckets before tuning." },
      { toolName: "signal_candidates.residuals.list", reason: "Choose representative docIds for bounded explanation/replay." },
      { toolName: "signal_candidates.explain", reason: "Inspect 1-3 representative rejected or held candidates." },
      { toolName: "system_interests.read", reason: "Read exactly one affected interest before proposing a config edit." },
      { toolName: "system_interests.compile_status.list", reason: "Verify compiled profile/candidateSignals state before replay." },
      { toolName: "operator.report.verify", argumentsTemplate: { reportKind: "selection", includeSamples: true }, reason: "Final selection claims require report verification after replay." },
    ];
  }
  if (args.domain === "llm_budget" || args.changeIntent === "llm_tuning") {
    return [
      { toolName: "llm_budget.summary", reason: "Check spend, queued/completed review state and budget readiness." },
      { toolName: "operator.system.health", argumentsTemplate: { domains: ["llm_budget", "selection"], includeSamples: true }, reason: "Separate provider/budget issues from no reviewable path." },
      { toolName: "operator.issue.explain", argumentsTemplate: { domain: "llm_budget", symptom: args.residualBucket ?? "zero_llm_reviews", includeSamples: true }, reason: "Classify no_reviewable_path, disabled, exhausted, worker, credentials or endpoint/model errors." },
      { toolName: "operator.report.verify", argumentsTemplate: { reportKind: "llm_budget", entityIds: {}, includeSamples: true }, reason: "Verify LLM-budget claims after any tuning or provider fix." },
    ];
  }
  if (args.flowMode === "source_onboarding" || args.changeIntent === "source_tuning") {
    return [
      { toolName: "channels.bottlenecks.summary", reason: "Read active source/provider-shape failures before proposing alternatives." },
      { toolName: "channels.bottlenecks.list", reason: "Inspect representative broken source rows." },
      { toolName: "channels.alternatives.plan", reason: "Plan website/RSS/API alternatives as needs_probe candidates, not automatic writes." },
      { toolName: "operator.report.verify", argumentsTemplate: { reportKind: "channel_onboarding", entityIds: {} }, reason: "Verify source onboarding separately from selection." },
    ];
  }
  if (args.flowMode === "cleanup") {
    return [
      { toolName: "admin.summary.get", reason: "Build a current inventory before cleanup decisions." },
      { toolName: "operator.report.verify", argumentsTemplate: { reportKind: "cleanup", entityIds: {} }, reason: "Verify final cleanup lifecycle state before reporting success." },
    ];
  }
  return [
    { toolName: "admin.summary.get", reason: "Read current operator state before recommending mutations." },
    { toolName: "operator.report.verify", argumentsTemplate: { reportKind: "system_health", entityIds: {} }, reason: "Verify final claims against DB-backed state." },
  ];
}

export function buildOperatorFlowRoute(args: Record<string, unknown>) {
  const funnelId = readOptionalString(args.funnelId);
  const laneId = readOptionalString(args.laneId);
  const symptoms = readOperatorFlowSymptoms(args.symptoms);
  const sessionGoal = readOptionalString(args.sessionGoal);
  const residualBucket = readOptionalString(args.residualBucket);
  const reportKind = readOptionalString(args.reportKind);
  const domain = inferOperatorFlowDomain({
    requested: args.domain,
    sessionGoal,
    residualBucket,
    reportKind,
    symptoms,
  });
  const objective = inferOperatorFlowObjective({
    requested: args.objective,
    domain,
    symptoms,
  });
  const residualContext = routeContextText({
    sessionGoal,
    residualBucket,
    reportKind,
    symptoms,
  });
  const symptomFlowMode = inferOperatorFlowModeFromSymptoms(symptoms);
  const flowMode = inferOperatorFlowMode({
    requested: args.operationMode ?? symptomFlowMode,
    domain,
    objective,
    residualBucket: residualContext,
    reportKind,
  });
  const flowGuidance = buildOperatorFlowGuidance({
    mode: flowMode,
    operatorOverrideReason: readOptionalString(args.operatorOverrideReason),
    affectedScope: readAffectedScope(args.affectedScope),
  });
  const intentGuidance = buildOperatorIntentGuidance({
    mode: flowMode,
    domain,
    objective,
    residualBucket: residualContext,
    reportKind,
    changeIntent: args.changeIntent,
    cleanupIntent: args.cleanupIntent,
    tuningLayer: args.tuningLayer,
    updateRisk: args.updateRisk,
  });
  const signalVisibility = inferSignalVisibility({
    requested: args.signalVisibility,
    objective,
    residualBucket: residualContext,
  });
  const evidenceLaneType = normalizeEvidenceLaneType(args.evidenceLaneType);
  const hardGatePolicy = inferHardGatePolicy({
    requested: args.hardGatePolicy,
    signalVisibility,
  });
  const evidenceLaneGuidance = buildEvidenceLaneGuidance({
    signalVisibility,
    evidenceLaneType,
    hardGatePolicy,
  });
  const normalizedResidual = normalizeText(residualContext);
  const selectionRecallContext =
    domain === "selection" &&
    (objective === "increase_recall" ||
      symptoms.includes("zero_selected") ||
      symptoms.includes("semantic_rejected") ||
      symptoms.includes("technical_filter_rejected") ||
      normalizedResidual.includes("0 selected") ||
      normalizedResidual.includes("zero selected") ||
      normalizedResidual.includes("semantic_rejected") ||
      normalizedResidual.includes("no_system_match") ||
      normalizedResidual.includes("technical_filter_rejected"));
  const mandatoryMarkerProofRequired =
    selectionRecallContext &&
    ["hidden_intent", "mixed", "unknown"].includes(signalVisibility) &&
    (hardGatePolicy !== "allowed" ||
      normalizedResidual.includes("must_have") ||
      normalizedResidual.includes("hard_gate"));
  const strictRecommendation = buildStrictRecommendationLevels(
    domain,
    objective,
    residualContext,
    flowMode,
    flowGuidance.operator_override_allowed
  );
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
  const blockedUntil = mandatoryMarkerProofRequired
    ? [
        "Blocked from using hard lexical gates on hidden/mixed/unknown signals until mandatory-marker proof, current read-back, bounded docIds replay and operator.report.verify samples exist.",
        ...strictRecommendation.blocked_until,
      ]
    : strictRecommendation.blocked_until;
  const mustRead = flowRouteMustRead({
    domain,
    flowMode,
    changeIntent: intentGuidance.changeIntent,
    symptoms,
  });
  const routeWarnings = uniqueStrings([
    "operator.flow.route is read-only advisory routing; it is not proof that a mutation was applied.",
    "Mutation responses are not verified effect; every write still needs MCP read-back and report/effect verification.",
    ...(flowMode === "source_onboarding" || intentGuidance.changeIntent === "source_tuning"
      ? ["Source acquisition proof is not selected-signal proof."]
      : []),
    ...(mandatoryMarkerProofRequired
      ? [
          "Hidden/mixed/unknown selection work cannot use hard lexical gates until mandatory marker proof exists.",
        ]
      : []),
    ...(flowMode === "expert_override" && !flowGuidance.operator_override_allowed
      ? ["Expert override is blocked until operatorOverrideReason and affectedScope are explicit."]
      : []),
    ...(funnelId || laneId
      ? ["This route block is funnel-scoped; carry funnelId/laneId into follow-up reads, writes, replay and report verification."]
      : []),
  ]);
  return {
    generatedAt: new Date().toISOString(),
    sessionGoal: sessionGoal ?? null,
    domain,
    objective,
    symptoms,
    residualBucket: residualBucket ?? null,
    reportKind: reportKind ?? null,
    flowMode,
    funnelScope: {
      funnelId: funnelId ?? null,
      laneId: laneId ?? null,
      scopeRequiredForFollowThrough: Boolean(funnelId || laneId),
    },
    flowSequence: flowGuidance.flowSequence,
    changeIntent: intentGuidance.changeIntent,
    cleanupIntent: intentGuidance.cleanupIntent,
    tuningLayer: intentGuidance.tuningLayer,
    updateRisk: intentGuidance.updateRisk,
    signalVisibility,
    evidenceLaneType,
    evidenceLaneGuidance,
    hardGatePolicy,
    mandatoryMarkerProofRequired,
    mustRead,
    mustDoNext: strictRecommendation.must_do_next,
    allowedAfter: strictRecommendation.allowed_after,
    doNotDoYet: uniqueStrings([...hiddenDoNotDoYet, ...strictRecommendation.do_not_do_yet]),
    blockedUntil,
    proofRequired: flowGuidance.proofRequired,
    readBackRequired: uniqueStrings([
      ...flowGuidance.proofRequired,
      ...intentGuidance.intentProofRequired,
    ]),
    nextToolCalls: flowRouteNextToolCalls({
      domain,
      flowMode,
      changeIntent: intentGuidance.changeIntent,
      symptoms,
      residualBucket: residualBucket ?? null,
    }),
    operator_override_allowed: flowGuidance.operator_override_allowed,
    operator_override_requires: flowGuidance.operator_override_requires,
    proofStatus: flowGuidance.proofStatus,
    missingProof: flowGuidance.missingProof,
    operatorOverrideNotes: flowGuidance.operatorOverrideNotes,
    intentSequence: intentGuidance.intentSequence,
    intentGuardrails: intentGuidance.intentGuardrails,
    intentProofRequired: intentGuidance.intentProofRequired,
    intentBlockedUntil: intentGuidance.intentBlockedUntil,
    intentWarnings: intentGuidance.intentWarnings,
    routeWarnings,
    routingConfidence:
      args.operationMode || symptoms.length > 0 || sessionGoal || residualBucket ? "high" : "medium",
    mutationPolicy:
      "read-only advisory route; writes require existing scoped MCP/admin tools and read-back proof",
  };
}

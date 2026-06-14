import type {
  OperatingDomain,
  OperatorChangeIntent,
  OperatorFlowMode,
  OperatorTuningLayer,
} from "./model";
import {
  normalizeOperatorChangeIntent,
  normalizeOperatorCleanupIntent,
  normalizeOperatorTuningLayer,
  normalizeOperatorUpdateRisk,
  normalizeText,
} from "./value-normalization";

export function inferOperatorChangeIntent(args: {
  requested?: unknown;
  mode: OperatorFlowMode;
  domain?: OperatingDomain;
  objective?: string | null;
  residualBucket?: string | null;
  reportKind?: string | null;
}): OperatorChangeIntent | null {
  const requested = normalizeOperatorChangeIntent(args.requested);
  if (requested) {
    return requested;
  }
  const objective = normalizeText(args.objective);
  const residual = normalizeText(args.residualBucket);
  const reportKind = normalizeText(args.reportKind);
  if (args.mode === "cleanup") {
    return null;
  }
  if (args.mode === "source_onboarding" || args.domain === "channels" || args.domain === "website_pipeline") {
    return objective === "debug_source" || reportKind.includes("source") ? "source_tuning" : "config_update";
  }
  if (args.domain === "selection" || reportKind.includes("selection")) {
    return "selection_tuning";
  }
  if (args.domain === "llm_budget" || residual.includes("llm") || objective === "reduce_cost") {
    return "llm_tuning";
  }
  if (args.domain === "content_analysis") {
    return "policy_update";
  }
  if (args.mode === "scenario_pack_rollout") {
    return "config_update";
  }
  if (args.domain === "discovery" || args.domain === "sequences") {
    return "system_update";
  }
  return null;
}

export function inferOperatorTuningLayer(args: {
  requested?: unknown;
  mode: OperatorFlowMode;
  domain?: OperatingDomain;
  changeIntent?: OperatorChangeIntent | null;
  residualBucket?: string | null;
  reportKind?: string | null;
}): OperatorTuningLayer | null {
  const requested = normalizeOperatorTuningLayer(args.requested);
  if (requested) {
    return requested;
  }
  const residual = normalizeText(args.residualBucket);
  const reportKind = normalizeText(args.reportKind);
  if (args.domain === "llm_budget" || args.changeIntent === "llm_tuning" || residual.includes("provider")) {
    return "llm_provider";
  }
  if (residual.includes("technical_filter") || residual.includes("short_tokens") || residual.includes("wrapper")) {
    return "technical_filter";
  }
  if (residual.includes("semantic") || residual.includes("no_system_match")) {
    return "semantic_match";
  }
  if (residual.includes("gray") || residual.includes("hold")) {
    return "gray_zone_review";
  }
  if (
    args.mode === "source_onboarding" ||
    args.domain === "channels" ||
    args.domain === "website_pipeline" ||
    args.changeIntent === "source_tuning" ||
    reportKind.includes("source")
  ) {
    return "acquisition";
  }
  if (args.domain === "selection" || args.changeIntent === "selection_tuning") {
    return "final_selection";
  }
  return null;
}

export function buildOperatorIntentGuidance(args: {
  mode: OperatorFlowMode;
  domain?: OperatingDomain;
  objective?: string | null;
  residualBucket?: string | null;
  reportKind?: string | null;
  changeIntent?: unknown;
  cleanupIntent?: unknown;
  tuningLayer?: unknown;
  updateRisk?: unknown;
}) {
  const changeIntent = inferOperatorChangeIntent({
    requested: args.changeIntent,
    mode: args.mode,
    domain: args.domain,
    objective: args.objective,
    residualBucket: args.residualBucket,
    reportKind: args.reportKind,
  });
  const cleanupIntent = normalizeOperatorCleanupIntent(args.cleanupIntent);
  const tuningLayer = inferOperatorTuningLayer({
    requested: args.tuningLayer,
    mode: args.mode,
    domain: args.domain,
    changeIntent,
    residualBucket: args.residualBucket,
    reportKind: args.reportKind,
  });
  const updateRisk = normalizeOperatorUpdateRisk(args.updateRisk);

  if (args.mode === "cleanup") {
    return {
      changeIntent,
      cleanupIntent,
      tuningLayer,
      updateRisk,
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
      intentWarnings: cleanupIntent
        ? [`cleanupIntent=${cleanupIntent} is advisory and does not bypass destructive confirmation.`]
        : ["cleanupIntent is optional, but clients should name it before broad cleanup recommendations."],
    };
  }

  if (changeIntent === "selection_tuning") {
    return {
      changeIntent,
      cleanupIntent,
      tuningLayer,
      updateRisk,
      intentSequence: [
        "read operator.selection.dashboard and residual summaries",
        "inspect representative candidates and the affected system interest/read compile status",
        "apply one scoped config edit only after evidence identifies the owner",
        "run bounded maintenance.reindex.request with explicit docIds",
        "verify with operator.report.verify reportKind=selection includeSamples=true",
      ],
      intentGuardrails: [
        "Filter rows and counters are diagnostics, not selected proof.",
        "Do not use keyword/prototype broadening, broad strictness, or LLM template rewrites as the first hidden-signal repair.",
      ],
      intentProofRequired: [
        "operator.selection.dashboard",
        "signal_candidates.residuals.summary/list and representative explains",
        "system_interests.read plus compile status",
        "bounded docIds replay and operator.report.verify selection samples",
      ],
      intentBlockedUntil: [
        "Blocked until residual/read-back/replay/report verification exists for the affected selection layer.",
      ],
      intentWarnings:
        tuningLayer === "technical_filter"
          ? ["technical_filter tuning must prove candidate impact with distinct candidate samples before semantic tuning."]
          : ["Selection tuning must keep acquisition proof separate from final selected proof."],
    };
  }

  if (changeIntent === "llm_tuning") {
    return {
      changeIntent,
      cleanupIntent,
      tuningLayer,
      updateRisk,
      intentSequence: [
        "classify no_reviewable_path, review_disabled, budget_exhausted, worker_not_running, credentials, and provider endpoint/model errors",
        "read llm_budget.summary, operator.system.health and representative candidate explains",
        "change budget/template/model settings only after a reviewable path or provider issue is isolated",
        "run bounded replay when selection changes are involved",
        "verify with operator.report.verify reportKind=llm_budget and selection when applicable",
      ],
      intentGuardrails: [
        "Zero LLM spend is not proof that LLM is broken.",
        "LLM tuning cannot bypass semantic_rejected/no_system_match.",
      ],
      intentProofRequired: [
        "llm_budget.summary",
        "operator.system.health",
        "operator.issue.explain or provider error samples",
        "operator.report.verify reportKind=llm_budget",
      ],
      intentBlockedUntil: [
        "Blocked until the LLM-review layer is classified and provider/model readiness is separated from selection tuning.",
      ],
      intentWarnings: ["Provider endpoint/model errors are provider preflight failures, not budget tuning evidence."],
    };
  }

  if (changeIntent === "source_tuning" || changeIntent === "cadence_update") {
    return {
      changeIntent,
      cleanupIntent,
      tuningLayer,
      updateRisk,
      intentSequence: [
        "read current channel/source state",
        "run bottlenecks, alternatives or probe when source shape is uncertain",
        "apply one bounded source/cadence/provider update through MCP/admin",
        "read back channel, fetch run, web resource or source inventory state",
        "verify downstream selection separately when selection claims are made",
      ],
      intentGuardrails: [
        "Source acquisition proof is not selection proof.",
        "Do not auto-create fallback sources from stale reports or invalid feed URLs.",
      ],
      intentProofRequired: [
        "channels.read/list or discovery source inventory read-back",
        "channels.bottlenecks.* or probe/alternative evidence when repairing source shape",
        "fetch_runs/web_resources/source inventory proof",
        "operator.report.verify for source and selection claims separately",
      ],
      intentBlockedUntil: [
        "Blocked until source read-back and acquisition proof exist; selection claims remain blocked until downstream selection proof exists.",
      ],
      intentWarnings: ["Acquisition, projection and final selection are separate layers."],
    };
  }

  return {
    changeIntent,
    cleanupIntent,
    tuningLayer,
    updateRisk,
    intentSequence: [
      "read current affected state",
      "apply one scoped staged write only after owner and intent are clear",
      "read back persisted state",
      "run bounded sample proof or probe",
      "verify before expanding scope",
    ],
    intentGuardrails: [
      "Mutation response is not verified effect.",
      "Schema, model, policy and config updates require compatibility/read-back proof before rollout claims.",
    ],
    intentProofRequired: [
      "current-state read-back",
      "post-write read-back",
      "bounded sample proof or probe",
      "operator.report.verify or operator.effect.verify as applicable",
    ],
    intentBlockedUntil: [
      "Blocked from rollout claims until current read-back, write read-back, sample proof and report verification exist.",
    ],
    intentWarnings:
      updateRisk === "high"
        ? ["High-risk updates require explicit operator approval and narrow affected scope before mutation."]
        : ["Intent fields are advisory and do not make write tools mode-dependent."],
  };
}

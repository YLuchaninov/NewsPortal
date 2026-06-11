import { readOptionalString } from "../protocol";
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
  type EvidenceLaneType,
  type HardGatePolicy,
  type OperatingDomain,
  type OperatorChangeIntent,
  type OperatorCleanupIntent,
  type OperatorFlowMode,
  type OperatorFlowSymptom,
  type OperatorTuningLayer,
  type OperatorUpdateRisk,
  type SignalVisibility,
} from "./model";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

export function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => readOptionalString(entry))
    .filter((entry): entry is string => Boolean(entry));
}

export function readAffectedScope(value: unknown): string[] {
  return readStringArray(value).map((entry) => entry.trim()).filter(Boolean);
}

export function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

export function normalizeText(value: unknown): string {
  return String(value ?? "")
    .replace(/\s+/gu, " ")
    .trim()
    .toLowerCase();
}

export function normalizeOperatorFlowMode(value: unknown): OperatorFlowMode | null {
  const normalized = normalizeText(value).replace(/[-\s]+/gu, "_");
  return (OPERATOR_FLOW_MODE_VALUES as readonly string[]).includes(normalized)
    ? (normalized as OperatorFlowMode)
    : null;
}

export function normalizeOperatingDomain(value: unknown): OperatingDomain | null {
  const normalized = normalizeText(value).replace(/[-\s]+/gu, "_");
  return (OPERATING_DOMAIN_VALUES as readonly string[]).includes(normalized)
    ? (normalized as OperatingDomain)
    : null;
}

export function normalizeOperatorFlowSymptom(value: unknown): OperatorFlowSymptom | null {
  const normalized = normalizeText(value).replace(/[-\s]+/gu, "_");
  return (OPERATOR_FLOW_SYMPTOM_VALUES as readonly string[]).includes(normalized)
    ? (normalized as OperatorFlowSymptom)
    : null;
}

export function readOperatorFlowSymptoms(value: unknown): OperatorFlowSymptom[] {
  return readStringArray(value)
    .map((entry) => normalizeOperatorFlowSymptom(entry))
    .filter((entry): entry is OperatorFlowSymptom => entry != null);
}

export function normalizeOperatorChangeIntent(value: unknown): OperatorChangeIntent | null {
  const normalized = normalizeText(value).replace(/[-\s]+/gu, "_");
  return (OPERATOR_CHANGE_INTENT_VALUES as readonly string[]).includes(normalized)
    ? (normalized as OperatorChangeIntent)
    : null;
}

export function normalizeOperatorCleanupIntent(value: unknown): OperatorCleanupIntent | null {
  const normalized = normalizeText(value).replace(/[-\s]+/gu, "_");
  return (OPERATOR_CLEANUP_INTENT_VALUES as readonly string[]).includes(normalized)
    ? (normalized as OperatorCleanupIntent)
    : null;
}

export function normalizeOperatorTuningLayer(value: unknown): OperatorTuningLayer | null {
  const normalized = normalizeText(value).replace(/[-\s]+/gu, "_");
  return (OPERATOR_TUNING_LAYER_VALUES as readonly string[]).includes(normalized)
    ? (normalized as OperatorTuningLayer)
    : null;
}

export function normalizeOperatorUpdateRisk(value: unknown): OperatorUpdateRisk | null {
  const normalized = normalizeText(value).replace(/[-\s]+/gu, "_");
  return (OPERATOR_UPDATE_RISK_VALUES as readonly string[]).includes(normalized)
    ? (normalized as OperatorUpdateRisk)
    : null;
}

export function normalizeSignalVisibility(value: unknown): SignalVisibility | null {
  const normalized = normalizeText(value).replace(/[-\s]+/gu, "_");
  return (SIGNAL_VISIBILITY_VALUES as readonly string[]).includes(normalized)
    ? (normalized as SignalVisibility)
    : null;
}

export function normalizeEvidenceLaneType(value: unknown): EvidenceLaneType | null {
  const normalized = normalizeText(value).replace(/[-\s]+/gu, "_");
  return (EVIDENCE_LANE_TYPE_VALUES as readonly string[]).includes(normalized)
    ? (normalized as EvidenceLaneType)
    : null;
}

export function normalizeHardGatePolicy(value: unknown): HardGatePolicy | null {
  const normalized = normalizeText(value).replace(/[-\s]+/gu, "_");
  return (HARD_GATE_POLICY_VALUES as readonly string[]).includes(normalized)
    ? (normalized as HardGatePolicy)
    : null;
}

export function inferSignalVisibility(args: {
  requested?: unknown;
  residualBucket?: string | null;
  objective?: string | null;
}): SignalVisibility {
  const requested = normalizeSignalVisibility(args.requested);
  if (requested) {
    return requested;
  }
  const residual = normalizeText(args.residualBucket);
  const objective = normalizeText(args.objective);
  if (residual.includes("mixed")) {
    return "mixed";
  }
  if (residual.includes("explicit_marker") || residual.includes("mandatory_marker")) {
    return "explicit_marker";
  }
  if (
    residual.includes("hidden") ||
    residual.includes("operational") ||
    residual.includes("rare") ||
    residual.includes("semantic_rejected") ||
    residual.includes("no_system_match") ||
    residual.includes("0 selected") ||
    residual.includes("zero selected") ||
    objective.includes("increase_recall")
  ) {
    return "unknown";
  }
  return "unknown";
}

export function inferHardGatePolicy(args: {
  requested?: unknown;
  signalVisibility: SignalVisibility;
}): HardGatePolicy {
  const requested = normalizeHardGatePolicy(args.requested);
  if (requested) {
    return requested;
  }
  if (args.signalVisibility === "explicit_marker") {
    return "allowed_with_mandatory_marker_proof";
  }
  return "forbidden_by_default";
}

export function buildEvidenceLaneGuidance(args: {
  signalVisibility: SignalVisibility;
  evidenceLaneType: EvidenceLaneType | null;
  hardGatePolicy: HardGatePolicy;
}) {
  const baseline = {
    hardGateBaseline:
      args.signalVisibility === "explicit_marker"
        ? "must_have_terms may be used only when a mandatory marker is proven by representative samples and bounded replay."
        : "For hidden, mixed, or unknown signals the baseline is must_have_terms=[] and short_tokens_required=[].",
    candidateSignalCueContract:
      "candidateSignals cue groups should contain literal observable fragments; group.name is only a conceptual label.",
    proof:
      "Every lane needs read-back, representative samples, bounded docIds replay/probe, and operator.report.verify before success claims.",
  };
  const lanes = [
    {
      evidenceLaneType: "explicit_marker_lane",
      guidance:
        "Use for evidence paths with a proven mandatory marker. Hard gates are allowed only after marker proof, before/after samples, and bounded replay.",
    },
    {
      evidenceLaneType: "hidden_intent_lane",
      guidance:
        "Use for operational or indirect intent. Keep hard lexical gates empty by default; recover through prototypes, literal candidateSignals, source/context evidence, near-miss negatives, gray/hold/review.",
    },
    {
      evidenceLaneType: "source_context_lane",
      guidance:
        "Use for source authority, listing/document shape, or channel context. Source acquisition proof remains separate from final selection proof.",
    },
    {
      evidenceLaneType: "negative_control_lane",
      guidance:
        "Use for near-miss and noise controls such as generic advice, seller-authored pages, source wrappers, stale or unrelated records.",
    },
  ];
  const warnings = [
    "must_have_terms is any-of, but still a hard pre-semantic gate.",
    "OR hard gates are not hidden-signal safe unless mandatory marker proof exists.",
    "Mixed signals must be split into lane-like system interests, criteria, or scenario-pack entries; hidden lanes must not inherit explicit-marker gates.",
  ];
  return {
    signalVisibility: args.signalVisibility,
    evidenceLaneType: args.evidenceLaneType,
    hardGatePolicy: args.hardGatePolicy,
    baseline,
    lanes,
    selectedLane:
      args.evidenceLaneType == null
        ? null
        : lanes.find((lane) => lane.evidenceLaneType === args.evidenceLaneType) ?? null,
    warnings,
  };
}

export function inferOperatorFlowMode(args: {
  requested?: unknown;
  domain?: OperatingDomain;
  objective?: string | null;
  residualBucket?: string | null;
  reportKind?: string | null;
}): OperatorFlowMode {
  const requested = normalizeOperatorFlowMode(args.requested);
  if (requested) {
    return requested;
  }
  const residual = normalizeText(args.residualBucket);
  const objective = normalizeText(args.objective);
  const reportKind = normalizeText(args.reportKind);
  if (args.domain === "cleanup" || reportKind === "cleanup") {
    return "cleanup";
  }
  if (
    args.domain === "channels" ||
    args.domain === "website_pipeline" ||
    objective === "debug_source" ||
    reportKind === "channel_onboarding" ||
    reportKind === "source_bottleneck" ||
    reportKind === "channel_health" ||
    reportKind === "website_pipeline"
  ) {
    return "source_onboarding";
  }
  if (
    args.domain === "discovery" ||
    objective === "stabilize_discovery" ||
    reportKind === "discovery_run" ||
    residual.includes("quality_gap")
  ) {
    return residual.includes("scenario_pack") ? "scenario_pack_rollout" : "diagnostic";
  }
  if (
    residual.includes("0 selected") ||
    residual.includes("zero selected") ||
    residual.includes("0 llm") ||
    residual.includes("zero llm") ||
    residual.includes("semantic_rejected") ||
    residual.includes("no_system_match") ||
    residual.includes("technical_filter_rejected") ||
    residual.includes("provider_endpoint_error") ||
    residual.includes("source failure") ||
    residual.includes("source_failure")
  ) {
    return "diagnostic";
  }
  return "planned_change";
}

export function operatorFlowSequence(mode: OperatorFlowMode): string[] {
  if (mode === "diagnostic") {
    return [
      "read current state",
      "classify the failing layer",
      "apply at most one bounded write after evidence",
      "run bounded replay or probe",
      "verify with read-back samples before final claims",
    ];
  }
  if (mode === "planned_change") {
    return [
      "state operator intent",
      "read current affected config/state",
      "apply one scoped staged write",
      "read back persisted state",
      "run sample replay or source probe",
      "verify effect before expanding scope",
    ];
  }
  if (mode === "expert_override") {
    return [
      "record operatorOverrideReason and affectedScope",
      "capture expected effect plus rollback or previous-state hint",
      "apply the explicitly chosen bounded action",
      "read back the affected entities",
      "verify with report samples before reporting success",
    ];
  }
  if (mode === "source_onboarding") {
    return [
      "plan source/provider shape",
      "probe or review alternatives before writes",
      "apply through MCP/admin onboarding",
      "sync and read back channel/fetch/resource state",
      "prove persisted candidates/resources",
      "verify downstream selection separately",
    ];
  }
  if (mode === "scenario_pack_rollout") {
    return [
      "load scenario pack as operator config evidence",
      "preview diff against current MCP/admin state",
      "apply only approved config changes",
      "read back persisted interests/templates/channels/policies",
      "run bounded replay",
      "verify report with samples",
    ];
  }
  return [
    "inventory current entities",
    "prefer reversible archive/deactivate actions",
    "use destructive confirm=true only when explicitly required",
    "read back final lifecycle state",
    "verify cleanup report",
  ];
}

export function buildOperatorFlowGuidance(args: {
  mode: OperatorFlowMode;
  operatorOverrideReason?: string | null;
  affectedScope?: readonly string[];
}) {
  const mode = args.mode;
  const hasOverrideReason = Boolean(args.operatorOverrideReason?.trim());
  const affectedScope = args.affectedScope ?? [];
  const baseProof = [
    "MCP read-back of every affected entity after writes",
    "operator.report.verify with includeSamples=true for final claims when the report kind supports samples",
  ];
  const expertRequires = [
    "operatorOverrideReason",
    "affectedScope",
    "expected effect",
    "read-back target",
    "verification target",
    "rollback or previous-state hint",
  ];
  const missingProof =
    mode === "expert_override" && !hasOverrideReason
      ? ["operatorOverrideReason is required before treating expert override as allowed."]
      : [];
  return {
    flowMode: mode,
    flowSequence: operatorFlowSequence(mode),
    operator_override_allowed: mode === "expert_override" && hasOverrideReason,
    operator_override_requires: expertRequires,
    proofRequired:
      mode === "source_onboarding"
        ? [
            ...baseProof,
            "fetch_runs/web_resources or source inventory read-back",
            "downstream selection proof is separate from source acquisition proof",
          ]
        : mode === "planned_change"
          ? [
              ...baseProof,
              "sample replay/probe before expanding beyond the staged change",
              "mutation response alone is not verified effect",
            ]
          : mode === "expert_override"
            ? [
                ...baseProof,
                "explicit operator override reason and affected scope",
                "samples or replay/probe evidence before reporting success",
              ]
            : baseProof,
    proofStatus:
      mode === "expert_override" && !hasOverrideReason
        ? "blocked"
        : mode === "diagnostic"
          ? "partial"
          : "partial",
    missingProof,
    operatorOverrideNotes:
      mode === "expert_override"
        ? [
            hasOverrideReason
              ? `Expert override requested: ${args.operatorOverrideReason}.`
              : "Expert override is blocked until operatorOverrideReason is supplied.",
            affectedScope.length > 0
              ? `Affected scope: ${affectedScope.join(", ")}.`
              : "Affected scope must be named before broad changes are trusted.",
            "Override can skip parts of diagnosis, but it cannot skip MCP read-back or report verification.",
          ]
        : [
            "Use expert_override only when an experienced operator explicitly chooses to deviate from the canonical sequence.",
          ],
  };
}

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

export function buildStrictRecommendationLevels(
  domain: OperatingDomain,
  objective: string,
  residualBucket: string | null,
  flowMode: OperatorFlowMode = "diagnostic",
  operatorOverrideAllowed = false
) {
  if (flowMode === "expert_override") {
    return {
      must_do_next: [
        operatorOverrideAllowed
          ? "Read back affected entities immediately after the explicit operator override action, then verify with operator.report.verify before reporting success."
          : "Collect operatorOverrideReason and affectedScope before treating expert override as allowed.",
      ],
      allowed_after: [
        "Apply only the explicitly chosen bounded action after the operator names expected effect, read-back target, verification target, and rollback or previous-state hint.",
        "Continue or expand only after MCP read-back and report verification show the intended effect.",
      ],
      do_not_do_yet: [
        "Do not treat expert override as permission for unbounded mass edits, domain-specific runtime defaults, or skipped final verification.",
      ],
      blocked_until: operatorOverrideAllowed
        ? ["Blocked from success claims until read-back and operator.report.verify proof exist."]
        : [
            "Blocked until operatorOverrideReason, affectedScope, read-back target, verification target, and rollback or previous-state hint are explicit.",
          ],
    };
  }
  if (flowMode === "planned_change") {
    return {
      must_do_next: [
        "State the operator intent, read the affected current config/state, and propose one scoped staged write before any broader rollout.",
      ],
      allowed_after: [
        "One bounded MCP/admin write after current read-back confirms the affected owner.",
        "Sample replay or source probe after write read-back confirms persisted state.",
        "Expand scope only after operator.report.verify or operator.effect.verify confirms expected movement.",
      ],
      do_not_do_yet: [
        "Do not present a mutation response as verified effect.",
        "Do not run emergency zero-selected diagnosis unless current read-back shows a diagnostic failure state.",
      ],
      blocked_until: [
        "Blocked from rollout claims until current-state read-back, write read-back, sample replay/probe, and report verification exist.",
      ],
    };
  }
  if (flowMode === "source_onboarding") {
    return {
      must_do_next: [
        "Plan source/provider shape, probe or review alternatives, then apply only through MCP/admin onboarding with read-back.",
      ],
      allowed_after: [
        "channels.bulk_onboard.plan/apply/verify or Discovery vNext routing handoff after source evidence is current.",
        "Downstream selection tuning only after persisted candidates/resources prove acquisition worked.",
      ],
      do_not_do_yet: [
        "Do not auto-create website/RSS/API alternatives from stale reports or invalid feed URLs without probe/read-back evidence.",
        "Do not report source acquisition as selected-signal proof.",
      ],
      blocked_until: [
        "Blocked until source bottlenecks/alternatives, apply read-back, fetch/resource or source inventory proof, and downstream report verification exist.",
      ],
    };
  }
  if (flowMode === "scenario_pack_rollout") {
    return {
      must_do_next: [
        "Load the scenario pack as operator config evidence, preview the diff against current MCP/admin state, and request explicit approval before writes.",
      ],
      allowed_after: [
        "Apply approved config only through MCP/admin, read back persisted state, run bounded replay, then verify with samples.",
      ],
      do_not_do_yet: [
        "Do not encode scenario vocabulary into runtime defaults, prompts, required tests, or hardcoded policies.",
      ],
      blocked_until: [
        "Blocked until preview diff, approved config scope, read-back, bounded replay and report verification exist.",
      ],
    };
  }
  if (flowMode === "cleanup") {
    return {
      must_do_next: [
        "Build a read-only inventory, separate reversible archive/deactivate actions from destructive actions, and verify final lifecycle state.",
      ],
      allowed_after: [
        "Use destructive tools only with existing scopes and confirm=true after inventory proves the target is disposable.",
      ],
      do_not_do_yet: [
        "Do not delete protected/default/system objects or retained audit evidence without explicit operator confirmation.",
      ],
      blocked_until: [
        "Blocked until inventory, chosen reversible/destructive action list, read-back, and cleanup report verification exist.",
      ],
    };
  }
  const normalizedResidual = normalizeText(residualBucket);
  const selectionRecall =
    domain === "selection" &&
    (objective === "increase_recall" ||
      normalizedResidual.includes("0 selected") ||
      normalizedResidual.includes("zero selected") ||
      normalizedResidual.includes("semantic_rejected") ||
      normalizedResidual.includes("no_system_match") ||
      normalizedResidual.includes("technical_filter_rejected"));
  if (selectionRecall) {
    return {
      must_do_next: [
        "Read operator.selection.dashboard, signal_candidates.residuals.summary/list, 1-3 signal_candidates.explain rows, system_interests.read, and system_interests.compile_status.list before proposing any write.",
        "If a write was already attempted, verify actual profile/candidateSignals/compile status with MCP read-back before replay.",
      ],
      allowed_after: [
        "One bounded system_interests.update using canonical fields after representative evidence identifies the affected interest.",
        "maintenance.reindex.request with 25-50 explicit docIds after write read-back confirms persisted state.",
        "operator.report.verify reportKind=selection includeSamples=true after maintenance.reindex_jobs.list shows completion.",
      ],
      do_not_do_yet: [
        "Do not mass edit interests, switch strictness=broad, expand positive terms, rewrite LLM templates, or add more RSS as the first response.",
        "Do not report LLM failure from zero spend until no_reviewable_path, review_disabled, budget_exhausted, worker_not_running, provider_credentials_missing, and provider_endpoint_error are classified.",
      ],
      blocked_until: [
        "Blocked until residual summary/list, representative explains, affected interest read-back, compile/profile read-back, bounded docIds replay result, and operator.report.verify proof exist.",
      ],
    };
  }
  if (
    domain === "llm_budget" ||
    objective === "reduce_cost" ||
    normalizedResidual.includes("0 llm") ||
    normalizedResidual.includes("zero llm")
  ) {
    return {
      must_do_next: [
        "Classify absent LLM review as no_reviewable_path, review_disabled, budget_exhausted, worker_not_running, provider_credentials_missing, or provider_endpoint_error before changing budget/templates.",
      ],
      allowed_after: [
        "Tune budget or templates only after candidates are proven to reach a reviewable gray/hold path or provider endpoint errors are isolated.",
      ],
      do_not_do_yet: [
        "Do not call LLM broken and do not tune spend from zero LLM usage alone.",
        "Do not rewrite LLM templates to bypass semantic_rejected/no_system_match.",
      ],
      blocked_until: [
        "Blocked until llm_budget.summary, operator.system.health, operator.issue.explain, residuals, and representative explains identify the exact LLM-review layer.",
      ],
    };
  }
  if (domain === "discovery" || objective === "stabilize_discovery") {
    return {
      must_do_next: [
        "Report Discovery status with candidate count, distinct persisted candidates, probe coverage, warnings, routing decisions, and handoff counts.",
        "Treat passed_with_quality_gap as partial proof only.",
      ],
      allowed_after: [
        "Run channels.bottlenecks.* and channels.alternatives.plan for broken RSS/API/website shape.",
        "Register/apply sources only through MCP/admin, then sync/read-back/verify.",
      ],
      do_not_do_yet: [
        "Do not use discovery.brief.preview as a bypass for domain_contamination or persisted artifact validation.",
        "Do not auto-trust listing/website sources without SourceUnderstanding and downstream selection proof.",
      ],
      blocked_until: [
        "Blocked until Discovery run read-back, source inventory/routing evidence, probe coverage warnings, and source/channel verification are available.",
      ],
    };
  }
  return {
    must_do_next: [
      "Read current state, classify the failing layer, and call operator.report.verify before proposing writes.",
    ],
    allowed_after: ["Apply one bounded MCP/admin write only after read-back evidence identifies the owner."],
    do_not_do_yet: ["Do not mass edit configuration or report success from intent without MCP read-back."],
    blocked_until: ["Blocked until read-back and verification proof exist."],
  };
}

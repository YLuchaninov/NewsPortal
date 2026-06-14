import type { OperatingDomain, OperatorFlowMode } from "./model";
import { normalizeOperatorFlowMode, normalizeText } from "./value-normalization";

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

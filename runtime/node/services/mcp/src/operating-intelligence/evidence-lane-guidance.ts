import type { EvidenceLaneType, HardGatePolicy, SignalVisibility } from "./model";
import { normalizeHardGatePolicy, normalizeSignalVisibility, normalizeText } from "./value-normalization";

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

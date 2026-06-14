import type { FunnelLaneType } from "./funnel-model";

export interface FunnelPreset {
  key: string;
  classifyIdea: (idea: string) => FunnelLaneType[];
  buildCandidateSignalGroups: (laneType: FunnelLaneType) => {
    positive: Array<Record<string, unknown>>;
    negative: Array<Record<string, unknown>>;
  };
}

function normalizeText(value: unknown): string {
  return String(value ?? "").toLowerCase().replace(/\s+/gu, " ").trim();
}

function hasAny(text: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

const DEFAULT_EXPLICIT_PATTERNS = [
  /\brequest\s+for\s+(proposal|quote|vendor|supplier|partner)\b/iu,
  /\b(rfp|rfq|tender|bid|procurement|proposal|vendor\s+needed|supplier\s+needed)\b/iu,
  /\b(looking\s+for|seeking|need|needs)\s+(a\s+)?(vendor|supplier)\b/iu,
];

const DEFAULT_HIDDEN_PATTERNS = [
  /\b(long[-\s]?term|legacy|migration|moderni[sz]ation|integration|capacity|scale|cost\s+pressure|replace|takeover|implementation|partner|developer|development|delivery)\b/iu,
  /\b(struggling|blocked|delayed|backlog|support\s+burden|technical\s+debt|manual\s+process)\b/iu,
];

const DEFAULT_CONTEXT_PATTERNS = [
  /\b(report|analysis|trend|market|funding|launch|partnership|case\s+study|thought\s+leadership|tutorial|guide)\b/iu,
];

function classifyIdeaWithDefaultPreset(idea: string): FunnelLaneType[] {
  const text = normalizeText(idea);
  if (!text) {
    return ["unknown"];
  }
  const explicit = hasAny(text, DEFAULT_EXPLICIT_PATTERNS);
  const hidden = hasAny(text, DEFAULT_HIDDEN_PATTERNS);
  const context = hasAny(text, DEFAULT_CONTEXT_PATTERNS);
  if (explicit && hidden) {
    return ["explicit_marker", "hidden_intent"];
  }
  if (explicit) {
    return ["explicit_marker"];
  }
  if (hidden) {
    return ["hidden_intent"];
  }
  if (context) {
    return ["context_only"];
  }
  return ["unknown"];
}

function buildDefaultCandidateSignalGroups(laneType: FunnelLaneType): {
  positive: Array<Record<string, unknown>>;
  negative: Array<Record<string, unknown>>;
} {
  if (laneType === "explicit_marker") {
    return {
      positive: [
        { name: "direct_request", tier: "buyer_intent", cues: ["looking for vendor", "need a supplier", "request for proposal"] },
        { name: "procurement_process", tier: "project_intent", cues: ["submit proposal", "deadline for bids", "scope of work"] },
        { name: "delivery_object", tier: "project_intent", cues: ["implementation partner", "build and maintain", "project delivery"] },
      ],
      negative: [
        { name: "seller_marketing", tier: "context", cues: ["case study", "we help companies", "our services"] },
        { name: "directory_wrapper", tier: "context", cues: ["browse vendors", "top companies", "category page"] },
      ],
    };
  }
  if (laneType === "hidden_intent") {
    return {
      positive: [
        { name: "operational_pressure", tier: "buyer_intent", cues: ["manual process", "delivery backlog", "support burden"] },
        { name: "change_object", tier: "project_intent", cues: ["legacy migration", "system integration", "modernization project"] },
        { name: "external_partner_fit", tier: "project_intent", cues: ["long-term partner", "implementation support", "delivery partner"] },
      ],
      negative: [
        { name: "generic_commentary", tier: "context", cues: ["best practices", "tutorial", "market trends"] },
        { name: "hiring_noise", tier: "context", cues: ["we are hiring", "job opening", "join our team"] },
      ],
    };
  }
  return {
    positive: [
      { name: "representative_evidence", tier: "context", cues: ["observable cue from candidate text"] },
    ],
    negative: [
      { name: "near_miss_noise", tier: "context", cues: ["generic commentary", "navigation page"] },
    ],
  };
}

export const DEFAULT_FUNNEL_PRESET: FunnelPreset = {
  key: "default",
  classifyIdea: classifyIdeaWithDefaultPreset,
  buildCandidateSignalGroups: buildDefaultCandidateSignalGroups,
};

export function resolveFunnelPreset(presetKey: string | null | undefined = "default"): FunnelPreset {
  const normalized = String(presetKey ?? "default").trim() || "default";
  if (normalized === "default") {
    return DEFAULT_FUNNEL_PRESET;
  }
  throw new Error(`Unknown funnel preset: ${normalized}`);
}

export function classifyIdeaWithDefaultPresetForCompatibility(idea: string): FunnelLaneType[] {
  return DEFAULT_FUNNEL_PRESET.classifyIdea(idea);
}

export function buildDefaultCandidateSignalGroupsForCompatibility(laneType: FunnelLaneType) {
  return DEFAULT_FUNNEL_PRESET.buildCandidateSignalGroups(laneType);
}

export {
  buildDefaultCandidateSignalGroupsForCompatibility as buildDefaultCandidateSignalGroups,
  classifyIdeaWithDefaultPresetForCompatibility as classifyIdeaWithDefaultPreset,
};

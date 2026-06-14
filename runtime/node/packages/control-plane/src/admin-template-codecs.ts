import type {
  CandidateSignalDefinition,
  CandidateSignalGroup,
  InterestTemplateInput,
  SelectionProfilePolicyDefinition,
} from "./admin-template-model";
import { DEFAULT_SELECTION_PROFILE_POLICY } from "./admin-template-model";

export function readOptionalString(value: unknown): string | null {
  if (value == null) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized ? normalized : null;
}

export function readRequiredString(value: unknown, fieldName: string): string {
  const normalized = readOptionalString(value);
  if (!normalized) {
    throw new Error(`Template field "${fieldName}" is required.`);
  }
  return normalized;
}

export function readBoolean(value: unknown, fallback: boolean, fieldName: string): boolean {
  if (value == null || value === "") {
    return fallback;
  }
  if (typeof value === "boolean") {
    return value;
  }

  const normalized = String(value).trim().toLowerCase();
  if (normalized === "true") {
    return true;
  }
  if (normalized === "false") {
    return false;
  }

  throw new Error(`Template field "${fieldName}" must be a boolean.`);
}

export function readPositiveNumber(value: unknown, fallback: number, fieldName: string): number {
  if (value == null || value === "") {
    return fallback;
  }

  const parsed =
    typeof value === "number"
      ? value
      : (() => {
          const normalized = String(value).trim().replace(",", ".");
          if (!/^(?:\d+|\d*\.\d+)$/.test(normalized)) {
            return Number.NaN;
          }
          return Number.parseFloat(normalized);
        })();
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Template field "${fieldName}" must be a positive number.`);
  }

  return parsed;
}

export function readPositiveInteger(value: unknown, fallback: number, fieldName: string): number {
  if (value == null || value === "") {
    return fallback;
  }
  const parsed =
    typeof value === "number" ? value : Number.parseInt(String(value).trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0 || !Number.isInteger(parsed)) {
    throw new Error(`Template field "${fieldName}" must be a positive integer.`);
  }
  return parsed;
}

export function readStringEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
  fieldName: string
): T {
  const normalized = readOptionalString(value);
  if (!normalized) {
    return fallback;
  }
  if ((allowed as readonly string[]).includes(normalized)) {
    return normalized as T;
  }
  throw new Error(
    `Template field "${fieldName}" must be one of: ${allowed.join(", ")}.`
  );
}

export function readNullablePositiveInteger(
  value: unknown,
  fieldName: string
): number | null {
  if (value == null || value === "") {
    return null;
  }

  const parsed =
    typeof value === "number" ? value : Number.parseInt(String(value).trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0 || !Number.isInteger(parsed)) {
    throw new Error(`Template field "${fieldName}" must be a positive integer.`);
  }

  return parsed;
}

export function nullablePositiveIntegersEqual(left: unknown, right: unknown): boolean {
  const normalize = (value: unknown): number | null => {
    if (value == null || value === "") {
      return null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  };

  return normalize(left) === normalize(right);
}

export function readTextList(value: unknown, options: { splitCommas?: boolean } = {}): string[] {
  const values = Array.isArray(value) ? value : [value];
  return values
    .flatMap((entry) => String(entry ?? "").split("\n"))
    .flatMap((entry) => (options.splitCommas ? entry.split(",") : [entry]))
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function slugifyCandidateSignalName(value: string, fallback: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || fallback;
}

function normalizeCandidateSignalTier(
  value: unknown
): CandidateSignalGroup["tier"] | undefined {
  const normalized = String(value ?? "").trim();
  if (["context", "buyer_intent", "project_intent"].includes(normalized)) {
    return normalized as CandidateSignalGroup["tier"];
  }
  return undefined;
}

export function parseCandidateSignalGroups(value: unknown): CandidateSignalGroup[] {
  const lines = readTextList(value);
  const groups: CandidateSignalGroup[] = [];

  for (const [index, line] of lines.entries()) {
    const separatorIndex = line.indexOf(":");
    const rawName = separatorIndex >= 0 ? line.slice(0, separatorIndex).trim() : "";
    const rawCueBlock = separatorIndex >= 0 ? line.slice(separatorIndex + 1) : line;
    const cues = rawCueBlock
      .split(/[|,]/u)
      .map((entry) => entry.trim())
      .filter(Boolean);
    if (cues.length === 0) {
      continue;
    }

    groups.push({
      name: slugifyCandidateSignalName(rawName, `group_${index + 1}`),
      cues,
    });
  }

  return groups;
}

function normalizeCandidateSignalGroup(value: unknown): CandidateSignalGroup | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const cues = Array.isArray(record.cues)
    ? record.cues.map((entry) => String(entry ?? "").trim()).filter(Boolean)
    : Array.isArray(record.terms)
      ? record.terms.map((entry) => String(entry ?? "").trim()).filter(Boolean)
      : [];
  if (cues.length === 0) {
    return null;
  }

  const tier = normalizeCandidateSignalTier(record.tier);
  return {
    name: slugifyCandidateSignalName(String(record.name ?? ""), "group"),
    ...(tier ? { tier } : {}),
    cues,
  };
}

export function normalizeCandidateSignalGroups(value: unknown): CandidateSignalGroup[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => normalizeCandidateSignalGroup(entry))
    .filter((entry): entry is CandidateSignalGroup => entry !== null);
}

export function readCandidateSignalDefinition(
  definitionJson: unknown
): CandidateSignalDefinition {
  if (!definitionJson || typeof definitionJson !== "object" || Array.isArray(definitionJson)) {
    return {
      positiveGroups: [],
      negativeGroups: [],
    };
  }

  const record = definitionJson as Record<string, unknown>;
  const rawCandidateSignals = record.candidateSignals;
  if (
    !rawCandidateSignals ||
    typeof rawCandidateSignals !== "object" ||
    Array.isArray(rawCandidateSignals)
  ) {
    return {
      positiveGroups: [],
      negativeGroups: [],
    };
  }

  const candidateSignals = rawCandidateSignals as Record<string, unknown>;
  return {
    positiveGroups: normalizeCandidateSignalGroups(candidateSignals.positiveGroups),
    negativeGroups: normalizeCandidateSignalGroups(candidateSignals.negativeGroups),
  };
}

export function readAutoSelectModeDefault(
  signalVisibility: SelectionProfilePolicyDefinition["signalVisibility"]
): SelectionProfilePolicyDefinition["autoSelectMode"] {
  if (signalVisibility === "explicit_marker") {
    return "evidence_or_llm";
  }
  if (signalVisibility === "hidden_intent") {
    return "llm_approved";
  }
  return DEFAULT_SELECTION_PROFILE_POLICY.autoSelectMode;
}

export function readSelectionProfilePolicyDefinition(
  policyJson: unknown
): SelectionProfilePolicyDefinition {
  if (!policyJson || typeof policyJson !== "object" || Array.isArray(policyJson)) {
    return { ...DEFAULT_SELECTION_PROFILE_POLICY };
  }

  const record = policyJson as Record<string, unknown>;
  const signalVisibility = readStringEnum(
    record.signalVisibility,
    ["explicit_marker", "hidden_intent", "mixed", "unknown"] as const,
    DEFAULT_SELECTION_PROFILE_POLICY.signalVisibility,
    "selection_profile_signal_visibility"
  );
  return {
    strictness: readStringEnum(
      record.strictness,
      ["strict", "balanced", "broad"] as const,
      DEFAULT_SELECTION_PROFILE_POLICY.strictness,
      "selection_profile_strictness"
    ),
    unresolvedDecision: readStringEnum(
      record.unresolvedDecision,
      ["hold", "reject"] as const,
      DEFAULT_SELECTION_PROFILE_POLICY.unresolvedDecision,
      "selection_profile_unresolved_decision"
    ),
    llmReviewMode: readStringEnum(
      record.llmReviewMode,
      ["disabled", "optional_high_value_only", "always"] as const,
      DEFAULT_SELECTION_PROFILE_POLICY.llmReviewMode,
      "selection_profile_llm_review_mode"
    ),
    signalVisibility,
    autoSelectMode: readStringEnum(
      record.autoSelectMode,
      ["disabled", "evidence_led", "llm_approved", "evidence_or_llm"] as const,
      readAutoSelectModeDefault(signalVisibility),
      "selection_profile_auto_select_mode"
    ),
    autoSelectMinPositiveGroups: readPositiveInteger(
      record.autoSelectMinPositiveGroups,
      DEFAULT_SELECTION_PROFILE_POLICY.autoSelectMinPositiveGroups,
      "selection_profile_auto_select_min_positive_groups"
    ),
    autoSelectMinCueHits: readPositiveInteger(
      record.autoSelectMinCueHits,
      DEFAULT_SELECTION_PROFILE_POLICY.autoSelectMinCueHits,
      "selection_profile_auto_select_min_cue_hits"
    ),
    autoSelectRequiresNoNoise: readBoolean(
      record.autoSelectRequiresNoNoise,
      DEFAULT_SELECTION_PROFILE_POLICY.autoSelectRequiresNoNoise,
      "selection_profile_auto_select_requires_no_noise"
    ),
    autoSelectRequiresNoTechnicalVeto: readBoolean(
      record.autoSelectRequiresNoTechnicalVeto,
      DEFAULT_SELECTION_PROFILE_POLICY.autoSelectRequiresNoTechnicalVeto,
      "selection_profile_auto_select_requires_no_technical_veto"
    ),
  };
}

export function normalizeTextList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    try {
      const decoded = JSON.parse(value);
      return normalizeTextList(decoded);
    } catch {
      return value
        .split("\n")
        .map((entry) => entry.trim())
        .filter(Boolean);
    }
  }
  return [];
}

export function textListsEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(normalizeTextList(left)) === JSON.stringify(normalizeTextList(right));
}

function normalizeJsonStructure(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeJsonStructure(entry));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, normalizeJsonStructure(nested)])
    );
  }
  return value;
}

export function jsonStructuresEqual(left: unknown, right: unknown): boolean {
  return (
    JSON.stringify(normalizeJsonStructure(left)) ===
    JSON.stringify(normalizeJsonStructure(right))
  );
}

export function resolveCriterionDescription(input: InterestTemplateInput): string {
  const name = input.name.trim();
  if (name) {
    return name;
  }
  const description = input.description.trim();
  return description || "Interest template";
}

export function buildSelectionProfileCompatibilityPayload(
  template: InterestTemplateInput,
  input: {
    interestTemplateId: string;
    criterionId: string | null;
    criterionDescription: string | null;
  }
): {
  name: string;
  description: string;
  profileScope: string;
  profileFamily: string;
  definitionJson: Record<string, unknown>;
  policyJson: Record<string, unknown>;
  facetsJson: unknown[];
  bindingsJson: Record<string, unknown>;
  status: string;
} {
  const profileName = resolveCriterionDescription(template);
  const description = template.description.trim();
  const candidateSignals = {
    positiveGroups: template.candidatePositiveSignals.map((group) => ({
      name: group.name,
      ...(group.tier ? { tier: group.tier } : {}),
      cues: [...group.cues],
    })),
    negativeGroups: template.candidateNegativeSignals.map((group) => ({
      name: group.name,
      ...(group.tier ? { tier: group.tier } : {}),
      cues: [...group.cues],
    })),
  };

  return {
    name: profileName,
    description,
    profileScope: "system",
    profileFamily: "compatibility_interest_template",
    definitionJson: {
      description,
      positiveDefinitions: [...template.positiveTexts],
      negativeDefinitions: [...template.negativeTexts],
      requiredEvidence: {
        mustHaveTerms: [...template.mustHaveTerms],
        shortTokensRequired: [...template.shortTokensRequired],
      },
      forbiddenEvidence: {
        mustNotHaveTerms: [...template.mustNotHaveTerms],
        shortTokensForbidden: [...template.shortTokensForbidden],
      },
      constraints: {
        places: [...template.places],
        languagesAllowed: [...template.languagesAllowed],
        timeWindowHours: template.timeWindowHours,
      },
      compatibility: {
        source: "interest_template",
        sourceInterestTemplateId: input.interestTemplateId,
        sourceCriterionId: input.criterionId,
        sourceCriterionDescription: input.criterionDescription,
      },
      candidateSignals,
    },
    policyJson: {
      strictness: template.selectionProfileStrictness,
      unresolvedDecision: template.selectionProfileUnresolvedDecision,
      llmReviewMode: template.selectionProfileLlmReviewMode,
      autoSelectMode: template.selectionProfileAutoSelectMode,
      signalVisibility: template.selectionProfileSignalVisibility,
      autoSelectMinPositiveGroups:
        template.selectionProfileAutoSelectMinPositiveGroups,
      autoSelectMinCueHits: template.selectionProfileAutoSelectMinCueHits,
      autoSelectRequiresNoNoise:
        template.selectionProfileAutoSelectRequiresNoNoise,
      autoSelectRequiresNoTechnicalVeto:
        template.selectionProfileAutoSelectRequiresNoTechnicalVeto,
      finalSelectionMode: "compatibility_system_selected",
      priority: Number(template.priority ?? 1),
      allowedContentKinds: [...template.allowedContentKinds],
    },
    facetsJson: [],
    bindingsJson: {
      sourceBindingMode: "compatibility_system_template",
      allowedContentKinds: [...template.allowedContentKinds],
      compatibility: {
        sourceInterestTemplateId: input.interestTemplateId,
        sourceCriterionId: input.criterionId,
      },
    },
    status: template.isActive ? "active" : "archived",
  };
}

import { randomUUID } from "node:crypto";

import { RESOURCE_KINDS } from "@signalops/contracts";
import type { Pool, PoolClient } from "pg";

export type LlmTemplateScope = "criteria" | "interests" | "global";
export type LlmTemplatePurpose =
  | "selection_review"
  | "structured_extraction"
  | "classification"
  | "scoring";

export interface LlmTemplateInput {
  promptTemplateId?: string;
  name: string;
  scope: LlmTemplateScope;
  purpose: LlmTemplatePurpose;
  language: string | null;
  templateText: string;
  isActive: boolean;
}

export interface InterestTemplateInput {
  interestTemplateId?: string;
  name: string;
  description: string;
  positiveTexts: string[];
  negativeTexts: string[];
  mustHaveTerms: string[];
  mustNotHaveTerms: string[];
  places: string[];
  languagesAllowed: string[];
  timeWindowHours: number | null;
  allowedContentKinds: string[];
  shortTokensRequired: string[];
  shortTokensForbidden: string[];
  candidatePositiveSignals: CandidateSignalGroup[];
  candidateNegativeSignals: CandidateSignalGroup[];
  selectionProfileStrictness: "strict" | "balanced" | "broad";
  selectionProfileUnresolvedDecision: "hold" | "reject";
  selectionProfileLlmReviewMode: "disabled" | "optional_high_value_only" | "always";
  selectionProfileAutoSelectMode:
    | "disabled"
    | "evidence_led"
    | "llm_approved"
    | "evidence_or_llm";
  selectionProfileSignalVisibility:
    | "explicit_marker"
    | "hidden_intent"
    | "mixed"
    | "unknown";
  selectionProfileAutoSelectMinPositiveGroups: number;
  selectionProfileAutoSelectMinCueHits: number;
  selectionProfileAutoSelectRequiresNoNoise: boolean;
  selectionProfileAutoSelectRequiresNoTechnicalVeto: boolean;
  priority: number;
  isActive: boolean;
}

export interface CandidateSignalGroup {
  name: string;
  tier?: "context" | "buyer_intent" | "project_intent";
  cues: string[];
}

type Queryable = Pick<Pool, "query"> | Pick<PoolClient, "query">;

interface InterestTemplateRow extends InterestTemplateInput {
  interestTemplateId: string;
}

interface CriterionSyncRow {
  criterion_id: string;
  version: number;
  description: string;
  positive_texts: unknown;
  negative_texts: unknown;
  must_have_terms: unknown;
  must_not_have_terms: unknown;
  places: unknown;
  languages_allowed: unknown;
  time_window_hours: number | null;
  short_tokens_required: unknown;
  short_tokens_forbidden: unknown;
  priority: number;
  enabled: boolean;
  compiled: boolean;
  compile_status: string;
}

interface SelectionProfileSyncRow {
  selection_profile_id: string;
  source_criterion_id: string | null;
  name: string;
  description: string;
  profile_scope: string;
  profile_family: string;
  definition_json: unknown;
  policy_json: unknown;
  facets_json: unknown;
  bindings_json: unknown;
  status: string;
  version: number;
}

interface CandidateSignalDefinition {
  positiveGroups: CandidateSignalGroup[];
  negativeGroups: CandidateSignalGroup[];
}

interface SelectionProfilePolicyDefinition {
  strictness: "strict" | "balanced" | "broad";
  unresolvedDecision: "hold" | "reject";
  llmReviewMode: "disabled" | "optional_high_value_only" | "always";
  autoSelectMode: "disabled" | "evidence_led" | "llm_approved" | "evidence_or_llm";
  signalVisibility: "explicit_marker" | "hidden_intent" | "mixed" | "unknown";
  autoSelectMinPositiveGroups: number;
  autoSelectMinCueHits: number;
  autoSelectRequiresNoNoise: boolean;
  autoSelectRequiresNoTechnicalVeto: boolean;
}

export interface InterestTemplateCriterionSyncResult {
  criterionId: string;
  version: number;
  created: boolean;
  compileRequested: boolean;
}

export interface InterestTemplateSelectionProfileSyncResult {
  selectionProfileId: string;
  version: number;
  created: boolean;
}

const DEFAULT_ALLOWED_CONTENT_KINDS = RESOURCE_KINDS.filter((kind) => kind !== "unknown");
const DEFAULT_SELECTION_PROFILE_POLICY: SelectionProfilePolicyDefinition = {
  strictness: "balanced",
  unresolvedDecision: "hold",
  llmReviewMode: "always",
  autoSelectMode: "disabled",
  signalVisibility: "unknown",
  autoSelectMinPositiveGroups: 3,
  autoSelectMinCueHits: 4,
  autoSelectRequiresNoNoise: true,
  autoSelectRequiresNoTechnicalVeto: true,
};

function readOptionalString(value: unknown): string | null {
  if (value == null) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized ? normalized : null;
}

function readRequiredString(value: unknown, fieldName: string): string {
  const normalized = readOptionalString(value);
  if (!normalized) {
    throw new Error(`Template field "${fieldName}" is required.`);
  }
  return normalized;
}

function readBoolean(value: unknown, fallback: boolean, fieldName: string): boolean {
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

function readPositiveNumber(value: unknown, fallback: number, fieldName: string): number {
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

function readPositiveInteger(value: unknown, fallback: number, fieldName: string): number {
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

function readStringEnum<T extends string>(
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

function readNullablePositiveInteger(
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

function nullablePositiveIntegersEqual(left: unknown, right: unknown): boolean {
  const normalize = (value: unknown): number | null => {
    if (value == null || value === "") {
      return null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  };

  return normalize(left) === normalize(right);
}

function readTextList(value: unknown, options: { splitCommas?: boolean } = {}): string[] {
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

function parseCandidateSignalGroups(value: unknown): CandidateSignalGroup[] {
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

function normalizeCandidateSignalGroups(value: unknown): CandidateSignalGroup[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => normalizeCandidateSignalGroup(entry))
    .filter((entry): entry is CandidateSignalGroup => entry !== null);
}

function readCandidateSignalDefinition(
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

function readAutoSelectModeDefault(
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

function readSelectionProfilePolicyDefinition(
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

function normalizeTextList(value: unknown): string[] {
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

function textListsEqual(left: unknown, right: unknown): boolean {
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

function jsonStructuresEqual(left: unknown, right: unknown): boolean {
  return (
    JSON.stringify(normalizeJsonStructure(left)) ===
    JSON.stringify(normalizeJsonStructure(right))
  );
}

function resolveCriterionDescription(input: InterestTemplateInput): string {
  const name = input.name.trim();
  if (name) {
    return name;
  }
  const description = input.description.trim();
  return description || "Interest template";
}

async function readCriterionForProfileSync(
  queryable: Queryable,
  interestTemplateId: string
): Promise<{ criterionId: string | null; criterionDescription: string | null }> {
  const result = await queryable.query<{
    criterion_id: string;
    description: string;
  }>(
    `
      select
        criterion_id::text as criterion_id,
        description
      from criteria
      where source_interest_template_id = $1
      limit 1
    `,
    [interestTemplateId]
  );
  const row = result.rows[0];
  return {
    criterionId: row?.criterion_id ?? null,
    criterionDescription: row?.description ?? null,
  };
}

function buildSelectionProfileCompatibilityPayload(
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

async function readInterestTemplateForSync(
  queryable: Queryable,
  interestTemplateId: string
): Promise<InterestTemplateRow> {
  const result = await queryable.query<{
    interest_template_id: string;
    name: string;
    description: string;
    positive_texts: unknown;
    negative_texts: unknown;
    must_have_terms: unknown;
    must_not_have_terms: unknown;
    places: unknown;
    languages_allowed: unknown;
    time_window_hours: number | null;
    allowed_content_kinds: unknown;
    short_tokens_required: unknown;
    short_tokens_forbidden: unknown;
    priority: number;
    is_active: boolean;
  }>(
    `
      select
        interest_template_id::text as interest_template_id,
        name,
        description,
        positive_texts,
        negative_texts,
        must_have_terms,
        must_not_have_terms,
        places,
        languages_allowed,
        time_window_hours,
        allowed_content_kinds,
        short_tokens_required,
        short_tokens_forbidden,
        priority,
        is_active
      from interest_templates
      where interest_template_id = $1
    `,
    [interestTemplateId]
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error(`Interest template ${interestTemplateId} was not found.`);
  }
  return {
    interestTemplateId: row.interest_template_id,
    name: row.name,
    description: row.description,
    positiveTexts: normalizeTextList(row.positive_texts),
    negativeTexts: normalizeTextList(row.negative_texts),
    mustHaveTerms: normalizeTextList(row.must_have_terms),
    mustNotHaveTerms: normalizeTextList(row.must_not_have_terms),
    places: normalizeTextList(row.places),
    languagesAllowed: normalizeTextList(row.languages_allowed),
    timeWindowHours:
      row.time_window_hours == null ? null : Number(row.time_window_hours),
    allowedContentKinds: normalizeTextList(row.allowed_content_kinds),
    shortTokensRequired: normalizeTextList(row.short_tokens_required),
    shortTokensForbidden: normalizeTextList(row.short_tokens_forbidden),
    candidatePositiveSignals: [],
    candidateNegativeSignals: [],
    selectionProfileStrictness: DEFAULT_SELECTION_PROFILE_POLICY.strictness,
    selectionProfileUnresolvedDecision:
      DEFAULT_SELECTION_PROFILE_POLICY.unresolvedDecision,
    selectionProfileLlmReviewMode: DEFAULT_SELECTION_PROFILE_POLICY.llmReviewMode,
    selectionProfileAutoSelectMode: DEFAULT_SELECTION_PROFILE_POLICY.autoSelectMode,
    selectionProfileSignalVisibility: DEFAULT_SELECTION_PROFILE_POLICY.signalVisibility,
    selectionProfileAutoSelectMinPositiveGroups:
      DEFAULT_SELECTION_PROFILE_POLICY.autoSelectMinPositiveGroups,
    selectionProfileAutoSelectMinCueHits:
      DEFAULT_SELECTION_PROFILE_POLICY.autoSelectMinCueHits,
    selectionProfileAutoSelectRequiresNoNoise:
      DEFAULT_SELECTION_PROFILE_POLICY.autoSelectRequiresNoNoise,
    selectionProfileAutoSelectRequiresNoTechnicalVeto:
      DEFAULT_SELECTION_PROFILE_POLICY.autoSelectRequiresNoTechnicalVeto,
    priority: Number(row.priority ?? 1),
    isActive: row.is_active === true,
  };
}

export async function syncInterestTemplateCriterion(
  queryable: Queryable,
  interestTemplateId: string
): Promise<InterestTemplateCriterionSyncResult> {
  const template = await readInterestTemplateForSync(queryable, interestTemplateId);
  const existingResult = await queryable.query<CriterionSyncRow>(
    `
      select
        criterion_id::text as criterion_id,
        version,
        description,
        positive_texts,
        negative_texts,
        must_have_terms,
        must_not_have_terms,
        places,
        languages_allowed,
        time_window_hours,
        short_tokens_required,
        short_tokens_forbidden,
        priority,
        enabled,
        compiled,
        compile_status
      from criteria
      where source_interest_template_id = $1
      limit 1
    `,
    [interestTemplateId]
  );
  const existing = existingResult.rows[0];
  const description = resolveCriterionDescription(template);

  if (!existing) {
    const insertResult = await queryable.query<{
      criterion_id: string;
      version: number;
    }>(
      `
        insert into criteria (
          criterion_id,
          source_interest_template_id,
          description,
          positive_texts,
          negative_texts,
          must_have_terms,
          must_not_have_terms,
          places,
          languages_allowed,
          time_window_hours,
          short_tokens_required,
          short_tokens_forbidden,
          priority,
          enabled,
          compiled,
          compile_status,
          version
        )
        values (
          gen_random_uuid(),
          $1,
          $2,
          $3::jsonb,
          $4::jsonb,
          $5::jsonb,
          $6::jsonb,
          $7::jsonb,
          $8::jsonb,
          $9,
          $10::jsonb,
          $11::jsonb,
          $12,
          $13,
          false,
          $14,
          1
        )
        returning criterion_id::text as criterion_id, version
      `,
      [
        interestTemplateId,
        description,
        JSON.stringify(template.positiveTexts),
        JSON.stringify(template.negativeTexts),
        JSON.stringify(template.mustHaveTerms),
        JSON.stringify(template.mustNotHaveTerms),
        JSON.stringify(template.places),
        JSON.stringify(template.languagesAllowed),
        template.timeWindowHours,
        JSON.stringify(template.shortTokensRequired),
        JSON.stringify(template.shortTokensForbidden),
        template.priority,
        template.isActive,
        template.isActive ? "queued" : "pending",
      ]
    );
    const created = insertResult.rows[0];
    return {
      criterionId: created.criterion_id,
      version: created.version,
      created: true,
      compileRequested: template.isActive,
    };
  }

  const dataChanged =
    existing.description !== description ||
    !textListsEqual(existing.positive_texts, template.positiveTexts) ||
    !textListsEqual(existing.negative_texts, template.negativeTexts) ||
    !textListsEqual(existing.must_have_terms, template.mustHaveTerms) ||
    !textListsEqual(existing.must_not_have_terms, template.mustNotHaveTerms) ||
    !textListsEqual(existing.places, template.places) ||
    !textListsEqual(existing.languages_allowed, template.languagesAllowed) ||
    !nullablePositiveIntegersEqual(existing.time_window_hours, template.timeWindowHours) ||
    !textListsEqual(existing.short_tokens_required, template.shortTokensRequired) ||
    !textListsEqual(existing.short_tokens_forbidden, template.shortTokensForbidden) ||
    Number(existing.priority ?? 1) !== Number(template.priority ?? 1);

  const nextVersion = dataChanged ? Number(existing.version ?? 1) + 1 : Number(existing.version ?? 1);
  const compileRequested =
    template.isActive &&
    (
      dataChanged ||
      existing.compile_status === "failed" ||
      (existing.compiled !== true &&
        existing.compile_status !== "queued" &&
        existing.compile_status !== "compiled")
    );
  const nextCompiled =
    !template.isActive && dataChanged
      ? false
      : compileRequested
        ? false
        : existing.compiled === true;
  const nextCompileStatus =
    !template.isActive && dataChanged
      ? "pending"
      : compileRequested
        ? "queued"
        : existing.compile_status;

  await queryable.query(
    `
      update criteria
      set
        description = $2,
        positive_texts = $3::jsonb,
        negative_texts = $4::jsonb,
        must_have_terms = $5::jsonb,
        must_not_have_terms = $6::jsonb,
        places = $7::jsonb,
        languages_allowed = $8::jsonb,
        time_window_hours = $9,
        short_tokens_required = $10::jsonb,
        short_tokens_forbidden = $11::jsonb,
        priority = $12,
        enabled = $13,
        compiled = $14,
        compile_status = $15,
        version = $16,
        updated_at = now()
      where criterion_id = $1
    `,
    [
      existing.criterion_id,
      description,
      JSON.stringify(template.positiveTexts),
      JSON.stringify(template.negativeTexts),
      JSON.stringify(template.mustHaveTerms),
      JSON.stringify(template.mustNotHaveTerms),
      JSON.stringify(template.places),
      JSON.stringify(template.languagesAllowed),
      template.timeWindowHours,
      JSON.stringify(template.shortTokensRequired),
      JSON.stringify(template.shortTokensForbidden),
      template.priority,
      template.isActive,
      nextCompiled,
      nextCompileStatus,
      nextVersion,
    ]
  );

  return {
    criterionId: existing.criterion_id,
    version: nextVersion,
    created: false,
    compileRequested,
  };
}

export async function syncInterestTemplateSelectionProfile(
  queryable: Queryable,
  interestTemplateId: string,
  templateOverride?: InterestTemplateInput
): Promise<InterestTemplateSelectionProfileSyncResult> {
  const template = await readInterestTemplateForSync(queryable, interestTemplateId);
  const existingResult = await queryable.query<SelectionProfileSyncRow>(
    `
      select
        selection_profile_id::text as selection_profile_id,
        source_criterion_id::text as source_criterion_id,
        name,
        description,
        profile_scope,
        profile_family,
        definition_json,
        policy_json,
        facets_json,
        bindings_json,
        status,
        version
      from selection_profiles
      where source_interest_template_id = $1
      limit 1
    `,
    [interestTemplateId]
  );
  const existing = existingResult.rows[0];
  const candidateSignalsFromExisting = readCandidateSignalDefinition(existing?.definition_json);
  const existingPolicy = readSelectionProfilePolicyDefinition(existing?.policy_json);
  const nextTemplate: InterestTemplateInput = {
    ...template,
    candidatePositiveSignals:
      templateOverride?.candidatePositiveSignals ?? candidateSignalsFromExisting.positiveGroups,
    candidateNegativeSignals:
      templateOverride?.candidateNegativeSignals ?? candidateSignalsFromExisting.negativeGroups,
    selectionProfileStrictness:
      templateOverride?.selectionProfileStrictness ?? existingPolicy.strictness,
    selectionProfileUnresolvedDecision:
      templateOverride?.selectionProfileUnresolvedDecision ??
      existingPolicy.unresolvedDecision,
    selectionProfileLlmReviewMode:
      templateOverride?.selectionProfileLlmReviewMode ?? existingPolicy.llmReviewMode,
    selectionProfileAutoSelectMode:
      templateOverride?.selectionProfileAutoSelectMode ?? existingPolicy.autoSelectMode,
    selectionProfileSignalVisibility:
      templateOverride?.selectionProfileSignalVisibility ?? existingPolicy.signalVisibility,
    selectionProfileAutoSelectMinPositiveGroups:
      templateOverride?.selectionProfileAutoSelectMinPositiveGroups ??
      existingPolicy.autoSelectMinPositiveGroups,
    selectionProfileAutoSelectMinCueHits:
      templateOverride?.selectionProfileAutoSelectMinCueHits ??
      existingPolicy.autoSelectMinCueHits,
    selectionProfileAutoSelectRequiresNoNoise:
      templateOverride?.selectionProfileAutoSelectRequiresNoNoise ??
      existingPolicy.autoSelectRequiresNoNoise,
    selectionProfileAutoSelectRequiresNoTechnicalVeto:
      templateOverride?.selectionProfileAutoSelectRequiresNoTechnicalVeto ??
      existingPolicy.autoSelectRequiresNoTechnicalVeto,
  };
  const criterion = await readCriterionForProfileSync(queryable, interestTemplateId);
  const nextProfile = buildSelectionProfileCompatibilityPayload(nextTemplate, {
    interestTemplateId,
    criterionId: criterion.criterionId,
    criterionDescription: criterion.criterionDescription,
  });

  if (!existing) {
    const insertResult = await queryable.query<{
      selection_profile_id: string;
      version: number;
    }>(
      `
        insert into selection_profiles (
          selection_profile_id,
          source_interest_template_id,
          source_criterion_id,
          name,
          description,
          profile_scope,
          profile_family,
          definition_json,
          policy_json,
          facets_json,
          bindings_json,
          status,
          version
        )
        values (
          gen_random_uuid(),
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7::jsonb,
          $8::jsonb,
          $9::jsonb,
          $10::jsonb,
          $11,
          1
        )
        returning selection_profile_id::text as selection_profile_id, version
      `,
      [
        interestTemplateId,
        criterion.criterionId,
        nextProfile.name,
        nextProfile.description,
        nextProfile.profileScope,
        nextProfile.profileFamily,
        JSON.stringify(nextProfile.definitionJson),
        JSON.stringify(nextProfile.policyJson),
        JSON.stringify(nextProfile.facetsJson),
        JSON.stringify(nextProfile.bindingsJson),
        nextProfile.status,
      ]
    );
    const created = insertResult.rows[0];
    return {
      selectionProfileId: created.selection_profile_id,
      version: created.version,
      created: true,
    };
  }

  const dataChanged =
    existing.source_criterion_id !== criterion.criterionId ||
    existing.name !== nextProfile.name ||
    existing.description !== nextProfile.description ||
    existing.profile_scope !== nextProfile.profileScope ||
    existing.profile_family !== nextProfile.profileFamily ||
    !jsonStructuresEqual(existing.definition_json, nextProfile.definitionJson) ||
    !jsonStructuresEqual(existing.policy_json, nextProfile.policyJson) ||
    !jsonStructuresEqual(existing.facets_json, nextProfile.facetsJson) ||
    !jsonStructuresEqual(existing.bindings_json, nextProfile.bindingsJson) ||
    existing.status !== nextProfile.status;

  const nextVersion = dataChanged
    ? Number(existing.version ?? 1) + 1
    : Number(existing.version ?? 1);

  await queryable.query(
    `
      update selection_profiles
      set
        source_criterion_id = $2,
        name = $3,
        description = $4,
        profile_scope = $5,
        profile_family = $6,
        definition_json = $7::jsonb,
        policy_json = $8::jsonb,
        facets_json = $9::jsonb,
        bindings_json = $10::jsonb,
        status = $11,
        version = $12,
        updated_at = now()
      where selection_profile_id = $1
    `,
    [
      existing.selection_profile_id,
      criterion.criterionId,
      nextProfile.name,
      nextProfile.description,
      nextProfile.profileScope,
      nextProfile.profileFamily,
      JSON.stringify(nextProfile.definitionJson),
      JSON.stringify(nextProfile.policyJson),
      JSON.stringify(nextProfile.facetsJson),
      JSON.stringify(nextProfile.bindingsJson),
      nextProfile.status,
      nextVersion,
    ]
  );

  return {
    selectionProfileId: existing.selection_profile_id,
    version: nextVersion,
    created: false,
  };
}

export function parseLlmTemplateInput(payload: Record<string, unknown>): LlmTemplateInput {
  const scope = readOptionalString(payload.scope) ?? "interests";
  if (!["criteria", "interests", "global"].includes(scope)) {
    throw new Error(`Unsupported LLM template scope "${scope}".`);
  }

  return {
    promptTemplateId: readOptionalString(payload.promptTemplateId) ?? undefined,
    name: readRequiredString(payload.name, "name"),
    scope: scope as LlmTemplateScope,
    purpose: readStringEnum(
      payload.purpose,
      ["selection_review", "structured_extraction", "classification", "scoring"] as const,
      "selection_review",
      "purpose"
    ),
    language: readOptionalString(payload.language),
    templateText: readRequiredString(payload.templateText, "templateText"),
    isActive: readBoolean(payload.isActive, true, "isActive"),
  };
}

export function parseInterestTemplateInput(
  payload: Record<string, unknown>
): InterestTemplateInput {
  const name = readRequiredString(payload.name, "name");
  const positiveTexts = readTextList(payload.positive_texts);
  if (positiveTexts.length === 0) {
    throw new Error('Template field "positive_texts" must contain at least one line.');
  }

  const shortTokensRequired = readTextList(payload.short_tokens_required, { splitCommas: true });
  validateShortTokensRequired(shortTokensRequired);
  const selectionProfileSignalVisibility = readStringEnum(
    payload.selection_profile_signal_visibility,
    ["explicit_marker", "hidden_intent", "mixed", "unknown"] as const,
    DEFAULT_SELECTION_PROFILE_POLICY.signalVisibility,
    "selection_profile_signal_visibility"
  );

  return {
    interestTemplateId: readOptionalString(payload.interestTemplateId) ?? undefined,
    name,
    description: String(payload.description ?? "").trim(),
    positiveTexts,
    negativeTexts: readTextList(payload.negative_texts),
    mustHaveTerms: readTextList(payload.must_have_terms, { splitCommas: true }),
    mustNotHaveTerms: readTextList(payload.must_not_have_terms, { splitCommas: true }),
    places: readTextList(payload.places, { splitCommas: true }),
    languagesAllowed: readTextList(payload.languages_allowed, { splitCommas: true }),
    timeWindowHours: readNullablePositiveInteger(payload.time_window_hours, "time_window_hours"),
    allowedContentKinds: readTextList(payload.allowed_content_kinds, { splitCommas: true }).length
      ? readTextList(payload.allowed_content_kinds, { splitCommas: true })
      : [...DEFAULT_ALLOWED_CONTENT_KINDS],
    shortTokensRequired,
    shortTokensForbidden: readTextList(payload.short_tokens_forbidden, { splitCommas: true }),
    candidatePositiveSignals: [
      ...parseCandidateSignalGroups(payload.candidate_positive_signals),
      ...normalizeCandidateSignalGroups(payload.candidate_positive_signal_groups),
    ],
    candidateNegativeSignals: [
      ...parseCandidateSignalGroups(payload.candidate_negative_signals),
      ...normalizeCandidateSignalGroups(payload.candidate_negative_signal_groups),
    ],
    selectionProfileStrictness: readStringEnum(
      payload.selection_profile_strictness,
      ["strict", "balanced", "broad"] as const,
      DEFAULT_SELECTION_PROFILE_POLICY.strictness,
      "selection_profile_strictness"
    ),
    selectionProfileUnresolvedDecision: readStringEnum(
      payload.selection_profile_unresolved_decision,
      ["hold", "reject"] as const,
      DEFAULT_SELECTION_PROFILE_POLICY.unresolvedDecision,
      "selection_profile_unresolved_decision"
    ),
    selectionProfileLlmReviewMode: readStringEnum(
      payload.selection_profile_llm_review_mode,
      ["disabled", "optional_high_value_only", "always"] as const,
      DEFAULT_SELECTION_PROFILE_POLICY.llmReviewMode,
      "selection_profile_llm_review_mode"
    ),
    selectionProfileSignalVisibility,
    selectionProfileAutoSelectMode: readStringEnum(
      payload.selection_profile_auto_select_mode,
      ["disabled", "evidence_led", "llm_approved", "evidence_or_llm"] as const,
      readAutoSelectModeDefault(selectionProfileSignalVisibility),
      "selection_profile_auto_select_mode"
    ),
    selectionProfileAutoSelectMinPositiveGroups: readPositiveInteger(
      payload.selection_profile_auto_select_min_positive_groups,
      DEFAULT_SELECTION_PROFILE_POLICY.autoSelectMinPositiveGroups,
      "selection_profile_auto_select_min_positive_groups"
    ),
    selectionProfileAutoSelectMinCueHits: readPositiveInteger(
      payload.selection_profile_auto_select_min_cue_hits,
      DEFAULT_SELECTION_PROFILE_POLICY.autoSelectMinCueHits,
      "selection_profile_auto_select_min_cue_hits"
    ),
    selectionProfileAutoSelectRequiresNoNoise: readBoolean(
      payload.selection_profile_auto_select_requires_no_noise,
      DEFAULT_SELECTION_PROFILE_POLICY.autoSelectRequiresNoNoise,
      "selection_profile_auto_select_requires_no_noise"
    ),
    selectionProfileAutoSelectRequiresNoTechnicalVeto: readBoolean(
      payload.selection_profile_auto_select_requires_no_technical_veto,
      DEFAULT_SELECTION_PROFILE_POLICY.autoSelectRequiresNoTechnicalVeto,
      "selection_profile_auto_select_requires_no_technical_veto"
    ),
    priority: readPositiveNumber(payload.priority, 1.0, "priority"),
    isActive: readBoolean(payload.isActive, true, "isActive"),
  };
}

export function validateShortTokensRequired(
  values: readonly string[],
  pathPrefix = "short_tokens_required"
): void {
  const invalidIndex = values.findIndex((value) => /\s/u.test(value.trim()));
  if (invalidIndex >= 0) {
    throw new Error(
      `${pathPrefix}[${invalidIndex}] must be a single extracted short token with no internal whitespace; phrase gates belong in must_have_terms only when truly mandatory.`
    );
  }
}

export async function saveLlmTemplate(
  pool: Queryable,
  input: LlmTemplateInput
): Promise<{ promptTemplateId: string; created: boolean }> {
  if (input.promptTemplateId) {
    const updated = await pool.query(
      `
        update llm_prompt_templates
        set
          name = $2,
          scope = $3,
          purpose = $4,
          language = $5,
          template_text = $6,
          is_active = $7,
          version = case
            when template_text is distinct from $6
              or scope is distinct from $3
              or purpose is distinct from $4
              or language is distinct from $5
            then version + 1
            else version
          end,
          updated_at = now()
        where prompt_template_id = $1
      `,
      [
        input.promptTemplateId,
        input.name,
        input.scope,
        input.purpose,
        input.language,
        input.templateText,
        input.isActive,
      ]
    );
    if (updated.rowCount !== 1) {
      throw new Error(`LLM template ${input.promptTemplateId} was not found.`);
    }

    return {
      promptTemplateId: input.promptTemplateId,
      created: false,
    };
  }

  const promptTemplateId = randomUUID();
  await pool.query(
    `
      insert into llm_prompt_templates (
        prompt_template_id,
        name,
        scope,
        purpose,
        language,
        template_text,
        is_active,
        version
      )
      values ($1, $2, $3, $4, $5, $6, $7, 1)
    `,
    [
      promptTemplateId,
      input.name,
      input.scope,
      input.purpose,
      input.language,
      input.templateText,
      input.isActive,
    ]
  );

  return {
    promptTemplateId,
    created: true,
  };
}

export async function setLlmTemplateActiveState(
  pool: Queryable,
  promptTemplateId: string,
  isActive: boolean
): Promise<void> {
  const updated = await pool.query(
    `
      update llm_prompt_templates
      set
        is_active = $2,
        updated_at = now()
      where prompt_template_id = $1
    `,
    [promptTemplateId, isActive]
  );
  if (updated.rowCount !== 1) {
    throw new Error(`LLM template ${promptTemplateId} was not found.`);
  }
}

export async function deleteLlmTemplate(
  pool: Queryable,
  promptTemplateId: string
): Promise<void> {
  const deleted = await pool.query(
    `
      delete from llm_prompt_templates
      where prompt_template_id = $1
    `,
    [promptTemplateId]
  );
  if (deleted.rowCount !== 1) {
    throw new Error(`LLM template ${promptTemplateId} was not found.`);
  }
}

export async function saveInterestTemplate(
  pool: Queryable,
  input: InterestTemplateInput
): Promise<{ interestTemplateId: string; created: boolean }> {
  const params = [
    input.name,
    input.description,
    JSON.stringify(input.positiveTexts),
    JSON.stringify(input.negativeTexts),
    JSON.stringify(input.mustHaveTerms),
    JSON.stringify(input.mustNotHaveTerms),
    JSON.stringify(input.places),
    JSON.stringify(input.languagesAllowed),
    input.timeWindowHours,
    JSON.stringify(input.allowedContentKinds),
    JSON.stringify(input.shortTokensRequired),
    JSON.stringify(input.shortTokensForbidden),
    input.priority,
    input.isActive,
  ];

  if (input.interestTemplateId) {
    const updated = await pool.query(
      `
        update interest_templates
        set
          name = $2,
          description = $3,
          positive_texts = $4::jsonb,
          negative_texts = $5::jsonb,
          must_have_terms = $6::jsonb,
          must_not_have_terms = $7::jsonb,
          places = $8::jsonb,
          languages_allowed = $9::jsonb,
          time_window_hours = $10,
          allowed_content_kinds = $11::jsonb,
          short_tokens_required = $12::jsonb,
          short_tokens_forbidden = $13::jsonb,
          priority = $14,
          is_active = $15,
          updated_at = now()
        where interest_template_id = $1
      `,
      [input.interestTemplateId, ...params]
    );
    if (updated.rowCount !== 1) {
      throw new Error(`Interest template ${input.interestTemplateId} was not found.`);
    }

    return {
      interestTemplateId: input.interestTemplateId,
      created: false,
    };
  }

  const interestTemplateId = randomUUID();
  await pool.query(
    `
      insert into interest_templates (
        interest_template_id,
        name,
        description,
        positive_texts,
        negative_texts,
        must_have_terms,
        must_not_have_terms,
        places,
        languages_allowed,
        time_window_hours,
        allowed_content_kinds,
        short_tokens_required,
        short_tokens_forbidden,
        priority,
        is_active
      )
      values (
        $1,
        $2,
        $3,
        $4::jsonb,
        $5::jsonb,
        $6::jsonb,
        $7::jsonb,
        $8::jsonb,
        $9::jsonb,
        $10,
        $11::jsonb,
        $12::jsonb,
        $13::jsonb,
        $14,
        $15
      )
    `,
    [interestTemplateId, ...params]
  );

  return {
    interestTemplateId,
    created: true,
  };
}

export async function setInterestTemplateActiveState(
  pool: Queryable,
  interestTemplateId: string,
  isActive: boolean
): Promise<void> {
  const updated = await pool.query(
    `
      update interest_templates
      set
        is_active = $2,
        updated_at = now()
      where interest_template_id = $1
    `,
    [interestTemplateId, isActive]
  );
  if (updated.rowCount !== 1) {
    throw new Error(`Interest template ${interestTemplateId} was not found.`);
  }
}

export async function deleteInterestTemplate(
  pool: Queryable,
  interestTemplateId: string
): Promise<void> {
  const deleted = await pool.query(
    `
      delete from interest_templates
      where interest_template_id = $1
    `,
    [interestTemplateId]
  );
  if (deleted.rowCount !== 1) {
    throw new Error(`Interest template ${interestTemplateId} was not found.`);
  }
}

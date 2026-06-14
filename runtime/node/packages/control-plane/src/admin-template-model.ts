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

export type Queryable = Pick<Pool, "query"> | Pick<PoolClient, "query">;

export interface InterestTemplateRow extends InterestTemplateInput {
  interestTemplateId: string;
}

export interface CriterionSyncRow {
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

export interface SelectionProfileSyncRow {
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

export interface CandidateSignalDefinition {
  positiveGroups: CandidateSignalGroup[];
  negativeGroups: CandidateSignalGroup[];
}

export interface SelectionProfilePolicyDefinition {
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

export const DEFAULT_ALLOWED_CONTENT_KINDS = RESOURCE_KINDS.filter((kind) => kind !== "unknown");
export const DEFAULT_SELECTION_PROFILE_POLICY: SelectionProfilePolicyDefinition = {
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

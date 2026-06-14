import type { InterestTemplateInput, LlmTemplateInput, LlmTemplateScope } from "./admin-template-model";
import { DEFAULT_ALLOWED_CONTENT_KINDS, DEFAULT_SELECTION_PROFILE_POLICY } from "./admin-template-model";
import {
  normalizeCandidateSignalGroups,
  parseCandidateSignalGroups,
  readAutoSelectModeDefault,
  readBoolean,
  readNullablePositiveInteger,
  readOptionalString,
  readPositiveInteger,
  readPositiveNumber,
  readRequiredString,
  readStringEnum,
  readTextList,
} from "./admin-template-codecs";

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

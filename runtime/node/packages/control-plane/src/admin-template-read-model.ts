import type { InterestTemplateRow, Queryable } from "./admin-template-model";
import { DEFAULT_SELECTION_PROFILE_POLICY } from "./admin-template-model";
import { normalizeTextList } from "./admin-template-codecs";

export async function readCriterionForProfileSync(
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

export async function readInterestTemplateForSync(
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

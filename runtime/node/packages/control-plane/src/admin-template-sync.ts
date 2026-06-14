import type {
  CriterionSyncRow,
  InterestTemplateCriterionSyncResult,
  InterestTemplateInput,
  InterestTemplateSelectionProfileSyncResult,
  Queryable,
  SelectionProfileSyncRow,
} from "./admin-template-model";
import {
  buildSelectionProfileCompatibilityPayload,
  jsonStructuresEqual,
  nullablePositiveIntegersEqual,
  readCandidateSignalDefinition,
  readSelectionProfilePolicyDefinition,
  resolveCriterionDescription,
  textListsEqual,
} from "./admin-template-codecs";
import {
  readCriterionForProfileSync,
  readInterestTemplateForSync,
} from "./admin-template-read-model";

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

import { randomUUID } from "node:crypto";

import type { InterestTemplateInput, Queryable } from "./admin-template-model";

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

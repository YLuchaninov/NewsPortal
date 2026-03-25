import { randomUUID } from "node:crypto";

import type { Pool } from "pg";

export type LlmTemplateScope = "criteria" | "interests" | "global";

export interface LlmTemplateInput {
  promptTemplateId?: string;
  name: string;
  scope: LlmTemplateScope;
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
  shortTokensRequired: string[];
  shortTokensForbidden: string[];
  priority: number;
  isActive: boolean;
}

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
    typeof value === "number" ? value : Number.parseFloat(String(value).trim());
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Template field "${fieldName}" must be a positive number.`);
  }

  return parsed;
}

function readTextList(value: unknown): string[] {
  const normalized = String(value ?? "");
  return normalized
    .split("\n")
    .map((entry) => entry.trim())
    .filter(Boolean);
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

  return {
    interestTemplateId: readOptionalString(payload.interestTemplateId) ?? undefined,
    name,
    description: String(payload.description ?? "").trim(),
    positiveTexts,
    negativeTexts: readTextList(payload.negative_texts),
    mustHaveTerms: readTextList(payload.must_have_terms),
    mustNotHaveTerms: readTextList(payload.must_not_have_terms),
    places: readTextList(payload.places),
    languagesAllowed: readTextList(payload.languages_allowed),
    shortTokensRequired: readTextList(payload.short_tokens_required),
    shortTokensForbidden: readTextList(payload.short_tokens_forbidden),
    priority: readPositiveNumber(payload.priority, 1.0, "priority"),
    isActive: readBoolean(payload.isActive, true, "isActive"),
  };
}

export async function saveLlmTemplate(
  pool: Pool,
  input: LlmTemplateInput
): Promise<{ promptTemplateId: string; created: boolean }> {
  if (input.promptTemplateId) {
    const updated = await pool.query(
      `
        update llm_prompt_templates
        set
          name = $2,
          scope = $3,
          language = $4,
          template_text = $5,
          is_active = $6,
          version = case
            when template_text is distinct from $5
              or scope is distinct from $3
              or language is distinct from $4
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
        language,
        template_text,
        is_active,
        version
      )
      values ($1, $2, $3, $4, $5, $6, 1)
    `,
    [
      promptTemplateId,
      input.name,
      input.scope,
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
  pool: Pool,
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
  pool: Pool,
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
  pool: Pool,
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
          short_tokens_required = $10::jsonb,
          short_tokens_forbidden = $11::jsonb,
          priority = $12,
          is_active = $13,
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
        $10::jsonb,
        $11::jsonb,
        $12,
        $13
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
  pool: Pool,
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
  pool: Pool,
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

import { randomUUID } from "node:crypto";

import type { LlmTemplateInput, Queryable } from "./admin-template-model";

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

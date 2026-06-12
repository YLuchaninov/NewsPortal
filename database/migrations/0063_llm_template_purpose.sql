alter table llm_prompt_templates
  add column if not exists purpose text not null default 'selection_review';

alter table llm_prompt_templates
  drop constraint if exists llm_prompt_templates_purpose_check;

alter table llm_prompt_templates
  add constraint llm_prompt_templates_purpose_check
  check (purpose in ('selection_review', 'structured_extraction', 'classification', 'scoring'));

create index if not exists llm_prompt_templates_scope_purpose_active_idx
  on llm_prompt_templates (scope, purpose, is_active, updated_at desc);

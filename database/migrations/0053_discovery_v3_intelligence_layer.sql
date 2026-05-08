-- Discovery v3 intelligence layer is additive because 0052 is already applied
-- in local/runtime environments. Do not back-edit 0052 after cutover.

create table if not exists discovery_llm_task_templates (
  template_id uuid primary key default gen_random_uuid(),

  task_name text not null,
  version integer not null default 1,
  status text not null default 'active',

  system_prompt text not null,
  user_prompt_template text not null default '',
  schema_json jsonb not null default '{}'::jsonb,
  model_policy_json jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint discovery_llm_task_templates_status_check
    check (status in ('active', 'archived'))
);

create unique index if not exists discovery_llm_task_templates_version_idx
  on discovery_llm_task_templates (task_name, version);

create unique index if not exists discovery_llm_task_templates_active_idx
  on discovery_llm_task_templates (task_name)
  where status = 'active';

create table if not exists discovery_llm_decisions (
  decision_id uuid primary key default gen_random_uuid(),

  target_id uuid references discovery_targets(target_id) on delete set null,
  run_id uuid references discovery_runs(run_id) on delete set null,
  hypothesis_id uuid references discovery_hypotheses(hypothesis_id) on delete set null,
  endpoint_id uuid references discovery_source_endpoints(endpoint_id) on delete set null,
  claim_id uuid references discovery_claims(claim_id) on delete set null,

  task_name text not null,
  input_hash text not null,

  input_json jsonb not null default '{}'::jsonb,
  output_json jsonb not null default '{}'::jsonb,
  fallback_output_json jsonb not null default '{}'::jsonb,

  status text not null,
  schema_name text,
  schema_version text,

  prompt_template_id uuid references discovery_llm_task_templates(template_id) on delete set null,
  prompt_version integer,
  llm_model text,

  repair_attempted boolean not null default false,
  fallback_used boolean not null default false,

  error_text text,
  cost_json jsonb not null default '{}'::jsonb,
  meta_json jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),

  constraint discovery_llm_decisions_status_check
    check (status in ('cached', 'valid', 'invalid', 'fallback', 'failed'))
);

create unique index if not exists discovery_llm_decisions_cache_idx
  on discovery_llm_decisions (task_name, input_hash);

create index if not exists discovery_llm_decisions_target_idx
  on discovery_llm_decisions (target_id, created_at desc)
  where target_id is not null;

create index if not exists discovery_llm_decisions_run_idx
  on discovery_llm_decisions (run_id, created_at desc)
  where run_id is not null;

insert into discovery_llm_task_templates (
  task_name, version, status, system_prompt, user_prompt_template, schema_json, model_policy_json
)
values
  (
    'discovery.graph.compile',
    1,
    'active',
    'You are a discovery graph compiler. Expand target interests into entities, aliases, direct and hidden signal phrases, localized terms, negative patterns, provider hints and explicit assumptions. Do not invent verified sources. Return JSON only.',
    '{{input_json}}',
    '{}'::jsonb,
    '{"temperature":0.1,"fallbackRequired":true}'::jsonb
  ),
  (
    'discovery.strategy.plan',
    1,
    'active',
    'You are a resilient discovery strategy planner. Produce bounded, provider-aware strategy suggestions from coverage gaps and existing sources. LLM output is only a proposal. Return JSON only.',
    '{{input_json}}',
    '{}'::jsonb,
    '{"temperature":0.2,"fallbackRequired":true}'::jsonb
  ),
  (
    'discovery.hypotheses.generate',
    1,
    'active',
    'You are Explorer. Generate high-recall discovery hypotheses across direct and hidden signal modes while respecting provider capabilities and coverage gaps. Do not recommend promotion. Return JSON only.',
    '{{input_json}}',
    '{}'::jsonb,
    '{"temperature":0.3,"fallbackRequired":true}'::jsonb
  ),
  (
    'discovery.constructive_skeptic.review',
    1,
    'active',
    'You are Constructive Skeptic. Improve Explorer hypotheses by producing critiques, repair patches, bounded missing-angle ideas, negative controls, provider warnings and direct-vs-hidden corrections. Do not create an unlimited alternate plan. Return JSON only.',
    '{{input_json}}',
    '{}'::jsonb,
    '{"temperature":0.1,"fallbackRequired":true}'::jsonb
  ),
  (
    'discovery.verification_skeptic.review',
    1,
    'active',
    'You are Verification Skeptic. Review a repaired hypothesis pack after one bounded critique/repair cycle. Confirm whether blocking risks remain and escalate repeated disagreement to manual review or reject. Return JSON only.',
    '{{input_json}}',
    '{}'::jsonb,
    '{"temperature":0.0,"fallbackRequired":true}'::jsonb
  ),
  (
    'discovery.endpoint.review',
    1,
    'active',
    'You review endpoint evidence for operator explanation only. Identify why found, why not promoted, missing evidence, and next best action. Deterministic scores remain final. Return JSON only.',
    '{{input_json}}',
    '{}'::jsonb,
    '{"temperature":0.0,"fallbackRequired":true}'::jsonb
  ),
  (
    'discovery.hidden_signal.mine',
    1,
    'active',
    'You are a hidden signal miner. Cluster social/forum/community evidence into claims with support, contradiction, control-comparison needs, spam/campaign risk and direct-source follow-ups. Return JSON only.',
    '{{input_json}}',
    '{}'::jsonb,
    '{"temperature":0.1,"fallbackRequired":true}'::jsonb
  ),
  (
    'discovery.run.diagnose',
    1,
    'active',
    'You diagnose discovery run failures using observed metrics only. Recommend allowed repair recipes and do not invent provider failures. Return JSON only.',
    '{{input_json}}',
    '{}'::jsonb,
    '{"temperature":0.0,"fallbackRequired":true}'::jsonb
  ),
  (
    'discovery.config.simplify',
    1,
    'active',
    'You simplify operator discovery configuration into a target draft, autopilot profile and policy hints. Respect provider safety defaults and return JSON only.',
    '{{input_json}}',
    '{}'::jsonb,
    '{"temperature":0.1,"fallbackRequired":true}'::jsonb
  )
on conflict (task_name, version) do nothing;

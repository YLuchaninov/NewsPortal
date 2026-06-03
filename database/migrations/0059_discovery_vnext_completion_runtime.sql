-- Discovery vNext completion runtime.
-- Adds durable audit/step state for policy-governed live-capable runs without
-- changing shared source/channel/fetcher/content boundaries.

create table if not exists discovery_run_steps (
  run_step_id uuid primary key default gen_random_uuid(),
  vnext_run_id uuid not null references discovery_vnext_runs(vnext_run_id) on delete cascade,
  step_kind text not null,
  status text not null default 'queued',
  input_json jsonb not null default '{}'::jsonb,
  output_json jsonb not null default '{}'::jsonb,
  error_json jsonb not null default '{}'::jsonb,
  started_at timestamptz null,
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint discovery_run_steps_kind_check
    check (step_kind in (
      'brief_compile',
      'llm_gateway',
      'mega_loop',
      'candidate_acquisition',
      'probe',
      'understand_route',
      'monitoring_handoff',
      'probation_handoff',
      'replay',
      'rollback'
    )),
  constraint discovery_run_steps_status_check
    check (status in ('queued', 'running', 'succeeded', 'failed', 'skipped', 'cancelled'))
);

create index if not exists discovery_run_steps_run_idx
  on discovery_run_steps(vnext_run_id, created_at);

create index if not exists discovery_run_steps_status_idx
  on discovery_run_steps(status, updated_at desc);

create table if not exists discovery_query_attempts (
  query_attempt_id uuid primary key default gen_random_uuid(),
  vnext_run_id uuid references discovery_vnext_runs(vnext_run_id) on delete set null,
  hypothesis_artifact_id uuid references discovery_artifacts(artifact_id) on delete set null,
  query_quality_artifact_id uuid references discovery_artifacts(artifact_id) on delete set null,
  provider text not null,
  query_text text not null,
  query_family_intent text not null default '',
  result_type text not null default 'text',
  time_range text null,
  status text not null default 'queued',
  request_json jsonb not null default '{}'::jsonb,
  response_json jsonb not null default '{}'::jsonb,
  error_json jsonb not null default '{}'::jsonb,
  result_count integer not null default 0,
  request_count integer not null default 0,
  cost_cents integer not null default 0,
  live_provider_execution boolean not null default false,
  created_by text not null default 'api',
  started_at timestamptz null,
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  constraint discovery_query_attempts_status_check
    check (status in ('queued', 'running', 'succeeded', 'failed', 'skipped')),
  constraint discovery_query_attempts_cost_check
    check (cost_cents >= 0),
  constraint discovery_query_attempts_result_count_check
    check (result_count >= 0)
);

create index if not exists discovery_query_attempts_run_idx
  on discovery_query_attempts(vnext_run_id, created_at desc)
  where vnext_run_id is not null;

create index if not exists discovery_query_attempts_provider_status_idx
  on discovery_query_attempts(provider, status, created_at desc);

create table if not exists discovery_llm_gateway_events (
  llm_gateway_event_id uuid primary key default gen_random_uuid(),
  vnext_run_id uuid references discovery_vnext_runs(vnext_run_id) on delete set null,
  artifact_id uuid references discovery_artifacts(artifact_id) on delete set null,
  task text not null,
  provider text not null default 'gemini',
  model text not null,
  status text not null default 'queued',
  prompt_json jsonb not null default '{}'::jsonb,
  request_json jsonb not null default '{}'::jsonb,
  response_json jsonb not null default '{}'::jsonb,
  validation_json jsonb not null default '{}'::jsonb,
  error_json jsonb not null default '{}'::jsonb,
  prompt_tokens integer null,
  completion_tokens integer null,
  total_tokens integer null,
  cost_cents integer not null default 0,
  live_provider_execution boolean not null default false,
  deterministic_fallback boolean not null default false,
  created_by text not null default 'api',
  started_at timestamptz null,
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  constraint discovery_llm_gateway_events_status_check
    check (status in ('queued', 'running', 'succeeded', 'failed', 'skipped')),
  constraint discovery_llm_gateway_events_cost_check
    check (cost_cents >= 0)
);

create index if not exists discovery_llm_gateway_events_run_idx
  on discovery_llm_gateway_events(vnext_run_id, created_at desc)
  where vnext_run_id is not null;

create index if not exists discovery_llm_gateway_events_status_idx
  on discovery_llm_gateway_events(status, created_at desc);

insert into discovery_policies (
  policy_name,
  policy_version,
  policy_type,
  status,
  definition_json,
  created_by,
  activated_at
)
values
  (
    'discovery-runtime',
    'vnext-1',
    'permissions',
    'active',
    '{
      "liveProviderExecutionDefault": true,
      "requireDiscoveryEnabled": true,
      "requireRunBudget": true,
      "maxRunCostCents": 0,
      "maxQueryAttemptsPerRun": 20,
      "maxResultsPerQuery": 10,
      "maxLlmCallsPerRun": 3,
      "allowDeterministicFallbackForPreview": true
    }'::jsonb,
    'migration:0059_discovery_vnext_completion_runtime',
    now()
  )
on conflict (policy_name, policy_version) do nothing;

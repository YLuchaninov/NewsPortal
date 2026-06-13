create table if not exists funnel_reindex_job_bindings (
  binding_id uuid primary key default gen_random_uuid(),
  funnel_id uuid not null references operator_funnels(funnel_id) on delete cascade,
  lane_id uuid references funnel_lanes(lane_id) on delete set null,
  reindex_job_id uuid not null references reindex_jobs(reindex_job_id) on delete cascade,
  plan_id uuid references operator_funnel_plans(plan_id) on delete set null,
  binding_role text not null default 'manual_tuning',
  verification_target text not null default 'replay',
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint funnel_reindex_job_bindings_role_check
    check (binding_role in ('owned', 'shared', 'legacy', 'manual_tuning')),
  constraint funnel_reindex_job_bindings_verification_target_check
    check (verification_target in ('selection', 'source_health', 'llm_review', 'replay')),
  constraint funnel_reindex_job_bindings_metadata_json_object_check
    check (jsonb_typeof(metadata_json) = 'object')
);

create unique index if not exists funnel_reindex_job_binding_unique
  on funnel_reindex_job_bindings (funnel_id, reindex_job_id);

create index if not exists funnel_reindex_job_bindings_job_idx
  on funnel_reindex_job_bindings (reindex_job_id, funnel_id);

create index if not exists funnel_reindex_job_bindings_plan_idx
  on funnel_reindex_job_bindings (plan_id, funnel_id)
  where plan_id is not null;

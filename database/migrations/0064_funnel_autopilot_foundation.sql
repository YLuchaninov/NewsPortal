create table if not exists operator_funnels (
  funnel_id uuid primary key default gen_random_uuid(),
  name text not null,
  goal text not null default '',
  status text not null default 'draft',
  owner_user_id uuid references users(user_id) on delete set null,
  created_from_idea_json jsonb not null default '{}'::jsonb,
  default_policy_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operator_funnels_status_check
    check (status in ('draft', 'active', 'paused', 'archived')),
  constraint operator_funnels_created_from_idea_json_object_check
    check (jsonb_typeof(created_from_idea_json) = 'object'),
  constraint operator_funnels_default_policy_json_object_check
    check (jsonb_typeof(default_policy_json) = 'object')
);

create unique index if not exists operator_funnels_name_active_unique
  on operator_funnels (lower(name))
  where status <> 'archived';

create index if not exists operator_funnels_status_updated_idx
  on operator_funnels (status, updated_at desc);

create table if not exists funnel_lanes (
  lane_id uuid primary key default gen_random_uuid(),
  funnel_id uuid not null references operator_funnels(funnel_id) on delete cascade,
  name text not null,
  lane_type text not null,
  routing_mode text not null,
  policy_json jsonb not null default '{}'::jsonb,
  evidence_contract_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint funnel_lanes_type_check
    check (lane_type in ('explicit_marker', 'hidden_intent', 'mixed_split', 'context_only', 'unknown')),
  constraint funnel_lanes_routing_mode_check
    check (routing_mode in ('direct_select', 'evidence_led_review', 'llm_approved', 'hold_for_calibration', 'acquisition_only')),
  constraint funnel_lanes_policy_json_object_check
    check (jsonb_typeof(policy_json) = 'object'),
  constraint funnel_lanes_evidence_contract_json_object_check
    check (jsonb_typeof(evidence_contract_json) = 'object')
);

create unique index if not exists funnel_lanes_funnel_name_unique
  on funnel_lanes (funnel_id, lower(name));

create index if not exists funnel_lanes_funnel_type_idx
  on funnel_lanes (funnel_id, lane_type, routing_mode);

create table if not exists funnel_system_interest_bindings (
  binding_id uuid primary key default gen_random_uuid(),
  funnel_id uuid not null references operator_funnels(funnel_id) on delete cascade,
  lane_id uuid references funnel_lanes(lane_id) on delete set null,
  interest_template_id uuid not null references interest_templates(interest_template_id) on delete cascade,
  binding_role text not null default 'owned',
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint funnel_system_interest_bindings_role_check
    check (binding_role in ('owned', 'shared', 'legacy', 'manual_tuning')),
  constraint funnel_system_interest_bindings_metadata_json_object_check
    check (jsonb_typeof(metadata_json) = 'object')
);

create unique index if not exists funnel_system_interest_binding_unique
  on funnel_system_interest_bindings (funnel_id, interest_template_id);

create index if not exists funnel_system_interest_bindings_interest_idx
  on funnel_system_interest_bindings (interest_template_id, funnel_id);

create table if not exists funnel_source_bindings (
  binding_id uuid primary key default gen_random_uuid(),
  funnel_id uuid not null references operator_funnels(funnel_id) on delete cascade,
  lane_id uuid references funnel_lanes(lane_id) on delete set null,
  channel_id uuid not null references source_channels(channel_id) on delete cascade,
  source_role text not null default 'shared_inventory',
  binding_role text not null default 'shared',
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint funnel_source_bindings_role_check
    check (binding_role in ('owned', 'shared', 'legacy', 'manual_tuning')),
  constraint funnel_source_bindings_metadata_json_object_check
    check (jsonb_typeof(metadata_json) = 'object')
);

create unique index if not exists funnel_source_binding_unique
  on funnel_source_bindings (funnel_id, channel_id);

create index if not exists funnel_source_bindings_channel_idx
  on funnel_source_bindings (channel_id, funnel_id);

create index if not exists funnel_source_bindings_role_idx
  on funnel_source_bindings (funnel_id, source_role);

create table if not exists funnel_template_bindings (
  binding_id uuid primary key default gen_random_uuid(),
  funnel_id uuid not null references operator_funnels(funnel_id) on delete cascade,
  lane_id uuid references funnel_lanes(lane_id) on delete set null,
  prompt_template_id uuid not null references llm_prompt_templates(prompt_template_id) on delete cascade,
  binding_role text not null default 'owned',
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint funnel_template_bindings_role_check
    check (binding_role in ('owned', 'shared', 'legacy', 'manual_tuning')),
  constraint funnel_template_bindings_metadata_json_object_check
    check (jsonb_typeof(metadata_json) = 'object')
);

create unique index if not exists funnel_template_binding_unique
  on funnel_template_bindings (funnel_id, prompt_template_id);

create index if not exists funnel_template_bindings_template_idx
  on funnel_template_bindings (prompt_template_id, funnel_id);

create table if not exists operator_funnel_plans (
  plan_id uuid primary key default gen_random_uuid(),
  funnel_id uuid references operator_funnels(funnel_id) on delete cascade,
  plan_fingerprint text not null,
  live_state_hash text not null,
  plan_json jsonb not null default '{}'::jsonb,
  validation_json jsonb not null default '{}'::jsonb,
  status text not null default 'draft',
  created_by_user_id uuid references users(user_id) on delete set null,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operator_funnel_plans_status_check
    check (status in ('draft', 'validated', 'staged', 'applied', 'expired', 'blocked')),
  constraint operator_funnel_plans_plan_json_object_check
    check (jsonb_typeof(plan_json) = 'object'),
  constraint operator_funnel_plans_validation_json_object_check
    check (jsonb_typeof(validation_json) = 'object')
);

create unique index if not exists operator_funnel_plans_fingerprint_idx
  on operator_funnel_plans (plan_fingerprint);

create index if not exists operator_funnel_plans_funnel_status_idx
  on operator_funnel_plans (funnel_id, status, created_at desc);

insert into operator_funnels (
  name,
  goal,
  status,
  created_from_idea_json,
  default_policy_json
)
select
  'Legacy / Unassigned',
  'Compatibility funnel for pre-Funnel Autopilot system interests, templates and channels.',
  'active',
  '{"source":"migration","mode":"legacy_unassigned"}'::jsonb,
  '{"manualTuningAllowed":true,"autopilotMode":"legacy_compatibility"}'::jsonb
where not exists (
  select 1
  from operator_funnels
  where lower(name) = lower('Legacy / Unassigned')
    and status <> 'archived'
);

insert into funnel_lanes (
  funnel_id,
  name,
  lane_type,
  routing_mode,
  policy_json,
  evidence_contract_json
)
select
  f.funnel_id,
  'Legacy manual tuning',
  'unknown',
  'hold_for_calibration',
  '{"manualTuningAllowed":true,"autoSelectMode":"preserve_existing"}'::jsonb,
  '{"source":"migration","preserveExistingBehavior":true}'::jsonb
from operator_funnels f
where f.name = 'Legacy / Unassigned'
  and not exists (
    select 1
    from funnel_lanes existing
    where existing.funnel_id = f.funnel_id
      and lower(existing.name) = lower('Legacy manual tuning')
  );

insert into funnel_system_interest_bindings (
  funnel_id,
  lane_id,
  interest_template_id,
  binding_role,
  metadata_json
)
select
  f.funnel_id,
  l.lane_id,
  it.interest_template_id,
  'legacy',
  jsonb_build_object('source', 'migration', 'isActiveAtMigration', it.is_active)
from operator_funnels f
join funnel_lanes l on l.funnel_id = f.funnel_id and l.name = 'Legacy manual tuning'
join interest_templates it on it.is_active = true
where f.name = 'Legacy / Unassigned'
on conflict (funnel_id, interest_template_id) do nothing;

insert into funnel_template_bindings (
  funnel_id,
  lane_id,
  prompt_template_id,
  binding_role,
  metadata_json
)
select
  f.funnel_id,
  l.lane_id,
  t.prompt_template_id,
  'legacy',
  jsonb_build_object('source', 'migration', 'scope', t.scope, 'purpose', t.purpose)
from operator_funnels f
join funnel_lanes l on l.funnel_id = f.funnel_id and l.name = 'Legacy manual tuning'
join llm_prompt_templates t on t.is_active = true
where f.name = 'Legacy / Unassigned'
on conflict (funnel_id, prompt_template_id) do nothing;

insert into funnel_source_bindings (
  funnel_id,
  lane_id,
  channel_id,
  source_role,
  binding_role,
  metadata_json
)
select
  f.funnel_id,
  l.lane_id,
  sc.channel_id,
  coalesce(
    nullif(sc.config_json #>> '{discovery,sourceRole}', ''),
    nullif(sc.config_json #>> '{sourceRole}', ''),
    'shared_inventory'
  ),
  'legacy',
  jsonb_build_object('source', 'migration', 'providerType', sc.provider_type, 'isActiveAtMigration', sc.is_active)
from operator_funnels f
join funnel_lanes l on l.funnel_id = f.funnel_id and l.name = 'Legacy manual tuning'
join source_channels sc on sc.is_active = true
where f.name = 'Legacy / Unassigned'
on conflict (funnel_id, channel_id) do nothing;

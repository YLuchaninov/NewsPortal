-- Discovery vNext hard cutover.
-- Legacy v3 discovery rows are destructive-cleaned here because vNext is now
-- the only operator-facing Discovery surface. Shared source/channel/fetcher/
-- content tables are intentionally untouched.

create table if not exists discovery_vnext_runs (
  vnext_run_id uuid primary key default gen_random_uuid(),
  run_kind text not null,
  trigger_kind text not null default 'operator',
  status text not null default 'queued',
  created_by text not null,
  request_json jsonb not null default '{}'::jsonb,
  budget_json jsonb not null default '{}'::jsonb,
  result_json jsonb not null default '{}'::jsonb,
  error_json jsonb not null default '{}'::jsonb,
  started_at timestamptz null,
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint discovery_vnext_runs_kind_check
    check (run_kind in (
      'brief_compile',
      'mega_loop',
      'candidate_acquisition',
      'probe',
      'understand_route',
      'replay',
      'rollback',
      'full'
    )),
  constraint discovery_vnext_runs_trigger_check
    check (trigger_kind in ('operator', 'mcp', 'api', 'replay', 'rollback', 'eval')),
  constraint discovery_vnext_runs_status_check
    check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled'))
);

create index if not exists discovery_vnext_runs_status_idx
  on discovery_vnext_runs(status, created_at desc);

alter table discovery_artifacts
  add column if not exists vnext_run_id uuid references discovery_vnext_runs(vnext_run_id) on delete set null;

create index if not exists discovery_artifacts_vnext_run_idx
  on discovery_artifacts(vnext_run_id, created_at desc)
  where vnext_run_id is not null;

alter table discovery_candidates
  add column if not exists vnext_run_id uuid references discovery_vnext_runs(vnext_run_id) on delete set null;

create index if not exists discovery_candidates_vnext_run_idx
  on discovery_candidates(vnext_run_id, created_at desc)
  where vnext_run_id is not null;

create unique index if not exists discovery_candidates_vnext_run_url_idx
  on discovery_candidates(vnext_run_id, canonical_url)
  where vnext_run_id is not null;

create table if not exists discovery_replay_runs (
  replay_run_id uuid primary key default gen_random_uuid(),
  vnext_run_id uuid references discovery_vnext_runs(vnext_run_id) on delete set null,
  replay_kind text not null,
  status text not null default 'queued',
  input_json jsonb not null default '{}'::jsonb,
  output_json jsonb not null default '{}'::jsonb,
  policy_versions_json jsonb not null default '{}'::jsonb,
  dry_run boolean not null default true,
  created_by text not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz null,
  constraint discovery_replay_runs_kind_check
    check (replay_kind in ('artifact_lineage', 'routing_policy', 'candidate_acquisition', 'full_non_live')),
  constraint discovery_replay_runs_status_check
    check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled'))
);

create index if not exists discovery_replay_runs_status_idx
  on discovery_replay_runs(status, created_at desc);

create table if not exists discovery_rollback_groups (
  rollback_group_id uuid primary key default gen_random_uuid(),
  source_inventory_id uuid references source_inventory(source_inventory_id) on delete set null,
  registered_channel_id uuid null,
  reason text not null,
  status text not null default 'prepared',
  prepared_json jsonb not null default '{}'::jsonb,
  result_json jsonb not null default '{}'::jsonb,
  created_by text not null,
  applied_by text null,
  created_at timestamptz not null default now(),
  applied_at timestamptz null,
  constraint discovery_rollback_groups_status_check
    check (status in ('prepared', 'applied', 'cancelled', 'failed'))
);

create index if not exists discovery_rollback_groups_status_idx
  on discovery_rollback_groups(status, created_at desc);

create table if not exists discovery_rollback_actions (
  rollback_action_id uuid primary key default gen_random_uuid(),
  rollback_group_id uuid not null references discovery_rollback_groups(rollback_group_id) on delete cascade,
  action_type text not null,
  target_type text not null,
  target_id uuid null,
  status text not null default 'prepared',
  action_json jsonb not null default '{}'::jsonb,
  result_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  applied_at timestamptz null,
  constraint discovery_rollback_actions_type_check
    check (action_type in ('pause_channel', 'restore_inventory_state', 'archive_artifact', 'close_backlog', 'emit_sync')),
  constraint discovery_rollback_actions_target_check
    check (target_type in ('source_channel', 'source_inventory', 'artifact', 'adapter_backlog', 'outbox_event')),
  constraint discovery_rollback_actions_status_check
    check (status in ('prepared', 'applied', 'skipped', 'failed'))
);

create index if not exists discovery_rollback_actions_group_idx
  on discovery_rollback_actions(rollback_group_id, created_at);

create table if not exists discovery_vnext_eval_runs (
  eval_run_id uuid primary key default gen_random_uuid(),
  suite_name text not null,
  status text not null default 'queued',
  replay_run_id uuid references discovery_replay_runs(replay_run_id) on delete set null,
  input_json jsonb not null default '{}'::jsonb,
  result_json jsonb not null default '{}'::jsonb,
  created_by text not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz null,
  constraint discovery_vnext_eval_runs_status_check
    check (status in ('queued', 'running', 'passed', 'failed', 'cancelled'))
);

create index if not exists discovery_vnext_eval_runs_status_idx
  on discovery_vnext_eval_runs(status, created_at desc);

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
    'discovery-risk',
    'vnext-1',
    'risk',
    'active',
    '{"maxAutoRisk": 0.35, "captchaBlocksRegistration": true, "authRequiresAdapterBacklog": true}'::jsonb,
    'migration:0057_discovery_vnext_hard_cutover',
    now()
  ),
  (
    'discovery-rollback',
    'vnext-1',
    'rollback',
    'active',
    '{"allowChannelPause": true, "allowInventoryRestore": true, "allowDelete": false, "emitSourceSync": true}'::jsonb,
    'migration:0057_discovery_vnext_hard_cutover',
    now()
  ),
  (
    'discovery-permissions',
    'vnext-1',
    'permissions',
    'active',
    '{"read": "read", "propose": "write.discovery", "probe": "write.discovery", "route": "write.discovery", "register": "write.discovery", "policy": "write.discovery", "rollback": ["write.discovery", "write.destructive"]}'::jsonb,
    'migration:0057_discovery_vnext_hard_cutover',
    now()
  )
on conflict (policy_name, policy_version) do nothing;

update discovery_artifacts
set run_id = null
where run_id is not null;

do $$
declare
  table_name text;
  legacy_tables text[] := array[
    'discovery_llm_decisions',
    'discovery_eval_runs',
    'discovery_eval_cases',
    'discovery_eval_suites',
    'discovery_repairs',
    'discovery_actions',
    'discovery_source_edges',
    'discovery_source_contracts',
    'discovery_source_endpoints',
    'discovery_source_identities',
    'discovery_domain_inventory',
    'discovery_claim_evidence',
    'discovery_claims',
    'discovery_signal_clusters',
    'discovery_negative_evidence',
    'discovery_evidence_items',
    'discovery_provider_queries',
    'discovery_debates',
    'discovery_hypotheses',
    'discovery_coverage_snapshots',
    'discovery_provider_health',
    'discovery_provider_capabilities',
    'discovery_runs',
    'discovery_targets',
    'discovery_llm_task_templates',
    'discovery_legacy_archive_batches'
  ];
begin
  foreach table_name in array legacy_tables loop
    if to_regclass(table_name) is not null then
      execute format('delete from %I', table_name);
    end if;
  end loop;
end $$;

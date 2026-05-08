create table if not exists discovery_legacy_archive_batches (
  archive_batch_id uuid primary key default gen_random_uuid(),
  archive_kind text not null,
  source_table text not null,
  batch_index integer not null,
  row_count integer not null default 0,
  rows_json jsonb not null default '[]'::jsonb,
  archived_at timestamptz not null default now(),
  constraint discovery_legacy_archive_batches_batch_check
    check (batch_index >= 0),
  constraint discovery_legacy_archive_batches_row_count_check
    check (row_count >= 0)
);

create index if not exists discovery_legacy_archive_batches_table_idx
  on discovery_legacy_archive_batches (source_table, batch_index);

do $$
declare
  table_name text;
  table_names text[] := array[
    'discovery_feedback_events',
    'discovery_portfolio_snapshots',
    'discovery_source_interest_scores',
    'discovery_source_quality_snapshots',
    'discovery_source_profiles',
    'discovery_strategy_stats',
    'discovery_cost_log',
    'discovery_candidates',
    'discovery_hypotheses',
    'discovery_hypothesis_classes',
    'discovery_missions',
    'discovery_recall_candidates',
    'discovery_recall_missions',
    'discovery_policy_profiles'
  ];
begin
  foreach table_name in array table_names loop
    if to_regclass(table_name) is not null then
      execute format(
        'insert into discovery_legacy_archive_batches (
           archive_kind,
           source_table,
           batch_index,
           row_count,
           rows_json
         )
         with numbered as (
           select
             to_jsonb(t) as row_json,
             row_number() over (order by md5(to_jsonb(t)::text), t.ctid::text) as row_number
           from %I t
         ),
         batched as (
           select
             ((row_number - 1) / 1000)::int as batch_index,
             count(*)::int as row_count,
             jsonb_agg(row_json order by row_number) as rows_json
           from numbered
           group by ((row_number - 1) / 1000)::int
         )
         select %L, %L, batch_index, row_count, rows_json
         from batched',
        table_name,
        'resilient_discovery_rebuild_0052',
        table_name
      );
    end if;
  end loop;
end $$;

drop table if exists discovery_feedback_events cascade;
drop table if exists discovery_portfolio_snapshots cascade;
drop table if exists discovery_source_interest_scores cascade;
drop table if exists discovery_source_quality_snapshots cascade;
drop table if exists discovery_source_profiles cascade;
drop table if exists discovery_strategy_stats cascade;
drop table if exists discovery_cost_log cascade;
drop table if exists discovery_candidates cascade;
drop table if exists discovery_hypotheses cascade;
drop table if exists discovery_hypothesis_classes cascade;
drop table if exists discovery_missions cascade;
drop table if exists discovery_recall_candidates cascade;
drop table if exists discovery_recall_missions cascade;
drop table if exists discovery_policy_profiles cascade;

update sequences
set
  status = 'archived',
  updated_at = now(),
  tags = (
    select array(
      select distinct tag
      from unnest(coalesce(sequences.tags, '{}'::text[]) || array['discovery-legacy-archived']) as tag
    )
  )
where sequence_id in (
  '0a8e8ec5-6cab-4d8b-9c28-0a1d6245bf17',
  '1cb1bfec-d42b-4607-a8f0-8e3f671f0978',
  'c7e0a3a2-8f0c-4a76-bf35-fd7d1f44774d'
);

create table discovery_targets (
  target_id uuid primary key default gen_random_uuid(),
  origin_kind text not null,
  origin_id uuid,
  title text not null,
  description text,
  status text not null default 'active',
  priority double precision not null default 1.0,
  seed_topics text[] not null default '{}'::text[],
  seed_entities text[] not null default '{}'::text[],
  seed_geos text[] not null default '{}'::text[],
  seed_languages text[] not null default '{}'::text[],
  seed_urls text[] not null default '{}'::text[],
  seed_domains text[] not null default '{}'::text[],
  graph_json jsonb not null default '{}'::jsonb,
  policy_json jsonb not null default '{}'::jsonb,
  autopilot_json jsonb not null default '{}'::jsonb,
  last_coverage_snapshot_id uuid,
  last_run_id uuid,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint discovery_targets_origin_kind_check
    check (origin_kind in (
      'system_interest',
      'user_interest',
      'manual_prompt',
      'source_channel',
      'coverage_gap',
      'underperforming_source',
      'discovered_entity',
      'discovered_domain',
      'social_signal_cluster'
    )),
  constraint discovery_targets_status_check
    check (status in ('active', 'paused', 'archived'))
);

create index discovery_targets_origin_idx
  on discovery_targets (origin_kind, origin_id);

create unique index discovery_targets_origin_unique
  on discovery_targets (origin_kind, origin_id)
  where origin_id is not null;

create index discovery_targets_status_idx
  on discovery_targets (status, priority desc, updated_at desc);

create table discovery_runs (
  run_id uuid primary key default gen_random_uuid(),
  target_id uuid not null references discovery_targets (target_id) on delete cascade,
  run_kind text not null,
  trigger_kind text not null default 'scheduled',
  status text not null default 'queued',
  max_depth integer not null default 3,
  max_hypotheses integer not null default 120,
  max_search_results integer not null default 800,
  max_domains integer not null default 400,
  max_endpoints integer not null default 700,
  max_social_items integer not null default 1000,
  started_at timestamptz,
  finished_at timestamptz,
  summary_json jsonb not null default '{}'::jsonb,
  diagnosis_json jsonb not null default '{}'::jsonb,
  error_text text,
  created_by text,
  created_at timestamptz not null default now(),
  constraint discovery_runs_kind_check
    check (run_kind in (
      'bootstrap',
      'gap_fill',
      'source_expand',
      'replacement',
      'hidden_signal_scan',
      'direct_signal_scan',
      'social_scan',
      'maintenance',
      'manual'
    )),
  constraint discovery_runs_trigger_check
    check (trigger_kind in (
      'scheduled',
      'manual',
      'mcp',
      'api',
      'coverage_gap',
      'source_health',
      'new_interest',
      'self_healing'
    )),
  constraint discovery_runs_status_check
    check (status in ('queued', 'running', 'completed', 'failed', 'cancelled'))
);

create index discovery_runs_target_idx
  on discovery_runs (target_id, created_at desc);

create index discovery_runs_status_idx
  on discovery_runs (status, created_at desc);

alter table discovery_targets
  add constraint discovery_targets_last_run_fk
  foreign key (last_run_id)
  references discovery_runs (run_id)
  on delete set null;

create table discovery_provider_capabilities (
  provider_id text primary key,
  provider_kind text not null,
  display_name text not null,
  discovery_supported boolean not null default true,
  ingestion_supported boolean not null default false,
  promotion_mode text not null default 'manual',
  access_mode text not null,
  auth_required boolean not null default false,
  query_primitives_json jsonb not null default '{}'::jsonb,
  object_types_json jsonb not null default '[]'::jsonb,
  signal_modes_json jsonb not null default '[]'::jsonb,
  rate_limit_json jsonb not null default '{}'::jsonb,
  compliance_json jsonb not null default '{}'::jsonb,
  retention_policy_json jsonb not null default '{}'::jsonb,
  provider_card_json jsonb not null default '{}'::jsonb,
  status text not null default 'active',
  updated_at timestamptz not null default now(),
  constraint discovery_provider_capabilities_status_check
    check (status in ('active', 'paused', 'disabled', 'needs_config')),
  constraint discovery_provider_capabilities_promotion_check
    check (promotion_mode in (
      'auto_or_manual',
      'manual',
      'manual_or_guarded_auto',
      'monitor_only',
      'needs_config',
      'disabled'
    ))
);

create table discovery_provider_health (
  provider_id text primary key references discovery_provider_capabilities (provider_id) on delete cascade,
  status text not null default 'healthy',
  success_rate double precision not null default 1,
  error_rate double precision not null default 0,
  rate_limit_score double precision not null default 1,
  auth_health_score double precision not null default 1,
  latency_score double precision not null default 1,
  last_success_at timestamptz,
  last_error_at timestamptz,
  last_error_kind text,
  cooldown_until timestamptz,
  metrics_json jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint discovery_provider_health_status_check
    check (status in ('healthy', 'degraded', 'rate_limited', 'auth_failed', 'blocked', 'disabled')),
  constraint discovery_provider_health_success_check
    check (success_rate >= 0 and success_rate <= 1),
  constraint discovery_provider_health_error_check
    check (error_rate >= 0 and error_rate <= 1)
);

create index discovery_provider_health_status_idx
  on discovery_provider_health (status, cooldown_until, updated_at desc);

create table discovery_coverage_snapshots (
  coverage_snapshot_id uuid primary key default gen_random_uuid(),
  target_id uuid not null references discovery_targets (target_id) on delete cascade,
  run_id uuid references discovery_runs (run_id) on delete set null,
  coverage_json jsonb not null default '{}'::jsonb,
  gaps_json jsonb not null default '[]'::jsonb,
  source_inventory_json jsonb not null default '[]'::jsonb,
  summary_json jsonb not null default '{}'::jsonb,
  coverage_score double precision not null default 0,
  source_count integer not null default 0,
  strong_source_count integer not null default 0,
  missing_role_count integer not null default 0,
  created_at timestamptz not null default now(),
  constraint discovery_coverage_score_check
    check (coverage_score >= 0 and coverage_score <= 1)
);

create index discovery_coverage_target_idx
  on discovery_coverage_snapshots (target_id, created_at desc);

alter table discovery_targets
  add constraint discovery_targets_last_coverage_fk
  foreign key (last_coverage_snapshot_id)
  references discovery_coverage_snapshots (coverage_snapshot_id)
  on delete set null;

create table discovery_hypotheses (
  hypothesis_id uuid primary key default gen_random_uuid(),
  run_id uuid references discovery_runs (run_id) on delete cascade,
  target_id uuid not null references discovery_targets (target_id) on delete cascade,
  parent_hypothesis_id uuid references discovery_hypotheses (hypothesis_id) on delete set null,
  generation_depth integer not null default 0,
  hypothesis_type text not null,
  signal_mode text not null,
  source_role text not null,
  acquisition_tactic text not null,
  query_text text,
  seed_url text,
  seed_domain text,
  seed_entity text,
  provider_id text references discovery_provider_capabilities (provider_id) on delete set null,
  control_query_text text,
  control_provider_id text references discovery_provider_capabilities (provider_id) on delete set null,
  control_expected_noise double precision,
  expected_provider_types text[] not null default '{}'::text[],
  expected_endpoint_kinds text[] not null default '{}'::text[],
  endpoint_patterns text[] not null default '{}'::text[],
  expected_data_shape text,
  explorer_json jsonb not null default '{}'::jsonb,
  skeptic_json jsonb not null default '{}'::jsonb,
  repair_json jsonb not null default '{}'::jsonb,
  debate_state text not null default 'draft',
  repair_round integer not null default 0,
  verification_round integer not null default 0,
  meaningful_change_score double precision not null default 0,
  priority_score double precision not null default 0.5,
  novelty_score double precision not null default 0.5,
  gap_score double precision not null default 0.5,
  risk_score double precision not null default 0.5,
  confidence_score double precision not null default 0.5,
  status text not null default 'queued',
  results_count integer not null default 0,
  evidence_count integer not null default 0,
  endpoints_found integer not null default 0,
  signals_found integer not null default 0,
  created_at timestamptz not null default now(),
  constraint discovery_hypotheses_signal_mode_check
    check (signal_mode in ('direct', 'hidden', 'mixed', 'provider_discovery', 'source_expansion', 'replacement')),
  constraint discovery_hypotheses_debate_state_check
    check (debate_state in (
      'draft',
      'explorer_generated',
      'skeptic_reviewed',
      'repair_required',
      'accepted',
      'rejected',
      'manual_review',
      'repaired',
      'skeptic_verified',
      'referee_accepted',
      'executed'
    )),
  constraint discovery_hypotheses_repair_round_check
    check (repair_round >= 0 and repair_round <= 2),
  constraint discovery_hypotheses_verification_round_check
    check (verification_round >= 0 and verification_round <= 1),
  constraint discovery_hypotheses_meaningful_change_check
    check (meaningful_change_score >= 0 and meaningful_change_score <= 1),
  constraint discovery_hypotheses_status_check
    check (status in ('queued', 'running', 'completed', 'failed', 'skipped', 'rejected'))
);

create index discovery_hypotheses_run_idx
  on discovery_hypotheses (run_id, priority_score desc, created_at desc);

create index discovery_hypotheses_target_idx
  on discovery_hypotheses (target_id, created_at desc);

create index discovery_hypotheses_status_idx
  on discovery_hypotheses (status, priority_score desc, created_at desc);

create unique index discovery_hypotheses_dedupe_idx
  on discovery_hypotheses (
    target_id,
    hypothesis_type,
    signal_mode,
    source_role,
    coalesce(provider_id, ''),
    coalesce(query_text, ''),
    coalesce(seed_url, ''),
    coalesce(seed_domain, ''),
    coalesce(seed_entity, '')
  );

create table discovery_debates (
  debate_id uuid primary key default gen_random_uuid(),
  run_id uuid references discovery_runs (run_id) on delete cascade,
  target_id uuid references discovery_targets (target_id) on delete cascade,
  hypothesis_id uuid references discovery_hypotheses (hypothesis_id) on delete cascade,
  debate_kind text not null,
  explorer_output_json jsonb not null default '{}'::jsonb,
  skeptic_output_json jsonb not null default '{}'::jsonb,
  repaired_output_json jsonb not null default '{}'::jsonb,
  referee_output_json jsonb not null default '{}'::jsonb,
  disagreement_score double precision not null default 0,
  accepted boolean not null default false,
  created_at timestamptz not null default now(),
  constraint discovery_debates_kind_check
    check (debate_kind in (
      'hypothesis_generation',
      'provider_selection',
      'hidden_signal_interpretation',
      'endpoint_review',
      'failure_diagnosis',
      'replacement_decision'
    ))
);

create index discovery_debates_hypothesis_idx
  on discovery_debates (hypothesis_id, created_at desc);

create table discovery_provider_queries (
  provider_query_id uuid primary key default gen_random_uuid(),
  run_id uuid references discovery_runs (run_id) on delete cascade,
  target_id uuid not null references discovery_targets (target_id) on delete cascade,
  hypothesis_id uuid references discovery_hypotheses (hypothesis_id) on delete cascade,
  provider_id text not null references discovery_provider_capabilities (provider_id) on delete restrict,
  query_text text not null,
  result_type text not null default 'web',
  time_range text,
  provider_meta_json jsonb not null default '{}'::jsonb,
  cost_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index discovery_provider_queries_hypothesis_idx
  on discovery_provider_queries (hypothesis_id, created_at desc);

create table discovery_evidence_items (
  evidence_id uuid primary key default gen_random_uuid(),
  target_id uuid references discovery_targets (target_id) on delete cascade,
  run_id uuid references discovery_runs (run_id) on delete set null,
  hypothesis_id uuid references discovery_hypotheses (hypothesis_id) on delete set null,
  provider_query_id uuid references discovery_provider_queries (provider_query_id) on delete set null,
  provider_id text not null,
  evidence_kind text not null,
  url text,
  canonical_url text,
  canonical_domain text,
  object_id text,
  object_type text,
  title text,
  text_excerpt text,
  language text,
  geo text,
  author_ref text,
  timestamp_at timestamptz,
  raw_json jsonb not null default '{}'::jsonb,
  normalized_json jsonb not null default '{}'::jsonb,
  direct_signal_score double precision not null default 0,
  hidden_signal_score double precision not null default 0,
  quality_score double precision not null default 0,
  risk_score double precision not null default 0,
  created_at timestamptz not null default now()
);

create index discovery_evidence_target_idx
  on discovery_evidence_items (target_id, created_at desc);

create index discovery_evidence_domain_idx
  on discovery_evidence_items (canonical_domain, created_at desc)
  where canonical_domain is not null;

create table discovery_negative_evidence (
  negative_evidence_id uuid primary key default gen_random_uuid(),
  target_id uuid references discovery_targets (target_id) on delete cascade,
  run_id uuid references discovery_runs (run_id) on delete set null,
  hypothesis_id uuid references discovery_hypotheses (hypothesis_id) on delete set null,
  evidence_kind text not null,
  provider_id text,
  query_text text,
  canonical_domain text,
  endpoint_url text,
  source_role text,
  signal_mode text,
  failure_mode text not null,
  severity double precision not null default 0.5,
  details_json jsonb not null default '{}'::jsonb,
  cooldown_until timestamptz,
  created_at timestamptz not null default now(),
  constraint discovery_negative_evidence_failure_mode_check
    check (failure_mode in (
      'no_results',
      'low_relevance',
      'seo_noise',
      'social_noise',
      'duplicate',
      'provider_mismatch',
      'provider_error',
      'auth_required',
      'rate_limited',
      'blocked_domain',
      'dead_endpoint',
      'probe_failed',
      'browser_challenge',
      'hidden_signal_not_confirmed',
      'compliance_blocked',
      'contract_failed'
    )),
  constraint discovery_negative_evidence_severity_check
    check (severity >= 0 and severity <= 1)
);

create index discovery_negative_evidence_target_idx
  on discovery_negative_evidence (target_id, failure_mode, created_at desc);

create index discovery_negative_evidence_cooldown_idx
  on discovery_negative_evidence (provider_id, canonical_domain, cooldown_until)
  where cooldown_until is not null;

create table discovery_signal_clusters (
  signal_cluster_id uuid primary key default gen_random_uuid(),
  target_id uuid not null references discovery_targets (target_id) on delete cascade,
  run_id uuid references discovery_runs (run_id) on delete set null,
  signal_mode text not null default 'hidden',
  signal_type text not null,
  title text not null,
  summary text,
  source_role text,
  related_entities text[] not null default '{}'::text[],
  related_geos text[] not null default '{}'::text[],
  related_languages text[] not null default '{}'::text[],
  evidence_count integer not null default 0,
  independent_source_count integer not null default 0,
  unique_author_count integer not null default 0,
  burst_score double precision not null default 0,
  need_score double precision not null default 0,
  novelty_score double precision not null default 0,
  confidence_score double precision not null default 0,
  risk_score double precision not null default 0,
  status text not null default 'candidate',
  evidence_json jsonb not null default '[]'::jsonb,
  reasoning_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint discovery_signal_clusters_status_check
    check (status in ('candidate', 'monitor_only', 'confirmed_signal', 'needs_more_evidence', 'rejected'))
);

create index discovery_signal_clusters_target_idx
  on discovery_signal_clusters (target_id, confidence_score desc, updated_at desc);

create table discovery_claims (
  claim_id uuid primary key default gen_random_uuid(),
  target_id uuid not null references discovery_targets (target_id) on delete cascade,
  run_id uuid references discovery_runs (run_id) on delete set null,
  signal_cluster_id uuid references discovery_signal_clusters (signal_cluster_id) on delete set null,
  claim_type text not null,
  signal_mode text not null,
  title text not null,
  normalized_claim text not null,
  summary text,
  related_entities text[] not null default '{}'::text[],
  related_geos text[] not null default '{}'::text[],
  related_languages text[] not null default '{}'::text[],
  support_evidence_count integer not null default 0,
  contradict_evidence_count integer not null default 0,
  independent_source_count integer not null default 0,
  unique_author_count integer not null default 0,
  control_query_text text,
  control_signal_rate double precision,
  target_signal_rate double precision,
  specificity_score double precision not null default 0,
  confidence_score double precision not null default 0,
  risk_score double precision not null default 0,
  novelty_score double precision not null default 0,
  status text not null default 'candidate',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint discovery_claims_signal_mode_check
    check (signal_mode in ('hidden', 'mixed', 'direct')),
  constraint discovery_claims_status_check
    check (status in ('candidate', 'needs_control', 'confirmed', 'confirmed_signal', 'monitor_only', 'rejected')),
  constraint discovery_claims_confidence_check
    check (confidence_score >= 0 and confidence_score <= 1)
);

create index discovery_claims_target_idx
  on discovery_claims (target_id, confidence_score desc, updated_at desc);

create table discovery_claim_evidence (
  claim_id uuid references discovery_claims (claim_id) on delete cascade,
  evidence_id uuid references discovery_evidence_items (evidence_id) on delete cascade,
  relation text not null,
  strength double precision not null default 0.5,
  created_at timestamptz not null default now(),
  primary key (claim_id, evidence_id),
  constraint discovery_claim_evidence_relation_check
    check (relation in ('supports', 'contradicts', 'mentions', 'weak_support')),
  constraint discovery_claim_evidence_strength_check
    check (strength >= 0 and strength <= 1)
);

create table discovery_domain_inventory (
  domain_id uuid primary key default gen_random_uuid(),
  canonical_domain text not null unique,
  homepage_url text,
  first_seen_run_id uuid references discovery_runs (run_id) on delete set null,
  first_seen_target_id uuid references discovery_targets (target_id) on delete set null,
  source_channel_id uuid references source_channels (channel_id) on delete set null,
  domain_kind text not null default 'unknown',
  organization_name text,
  country text,
  languages text[] not null default '{}'::text[],
  trust_score double precision not null default 0.5,
  spam_score double precision not null default 0,
  authority_score double precision not null default 0.5,
  seen_count integer not null default 1,
  last_seen_at timestamptz not null default now(),
  evidence_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index discovery_domain_inventory_kind_idx
  on discovery_domain_inventory (domain_kind, authority_score desc, last_seen_at desc);

create table discovery_source_identities (
  source_identity_id uuid primary key default gen_random_uuid(),
  canonical_organization text,
  canonical_domain text not null,
  known_domains text[] not null default '{}'::text[],
  known_feed_urls text[] not null default '{}'::text[],
  known_homepage_urls text[] not null default '{}'::text[],
  source_channel_ids uuid[] not null default '{}'::uuid[],
  endpoint_ids uuid[] not null default '{}'::uuid[],
  identity_confidence double precision not null default 0.5,
  evidence_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint discovery_source_identities_confidence_check
    check (identity_confidence >= 0 and identity_confidence <= 1)
);

create unique index discovery_source_identities_domain_unique
  on discovery_source_identities (canonical_domain);

create index discovery_source_identities_known_domains_idx
  on discovery_source_identities using gin (known_domains);

create table discovery_source_endpoints (
  endpoint_id uuid primary key default gen_random_uuid(),
  target_id uuid references discovery_targets (target_id) on delete cascade,
  run_id uuid references discovery_runs (run_id) on delete set null,
  hypothesis_id uuid references discovery_hypotheses (hypothesis_id) on delete set null,
  evidence_id uuid references discovery_evidence_items (evidence_id) on delete set null,
  domain_id uuid references discovery_domain_inventory (domain_id) on delete set null,
  source_channel_id uuid references source_channels (channel_id) on delete set null,
  provider_id text not null,
  provider_type text not null,
  canonical_domain text,
  homepage_url text,
  endpoint_url text not null,
  normalized_endpoint_url text not null,
  endpoint_kind text not null,
  source_role text not null,
  signal_mode text not null default 'direct',
  title text,
  description text,
  evidence_json jsonb not null default '{}'::jsonb,
  samples_json jsonb not null default '[]'::jsonb,
  extraction_config_json jsonb not null default '{}'::jsonb,
  why_found_json jsonb not null default '[]'::jsonb,
  why_not_promoted_json jsonb not null default '[]'::jsonb,
  missing_evidence_json jsonb not null default '[]'::jsonb,
  next_best_action text,
  interest_fit_score double precision not null default 0,
  evidence_score double precision not null default 0,
  quality_score double precision not null default 0,
  yield_score double precision not null default 0,
  freshness_score double precision not null default 0,
  novelty_score double precision not null default 0,
  extraction_ready_score double precision not null default 0,
  coverage_gap_score double precision not null default 0,
  compliance_score double precision not null default 0,
  adversarial_confidence_score double precision not null default 0,
  total_score double precision not null default 0,
  status text not null default 'candidate',
  recommended_action text not null default 'review',
  rejection_reason text,
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint discovery_source_endpoints_provider_type_check
    check (provider_type in ('rss', 'website', 'api', 'email_imap', 'youtube', 'social', 'forum', 'search')),
  constraint discovery_source_endpoints_signal_mode_check
    check (signal_mode in ('direct', 'hidden', 'mixed')),
  constraint discovery_source_endpoints_status_check
    check (status in (
      'candidate',
      'promotable',
      'manual_review',
      'detect_only',
      'monitor_only',
      'needs_config',
      'registered',
      'rejected',
      'duplicate'
    )),
  constraint discovery_source_endpoints_action_check
    check (recommended_action in (
      'auto_promote',
      'manual_promote',
      'review',
      'detect_only',
      'monitor',
      'expand',
      'replace_existing',
      'needs_config',
      'reject'
    ))
);

create unique index discovery_source_endpoints_target_url_unique
  on discovery_source_endpoints (target_id, normalized_endpoint_url)
  where target_id is not null;

create index discovery_source_endpoints_target_score_idx
  on discovery_source_endpoints (target_id, total_score desc, created_at desc);

create index discovery_source_endpoints_status_idx
  on discovery_source_endpoints (status, total_score desc, updated_at desc);

create table discovery_source_contracts (
  contract_id uuid primary key default gen_random_uuid(),
  target_id uuid not null references discovery_targets (target_id) on delete cascade,
  endpoint_id uuid references discovery_source_endpoints (endpoint_id) on delete set null,
  source_channel_id uuid references source_channels (channel_id) on delete cascade,
  source_role text not null,
  signal_mode text not null,
  provider_type text not null,
  endpoint_kind text not null,
  expected_data_shape text,
  contract_json jsonb not null default '{}'::jsonb,
  status text not null default 'probation',
  last_evaluation_at timestamptz,
  last_passed_at timestamptz,
  last_failed_at timestamptz,
  health_score double precision not null default 0,
  contract_fit_score double precision not null default 0,
  useful_yield_score double precision not null default 0,
  noise_score double precision not null default 0,
  freshness_score double precision not null default 0,
  coverage_contribution double precision not null default 0.25,
  downstream_weight double precision not null default 0.3,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint discovery_source_contracts_status_check
    check (status in (
      'probation',
      'active',
      'weak',
      'degraded',
      'broken',
      'replacement_needed',
      'retired'
    )),
  constraint discovery_source_contracts_coverage_check
    check (coverage_contribution >= 0 and coverage_contribution <= 1),
  constraint discovery_source_contracts_downstream_weight_check
    check (downstream_weight >= 0 and downstream_weight <= 1)
);

create index discovery_source_contracts_target_idx
  on discovery_source_contracts (target_id, status, updated_at desc);

create index discovery_source_contracts_channel_idx
  on discovery_source_contracts (source_channel_id)
  where source_channel_id is not null;

create table discovery_source_edges (
  edge_id uuid primary key default gen_random_uuid(),
  target_id uuid references discovery_targets (target_id) on delete cascade,
  run_id uuid references discovery_runs (run_id) on delete set null,
  from_kind text not null,
  from_ref text not null,
  to_kind text not null,
  to_ref text not null,
  edge_kind text not null,
  confidence double precision not null default 0.5,
  evidence_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint discovery_source_edges_kind_check
    check (edge_kind in (
      'discovered_from_search',
      'discovered_from_provider',
      'discovered_from_source_directory',
      'sibling_endpoint',
      'same_domain',
      'same_organization',
      'cites',
      'linked_from',
      'feed_of_website',
      'replacement_for',
      'expands_source',
      'entity_from_result',
      'query_from_gap',
      'signal_to_hypothesis'
    ))
);

create index discovery_source_edges_from_idx
  on discovery_source_edges (from_kind, from_ref);

create index discovery_source_edges_to_idx
  on discovery_source_edges (to_kind, to_ref);

create table discovery_actions (
  action_id uuid primary key default gen_random_uuid(),
  target_id uuid references discovery_targets (target_id) on delete cascade,
  run_id uuid references discovery_runs (run_id) on delete set null,
  endpoint_id uuid references discovery_source_endpoints (endpoint_id) on delete cascade,
  signal_cluster_id uuid references discovery_signal_clusters (signal_cluster_id) on delete set null,
  source_channel_id uuid references source_channels (channel_id) on delete set null,
  action_type text not null,
  status text not null default 'queued',
  requested_by text,
  decided_by text,
  reason text,
  payload_json jsonb not null default '{}'::jsonb,
  result_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint discovery_actions_type_check
    check (action_type in (
      'promote_endpoint',
      'reject_endpoint',
      'expand_endpoint',
      'expand_domain',
      'replace_source',
      'pause_source',
      'mark_duplicate',
      'request_config',
      'monitor_signal',
      'collect_more_evidence'
    )),
  constraint discovery_actions_status_check
    check (status in ('queued', 'running', 'completed', 'failed', 'cancelled'))
);

create index discovery_actions_status_idx
  on discovery_actions (status, created_at desc);

create table discovery_repairs (
  repair_id uuid primary key default gen_random_uuid(),
  target_id uuid references discovery_targets (target_id) on delete cascade,
  run_id uuid references discovery_runs (run_id) on delete set null,
  repair_kind text not null,
  trigger_kind text not null,
  diagnosis_json jsonb not null default '{}'::jsonb,
  action_plan_json jsonb not null default '{}'::jsonb,
  result_json jsonb not null default '{}'::jsonb,
  status text not null default 'queued',
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint discovery_repairs_status_check
    check (status in ('queued', 'running', 'completed', 'failed', 'cancelled'))
);

create index discovery_repairs_target_idx
  on discovery_repairs (target_id, created_at desc);

create table discovery_eval_suites (
  eval_suite_id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  constraint discovery_eval_suites_status_check
    check (status in ('active', 'paused', 'archived'))
);

create table discovery_eval_cases (
  eval_case_id uuid primary key default gen_random_uuid(),
  eval_suite_id uuid references discovery_eval_suites (eval_suite_id) on delete cascade,
  target_json jsonb not null,
  provider_fixtures_json jsonb not null default '{}'::jsonb,
  expected_sources_json jsonb not null default '[]'::jsonb,
  expected_rejects_json jsonb not null default '[]'::jsonb,
  expected_hidden_claims_json jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index discovery_eval_cases_suite_idx
  on discovery_eval_cases (eval_suite_id, created_at);

create table discovery_eval_runs (
  eval_run_id uuid primary key default gen_random_uuid(),
  eval_suite_id uuid references discovery_eval_suites (eval_suite_id) on delete cascade,
  config_json jsonb not null default '{}'::jsonb,
  metrics_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index discovery_eval_runs_suite_idx
  on discovery_eval_runs (eval_suite_id, created_at desc);

create or replace view discovery_source_inventory_view as
select
  sc.channel_id,
  sc.provider_type,
  sc.name,
  sc.fetch_url,
  sc.homepage_url,
  sc.config_json,
  sc.country,
  sc.language,
  sc.is_active,
  sc.last_fetch_at,
  sc.last_success_at,
  sc.last_error_at,
  sc.last_error_message,
  sc.created_at,
  sc.updated_at,
  scrs.consecutive_failures,
  scrs.last_result_kind,
  scrs.updated_at as runtime_updated_at,
  sc.config_json #>> '{discovery,sourceRole}' as source_role,
  sc.config_json #>> '{discovery,endpointKind}' as endpoint_kind,
  sc.config_json #>> '{discovery,targetId}' as target_id,
  sc.config_json #>> '{discovery,endpointId}' as endpoint_id
from source_channels sc
left join source_channel_runtime_state scrs on scrs.channel_id = sc.channel_id;

insert into discovery_provider_capabilities (
  provider_id,
  provider_kind,
  display_name,
  discovery_supported,
  ingestion_supported,
  promotion_mode,
  access_mode,
  auth_required,
  query_primitives_json,
  object_types_json,
  signal_modes_json,
  rate_limit_json,
  compliance_json,
  provider_card_json,
  status
)
values
  (
    'web_search',
    'web_search',
    'Web search fanout',
    true,
    false,
    'disabled',
    'configured_adapter',
    false,
    '{"keywordSearch":true,"timeRange":true}'::jsonb,
    '["web_result","news_result"]'::jsonb,
    '["direct","hidden"]'::jsonb,
    '{}'::jsonb,
    '{"requiresOfficialApi":false,"piiRisk":"low"}'::jsonb,
    '{"defaultAction":"discover_only"}'::jsonb,
    'active'
  ),
  (
    'rss',
    'feed',
    'RSS/Atom feed',
    true,
    true,
    'auto_or_manual',
    'public_http',
    false,
    '{"urlProbe":true,"feedProbe":true}'::jsonb,
    '["feed","entry"]'::jsonb,
    '["direct"]'::jsonb,
    '{}'::jsonb,
    '{"piiRisk":"low"}'::jsonb,
    '{"defaultAction":"manual_promote","autoPromotionAllowed":true}'::jsonb,
    'active'
  ),
  (
    'website',
    'website',
    'Website',
    true,
    true,
    'manual_or_guarded_auto',
    'public_http',
    false,
    '{"urlProbe":true,"websiteProbe":true,"sitemap":true,"endpointSweep":true}'::jsonb,
    '["homepage","listing","document","download"]'::jsonb,
    '["direct"]'::jsonb,
    '{}'::jsonb,
    '{"piiRisk":"low","browserChallengeRequiresOperatorPolicy":true}'::jsonb,
    '{"defaultAction":"review","autoPromotionAllowed":false}'::jsonb,
    'active'
  ),
  (
    'custom_api',
    'api',
    'Custom API',
    true,
    false,
    'needs_config',
    'operator_config',
    true,
    '{"openapiProbe":true}'::jsonb,
    '["openapi","endpoint","schema"]'::jsonb,
    '["direct"]'::jsonb,
    '{}'::jsonb,
    '{"requiresOperatorConfig":true,"piiRisk":"medium"}'::jsonb,
    '{"defaultAction":"needs_config"}'::jsonb,
    'needs_config'
  ),
  (
    'email_imap',
    'email',
    'Email IMAP',
    true,
    true,
    'needs_config',
    'operator_mailbox_config',
    true,
    '{"newsletterDetect":true}'::jsonb,
    '["newsletter","message","archive"]'::jsonb,
    '["direct","hidden"]'::jsonb,
    '{}'::jsonb,
    '{"requiresMailboxConfig":true,"piiRisk":"high"}'::jsonb,
    '{"defaultAction":"needs_config"}'::jsonb,
    'needs_config'
  ),
  (
    'youtube',
    'social_video',
    'YouTube',
    true,
    false,
    'monitor_only',
    'official_api',
    true,
    '{"keywordSearch":true,"channelSearch":true,"regionCode":true,"languageHint":true}'::jsonb,
    '["video","channel","playlist","comment"]'::jsonb,
    '["direct","hidden"]'::jsonb,
    '{"searchListCostUnits":100}'::jsonb,
    '{"requiresOfficialApi":true,"piiRisk":"medium"}'::jsonb,
    '{"defaultAction":"monitor_only"}'::jsonb,
    'needs_config'
  ),
  (
    'x_recent_search',
    'social_microblog',
    'X recent search',
    true,
    false,
    'monitor_only',
    'official_api',
    true,
    '{"keywordSearch":true,"recentSearchWindowDays":7,"operators":true,"language":true,"hashtags":true}'::jsonb,
    '["post","profile"]'::jsonb,
    '["direct","hidden"]'::jsonb,
    '{"recentWindowDays":7}'::jsonb,
    '{"requiresOfficialApi":true,"piiRisk":"high"}'::jsonb,
    '{"defaultAction":"monitor_only"}'::jsonb,
    'needs_config'
  ),
  (
    'reddit',
    'community_forum',
    'Reddit',
    true,
    false,
    'monitor_only',
    'official_api',
    true,
    '{"keywordSearch":true,"subredditScope":true,"listingPagination":true}'::jsonb,
    '["post","comment","subreddit"]'::jsonb,
    '["direct","hidden"]'::jsonb,
    '{}'::jsonb,
    '{"oauthRequired":true,"deletedContentRemovalRequired":true,"userAgentRequired":true,"piiRisk":"high"}'::jsonb,
    '{"defaultAction":"monitor_only"}'::jsonb,
    'needs_config'
  ),
  (
    'meta_content_library',
    'social_research_library',
    'Meta Content Library',
    true,
    false,
    'monitor_only',
    'official_research_tool',
    true,
    '{"keywordSearch":true,"publicContentLibrary":true}'::jsonb,
    '["facebook_page_post","facebook_group_post","instagram_post","threads_post"]'::jsonb,
    '["direct","hidden"]'::jsonb,
    '{}'::jsonb,
    '{"requiresQualifiedAccess":true,"unauthorizedScrapingBlocked":true,"piiRisk":"high"}'::jsonb,
    '{"defaultAction":"monitor_only"}'::jsonb,
    'needs_config'
  ),
  (
    'tiktok_research',
    'social_video',
    'TikTok Research',
    true,
    false,
    'monitor_only',
    'official_research_api',
    true,
    '{"keywordSearch":true,"researchQuery":true}'::jsonb,
    '["account","content","shop"]'::jsonb,
    '["direct","hidden"]'::jsonb,
    '{}'::jsonb,
    '{"requiresApplicationApproval":true,"commercialUseRestricted":true,"piiRisk":"high"}'::jsonb,
    '{"defaultAction":"monitor_only"}'::jsonb,
    'needs_config'
  )
on conflict (provider_id) do update
set
  provider_kind = excluded.provider_kind,
  display_name = excluded.display_name,
  discovery_supported = excluded.discovery_supported,
  ingestion_supported = excluded.ingestion_supported,
  promotion_mode = excluded.promotion_mode,
  access_mode = excluded.access_mode,
  auth_required = excluded.auth_required,
  query_primitives_json = excluded.query_primitives_json,
  object_types_json = excluded.object_types_json,
  signal_modes_json = excluded.signal_modes_json,
  rate_limit_json = excluded.rate_limit_json,
  compliance_json = excluded.compliance_json,
  provider_card_json = excluded.provider_card_json,
  status = excluded.status,
  updated_at = now();

insert into discovery_provider_health (provider_id, status)
select
  provider_id,
  case when status = 'needs_config' then 'disabled' else 'healthy' end
from discovery_provider_capabilities
on conflict (provider_id) do nothing;

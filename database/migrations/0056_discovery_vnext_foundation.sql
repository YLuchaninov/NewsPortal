-- Discovery vNext foundation. The follow-up hard cutover migrations make
-- vNext the only active Discovery schema; older migrations remain history only.

create table if not exists discovery_artifacts (
  artifact_id uuid primary key default gen_random_uuid(),
  artifact_type text not null,
  schema_version text not null default '1.0',
  run_id uuid references discovery_runs(run_id) on delete set null,
  interest_id uuid null,
  candidate_id uuid null,
  parent_artifact_ids uuid[] not null default '{}',
  created_by text not null,
  creator_model text null,
  memory_mode text null,
  lens text null,
  policy_version text null,
  status text not null default 'generated',
  payload_json jsonb not null,
  validation_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint discovery_artifacts_type_check
    check (artifact_type in (
      'DiscoveryBrief',
      'HypothesisBatch',
      'ProbePlan',
      'ProbeReport',
      'SourceUnderstanding',
      'RoutingDecision',
      'QueryQualityReport'
    )),
  constraint discovery_artifacts_status_check
    check (status in ('draft', 'generated', 'validated', 'rejected', 'superseded', 'applied', 'expired')),
  constraint discovery_artifacts_memory_mode_check
    check (memory_mode is null or memory_mode in ('blind', 'thin', 'gap_only', 'locale', 'artifact_lens', 'adversarial', 'full'))
);

create index if not exists discovery_artifacts_run_idx
  on discovery_artifacts(run_id, created_at desc)
  where run_id is not null;

create index if not exists discovery_artifacts_interest_idx
  on discovery_artifacts(interest_id, created_at desc)
  where interest_id is not null;

create index if not exists discovery_artifacts_candidate_idx
  on discovery_artifacts(candidate_id, created_at desc)
  where candidate_id is not null;

create index if not exists discovery_artifacts_type_status_idx
  on discovery_artifacts(artifact_type, status, created_at desc);

create table if not exists discovery_candidates (
  candidate_id uuid primary key default gen_random_uuid(),
  run_id uuid references discovery_runs(run_id) on delete set null,
  interest_id uuid null,
  hypothesis_artifact_id uuid references discovery_artifacts(artifact_id) on delete set null,
  query_quality_artifact_id uuid references discovery_artifacts(artifact_id) on delete set null,
  canonical_url text not null,
  canonical_domain text not null,
  candidate_kind_guess text not null default 'unknown',
  acquisition_json jsonb not null default '{}'::jsonb,
  rediscovery_count integer not null default 1,
  status text not null default 'new',
  duplicate_of_candidate_id uuid references discovery_candidates(candidate_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint discovery_candidates_status_check
    check (status in ('new', 'duplicate', 'probe_planned', 'probed', 'routed', 'rejected')),
  constraint discovery_candidates_rediscovery_check
    check (rediscovery_count >= 1)
);

create index if not exists discovery_candidates_domain_idx
  on discovery_candidates(canonical_domain, created_at desc);

create index if not exists discovery_candidates_interest_idx
  on discovery_candidates(interest_id, created_at desc)
  where interest_id is not null;

create unique index if not exists discovery_candidates_run_url_idx
  on discovery_candidates(run_id, canonical_url)
  where run_id is not null;

create table if not exists source_inventory (
  source_inventory_id uuid primary key default gen_random_uuid(),
  canonical_domain text not null,
  canonical_url text not null,
  source_identity_key text not null,
  current_state text not null default 'inventory',
  current_provider_type text null,
  latest_source_understanding_artifact_id uuid references discovery_artifacts(artifact_id) on delete set null,
  latest_routing_decision_artifact_id uuid references discovery_artifacts(artifact_id) on delete set null,
  registered_channel_id uuid null,
  monitoring_policy_json jsonb not null default '{}'::jsonb,
  risk_json jsonb not null default '{}'::jsonb,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint source_inventory_state_check
    check (current_state in (
      'inventory',
      'inventory_low_priority',
      'cheap_watch',
      'probation_channel',
      'stable_channel',
      'manual_review',
      'adapter_backlog',
      'blocked',
      'rejected_structural'
    )),
  constraint source_inventory_provider_check
    check (current_provider_type is null or current_provider_type in ('rss', 'website', 'api', 'email_imap', 'document_portal', 'search', 'unknown'))
);

create unique index if not exists source_inventory_identity_idx
  on source_inventory(source_identity_key);

create index if not exists source_inventory_state_idx
  on source_inventory(current_state, updated_at desc);

create table if not exists source_monitoring_state (
  source_inventory_id uuid primary key references source_inventory(source_inventory_id) on delete cascade,
  monitoring_mode text not null,
  effective_poll_interval_seconds integer null,
  next_due_at timestamptz null,
  last_checked_at timestamptz null,
  last_changed_at timestamptz null,
  consecutive_failures integer not null default 0,
  change_cursor_json jsonb not null default '{}'::jsonb,
  health_json jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint source_monitoring_mode_check
    check (monitoring_mode in ('cheap_watch', 'probation', 'stable', 'paused')),
  constraint source_monitoring_failures_check
    check (consecutive_failures >= 0)
);

create index if not exists source_monitoring_due_idx
  on source_monitoring_state(next_due_at)
  where next_due_at is not null and monitoring_mode in ('cheap_watch', 'probation', 'stable');

create table if not exists source_observations (
  observation_id uuid primary key default gen_random_uuid(),
  source_inventory_id uuid not null references source_inventory(source_inventory_id) on delete cascade,
  observed_at timestamptz not null default now(),
  observation_kind text not null,
  observation_json jsonb not null,
  related_resource_id uuid null,
  related_channel_fetch_run_id uuid null,
  constraint source_observations_kind_check
    check (observation_kind in ('fetch_health', 'content_change', 'artifact_sample', 'blocker', 'risk_signal'))
);

create index if not exists source_observations_source_time_idx
  on source_observations(source_inventory_id, observed_at desc);

create table if not exists discovery_policies (
  policy_id uuid primary key default gen_random_uuid(),
  policy_name text not null,
  policy_version text not null,
  policy_type text not null,
  status text not null default 'draft',
  definition_json jsonb not null,
  created_by text not null,
  created_at timestamptz not null default now(),
  activated_at timestamptz null,
  constraint discovery_policies_type_check
    check (policy_type in ('routing', 'probe', 'mega_loop', 'risk', 'rollback', 'permissions')),
  constraint discovery_policies_status_check
    check (status in ('draft', 'active', 'archived'))
);

create unique index if not exists discovery_policies_name_version_idx
  on discovery_policies(policy_name, policy_version);

create unique index if not exists discovery_policies_active_idx
  on discovery_policies(policy_name, policy_type)
  where status = 'active';

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
    'discovery-routing',
    'vnext-1',
    'routing',
    'active',
    '{
      "inventoryThreshold": 0.15,
      "cheapWatchThreshold": 0.35,
      "autoRegisterThreshold": 0.72,
      "minTechnicalObservability": 0.55,
      "minConfidence": 0.65,
      "maxAutoRisk": 0.35,
      "maxWatchRisk": 0.60,
      "yieldIndependent": true,
      "accessPatternPolicies": {
        "public": {"defaultAction": "cheap_watch"},
        "requires_browser": {"defaultAction": "manual_review", "allowAutoWatch": true, "allowAutoRegister": false},
        "requires_auth": {"defaultAction": "adapter_backlog", "allowAutoRegister": false},
        "captcha_blocked": {"defaultAction": "blocked", "allowAutoRegister": false}
      },
      "providerPolicies": {
        "rss": {"autoRegisterThreshold": 0.65, "minTechnicalObservability": 0.75, "allowProbation": true},
        "website": {"autoRegisterThreshold": 0.75, "minTechnicalObservability": 0.65, "allowProbation": true},
        "api": {"defaultAction": "adapter_backlog"}
      },
      "probation": {"enabled": true, "pollsBeforeStable": 5, "maxFailedPolls": 3},
      "rollback": {"batchRollbackEnabled": true, "sampleReviewPercent": 5}
    }'::jsonb,
    'migration:0056_discovery_vnext_foundation',
    now()
  ),
  (
    'discovery-probe',
    'vnext-1',
    'probe',
    'active',
    '{
      "defaultStrategy": "cheap_static_first",
      "maxRequests": 10,
      "maxBrowserRequests": 0,
      "timeoutMs": 10000,
      "sameOriginOnly": true,
      "disallowedActions": ["login", "captcha_bypass", "cookie_replay", "stealth_scraping"]
    }'::jsonb,
    'migration:0056_discovery_vnext_foundation',
    now()
  ),
  (
    'discovery-mega-loop',
    'vnext-1',
    'mega_loop',
    'active',
    '{
      "maxBatchesPerRun": 12,
      "maxHypothesesPerBatch": 20,
      "maxCandidatesPerHypothesis": 25,
      "maxProbeRequests": 300,
      "maxBrowserProbes": 0,
      "maxLLMCalls": 40,
      "maxRunCostCents": 0,
      "maxRunDurationMinutes": 20,
      "memoryModes": ["blind", "thin", "gap_only", "locale", "artifact_lens", "adversarial"]
    }'::jsonb,
    'migration:0056_discovery_vnext_foundation',
    now()
  )
on conflict (policy_name, policy_version) do nothing;

create table if not exists adapter_backlog (
  adapter_backlog_id uuid primary key default gen_random_uuid(),
  source_inventory_id uuid references source_inventory(source_inventory_id) on delete set null,
  candidate_id uuid references discovery_candidates(candidate_id) on delete set null,
  adapter_need text not null,
  reason_json jsonb not null,
  priority text not null default 'normal',
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint adapter_backlog_need_check
    check (adapter_need in ('api_key', 'custom_adapter', 'auth_config', 'parser', 'browser_support', 'unsupported_format')),
  constraint adapter_backlog_priority_check
    check (priority in ('low', 'normal', 'high')),
  constraint adapter_backlog_status_check
    check (status in ('open', 'planned', 'implemented', 'rejected', 'closed'))
);

create index if not exists adapter_backlog_status_idx
  on adapter_backlog(status, priority, created_at desc);

create table if not exists discovery_feedback_events (
  feedback_id uuid primary key default gen_random_uuid(),
  target_type text not null,
  target_id uuid not null,
  feedback_type text not null,
  feedback_json jsonb not null default '{}'::jsonb,
  created_by text not null,
  created_at timestamptz not null default now(),
  constraint discovery_feedback_target_type_check
    check (target_type in ('artifact', 'candidate', 'source_inventory', 'routing_decision', 'policy')),
  constraint discovery_feedback_type_check
    check (feedback_type in ('approve', 'reject', 'correct', 'rollback', 'mark_noise', 'mark_useful', 'policy_issue'))
);

create index if not exists discovery_feedback_target_idx
  on discovery_feedback_events(target_type, target_id, created_at desc);

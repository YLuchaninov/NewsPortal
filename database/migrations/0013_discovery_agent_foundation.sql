create table if not exists discovery_missions (
  mission_id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  source_kind text not null default 'interest_template',
  source_ref_id uuid references interest_templates (interest_template_id) on delete set null,
  topics text[] not null default '{}'::text[],
  languages text[] not null default '{}'::text[],
  regions text[] not null default '{}'::text[],
  target_provider_types text[] not null default '{rss,website}'::text[],
  max_hypotheses integer not null default 10,
  max_sources integer not null default 20,
  budget_cents integer not null default 0,
  spent_cents integer not null default 0,
  status text not null default 'planned',
  auto_approve_threshold double precision,
  priority integer not null default 0,
  run_count integer not null default 0,
  last_run_at timestamptz,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint discovery_missions_source_kind_check
    check (source_kind in ('interest_template', 'manual')),
  constraint discovery_missions_status_check
    check (status in ('planned', 'active', 'completed', 'paused', 'failed')),
  constraint discovery_missions_max_hypotheses_check
    check (max_hypotheses > 0),
  constraint discovery_missions_max_sources_check
    check (max_sources > 0),
  constraint discovery_missions_budget_cents_check
    check (budget_cents >= 0),
  constraint discovery_missions_spent_cents_check
    check (spent_cents >= 0),
  constraint discovery_missions_auto_approve_threshold_check
    check (
      auto_approve_threshold is null
      or (auto_approve_threshold >= 0 and auto_approve_threshold <= 1)
    )
);

create index if not exists discovery_missions_status_idx
  on discovery_missions (status, priority desc, created_at desc);

create index if not exists discovery_missions_source_ref_idx
  on discovery_missions (source_ref_id)
  where source_ref_id is not null;

create table if not exists discovery_hypotheses (
  hypothesis_id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references discovery_missions (mission_id) on delete cascade,
  strategy_type text not null,
  search_query text,
  target_urls text[] not null default '{}'::text[],
  target_provider_type text not null default 'rss',
  parameters jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  sequence_run_id uuid references sequence_runs (run_id) on delete set null,
  sources_found integer not null default 0,
  sources_approved integer not null default 0,
  effectiveness double precision,
  execution_cost_cents integer not null default 0,
  error_text text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  constraint discovery_hypotheses_target_provider_type_check
    check (target_provider_type in ('rss', 'website')),
  constraint discovery_hypotheses_status_check
    check (status in ('pending', 'running', 'completed', 'failed', 'skipped')),
  constraint discovery_hypotheses_sources_found_check
    check (sources_found >= 0),
  constraint discovery_hypotheses_sources_approved_check
    check (sources_approved >= 0),
  constraint discovery_hypotheses_execution_cost_cents_check
    check (execution_cost_cents >= 0),
  constraint discovery_hypotheses_effectiveness_check
    check (effectiveness is null or (effectiveness >= 0 and effectiveness <= 1))
);

create index if not exists discovery_hypotheses_mission_idx
  on discovery_hypotheses (mission_id, created_at desc);

create index if not exists discovery_hypotheses_status_idx
  on discovery_hypotheses (status, created_at desc);

create index if not exists discovery_hypotheses_strategy_idx
  on discovery_hypotheses (strategy_type, created_at desc);

create table if not exists discovery_candidates (
  candidate_id uuid primary key default gen_random_uuid(),
  hypothesis_id uuid not null references discovery_hypotheses (hypothesis_id) on delete cascade,
  mission_id uuid not null references discovery_missions (mission_id) on delete cascade,
  url text not null,
  final_url text,
  title text,
  description text,
  provider_type text not null default 'rss',
  is_valid boolean,
  relevance_score double precision,
  llm_assessment jsonb,
  sample_data jsonb,
  status text not null default 'pending',
  rejection_reason text,
  registered_channel_id uuid references source_channels (channel_id) on delete set null,
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint discovery_candidates_provider_type_check
    check (provider_type in ('rss', 'website')),
  constraint discovery_candidates_status_check
    check (status in ('pending', 'approved', 'rejected', 'auto_approved', 'duplicate')),
  constraint discovery_candidates_relevance_score_check
    check (relevance_score is null or (relevance_score >= 0 and relevance_score <= 1))
);

create index if not exists discovery_candidates_hypothesis_idx
  on discovery_candidates (hypothesis_id, created_at desc);

create index if not exists discovery_candidates_mission_idx
  on discovery_candidates (mission_id, created_at desc);

create index if not exists discovery_candidates_status_idx
  on discovery_candidates (status, created_at desc);

create unique index if not exists discovery_candidates_url_mission_unique
  on discovery_candidates (url, mission_id);

create table if not exists discovery_cost_log (
  cost_log_id uuid primary key default gen_random_uuid(),
  mission_id uuid references discovery_missions (mission_id) on delete set null,
  hypothesis_id uuid references discovery_hypotheses (hypothesis_id) on delete set null,
  operation text not null,
  provider text not null,
  cost_cents integer not null default 0,
  input_tokens integer,
  output_tokens integer,
  request_count integer not null default 1,
  metadata jsonb,
  created_at timestamptz not null default now(),
  constraint discovery_cost_log_cost_cents_check
    check (cost_cents >= 0),
  constraint discovery_cost_log_input_tokens_check
    check (input_tokens is null or input_tokens >= 0),
  constraint discovery_cost_log_output_tokens_check
    check (output_tokens is null or output_tokens >= 0),
  constraint discovery_cost_log_request_count_check
    check (request_count >= 0)
);

create index if not exists discovery_cost_log_mission_idx
  on discovery_cost_log (mission_id, created_at desc)
  where mission_id is not null;

create index if not exists discovery_cost_log_hypothesis_idx
  on discovery_cost_log (hypothesis_id, created_at desc)
  where hypothesis_id is not null;

create index if not exists discovery_cost_log_created_idx
  on discovery_cost_log (created_at desc);

insert into sequences (
  sequence_id,
  title,
  description,
  task_graph,
  status,
  cron,
  tags,
  created_by
)
values
  (
    '0a8e8ec5-6cab-4d8b-9c28-0a1d6245bf17',
    'Discovery Agent Orchestrator',
    'Draft top-level sequence for discovery mission planning, execution and evaluation.',
    jsonb_build_array(
      jsonb_build_object(
        'key', 'plan_hypotheses',
        'module', 'discovery.plan_hypotheses',
        'options', jsonb_build_object()
      ),
      jsonb_build_object(
        'key', 'execute_hypotheses',
        'module', 'discovery.execute_hypotheses',
        'options', jsonb_build_object()
      ),
      jsonb_build_object(
        'key', 'evaluate_results',
        'module', 'discovery.evaluate_results',
        'options', jsonb_build_object()
      )
    ),
    'draft',
    '0 */6 * * *',
    array['discovery', 'agent', 'orchestrator'],
    'migration:0013_discovery_agent_foundation'
  ),
  (
    '1cb1bfec-d42b-4607-a8f0-8e3f671f0978',
    'Discovery RSS Pipeline',
    'Draft reusable RSS discovery child sequence.',
    jsonb_build_array(
      jsonb_build_object(
        'key', 'search',
        'module', 'discovery.web_search',
        'options', jsonb_build_object(
          'query_field', 'search_query',
          'count', 20,
          'type', 'web'
        )
      ),
      jsonb_build_object(
        'key', 'validate',
        'module', 'discovery.url_validator',
        'options', jsonb_build_object(
          'urls_field', 'search_results',
          'deny_patterns', jsonb_build_array('facebook\\.com', 'instagram\\.com', 'twitter\\.com', 'reddit\\.com')
        )
      ),
      jsonb_build_object(
        'key', 'probe',
        'module', 'discovery.rss_probe',
        'options', jsonb_build_object(
          'urls_field', 'validated_urls',
          'only_rss_candidates', false,
          'sample_count', 3
        )
      ),
      jsonb_build_object(
        'key', 'sample',
        'module', 'discovery.content_sampler',
        'options', jsonb_build_object(
          'sources_field', 'probed_feeds',
          'article_count', 3,
          'max_chars', 2000
        )
      ),
      jsonb_build_object(
        'key', 'score',
        'module', 'discovery.relevance_scorer',
        'options', jsonb_build_object(
          'sources_field', 'sampled_content',
          'target_topics_field', 'target_topics',
          'threshold', 0.3
        )
      ),
      jsonb_build_object(
        'key', 'analyze',
        'module', 'discovery.llm_analyzer',
        'options', jsonb_build_object(
          'task', 'discovery_source_evaluation',
          'payload_field', 'sampled_content',
          'output_field', 'llm_analysis'
        )
      ),
      jsonb_build_object(
        'key', 'register_preview',
        'module', 'discovery.source_registrar',
        'options', jsonb_build_object(
          'sources_field', 'scored_sources',
          'dry_run', true,
          'provider_type', 'rss'
        )
      )
    ),
    'draft',
    null,
    array['discovery', 'pipeline', 'rss'],
    'migration:0013_discovery_agent_foundation'
  ),
  (
    'c7e0a3a2-8f0c-4a76-bf35-fd7d1f44774d',
    'Discovery Website Pipeline',
    'Draft reusable website discovery child sequence.',
    jsonb_build_array(
      jsonb_build_object(
        'key', 'search',
        'module', 'discovery.web_search',
        'options', jsonb_build_object(
          'query_field', 'search_query',
          'count', 20,
          'type', 'news'
        )
      ),
      jsonb_build_object(
        'key', 'validate',
        'module', 'discovery.url_validator',
        'options', jsonb_build_object(
          'urls_field', 'search_results',
          'deny_patterns', jsonb_build_array('facebook\\.com', 'instagram\\.com', 'twitter\\.com', 'reddit\\.com')
        )
      ),
      jsonb_build_object(
        'key', 'probe',
        'module', 'discovery.website_probe',
        'options', jsonb_build_object(
          'urls_field', 'validated_urls',
          'sample_count', 5
        )
      ),
      jsonb_build_object(
        'key', 'sample',
        'module', 'discovery.content_sampler',
        'options', jsonb_build_object(
          'sources_field', 'probed_websites',
          'article_count', 3,
          'max_chars', 2000
        )
      ),
      jsonb_build_object(
        'key', 'score',
        'module', 'discovery.relevance_scorer',
        'options', jsonb_build_object(
          'sources_field', 'sampled_content',
          'target_topics_field', 'target_topics',
          'threshold', 0.3
        )
      ),
      jsonb_build_object(
        'key', 'analyze',
        'module', 'discovery.llm_analyzer',
        'options', jsonb_build_object(
          'task', 'discovery_website_evaluation',
          'payload_field', 'sampled_content',
          'output_field', 'llm_analysis'
        )
      ),
      jsonb_build_object(
        'key', 'register_preview',
        'module', 'discovery.source_registrar',
        'options', jsonb_build_object(
          'sources_field', 'scored_sources',
          'dry_run', true,
          'provider_type', 'website'
        )
      )
    ),
    'draft',
    null,
    array['discovery', 'pipeline', 'website'],
    'migration:0013_discovery_agent_foundation'
  )
on conflict (sequence_id) do nothing;

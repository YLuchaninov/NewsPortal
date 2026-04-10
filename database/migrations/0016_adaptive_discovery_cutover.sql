drop table if exists discovery_feedback_events cascade;
drop table if exists discovery_portfolio_snapshots cascade;
drop table if exists discovery_source_interest_scores cascade;
drop table if exists discovery_source_profiles cascade;
drop table if exists discovery_strategy_stats cascade;
drop table if exists discovery_cost_log cascade;
drop table if exists discovery_candidates cascade;
drop table if exists discovery_hypotheses cascade;
drop table if exists discovery_hypothesis_classes cascade;
drop table if exists discovery_missions cascade;

create table discovery_missions (
  mission_id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  source_kind text not null default 'manual',
  source_ref_id uuid references interest_templates (interest_template_id) on delete set null,
  seed_topics text[] not null default '{}'::text[],
  seed_languages text[] not null default '{}'::text[],
  seed_regions text[] not null default '{}'::text[],
  target_provider_types text[] not null default '{rss,website}'::text[],
  interest_graph jsonb,
  interest_graph_status text not null default 'pending',
  interest_graph_version integer not null default 0,
  interest_graph_compiled_at timestamptz,
  interest_graph_error_text text,
  max_hypotheses integer not null default 12,
  max_sources integer not null default 20,
  budget_cents integer not null default 0,
  spent_cents integer not null default 0,
  status text not null default 'planned',
  priority integer not null default 0,
  run_count integer not null default 0,
  last_run_at timestamptz,
  latest_portfolio_snapshot_id uuid,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint discovery_missions_source_kind_check
    check (source_kind in ('interest_template', 'manual')),
  constraint discovery_missions_interest_graph_status_check
    check (interest_graph_status in ('pending', 'compiled', 'failed')),
  constraint discovery_missions_interest_graph_version_check
    check (interest_graph_version >= 0),
  constraint discovery_missions_status_check
    check (status in ('planned', 'active', 'paused', 'completed', 'failed')),
  constraint discovery_missions_max_hypotheses_check
    check (max_hypotheses > 0),
  constraint discovery_missions_max_sources_check
    check (max_sources > 0),
  constraint discovery_missions_budget_cents_check
    check (budget_cents >= 0),
  constraint discovery_missions_spent_cents_check
    check (spent_cents >= 0)
);

create index discovery_missions_status_idx
  on discovery_missions (status, priority desc, updated_at desc, created_at desc);

create index discovery_missions_source_ref_idx
  on discovery_missions (source_ref_id)
  where source_ref_id is not null;

create index discovery_missions_interest_graph_status_idx
  on discovery_missions (interest_graph_status, updated_at desc);

create table discovery_hypothesis_classes (
  class_key text primary key,
  display_name text not null,
  description text,
  status text not null default 'active',
  generation_backend text not null,
  default_provider_types text[] not null default '{rss,website}'::text[],
  prompt_instructions text,
  seed_rules_json jsonb not null default '{}'::jsonb,
  max_per_mission integer not null default 3,
  sort_order integer not null default 0,
  config_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint discovery_hypothesis_classes_status_check
    check (status in ('draft', 'active', 'archived')),
  constraint discovery_hypothesis_classes_generation_backend_check
    check (generation_backend in ('graph_seed_llm', 'graph_seed_only')),
  constraint discovery_hypothesis_classes_max_per_mission_check
    check (max_per_mission > 0)
);

create index discovery_hypothesis_classes_status_idx
  on discovery_hypothesis_classes (status, sort_order asc, class_key asc);

create table discovery_hypotheses (
  hypothesis_id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references discovery_missions (mission_id) on delete cascade,
  class_key text not null references discovery_hypothesis_classes (class_key) on delete restrict,
  tactic_key text not null,
  search_query text,
  target_urls text[] not null default '{}'::text[],
  target_provider_type text not null default 'rss',
  generation_context jsonb not null default '{}'::jsonb,
  expected_value text,
  status text not null default 'pending',
  sequence_run_id uuid references sequence_runs (run_id) on delete set null,
  sources_found integer not null default 0,
  sources_approved integer not null default 0,
  effectiveness double precision,
  execution_cost_cents integer not null default 0,
  execution_cost_usd numeric(12,6) not null default 0,
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
  constraint discovery_hypotheses_effectiveness_check
    check (effectiveness is null or (effectiveness >= 0 and effectiveness <= 1)),
  constraint discovery_hypotheses_execution_cost_cents_check
    check (execution_cost_cents >= 0),
  constraint discovery_hypotheses_execution_cost_usd_check
    check (execution_cost_usd >= 0)
);

create index discovery_hypotheses_mission_idx
  on discovery_hypotheses (mission_id, created_at desc);

create index discovery_hypotheses_status_idx
  on discovery_hypotheses (status, created_at desc);

create index discovery_hypotheses_class_idx
  on discovery_hypotheses (class_key, tactic_key, created_at desc);

create unique index discovery_hypotheses_mission_intent_unique
  on discovery_hypotheses (mission_id, class_key, tactic_key, search_query);

create table discovery_source_profiles (
  source_profile_id uuid primary key default gen_random_uuid(),
  candidate_id uuid,
  channel_id uuid references source_channels (channel_id) on delete set null,
  canonical_domain text not null,
  source_type text not null default 'unknown',
  org_name text,
  country text,
  languages text[] not null default '{}'::text[],
  ownership_transparency double precision not null default 0,
  author_accountability double precision not null default 0,
  source_linking_quality double precision not null default 0,
  historical_stability double precision not null default 0,
  technical_quality double precision not null default 0,
  spam_signals double precision not null default 0,
  trust_score double precision not null default 0,
  extraction_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint discovery_source_profiles_trust_score_check
    check (trust_score >= 0 and trust_score <= 1)
);

create unique index discovery_source_profiles_domain_unique
  on discovery_source_profiles (canonical_domain);

create index discovery_source_profiles_channel_idx
  on discovery_source_profiles (channel_id)
  where channel_id is not null;

create table discovery_candidates (
  candidate_id uuid primary key default gen_random_uuid(),
  hypothesis_id uuid not null references discovery_hypotheses (hypothesis_id) on delete cascade,
  mission_id uuid not null references discovery_missions (mission_id) on delete cascade,
  source_profile_id uuid references discovery_source_profiles (source_profile_id) on delete set null,
  url text not null,
  final_url text,
  title text,
  description text,
  provider_type text not null default 'rss',
  is_valid boolean,
  relevance_score double precision,
  evaluation_json jsonb not null default '{}'::jsonb,
  llm_assessment jsonb not null default '{}'::jsonb,
  sample_data jsonb not null default '[]'::jsonb,
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

create index discovery_candidates_hypothesis_idx
  on discovery_candidates (hypothesis_id, created_at desc);

create index discovery_candidates_mission_idx
  on discovery_candidates (mission_id, created_at desc);

create index discovery_candidates_status_idx
  on discovery_candidates (status, created_at desc);

create unique index discovery_candidates_url_mission_unique
  on discovery_candidates (url, mission_id);

alter table discovery_source_profiles
  add constraint discovery_source_profiles_candidate_fk
  foreign key (candidate_id) references discovery_candidates (candidate_id) on delete set null;

create table discovery_source_interest_scores (
  score_id uuid primary key default gen_random_uuid(),
  source_profile_id uuid not null references discovery_source_profiles (source_profile_id) on delete cascade,
  channel_id uuid references source_channels (channel_id) on delete set null,
  mission_id uuid not null references discovery_missions (mission_id) on delete cascade,
  topic_coverage double precision not null default 0,
  specificity double precision not null default 0,
  audience_fit double precision not null default 0,
  evidence_depth double precision not null default 0,
  signal_to_noise double precision not null default 0,
  fit_score double precision not null default 0,
  novelty_score double precision not null default 0,
  lead_time_score double precision not null default 0,
  yield_score double precision not null default 0,
  duplication_score double precision not null default 0,
  contextual_score double precision not null default 0,
  role_labels text[] not null default '{}'::text[],
  scoring_breakdown jsonb not null default '{}'::jsonb,
  scoring_period_days integer not null default 30,
  scored_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint discovery_source_interest_scores_contextual_check
    check (contextual_score >= 0 and contextual_score <= 1)
);

create unique index discovery_source_interest_scores_current_unique
  on discovery_source_interest_scores (mission_id, source_profile_id);

create index discovery_source_interest_scores_contextual_idx
  on discovery_source_interest_scores (mission_id, contextual_score desc, scored_at desc);

create table discovery_portfolio_snapshots (
  snapshot_id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references discovery_missions (mission_id) on delete cascade,
  snapshot_reason text not null default 'run',
  ranked_sources jsonb not null default '[]'::jsonb,
  gaps_json jsonb not null default '[]'::jsonb,
  summary_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index discovery_portfolio_snapshots_mission_idx
  on discovery_portfolio_snapshots (mission_id, created_at desc);

alter table discovery_missions
  add constraint discovery_missions_latest_portfolio_snapshot_fk
  foreign key (latest_portfolio_snapshot_id) references discovery_portfolio_snapshots (snapshot_id) on delete set null;

create table discovery_feedback_events (
  feedback_event_id uuid primary key default gen_random_uuid(),
  mission_id uuid references discovery_missions (mission_id) on delete cascade,
  candidate_id uuid references discovery_candidates (candidate_id) on delete cascade,
  source_profile_id uuid references discovery_source_profiles (source_profile_id) on delete cascade,
  feedback_type text not null,
  feedback_value text,
  notes text,
  created_by text,
  created_at timestamptz not null default now()
);

create index discovery_feedback_events_mission_idx
  on discovery_feedback_events (mission_id, created_at desc)
  where mission_id is not null;

create table discovery_strategy_stats (
  strategy_stat_id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references discovery_missions (mission_id) on delete cascade,
  class_key text not null references discovery_hypothesis_classes (class_key) on delete cascade,
  tactic_key text not null,
  trials integer not null default 0,
  successes integer not null default 0,
  alpha double precision not null default 1,
  beta double precision not null default 1,
  last_effectiveness double precision,
  last_selected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint discovery_strategy_stats_trials_check
    check (trials >= 0),
  constraint discovery_strategy_stats_successes_check
    check (successes >= 0),
  constraint discovery_strategy_stats_alpha_check
    check (alpha > 0),
  constraint discovery_strategy_stats_beta_check
    check (beta > 0)
);

create unique index discovery_strategy_stats_unique
  on discovery_strategy_stats (mission_id, class_key, tactic_key);

create table discovery_cost_log (
  cost_log_id uuid primary key default gen_random_uuid(),
  mission_id uuid references discovery_missions (mission_id) on delete set null,
  hypothesis_id uuid references discovery_hypotheses (hypothesis_id) on delete set null,
  operation text not null,
  provider text not null,
  cost_usd numeric(12,6) not null default 0,
  cost_cents integer not null default 0,
  input_tokens integer,
  output_tokens integer,
  request_count integer not null default 1,
  metadata jsonb,
  created_at timestamptz not null default now(),
  constraint discovery_cost_log_cost_usd_check
    check (cost_usd >= 0),
  constraint discovery_cost_log_cost_cents_check
    check (cost_cents >= 0),
  constraint discovery_cost_log_input_tokens_check
    check (input_tokens is null or input_tokens >= 0),
  constraint discovery_cost_log_output_tokens_check
    check (output_tokens is null or output_tokens >= 0),
  constraint discovery_cost_log_request_count_check
    check (request_count >= 0)
);

create index discovery_cost_log_mission_idx
  on discovery_cost_log (mission_id, created_at desc)
  where mission_id is not null;

create index discovery_cost_log_hypothesis_idx
  on discovery_cost_log (hypothesis_id, created_at desc)
  where hypothesis_id is not null;

create index discovery_cost_log_created_idx
  on discovery_cost_log (created_at desc);

insert into discovery_hypothesis_classes (
  class_key,
  display_name,
  description,
  status,
  generation_backend,
  default_provider_types,
  prompt_instructions,
  seed_rules_json,
  max_per_mission,
  sort_order,
  config_json
)
values
  (
    'lexical',
    'Lexical',
    'Synonyms, jargon, localized phrasing and term variants for the mission graph.',
    'active',
    'graph_seed_llm',
    '{rss,website}'::text[],
    'Expand lexical variants from the graph core topic, subtopics, positive signals and ambiguities.',
    '{"seedFields":["core_topic","subtopics","positive_signals","ambiguities"],"tactics":["synonym","jargon","localized"]}'::jsonb,
    3,
    10,
    '{}'::jsonb
  ),
  (
    'facet',
    'Facet',
    'Search by aspects of the topic such as who, what, where, event types and leading signals.',
    'active',
    'graph_seed_llm',
    '{rss,website}'::text[],
    'Expand graph facets into balanced aspect-oriented search tactics.',
    '{"seedFields":["core_topic","subtopics","event_types","geos"],"tactics":["what","who","where","events","signals"]}'::jsonb,
    3,
    20,
    '{}'::jsonb
  ),
  (
    'actor',
    'Actor',
    'Search through entities, organizations, experts, regulators and other concrete actors.',
    'active',
    'graph_seed_llm',
    '{website}'::text[],
    'Use graph entities, organizations and people to derive actor-led discovery hypotheses.',
    '{"seedFields":["entities","organizations","people"],"tactics":["entity","organization","person","regulator"]}'::jsonb,
    3,
    30,
    '{}'::jsonb
  ),
  (
    'source_type',
    'Source Type',
    'Search by source medium such as news, blogs, docs, github or registries.',
    'active',
    'graph_seed_llm',
    '{rss,website}'::text[],
    'Combine graph source types and the core topic into media-type-specific hypotheses.',
    '{"seedFields":["source_types","core_topic"],"tactics":["news","blog","docs","github","registry","forum","newsletter"]}'::jsonb,
    3,
    40,
    '{}'::jsonb
  ),
  (
    'evidence_chain',
    'Evidence Chain',
    'Search for primary sources, citing sources, aggregators and analyst amplification.',
    'active',
    'graph_seed_llm',
    '{website}'::text[],
    'Generate hypotheses that trace evidence chains from original sources to citing outlets.',
    '{"seedFields":["core_topic","entities","event_types"],"tactics":["primary","citing","aggregator","analyst"]}'::jsonb,
    3,
    50,
    '{}'::jsonb
  ),
  (
    'contrarian',
    'Contrarian',
    'Search for skeptical, niche, local or early-signal sources around the mission graph.',
    'active',
    'graph_seed_llm',
    '{website}'::text[],
    'Use exclusions, ambiguities and gaps to derive contrarian and early-signal hypotheses.',
    '{"seedFields":["core_topic","exclusions","ambiguities","geos"],"tactics":["skeptic","niche","local","early_signal"]}'::jsonb,
    2,
    60,
    '{}'::jsonb
  )
on conflict (class_key) do update
set
  display_name = excluded.display_name,
  description = excluded.description,
  status = excluded.status,
  generation_backend = excluded.generation_backend,
  default_provider_types = excluded.default_provider_types,
  prompt_instructions = excluded.prompt_instructions,
  seed_rules_json = excluded.seed_rules_json,
  max_per_mission = excluded.max_per_mission,
  sort_order = excluded.sort_order,
  config_json = excluded.config_json,
  updated_at = now();

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
    'Adaptive Discovery Orchestrator',
    'Graph-first adaptive discovery orchestrator for planning, execution, evaluation and re-evaluation.',
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
      ),
      jsonb_build_object(
        'key', 're_evaluate_sources',
        'module', 'discovery.re_evaluate_sources',
        'options', jsonb_build_object()
      )
    ),
    'draft',
    '0 */6 * * *',
    array['discovery', 'adaptive', 'agent', 'orchestrator'],
    'migration:0016_adaptive_discovery_cutover'
  ),
  (
    '1cb1bfec-d42b-4607-a8f0-8e3f671f0978',
    'Adaptive Discovery RSS Pipeline',
    'Reusable RSS discovery child sequence for adaptive discovery hypotheses.',
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
    array['discovery', 'adaptive', 'pipeline', 'rss'],
    'migration:0016_adaptive_discovery_cutover'
  ),
  (
    'c7e0a3a2-8f0c-4a76-bf35-fd7d1f44774d',
    'Adaptive Discovery Website Pipeline',
    'Reusable website discovery child sequence for adaptive discovery hypotheses.',
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
    array['discovery', 'adaptive', 'pipeline', 'website'],
    'migration:0016_adaptive_discovery_cutover'
  )
on conflict (sequence_id) do update
set
  title = excluded.title,
  description = excluded.description,
  task_graph = excluded.task_graph,
  status = excluded.status,
  cron = excluded.cron,
  tags = excluded.tags,
  created_by = excluded.created_by;

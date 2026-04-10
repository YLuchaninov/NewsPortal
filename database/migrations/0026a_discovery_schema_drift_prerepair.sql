create table if not exists discovery_hypothesis_classes (
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

create index if not exists discovery_hypothesis_classes_status_idx
  on discovery_hypothesis_classes (status, sort_order asc, class_key asc);

create table if not exists discovery_source_profiles (
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

create unique index if not exists discovery_source_profiles_domain_unique
  on discovery_source_profiles (canonical_domain);

create index if not exists discovery_source_profiles_channel_idx
  on discovery_source_profiles (channel_id)
  where channel_id is not null;

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
select
  orphaned.class_key,
  initcap(replace(orphaned.class_key, '_', ' ')),
  'Recovered placeholder class created by 0026a_discovery_schema_drift_prerepair.',
  'active',
  'graph_seed_only',
  '{rss,website}'::text[],
  'Recovered placeholder class created during schema drift pre-repair.',
  '{}'::jsonb,
  1,
  999,
  jsonb_build_object('repair_migration', '0026a_discovery_schema_drift_prerepair')
from (
  select distinct class_key
  from discovery_hypotheses
  where class_key is not null
) as orphaned
left join discovery_hypothesis_classes existing
  on existing.class_key = orphaned.class_key
where existing.class_key is null;

update discovery_candidates as candidate
set source_profile_id = null
where source_profile_id is not null
  and not exists (
    select 1
    from discovery_source_profiles as profile
    where profile.source_profile_id = candidate.source_profile_id
  );

update discovery_source_profiles as profile
set candidate_id = null
where candidate_id is not null
  and not exists (
    select 1
    from discovery_candidates as candidate
    where candidate.candidate_id = profile.candidate_id
  );

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'discovery_hypotheses_class_key_fkey'
  ) then
    alter table discovery_hypotheses
      add constraint discovery_hypotheses_class_key_fkey
      foreign key (class_key) references discovery_hypothesis_classes (class_key) on delete restrict;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'discovery_candidates_source_profile_id_fkey'
  ) then
    alter table discovery_candidates
      add constraint discovery_candidates_source_profile_id_fkey
      foreign key (source_profile_id) references discovery_source_profiles (source_profile_id) on delete set null;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'discovery_source_profiles_candidate_fk'
  ) then
    alter table discovery_source_profiles
      add constraint discovery_source_profiles_candidate_fk
      foreign key (candidate_id) references discovery_candidates (candidate_id) on delete set null;
  end if;
end
$$;

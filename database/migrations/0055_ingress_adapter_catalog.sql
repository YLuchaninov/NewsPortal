create table if not exists ingress_adapter_catalog (
  adapter_key text primary key,
  title text not null,
  description text not null default '',
  runtime_kind text not null,
  provider_type text not null,
  output_mode text not null,
  status text not null default 'active',
  priority integer not null default 100,
  match_rules_json jsonb not null default '{}'::jsonb,
  config_schema_json jsonb not null default '{}'::jsonb,
  recipe_json jsonb,
  module_name text,
  metadata_json jsonb not null default '{}'::jsonb,
  is_system boolean not null default false,
  editable boolean not null default true,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ingress_adapter_catalog_runtime_check
    check (runtime_kind in ('declarative', 'builtin')),
  constraint ingress_adapter_catalog_provider_check
    check (provider_type in ('rss', 'website', 'api', 'email_imap', 'youtube')),
  constraint ingress_adapter_catalog_output_check
    check (output_mode in ('articles', 'web_resources', 'mixed')),
  constraint ingress_adapter_catalog_status_check
    check (status in ('active', 'draft', 'disabled', 'archived')),
  constraint ingress_adapter_catalog_priority_check
    check (priority >= 0),
  constraint ingress_adapter_catalog_match_rules_object_check
    check (jsonb_typeof(match_rules_json) = 'object'),
  constraint ingress_adapter_catalog_config_schema_object_check
    check (jsonb_typeof(config_schema_json) = 'object'),
  constraint ingress_adapter_catalog_recipe_object_check
    check (recipe_json is null or jsonb_typeof(recipe_json) = 'object'),
  constraint ingress_adapter_catalog_metadata_object_check
    check (jsonb_typeof(metadata_json) = 'object')
);

create index if not exists ingress_adapter_catalog_provider_idx
  on ingress_adapter_catalog (provider_type, status);

create index if not exists ingress_adapter_catalog_runtime_idx
  on ingress_adapter_catalog (runtime_kind, status);

create table if not exists source_channel_adapter_binding (
  channel_id uuid primary key references source_channels (channel_id) on delete cascade,
  adapter_key text not null references ingress_adapter_catalog (adapter_key),
  config_json jsonb not null default '{}'::jsonb,
  selection_mode text not null default 'manual',
  enabled boolean not null default true,
  selected_by text,
  selection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint source_channel_adapter_binding_mode_check
    check (selection_mode in ('manual', 'mcp', 'auto', 'migration', 'builtin_default')),
  constraint source_channel_adapter_binding_config_object_check
    check (jsonb_typeof(config_json) = 'object')
);

create index if not exists source_channel_adapter_binding_adapter_idx
  on source_channel_adapter_binding (adapter_key);

alter table channel_fetch_runs
  add column if not exists adapter_key text,
  add column if not exists adapter_runtime_kind text,
  add column if not exists adapter_selection_mode text;

create index if not exists channel_fetch_runs_adapter_started_idx
  on channel_fetch_runs (adapter_key, started_at desc)
  where adapter_key is not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'channel_fetch_runs_adapter_runtime_kind_check'
  ) then
    alter table channel_fetch_runs
      add constraint channel_fetch_runs_adapter_runtime_kind_check
        check (
          adapter_runtime_kind is null
          or adapter_runtime_kind in ('declarative', 'builtin')
        );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'channel_fetch_runs_adapter_selection_mode_check'
  ) then
    alter table channel_fetch_runs
      add constraint channel_fetch_runs_adapter_selection_mode_check
        check (
          adapter_selection_mode is null
          or adapter_selection_mode in ('manual', 'mcp', 'auto', 'migration', 'builtin_default', 'legacy_config', 'provider_default')
        );
  end if;
end $$;

insert into ingress_adapter_catalog (
  adapter_key,
  title,
  description,
  runtime_kind,
  provider_type,
  output_mode,
  priority,
  match_rules_json,
  config_schema_json,
  recipe_json,
  module_name,
  metadata_json,
  is_system,
  editable,
  created_by
)
values
  ('rss.generic', 'Generic RSS/Atom/JSON Feed', 'Parses ordinary RSS, Atom and JSON Feed sources through the existing fetchers feed parser.', 'builtin', 'rss', 'articles', 10, '{"allowAutoSelect":true}'::jsonb, '{}'::jsonb, null, 'builtin.rss.generic', '{"legacy":{"rssAdapterStrategy":"generic"}}'::jsonb, true, false, 'migration'),
  ('rss.reddit_search_rss', 'Reddit Search RSS', 'Normalizes Reddit search RSS/Atom results while preserving Reddit permalink provenance.', 'builtin', 'rss', 'articles', 140, '{"urlHostContains":["reddit.com"],"urlPathContains":["search.rss"],"allowAutoSelect":true}'::jsonb, '{}'::jsonb, null, 'builtin.rss.reddit_search_rss', '{"sourceRole":"community_search","legacy":{"rssAdapterStrategy":"reddit_search_rss"}}'::jsonb, true, false, 'migration'),
  ('rss.hn_comments_feed', 'Hacker News Comments Feed', 'Normalizes hnrss.org discussion feeds, drops pure comment updates and preserves discussion provenance.', 'builtin', 'rss', 'articles', 140, '{"urlHostContains":["hnrss.org"],"allowAutoSelect":true}'::jsonb, '{}'::jsonb, null, 'builtin.rss.hn_comments_feed', '{"sourceRole":"community_search","legacy":{"rssAdapterStrategy":"hn_comments_feed"}}'::jsonb, true, false, 'migration'),
  ('rss.google_news_rss', 'Google News RSS', 'Resolves Google News RSS wrapper URLs to publisher URLs when possible.', 'builtin', 'rss', 'articles', 150, '{"urlHostContains":["news.google.com"],"urlPathContains":["/rss"],"allowAutoSelect":true}'::jsonb, '{}'::jsonb, null, 'builtin.rss.google_news_rss', '{"sourceRole":"indirect_aggregator","legacy":{"rssAdapterStrategy":"google_news_rss"}}'::jsonb, true, false, 'migration'),
  ('rss.weworkremotely_jobs', 'We Work Remotely RSS', 'Compatibility catalog row for We Work Remotely job-feed ingestion when represented as RSS.', 'builtin', 'rss', 'articles', 120, '{"urlHostContains":["weworkremotely.com"],"allowAutoSelect":true}'::jsonb, '{}'::jsonb, null, 'builtin.rss.weworkremotely_jobs', '{"sourceRole":"remote_job_board","legacy":{"apiAdapterKey":"weworkremotely_rss"}}'::jsonb, true, false, 'migration'),
  ('website.generic_discovery', 'Generic Website Discovery', 'Uses the existing website provider to discover and persist first-class web resources.', 'builtin', 'website', 'web_resources', 10, '{"allowAutoSelect":true}'::jsonb, '{}'::jsonb, null, 'builtin.website.generic_discovery', '{"sourceRole":"rss_web"}'::jsonb, true, false, 'migration'),
  ('email_imap.generic_mailbox', 'Generic IMAP Mailbox', 'Polls an IMAP mailbox through the existing email provider and emits article drafts.', 'builtin', 'email_imap', 'articles', 10, '{"allowAutoSelect":true}'::jsonb, '{}'::jsonb, null, 'builtin.email_imap.generic_mailbox', '{}'::jsonb, true, false, 'migration'),
  ('api.generic_json_mapping', 'Generic JSON API Mapping', 'Maps JSON endpoint items into article drafts using the existing bounded API channel mapping configuration.', 'declarative', 'api', 'articles', 20, '{"contentType":["application/json"],"allowAutoSelect":false}'::jsonb, '{"type":"object","additionalProperties":true}'::jsonb, '{"runtime":"existing_api_channel_mapping"}'::jsonb, 'declarative.api.generic_json_mapping', '{"legacy":{"genericApiMapping":true}}'::jsonb, true, false, 'migration'),
  ('api.hn_algolia_search', 'HN Algolia Search API', 'Public Hacker News search API adapter.', 'builtin', 'api', 'articles', 180, '{"urlHostContains":["hn.algolia.com"],"allowAutoSelect":true}'::jsonb, '{}'::jsonb, null, 'builtin.api.hn_algolia_search', '{"sourceRole":"community_search","researchMode":"production","legacy":{"apiAdapterKey":"hn_algolia_search"}}'::jsonb, true, false, 'migration'),
  ('api.github_issues_search', 'GitHub Issues Search API', 'GitHub issue search adapter for implementation blockers, paid feature asks and project signals.', 'builtin', 'api', 'articles', 180, '{"urlHostContains":["api.github.com"],"urlPathContains":["/search/issues"],"allowAutoSelect":true}'::jsonb, '{}'::jsonb, null, 'builtin.api.github_issues_search', '{"sourceRole":"community_search","researchMode":"production","legacy":{"apiAdapterKey":"github_issues_search"}}'::jsonb, true, false, 'migration'),
  ('api.stack_exchange_search', 'Stack Exchange API Search', 'Stack Exchange search adapter for technical questions and implementation signals.', 'builtin', 'api', 'articles', 180, '{"urlHostContains":["api.stackexchange.com"],"allowAutoSelect":true}'::jsonb, '{}'::jsonb, null, 'builtin.api.stack_exchange_search', '{"sourceRole":"community_search","researchMode":"production","legacy":{"apiAdapterKey":"stack_exchange_search"}}'::jsonb, true, false, 'migration'),
  ('api.ddgs_search', 'DDGS Search', 'Direct DDGS search adapter for bounded research-only acquisition.', 'builtin', 'api', 'articles', 80, '{"allowAutoSelect":false}'::jsonb, '{}'::jsonb, null, 'builtin.api.ddgs_search', '{"sourceRole":"indirect_aggregator","researchMode":"research_only","risk":{"researchOnly":true,"tosRisk":"unknown"},"legacy":{"apiAdapterKey":"ddgs_search"}}'::jsonb, true, false, 'migration'),
  ('api.searxng_search', 'SearXNG Search', 'SearXNG search adapter for indirect aggregator acquisition.', 'builtin', 'api', 'articles', 90, '{"allowAutoSelect":false}'::jsonb, '{}'::jsonb, null, 'builtin.api.searxng_search', '{"sourceRole":"indirect_aggregator","researchMode":"research_only","legacy":{"apiAdapterKey":"searxng_search"}}'::jsonb, true, false, 'migration'),
  ('api.brave_search', 'Brave Search API', 'Brave search adapter requiring operator-provided API access.', 'builtin', 'api', 'articles', 90, '{"allowAutoSelect":false}'::jsonb, '{}'::jsonb, null, 'builtin.api.brave_search', '{"sourceRole":"indirect_aggregator","researchMode":"research_only","risk":{"requiresAuth":true},"legacy":{"apiAdapterKey":"brave_search"}}'::jsonb, true, false, 'migration'),
  ('api.tavily_search', 'Tavily Search API', 'Tavily search adapter requiring operator-provided API access.', 'builtin', 'api', 'articles', 90, '{"allowAutoSelect":false}'::jsonb, '{}'::jsonb, null, 'builtin.api.tavily_search', '{"sourceRole":"indirect_aggregator","researchMode":"research_only","risk":{"requiresAuth":true},"legacy":{"apiAdapterKey":"tavily_search"}}'::jsonb, true, false, 'migration'),
  ('api.exa_search', 'Exa Search API', 'Exa search adapter requiring operator-provided API access.', 'builtin', 'api', 'articles', 90, '{"allowAutoSelect":false}'::jsonb, '{}'::jsonb, null, 'builtin.api.exa_search', '{"sourceRole":"indirect_aggregator","researchMode":"research_only","risk":{"requiresAuth":true},"legacy":{"apiAdapterKey":"exa_search"}}'::jsonb, true, false, 'migration'),
  ('api.serpapi_google_news_research', 'SerpAPI Google News Research', 'SerpAPI-powered Google News research adapter.', 'builtin', 'api', 'articles', 90, '{"allowAutoSelect":false}'::jsonb, '{}'::jsonb, null, 'builtin.api.serpapi_google_news_research', '{"sourceRole":"indirect_aggregator","researchMode":"research_only","risk":{"requiresAuth":true},"legacy":{"apiAdapterKey":"serpapi_google_news_research"}}'::jsonb, true, false, 'migration'),
  ('api.discourse_search', 'Discourse Search', 'Public Discourse search adapter for forum/support community signals.', 'builtin', 'api', 'articles', 150, '{"allowAutoSelect":true}'::jsonb, '{}'::jsonb, null, 'builtin.api.discourse_search', '{"sourceRole":"forum_support","researchMode":"production","legacy":{"apiAdapterKey":"discourse_search"}}'::jsonb, true, false, 'migration'),
  ('api.greenhouse_job_board', 'Greenhouse Job Board API', 'Public Greenhouse job board API adapter.', 'builtin', 'api', 'articles', 180, '{"urlHostContains":["greenhouse.io","boards-api.greenhouse.io"],"allowAutoSelect":true}'::jsonb, '{}'::jsonb, null, 'builtin.api.greenhouse_job_board', '{"sourceRole":"ats_job_board","researchMode":"production","legacy":{"apiAdapterKey":"greenhouse_job_board"}}'::jsonb, true, false, 'migration'),
  ('api.lever_postings', 'Lever Postings API', 'Public Lever postings API adapter.', 'builtin', 'api', 'articles', 180, '{"urlHostContains":["api.lever.co"],"allowAutoSelect":true}'::jsonb, '{}'::jsonb, null, 'builtin.api.lever_postings', '{"sourceRole":"ats_job_board","researchMode":"production","legacy":{"apiAdapterKey":"lever_postings"}}'::jsonb, true, false, 'migration'),
  ('api.ashby_job_postings', 'Ashby Public Job Posting API', 'Public Ashby job-board API adapter.', 'builtin', 'api', 'articles', 180, '{"urlHostContains":["api.ashbyhq.com"],"allowAutoSelect":true}'::jsonb, '{}'::jsonb, null, 'builtin.api.ashby_job_postings', '{"sourceRole":"ats_job_board","researchMode":"production","legacy":{"apiAdapterKey":"ashby_job_postings"}}'::jsonb, true, false, 'migration'),
  ('api.remotive_jobs', 'Remotive Jobs API', 'Remotive remote jobs API adapter.', 'builtin', 'api', 'articles', 160, '{"urlHostContains":["remotive.com"],"allowAutoSelect":true}'::jsonb, '{}'::jsonb, null, 'builtin.api.remotive_jobs', '{"sourceRole":"remote_job_board","researchMode":"production","legacy":{"apiAdapterKey":"remotive_jobs"}}'::jsonb, true, false, 'migration'),
  ('api.remoteok_jobs', 'RemoteOK Jobs API', 'RemoteOK jobs adapter.', 'builtin', 'api', 'articles', 160, '{"urlHostContains":["remoteok.com"],"allowAutoSelect":true}'::jsonb, '{}'::jsonb, null, 'builtin.api.remoteok_jobs', '{"sourceRole":"remote_job_board","researchMode":"production","legacy":{"apiAdapterKey":"remoteok_jobs"}}'::jsonb, true, false, 'migration'),
  ('api.weworkremotely_rss', 'We Work Remotely RSS Compatibility', 'Compatibility alias for legacy API adapter key representing a We Work Remotely RSS source.', 'builtin', 'api', 'articles', 100, '{"urlHostContains":["weworkremotely.com"],"allowAutoSelect":true}'::jsonb, '{}'::jsonb, null, 'builtin.api.weworkremotely_rss', '{"sourceRole":"remote_job_board","researchMode":"production","compatibilityAliasFor":"rss.weworkremotely_jobs","legacy":{"apiAdapterKey":"weworkremotely_rss"}}'::jsonb, true, false, 'migration'),
  ('api.peopleperhour_public_projects_research', 'PeoplePerHour Public Projects Research', 'Research-only public project signal adapter.', 'builtin', 'api', 'articles', 60, '{"allowAutoSelect":false}'::jsonb, '{}'::jsonb, null, 'builtin.api.peopleperhour_public_projects_research', '{"sourceRole":"project_marketplace","researchMode":"research_only","risk":{"researchOnly":true},"legacy":{"apiAdapterKey":"peopleperhour_public_projects_research"}}'::jsonb, true, false, 'migration'),
  ('api.freelancer_public_projects_research', 'Freelancer Public Projects Research', 'Research-only public project signal adapter.', 'builtin', 'api', 'articles', 60, '{"allowAutoSelect":false}'::jsonb, '{}'::jsonb, null, 'builtin.api.freelancer_public_projects_research', '{"sourceRole":"project_marketplace","researchMode":"research_only","risk":{"researchOnly":true},"legacy":{"apiAdapterKey":"freelancer_public_projects_research"}}'::jsonb, true, false, 'migration'),
  ('api.guru_public_projects_research', 'Guru Public Projects Research', 'Research-only public project signal adapter.', 'builtin', 'api', 'articles', 60, '{"allowAutoSelect":false}'::jsonb, '{}'::jsonb, null, 'builtin.api.guru_public_projects_research', '{"sourceRole":"project_marketplace","researchMode":"research_only","risk":{"researchOnly":true},"legacy":{"apiAdapterKey":"guru_public_projects_research"}}'::jsonb, true, false, 'migration'),
  ('api.malt_public_projects_research', 'Malt Public Projects Research', 'Research-only public project signal adapter.', 'builtin', 'api', 'articles', 60, '{"allowAutoSelect":false}'::jsonb, '{}'::jsonb, null, 'builtin.api.malt_public_projects_research', '{"sourceRole":"project_marketplace","researchMode":"research_only","risk":{"researchOnly":true},"legacy":{"apiAdapterKey":"malt_public_projects_research"}}'::jsonb, true, false, 'migration'),
  ('api.contra_public_search_research', 'Contra Public Search Research', 'Research-only public search signal adapter.', 'builtin', 'api', 'articles', 60, '{"allowAutoSelect":false}'::jsonb, '{}'::jsonb, null, 'builtin.api.contra_public_search_research', '{"sourceRole":"project_marketplace","researchMode":"research_only","risk":{"researchOnly":true},"legacy":{"apiAdapterKey":"contra_public_search_research"}}'::jsonb, true, false, 'migration'),
  ('api.upwork_public_signal_research', 'Upwork Public Signal Research', 'Research-only public signal adapter; not auto-selected by default.', 'builtin', 'api', 'articles', 50, '{"allowAutoSelect":false}'::jsonb, '{}'::jsonb, null, 'builtin.api.upwork_public_signal_research', '{"sourceRole":"project_marketplace","researchMode":"research_only","risk":{"researchOnly":true,"tosRisk":"high"},"legacy":{"apiAdapterKey":"upwork_public_signal_research"}}'::jsonb, true, false, 'migration'),
  ('api.linkedin_public_signal_research', 'LinkedIn Public Signal Research', 'Research-only public signal adapter; not auto-selected by default.', 'builtin', 'api', 'articles', 50, '{"allowAutoSelect":false}'::jsonb, '{}'::jsonb, null, 'builtin.api.linkedin_public_signal_research', '{"sourceRole":"closed_professional_network","researchMode":"research_only","risk":{"researchOnly":true,"tosRisk":"high"},"legacy":{"apiAdapterKey":"linkedin_public_signal_research"}}'::jsonb, true, false, 'migration')
on conflict (adapter_key) do update
set
  title = excluded.title,
  description = excluded.description,
  runtime_kind = excluded.runtime_kind,
  provider_type = excluded.provider_type,
  output_mode = excluded.output_mode,
  priority = excluded.priority,
  match_rules_json = excluded.match_rules_json,
  config_schema_json = excluded.config_schema_json,
  recipe_json = excluded.recipe_json,
  module_name = excluded.module_name,
  metadata_json = excluded.metadata_json,
  is_system = excluded.is_system,
  editable = excluded.editable,
  updated_at = now();

insert into source_channel_adapter_binding (
  channel_id,
  adapter_key,
  config_json,
  selection_mode,
  selected_by,
  selection_reason
)
select
  channel_id,
  case
    when config_json ->> 'adapterStrategy' = 'reddit_search_rss' then 'rss.reddit_search_rss'
    when config_json ->> 'adapterStrategy' = 'hn_comments_feed' then 'rss.hn_comments_feed'
    when config_json ->> 'adapterStrategy' = 'google_news_rss' then 'rss.google_news_rss'
    when fetch_url ilike '%news.google.com/rss%' then 'rss.google_news_rss'
    when fetch_url ilike '%hnrss.org%' then 'rss.hn_comments_feed'
    when fetch_url ilike '%reddit.com/search.rss%' then 'rss.reddit_search_rss'
    when fetch_url ilike '%weworkremotely.com%' then 'rss.weworkremotely_jobs'
    else 'rss.generic'
  end,
  jsonb_strip_nulls(
    jsonb_build_object(
      'maxEntryAgeHours',
      case
        when jsonb_typeof(config_json -> 'maxEntryAgeHours') = 'number'
          then (config_json ->> 'maxEntryAgeHours')::integer
        when config_json ->> 'adapterStrategy' in ('reddit_search_rss', 'hn_comments_feed', 'google_news_rss')
          or fetch_url ilike '%news.google.com/rss%'
          or fetch_url ilike '%hnrss.org%'
          or fetch_url ilike '%reddit.com/search.rss%'
          then 168
        else null
      end
    )
  ),
  'migration',
  'migration',
  'Backfilled from legacy RSS adapterStrategy/fetch_url inference'
from source_channels
where provider_type = 'rss'
on conflict (channel_id) do update
set
  adapter_key = excluded.adapter_key,
  config_json = case
    when source_channel_adapter_binding.config_json = '{}'::jsonb
      then excluded.config_json
    else source_channel_adapter_binding.config_json
  end,
  enabled = true,
  updated_at = now()
where source_channel_adapter_binding.selection_mode in ('migration', 'builtin_default');

insert into source_channel_adapter_binding (
  channel_id,
  adapter_key,
  config_json,
  selection_mode,
  selected_by,
  selection_reason
)
select
  sc.channel_id,
  case
    when iac.adapter_key is not null then iac.adapter_key
    else 'api.generic_json_mapping'
  end,
  jsonb_strip_nulls(
    ((sc.config_json #- '{api,adapterKey}') #- '{adapter,adapterKey}') - 'adapterKey'
  ),
  'migration',
  'migration',
  'Backfilled from legacy API adapterKey or generic mapping config'
from source_channels sc
left join lateral (
  select
    'api.' || coalesce(
      sc.config_json #>> '{api,adapterKey}',
      sc.config_json #>> '{adapter,adapterKey}',
      sc.config_json #>> '{adapterKey}'
    ) as adapter_key
) legacy on true
left join ingress_adapter_catalog iac
  on iac.adapter_key = legacy.adapter_key
where sc.provider_type = 'api'
on conflict (channel_id) do update
set
  adapter_key = excluded.adapter_key,
  config_json = case
    when source_channel_adapter_binding.config_json = '{}'::jsonb
      then excluded.config_json
    else source_channel_adapter_binding.config_json
  end,
  enabled = true,
  updated_at = now()
where source_channel_adapter_binding.selection_mode in ('migration', 'builtin_default');

insert into source_channel_adapter_binding (
  channel_id,
  adapter_key,
  config_json,
  selection_mode,
  selected_by,
  selection_reason
)
select
  channel_id,
  'website.generic_discovery',
  '{}'::jsonb,
  'migration',
  'migration',
  'Default website discovery adapter'
from source_channels
where provider_type = 'website'
on conflict (channel_id) do update
set
  adapter_key = excluded.adapter_key,
  enabled = true,
  updated_at = now()
where source_channel_adapter_binding.selection_mode in ('migration', 'builtin_default');

insert into source_channel_adapter_binding (
  channel_id,
  adapter_key,
  config_json,
  selection_mode,
  selected_by,
  selection_reason
)
select
  channel_id,
  'email_imap.generic_mailbox',
  '{}'::jsonb,
  'migration',
  'migration',
  'Default IMAP mailbox adapter'
from source_channels
where provider_type = 'email_imap'
on conflict (channel_id) do update
set
  adapter_key = excluded.adapter_key,
  enabled = true,
  updated_at = now()
where source_channel_adapter_binding.selection_mode in ('migration', 'builtin_default');

create table discovery_recall_missions (
  recall_mission_id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  mission_kind text not null default 'manual',
  seed_domains text[] not null default '{}'::text[],
  seed_urls text[] not null default '{}'::text[],
  seed_queries text[] not null default '{}'::text[],
  target_provider_types text[] not null default '{rss,website,api,email_imap,youtube}'::text[],
  scope_json jsonb not null default '{}'::jsonb,
  status text not null default 'planned',
  max_candidates integer not null default 50,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint discovery_recall_missions_kind_check
    check (mission_kind in ('manual', 'domain_seed', 'query_seed')),
  constraint discovery_recall_missions_status_check
    check (status in ('planned', 'active', 'paused', 'completed', 'failed')),
  constraint discovery_recall_missions_max_candidates_check
    check (max_candidates > 0)
);

create index discovery_recall_missions_status_idx
  on discovery_recall_missions (status, updated_at desc, created_at desc);

create index discovery_recall_missions_kind_idx
  on discovery_recall_missions (mission_kind, updated_at desc, created_at desc);

create table discovery_recall_candidates (
  recall_candidate_id uuid primary key default gen_random_uuid(),
  recall_mission_id uuid not null references discovery_recall_missions (recall_mission_id) on delete cascade,
  source_profile_id uuid references discovery_source_profiles (source_profile_id) on delete set null,
  canonical_domain text not null,
  url text not null,
  final_url text,
  title text,
  description text,
  provider_type text not null default 'rss',
  status text not null default 'pending',
  quality_signal_source text not null default 'manual',
  evaluation_json jsonb not null default '{}'::jsonb,
  rejection_reason text,
  created_by text,
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint discovery_recall_candidates_provider_type_check
    check (provider_type in ('rss', 'website', 'api', 'email_imap', 'youtube')),
  constraint discovery_recall_candidates_status_check
    check (status in ('pending', 'shortlisted', 'rejected', 'duplicate')),
  constraint discovery_recall_candidates_quality_signal_source_check
    check (btrim(quality_signal_source) <> '')
);

create unique index discovery_recall_candidates_url_mission_unique
  on discovery_recall_candidates (recall_mission_id, url);

create index discovery_recall_candidates_mission_status_idx
  on discovery_recall_candidates (recall_mission_id, status, created_at desc);

create index discovery_recall_candidates_canonical_domain_idx
  on discovery_recall_candidates (canonical_domain, updated_at desc, created_at desc);

create index discovery_recall_candidates_source_profile_idx
  on discovery_recall_candidates (source_profile_id, updated_at desc)
  where source_profile_id is not null;

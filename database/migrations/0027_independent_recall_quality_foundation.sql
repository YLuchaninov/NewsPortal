create table discovery_source_quality_snapshots (
  snapshot_id uuid primary key default gen_random_uuid(),
  source_profile_id uuid not null references discovery_source_profiles (source_profile_id) on delete cascade,
  channel_id uuid references source_channels (channel_id) on delete set null,
  snapshot_reason text not null default 'runtime',
  trust_score double precision not null default 0,
  extraction_quality_score double precision not null default 0,
  stability_score double precision not null default 0,
  independence_score double precision not null default 0,
  freshness_score double precision not null default 0,
  lead_time_score double precision not null default 0,
  yield_score double precision not null default 0,
  duplication_score double precision not null default 0,
  recall_score double precision not null default 0,
  scoring_breakdown jsonb not null default '{}'::jsonb,
  scoring_period_days integer not null default 30,
  scored_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint discovery_source_quality_snapshots_recall_check
    check (recall_score >= 0 and recall_score <= 1),
  constraint discovery_source_quality_snapshots_period_check
    check (scoring_period_days > 0)
);

create unique index discovery_source_quality_snapshots_source_profile_unique
  on discovery_source_quality_snapshots (source_profile_id);

create index discovery_source_quality_snapshots_recall_idx
  on discovery_source_quality_snapshots (recall_score desc, scored_at desc);

create index discovery_source_quality_snapshots_channel_idx
  on discovery_source_quality_snapshots (channel_id, scored_at desc)
  where channel_id is not null;

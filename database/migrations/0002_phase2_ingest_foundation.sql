create table if not exists fetch_cursors (
  cursor_id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references source_channels (channel_id) on delete cascade,
  cursor_type text not null,
  cursor_value text,
  cursor_json jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint fetch_cursors_cursor_type_check
    check (
      cursor_type in (
        'etag',
        'timestamp',
        'api_page_token',
        'imap_uid',
        'youtube_page_token',
        'youtube_published_at'
      )
    ),
  constraint fetch_cursors_channel_cursor_type_unique
    unique (channel_id, cursor_type)
);

create table if not exists signal_candidates (
  doc_id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references source_channels (channel_id) on delete restrict,
  source_signal_candidate_id text,
  url text not null,
  content_format text not null default 'signal_candidate',
  published_at timestamptz not null,
  ingested_at timestamptz not null default now(),
  title text not null default '',
  lead text not null default '',
  body text not null default '',
  lang text,
  lang_confidence double precision,
  exact_hash text,
  simhash64 bigint,
  canonical_doc_id uuid references signal_candidates (doc_id) on delete set null,
  family_id uuid references signal_candidates (doc_id) on delete set null,
  event_cluster_id uuid,
  primary_media_asset_id uuid,
  has_media boolean not null default false,
  is_exact_duplicate boolean not null default false,
  is_near_duplicate boolean not null default false,
  visibility_state text not null default 'visible',
  processing_state text not null default 'raw',
  raw_payload_json jsonb not null default '{}'::jsonb,
  normalized_at timestamptz,
  deduped_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint signal_candidates_content_format_check
    check (content_format in ('signal_candidate', 'video_news', 'gallery', 'mixed')),
  constraint signal_candidates_visibility_state_check
    check (visibility_state in ('visible', 'blocked')),
  constraint signal_candidates_processing_state_check
    check (
      processing_state in (
        'raw',
        'normalized',
        'deduped',
        'embedded',
        'clustered',
        'matched',
        'notified'
      )
    )
);

create unique index if not exists signal_candidates_channel_source_signal_candidate_id_unique
  on signal_candidates (channel_id, source_signal_candidate_id)
  where source_signal_candidate_id is not null;

create unique index if not exists signal_candidates_channel_url_unique
  on signal_candidates (channel_id, url);

create index if not exists signal_candidates_channel_id_idx
  on signal_candidates (channel_id);

create index if not exists signal_candidates_published_at_idx
  on signal_candidates (published_at);

create index if not exists signal_candidates_visibility_state_published_at_idx
  on signal_candidates (visibility_state, published_at);

create index if not exists signal_candidates_exact_hash_idx
  on signal_candidates (exact_hash);

create index if not exists signal_candidates_simhash64_idx
  on signal_candidates (simhash64);

create index if not exists signal_candidates_event_cluster_id_idx
  on signal_candidates (event_cluster_id);

create index if not exists signal_candidates_family_id_idx
  on signal_candidates (family_id);

create index if not exists signal_candidates_canonical_doc_id_idx
  on signal_candidates (canonical_doc_id);

create index if not exists signal_candidates_processing_state_idx
  on signal_candidates (processing_state);

create table if not exists signal_candidate_external_refs (
  external_ref_id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references source_channels (channel_id) on delete cascade,
  external_signal_candidate_id text not null,
  doc_id uuid not null references signal_candidates (doc_id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint signal_candidate_external_refs_channel_external_signal_candidate_id_unique
    unique (channel_id, external_signal_candidate_id)
);

create index if not exists signal_candidate_external_refs_doc_id_idx
  on signal_candidate_external_refs (doc_id);

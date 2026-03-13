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

create table if not exists articles (
  doc_id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references source_channels (channel_id) on delete restrict,
  source_article_id text,
  url text not null,
  content_format text not null default 'article',
  published_at timestamptz not null,
  ingested_at timestamptz not null default now(),
  title text not null default '',
  lead text not null default '',
  body text not null default '',
  lang text,
  lang_confidence double precision,
  exact_hash text,
  simhash64 bigint,
  canonical_doc_id uuid references articles (doc_id) on delete set null,
  family_id uuid references articles (doc_id) on delete set null,
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
  constraint articles_content_format_check
    check (content_format in ('article', 'video_news', 'gallery', 'mixed')),
  constraint articles_visibility_state_check
    check (visibility_state in ('visible', 'blocked')),
  constraint articles_processing_state_check
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

create unique index if not exists articles_channel_source_article_id_unique
  on articles (channel_id, source_article_id)
  where source_article_id is not null;

create unique index if not exists articles_channel_url_unique
  on articles (channel_id, url);

create index if not exists articles_channel_id_idx
  on articles (channel_id);

create index if not exists articles_published_at_idx
  on articles (published_at);

create index if not exists articles_visibility_state_published_at_idx
  on articles (visibility_state, published_at);

create index if not exists articles_exact_hash_idx
  on articles (exact_hash);

create index if not exists articles_simhash64_idx
  on articles (simhash64);

create index if not exists articles_event_cluster_id_idx
  on articles (event_cluster_id);

create index if not exists articles_family_id_idx
  on articles (family_id);

create index if not exists articles_canonical_doc_id_idx
  on articles (canonical_doc_id);

create index if not exists articles_processing_state_idx
  on articles (processing_state);

create table if not exists article_external_refs (
  external_ref_id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references source_channels (channel_id) on delete cascade,
  external_article_id text not null,
  doc_id uuid not null references articles (doc_id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint article_external_refs_channel_external_article_id_unique
    unique (channel_id, external_article_id)
);

create index if not exists article_external_refs_doc_id_idx
  on article_external_refs (doc_id);

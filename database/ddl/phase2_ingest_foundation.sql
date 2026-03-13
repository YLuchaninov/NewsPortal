create extension if not exists pgcrypto;

create table if not exists roles (
  role_id uuid primary key default gen_random_uuid(),
  role_name text not null unique,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists users (
  user_id uuid primary key default gen_random_uuid(),
  auth_subject text not null,
  auth_provider text not null,
  email text,
  is_anonymous boolean not null default true,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint users_auth_provider_check
    check (auth_provider in ('firebase_anonymous', 'firebase_google', 'firebase_email_link', 'firebase_other')),
  constraint users_status_check
    check (status in ('active', 'disabled')),
  constraint users_auth_subject_unique
    unique (auth_provider, auth_subject)
);

create table if not exists user_profiles (
  user_id uuid primary key references users (user_id) on delete cascade,
  display_name text,
  timezone text,
  locale text,
  theme_preference text not null default 'system',
  notification_preferences jsonb not null default '{"web_push": true, "telegram": true, "weekly_email_digest": true}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_profiles_theme_preference_check
    check (theme_preference in ('light', 'dark', 'system'))
);

create table if not exists user_roles (
  user_id uuid not null references users (user_id) on delete cascade,
  role_id uuid not null references roles (role_id) on delete cascade,
  assigned_at timestamptz not null default now(),
  primary key (user_id, role_id)
);

create table if not exists source_channels (
  channel_id uuid primary key default gen_random_uuid(),
  provider_type text not null,
  name text not null,
  external_id text,
  fetch_url text,
  homepage_url text,
  config_json jsonb not null default '{}'::jsonb,
  country text,
  language text,
  is_active boolean not null default true,
  poll_interval_seconds integer not null default 300,
  last_fetch_at timestamptz,
  last_success_at timestamptz,
  last_error_at timestamptz,
  last_error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint source_channels_provider_type_check
    check (provider_type in ('rss', 'website', 'api', 'email_imap', 'youtube')),
  constraint source_channels_poll_interval_seconds_check
    check (poll_interval_seconds > 0)
);

create unique index if not exists source_channels_provider_external_id_unique
  on source_channels (provider_type, external_id)
  where external_id is not null;

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

create table if not exists outbox_events (
  event_id uuid primary key default gen_random_uuid(),
  event_type text not null,
  aggregate_type text not null,
  aggregate_id uuid not null,
  payload_json jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  published_at timestamptz,
  attempt_count integer not null default 0,
  error_message text,
  constraint outbox_events_status_check
    check (status in ('pending', 'published', 'failed')),
  constraint outbox_events_attempt_count_check
    check (attempt_count >= 0)
);

create index if not exists outbox_events_status_created_at_idx
  on outbox_events (status, created_at);

create table if not exists inbox_processed_events (
  consumer_name text not null,
  event_id uuid not null references outbox_events (event_id) on delete cascade,
  processed_at timestamptz not null default now(),
  primary key (consumer_name, event_id)
);

alter table articles
  add column if not exists search_vector tsvector;

alter table articles
  add column if not exists embedded_at timestamptz;

create index if not exists articles_search_vector_idx
  on articles
  using gin (search_vector);

create table if not exists article_features (
  doc_id uuid primary key references articles (doc_id) on delete cascade,
  numbers text[] not null default '{}'::text[],
  short_tokens text[] not null default '{}'::text[],
  places text[] not null default '{}'::text[],
  entities text[] not null default '{}'::text[],
  search_vector_version integer not null default 1,
  feature_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint article_features_search_vector_version_check
    check (search_vector_version > 0),
  constraint article_features_feature_version_check
    check (feature_version > 0)
);

create table if not exists criteria (
  criterion_id uuid primary key default gen_random_uuid(),
  description text not null default '',
  positive_texts jsonb not null default '[]'::jsonb,
  negative_texts jsonb not null default '[]'::jsonb,
  must_have_terms jsonb not null default '[]'::jsonb,
  must_not_have_terms jsonb not null default '[]'::jsonb,
  places jsonb not null default '[]'::jsonb,
  languages_allowed jsonb not null default '[]'::jsonb,
  time_window_hours integer not null default 168,
  short_tokens_required jsonb not null default '[]'::jsonb,
  short_tokens_forbidden jsonb not null default '[]'::jsonb,
  priority double precision not null default 1.0,
  enabled boolean not null default true,
  compiled boolean not null default false,
  compile_status text not null default 'pending',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint criteria_time_window_hours_check
    check (time_window_hours > 0),
  constraint criteria_compile_status_check
    check (compile_status in ('pending', 'queued', 'compiled', 'failed')),
  constraint criteria_version_check
    check (version > 0)
);

create index if not exists criteria_compile_status_idx
  on criteria (compile_status, updated_at desc);

create index if not exists criteria_enabled_idx
  on criteria (enabled);

create table if not exists user_interests (
  interest_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (user_id) on delete cascade,
  description text not null default '',
  positive_texts jsonb not null default '[]'::jsonb,
  negative_texts jsonb not null default '[]'::jsonb,
  must_have_terms jsonb not null default '[]'::jsonb,
  must_not_have_terms jsonb not null default '[]'::jsonb,
  places jsonb not null default '[]'::jsonb,
  languages_allowed jsonb not null default '[]'::jsonb,
  time_window_hours integer not null default 168,
  short_tokens_required jsonb not null default '[]'::jsonb,
  short_tokens_forbidden jsonb not null default '[]'::jsonb,
  notification_mode text not null default 'new_event_or_major_update',
  priority double precision not null default 1.0,
  enabled boolean not null default true,
  compiled boolean not null default false,
  compile_status text not null default 'pending',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_interests_time_window_hours_check
    check (time_window_hours > 0),
  constraint user_interests_notification_mode_check
    check (notification_mode in ('new_event_or_major_update')),
  constraint user_interests_compile_status_check
    check (compile_status in ('pending', 'queued', 'compiled', 'failed')),
  constraint user_interests_version_check
    check (version > 0)
);

create index if not exists user_interests_user_id_idx
  on user_interests (user_id);

create index if not exists user_interests_compile_status_idx
  on user_interests (compile_status, updated_at desc);

create index if not exists user_interests_enabled_idx
  on user_interests (enabled);

create table if not exists embedding_registry (
  embedding_id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  vector_type text not null,
  model_key text not null,
  vector_version integer not null default 1,
  dimensions integer not null,
  embedding_json jsonb not null default '[]'::jsonb,
  content_hash text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint embedding_registry_entity_type_check
    check (entity_type in ('article', 'interest', 'criterion', 'event_cluster')),
  constraint embedding_registry_vector_version_check
    check (vector_version > 0),
  constraint embedding_registry_dimensions_check
    check (dimensions > 0),
  constraint embedding_registry_entity_vector_content_unique
    unique (entity_type, entity_id, vector_type, content_hash)
);

create index if not exists embedding_registry_entity_idx
  on embedding_registry (entity_type, entity_id, vector_type);

create index if not exists embedding_registry_active_idx
  on embedding_registry (entity_type, vector_type, is_active);

create table if not exists criteria_compiled (
  criterion_id uuid primary key references criteria (criterion_id) on delete cascade,
  source_version integer not null,
  compile_status text not null default 'pending',
  source_snapshot_json jsonb not null default '{}'::jsonb,
  compiled_json jsonb not null default '{}'::jsonb,
  centroid_embedding_id uuid,
  compiled_at timestamptz,
  error_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint criteria_compiled_source_version_check
    check (source_version > 0),
  constraint criteria_compiled_status_check
    check (compile_status in ('pending', 'compiled', 'failed'))
);

create table if not exists user_interests_compiled (
  interest_id uuid primary key references user_interests (interest_id) on delete cascade,
  source_version integer not null,
  compile_status text not null default 'pending',
  source_snapshot_json jsonb not null default '{}'::jsonb,
  compiled_json jsonb not null default '{}'::jsonb,
  centroid_embedding_id uuid,
  compiled_at timestamptz,
  error_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_interests_compiled_source_version_check
    check (source_version > 0),
  constraint user_interests_compiled_status_check
    check (compile_status in ('pending', 'compiled', 'failed'))
);

create table if not exists article_vector_registry (
  article_vector_registry_id uuid primary key default gen_random_uuid(),
  doc_id uuid not null references articles (doc_id) on delete cascade,
  vector_type text not null,
  embedding_id uuid not null references embedding_registry (embedding_id) on delete cascade,
  hnsw_index_name text,
  hnsw_label integer,
  is_active boolean not null default true,
  vector_version integer not null default 1,
  updated_at timestamptz not null default now(),
  constraint article_vector_registry_vector_type_check
    check (vector_type in ('e_title', 'e_lead', 'e_body', 'e_event')),
  constraint article_vector_registry_vector_version_check
    check (vector_version > 0),
  constraint article_vector_registry_doc_vector_version_unique
    unique (doc_id, vector_type, vector_version)
);

create index if not exists article_vector_registry_doc_idx
  on article_vector_registry (doc_id, is_active);

create table if not exists interest_vector_registry (
  interest_vector_registry_id uuid primary key default gen_random_uuid(),
  interest_id uuid not null references user_interests (interest_id) on delete cascade,
  vector_type text not null,
  embedding_id uuid not null references embedding_registry (embedding_id) on delete cascade,
  hnsw_index_name text,
  hnsw_label integer,
  is_active boolean not null default true,
  vector_version integer not null default 1,
  updated_at timestamptz not null default now(),
  constraint interest_vector_registry_vector_version_check
    check (vector_version > 0),
  constraint interest_vector_registry_interest_vector_version_unique
    unique (interest_id, vector_type, vector_version)
);

create index if not exists interest_vector_registry_interest_idx
  on interest_vector_registry (interest_id, is_active);

create index if not exists interest_vector_registry_hnsw_idx
  on interest_vector_registry (hnsw_index_name, hnsw_label)
  where hnsw_index_name is not null;

create table if not exists event_vector_registry (
  event_vector_registry_id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  vector_type text not null,
  embedding_id uuid not null references embedding_registry (embedding_id) on delete cascade,
  hnsw_index_name text,
  hnsw_label integer,
  is_active boolean not null default true,
  vector_version integer not null default 1,
  updated_at timestamptz not null default now(),
  constraint event_vector_registry_entity_type_check
    check (entity_type in ('article', 'event_cluster')),
  constraint event_vector_registry_vector_version_check
    check (vector_version > 0),
  constraint event_vector_registry_entity_vector_version_unique
    unique (entity_type, entity_id, vector_type, vector_version)
);

create index if not exists event_vector_registry_entity_idx
  on event_vector_registry (entity_type, entity_id, is_active);

create table if not exists hnsw_registry (
  hnsw_registry_id uuid primary key default gen_random_uuid(),
  index_name text not null unique,
  model_key text not null,
  dimensions integer not null,
  vector_version integer not null default 1,
  active_index_path text,
  active_snapshot_path text,
  entry_count integer not null default 0,
  last_assigned_label integer not null default 0,
  is_dirty boolean not null default false,
  metadata_json jsonb not null default '{}'::jsonb,
  last_rebuilt_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hnsw_registry_dimensions_check
    check (dimensions > 0),
  constraint hnsw_registry_vector_version_check
    check (vector_version > 0),
  constraint hnsw_registry_entry_count_check
    check (entry_count >= 0),
  constraint hnsw_registry_last_assigned_label_check
    check (last_assigned_label >= 0)
);

create table if not exists event_clusters (
  cluster_id uuid primary key default gen_random_uuid(),
  centroid_embedding_id uuid,
  article_count integer not null default 0,
  primary_title text,
  top_entities text[] not null default '{}'::text[],
  top_places text[] not null default '{}'::text[],
  min_published_at timestamptz,
  max_published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_clusters_article_count_check
    check (article_count >= 0)
);

create table if not exists event_cluster_members (
  cluster_id uuid not null references event_clusters (cluster_id) on delete cascade,
  doc_id uuid not null references articles (doc_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (cluster_id, doc_id),
  constraint event_cluster_members_doc_unique
    unique (doc_id)
);

create table if not exists worker_leases (
  lease_name text primary key,
  owner_id text not null,
  expires_at timestamptz not null,
  metadata_json jsonb not null default '{}'::jsonb,
  acquired_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists reindex_jobs (
  reindex_job_id uuid primary key default gen_random_uuid(),
  index_name text not null,
  job_kind text not null default 'rebuild',
  requested_by_user_id uuid references users (user_id) on delete set null,
  status text not null default 'queued',
  options_json jsonb not null default '{}'::jsonb,
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  error_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reindex_jobs_job_kind_check
    check (job_kind in ('rebuild', 'repair', 'backfill')),
  constraint reindex_jobs_status_check
    check (status in ('queued', 'running', 'completed', 'failed'))
);

create index if not exists reindex_jobs_status_requested_at_idx
  on reindex_jobs (status, requested_at desc);

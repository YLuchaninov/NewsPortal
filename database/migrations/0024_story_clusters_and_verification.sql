alter table canonical_documents
  add column if not exists canonical_domain text;

create index if not exists canonical_documents_canonical_domain_idx
  on canonical_documents (canonical_domain);

update canonical_documents
set canonical_domain = nullif(
  regexp_replace(
    split_part(split_part(canonical_url, '//', 2), '/', 1),
    '^www\.',
    '',
    'i'
  ),
  ''
)
where canonical_url is not null
  and (canonical_domain is null or canonical_domain = '');

create table if not exists story_clusters (
  story_cluster_id uuid primary key default gen_random_uuid(),
  centroid_embedding_json jsonb not null default '[]'::jsonb,
  centroid_vector_version integer not null default 1,
  canonical_document_count integer not null default 0,
  observation_count integer not null default 0,
  source_family_count integer not null default 0,
  corroboration_count integer not null default 0,
  conflicting_signal_count integer not null default 0,
  verification_state text not null default 'weak',
  primary_title text,
  top_entities text[] not null default '{}'::text[],
  top_places text[] not null default '{}'::text[],
  min_published_at timestamptz,
  max_published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint story_clusters_centroid_embedding_json_is_array_check
    check (jsonb_typeof(centroid_embedding_json) = 'array'),
  constraint story_clusters_verification_state_check
    check (verification_state in ('weak', 'medium', 'strong', 'conflicting')),
  constraint story_clusters_canonical_document_count_check
    check (canonical_document_count >= 0),
  constraint story_clusters_observation_count_check
    check (observation_count >= 0),
  constraint story_clusters_source_family_count_check
    check (source_family_count >= 0),
  constraint story_clusters_corroboration_count_check
    check (corroboration_count >= 0),
  constraint story_clusters_conflicting_signal_count_check
    check (conflicting_signal_count >= 0)
);

create index if not exists story_clusters_max_published_at_idx
  on story_clusters (max_published_at desc);

create index if not exists story_clusters_verification_state_idx
  on story_clusters (verification_state);

create table if not exists story_cluster_members (
  story_cluster_id uuid not null references story_clusters (story_cluster_id) on delete cascade,
  canonical_document_id uuid not null references canonical_documents (canonical_document_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (story_cluster_id, canonical_document_id),
  constraint story_cluster_members_canonical_document_unique
    unique (canonical_document_id)
);

create index if not exists story_cluster_members_story_cluster_id_idx
  on story_cluster_members (story_cluster_id);

create table if not exists verification_results (
  verification_result_id uuid primary key default gen_random_uuid(),
  target_type text not null,
  target_id uuid not null,
  verification_state text not null default 'weak',
  corroboration_count integer not null default 0,
  source_family_count integer not null default 0,
  observation_count integer not null default 0,
  conflicting_signal_count integer not null default 0,
  rationale_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint verification_results_target_type_check
    check (target_type in ('canonical_document', 'story_cluster')),
  constraint verification_results_state_check
    check (verification_state in ('weak', 'medium', 'strong', 'conflicting')),
  constraint verification_results_corroboration_count_check
    check (corroboration_count >= 0),
  constraint verification_results_source_family_count_check
    check (source_family_count >= 0),
  constraint verification_results_observation_count_check
    check (observation_count >= 0),
  constraint verification_results_conflicting_signal_count_check
    check (conflicting_signal_count >= 0),
  constraint verification_results_rationale_json_is_object_check
    check (jsonb_typeof(rationale_json) = 'object'),
  constraint verification_results_target_unique
    unique (target_type, target_id)
);

create index if not exists verification_results_target_type_state_idx
  on verification_results (target_type, verification_state);

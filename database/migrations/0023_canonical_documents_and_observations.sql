create table if not exists canonical_documents (
  canonical_document_id uuid primary key references articles (doc_id) on delete cascade,
  content_kind text not null default 'editorial',
  content_format text not null default 'article',
  canonical_url text not null,
  title text not null default '',
  lead text not null default '',
  body text not null default '',
  lang text,
  lang_confidence double precision,
  exact_hash text,
  simhash64 bigint,
  source_name text,
  author_name text,
  published_at timestamptz,
  first_observed_at timestamptz not null default now(),
  last_observed_at timestamptz not null default now(),
  observation_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint canonical_documents_content_kind_check
    check (content_kind in ('editorial')),
  constraint canonical_documents_content_format_check
    check (content_format in ('article', 'video_news', 'gallery', 'mixed')),
  constraint canonical_documents_observation_count_check
    check (observation_count >= 0)
);

create index if not exists canonical_documents_published_at_idx
  on canonical_documents (published_at);

create index if not exists canonical_documents_last_observed_at_idx
  on canonical_documents (last_observed_at);

create table if not exists document_observations (
  observation_id uuid primary key default gen_random_uuid(),
  origin_type text not null default 'article',
  origin_id uuid not null references articles (doc_id) on delete cascade,
  channel_id uuid not null references source_channels (channel_id) on delete cascade,
  source_record_id text,
  observed_url text not null,
  published_at timestamptz,
  ingested_at timestamptz not null default now(),
  canonical_document_id uuid references canonical_documents (canonical_document_id) on delete set null,
  duplicate_kind text not null default 'pending',
  observation_state text not null default 'pending_canonicalization',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint document_observations_origin_type_check
    check (origin_type in ('article')),
  constraint document_observations_duplicate_kind_check
    check (duplicate_kind in ('pending', 'canonical', 'exact_duplicate', 'near_duplicate')),
  constraint document_observations_state_check
    check (observation_state in ('pending_canonicalization', 'canonicalized')),
  constraint document_observations_origin_unique
    unique (origin_type, origin_id)
);

create index if not exists document_observations_channel_id_idx
  on document_observations (channel_id);

create index if not exists document_observations_canonical_document_id_idx
  on document_observations (canonical_document_id);

create index if not exists document_observations_observation_state_idx
  on document_observations (observation_state);

insert into canonical_documents (
  canonical_document_id,
  content_kind,
  content_format,
  canonical_url,
  title,
  lead,
  body,
  lang,
  lang_confidence,
  exact_hash,
  simhash64,
  source_name,
  author_name,
  published_at,
  first_observed_at,
  last_observed_at,
  observation_count
)
select
  root.doc_id as canonical_document_id,
  'editorial' as content_kind,
  root.content_format,
  root.url as canonical_url,
  root.title,
  root.lead,
  root.body,
  root.lang,
  root.lang_confidence,
  root.exact_hash,
  root.simhash64,
  coalesce(root.extracted_source_name, sc.name) as source_name,
  root.extracted_author as author_name,
  root.published_at,
  coalesce(stats.first_observed_at, root.ingested_at, now()) as first_observed_at,
  coalesce(stats.last_observed_at, root.updated_at, root.ingested_at, now()) as last_observed_at,
  coalesce(stats.observation_count, 0) as observation_count
from articles root
join source_channels sc on sc.channel_id = root.channel_id
left join lateral (
  select
    min(a.ingested_at) as first_observed_at,
    max(a.ingested_at) as last_observed_at,
    count(*)::int as observation_count
  from articles a
  where coalesce(a.canonical_doc_id, a.doc_id) = root.doc_id
    and (
      a.deduped_at is not null
      or a.canonical_doc_id is not null
      or a.is_exact_duplicate = true
      or a.is_near_duplicate = true
    )
) stats on true
where exists (
  select 1
  from articles a
  where coalesce(a.canonical_doc_id, a.doc_id) = root.doc_id
    and (
      a.deduped_at is not null
      or a.canonical_doc_id is not null
      or a.is_exact_duplicate = true
      or a.is_near_duplicate = true
    )
)
on conflict (canonical_document_id) do update
set
  content_kind = excluded.content_kind,
  content_format = excluded.content_format,
  canonical_url = excluded.canonical_url,
  title = excluded.title,
  lead = excluded.lead,
  body = excluded.body,
  lang = excluded.lang,
  lang_confidence = excluded.lang_confidence,
  exact_hash = excluded.exact_hash,
  simhash64 = excluded.simhash64,
  source_name = excluded.source_name,
  author_name = excluded.author_name,
  published_at = excluded.published_at,
  first_observed_at = excluded.first_observed_at,
  last_observed_at = excluded.last_observed_at,
  observation_count = excluded.observation_count,
  updated_at = now();

insert into document_observations (
  origin_type,
  origin_id,
  channel_id,
  source_record_id,
  observed_url,
  published_at,
  ingested_at,
  canonical_document_id,
  duplicate_kind,
  observation_state
)
select
  'article' as origin_type,
  a.doc_id as origin_id,
  a.channel_id,
  a.source_article_id as source_record_id,
  a.url as observed_url,
  a.published_at,
  a.ingested_at,
  case
    when
      a.deduped_at is not null
      or a.canonical_doc_id is not null
      or a.is_exact_duplicate = true
      or a.is_near_duplicate = true
      or exists (
        select 1
        from canonical_documents cd
        where cd.canonical_document_id = a.doc_id
      )
    then coalesce(a.canonical_doc_id, a.doc_id)
    else null
  end as canonical_document_id,
  case
    when a.is_exact_duplicate = true then 'exact_duplicate'
    when a.is_near_duplicate = true then 'near_duplicate'
    when
      a.deduped_at is not null
      or a.canonical_doc_id is not null
      or exists (
        select 1
        from canonical_documents cd
        where cd.canonical_document_id = a.doc_id
      )
    then 'canonical'
    else 'pending'
  end as duplicate_kind,
  case
    when
      a.deduped_at is not null
      or a.canonical_doc_id is not null
      or a.is_exact_duplicate = true
      or a.is_near_duplicate = true
      or exists (
        select 1
        from canonical_documents cd
        where cd.canonical_document_id = a.doc_id
      )
    then 'canonicalized'
    else 'pending_canonicalization'
  end as observation_state
from articles a
on conflict (origin_type, origin_id) do update
set
  channel_id = excluded.channel_id,
  source_record_id = excluded.source_record_id,
  observed_url = excluded.observed_url,
  published_at = excluded.published_at,
  ingested_at = excluded.ingested_at,
  canonical_document_id = excluded.canonical_document_id,
  duplicate_kind = excluded.duplicate_kind,
  observation_state = excluded.observation_state,
  updated_at = now();

update canonical_documents cd
set
  first_observed_at = stats.first_observed_at,
  last_observed_at = stats.last_observed_at,
  observation_count = stats.observation_count,
  updated_at = now()
from (
  select
    canonical_document_id,
    min(ingested_at) as first_observed_at,
    max(ingested_at) as last_observed_at,
    count(*)::int as observation_count
  from document_observations
  where canonical_document_id is not null
  group by canonical_document_id
) stats
where cd.canonical_document_id = stats.canonical_document_id;

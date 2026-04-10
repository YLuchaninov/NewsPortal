alter table fetch_cursors
  drop constraint if exists fetch_cursors_cursor_type_check;

alter table fetch_cursors
  add constraint fetch_cursors_cursor_type_check
    check (
      cursor_type in (
        'etag',
        'timestamp',
        'lastmod',
        'set_diff',
        'content_hash',
        'api_page_token',
        'imap_uid',
        'youtube_page_token',
        'youtube_published_at'
      )
    );

create table if not exists crawl_policy_cache (
  domain text primary key,
  robots_txt_url text not null,
  robots_txt_body text,
  sitemap_urls text[] not null default '{}'::text[],
  feed_urls text[] not null default '{}'::text[],
  llms_txt_url text,
  llms_txt_body text,
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null,
  fetch_error text,
  http_status integer,
  constraint crawl_policy_cache_domain_check
    check (domain = lower(domain))
);

create index if not exists crawl_policy_cache_expires_idx
  on crawl_policy_cache (expires_at);

create table if not exists web_resources (
  resource_id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references source_channels (channel_id) on delete cascade,
  external_resource_id text not null,
  url text not null,
  normalized_url text not null,
  final_url text,
  resource_kind text not null default 'unknown',
  discovery_source text not null default 'website',
  parent_url text,
  freshness_marker_type text,
  freshness_marker_value text,
  published_at timestamptz,
  modified_at timestamptz,
  title text not null default '',
  summary text not null default '',
  body text,
  body_html text,
  lang text,
  lang_confidence double precision,
  content_hash text,
  classification_json jsonb not null default '{}'::jsonb,
  attributes_json jsonb not null default '{}'::jsonb,
  documents_json jsonb not null default '[]'::jsonb,
  media_json jsonb not null default '[]'::jsonb,
  links_out_json jsonb not null default '[]'::jsonb,
  child_resources_json jsonb not null default '[]'::jsonb,
  raw_payload_json jsonb not null default '{}'::jsonb,
  extraction_state text not null default 'pending',
  extraction_error text,
  projected_article_id uuid references articles (doc_id) on delete set null,
  discovered_at timestamptz not null default now(),
  enriched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint web_resources_resource_kind_check
    check (
      resource_kind in (
        'editorial',
        'listing',
        'entity',
        'document',
        'data_file',
        'api_payload',
        'unknown'
      )
    ),
  constraint web_resources_extraction_state_check
    check (extraction_state in ('pending', 'enriched', 'skipped', 'failed')),
  constraint web_resources_classification_json_is_object_check
    check (jsonb_typeof(classification_json) = 'object'),
  constraint web_resources_attributes_json_is_object_check
    check (jsonb_typeof(attributes_json) = 'object'),
  constraint web_resources_documents_json_is_array_check
    check (jsonb_typeof(documents_json) = 'array'),
  constraint web_resources_media_json_is_array_check
    check (jsonb_typeof(media_json) = 'array'),
  constraint web_resources_links_out_json_is_array_check
    check (jsonb_typeof(links_out_json) = 'array'),
  constraint web_resources_child_resources_json_is_array_check
    check (jsonb_typeof(child_resources_json) = 'array'),
  constraint web_resources_raw_payload_json_is_object_check
    check (jsonb_typeof(raw_payload_json) = 'object')
);

create unique index if not exists web_resources_channel_external_resource_id_unique
  on web_resources (channel_id, external_resource_id);

create unique index if not exists web_resources_channel_normalized_url_unique
  on web_resources (channel_id, normalized_url);

create index if not exists web_resources_channel_id_idx
  on web_resources (channel_id);

create index if not exists web_resources_resource_kind_idx
  on web_resources (resource_kind);

create index if not exists web_resources_extraction_state_idx
  on web_resources (extraction_state);

create index if not exists web_resources_projected_article_id_idx
  on web_resources (projected_article_id);

insert into sequences (
  sequence_id,
  title,
  description,
  task_graph,
  status,
  trigger_event,
  cron,
  max_runs,
  tags,
  created_by
)
values (
  '0f8e3894-86ef-4a29-b5dc-1a7ea708ba2d',
  'Website Resource Extract Pipeline',
  'Sequence-managed typed extraction for raw website resources with editorial compatibility projection.',
  jsonb_build_array(
    jsonb_build_object(
      'key', 'extract_resource',
      'module', 'enrichment.resource_extract',
      'options', jsonb_build_object()
    )
  ),
  'active',
  'resource.ingest.requested',
  null,
  null,
  array['resource', 'website', 'enrichment'],
  'migration:0017_web_ingestion_resource_layer'
)
on conflict (sequence_id) do update
set
  title = excluded.title,
  description = excluded.description,
  task_graph = excluded.task_graph,
  status = excluded.status,
  trigger_event = excluded.trigger_event,
  cron = excluded.cron,
  max_runs = excluded.max_runs,
  tags = excluded.tags,
  created_by = excluded.created_by,
  updated_at = now();

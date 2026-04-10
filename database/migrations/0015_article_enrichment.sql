alter table articles
  add column if not exists enrichment_state text not null default 'pending',
  add column if not exists enriched_at timestamptz,
  add column if not exists full_content_html text,
  add column if not exists extracted_description text,
  add column if not exists extracted_author text,
  add column if not exists extracted_ttr_seconds integer,
  add column if not exists extracted_image_url text,
  add column if not exists extracted_favicon_url text,
  add column if not exists extracted_published_at timestamptz,
  add column if not exists extracted_source_name text;

alter table articles
  drop constraint if exists articles_enrichment_state_check;

alter table articles
  add constraint articles_enrichment_state_check
    check (enrichment_state in ('pending', 'skipped', 'enriched', 'failed'));

alter table articles
  drop constraint if exists articles_extracted_ttr_seconds_check;

alter table articles
  add constraint articles_extracted_ttr_seconds_check
    check (extracted_ttr_seconds is null or extracted_ttr_seconds >= 0);

create index if not exists articles_enrichment_state_idx
  on articles (enrichment_state);

alter table source_channels
  add column if not exists enrichment_enabled boolean not null default true,
  add column if not exists enrichment_min_body_length integer not null default 500;

alter table source_channels
  drop constraint if exists source_channels_enrichment_min_body_length_check;

alter table source_channels
  add constraint source_channels_enrichment_min_body_length_check
    check (enrichment_min_body_length > 0);

update sequences
set
  description = 'Active sequence-first article pipeline for fetcher-owned enrichment, normalization, criteria gate, clustering, personalization and notify.',
  task_graph = jsonb_build_array(
    jsonb_build_object(
      'key', 'enrichment',
      'module', 'enrichment.article_extract',
      'options', jsonb_build_object()
    ),
    jsonb_build_object(
      'key', 'normalize',
      'module', 'article.normalize',
      'options', jsonb_build_object()
    ),
    jsonb_build_object(
      'key', 'dedup',
      'module', 'article.dedup',
      'options', jsonb_build_object()
    ),
    jsonb_build_object(
      'key', 'embed',
      'module', 'article.embed',
      'options', jsonb_build_object()
    ),
    jsonb_build_object(
      'key', 'match_criteria',
      'module', 'article.match_criteria',
      'options', jsonb_build_object()
    ),
    jsonb_build_object(
      'key', 'cluster',
      'module', 'article.cluster',
      'options', jsonb_build_object()
    ),
    jsonb_build_object(
      'key', 'match_interests',
      'module', 'article.match_interests',
      'options', jsonb_build_object()
    ),
    jsonb_build_object(
      'key', 'notify',
      'module', 'article.notify',
      'options', jsonb_build_object()
    )
  ),
  tags = array['default', 'article', 'core', 'cutover', 'enrichment'],
  updated_at = now()
where sequence_id = '5cc77217-7a2f-4318-9fef-c6734e0f22f1';

create table if not exists content_analysis_policies (
  policy_id uuid primary key default gen_random_uuid(),
  policy_key text not null,
  title text not null,
  description text,
  scope_type text not null default 'global',
  scope_id uuid,
  module text not null,
  enabled boolean not null default true,
  mode text not null default 'observe',
  provider text,
  model_key text,
  model_version text,
  config_json jsonb not null default '{}'::jsonb,
  failure_policy text not null default 'skip',
  priority integer not null default 100,
  version integer not null default 1,
  is_active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint content_analysis_policies_scope_type_check
    check (scope_type in ('global', 'source_channel', 'system_interest', 'sequence', 'manual')),
  constraint content_analysis_policies_module_check
    check (module in ('ner', 'sentiment', 'category', 'system_interest_label', 'content_filter', 'clustering')),
  constraint content_analysis_policies_mode_check
    check (mode in ('disabled', 'observe', 'dry_run', 'hold', 'enforce')),
  constraint content_analysis_policies_failure_policy_check
    check (failure_policy in ('skip', 'hold', 'reject', 'fail_run')),
  constraint content_analysis_policies_config_json_object_check
    check (jsonb_typeof(config_json) = 'object'),
  constraint content_analysis_policies_version_positive_check
    check (version > 0)
);

create unique index if not exists content_analysis_policies_key_version_unique
  on content_analysis_policies (policy_key, version);

create index if not exists content_analysis_policies_scope_idx
  on content_analysis_policies (scope_type, scope_id, module, is_active, priority);

create table if not exists content_analysis_results (
  analysis_id uuid primary key default gen_random_uuid(),
  subject_type text not null,
  subject_id uuid not null,
  canonical_document_id uuid,
  source_channel_id uuid references source_channels (channel_id) on delete set null,
  analysis_type text not null,
  provider text not null,
  model_key text not null,
  model_version text,
  language text,
  policy_id uuid references content_analysis_policies (policy_id) on delete set null,
  policy_version integer,
  status text not null default 'completed',
  result_json jsonb not null default '{}'::jsonb,
  confidence double precision,
  source_hash text,
  error_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint content_analysis_results_subject_type_check
    check (subject_type in ('article', 'web_resource', 'canonical_document', 'story_cluster')),
  constraint content_analysis_results_analysis_type_check
    check (analysis_type in ('ner', 'sentiment', 'entity_sentiment', 'category', 'system_interest_label', 'content_filter', 'cluster_summary')),
  constraint content_analysis_results_status_check
    check (status in ('pending', 'completed', 'failed', 'skipped')),
  constraint content_analysis_results_result_json_object_check
    check (jsonb_typeof(result_json) = 'object')
);

create unique index if not exists content_analysis_results_subject_unique
  on content_analysis_results (
    subject_type,
    subject_id,
    analysis_type,
    provider,
    model_key,
    coalesce(source_hash, '')
  );

create index if not exists content_analysis_results_subject_idx
  on content_analysis_results (subject_type, subject_id, analysis_type, status, updated_at desc);

create index if not exists content_analysis_results_type_status_idx
  on content_analysis_results (analysis_type, status, updated_at desc);

create index if not exists content_analysis_results_json_gin_idx
  on content_analysis_results using gin (result_json);

create table if not exists content_entities (
  entity_id uuid primary key default gen_random_uuid(),
  subject_type text not null,
  subject_id uuid not null,
  canonical_document_id uuid,
  source_channel_id uuid references source_channels (channel_id) on delete set null,
  entity_text text not null,
  normalized_key text not null,
  entity_type text not null,
  salience double precision,
  confidence double precision,
  mention_count integer not null default 1,
  mentions_json jsonb not null default '[]'::jsonb,
  provider text not null,
  model_key text not null,
  analysis_id uuid references content_analysis_results (analysis_id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint content_entities_subject_type_check
    check (subject_type in ('article', 'web_resource', 'canonical_document', 'story_cluster')),
  constraint content_entities_mentions_json_array_check
    check (jsonb_typeof(mentions_json) = 'array'),
  constraint content_entities_mention_count_positive_check
    check (mention_count > 0)
);

create index if not exists content_entities_subject_idx
  on content_entities (subject_type, subject_id);

create index if not exists content_entities_key_idx
  on content_entities (normalized_key);

create index if not exists content_entities_type_key_idx
  on content_entities (entity_type, normalized_key);

create index if not exists content_entities_channel_idx
  on content_entities (source_channel_id);

create table if not exists content_labels (
  label_id uuid primary key default gen_random_uuid(),
  subject_type text not null,
  subject_id uuid not null,
  canonical_document_id uuid,
  source_channel_id uuid references source_channels (channel_id) on delete set null,
  label_type text not null,
  label_key text not null,
  label_name text,
  decision text not null default 'match',
  score double precision,
  confidence double precision,
  explain_json jsonb not null default '{}'::jsonb,
  analysis_id uuid references content_analysis_results (analysis_id) on delete set null,
  created_at timestamptz not null default now(),
  constraint content_labels_subject_type_check
    check (subject_type in ('article', 'web_resource', 'canonical_document', 'story_cluster')),
  constraint content_labels_label_type_check
    check (label_type in ('system_interest', 'taxonomy', 'sentiment', 'tone', 'risk')),
  constraint content_labels_decision_check
    check (decision in ('match', 'no_match', 'gray_zone', 'hold', 'rejected')),
  constraint content_labels_explain_json_object_check
    check (jsonb_typeof(explain_json) = 'object')
);

create index if not exists content_labels_subject_idx
  on content_labels (subject_type, subject_id);

create index if not exists content_labels_key_decision_idx
  on content_labels (label_type, label_key, decision);

create index if not exists content_labels_channel_idx
  on content_labels (source_channel_id);

create table if not exists content_filter_policies (
  filter_policy_id uuid primary key default gen_random_uuid(),
  policy_key text not null,
  title text not null,
  description text,
  scope_type text not null default 'global',
  scope_id uuid,
  mode text not null default 'dry_run',
  combiner text not null default 'all',
  policy_json jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  is_active boolean not null default true,
  priority integer not null default 100,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint content_filter_policies_scope_type_check
    check (scope_type in ('global', 'source_channel', 'system_interest', 'collection', 'sequence', 'manual')),
  constraint content_filter_policies_mode_check
    check (mode in ('disabled', 'observe', 'dry_run', 'hold', 'enforce')),
  constraint content_filter_policies_combiner_check
    check (combiner in ('all', 'any', 'priority_first')),
  constraint content_filter_policies_policy_json_object_check
    check (jsonb_typeof(policy_json) = 'object'),
  constraint content_filter_policies_version_positive_check
    check (version > 0)
);

create unique index if not exists content_filter_policies_key_version_unique
  on content_filter_policies (policy_key, version);

create index if not exists content_filter_policies_scope_idx
  on content_filter_policies (scope_type, scope_id, is_active, priority);

create table if not exists content_filter_results (
  filter_result_id uuid primary key default gen_random_uuid(),
  subject_type text not null,
  subject_id uuid not null,
  canonical_document_id uuid,
  source_channel_id uuid references source_channels (channel_id) on delete set null,
  filter_policy_id uuid references content_filter_policies (filter_policy_id) on delete set null,
  policy_key text not null,
  policy_version integer not null,
  mode text not null,
  decision text not null,
  passed boolean not null,
  score double precision,
  matched_rules_json jsonb not null default '[]'::jsonb,
  failed_rules_json jsonb not null default '[]'::jsonb,
  explain_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint content_filter_results_subject_type_check
    check (subject_type in ('article', 'web_resource', 'canonical_document', 'story_cluster')),
  constraint content_filter_results_mode_check
    check (mode in ('disabled', 'observe', 'dry_run', 'hold', 'enforce')),
  constraint content_filter_results_decision_check
    check (decision in ('keep', 'reject', 'hold', 'needs_review')),
  constraint content_filter_results_matched_rules_json_array_check
    check (jsonb_typeof(matched_rules_json) = 'array'),
  constraint content_filter_results_failed_rules_json_array_check
    check (jsonb_typeof(failed_rules_json) = 'array'),
  constraint content_filter_results_explain_json_object_check
    check (jsonb_typeof(explain_json) = 'object')
);

create unique index if not exists content_filter_results_subject_policy_unique
  on content_filter_results (subject_type, subject_id, policy_key, policy_version);

create index if not exists content_filter_results_subject_idx
  on content_filter_results (subject_type, subject_id, updated_at desc);

create index if not exists content_filter_results_decision_idx
  on content_filter_results (decision, passed, mode, updated_at desc);

create index if not exists content_filter_results_channel_idx
  on content_filter_results (source_channel_id);

insert into content_analysis_policies (
  policy_key,
  title,
  description,
  module,
  enabled,
  mode,
  provider,
  model_key,
  model_version,
  config_json,
  failure_policy
)
values
  (
    'default_heuristic_ner_observe',
    'Default heuristic NER observe',
    'Local deterministic entity extraction for initial content_analysis rollout.',
    'ner',
    true,
    'observe',
    'heuristic',
    'newsportal-titlecase-v1',
    '1',
    '{"maxTextChars": 50000}'::jsonb,
    'skip'
  ),
  (
    'default_system_interest_label_projection',
    'Default system-interest label projection',
    'Projects existing interest_filter_results into queryable content_labels.',
    'system_interest_label',
    true,
    'observe',
    'newsportal',
    'interest-filter-projection',
    '1',
    '{"includeGrayZone": true, "includeNoMatch": false}'::jsonb,
    'skip'
  )
on conflict do nothing;

insert into content_filter_policies (
  policy_key,
  title,
  description,
  mode,
  combiner,
  policy_json,
  version,
  is_active,
  priority
)
values (
  'default_recent_content_gate',
  'Default recent content gate',
  'Dry-run gate for content discovered or published in the last three months.',
  'dry_run',
  'all',
  '{
    "policyVersion": 1,
    "dateBasis": "published_at",
    "dateFallback": ["source_lastmod_at", "discovered_at", "ingested_at"],
    "rules": [
      {
        "key": "not_older_than_3_months",
        "field": "published_at",
        "op": "gte_relative",
        "value": {"amount": 3, "unit": "months"}
      }
    ],
    "onPass": "keep",
    "onFail": "reject",
    "onMissingAnalysis": "hold"
  }'::jsonb,
  1,
  true,
  100
)
on conflict do nothing;

update sequences
set
  task_graph = jsonb_build_array(
    jsonb_build_object(
      'key', 'extract_article',
      'module', 'enrichment.article_extract',
      'options', jsonb_build_object()
    ),
    jsonb_build_object('key', 'normalize', 'module', 'article.normalize', 'options', jsonb_build_object()),
    jsonb_build_object('key', 'dedup', 'module', 'article.dedup', 'options', jsonb_build_object()),
    jsonb_build_object('key', 'embed', 'module', 'article.embed', 'options', jsonb_build_object()),
    jsonb_build_object(
      'key', 'content_ner',
      'module', 'content.ner_extract',
      'enabled', true,
      'options', jsonb_build_object('mode', 'observe', 'subjectType', 'article')
    ),
    jsonb_build_object('key', 'match_criteria', 'module', 'article.match_criteria', 'options', jsonb_build_object()),
    jsonb_build_object(
      'key', 'system_interest_labels',
      'module', 'content.system_interest_label_project',
      'enabled', true,
      'options', jsonb_build_object('mode', 'observe')
    ),
    jsonb_build_object('key', 'cluster', 'module', 'article.cluster', 'options', jsonb_build_object()),
    jsonb_build_object(
      'key', 'content_filter',
      'module', 'content.filter_gate',
      'enabled', true,
      'options', jsonb_build_object('mode', 'dry_run', 'policyKey', 'default_recent_content_gate')
    ),
    jsonb_build_object('key', 'match_interests', 'module', 'article.match_interests', 'options', jsonb_build_object()),
    jsonb_build_object('key', 'notify', 'module', 'article.notify', 'options', jsonb_build_object())
  ),
  tags = array['default', 'article', 'core', 'cutover', 'content-analysis'],
  updated_at = now()
where sequence_id = '5cc77217-7a2f-4318-9fef-c6734e0f22f1';

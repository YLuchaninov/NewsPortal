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
    'default_lexicon_sentiment_observe',
    'Default lexicon sentiment observe',
    'Local deterministic sentiment, tone and risk labeling for content_analysis.',
    'sentiment',
    true,
    'observe',
    'newsportal',
    'lexicon-sentiment-v1',
    '1',
    '{"maxTextChars": 50000}'::jsonb,
    'skip'
  ),
  (
    'default_lexicon_taxonomy_observe',
    'Default lexicon taxonomy observe',
    'Local deterministic taxonomy category labeling for content_analysis.',
    'category',
    true,
    'observe',
    'newsportal',
    'lexicon-taxonomy-v1',
    '1',
    '{"maxTextChars": 50000}'::jsonb,
    'skip'
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
    jsonb_build_object(
      'key', 'content_sentiment',
      'module', 'content.sentiment_analyze',
      'enabled', true,
      'options', jsonb_build_object('mode', 'observe', 'subjectType', 'article')
    ),
    jsonb_build_object(
      'key', 'content_category',
      'module', 'content.category_classify',
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

insert into sequences (
  sequence_id,
  title,
  description,
  task_graph,
  status,
  trigger_event,
  tags,
  created_by
)
values
  (
    '5cc77217-7a2f-4318-9fef-c6734e0f22f1',
    'Default Article Normalize',
    'Draft default sequence for article ingest normalization.',
    jsonb_build_array(
      jsonb_build_object(
        'key', 'normalize',
        'module', 'article.normalize',
        'options', jsonb_build_object()
      )
    ),
    'draft',
    'article.ingest.requested',
    array['default', 'article', 'core'],
    'migration:0011_sequence_engine_default_sequences'
  ),
  (
    '29550f32-8e68-4ad0-8b50-1cad53b0995b',
    'Default Article Dedup',
    'Draft default sequence for article deduplication after normalization.',
    jsonb_build_array(
      jsonb_build_object(
        'key', 'dedup',
        'module', 'article.dedup',
        'options', jsonb_build_object()
      )
    ),
    'draft',
    'article.normalized',
    array['default', 'article', 'core'],
    'migration:0011_sequence_engine_default_sequences'
  ),
  (
    '1272c6ef-c795-444c-a561-0c793eb90bb8',
    'Default Article Embed',
    'Draft default sequence for article embedding after normalization.',
    jsonb_build_array(
      jsonb_build_object(
        'key', 'embed',
        'module', 'article.embed',
        'options', jsonb_build_object()
      )
    ),
    'draft',
    'article.normalized',
    array['default', 'article', 'core'],
    'migration:0011_sequence_engine_default_sequences'
  ),
  (
    'c59d3ec1-f8ae-43c5-8ff2-cac979af8610',
    'Default Criteria Match',
    'Draft default sequence for system criteria matching after embeddings.',
    jsonb_build_array(
      jsonb_build_object(
        'key', 'match_criteria',
        'module', 'article.match_criteria',
        'options', jsonb_build_object()
      )
    ),
    'draft',
    'article.embedded',
    array['default', 'article', 'core'],
    'migration:0011_sequence_engine_default_sequences'
  ),
  (
    '66e2d74d-c46e-4cd9-80b3-c8f58a6c032e',
    'Default Article Cluster',
    'Draft default sequence for clustering eligible articles.',
    jsonb_build_array(
      jsonb_build_object(
        'key', 'cluster',
        'module', 'article.cluster',
        'options', jsonb_build_object()
      )
    ),
    'draft',
    'article.criteria.matched',
    array['default', 'article', 'core'],
    'migration:0011_sequence_engine_default_sequences'
  ),
  (
    'ba49798e-02e0-456f-a03d-4148548eb4b8',
    'Default Interest Match',
    'Draft default sequence for user-interest matching after clustering.',
    jsonb_build_array(
      jsonb_build_object(
        'key', 'match_interests',
        'module', 'article.match_interests',
        'options', jsonb_build_object()
      )
    ),
    'draft',
    'article.clustered',
    array['default', 'article', 'core'],
    'migration:0011_sequence_engine_default_sequences'
  ),
  (
    'ae73b9db-a4f7-4853-9789-aa8a35eb4dfd',
    'Default Notification Dispatch',
    'Draft default sequence for notification dispatch after interest matches.',
    jsonb_build_array(
      jsonb_build_object(
        'key', 'notify',
        'module', 'article.notify',
        'options', jsonb_build_object()
      )
    ),
    'draft',
    'article.interests.matched',
    array['default', 'article', 'core'],
    'migration:0011_sequence_engine_default_sequences'
  ),
  (
    '2161b11a-7177-4873-b48d-3dd9c30b8511',
    'Default LLM Review',
    'Draft default sequence for queued LLM review work.',
    jsonb_build_array(
      jsonb_build_object(
        'key', 'llm_review',
        'module', 'article.llm_review',
        'options', jsonb_build_object()
      )
    ),
    'draft',
    'llm.review.requested',
    array['default', 'article', 'maintenance'],
    'migration:0011_sequence_engine_default_sequences'
  ),
  (
    '03f21748-8057-44e5-b515-7b4d489764f8',
    'Default Interest Compile',
    'Draft default sequence for interest compile jobs.',
    jsonb_build_array(
      jsonb_build_object(
        'key', 'interest_compile',
        'module', 'maintenance.interest_compile',
        'options', jsonb_build_object()
      )
    ),
    'draft',
    'interest.compile.requested',
    array['default', 'maintenance'],
    'migration:0011_sequence_engine_default_sequences'
  ),
  (
    'a51a3f96-cb55-4685-904d-99069f1df3f5',
    'Default Criterion Compile',
    'Draft default sequence for criterion compile jobs.',
    jsonb_build_array(
      jsonb_build_object(
        'key', 'criterion_compile',
        'module', 'maintenance.criterion_compile',
        'options', jsonb_build_object()
      )
    ),
    'draft',
    'criterion.compile.requested',
    array['default', 'maintenance'],
    'migration:0011_sequence_engine_default_sequences'
  ),
  (
    '57a90c72-3025-4f62-a718-ddc21c63e425',
    'Default Feedback Ingest',
    'Draft default sequence for notification feedback ingestion.',
    jsonb_build_array(
      jsonb_build_object(
        'key', 'feedback_ingest',
        'module', 'maintenance.feedback_ingest',
        'options', jsonb_build_object()
      )
    ),
    'draft',
    'notification.feedback.recorded',
    array['default', 'maintenance'],
    'migration:0011_sequence_engine_default_sequences'
  ),
  (
    '2aa7eb1f-6a4b-4630-bb94-dc6b92192dde',
    'Default Reindex',
    'Draft default sequence for rebuild and historical backfill jobs.',
    jsonb_build_array(
      jsonb_build_object(
        'key', 'reindex',
        'module', 'maintenance.reindex',
        'options', jsonb_build_object()
      )
    ),
    'draft',
    'reindex.requested',
    array['default', 'maintenance'],
    'migration:0011_sequence_engine_default_sequences'
  )
on conflict (sequence_id) do nothing;

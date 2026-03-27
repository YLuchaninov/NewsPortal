update sequences
set
  title = 'Default Article Pipeline',
  description = 'Active sequence-first article pipeline for ingest, criteria gate, clustering, personalization and notify.',
  task_graph = jsonb_build_array(
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
  status = 'active',
  trigger_event = 'article.ingest.requested',
  tags = array['default', 'article', 'core', 'cutover'],
  updated_at = now()
where sequence_id = '5cc77217-7a2f-4318-9fef-c6734e0f22f1';

update sequences
set
  status = 'archived',
  tags = array['default', 'article', 'legacy', 'archived'],
  updated_at = now()
where sequence_id in (
  '29550f32-8e68-4ad0-8b50-1cad53b0995b',
  '1272c6ef-c795-444c-a561-0c793eb90bb8',
  'c59d3ec1-f8ae-43c5-8ff2-cac979af8610',
  '66e2d74d-c46e-4cd9-80b3-c8f58a6c032e',
  'ba49798e-02e0-456f-a03d-4148548eb4b8',
  'ae73b9db-a4f7-4853-9789-aa8a35eb4dfd'
);

update sequences
set
  title = 'Default LLM Review Resume',
  description = 'Active sequence for criteria-scope LLM review followed by resumed downstream article processing.',
  task_graph = jsonb_build_array(
    jsonb_build_object(
      'key', 'llm_review',
      'module', 'article.llm_review',
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
  status = 'active',
  trigger_event = 'llm.review.requested',
  tags = array['default', 'article', 'maintenance', 'cutover'],
  updated_at = now()
where sequence_id = '2161b11a-7177-4873-b48d-3dd9c30b8511';

update sequences
set
  status = 'active',
  tags = array['default', 'maintenance', 'cutover'],
  updated_at = now()
where sequence_id in (
  '03f21748-8057-44e5-b515-7b4d489764f8',
  'a51a3f96-cb55-4685-904d-99069f1df3f5',
  '57a90c72-3025-4f62-a718-ddc21c63e425',
  '2aa7eb1f-6a4b-4630-bb94-dc6b92192dde'
);

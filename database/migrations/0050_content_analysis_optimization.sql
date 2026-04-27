alter table content_analysis_policies
  drop constraint if exists content_analysis_policies_module_check;

alter table content_analysis_policies
  add constraint content_analysis_policies_module_check
  check (module in (
    'ner',
    'sentiment',
    'category',
    'system_interest_label',
    'content_filter',
    'cluster_summary',
    'clustering',
    'structured_extraction'
  ));

update content_analysis_policies
set module = 'cluster_summary',
    updated_at = now()
where module = 'clustering'
  and policy_key = 'default_story_cluster_summary_observe';

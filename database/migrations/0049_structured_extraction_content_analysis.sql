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
    'clustering',
    'structured_extraction'
  ));

alter table content_analysis_results
  drop constraint if exists content_analysis_results_analysis_type_check;

alter table content_analysis_results
  add constraint content_analysis_results_analysis_type_check
  check (analysis_type in (
    'ner',
    'sentiment',
    'entity_sentiment',
    'category',
    'system_interest_label',
    'content_filter',
    'cluster_summary',
    'structured_extraction'
  ));

alter table content_labels
  drop constraint if exists content_labels_label_type_check;

alter table content_labels
  add constraint content_labels_label_type_check
  check (label_type in (
    'system_interest',
    'taxonomy',
    'sentiment',
    'tone',
    'risk',
    'extracted_field'
  ));

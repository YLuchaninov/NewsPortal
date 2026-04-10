create table if not exists final_selection_results (
  doc_id uuid primary key references articles (doc_id) on delete cascade,
  canonical_document_id uuid references canonical_documents (canonical_document_id) on delete set null,
  story_cluster_id uuid references story_clusters (story_cluster_id) on delete set null,
  verification_target_type text,
  verification_target_id uuid,
  verification_state text,
  total_filter_count integer not null default 0,
  matched_filter_count integer not null default 0,
  no_match_filter_count integer not null default 0,
  gray_zone_filter_count integer not null default 0,
  technical_filtered_out_count integer not null default 0,
  final_decision text not null,
  is_selected boolean not null default false,
  compat_system_feed_decision text not null,
  explain_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint final_selection_results_verification_target_type_check
    check (
      verification_target_type is null
      or verification_target_type in ('canonical_document', 'story_cluster')
    ),
  constraint final_selection_results_verification_state_check
    check (
      verification_state is null
      or verification_state in ('weak', 'medium', 'strong', 'conflicting')
    ),
  constraint final_selection_results_total_filter_count_check
    check (total_filter_count >= 0),
  constraint final_selection_results_matched_filter_count_check
    check (matched_filter_count >= 0),
  constraint final_selection_results_no_match_filter_count_check
    check (no_match_filter_count >= 0),
  constraint final_selection_results_gray_zone_filter_count_check
    check (gray_zone_filter_count >= 0),
  constraint final_selection_results_technical_filtered_out_count_check
    check (technical_filtered_out_count >= 0),
  constraint final_selection_results_final_decision_check
    check (final_decision in ('selected', 'rejected', 'gray_zone')),
  constraint final_selection_results_compat_system_feed_decision_check
    check (compat_system_feed_decision in ('eligible', 'filtered_out', 'pending_llm', 'pass_through'))
);

create index if not exists final_selection_results_selected_idx
  on final_selection_results (is_selected, updated_at desc);

create index if not exists final_selection_results_final_decision_idx
  on final_selection_results (final_decision, updated_at desc);

create index if not exists final_selection_results_canonical_document_id_idx
  on final_selection_results (canonical_document_id);

create index if not exists final_selection_results_story_cluster_id_idx
  on final_selection_results (story_cluster_id);

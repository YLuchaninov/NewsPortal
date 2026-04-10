create table if not exists interest_filter_results (
  interest_filter_result_id uuid primary key default gen_random_uuid(),
  filter_scope text not null,
  filter_key text not null,
  doc_id uuid not null references articles (doc_id) on delete cascade,
  canonical_document_id uuid references canonical_documents (canonical_document_id) on delete set null,
  story_cluster_id uuid references story_clusters (story_cluster_id) on delete set null,
  user_id uuid references users (user_id) on delete cascade,
  criterion_id uuid references criteria (criterion_id) on delete cascade,
  interest_id uuid references user_interests (interest_id) on delete cascade,
  technical_filter_state text not null,
  semantic_decision text not null,
  compat_decision text not null,
  verification_target_type text,
  verification_target_id uuid,
  verification_state text,
  semantic_score double precision not null default 0,
  explain_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint interest_filter_results_scope_check
    check (filter_scope in ('system_criterion', 'user_interest')),
  constraint interest_filter_results_technical_filter_state_check
    check (technical_filter_state in ('passed', 'filtered_out')),
  constraint interest_filter_results_semantic_decision_check
    check (semantic_decision in ('match', 'no_match', 'gray_zone', 'not_evaluated')),
  constraint interest_filter_results_verification_target_type_check
    check (
      verification_target_type is null
      or verification_target_type in ('canonical_document', 'story_cluster')
    ),
  constraint interest_filter_results_verification_state_check
    check (
      verification_state is null
      or verification_state in ('weak', 'medium', 'strong', 'conflicting')
    ),
  constraint interest_filter_results_scope_columns_check
    check (
      (
        filter_scope = 'system_criterion'
        and criterion_id is not null
        and interest_id is null
        and user_id is null
      )
      or (
        filter_scope = 'user_interest'
        and criterion_id is null
        and interest_id is not null
        and user_id is not null
      )
    )
);

create unique index if not exists interest_filter_results_doc_filter_key_unique
  on interest_filter_results (doc_id, filter_key);

create index if not exists interest_filter_results_scope_semantic_decision_idx
  on interest_filter_results (filter_scope, semantic_decision, created_at desc);

create index if not exists interest_filter_results_canonical_document_id_idx
  on interest_filter_results (canonical_document_id);

create index if not exists interest_filter_results_story_cluster_id_idx
  on interest_filter_results (story_cluster_id);

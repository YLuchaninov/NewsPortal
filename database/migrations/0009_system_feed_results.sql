create table if not exists system_feed_results (
  doc_id uuid primary key references articles (doc_id) on delete cascade,
  decision text not null,
  eligible_for_feed boolean not null default false,
  total_criteria_count integer not null default 0,
  relevant_criteria_count integer not null default 0,
  irrelevant_criteria_count integer not null default 0,
  pending_llm_criteria_count integer not null default 0,
  explain_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint system_feed_results_decision_check
    check (decision in ('eligible', 'filtered_out', 'pending_llm', 'pass_through')),
  constraint system_feed_results_total_criteria_count_check
    check (total_criteria_count >= 0),
  constraint system_feed_results_relevant_criteria_count_check
    check (relevant_criteria_count >= 0),
  constraint system_feed_results_irrelevant_criteria_count_check
    check (irrelevant_criteria_count >= 0),
  constraint system_feed_results_pending_llm_criteria_count_check
    check (pending_llm_criteria_count >= 0)
);

create index if not exists system_feed_results_eligible_idx
  on system_feed_results (eligible_for_feed, updated_at desc);

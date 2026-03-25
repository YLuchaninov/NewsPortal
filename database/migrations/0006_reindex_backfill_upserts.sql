with ranked_criterion_matches as (
  select
    ctid,
    row_number() over (
      partition by doc_id, criterion_id
      order by created_at desc, criterion_match_id desc
    ) as row_rank
  from criterion_match_results
)
delete from criterion_match_results cmr
using ranked_criterion_matches ranked
where cmr.ctid = ranked.ctid
  and ranked.row_rank > 1;

create unique index if not exists criterion_match_results_doc_criterion_unique
  on criterion_match_results (doc_id, criterion_id);

with ranked_interest_matches as (
  select
    ctid,
    row_number() over (
      partition by doc_id, interest_id
      order by created_at desc, interest_match_id desc
    ) as row_rank
  from interest_match_results
)
delete from interest_match_results imr
using ranked_interest_matches ranked
where imr.ctid = ranked.ctid
  and ranked.row_rank > 1;

create unique index if not exists interest_match_results_doc_interest_unique
  on interest_match_results (doc_id, interest_id);

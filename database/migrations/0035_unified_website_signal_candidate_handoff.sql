alter table signal_candidates
  add column if not exists content_kind text not null default 'editorial';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'signal_candidates_content_kind_check'
      and conrelid = 'signal_candidates'::regclass
  ) then
    alter table signal_candidates
      add constraint signal_candidates_content_kind_check
        check (
          content_kind in (
            'editorial',
            'listing',
            'entity',
            'document',
            'data_file',
            'api_payload'
          )
        );
  end if;
end
$$;

create index if not exists signal_candidates_content_kind_idx
  on signal_candidates (content_kind);

alter table canonical_documents
  drop constraint if exists canonical_documents_content_kind_check;

alter table canonical_documents
  add constraint canonical_documents_content_kind_check
    check (
      content_kind in (
        'editorial',
        'listing',
        'entity',
        'document',
        'data_file',
        'api_payload'
      )
    );

update canonical_documents cd
set
  content_kind = coalesce(a.content_kind, 'editorial'),
  updated_at = now()
from signal_candidates a
where a.doc_id = cd.canonical_document_id;

alter table web_resources
  add column if not exists projection_state text not null default 'pending',
  add column if not exists projection_error text;

update web_resources
set
  projection_state = case
    when projected_signal_candidate_id is not null then 'projected_to_common_pipeline'
    when extraction_state in ('failed', 'skipped') then 'explicitly_rejected_before_pipeline'
    when extraction_state = 'enriched'
      and resource_kind in ('editorial', 'listing', 'entity', 'document', 'data_file', 'api_payload')
      then 'explicitly_rejected_before_pipeline'
    else 'pending'
  end,
  projection_error = case
    when projected_signal_candidate_id is not null then null
    when extraction_state = 'failed' then coalesce(extraction_error, 'enrichment_failed')
    when extraction_state = 'skipped' then coalesce(extraction_error, 'resource_skipped_before_common_pipeline')
    when extraction_state = 'enriched'
      and resource_kind in ('editorial', 'listing', 'entity', 'document', 'data_file', 'api_payload')
      then coalesce(extraction_error, 'legacy_resource_only_without_common_handoff')
    else projection_error
  end,
  updated_at = now();

alter table web_resources
  drop constraint if exists web_resources_projection_state_check;

alter table web_resources
  add constraint web_resources_projection_state_check
    check (
      projection_state in (
        'pending',
        'projected_to_common_pipeline',
        'explicitly_rejected_before_pipeline'
      )
    );

alter table web_resources
  drop constraint if exists web_resources_projection_state_alignment_check;

alter table web_resources
  add constraint web_resources_projection_state_alignment_check
    check (
      (
        projection_state = 'projected_to_common_pipeline'
        and projected_signal_candidate_id is not null
      )
      or (
        projection_state in ('pending', 'explicitly_rejected_before_pipeline')
        and projected_signal_candidate_id is null
      )
    );

create index if not exists web_resources_projection_state_idx
  on web_resources (projection_state, updated_at desc);

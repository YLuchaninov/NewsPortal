alter table criteria
  add column if not exists source_interest_template_id uuid references interest_templates (interest_template_id) on delete cascade;

create unique index if not exists criteria_source_interest_template_unique
  on criteria (source_interest_template_id)
  where source_interest_template_id is not null;

with inserted_criteria as (
  insert into criteria (
    criterion_id,
    source_interest_template_id,
    description,
    positive_texts,
    negative_texts,
    must_have_terms,
    must_not_have_terms,
    places,
    languages_allowed,
    short_tokens_required,
    short_tokens_forbidden,
    priority,
    enabled,
    compiled,
    compile_status,
    version,
    created_at,
    updated_at
  )
  select
    gen_random_uuid(),
    it.interest_template_id,
    case
      when nullif(btrim(it.name), '') is not null then btrim(it.name)
      when nullif(btrim(it.description), '') is not null then btrim(it.description)
      else 'Interest template'
    end,
    it.positive_texts,
    it.negative_texts,
    it.must_have_terms,
    it.must_not_have_terms,
    it.places,
    it.languages_allowed,
    it.short_tokens_required,
    it.short_tokens_forbidden,
    it.priority,
    it.is_active,
    false,
    case when it.is_active then 'queued' else 'pending' end,
    1,
    now(),
    now()
  from interest_templates it
  left join criteria c on c.source_interest_template_id = it.interest_template_id
  where c.criterion_id is null
  returning criterion_id, version, enabled
)
insert into outbox_events (
  event_id,
  event_type,
  aggregate_type,
  aggregate_id,
  payload_json
)
select
  gen_random_uuid(),
  'criterion.compile.requested',
  'criterion',
  inserted_criteria.criterion_id,
  jsonb_build_object(
    'criterionId',
    inserted_criteria.criterion_id,
    'version',
    inserted_criteria.version
  )
from inserted_criteria
where inserted_criteria.enabled = true;

create table if not exists selection_profiles (
  selection_profile_id uuid primary key default gen_random_uuid(),
  source_interest_template_id uuid unique references interest_templates (interest_template_id) on delete cascade,
  source_criterion_id uuid unique references criteria (criterion_id) on delete set null,
  name text not null,
  description text not null default '',
  profile_scope text not null default 'system',
  profile_family text not null default 'compatibility_interest_template',
  definition_json jsonb not null default '{}'::jsonb,
  policy_json jsonb not null default '{}'::jsonb,
  facets_json jsonb not null default '[]'::jsonb,
  bindings_json jsonb not null default '{}'::jsonb,
  status text not null default 'active',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint selection_profiles_scope_check
    check (profile_scope in ('system', 'user', 'custom')),
  constraint selection_profiles_status_check
    check (status in ('draft', 'active', 'archived')),
  constraint selection_profiles_definition_json_object_check
    check (jsonb_typeof(definition_json) = 'object'),
  constraint selection_profiles_policy_json_object_check
    check (jsonb_typeof(policy_json) = 'object'),
  constraint selection_profiles_facets_json_array_check
    check (jsonb_typeof(facets_json) = 'array'),
  constraint selection_profiles_bindings_json_object_check
    check (jsonb_typeof(bindings_json) = 'object'),
  constraint selection_profiles_version_positive_check
    check (version > 0),
  constraint selection_profiles_source_present_check
    check (
      source_interest_template_id is not null
      or profile_scope <> 'system'
    )
);

create index if not exists selection_profiles_scope_status_idx
  on selection_profiles (profile_scope, status, updated_at desc);

create index if not exists selection_profiles_family_idx
  on selection_profiles (profile_family, updated_at desc);

create index if not exists selection_profiles_source_criterion_idx
  on selection_profiles (source_criterion_id)
  where source_criterion_id is not null;

insert into selection_profiles (
  selection_profile_id,
  source_interest_template_id,
  source_criterion_id,
  name,
  description,
  profile_scope,
  profile_family,
  definition_json,
  policy_json,
  facets_json,
  bindings_json,
  status,
  version,
  created_at,
  updated_at
)
select
  gen_random_uuid(),
  it.interest_template_id,
  c.criterion_id,
  case
    when nullif(btrim(it.name), '') is not null then btrim(it.name)
    when nullif(btrim(it.description), '') is not null then btrim(it.description)
    else 'Interest template'
  end,
  coalesce(it.description, ''),
  'system',
  'compatibility_interest_template',
  jsonb_build_object(
    'description', coalesce(it.description, ''),
    'positiveDefinitions', coalesce(it.positive_texts, '[]'::jsonb),
    'negativeDefinitions', coalesce(it.negative_texts, '[]'::jsonb),
    'requiredEvidence', jsonb_build_object(
      'mustHaveTerms', coalesce(it.must_have_terms, '[]'::jsonb),
      'shortTokensRequired', coalesce(it.short_tokens_required, '[]'::jsonb)
    ),
    'forbiddenEvidence', jsonb_build_object(
      'mustNotHaveTerms', coalesce(it.must_not_have_terms, '[]'::jsonb),
      'shortTokensForbidden', coalesce(it.short_tokens_forbidden, '[]'::jsonb)
    ),
    'constraints', jsonb_build_object(
      'places', coalesce(it.places, '[]'::jsonb),
      'languagesAllowed', coalesce(it.languages_allowed, '[]'::jsonb),
      'timeWindowHours', to_jsonb(it.time_window_hours)
    ),
    'compatibility', jsonb_build_object(
      'source', 'interest_template',
      'sourceInterestTemplateId', it.interest_template_id,
      'sourceCriterionId', c.criterion_id,
      'sourceCriterionDescription', c.description
    )
  ),
  jsonb_build_object(
    'strictness', 'balanced',
    'unresolvedDecision', 'hold',
    'llmReviewMode', 'optional_high_value_only',
    'finalSelectionMode', 'compatibility_system_selected',
    'priority', to_jsonb(it.priority),
    'allowedContentKinds', coalesce(
      it.allowed_content_kinds,
      '["editorial","listing","entity","document","data_file","api_payload"]'::jsonb
    )
  ),
  '[]'::jsonb,
  jsonb_build_object(
    'sourceBindingMode', 'compatibility_system_template',
    'allowedContentKinds', coalesce(
      it.allowed_content_kinds,
      '["editorial","listing","entity","document","data_file","api_payload"]'::jsonb
    ),
    'compatibility', jsonb_build_object(
      'sourceInterestTemplateId', it.interest_template_id,
      'sourceCriterionId', c.criterion_id
    )
  ),
  case when it.is_active then 'active' else 'archived' end,
  1,
  now(),
  now()
from interest_templates it
left join criteria c on c.source_interest_template_id = it.interest_template_id
left join selection_profiles sp on sp.source_interest_template_id = it.interest_template_id
where sp.selection_profile_id is null;

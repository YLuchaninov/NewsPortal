alter table interest_templates
  add column if not exists allowed_content_kinds jsonb not null
    default '["editorial","listing","entity","document","data_file","api_payload"]'::jsonb;

alter table interest_templates
  drop constraint if exists interest_templates_allowed_content_kinds_is_array_check;

alter table interest_templates
  add constraint interest_templates_allowed_content_kinds_is_array_check
    check (jsonb_typeof(allowed_content_kinds) = 'array');

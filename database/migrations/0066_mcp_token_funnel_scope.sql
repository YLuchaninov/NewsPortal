alter table mcp_access_tokens
  add column if not exists funnel_scope_json jsonb not null default '{}'::jsonb;

alter table mcp_access_tokens
  add constraint mcp_access_tokens_funnel_scope_json_object_check
    check (jsonb_typeof(funnel_scope_json) = 'object');

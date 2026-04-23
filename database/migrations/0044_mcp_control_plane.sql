create table if not exists mcp_access_tokens (
  token_id uuid primary key default gen_random_uuid(),
  label text not null,
  token_prefix text not null,
  secret_hash text not null unique,
  scopes jsonb not null default '[]'::jsonb,
  status text not null default 'active',
  issued_by_user_id uuid not null references users(user_id) on delete restrict,
  revoked_by_user_id uuid references users(user_id) on delete set null,
  revoked_at timestamptz,
  expires_at timestamptz,
  last_used_at timestamptz,
  last_used_ip text,
  last_used_user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mcp_access_tokens_scopes_is_array_check
    check (jsonb_typeof(scopes) = 'array'),
  constraint mcp_access_tokens_status_check
    check (status in ('active', 'revoked'))
);

create index if not exists mcp_access_tokens_status_created_at_idx
  on mcp_access_tokens (status, created_at desc);

create index if not exists mcp_access_tokens_issued_by_idx
  on mcp_access_tokens (issued_by_user_id, created_at desc);

create table if not exists mcp_request_log (
  request_log_id uuid primary key default gen_random_uuid(),
  token_id uuid references mcp_access_tokens(token_id) on delete set null,
  request_method text not null,
  tool_name text,
  resource_uri text,
  prompt_name text,
  success boolean not null,
  error_text text,
  request_json jsonb not null default '{}'::jsonb,
  response_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint mcp_request_log_request_json_is_object_check
    check (jsonb_typeof(request_json) = 'object'),
  constraint mcp_request_log_response_json_is_object_check
    check (jsonb_typeof(response_json) = 'object')
);

create index if not exists mcp_request_log_token_created_at_idx
  on mcp_request_log (token_id, created_at desc);

create index if not exists mcp_request_log_method_created_at_idx
  on mcp_request_log (request_method, created_at desc);

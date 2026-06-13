import { createHash, randomBytes, randomUUID } from "node:crypto";

import type { Pool, PoolClient } from "pg";

import { writeAuditLog } from "./audit";

type Queryable = Pick<Pool, "query"> | Pick<PoolClient, "query">;

export const MCP_SCOPE_OPTIONS = [
  "read",
  "read.funnels",
  "write.funnels",
  "write.templates",
  "write.channels",
  "write.discovery",
  "write.sequences",
  "write.destructive",
  "admin.tokens",
] as const;

export type McpScope = (typeof MCP_SCOPE_OPTIONS)[number];
export type McpAccessTokenStatus = "active" | "revoked";
export type McpAccessTokenEffectiveStatus = "active" | "expired" | "revoked";

export interface McpTokenFunnelScope {
  allowedFunnelIds: string[];
}

export interface McpAccessTokenRecord {
  tokenId: string;
  label: string;
  tokenPrefix: string;
  scopes: McpScope[];
  funnelScope?: McpTokenFunnelScope;
  status: McpAccessTokenStatus;
  issuedByUserId: string;
  revokedByUserId: string | null;
  revokedAt: string | null;
  expiresAt: string | null;
  lastUsedAt: string | null;
  lastUsedIp: string | null;
  lastUsedUserAgent: string | null;
  createdAt: string;
  updatedAt: string;
  recentRequestCount: number;
}

export interface McpAccessTokenSummary {
  total: number;
  active: number;
  activeUsable: number;
  expiredActive: number;
  revoked: number;
}

interface McpAccessTokenRow {
  token_id: string;
  label: string;
  token_prefix: string;
  scopes: unknown;
  funnel_scope_json?: unknown;
  status: McpAccessTokenStatus;
  issued_by_user_id: string;
  revoked_by_user_id: string | null;
  revoked_at: Date | null;
  expires_at: Date | null;
  last_used_at: Date | null;
  last_used_ip: string | null;
  last_used_user_agent: string | null;
  created_at: Date;
  updated_at: Date;
  recent_request_count?: number;
}

function hashTokenSecret(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeIsoString(value: Date | string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeScopes(value: unknown): McpScope[] {
  const rawValues = Array.isArray(value)
    ? value
    : String(value ?? "")
        .split(/[\n,\s]+/)
        .map((entry) => entry.trim())
        .filter(Boolean);
  const uniqueValues = Array.from(new Set(rawValues));
  const scopes = uniqueValues.filter((scope): scope is McpScope =>
    (MCP_SCOPE_OPTIONS as readonly string[]).includes(scope)
  );
  if (scopes.length === 0) {
    throw new Error("At least one valid MCP scope is required.");
  }
  return scopes;
}

function normalizeUuidList(value: unknown, path: string): string[] {
  const rawValues = Array.isArray(value)
    ? value
    : String(value ?? "")
        .split(/[\n,\s]+/)
        .map((entry) => entry.trim())
        .filter(Boolean);
  const normalized = Array.from(
    new Set(rawValues.map((entry) => String(entry ?? "").trim()).filter(Boolean))
  );
  const invalid = normalized.find((entry) => !UUID_RE.test(entry));
  if (invalid) {
    throw new Error(`${path} must contain only UUID values.`);
  }
  return normalized;
}

function normalizeFunnelScope(value: unknown): McpTokenFunnelScope {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { allowedFunnelIds: [] };
  }
  const scope = value as Record<string, unknown>;
  return {
    allowedFunnelIds: normalizeUuidList(scope.allowedFunnelIds, "funnelScope.allowedFunnelIds"),
  };
}

function normalizeFunnelScopeInput(input: {
  funnelScope?: unknown;
  allowedFunnelIds?: unknown;
}): McpTokenFunnelScope {
  if (input.allowedFunnelIds !== undefined) {
    return {
      allowedFunnelIds: normalizeUuidList(input.allowedFunnelIds, "allowedFunnelIds"),
    };
  }
  return normalizeFunnelScope(input.funnelScope);
}

function mapTokenRow(row: McpAccessTokenRow): McpAccessTokenRecord {
  return {
    tokenId: row.token_id,
    label: row.label,
    tokenPrefix: row.token_prefix,
    scopes: normalizeScopes(Array.isArray(row.scopes) ? row.scopes : []),
    funnelScope: normalizeFunnelScope(row.funnel_scope_json),
    status: row.status,
    issuedByUserId: row.issued_by_user_id,
    revokedByUserId: row.revoked_by_user_id,
    revokedAt: normalizeIsoString(row.revoked_at),
    expiresAt: normalizeIsoString(row.expires_at),
    lastUsedAt: normalizeIsoString(row.last_used_at),
    lastUsedIp: row.last_used_ip,
    lastUsedUserAgent: row.last_used_user_agent,
    createdAt: normalizeIsoString(row.created_at) ?? new Date(0).toISOString(),
    updatedAt: normalizeIsoString(row.updated_at) ?? new Date(0).toISOString(),
    recentRequestCount: Number(row.recent_request_count ?? 0),
  };
}

function buildTokenLabel(value: unknown): string {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    throw new Error("MCP token label is required.");
  }
  return normalized;
}

function normalizeOptionalExpiry(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    return null;
  }
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("MCP token expiry must be a valid date/time.");
  }
  return parsed.toISOString();
}

export function hasMcpScope(
  grantedScopes: readonly McpScope[],
  requiredScope: McpScope | "read"
): boolean {
  if (requiredScope.startsWith("read.") && grantedScopes.includes("read")) {
    return true;
  }
  return grantedScopes.includes(requiredScope);
}

export function getMcpTokenAllowedFunnelIds(
  token: Pick<McpAccessTokenRecord, "funnelScope">
): string[] {
  return normalizeFunnelScope(token.funnelScope).allowedFunnelIds;
}

export function isMcpTokenAllowedForFunnel(
  token: Pick<McpAccessTokenRecord, "funnelScope">,
  funnelId: string | null | undefined
): boolean {
  const normalizedFunnelId = String(funnelId ?? "").trim();
  if (!normalizedFunnelId) {
    return true;
  }
  const allowedFunnelIds = getMcpTokenAllowedFunnelIds(token);
  return allowedFunnelIds.length === 0 || allowedFunnelIds.includes(normalizedFunnelId);
}

export function getMcpAccessTokenEffectiveStatus(
  token: Pick<McpAccessTokenRecord, "status" | "expiresAt">
): McpAccessTokenEffectiveStatus {
  if (token.status === "revoked") {
    return "revoked";
  }
  if (token.expiresAt && Date.parse(token.expiresAt) <= Date.now()) {
    return "expired";
  }
  return "active";
}

export function summarizeMcpAccessTokens(
  tokens: readonly McpAccessTokenRecord[]
): McpAccessTokenSummary {
  return {
    total: tokens.length,
    active: tokens.filter((token) => token.status === "active").length,
    activeUsable: tokens.filter((token) => getMcpAccessTokenEffectiveStatus(token) === "active")
      .length,
    expiredActive: tokens.filter((token) => getMcpAccessTokenEffectiveStatus(token) === "expired")
      .length,
    revoked: tokens.filter((token) => token.status === "revoked").length,
  };
}

export async function issueMcpAccessToken(
  pool: Pool,
  input: {
    label: unknown;
    scopes: unknown;
    issuedByUserId: string;
    expiresAt?: unknown;
    funnelScope?: unknown;
    allowedFunnelIds?: unknown;
  }
): Promise<McpAccessTokenRecord & { token: string }> {
  const label = buildTokenLabel(input.label);
  const scopes = normalizeScopes(input.scopes);
  const funnelScope = normalizeFunnelScopeInput(input);
  const tokenId = randomUUID();
  const tokenSecret = randomBytes(24).toString("base64url");
  const token = `npmcp_${tokenId.replace(/-/g, "")}.${tokenSecret}`;
  const tokenPrefix = token.slice(0, 18);
  const expiresAt = normalizeOptionalExpiry(input.expiresAt);

  const result = await pool.query<McpAccessTokenRow>(
    `
      insert into mcp_access_tokens (
        token_id,
        label,
        token_prefix,
        secret_hash,
        scopes,
        funnel_scope_json,
        status,
        issued_by_user_id,
        expires_at
      )
      values ($1, $2, $3, $4, $5::jsonb, $6::jsonb, 'active', $7, $8)
      returning
        token_id,
        label,
        token_prefix,
        scopes,
        funnel_scope_json,
        status,
        issued_by_user_id,
        revoked_by_user_id,
        revoked_at,
        expires_at,
        last_used_at,
        last_used_ip,
        last_used_user_agent,
        created_at,
        updated_at
    `,
    [
      tokenId,
      label,
      tokenPrefix,
      hashTokenSecret(token),
      JSON.stringify(scopes),
      JSON.stringify(funnelScope),
      input.issuedByUserId,
      expiresAt,
    ]
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error("Failed to create MCP access token.");
  }

  await writeAuditLog(pool, {
    actorUserId: input.issuedByUserId,
    actionType: "mcp_token_issued",
    entityType: "mcp_access_token",
    entityId: row.token_id,
    payloadJson: {
      label,
      scopes,
      funnelScope,
      tokenPrefix,
      expiresAt,
    },
  });

  return {
    ...mapTokenRow(row),
    token,
  };
}

export async function listMcpAccessTokens(pool: Pool): Promise<McpAccessTokenRecord[]> {
  const result = await pool.query<McpAccessTokenRow>(
    `
      select
        mat.token_id,
        mat.label,
        mat.token_prefix,
        mat.scopes,
        mat.funnel_scope_json,
        mat.status,
        mat.issued_by_user_id,
        mat.revoked_by_user_id,
        mat.revoked_at,
        mat.expires_at,
        mat.last_used_at,
        mat.last_used_ip,
        mat.last_used_user_agent,
        mat.created_at,
        mat.updated_at,
        coalesce((
          select count(*)::int
          from mcp_request_log mrl
          where mrl.token_id = mat.token_id
            and mrl.created_at >= now() - interval '1 day'
        ), 0) as recent_request_count
      from mcp_access_tokens mat
      order by mat.created_at desc
    `
  );
  return result.rows.map(mapTokenRow);
}

export async function revokeMcpAccessToken(
  pool: Pool,
  input: {
    tokenId: string;
    revokedByUserId: string;
    reason?: string | null;
  }
): Promise<McpAccessTokenRecord> {
  const result = await pool.query<McpAccessTokenRow>(
    `
      update mcp_access_tokens
      set
        status = 'revoked',
        revoked_by_user_id = $2,
        revoked_at = now(),
        updated_at = now()
      where token_id = $1
      returning
        token_id,
        label,
        token_prefix,
        scopes,
        funnel_scope_json,
        status,
        issued_by_user_id,
        revoked_by_user_id,
        revoked_at,
        expires_at,
        last_used_at,
        last_used_ip,
        last_used_user_agent,
        created_at,
        updated_at
    `,
    [input.tokenId, input.revokedByUserId]
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error(`MCP token ${input.tokenId} was not found.`);
  }

  await writeAuditLog(pool, {
    actorUserId: input.revokedByUserId,
    actionType: "mcp_token_revoked",
    entityType: "mcp_access_token",
    entityId: input.tokenId,
    payloadJson: {
      reason: input.reason ?? null,
    },
  });

  return mapTokenRow(row);
}

export async function deleteRevokedMcpAccessToken(
  pool: Pool,
  input: {
    tokenId: string;
    deletedByUserId: string;
  }
): Promise<McpAccessTokenRecord> {
  const result = await pool.query<McpAccessTokenRow>(
    `
      delete from mcp_access_tokens
      where token_id = $1
        and status = 'revoked'
      returning
        token_id,
        label,
        token_prefix,
        scopes,
        funnel_scope_json,
        status,
        issued_by_user_id,
        revoked_by_user_id,
        revoked_at,
        expires_at,
        last_used_at,
        last_used_ip,
        last_used_user_agent,
        created_at,
        updated_at
    `,
    [input.tokenId]
  );
  const row = result.rows[0];
  if (!row) {
    const statusResult = await pool.query<{ status: McpAccessTokenStatus }>(
      `
        select status
        from mcp_access_tokens
        where token_id = $1
        limit 1
      `,
      [input.tokenId]
    );
    const status = statusResult.rows[0]?.status;
    if (status === "active") {
      throw new Error("Only revoked MCP tokens can be deleted.");
    }
    throw new Error(`MCP token ${input.tokenId} was not found.`);
  }

  await writeAuditLog(pool, {
    actorUserId: input.deletedByUserId,
    actionType: "mcp_token_deleted",
    entityType: "mcp_access_token",
    entityId: input.tokenId,
    payloadJson: {
      label: row.label,
      tokenPrefix: row.token_prefix,
      funnelScope: normalizeFunnelScope(row.funnel_scope_json),
      status: row.status,
    },
  });

  return mapTokenRow(row);
}

export async function resolveMcpAccessTokenBySecret(
  pool: Pool,
  token: string
): Promise<McpAccessTokenRecord | null> {
  const result = await pool.query<McpAccessTokenRow>(
    `
      select
        token_id,
        label,
        token_prefix,
        scopes,
        funnel_scope_json,
        status,
        issued_by_user_id,
        revoked_by_user_id,
        revoked_at,
        expires_at,
        last_used_at,
        last_used_ip,
        last_used_user_agent,
        created_at,
        updated_at
      from mcp_access_tokens
      where secret_hash = $1
      limit 1
    `,
    [hashTokenSecret(token)]
  );
  const row = result.rows[0];
  if (!row) {
    return null;
  }
  return mapTokenRow(row);
}

export async function touchMcpAccessTokenUsage(
  queryable: Queryable,
  input: {
    tokenId: string;
    ipAddress?: string | null;
    userAgent?: string | null;
  }
): Promise<void> {
  await queryable.query(
    `
      update mcp_access_tokens
      set
        last_used_at = now(),
        last_used_ip = $2,
        last_used_user_agent = $3,
        updated_at = now()
      where token_id = $1
    `,
    [input.tokenId, input.ipAddress ?? null, input.userAgent ?? null]
  );
}

export async function recordMcpRequestLog(
  queryable: Queryable,
  input: {
    tokenId: string | null;
    requestMethod: string;
    toolName?: string | null;
    resourceUri?: string | null;
    promptName?: string | null;
    success: boolean;
    errorText?: string | null;
    requestJson?: Record<string, unknown>;
    responseJson?: Record<string, unknown>;
  }
): Promise<void> {
  await queryable.query(
    `
      insert into mcp_request_log (
        request_log_id,
        token_id,
        request_method,
        tool_name,
        resource_uri,
        prompt_name,
        success,
        error_text,
        request_json,
        response_json
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb)
    `,
    [
      randomUUID(),
      input.tokenId,
      input.requestMethod,
      input.toolName ?? null,
      input.resourceUri ?? null,
      input.promptName ?? null,
      input.success,
      input.errorText ?? null,
      JSON.stringify(input.requestJson ?? {}),
      JSON.stringify(input.responseJson ?? {}),
    ]
  );
}

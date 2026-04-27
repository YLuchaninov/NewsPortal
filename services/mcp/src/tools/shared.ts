import {
  hasMcpScope,
  writeAuditLog,
  type McpAccessTokenRecord,
  type McpScope,
} from "@newsportal/control-plane";
import { createNewsPortalSdk } from "@newsportal/sdk";
import type { Pool } from "pg";

import {
  JsonRpcError,
  readBooleanFlag,
  readOptionalInteger,
  readOptionalString,
} from "../protocol";

export {
  JsonRpcError,
  readBooleanFlag,
  readOptionalInteger,
  readOptionalString,
  readRequiredString,
} from "../protocol";
export type { McpAccessTokenRecord, McpScope } from "@newsportal/control-plane";

export type NewsPortalSdk = ReturnType<typeof createNewsPortalSdk>;

export interface McpToolContext {
  sdk: NewsPortalSdk;
  pool: Pool;
  token: McpAccessTokenRecord;
}

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  requiredScope: McpScope | "read";
  destructive?: boolean;
  handler: (context: McpToolContext, args: Record<string, unknown>) => Promise<unknown>;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function readPageArgs(args: Record<string, unknown>) {
  return {
    page: readOptionalInteger(args.page),
    pageSize: readOptionalInteger(args.pageSize),
  };
}

export function readPayload(args: Record<string, unknown>): Record<string, unknown> {
  const payload = args.payload;
  if (payload != null && typeof payload === "object" && !Array.isArray(payload)) {
    return { ...(payload as Record<string, unknown>) };
  }
  throw new JsonRpcError(-32602, "payload must be a JSON object.", {
    statusCode: 400,
  });
}

export function withActorDefault(
  payload: Record<string, unknown>,
  fieldName: string,
  actorUserId: string
): Record<string, unknown> {
  return {
    ...payload,
    [fieldName]: readOptionalString(payload[fieldName]) ?? actorUserId,
  };
}

function normalizeAuditEntityId(entityId: string | null | undefined): string | null {
  const normalized = String(entityId ?? "").trim();
  return UUID_RE.test(normalized) ? normalized : null;
}

export async function writeMcpMutationAudit(
  pool: Pool,
  token: McpAccessTokenRecord,
  input: {
    actionType: string;
    entityType: string;
    entityId?: string | null;
    payloadJson?: Record<string, unknown>;
  }
): Promise<void> {
  await writeAuditLog(pool, {
    actorUserId: token.issuedByUserId,
    actionType: input.actionType,
    entityType: input.entityType,
    entityId: normalizeAuditEntityId(input.entityId),
    payloadJson: {
      via: "mcp",
      mcpTokenId: token.tokenId,
      mcpTokenLabel: token.label,
      ...input.payloadJson,
    },
  });
}

export async function requireScope(
  token: McpAccessTokenRecord,
  requiredScope: McpScope | "read"
): Promise<void> {
  if (!hasMcpScope(token.scopes, requiredScope)) {
    throw new JsonRpcError(-32004, `MCP token is missing required scope "${requiredScope}".`, {
      statusCode: 403,
    });
  }
}

export function requireDestructiveConfirmation(
  token: McpAccessTokenRecord,
  args: Record<string, unknown>
): void {
  if (!hasMcpScope(token.scopes, "write.destructive")) {
    throw new JsonRpcError(-32004, "Destructive MCP tools require scope \"write.destructive\".", {
      statusCode: 403,
    });
  }
  if (!readBooleanFlag(args.confirm, "confirm")) {
    throw new JsonRpcError(
      -32602,
      "Destructive MCP tools require confirm=true in the tool arguments.",
      {
        statusCode: 400,
      }
    );
  }
}

export const pagingSchema = {
  type: "object",
  properties: {
    page: { type: "number" },
    pageSize: { type: "number" },
  },
  additionalProperties: true,
} satisfies Record<string, unknown>;

export const detailSchema = {
  type: "object",
  additionalProperties: true,
} satisfies Record<string, unknown>;

export const contentDetailSchema = {
  type: "object",
  properties: {
    docId: { type: "string" },
    contentItemId: { type: "string" },
    includeBody: { type: "boolean" },
    includeBodyHtml: { type: "boolean" },
    includeRawPayload: { type: "boolean" },
    includeMediaAssets: { type: "boolean" },
  },
  additionalProperties: false,
} satisfies Record<string, unknown>;

function isFlagEnabled(value: unknown): boolean {
  return value === true || String(value ?? "").trim().toLowerCase() === "true";
}

export function readOptionalContentSort(
  value: unknown
): "latest" | "oldest" | "title_asc" | "title_desc" | undefined {
  const normalized = readOptionalString(value);
  if (
    normalized === "latest" ||
    normalized === "oldest" ||
    normalized === "title_asc" ||
    normalized === "title_desc"
  ) {
    return normalized;
  }
  return undefined;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : null;
}

export function shapeContentLikeRecord(
  value: unknown,
  args: Record<string, unknown>
): Record<string, unknown> | null {
  const record = asObject(value);
  if (!record) {
    return null;
  }
  if (!isFlagEnabled(args.includeBody)) {
    delete record.body;
  }
  if (!isFlagEnabled(args.includeBodyHtml)) {
    delete record.body_html;
    delete record.full_content_html;
  }
  if (!isFlagEnabled(args.includeRawPayload)) {
    delete record.raw_payload_json;
  }
  if (!isFlagEnabled(args.includeMediaAssets)) {
    delete record.media_assets;
    delete record.media_json;
  }
  return record;
}

export function shapePaginatedContentItems(
  value: unknown,
  args: Record<string, unknown>
): Record<string, unknown> {
  const payload = asObject(value) ?? {};
  const items = Array.isArray(payload.items)
    ? payload.items.map((entry) => shapeContentLikeRecord(entry, args) ?? entry)
    : [];
  return {
    ...payload,
    items,
  };
}

export function shapeExplainPayload(
  value: unknown,
  itemKey: "article" | "content_item",
  args: Record<string, unknown>
): Record<string, unknown> {
  const payload = asObject(value) ?? {};
  return {
    ...payload,
    [itemKey]: shapeContentLikeRecord(payload[itemKey], args) ?? payload[itemKey],
  };
}

export function createReadTool(
  name: string,
  description: string,
  inputSchema: Record<string, unknown>,
  handler: McpToolDefinition["handler"]
): McpToolDefinition {
  return {
    name,
    description,
    inputSchema,
    requiredScope: "read",
    handler,
  };
}

export function createWriteTool(
  name: string,
  description: string,
  requiredScope: McpScope,
  inputSchema: Record<string, unknown>,
  handler: McpToolDefinition["handler"],
  destructive = false
): McpToolDefinition {
  return {
    name,
    description,
    inputSchema,
    requiredScope,
    destructive,
    handler,
  };
}

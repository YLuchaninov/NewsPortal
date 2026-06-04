import {
  hasMcpScope,
  writeAuditLog,
  type McpAccessTokenRecord,
  type McpScope,
} from "@signalops/control-plane";
import {
  MUTATION_RESULT_SCHEMA,
  type JsonSchema,
} from "@signalops/contracts";
import { createSignalOpsSdk } from "@signalops/sdk";
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
export type { McpAccessTokenRecord, McpScope } from "@signalops/control-plane";

export type SignalOpsSdk = ReturnType<typeof createSignalOpsSdk>;

export interface McpToolContext {
  sdk: SignalOpsSdk;
  pool: Pool;
  token: McpAccessTokenRecord;
}

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  outputSchema?: JsonSchema;
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
    if (Object.prototype.hasOwnProperty.call(payload, "payload")) {
      throw new JsonRpcError(
        -32602,
        "payload.payload is not allowed. Pass the backend payload directly as arguments.payload.",
        {
          statusCode: 400,
          data: {
            path: "payload.payload",
            code: "nested_payload_not_allowed",
            expectedShape: "arguments.payload must be the API payload object, not an envelope.",
          },
        }
      );
    }
    return { ...(payload as Record<string, unknown>) };
  }
  throw new JsonRpcError(-32602, "payload must be a JSON object.", {
    statusCode: 400,
    data: {
      path: "payload",
      code: "invalid_type",
      expectedShape: "JSON object",
    },
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

export interface StringListFieldSpec {
  splitCommas?: boolean;
  allowedValues?: readonly string[];
}

export function normalizeStringListInput(
  value: unknown,
  path: string,
  spec: StringListFieldSpec = {}
): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  const splitCommas = spec.splitCommas ?? true;
  const values = Array.isArray(value) ? value : [value];
  const items = values
    .flatMap((entry) => String(entry ?? "").split(/\r?\n/u))
    .flatMap((entry) => (splitCommas ? entry.split(",") : [entry]))
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (spec.allowedValues) {
    const invalid = items.find((entry) => !spec.allowedValues?.includes(entry));
    if (invalid) {
      throw new JsonRpcError(-32602, `${path} contains unsupported value "${invalid}".`, {
        statusCode: 400,
        data: {
          path,
          code: "invalid_enum",
          allowedValues: [...spec.allowedValues],
        },
      });
    }
  }

  return items;
}

export function normalizePayloadStringListFields(
  payload: Record<string, unknown>,
  specs: Record<string, StringListFieldSpec | undefined>,
  pathPrefix = "payload"
): Record<string, unknown> {
  const normalized = { ...payload };
  for (const [fieldName, spec] of Object.entries(specs)) {
    if (!Object.prototype.hasOwnProperty.call(normalized, fieldName)) {
      continue;
    }
    const list = normalizeStringListInput(
      normalized[fieldName],
      `${pathPrefix}.${fieldName}`,
      spec
    );
    if (list !== undefined) {
      normalized[fieldName] = list;
    }
  }
  return normalized;
}

export function normalizeRecordStringListFields(
  value: unknown,
  specs: Record<string, StringListFieldSpec | undefined>,
  pathPrefix: string
): unknown {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }
  return normalizePayloadStringListFields(value as Record<string, unknown>, specs, pathPrefix);
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
} satisfies JsonSchema;

export const detailSchema = {
  type: "object",
  additionalProperties: true,
} satisfies JsonSchema;

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
} satisfies JsonSchema;

const UUID_PREFIX_RE = /^[0-9a-f-]{8,35}$/i;

export type McpQueryablePool = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
};

export function readAliasedRequiredString(
  args: Record<string, unknown>,
  canonicalField: string,
  aliases: readonly string[]
): string {
  for (const fieldName of [canonicalField, ...aliases]) {
    const value = readOptionalString(args[fieldName]);
    if (value) {
      return value;
    }
  }
  throw new JsonRpcError(
    -32602,
    `${canonicalField} is required. Accepted aliases: ${aliases.join(", ")}.`,
    {
      statusCode: 400,
      data: {
        path: canonicalField,
        acceptedAliases: [canonicalField, ...aliases],
      },
    }
  );
}

export function readRequiredUuidString(value: unknown, path: string): string {
  const normalized = readOptionalString(value);
  if (normalized && UUID_RE.test(normalized)) {
    return normalized;
  }
  throw new JsonRpcError(-32602, `${path} must be a full UUID.`, {
    statusCode: 400,
    data: {
      path,
      expectedShape: "full UUID",
    },
  });
}

export function readOptionalUuidString(value: unknown, path: string): string | undefined {
  if (value == null || value === "") {
    return undefined;
  }
  const normalized = readOptionalString(value);
  if (normalized && UUID_RE.test(normalized)) {
    return normalized;
  }
  throw new JsonRpcError(-32602, `${path} must be a full UUID.`, {
    statusCode: 400,
    data: {
      path,
      expectedShape: "full UUID",
    },
  });
}

export async function resolveUniqueUuidPrefix(
  pool: McpQueryablePool,
  value: unknown,
  input: {
    path: string;
    tableName: string;
    columnName: string;
    label: string;
  }
): Promise<string | undefined> {
  const normalized = readOptionalString(value);
  if (!normalized) {
    return undefined;
  }
  if (UUID_RE.test(normalized)) {
    return normalized;
  }
  if (!UUID_PREFIX_RE.test(normalized)) {
    throw new JsonRpcError(-32602, `${input.path} must be a full UUID or a unique UUID prefix.`, {
      statusCode: 400,
      data: {
        path: input.path,
        expectedShape: "UUID or unique UUID prefix of at least 8 hex characters",
      },
    });
  }

  const result = await pool.query(
    `
      select ${input.columnName}::text as id
        from ${input.tableName}
       where ${input.columnName}::text like $1
       order by ${input.columnName}::text
       limit 2
    `,
    [`${normalized}%`]
  );
  const rows = result.rows as Array<{ id: string }>;
  if (rows.length === 1) {
    return rows[0]?.id;
  }
  if (rows.length > 1) {
    throw new JsonRpcError(-32602, `${input.path} prefix is ambiguous; pass the full UUID.`, {
      statusCode: 400,
      data: {
        path: input.path,
        value: normalized,
        matches: rows.map((row) => row.id),
      },
    });
  }
  throw new JsonRpcError(-32602, `${input.label} ${normalized} was not found.`, {
    statusCode: 400,
    data: {
      path: input.path,
      value: normalized,
    },
  });
}

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
  itemKey: "signal_candidate" | "content_item",
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
  inputSchema: JsonSchema,
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
  inputSchema: JsonSchema,
  handler: McpToolDefinition["handler"],
  destructive = false
): McpToolDefinition {
  return {
    name,
    description,
    inputSchema,
    outputSchema: MUTATION_RESULT_SCHEMA,
    requiredScope,
    destructive,
    handler,
  };
}

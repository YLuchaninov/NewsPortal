import { MCP_TEMPLATE_ARGUMENT_SCHEMAS } from "@newsportal/contracts";
import {
  deleteTemplateWithAudit,
  saveTemplateFromPayload,
  setTemplateActiveStateWithAudit,
} from "@newsportal/control-plane";

import {
  createReadTool,
  createWriteTool,
  JsonRpcError,
  pagingSchema,
  readPageArgs,
  readPayload,
  readRequiredUuidString,
  requireDestructiveConfirmation,
  type McpToolDefinition
} from "./shared";

const systemInterestDetailSchema = {
  type: "object",
  properties: {
    interestTemplateId: { type: "string" },
    systemInterestId: { type: "string" },
    interestId: { type: "string" },
    entityId: { type: "string" },
  },
  additionalProperties: false,
} as const;

const llmTemplateDetailSchema = {
  type: "object",
  properties: {
    promptTemplateId: { type: "string" },
    llmTemplateId: { type: "string" },
    templateId: { type: "string" },
    entityId: { type: "string" },
  },
  additionalProperties: false,
} as const;

function readAliasedId(
  args: Record<string, unknown>,
  canonicalField: string,
  aliases: readonly string[]
): string {
  for (const fieldName of [canonicalField, ...aliases]) {
    const value = String(args[fieldName] ?? "").trim();
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

function readSystemInterestId(args: Record<string, unknown>): string {
  return readAliasedId(args, "interestTemplateId", [
    "systemInterestId",
    "interestId",
    "entityId",
  ]);
}

function readLlmTemplateId(args: Record<string, unknown>): string {
  return readAliasedId(args, "promptTemplateId", ["llmTemplateId", "templateId", "entityId"]);
}

function readSystemInterestUuidId(args: Record<string, unknown>): string {
  return readRequiredUuidString(readSystemInterestId(args), "interestTemplateId");
}

function readLlmTemplateUuidId(args: Record<string, unknown>): string {
  return readRequiredUuidString(readLlmTemplateId(args), "promptTemplateId");
}

function readSystemInterestPayload(args: Record<string, unknown>): Record<string, unknown> {
  const payload = readPayload(args);
  if (Object.prototype.hasOwnProperty.call(payload, "interestTemplateId")) {
    payload.interestTemplateId = readRequiredUuidString(
      payload.interestTemplateId,
      "payload.interestTemplateId"
    );
  }
  return payload;
}

function readLlmTemplatePayload(args: Record<string, unknown>): Record<string, unknown> {
  const payload = readPayload(args);
  if (Object.prototype.hasOwnProperty.call(payload, "promptTemplateId")) {
    payload.promptTemplateId = readRequiredUuidString(
      payload.promptTemplateId,
      "payload.promptTemplateId"
    );
  }
  return payload;
}

export const TEMPLATE_MCP_TOOLS: readonly McpToolDefinition[] = [
  createReadTool(
    "system_interests.list",
    "List system interests from the public read surface.",
    pagingSchema,
    async ({ sdk }, args) => sdk.listSystemInterestsPage<Record<string, unknown>>(readPageArgs(args))
  ),
  createReadTool(
    "system_interests.read",
    "Read one system interest. Prefer interestTemplateId; entityId, systemInterestId, and interestId are accepted aliases for client read-back.",
    systemInterestDetailSchema,
    async ({ sdk }, args) => sdk.getSystemInterest<Record<string, unknown>>(readSystemInterestId(args))
  ),
  createReadTool(
    "llm_templates.list",
    "List LLM prompt templates.",
    pagingSchema,
    async ({ sdk }, args) => sdk.listLlmTemplatesPage<Record<string, unknown>>(readPageArgs(args))
  ),
  createReadTool(
    "llm_templates.read",
    "Read one LLM prompt template. Prefer promptTemplateId; entityId, templateId, and llmTemplateId are accepted aliases for client read-back.",
    llmTemplateDetailSchema,
    async ({ sdk }, args) => sdk.getLlmTemplate<Record<string, unknown>>(readLlmTemplateId(args))
  ),
  createWriteTool(
    "system_interests.create",
    "Create a system interest through the shared control-plane service. List-like fields such as positive_texts, negative_texts, allowed_content_kinds, languages_allowed, and must_not terms accept newline-separated strings or string arrays.",
    "write.templates",
    MCP_TEMPLATE_ARGUMENT_SCHEMAS.systemInterestCreate,
    async ({ pool, token }, args) => {
      const payload = {
        ...readSystemInterestPayload(args),
        kind: "interest",
      };
      return saveTemplateFromPayload(pool, token.issuedByUserId, payload);
    }
  ),
  createWriteTool(
    "system_interests.update",
    "Update a system interest through the shared control-plane service. List-like fields such as positive_texts, negative_texts, allowed_content_kinds, languages_allowed, and must_not terms accept newline-separated strings or string arrays.",
    "write.templates",
    MCP_TEMPLATE_ARGUMENT_SCHEMAS.systemInterestUpdate,
    async ({ pool, token }, args) => {
      const payload = {
        ...readSystemInterestPayload(args),
        kind: "interest",
      };
      return saveTemplateFromPayload(pool, token.issuedByUserId, payload);
    }
  ),
  createWriteTool(
    "system_interests.archive",
    "Archive a system interest.",
    "write.templates",
    {
      type: "object",
      required: ["confirm"],
      properties: {
        ...systemInterestDetailSchema.properties,
        confirm: { type: "boolean" },
      },
      additionalProperties: false,
    },
    async ({ pool, token }, args) => {
      requireDestructiveConfirmation(token, args);
      const interestTemplateId = readSystemInterestUuidId(args);
      await setTemplateActiveStateWithAudit(
        pool,
        token.issuedByUserId,
        "interest",
        interestTemplateId,
        false
      );
      return {
        ok: true,
        interestTemplateId,
        status: "archived",
      };
    },
    true
  ),
  createWriteTool(
    "system_interests.delete",
    "Delete a system interest.",
    "write.templates",
    {
      type: "object",
      required: ["confirm"],
      properties: {
        ...systemInterestDetailSchema.properties,
        confirm: { type: "boolean" },
      },
      additionalProperties: false,
    },
    async ({ pool, token }, args) => {
      requireDestructiveConfirmation(token, args);
      const interestTemplateId = readSystemInterestUuidId(args);
      await deleteTemplateWithAudit(pool, token.issuedByUserId, "interest", interestTemplateId);
      return {
        ok: true,
        interestTemplateId,
      };
    },
    true
  ),
  createWriteTool(
    "llm_templates.create",
    "Create an LLM template through the shared control-plane service.",
    "write.templates",
    MCP_TEMPLATE_ARGUMENT_SCHEMAS.llmTemplateCreate,
    async ({ pool, token }, args) => {
      const payload = {
        ...readLlmTemplatePayload(args),
        kind: "llm",
      };
      return saveTemplateFromPayload(pool, token.issuedByUserId, payload);
    }
  ),
  createWriteTool(
    "llm_templates.update",
    "Update an LLM template through the shared control-plane service.",
    "write.templates",
    MCP_TEMPLATE_ARGUMENT_SCHEMAS.llmTemplateUpdate,
    async ({ pool, token }, args) => {
      const payload = {
        ...readLlmTemplatePayload(args),
        kind: "llm",
      };
      return saveTemplateFromPayload(pool, token.issuedByUserId, payload);
    }
  ),
  createWriteTool(
    "llm_templates.archive",
    "Archive an LLM template.",
    "write.templates",
    {
      type: "object",
      required: ["confirm"],
      properties: {
        ...llmTemplateDetailSchema.properties,
        confirm: { type: "boolean" },
      },
      additionalProperties: false,
    },
    async ({ pool, token }, args) => {
      requireDestructiveConfirmation(token, args);
      const promptTemplateId = readLlmTemplateUuidId(args);
      await setTemplateActiveStateWithAudit(
        pool,
        token.issuedByUserId,
        "llm",
        promptTemplateId,
        false
      );
      return {
        ok: true,
        promptTemplateId,
        status: "archived",
      };
    },
    true
  ),
  createWriteTool(
    "llm_templates.delete",
    "Delete an LLM template.",
    "write.templates",
    {
      type: "object",
      required: ["confirm"],
      properties: {
        ...llmTemplateDetailSchema.properties,
        confirm: { type: "boolean" },
      },
      additionalProperties: false,
    },
    async ({ pool, token }, args) => {
      requireDestructiveConfirmation(token, args);
      const promptTemplateId = readLlmTemplateUuidId(args);
      await deleteTemplateWithAudit(pool, token.issuedByUserId, "llm", promptTemplateId);
      return {
        ok: true,
        promptTemplateId,
      };
    },
    true
  ),
] as const;

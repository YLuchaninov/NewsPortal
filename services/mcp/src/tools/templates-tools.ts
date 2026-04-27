import {
  deleteTemplateWithAudit,
  saveTemplateFromPayload,
  setTemplateActiveStateWithAudit,
} from "@newsportal/control-plane";

import {
  createReadTool,
  createWriteTool,
  pagingSchema,
  detailSchema,
  readPageArgs,
  readPayload,
  requireDestructiveConfirmation,
  readRequiredString,
  type McpToolDefinition
} from "./shared";

export const TEMPLATE_MCP_TOOLS: readonly McpToolDefinition[] = [
  createReadTool(
    "system_interests.list",
    "List system interests from the public read surface.",
    pagingSchema,
    async ({ sdk }, args) => sdk.listSystemInterestsPage<Record<string, unknown>>(readPageArgs(args))
  ),
  createReadTool(
    "system_interests.read",
    "Read one system interest.",
    detailSchema,
    async ({ sdk }, args) =>
      sdk.getSystemInterest<Record<string, unknown>>(
        readRequiredString(args.interestTemplateId, "interestTemplateId")
      )
  ),
  createReadTool(
    "llm_templates.list",
    "List LLM prompt templates.",
    pagingSchema,
    async ({ sdk }, args) => sdk.listLlmTemplatesPage<Record<string, unknown>>(readPageArgs(args))
  ),
  createReadTool(
    "llm_templates.read",
    "Read one LLM prompt template.",
    detailSchema,
    async ({ sdk }, args) =>
      sdk.getLlmTemplate<Record<string, unknown>>(
        readRequiredString(args.promptTemplateId, "promptTemplateId")
      )
  ),
  createWriteTool(
    "system_interests.create",
    "Create a system interest through the shared control-plane service.",
    "write.templates",
    {
      type: "object",
      required: ["payload"],
      properties: {
        payload: { type: "object" },
      },
      additionalProperties: false,
    },
    async ({ pool, token }, args) => {
      const payload = {
        ...readPayload(args),
        kind: "interest",
      };
      return saveTemplateFromPayload(pool, token.issuedByUserId, payload);
    }
  ),
  createWriteTool(
    "system_interests.update",
    "Update a system interest through the shared control-plane service.",
    "write.templates",
    {
      type: "object",
      required: ["payload"],
      properties: {
        payload: { type: "object" },
      },
      additionalProperties: false,
    },
    async ({ pool, token }, args) => {
      const payload = {
        ...readPayload(args),
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
      required: ["interestTemplateId", "confirm"],
      properties: {
        interestTemplateId: { type: "string" },
        confirm: { type: "boolean" },
      },
      additionalProperties: false,
    },
    async ({ pool, token }, args) => {
      requireDestructiveConfirmation(token, args);
      const interestTemplateId = readRequiredString(
        args.interestTemplateId,
        "interestTemplateId"
      );
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
      required: ["interestTemplateId", "confirm"],
      properties: {
        interestTemplateId: { type: "string" },
        confirm: { type: "boolean" },
      },
      additionalProperties: false,
    },
    async ({ pool, token }, args) => {
      requireDestructiveConfirmation(token, args);
      const interestTemplateId = readRequiredString(
        args.interestTemplateId,
        "interestTemplateId"
      );
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
    {
      type: "object",
      required: ["payload"],
      properties: {
        payload: { type: "object" },
      },
      additionalProperties: false,
    },
    async ({ pool, token }, args) => {
      const payload = {
        ...readPayload(args),
        kind: "llm",
      };
      return saveTemplateFromPayload(pool, token.issuedByUserId, payload);
    }
  ),
  createWriteTool(
    "llm_templates.update",
    "Update an LLM template through the shared control-plane service.",
    "write.templates",
    {
      type: "object",
      required: ["payload"],
      properties: {
        payload: { type: "object" },
      },
      additionalProperties: false,
    },
    async ({ pool, token }, args) => {
      const payload = {
        ...readPayload(args),
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
      required: ["promptTemplateId", "confirm"],
      properties: {
        promptTemplateId: { type: "string" },
        confirm: { type: "boolean" },
      },
      additionalProperties: false,
    },
    async ({ pool, token }, args) => {
      requireDestructiveConfirmation(token, args);
      const promptTemplateId = readRequiredString(args.promptTemplateId, "promptTemplateId");
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
      required: ["promptTemplateId", "confirm"],
      properties: {
        promptTemplateId: { type: "string" },
        confirm: { type: "boolean" },
      },
      additionalProperties: false,
    },
    async ({ pool, token }, args) => {
      requireDestructiveConfirmation(token, args);
      const promptTemplateId = readRequiredString(args.promptTemplateId, "promptTemplateId");
      await deleteTemplateWithAudit(pool, token.issuedByUserId, "llm", promptTemplateId);
      return {
        ok: true,
        promptTemplateId,
      };
    },
    true
  ),
] as const;

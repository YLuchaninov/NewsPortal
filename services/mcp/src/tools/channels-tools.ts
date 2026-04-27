import { deleteChannelWithAudit, saveChannelFromPayload } from "@newsportal/control-plane";

import {
  createReadTool,
  createWriteTool,
  detailSchema,
  readPageArgs,
  readPayload,
  requireDestructiveConfirmation,
  readOptionalInteger,
  readOptionalString,
  readRequiredString,
  type McpToolDefinition
} from "./shared";

export const CHANNEL_MCP_TOOLS: readonly McpToolDefinition[] = [
  createReadTool(
    "channels.list",
    "List channels with optional provider filter.",
    {
      type: "object",
      properties: {
        page: { type: "number" },
        pageSize: { type: "number" },
        providerType: { type: "string" },
      },
      additionalProperties: false,
    },
    async ({ sdk }, args) =>
      sdk.listChannelsPage<Record<string, unknown>>({
        ...readPageArgs(args),
        providerType: readOptionalString(args.providerType) ?? undefined,
      })
  ),
  createReadTool(
    "channels.read",
    "Read one channel.",
    detailSchema,
    async ({ sdk }, args) =>
      sdk.getChannel<Record<string, unknown>>(readRequiredString(args.channelId, "channelId"))
  ),
  createReadTool(
    "fetch_runs.list",
    "List fetch runs.",
    {
      type: "object",
      properties: {
        channelId: { type: "string" },
        page: { type: "number" },
        pageSize: { type: "number" },
      },
      additionalProperties: false,
    },
    async ({ sdk }, args) => {
      const page = readOptionalInteger(args.page);
      const pageSize = readOptionalInteger(args.pageSize);
      if (page || pageSize) {
        return sdk.listFetchRunsPage<Record<string, unknown>>({
          page,
          pageSize,
          channelId: readOptionalString(args.channelId) ?? undefined,
        });
      }
      return sdk.listFetchRuns<Record<string, unknown>>(
        readOptionalString(args.channelId) ?? undefined
      );
    }
  ),
  createWriteTool(
    "channels.create",
    "Create a channel through the shared control-plane service.",
    "write.channels",
    {
      type: "object",
      required: ["payload"],
      properties: {
        payload: { type: "object" },
      },
      additionalProperties: false,
    },
    async ({ pool, token }, args) =>
      saveChannelFromPayload(pool, token.issuedByUserId, readPayload(args))
  ),
  createWriteTool(
    "channels.update",
    "Update a channel through the shared control-plane service.",
    "write.channels",
    {
      type: "object",
      required: ["payload"],
      properties: {
        payload: { type: "object" },
      },
      additionalProperties: false,
    },
    async ({ pool, token }, args) =>
      saveChannelFromPayload(pool, token.issuedByUserId, readPayload(args))
  ),
  createWriteTool(
    "channels.delete",
    "Delete or archive a channel depending on stored items.",
    "write.channels",
    {
      type: "object",
      required: ["channelId", "confirm"],
      properties: {
        channelId: { type: "string" },
        confirm: { type: "boolean" },
      },
      additionalProperties: false,
    },
    async ({ pool, token }, args) => {
      requireDestructiveConfirmation(token, args);
      return deleteChannelWithAudit(
        pool,
        token.issuedByUserId,
        readRequiredString(args.channelId, "channelId")
      );
    },
    true
  ),
] as const;

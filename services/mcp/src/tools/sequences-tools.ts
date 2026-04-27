import {
  createReadTool,
  createWriteTool,
  pagingSchema,
  detailSchema,
  readPageArgs,
  readPayload,
  withActorDefault,
  writeMcpMutationAudit,
  requireDestructiveConfirmation,
  readOptionalString,
  readRequiredString,
  type McpToolDefinition
} from "./shared";

export const SEQUENCE_MCP_TOOLS: readonly McpToolDefinition[] = [
  createReadTool(
    "sequences.list",
    "List sequences from the maintenance API.",
    pagingSchema,
    async ({ sdk }, args) => sdk.listSequencesPage<Record<string, unknown>>(readPageArgs(args))
  ),
  createReadTool(
    "sequences.read",
    "Read one sequence.",
    detailSchema,
    async ({ sdk }, args) =>
      sdk.getSequence<Record<string, unknown>>(readRequiredString(args.sequenceId, "sequenceId"))
  ),
  createReadTool(
    "sequences.plugins.list",
    "List available sequence plugins.",
    { type: "object", additionalProperties: false },
    async ({ sdk }) => sdk.listSequencePlugins<Record<string, unknown>>()
  ),
  createReadTool(
    "sequences.runs.read",
    "Read one sequence run.",
    detailSchema,
    async ({ sdk }, args) =>
      sdk.getSequenceRun<Record<string, unknown>>(readRequiredString(args.runId, "runId"))
  ),
  createReadTool(
    "sequences.run_task_runs.list",
    "List task runs for a sequence run.",
    detailSchema,
    async ({ sdk }, args) =>
      sdk.getSequenceRunTaskRuns<Record<string, unknown>>(readRequiredString(args.runId, "runId"))
  ),
  createWriteTool(
    "sequences.create",
    "Create a sequence through the maintenance API.",
    "write.sequences",
    {
      type: "object",
      required: ["payload"],
      properties: {
        payload: { type: "object" },
      },
      additionalProperties: false,
    },
    async ({ sdk, pool, token }, args) => {
      const payload = withActorDefault(readPayload(args), "createdBy", token.issuedByUserId);
      const result = await sdk.createSequence<Record<string, unknown>>(payload);
      await writeMcpMutationAudit(pool, token, {
        actionType: "sequence_created",
        entityType: "sequence",
        entityId: String(result.sequence_id ?? ""),
        payloadJson: {
          title: result.title ?? payload.title ?? null,
        },
      });
      return result;
    }
  ),
  createWriteTool(
    "sequences.update",
    "Update a sequence through the maintenance API.",
    "write.sequences",
    {
      type: "object",
      required: ["sequenceId", "payload"],
      properties: {
        sequenceId: { type: "string" },
        payload: { type: "object" },
      },
      additionalProperties: false,
    },
    async ({ sdk, pool, token }, args) => {
      const sequenceId = readRequiredString(args.sequenceId, "sequenceId");
      const result = await sdk.updateSequence<Record<string, unknown>>(sequenceId, readPayload(args));
      await writeMcpMutationAudit(pool, token, {
        actionType: "sequence_updated",
        entityType: "sequence",
        entityId: sequenceId,
      });
      return result;
    }
  ),
  createWriteTool(
    "sequences.run",
    "Request a sequence run.",
    "write.sequences",
    {
      type: "object",
      required: ["sequenceId"],
      properties: {
        sequenceId: { type: "string" },
        payload: { type: "object" },
      },
      additionalProperties: false,
    },
    async ({ sdk, pool, token }, args) => {
      const sequenceId = readRequiredString(args.sequenceId, "sequenceId");
      const payload =
        args.payload == null
          ? {}
          : readPayload(args);
      const result = await sdk.requestSequenceRun<Record<string, unknown>>(sequenceId, {
        ...payload,
        requestedBy: readOptionalString(payload.requestedBy) ?? token.issuedByUserId,
        triggerMeta:
          payload.triggerMeta != null &&
          typeof payload.triggerMeta === "object" &&
          !Array.isArray(payload.triggerMeta)
            ? {
                ...(payload.triggerMeta as Record<string, unknown>),
                requestedFrom: "mcp",
              }
            : {
                requestedFrom: "mcp",
              },
      });
      await writeMcpMutationAudit(pool, token, {
        actionType: "sequence_run_requested",
        entityType: "sequence_run",
        entityId: String(result.run_id ?? ""),
        payloadJson: {
          sequenceId,
        },
      });
      return result;
    }
  ),
  createWriteTool(
    "sequences.retry_run",
    "Retry a sequence run.",
    "write.sequences",
    {
      type: "object",
      required: ["runId"],
      properties: {
        runId: { type: "string" },
        payload: { type: "object" },
      },
      additionalProperties: false,
    },
    async ({ sdk, pool, token }, args) => {
      const runId = readRequiredString(args.runId, "runId");
      const payload =
        args.payload == null
          ? {}
          : readPayload(args);
      const result = await sdk.retrySequenceRun<Record<string, unknown>>(runId, {
        ...payload,
        requestedBy: readOptionalString(payload.requestedBy) ?? token.issuedByUserId,
        triggerMeta:
          payload.triggerMeta != null &&
          typeof payload.triggerMeta === "object" &&
          !Array.isArray(payload.triggerMeta)
            ? {
                ...(payload.triggerMeta as Record<string, unknown>),
                requestedFrom: "mcp",
              }
            : {
                requestedFrom: "mcp",
              },
      });
      await writeMcpMutationAudit(pool, token, {
        actionType: "sequence_run_retried",
        entityType: "sequence_run",
        entityId: String(result.run_id ?? runId),
      });
      return result;
    }
  ),
  createWriteTool(
    "sequences.cancel_run",
    "Cancel a pending sequence run.",
    "write.sequences",
    {
      type: "object",
      required: ["runId"],
      properties: {
        runId: { type: "string" },
        payload: { type: "object" },
      },
      additionalProperties: false,
    },
    async ({ sdk, pool, token }, args) => {
      const runId = readRequiredString(args.runId, "runId");
      const payload = args.payload == null ? {} : readPayload(args);
      const result = await sdk.cancelSequenceRun<Record<string, unknown>>(runId, payload);
      await writeMcpMutationAudit(pool, token, {
        actionType: "sequence_run_cancelled",
        entityType: "sequence_run",
        entityId: runId,
      });
      return result;
    }
  ),
  createWriteTool(
    "sequences.archive",
    "Archive a sequence.",
    "write.sequences",
    {
      type: "object",
      required: ["sequenceId", "confirm"],
      properties: {
        sequenceId: { type: "string" },
        confirm: { type: "boolean" },
      },
      additionalProperties: false,
    },
    async ({ sdk, pool, token }, args) => {
      requireDestructiveConfirmation(token, args);
      const sequenceId = readRequiredString(args.sequenceId, "sequenceId");
      const result = await sdk.archiveSequence<Record<string, unknown>>(sequenceId);
      await writeMcpMutationAudit(pool, token, {
        actionType: "sequence_archived",
        entityType: "sequence",
        entityId: sequenceId,
      });
      return result;
    },
    true
  ),
] as const;

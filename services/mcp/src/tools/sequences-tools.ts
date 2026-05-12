import {
  MCP_SEQUENCE_ARGUMENT_SCHEMAS,
} from "@newsportal/contracts";
import { queueReindexJobWithSupersession } from "@newsportal/control-plane";

import {
  createReadTool,
  createWriteTool,
  pagingSchema,
  readPageArgs,
  readPayload,
  normalizePayloadStringListFields,
  withActorDefault,
  JsonRpcError,
  writeMcpMutationAudit,
  requireDestructiveConfirmation,
  readAliasedRequiredString,
  readOptionalString,
  readRequiredUuidString,
  resolveUniqueUuidPrefix,
  type McpToolDefinition
} from "./shared";

function readRecord(value: unknown, fieldName: string): Record<string, unknown> {
  if (value != null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  throw new JsonRpcError(-32602, `${fieldName} must be a JSON object.`, {
    statusCode: 400,
  });
}

function readOptionalRecord(value: unknown, fieldName: string): Record<string, unknown> {
  if (value == null) {
    return {};
  }
  return readRecord(value, fieldName);
}

const REINDEX_INDEX_NAMES = ["interest_centroids", "event_cluster_centroids"] as const;
const REINDEX_JOB_KINDS = ["rebuild", "backfill"] as const;
const REINDEX_BACKFILL_DEFAULT_OPTIONS = {
  batchSize: 100,
  retroNotifications: "skip",
  replayExistingArticles: true,
  includeEnrichment: false,
  forceEnrichment: false,
} as const;
const REINDEX_BACKFILL_OPTION_KEYS = new Set([
  "batchSize",
  "docIds",
  "forceEnrichment",
  "fullReplay",
  "includeEnrichment",
  "interestId",
  "parentReindexJobId",
  "reason",
  "replayExistingArticles",
  "requestedBy",
  "retroNotifications",
  "systemFeedOnly",
  "userId",
]);

type ReindexIndexName = (typeof REINDEX_INDEX_NAMES)[number];
type ReindexJobKind = (typeof REINDEX_JOB_KINDS)[number];

const sequenceDetailSchema = {
  type: "object",
  properties: {
    sequenceId: { type: "string" },
    id: { type: "string" },
    entityId: { type: "string" },
  },
  additionalProperties: false,
} as const;

const sequenceRunDetailSchema = {
  type: "object",
  properties: {
    runId: { type: "string" },
    sequenceRunId: { type: "string" },
    id: { type: "string" },
    entityId: { type: "string" },
  },
  additionalProperties: false,
} as const;

type QueryablePool = Parameters<McpToolDefinition["handler"]>[0]["pool"];

async function resolveSequenceIdArgument(
  pool: QueryablePool,
  args: Record<string, unknown>
): Promise<string> {
  const sequenceId = await resolveUniqueUuidPrefix(
    pool,
    readAliasedRequiredString(args, "sequenceId", ["id", "entityId"]),
    {
      path: "sequenceId",
      tableName: "sequences",
      columnName: "sequence_id",
      label: "Sequence",
    }
  );
  if (!sequenceId) {
    throw new JsonRpcError(-32602, "sequenceId is required.", {
      statusCode: 400,
      data: { path: "sequenceId" },
    });
  }
  return sequenceId;
}

async function resolveSequenceRunIdArgument(
  pool: QueryablePool,
  args: Record<string, unknown>
): Promise<string> {
  const runId = await resolveUniqueUuidPrefix(
    pool,
    readAliasedRequiredString(args, "runId", ["sequenceRunId", "id", "entityId"]),
    {
      path: "runId",
      tableName: "sequence_runs",
      columnName: "run_id",
      label: "Sequence run",
    }
  );
  if (!runId) {
    throw new JsonRpcError(-32602, "runId is required.", {
      statusCode: 400,
      data: { path: "runId" },
    });
  }
  return runId;
}

function readReindexIndexName(value: unknown): ReindexIndexName {
  const normalized = readOptionalString(value) ?? "interest_centroids";
  if ((REINDEX_INDEX_NAMES as readonly string[]).includes(normalized)) {
    return normalized as ReindexIndexName;
  }
  throw new JsonRpcError(
    -32602,
    `payload.indexName must be one of ${REINDEX_INDEX_NAMES.join(", ")}.`,
    {
      statusCode: 400,
      data: {
        path: "payload.indexName",
        code: "invalid_enum",
        allowedValues: [...REINDEX_INDEX_NAMES],
      },
    }
  );
}

function readReindexJobKind(value: unknown): ReindexJobKind {
  const normalized = readOptionalString(value) ?? "rebuild";
  if ((REINDEX_JOB_KINDS as readonly string[]).includes(normalized)) {
    return normalized as ReindexJobKind;
  }
  throw new JsonRpcError(
    -32602,
    `payload.jobKind must be one of ${REINDEX_JOB_KINDS.join(", ")}.`,
    {
      statusCode: 400,
      data: {
        path: "payload.jobKind",
        code: "invalid_enum",
        allowedValues: [...REINDEX_JOB_KINDS],
      },
    }
  );
}

function normalizeReindexOptions(
  jobKind: ReindexJobKind,
  options: Record<string, unknown>
): Record<string, unknown> {
  if (jobKind !== "backfill") {
    return options;
  }
  const unsupported = Object.keys(options).filter((key) => !REINDEX_BACKFILL_OPTION_KEYS.has(key));
  if (unsupported.length > 0) {
    throw new JsonRpcError(
      -32602,
      `payload.options contains unsupported backfill option(s): ${unsupported.join(", ")}.`,
      {
        statusCode: 400,
        data: {
          path: "payload.options",
          code: "unsupported_option",
          unsupported,
          allowedValues: [...REINDEX_BACKFILL_OPTION_KEYS].sort(),
        },
      }
    );
  }
  return {
    ...REINDEX_BACKFILL_DEFAULT_OPTIONS,
    ...options,
  };
}

function normalizeSequencePayload(payload: Record<string, unknown>): Record<string, unknown> {
  return normalizePayloadStringListFields(payload, {
    tags: undefined,
  });
}

function readSequenceContext(payload: Record<string, unknown>): Record<string, unknown> {
  const context = payload.contextJson;
  return readOptionalRecord(context, "payload.contextJson");
}

async function assertSequenceRunPayloadValidThroughMcp(
  pool: Parameters<McpToolDefinition["handler"]>[0]["pool"],
  sequenceId: string,
  payload: Record<string, unknown>
): Promise<void> {
  const result = await pool.query<{
    title: string;
    task_graph: unknown;
  }>(
    `
      select title, task_graph
      from public.sequences
      where sequence_id = $1
      limit 1
    `,
    [sequenceId]
  );
  const row = result.rows[0];
  if (!row || !Array.isArray(row.task_graph)) {
    return;
  }
  const modules = row.task_graph
    .map((task) =>
      task != null && typeof task === "object" && !Array.isArray(task)
        ? readOptionalString((task as Record<string, unknown>).module)
        : null
    )
    .filter((module): module is string => Boolean(module));

  if (!modules.includes("maintenance.reindex")) {
    return;
  }

  const context = readSequenceContext(payload);
  const eventId = readOptionalString(context.event_id) ?? readOptionalString(context.eventId);
  const reindexJobId =
    readOptionalString(context.reindex_job_id) ?? readOptionalString(context.reindexJobId);
  if (eventId && reindexJobId) {
    return;
  }

  throw new JsonRpcError(
    -32602,
    `Sequence "${row.title}" uses maintenance.reindex and cannot be started manually without contextJson.event_id and contextJson.reindex_job_id. Use maintenance.reindex.request to queue a reindex.requested event, then poll maintenance.reindex_jobs.list and sequences.runs.read for completion evidence.`,
    {
      statusCode: 400,
    }
  );
}

async function assertSequenceCanBeArchivedThroughMcp(
  pool: Parameters<McpToolDefinition["handler"]>[0]["pool"],
  sequenceId: string
): Promise<void> {
  const result = await pool.query<{
    title: string;
    created_by: string | null;
    status: string;
  }>(
    `
      select title, created_by, status
      from public.sequences
      where sequence_id = $1
      limit 1
    `,
    [sequenceId]
  );
  const row = result.rows[0];
  if (!row) {
    return;
  }
  if (String(row.created_by ?? "").startsWith("migration:")) {
    throw new JsonRpcError(
      -32602,
      `System sequence "${row.title}" was created by ${row.created_by} and cannot be archived through MCP cleanup. Leave migration-owned default/adaptive sequences unchanged unless a human changes them through the owning admin/runtime workflow.`,
      {
        statusCode: 400,
      }
    );
  }
}

export const SEQUENCE_MCP_TOOLS: readonly McpToolDefinition[] = [
  createReadTool(
    "sequences.list",
    "List sequences from the maintenance API.",
    pagingSchema,
    async ({ sdk }, args) => sdk.listSequencesPage<Record<string, unknown>>(readPageArgs(args))
  ),
  createReadTool(
    "sequences.read",
    "Read one sequence. Prefer sequenceId; id/entityId and unique UUID prefixes from reports are accepted for read-back.",
    sequenceDetailSchema,
    async ({ sdk, pool }, args) =>
      sdk.getSequence<Record<string, unknown>>(await resolveSequenceIdArgument(pool, args))
  ),
  createReadTool(
    "sequences.plugins.list",
    "List available sequence plugins.",
    { type: "object", additionalProperties: false },
    async ({ sdk }) => sdk.listSequencePlugins<Record<string, unknown>>()
  ),
  createReadTool(
    "sequences.runs.read",
    "Read one sequence run. Prefer runId; sequenceRunId/id/entityId and unique UUID prefixes from reports are accepted for read-back.",
    sequenceRunDetailSchema,
    async ({ sdk, pool }, args) =>
      sdk.getSequenceRun<Record<string, unknown>>(
        await resolveSequenceRunIdArgument(pool, args)
      )
  ),
  createReadTool(
    "sequences.run_task_runs.list",
    "List task runs for a sequence run. Prefer runId; sequenceRunId/id/entityId and unique UUID prefixes from reports are accepted for read-back.",
    sequenceRunDetailSchema,
    async ({ sdk, pool }, args) =>
      sdk.getSequenceRunTaskRuns<Record<string, unknown>>(
        await resolveSequenceRunIdArgument(pool, args)
      )
  ),
  createReadTool(
    "maintenance.reindex_jobs.list",
    "List reindex jobs. After maintenance.reindex.request, verify success from status, job_kind, index_name, and options_json.backfill/default replay fields instead of trusting the mutation response alone.",
    pagingSchema,
    async ({ sdk }, args) =>
      sdk.listReindexJobsPage<Record<string, unknown>>(readPageArgs(args))
  ),
  createWriteTool(
    "maintenance.reindex.request",
    "Queue a valid reindex.requested event for the system Default Reindex sequence. Use jobKind=backfill for existing, historical, or old articles; rerunning content against current system interests, criteria, templates, interest_filter_results, final_selection_results, selected/pass_through noise, or after Example C/templates/criteria changes. For enlarged retained DBs or a failed full replay, run bounded chunks by passing payload.options.docIds and parentReindexJobId/reason, then verify every chunk with maintenance.reindex_jobs.list and operator.report.verify. Use jobKind=rebuild only when the operator asks to refresh centroid/vector indexes. Prefer this over calling sequences.run on migration-owned reindex sequences.",
    "write.sequences",
    {
      type: "object",
      properties: {
        payload: {
          type: "object",
          properties: {
            indexName: { type: "string", enum: [...REINDEX_INDEX_NAMES] },
            jobKind: { type: "string", enum: [...REINDEX_JOB_KINDS] },
            options: {
              type: "object",
              properties: {
                batchSize: { type: ["integer", "number"] },
                docIds: { type: "array", items: { type: "string" } },
                forceEnrichment: { type: "boolean" },
                fullReplay: { type: "boolean" },
                includeEnrichment: { type: "boolean" },
                interestId: { type: "string" },
                parentReindexJobId: { type: "string" },
                reason: { type: "string" },
                replayExistingArticles: { type: "boolean" },
                requestedBy: { type: "string" },
                retroNotifications: { type: "string", enum: ["skip"] },
                systemFeedOnly: { type: "boolean" },
                userId: { type: "string" },
              },
              additionalProperties: false,
            },
          },
          additionalProperties: false,
        },
      },
      additionalProperties: false,
    },
    async ({ pool, token }, args) => {
      const payload = args.payload == null ? {} : readPayload(args);
      const indexName = readReindexIndexName(payload.indexName);
      const jobKind = readReindexJobKind(payload.jobKind);
      const optionsJson = normalizeReindexOptions(
        jobKind,
        readOptionalRecord(payload.options, "payload.options")
      );
      const client = await pool.connect();
      let queuedJob: Awaited<ReturnType<typeof queueReindexJobWithSupersession>>;
      try {
        await client.query("begin");
        queuedJob = await queueReindexJobWithSupersession(client, {
          indexName,
          jobKind,
          optionsJson,
          requestedByUserId: token.issuedByUserId,
        });
        await client.query("commit");
      } catch (error) {
        await client.query("rollback");
        throw error;
      } finally {
        client.release();
      }
      await writeMcpMutationAudit(pool, token, {
        actionType: "reindex_requested",
        entityType: "reindex_job",
        entityId: queuedJob.reindexJobId,
        payloadJson: {
          eventId: queuedJob.eventId,
          indexName,
          jobKind,
          options: optionsJson,
          cancellationKey: queuedJob.cancellationKey,
          supersession: {
            cancelledQueuedCount: queuedJob.cancelledQueuedCount,
            cancellationRequestedCount: queuedJob.cancellationRequestedCount,
          },
        },
      });
      return {
        reindexJobId: queuedJob.reindexJobId,
        eventId: queuedJob.eventId,
        indexName,
        jobKind,
        options: optionsJson,
        cancellationKey: queuedJob.cancellationKey,
        supersession: {
          cancelledQueuedCount: queuedJob.cancelledQueuedCount,
          cancellationRequestedCount: queuedJob.cancellationRequestedCount,
        },
        status: "queued",
        notes:
          jobKind === "backfill"
            ? [
                "Selection replay backfill queued for existing content; wait for completed/failed before reporting success.",
                "Backfill recalculates current-interest selection evidence such as interest_filter_results and final_selection_results.",
                Array.isArray(optionsJson.docIds) && optionsJson.docIds.length > 0
                  ? `Bounded replay chunk queued for ${optionsJson.docIds.length} docIds. Continue with the next bounded chunk only after read-back verification.`
                  : "For large retained DB replay after a timeout, prefer bounded docIds chunks over another full replay.",
              ]
            : [
                "Centroid/vector index rebuild queued; this is not a historical selection replay.",
              ],
      };
    }
  ),
  createWriteTool(
    "sequences.create",
    "Create a sequence through the maintenance API.",
    "write.sequences",
    MCP_SEQUENCE_ARGUMENT_SCHEMAS.create,
    async ({ sdk, pool, token }, args) => {
      const payload = withActorDefault(
        normalizeSequencePayload(readPayload(args)),
        "createdBy",
        token.issuedByUserId
      );
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
    MCP_SEQUENCE_ARGUMENT_SCHEMAS.update,
    async ({ sdk, pool, token }, args) => {
      const sequenceId = readRequiredUuidString(args.sequenceId, "sequenceId");
      const result = await sdk.updateSequence<Record<string, unknown>>(
        sequenceId,
        normalizeSequencePayload(readPayload(args))
      );
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
    MCP_SEQUENCE_ARGUMENT_SCHEMAS.run,
    async ({ sdk, pool, token }, args) => {
      const sequenceId = readRequiredUuidString(args.sequenceId, "sequenceId");
      const payload =
        args.payload == null
          ? {}
          : readPayload(args);
      await assertSequenceRunPayloadValidThroughMcp(pool, sequenceId, payload);
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
    MCP_SEQUENCE_ARGUMENT_SCHEMAS.retryRun,
    async ({ sdk, pool, token }, args) => {
      const runId = readRequiredUuidString(args.runId, "runId");
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
    MCP_SEQUENCE_ARGUMENT_SCHEMAS.cancelRun,
    async ({ sdk, pool, token }, args) => {
      const runId = readRequiredUuidString(args.runId, "runId");
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
    "Archive a non-system sequence. Do not archive migration-owned default/adaptive/system sequences; this tool rejects those during cleanup.",
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
      const sequenceId = readRequiredUuidString(args.sequenceId, "sequenceId");
      await assertSequenceCanBeArchivedThroughMcp(pool, sequenceId);
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

import { queryRows } from "./db";

export type SequenceAdminIntent =
  | "create_sequence"
  | "update_sequence"
  | "archive_sequence"
  | "run_sequence"
  | "cancel_run";

const SEQUENCE_STATUSES = new Set(["draft", "active", "archived"]);
const CANCELLABLE_SEQUENCE_RUN_STATUSES = new Set(["pending"]);

type LooseRecord = Record<string, unknown>;

function asRecord(value: unknown): LooseRecord {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as LooseRecord)
    : {};
}

function readOptionalString(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : null;
}

function readRequiredString(value: unknown, fieldName: string): string {
  const normalized = readOptionalString(value);
  if (!normalized) {
    throw new Error(`${fieldName} is required.`);
  }
  return normalized;
}

function readOptionalPositiveInteger(value: unknown, fieldName: string): number | null {
  const normalized = readOptionalString(value);
  if (!normalized) {
    return null;
  }
  const parsed = Number.parseInt(normalized, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${fieldName} must be a positive integer.`);
  }
  return parsed;
}

function parseJsonValue(rawValue: unknown, fieldName: string): unknown {
  const normalized = readOptionalString(rawValue);
  if (!normalized) {
    return null;
  }
  try {
    return JSON.parse(normalized);
  } catch {
    throw new Error(`${fieldName} must be valid JSON.`);
  }
}

function parseJsonObject(rawValue: unknown, fieldName: string): LooseRecord {
  const parsed = parseJsonValue(rawValue, fieldName);
  if (parsed == null) {
    return {};
  }
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    return parsed as LooseRecord;
  }
  throw new Error(`${fieldName} must be a JSON object.`);
}

function parseTaskGraph(rawValue: unknown): LooseRecord[] {
  const parsed = parseJsonValue(rawValue, "taskGraph");
  if (!Array.isArray(parsed)) {
    throw new Error("taskGraph must be a JSON array.");
  }
  const taskGraph = parsed.map((node, index) => {
    const record = asRecord(node);
    if (Object.keys(record).length === 0) {
      throw new Error(`taskGraph entry ${index + 1} must be a JSON object.`);
    }
    return record;
  });
  if (taskGraph.length === 0) {
    throw new Error("taskGraph must include at least one task.");
  }
  return taskGraph;
}

export function parseTextList(value: unknown): string[] {
  return String(value ?? "")
    .split(/\r?\n|,/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function resolveSequenceAdminIntent(payload: Record<string, unknown>): SequenceAdminIntent {
  const intent = String(payload.intent ?? "").trim();
  if (
    intent === "update_sequence" ||
    intent === "archive_sequence" ||
    intent === "run_sequence" ||
    intent === "cancel_run"
  ) {
    return intent;
  }
  return "create_sequence";
}

function resolveSequenceStatus(value: unknown): "draft" | "active" | "archived" {
  const normalized = readOptionalString(value) ?? "draft";
  if (!SEQUENCE_STATUSES.has(normalized)) {
    throw new Error(`status must be one of ${Array.from(SEQUENCE_STATUSES).join(", ")}.`);
  }
  return normalized as "draft" | "active" | "archived";
}

export function buildSequenceCreateApiPayload(
  payload: Record<string, unknown>,
  createdBy: string
): Record<string, unknown> {
  return {
    title: readRequiredString(payload.title, "title"),
    description: readOptionalString(payload.description),
    taskGraph: parseTaskGraph(payload.taskGraph),
    status: resolveSequenceStatus(payload.status),
    triggerEvent: readOptionalString(payload.triggerEvent),
    cron: readOptionalString(payload.cron),
    maxRuns: readOptionalPositiveInteger(payload.maxRuns, "maxRuns"),
    tags: parseTextList(payload.tags),
    createdBy: readOptionalString(payload.createdBy) ?? createdBy,
  };
}

export function buildSequenceUpdateApiPayload(payload: Record<string, unknown>): Record<string, unknown> {
  return {
    title: readRequiredString(payload.title, "title"),
    description: readOptionalString(payload.description),
    taskGraph: parseTaskGraph(payload.taskGraph),
    status: resolveSequenceStatus(payload.status),
    triggerEvent: readOptionalString(payload.triggerEvent),
    cron: readOptionalString(payload.cron),
    maxRuns: readOptionalPositiveInteger(payload.maxRuns, "maxRuns"),
    tags: parseTextList(payload.tags),
    createdBy: readOptionalString(payload.createdBy),
  };
}

export function buildSequenceManualRunApiPayload(
  payload: Record<string, unknown>,
  requestedBy: string
): Record<string, unknown> {
  return {
    contextJson: parseJsonObject(payload.contextJson, "contextJson"),
    triggerMeta: {
      ...parseJsonObject(payload.triggerMeta, "triggerMeta"),
      requestedFrom: "admin",
    },
    requestedBy,
  };
}

export function buildSequenceCancelApiPayload(payload: Record<string, unknown>): Record<string, unknown> {
  return {
    reason: readOptionalString(payload.reason),
  };
}

export function buildSequenceAuditPayload(
  intent: SequenceAdminIntent,
  payload: Record<string, unknown>,
  apiResult: Record<string, unknown> = {}
): Record<string, unknown> {
  if (intent === "create_sequence" || intent === "update_sequence" || intent === "archive_sequence") {
    return {
      sequenceId:
        apiResult.sequence_id ??
        (readOptionalString(payload.sequenceId) ?? null),
      title: apiResult.title ?? readOptionalString(payload.title),
      status: apiResult.status ?? readOptionalString(payload.status),
      triggerEvent: apiResult.trigger_event ?? readOptionalString(payload.triggerEvent),
      cron: apiResult.cron ?? readOptionalString(payload.cron),
      maxRuns: apiResult.max_runs ?? readOptionalPositiveInteger(payload.maxRuns, "maxRuns"),
      tags: apiResult.tags ?? parseTextList(payload.tags),
    };
  }

  if (intent === "run_sequence") {
    return {
      sequenceId:
        apiResult.sequence_id ??
        (readOptionalString(payload.sequenceId) ?? null),
      runId: apiResult.run_id ?? null,
      status: apiResult.status ?? null,
      triggerType: apiResult.trigger_type ?? "manual",
    };
  }

  return {
    runId: apiResult.run_id ?? readOptionalString(payload.runId),
    reason: readOptionalString(payload.reason),
    status: apiResult.status ?? null,
  };
}

export function isSequenceRunCancellable(status: unknown): boolean {
  return CANCELLABLE_SEQUENCE_RUN_STATUSES.has(String(status ?? "").trim());
}

export interface SequenceOperatorSummary {
  totalSequences: number;
  activeSequences: number;
  draftSequences: number;
  archivedSequences: number;
  recentRuns: number;
  pendingRuns: number;
  failedRuns: number;
  completedRuns: number;
  recentOutboxEvents: number;
  pendingOutboxEvents: number;
  failedOutboxEvents: number;
}

export function resolveSequenceOperatorSummary(input: {
  sequences: readonly Record<string, unknown>[];
  runs: readonly Record<string, unknown>[];
  outboxEvents: readonly Record<string, unknown>[];
}): SequenceOperatorSummary {
  const sequences = input.sequences;
  const runs = input.runs;
  const outboxEvents = input.outboxEvents;

  return {
    totalSequences: sequences.length,
    activeSequences: sequences.filter((item) => String(item.status ?? "") === "active").length,
    draftSequences: sequences.filter((item) => String(item.status ?? "") === "draft").length,
    archivedSequences: sequences.filter((item) => String(item.status ?? "") === "archived").length,
    recentRuns: runs.length,
    pendingRuns: runs.filter((item) => String(item.status ?? "") === "pending").length,
    failedRuns: runs.filter((item) => String(item.status ?? "") === "failed").length,
    completedRuns: runs.filter((item) => String(item.status ?? "") === "completed").length,
    recentOutboxEvents: outboxEvents.length,
    pendingOutboxEvents: outboxEvents.filter((item) => String(item.status ?? "") === "pending").length,
    failedOutboxEvents: outboxEvents.filter((item) => String(item.status ?? "") === "failed").length,
  };
}

export async function listRecentSequenceRuns(limit = 12): Promise<Record<string, unknown>[]> {
  return queryRows<Record<string, unknown>>(
    `
      select
        sr.run_id::text as run_id,
        sr.sequence_id::text as sequence_id,
        s.title as sequence_title,
        sr.status,
        sr.context_json,
        sr.trigger_type,
        sr.trigger_meta,
        sr.started_at,
        sr.finished_at,
        sr.error_text,
        sr.created_at,
        coalesce(task_stats.total_tasks, 0) as total_tasks,
        coalesce(task_stats.completed_tasks, 0) as completed_tasks,
        coalesce(task_stats.failed_tasks, 0) as failed_tasks,
        coalesce(task_stats.skipped_tasks, 0) as skipped_tasks,
        coalesce(task_stats.running_tasks, 0) as running_tasks
      from sequence_runs sr
      join sequences s on s.sequence_id = sr.sequence_id
      left join lateral (
        select
          count(*)::int as total_tasks,
          count(*) filter (where status = 'completed')::int as completed_tasks,
          count(*) filter (where status = 'failed')::int as failed_tasks,
          count(*) filter (where status = 'skipped')::int as skipped_tasks,
          count(*) filter (where status = 'running')::int as running_tasks
        from sequence_task_runs str
        where str.run_id = sr.run_id
      ) task_stats on true
      order by sr.created_at desc
      limit $1
    `,
    [limit]
  );
}

export async function listSequenceTaskRuns(runId: string): Promise<Record<string, unknown>[]> {
  return queryRows<Record<string, unknown>>(
    `
      select
        task_run_id::text as task_run_id,
        run_id::text as run_id,
        task_index,
        task_key,
        module,
        status,
        options_json,
        input_json,
        output_json,
        started_at,
        finished_at,
        error_text,
        duration_ms,
        created_at
      from sequence_task_runs
      where run_id = $1
      order by task_index asc, created_at asc
    `,
    [runId]
  );
}

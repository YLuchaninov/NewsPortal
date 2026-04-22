import { readRuntimeConfig } from "@newsportal/config";
import { createNewsPortalSdk } from "@newsportal/sdk";

import {
  listRecentAutomationOutboxEvents,
  listRecentSequenceRuns,
  listSequenceRunsPage,
  listSequenceTaskRuns,
  resolveSequenceOperatorSummary,
} from "./automation";

type JsonRecord = Record<string, unknown>;

function createAutomationSdk() {
  const runtimeConfig = readRuntimeConfig(process.env, {
    defaultAppBaseUrl: "http://127.0.0.1:4322/",
  });
  return createNewsPortalSdk({
    baseUrl: runtimeConfig.apiBaseUrl,
    fetchImpl: fetch,
  });
}

export async function loadAutomationOverviewData(input: {
  page?: number;
  pageSize?: number;
}) {
  const sdk = createAutomationSdk();
  const page = input.page && input.page > 0 ? input.page : 1;
  const pageSize = input.pageSize && input.pageSize > 0 ? input.pageSize : 12;

  const [sequences, plugins, recentRuns, outboxEvents] = await Promise.all([
    sdk.listSequencesPage<JsonRecord>({ page, pageSize }),
    sdk.listSequencePlugins<JsonRecord[]>(),
    listRecentSequenceRuns(10),
    listRecentAutomationOutboxEvents(14),
  ]);

  return {
    sequences,
    plugins,
    recentRuns,
    outboxEvents,
    summary: resolveSequenceOperatorSummary({
      sequences: sequences.items,
      runs: recentRuns,
      outboxEvents,
    }),
  };
}

export async function loadAutomationTemplatesData() {
  const sdk = createAutomationSdk();
  const [plugins, recentRuns, outboxEvents] = await Promise.all([
    sdk.listSequencePlugins<JsonRecord[]>(),
    listRecentSequenceRuns(6),
    listRecentAutomationOutboxEvents(8),
  ]);

  return {
    plugins,
    recentRuns,
    outboxEvents,
  };
}

export async function loadAutomationEditorData(sequenceId: string) {
  const sdk = createAutomationSdk();
  const [sequence, plugins, runsPage] = await Promise.all([
    sdk.getSequence<JsonRecord>(sequenceId),
    sdk.listSequencePlugins<JsonRecord[]>(),
    listSequenceRunsPage({ sequenceId, page: 1, pageSize: 8 }),
  ]);

  return {
    sequence,
    plugins,
    recentRuns: runsPage.items,
  };
}

export async function loadAutomationExecutionsData(input: {
  sequenceId: string;
  page?: number;
  pageSize?: number;
  status?: string | null;
  runId?: string | null;
}) {
  const sdk = createAutomationSdk();
  const sequenceId = input.sequenceId;
  const page = input.page && input.page > 0 ? input.page : 1;
  const pageSize = input.pageSize && input.pageSize > 0 ? input.pageSize : 12;
  const status = input.status ? String(input.status).trim() : null;

  const [sequence, runsPage, outboxEvents] = await Promise.all([
    sdk.getSequence<JsonRecord>(sequenceId),
    listSequenceRunsPage({
      sequenceId,
      page,
      pageSize,
      status,
    }),
    listRecentAutomationOutboxEvents(10),
  ]);

  const selectedRunId =
    input.runId && runsPage.items.some((run) => String(run.run_id ?? "") === input.runId)
      ? input.runId
      : String(runsPage.items[0]?.run_id ?? "");
  const selectedRun =
    runsPage.items.find((run) => String(run.run_id ?? "") === selectedRunId) ?? null;
  const taskRunsByRunId = Object.fromEntries(
    await Promise.all(
      runsPage.items.map(async (run) => {
        const runId = String(run.run_id ?? "");
        return [runId, runId ? await listSequenceTaskRuns(runId) : []] as const;
      })
    )
  );

  return {
    sequence,
    runsPage,
    selectedRunId,
    selectedRun,
    taskRuns: taskRunsByRunId[selectedRunId] ?? [],
    taskRunsByRunId,
    outboxEvents,
  };
}

import { useEffect, useMemo, useState } from "react";

import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@newsportal/ui";

import {
  isSequenceRunCancellable,
  isSequenceRunRetryable,
} from "../lib/server/automation";
import {
  ADMIN_LIVE_UPDATES_EVENT,
  isAdminLiveSurfaceSnapshot,
  type AdminLiveUpdatesEventDetail,
} from "../lib/live-updates";

type JsonRecord = Record<string, unknown>;

interface RunsPageLike {
  items: JsonRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasPrev: boolean;
  hasNext: boolean;
}

interface AutomationExecutionsBoardProps {
  sequence: JsonRecord;
  runsPage: RunsPageLike;
  initialSelectedRunId: string;
  taskRunsByRunId: Record<string, JsonRecord[]>;
  automationBffPath: string;
  editorHref: string;
  currentPath: string;
  outboxEvents: JsonRecord[];
}

function readText(value: unknown, fallback = "—"): string {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : fallback;
}

function readCount(value: unknown, fallback = 0): number {
  const parsed =
    typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatTimestamp(value: unknown): string {
  if (!value) {
    return "—";
  }
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) {
    return String(value);
  }
  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function statusClass(status: string): string {
  if (status === "completed") {
    return "bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-500/20";
  }
  if (status === "failed") {
    return "bg-rose-500/10 text-rose-300 ring-1 ring-rose-500/20";
  }
  if (status === "pending" || status === "running") {
    return "bg-amber-500/10 text-amber-200 ring-1 ring-amber-500/20";
  }
  return "bg-white/5 text-white/70 ring-1 ring-white/10";
}

async function postJson(path: string, payload: Record<string, unknown>) {
  const response = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify(payload),
  });
  const json = (await response.json().catch(() => ({}))) as JsonRecord;
  if (!response.ok) {
    throw new Error(readText(json.error ?? json.detail, `Request failed with ${response.status}`));
  }
  return json;
}

export function AutomationExecutionsBoard({
  sequence,
  runsPage,
  initialSelectedRunId,
  taskRunsByRunId,
  automationBffPath,
  editorHref,
  currentPath,
  outboxEvents,
}: AutomationExecutionsBoardProps) {
  const [selectedRunId, setSelectedRunId] = useState(initialSelectedRunId);
  const [actionError, setActionError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState(
    new URL(currentPath, "http://127.0.0.1").searchParams.get("status") ?? "all"
  );
  const [liveRunsPage, setLiveRunsPage] = useState(runsPage);
  const [liveOutbox, setLiveOutbox] = useState(outboxEvents);

  useEffect(() => {
    const currentSnapshot = window.__newsportalAdminLiveUpdates?.snapshot;
    if (
      isAdminLiveSurfaceSnapshot(currentSnapshot, "automation") &&
      currentSnapshot.sequenceId === readText(sequence.sequence_id, "")
    ) {
      const snapshot = currentSnapshot;
      setLiveRunsPage((current) => ({
        ...current,
        total: snapshot.runs.total,
        items: snapshot.runs.items,
      }));
      setLiveOutbox(snapshot.outbox.items);
    }

    function handleLiveUpdate(event: Event): void {
      const detail = (event as CustomEvent<AdminLiveUpdatesEventDetail>).detail;
      const snapshot = detail?.snapshot;
      if (!snapshot || !isAdminLiveSurfaceSnapshot(snapshot, "automation")) {
        return;
      }
      if (snapshot.sequenceId !== readText(sequence.sequence_id, "")) {
        return;
      }
      setLiveRunsPage((current) => ({
        ...current,
        total: snapshot.runs.total,
        items: snapshot.runs.items,
      }));
      setLiveOutbox(snapshot.outbox.items);
    }

    window.addEventListener(ADMIN_LIVE_UPDATES_EVENT, handleLiveUpdate);
    return () => {
      window.removeEventListener(ADMIN_LIVE_UPDATES_EVENT, handleLiveUpdate);
    };
  }, [sequence.sequence_id]);

  const selectedRun = useMemo(
    () => liveRunsPage.items.find((run) => String(run.run_id ?? "") === selectedRunId) ?? null,
    [liveRunsPage.items, selectedRunId]
  );
  const selectedTaskRuns = taskRunsByRunId[selectedRunId] ?? [];

  async function handleCancelRun(runId: string): Promise<void> {
    setActionError(null);
    try {
      await postJson(automationBffPath, {
        intent: "cancel_run",
        runId,
        reason: "Cancelled from the executions workspace.",
      });
      window.location.reload();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to cancel run.");
    }
  }

  async function handleRetryRun(runId: string): Promise<void> {
    setActionError(null);
    try {
      await postJson(automationBffPath, {
        intent: "retry_run",
        runId,
        contextOverrides: {},
        triggerMeta: {},
      });
      window.location.reload();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to retry run.");
    }
  }

  function handleFilterChange(nextStatus: string): void {
    const target = new URL(currentPath, window.location.origin);
    if (nextStatus === "all") {
      target.searchParams.delete("status");
    } else {
      target.searchParams.set("status", nextStatus);
    }
    window.location.href = `${target.pathname}${target.search}`;
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.18),transparent_26%),linear-gradient(135deg,rgba(24,24,27,1),rgba(9,9,11,1))] p-6 text-white shadow-[0_20px_80px_rgba(0,0,0,0.28)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.26em] text-emerald-200/80">
              Executions
            </p>
            <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
              {readText(sequence.title)}
            </h1>
            <p className="max-w-3xl text-sm leading-6 text-white/70">
              Review the execution timeline, reopen failed runs, and jump back into the builder
              when the workflow itself needs adjustment.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href={editorHref}
              className="inline-flex h-10 items-center justify-center rounded-md bg-emerald-400 px-4 text-sm font-medium text-zinc-950 transition hover:bg-emerald-300"
            >
              Back To Builder
            </a>
            <div className="min-w-[180px]">
              <Select value={statusFilter} onValueChange={(value) => {
                setStatusFilter(value);
                handleFilterChange(value);
              }}>
                <SelectTrigger className="border-white/15 bg-white/8 text-white">
                  <SelectValue placeholder="Filter runs" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="running">Running</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </section>

      {actionError && (
        <p className="rounded-[1.2rem] border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {actionError}
        </p>
      )}

      <div className="grid gap-6 xl:grid-cols-[0.96fr_1.04fr]">
        <Card className="border-white/10 bg-card/90 shadow-sm">
          <CardHeader className="border-b border-border/70">
            <CardTitle>Run History</CardTitle>
            <CardDescription>
              {liveRunsPage.total} run{liveRunsPage.total === 1 ? "" : "s"} on this workflow
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-5">
            {liveRunsPage.items.length === 0 ? (
              <div className="rounded-[1.2rem] border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
                No runs match this filter. Try a broader filter.
              </div>
            ) : (
              liveRunsPage.items.map((run) => {
                const runId = readText(run.run_id, "");
                const status = readText(run.status, "");
                return (
                  <button
                    key={runId}
                    type="button"
                    onClick={() => setSelectedRunId(runId)}
                    className={`w-full rounded-[1.25rem] border p-4 text-left transition ${
                      selectedRunId === runId
                        ? "border-emerald-300/40 bg-emerald-500/8"
                        : "border-border bg-background/70 hover:border-emerald-300/25 hover:bg-accent"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-foreground">{readText(run.trigger_type)}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {formatTimestamp(run.created_at)}
                        </p>
                      </div>
                      <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium ${statusClass(status)}`}>
                        {status}
                      </span>
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">
                      {readCount(run.completed_tasks)}/{readCount(run.total_tasks)} completed • failed {readCount(run.failed_tasks)} • running {readCount(run.running_tasks)}
                    </p>
                    {readText(run.error_text, "") && readText(run.error_text, "") !== "—" && (
                      <p className="mt-3 text-sm text-rose-600 dark:text-rose-200">{readText(run.error_text, "")}</p>
                    )}
                  </button>
                );
              })
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="border-white/10 bg-card/90 shadow-sm">
            <CardHeader className="border-b border-border/70">
              <CardTitle>Selected Run</CardTitle>
              <CardDescription>
                Task timeline, context, and recovery controls for the current execution.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-5">
              {!selectedRun ? (
                <div className="rounded-[1.2rem] border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
                  Select a run to inspect its task timeline.
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-4 rounded-[1.2rem] border border-border bg-background/70 p-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-lg font-semibold text-foreground">{readText(selectedRun.run_id)}</p>
                        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium ${statusClass(readText(selectedRun.status, ""))}`}>
                          {readText(selectedRun.status)}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Created {formatTimestamp(selectedRun.created_at)} • Trigger {readText(selectedRun.trigger_type)}
                      </p>
                      {readText(selectedRun.retry_of_run_id, "") && readText(selectedRun.retry_of_run_id, "") !== "—" && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Retry of {readText(selectedRun.retry_of_run_id)}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {isSequenceRunCancellable(selectedRun.status) && (
                        <Button type="button" variant="secondary" onClick={() => void handleCancelRun(readText(selectedRun.run_id, ""))}>
                          Cancel
                        </Button>
                      )}
                      {isSequenceRunRetryable(selectedRun.status) && (
                        <Button type="button" onClick={() => void handleRetryRun(readText(selectedRun.run_id, ""))}>
                          Retry failed run
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="space-y-3">
                    {selectedTaskRuns.length === 0 ? (
                      <div className="rounded-[1.2rem] border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
                        No task rows yet for this run. Task history appears here once execution starts.
                      </div>
                    ) : (
                      selectedTaskRuns.map((taskRun) => (
                        <article
                          key={readText(taskRun.task_run_id)}
                          className="rounded-[1.2rem] border border-border bg-background/70 p-4"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-medium text-foreground">{readText(taskRun.task_key)}</p>
                                <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium ${statusClass(readText(taskRun.status, ""))}`}>
                                  {readText(taskRun.status)}
                                </span>
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {readText(taskRun.module)} • index {readText(taskRun.task_index)} • {formatTimestamp(taskRun.started_at)}
                              </p>
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {readText(taskRun.duration_ms, "—")} ms
                            </span>
                          </div>
                          {readText(taskRun.error_text, "") && readText(taskRun.error_text, "") !== "—" && (
                            <p className="mt-3 text-sm text-rose-600 dark:text-rose-200">{readText(taskRun.error_text, "")}</p>
                          )}
                          <div className="mt-4 grid gap-3 xl:grid-cols-3">
                            <pre className="overflow-x-auto rounded-xl border border-border bg-muted/40 p-3 text-[11px] leading-5 text-muted-foreground">{JSON.stringify(taskRun.options_json ?? {}, null, 2)}</pre>
                            <pre className="overflow-x-auto rounded-xl border border-border bg-muted/40 p-3 text-[11px] leading-5 text-muted-foreground">{JSON.stringify(taskRun.input_json ?? {}, null, 2)}</pre>
                            <pre className="overflow-x-auto rounded-xl border border-border bg-muted/40 p-3 text-[11px] leading-5 text-muted-foreground">{JSON.stringify(taskRun.output_json ?? {}, null, 2)}</pre>
                          </div>
                        </article>
                      ))
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-card/90 shadow-sm">
            <CardHeader>
              <CardTitle>Recent Outbox Around This Lane</CardTitle>
              <CardDescription>
                Lightweight relay visibility while you inspect workflow executions.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {liveOutbox.slice(0, 5).map((event) => (
                <div key={readText(event.event_id)} className="rounded-[1.15rem] border border-border bg-background/70 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-foreground">{readText(event.event_type)}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{readText(event.aggregate_type)} • {readText(event.aggregate_id)}</p>
                    </div>
                    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium ${statusClass(readText(event.status, ""))}`}>
                      {readText(event.status)}
                    </span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

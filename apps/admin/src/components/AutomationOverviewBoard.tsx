import { useEffect, useMemo, useState } from "react";

import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input } from "@newsportal/ui";

import {
  AUTOMATION_TEMPLATES,
  createBlankLinearAutomation,
} from "../lib/automation-workspace";
import {
  ADMIN_LIVE_UPDATES_EVENT,
  isAdminLiveSurfaceSnapshot,
  type AdminLiveUpdatesEventDetail,
} from "../lib/live-updates";

type JsonRecord = Record<string, unknown>;

interface SequenceRunsPageLike {
  items: JsonRecord[];
  page: number;
  totalPages: number;
  hasPrev: boolean;
  hasNext: boolean;
}

interface AutomationOverviewBoardProps {
  sequences: SequenceRunsPageLike;
  recentRuns: JsonRecord[];
  outboxEvents: JsonRecord[];
  summary: {
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
  };
  automationBffPath: string;
  automationRootPath: string;
  templatesHref: string;
  currentUserId: string;
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
  if (status === "active" || status === "completed" || status === "published") {
    return "bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-500/20";
  }
  if (status === "failed") {
    return "bg-rose-500/10 text-rose-300 ring-1 ring-rose-500/20";
  }
  if (status === "pending" || status === "draft" || status === "running") {
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

export function AutomationOverviewBoard({
  sequences,
  recentRuns,
  outboxEvents,
  summary,
  automationBffPath,
  automationRootPath,
  templatesHref,
  currentUserId,
}: AutomationOverviewBoardProps) {
  const [query, setQuery] = useState("");
  const [creatingBlank, setCreatingBlank] = useState(false);
  const [creatingSuggested, setCreatingSuggested] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [liveSummary, setLiveSummary] = useState(summary);
  const [liveRuns, setLiveRuns] = useState(recentRuns);
  const [liveOutbox, setLiveOutbox] = useState(outboxEvents);

  useEffect(() => {
    const currentSnapshot = window.__newsportalAdminLiveUpdates?.snapshot;
    if (isAdminLiveSurfaceSnapshot(currentSnapshot, "automation") && currentSnapshot.sequenceId === null) {
      setLiveSummary({
        ...currentSnapshot.summary,
      });
      setLiveRuns(currentSnapshot.runs.items);
      setLiveOutbox(currentSnapshot.outbox.items);
    }

    function handleLiveUpdate(event: Event): void {
      const detail = (event as CustomEvent<AdminLiveUpdatesEventDetail>).detail;
      if (!detail || !isAdminLiveSurfaceSnapshot(detail.snapshot, "automation")) {
        return;
      }
      if (detail.snapshot.sequenceId !== null) {
        return;
      }
      setLiveSummary({
        ...detail.snapshot.summary,
      });
      setLiveRuns(detail.snapshot.runs.items);
      setLiveOutbox(detail.snapshot.outbox.items);
    }

    window.addEventListener(ADMIN_LIVE_UPDATES_EVENT, handleLiveUpdate);
    return () => {
      window.removeEventListener(ADMIN_LIVE_UPDATES_EVENT, handleLiveUpdate);
    };
  }, []);

  const filteredSequences = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return sequences.items;
    }
    return sequences.items.filter((sequence) => {
      const haystack = [
        sequence.title,
        sequence.description,
        sequence.trigger_event,
        sequence.cron,
        Array.isArray(sequence.tags) ? sequence.tags.join(" ") : "",
      ]
        .map((value) => String(value ?? "").toLowerCase())
        .join(" ");
      return haystack.includes(normalizedQuery);
    });
  }, [query, sequences.items]);

  async function handleCreateBlank(): Promise<void> {
    setCreatingBlank(true);
    setErrorMessage(null);
    try {
      const result = await postJson(automationBffPath, {
        intent: "create_sequence",
        ...createBlankLinearAutomation({ createdBy: currentUserId }),
      });
      const sequenceId = readText(result.sequence_id, "");
      if (!sequenceId) {
        throw new Error("Sequence creation did not return an id.");
      }
      window.location.href = `${automationRootPath}/${encodeURIComponent(sequenceId)}`;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to create workflow.");
    } finally {
      setCreatingBlank(false);
    }
  }

  async function handleCreateSuggested(): Promise<void> {
    setCreatingSuggested(true);
    setErrorMessage(null);
    try {
      const firstTemplate = AUTOMATION_TEMPLATES[0];
      const response = await postJson(automationBffPath, {
        intent: "create_sequence",
        title: `${firstTemplate.title} copy`,
        description: firstTemplate.description,
        status: firstTemplate.status,
        triggerEvent: firstTemplate.triggerEvent ?? null,
        cron: firstTemplate.cron ?? null,
        tags: firstTemplate.tags,
        taskGraph: firstTemplate.taskGraph,
        editorState: {
          viewport: { x: 0, y: 0, zoom: 0.9 },
        },
      });
      const sequenceId = readText(response.sequence_id, "");
      if (!sequenceId) {
        throw new Error("Sequence creation did not return an id.");
      }
      window.location.href = `${automationRootPath}/${encodeURIComponent(sequenceId)}`;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to create workflow.");
    } finally {
      setCreatingSuggested(false);
    }
  }

  const failureRuns = liveRuns.filter((run) => readText(run.status, "") === "failed");

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(251,146,60,0.22),transparent_32%),linear-gradient(135deg,rgba(23,23,23,1),rgba(9,9,11,1))] p-6 text-white shadow-[0_20px_80px_rgba(0,0,0,0.28)]">
        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-orange-200/80">
              Workflow Workspace
            </p>
            <div className="space-y-3">
              <h1 className="max-w-3xl text-3xl font-semibold tracking-tight md:text-4xl">
                Build, run, and tune automations from one visual control room
              </h1>
              <p className="max-w-2xl text-sm leading-6 text-white/72">
                The old sequence JSON CRUD view is replaced with a template-led workflow
                workspace. Start fast from a curated preset, then open the canvas to tune the
                linear task lane with execution-safe settings.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                onClick={() => void handleCreateSuggested()}
                disabled={creatingSuggested}
                className="bg-orange-500 text-zinc-950 hover:bg-orange-400"
              >
                {creatingSuggested ? "Creating…" : "Start From Best Practice"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => void handleCreateBlank()}
                disabled={creatingBlank}
                className="border border-white/15 bg-white/8 text-white hover:bg-white/14"
              >
                {creatingBlank ? "Creating…" : "Blank Linear Workflow"}
              </Button>
              <a
                href={templatesHref}
                className="inline-flex h-10 items-center justify-center rounded-md border border-white/15 px-4 text-sm font-medium text-white/80 transition hover:bg-white/10 hover:text-white"
              >
                Explore Templates
              </a>
            </div>
            {errorMessage && (
              <p className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                {errorMessage}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Workflows", value: liveSummary.totalSequences, tone: "text-white" },
              { label: "Active", value: liveSummary.activeSequences, tone: "text-emerald-300" },
              { label: "Pending Runs", value: liveSummary.pendingRuns, tone: "text-amber-200" },
              { label: "Failed Runs", value: liveSummary.failedRuns, tone: "text-rose-300" },
              {
                label: "Recent Outbox",
                value: liveSummary.recentOutboxEvents,
                tone: "text-sky-200",
              },
              {
                label: "Pending Outbox",
                value: liveSummary.pendingOutboxEvents,
                tone: "text-orange-200",
              },
            ].map((card) => (
              <div
                key={card.label}
                className="rounded-[1.5rem] border border-white/10 bg-white/6 p-4 backdrop-blur"
              >
                <p className="text-[11px] uppercase tracking-[0.2em] text-white/50">
                  {card.label}
                </p>
                <p className={`mt-3 text-3xl font-semibold ${card.tone}`}>{card.value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.12fr_0.88fr]">
        <Card className="border-white/10 bg-card/90 shadow-sm">
          <CardHeader className="gap-4 border-b border-border/70">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <CardTitle>Workflow Library</CardTitle>
                <CardDescription>
                  Overview, filters, and fast entry into the visual builder or executions.
                </CardDescription>
              </div>
              <div className="w-full md:max-w-sm">
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search by title, trigger, tag, or cron"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 pt-5">
            {filteredSequences.length === 0 ? (
              <div className="rounded-[1.25rem] border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
                No workflows match this filter.
              </div>
            ) : (
              filteredSequences.map((sequence) => {
                const sequenceId = readText(sequence.sequence_id, "");
                const tags = Array.isArray(sequence.tags)
                  ? sequence.tags.map((entry) => String(entry ?? "").trim()).filter(Boolean)
                  : [];
                return (
                  <article
                    key={sequenceId}
                    className="rounded-[1.4rem] border border-border bg-background/70 p-4"
                  >
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-semibold text-foreground">
                            {readText(sequence.title)}
                          </h3>
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium ${statusClass(
                              readText(sequence.status, "")
                            )}`}
                          >
                            {readText(sequence.status)}
                          </span>
                        </div>
                        <p className="max-w-2xl text-sm text-muted-foreground">
                          {readText(sequence.description, "No description yet")}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Trigger {readText(sequence.trigger_event)} • Cron {readText(sequence.cron)} •
                          Runs {readCount(sequence.run_count)}
                        </p>
                        {tags.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {tags.map((tag) => (
                              <span
                                key={`${sequenceId}:${tag}`}
                                className="inline-flex items-center rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <a
                          href={`${automationRootPath}/${encodeURIComponent(sequenceId)}`}
                          className="inline-flex h-9 items-center justify-center rounded-md bg-orange-500 px-3 text-sm font-medium text-zinc-950 transition hover:bg-orange-400"
                        >
                          Open Builder
                        </a>
                        <a
                          href={`${automationRootPath}/${encodeURIComponent(sequenceId)}/executions`}
                          className="inline-flex h-9 items-center justify-center rounded-md border border-input px-3 text-sm font-medium transition hover:bg-accent"
                        >
                          Executions
                        </a>
                      </div>
                    </div>
                  </article>
                );
              })
            )}

            {(sequences.hasPrev || sequences.hasNext) && (
              <div className="flex items-center justify-between rounded-[1.25rem] border border-border bg-background/60 px-4 py-3 text-sm text-muted-foreground">
                <span>
                  Page {sequences.page} of {Math.max(sequences.totalPages, 1)}
                </span>
                <div className="flex gap-2">
                  {sequences.hasPrev && (
                    <a
                      href={`${automationRootPath}?sequencePage=${Math.max(1, sequences.page - 1)}`}
                      className="inline-flex h-8 items-center rounded-md border border-input px-3 text-xs font-medium hover:bg-accent"
                    >
                      Previous
                    </a>
                  )}
                  {sequences.hasNext && (
                    <a
                      href={`${automationRootPath}?sequencePage=${sequences.page + 1}`}
                      className="inline-flex h-8 items-center rounded-md border border-input px-3 text-xs font-medium hover:bg-accent"
                    >
                      Next
                    </a>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="border-white/10 bg-card/90 shadow-sm">
            <CardHeader>
              <CardTitle>Recent Failures</CardTitle>
              <CardDescription>
                Failed runs stay visible here so operators can jump straight into recovery.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {failureRuns.length === 0 ? (
                <div className="rounded-[1.1rem] border border-dashed border-border px-4 py-8 text-sm text-muted-foreground">
                  No failed runs in the latest window.
                </div>
              ) : (
                failureRuns.slice(0, 4).map((run) => (
                  <article
                    key={readText(run.run_id)}
                    className="rounded-[1.15rem] border border-rose-400/20 bg-rose-500/5 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{readText(run.sequence_title)}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {formatTimestamp(run.created_at)} • {readText(run.trigger_type)}
                        </p>
                      </div>
                      <span className="rounded-full bg-rose-500/10 px-2.5 py-1 text-[11px] font-medium text-rose-300 ring-1 ring-rose-500/20">
                        failed
                      </span>
                    </div>
                    <p className="mt-3 text-sm text-rose-100/90">
                      {readText(run.error_text, "Open executions to inspect the failing task lane.")}
                    </p>
                    <a
                      href={`${automationRootPath}/${encodeURIComponent(
                        readText(run.sequence_id, "")
                      )}/executions?runId=${encodeURIComponent(readText(run.run_id, ""))}`}
                      className="mt-4 inline-flex h-8 items-center rounded-md border border-rose-400/25 px-3 text-xs font-medium text-rose-100 transition hover:bg-rose-500/10"
                    >
                      Inspect Execution
                    </a>
                  </article>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-card/90 shadow-sm">
            <CardHeader>
              <CardTitle>Recent Outbox</CardTitle>
              <CardDescription>
                Read-only relay-facing event visibility without leaving automation.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {liveOutbox.length === 0 ? (
                <div className="rounded-[1.1rem] border border-dashed border-border px-4 py-8 text-sm text-muted-foreground">
                  No outbox rows in the latest window.
                </div>
              ) : (
                liveOutbox.slice(0, 6).map((event) => (
                  <div
                    key={readText(event.event_id)}
                    className="rounded-[1.15rem] border border-border bg-background/70 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{readText(event.event_type)}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {readText(event.aggregate_type)} • {readText(event.aggregate_id)}
                        </p>
                      </div>
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium ${statusClass(
                          readText(event.status, "")
                        )}`}
                      >
                        {readText(event.status)}
                      </span>
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">
                      Attempts {readCount(event.attempt_count)} • Created {formatTimestamp(event.created_at)}
                    </p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

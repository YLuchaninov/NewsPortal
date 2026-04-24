import { useEffect, useMemo, useRef, useState } from "react";

import { PaginationNav } from "@newsportal/ui";

import {
  ADMIN_LIVE_UPDATES_EVENT,
  isAdminLiveSurfaceSnapshot,
  type AdminLiveUpdatesEventDetail,
  type AdminReindexJobSnapshot,
  type AdminReindexJobsSnapshot,
} from "../lib/live-updates";

interface LiveReindexJobsSectionProps {
  initialJobs: AdminReindexJobsSnapshot;
  currentPage: number;
  currentPath: string;
}

function resolvePageHref(currentPath: string, nextPage: number): string {
  const target = new URL(currentPath, "http://127.0.0.1");
  if (nextPage <= 1) {
    target.searchParams.delete("page");
  } else {
    target.searchParams.set("page", String(nextPage));
  }
  return `${target.pathname}${target.search}`;
}

function statusClass(status: string): string {
  if (status === "completed") {
    return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300";
  }
  if (status === "failed") {
    return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
  }
  if (status === "running") {
    return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
  }
  return "bg-muted text-muted-foreground";
}

function formatTimestamp(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function hydrateTimestampLabels(
  snapshot: AdminReindexJobsSnapshot
): AdminReindexJobsSnapshot {
  return {
    ...snapshot,
    items: snapshot.items.map((job) => ({
      ...job,
      createdAtLabel: formatTimestamp(job.createdAt) ?? job.createdAt,
    })),
  };
}

function hasSelectionProfileSnapshot(
  job: AdminReindexJobSnapshot
): job is AdminReindexJobSnapshot & {
  selectionProfileSnapshot: NonNullable<AdminReindexJobSnapshot["selectionProfileSnapshot"]>;
} {
  return job.selectionProfileSnapshot !== null;
}

function mergeItemsById(
  currentItems: AdminReindexJobSnapshot[],
  nextItems: AdminReindexJobSnapshot[]
): AdminReindexJobSnapshot[] {
  const nextById = new Map(
    nextItems.map((item) => [item.reindexJobId, item] as const)
  );
  return currentItems.map((item) => nextById.get(item.reindexJobId) ?? item);
}

export function LiveReindexJobsSection({
  initialJobs,
  currentPage,
  currentPath,
}: LiveReindexJobsSectionProps) {
  const [jobs, setJobs] = useState(initialJobs);
  const [needsRefreshNotice, setNeedsRefreshNotice] = useState(false);
  const baselineIdsRef = useRef(
    initialJobs.items.map((item) => item.reindexJobId).join("|")
  );
  const hydratedInitialJobs = useMemo(
    () => hydrateTimestampLabels(initialJobs),
    [initialJobs]
  );

  useEffect(() => {
    setJobs((currentJobs) =>
      currentJobs === initialJobs ? hydratedInitialJobs : currentJobs
    );
  }, [hydratedInitialJobs, initialJobs]);

  useEffect(() => {
    const currentSnapshot = window.__newsportalAdminLiveUpdates?.snapshot;
    if (isAdminLiveSurfaceSnapshot(currentSnapshot, "reindex")) {
      setJobs(hydrateTimestampLabels(currentSnapshot.jobs));
      if (currentPage === 1) {
        baselineIdsRef.current = currentSnapshot.jobs.items
          .map((item) => item.reindexJobId)
          .join("|");
      }
    }

    function handleLiveUpdate(event: Event): void {
      const detail = (event as CustomEvent<AdminLiveUpdatesEventDetail>).detail;
      if (!detail || !isAdminLiveSurfaceSnapshot(detail.snapshot, "reindex")) {
        return;
      }

      const nextJobs = detail.snapshot.jobs;
      const nextIds = nextJobs.items.map((item) => item.reindexJobId).join("|");
      const compositionChanged = baselineIdsRef.current !== nextIds;

      if (currentPage === 1 || !compositionChanged) {
        setJobs(hydrateTimestampLabels(nextJobs));
        if (currentPage === 1) {
          baselineIdsRef.current = nextIds;
        }
        setNeedsRefreshNotice(false);
        return;
      }

      const hydratedNextJobs = hydrateTimestampLabels(nextJobs);
      setJobs((currentJobs) => ({
        ...hydratedNextJobs,
        items: mergeItemsById(currentJobs.items, hydratedNextJobs.items),
      }));
      setNeedsRefreshNotice(true);
    }

    window.addEventListener(ADMIN_LIVE_UPDATES_EVENT, handleLiveUpdate);
    return () => {
      window.removeEventListener(ADMIN_LIVE_UPDATES_EVENT, handleLiveUpdate);
    };
  }, [currentPage]);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="border-b border-border px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold">Recent Jobs</p>
          <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            {jobs.queuedCount} queued
          </span>
          <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            {jobs.runningCount} running
          </span>
        </div>
        <p className="mt-0.5 text-[10px] text-muted-foreground">
          {jobs.total} job{jobs.total !== 1 ? "s" : ""} total
          {jobs.total > 0 &&
            ` — page ${jobs.page} of ${Math.max(jobs.totalPages, 1)}`}
        </p>
      </div>

      {needsRefreshNotice && (
        <div className="border-b border-border bg-primary/5 px-4 py-3">
          <div className="flex flex-col items-start gap-2 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
            <p className="font-medium text-foreground">
              Newer jobs changed this page's composition
            </p>
            <a
              href={currentPath}
              className="inline-flex h-8 items-center rounded-md border border-input px-3 text-xs font-medium transition-colors hover:bg-accent"
            >
              Refresh this page
            </a>
          </div>
        </div>
      )}

      <div className="divide-y divide-border">
        {jobs.items.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            No jobs on this page. Try another page of results.
          </div>
        ) : (
          jobs.items.map((job) => (
            <div
              key={job.reindexJobId}
              className="flex items-center justify-between px-4 py-3"
            >
              <div>
                <p className="text-sm font-medium">{job.indexName}</p>
                <p className="text-[11px] text-muted-foreground">
                  {job.jobKind}
                  {job.progressLabel && ` • ${job.progressLabel}`}
                </p>
                {job.selectionProfileSummary && (
                  <p className="text-[11px] text-muted-foreground">
                    selection profiles: {job.selectionProfileSummary}
                  </p>
                )}
                {hasSelectionProfileSnapshot(job) && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {job.selectionProfileSnapshot.activeProfiles}/
                      {job.selectionProfileSnapshot.totalProfiles} active
                    </span>
                    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {job.selectionProfileSnapshot.compatibilityProfiles} compatibility
                    </span>
                    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {job.selectionProfileSnapshot.templatesWithProfiles} template-bound
                    </span>
                    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                      max v{job.selectionProfileSnapshot.maxVersion}
                    </span>
                  </div>
                )}
                {job.createdAtLabel && (
                  <p className="text-xs text-muted-foreground">
                    {job.createdAtLabel}
                  </p>
                )}
              </div>
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusClass(
                  job.status
                )}`}
              >
                {job.status}
              </span>
            </div>
          ))
        )}
      </div>

      {(jobs.hasPrev || jobs.hasNext) && (
        <PaginationNav
          className="rounded-none border-x-0 border-b-0"
          page={jobs.page}
          totalPages={jobs.totalPages}
          hasPrev={jobs.hasPrev}
          hasNext={jobs.hasNext}
          prevHref={resolvePageHref(currentPath, jobs.page - 1)}
          nextHref={resolvePageHref(currentPath, jobs.page + 1)}
        />
      )}
    </div>
  );
}

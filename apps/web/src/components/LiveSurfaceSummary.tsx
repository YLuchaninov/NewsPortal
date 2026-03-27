import { useEffect, useRef, useState } from "react";

import {
  LIVE_UPDATES_EVENT,
  resolveSurfaceUpdateMessage,
  type LiveUpdateSurface,
  type LiveUpdatesEventDetail,
  type LiveUpdatesSnapshot,
} from "../lib/live-updates";

interface LiveSurfaceSummaryProps {
  surface: Extract<LiveUpdateSurface, "feed" | "matches" | "notifications">;
  initialCount: number;
  initialRevision: string;
  page: number;
  totalPages: number;
  singularLabel: string;
  pluralLabel: string;
  suffix: string;
  refreshHref: string;
}

function readMetricTotal(
  snapshot: LiveUpdatesSnapshot,
  surface: LiveSurfaceSummaryProps["surface"]
): { total: number; revision: string } {
  return snapshot[surface];
}

function buildCountLabel(
  count: number,
  singularLabel: string,
  pluralLabel: string,
  suffix: string
): string {
  const noun = count === 1 ? singularLabel : pluralLabel;
  return `${count} ${noun}${suffix}`;
}

export function LiveSurfaceSummary({
  surface,
  initialCount,
  initialRevision,
  page,
  totalPages,
  singularLabel,
  pluralLabel,
  suffix,
  refreshHref,
}: LiveSurfaceSummaryProps) {
  const [count, setCount] = useState(initialCount);
  const [hasUpdate, setHasUpdate] = useState(false);
  const baselineRevisionRef = useRef(initialRevision);

  useEffect(() => {
    const currentSnapshot = window.__newsportalLiveUpdates?.snapshot;
    if (currentSnapshot) {
      const metric = readMetricTotal(currentSnapshot, surface);
      setCount(metric.total);
      setHasUpdate(metric.revision !== baselineRevisionRef.current);
    }

    function handleLiveUpdate(event: Event): void {
      const detail = (event as CustomEvent<LiveUpdatesEventDetail>).detail;
      if (!detail) {
        return;
      }

      const metric = readMetricTotal(detail.snapshot, surface);
      setCount(metric.total);
      setHasUpdate(metric.revision !== baselineRevisionRef.current);
    }

    window.addEventListener(LIVE_UPDATES_EVENT, handleLiveUpdate);
    return () => {
      window.removeEventListener(LIVE_UPDATES_EVENT, handleLiveUpdate);
    };
  }, [surface]);

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {buildCountLabel(count, singularLabel, pluralLabel, suffix)}
        {count > 0 && ` — page ${page} of ${Math.max(totalPages, 1)}`}
      </p>

      {hasUpdate && (
        <div className="flex flex-col items-start gap-2 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
          <p className="font-medium text-foreground">
            {resolveSurfaceUpdateMessage(surface)}
          </p>
          <a
            href={refreshHref}
            className="inline-flex h-8 items-center rounded-md border border-input px-3 text-xs font-medium transition-colors hover:bg-accent"
          >
            Refresh this page
          </a>
        </div>
      )}
    </div>
  );
}

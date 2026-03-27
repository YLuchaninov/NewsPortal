import { useEffect, useRef, useState } from "react";

import {
  ADMIN_LIVE_UPDATES_EVENT,
  isAdminLiveSurfaceSnapshot,
  type AdminCollectionSignal,
  type AdminLiveUpdateSurface,
  type AdminLiveUpdatesEventDetail,
  type AdminLiveUpdatesSnapshot,
} from "../lib/live-updates";

interface AdminLiveCollectionNoticeProps {
  surface: Extract<AdminLiveUpdateSurface, "dashboard" | "observability">;
  collection: "fetchRuns" | "llmReviews";
  initialTotal: number;
  initialRevision: string;
  refreshHref: string;
  updateMessage: string;
  visibleCount?: number;
  nounSingular?: string;
  nounPlural?: string;
  page?: number;
  totalPages?: number;
}

function readCollectionSignal(
  snapshot: AdminLiveUpdatesSnapshot,
  collection: AdminLiveCollectionNoticeProps["collection"]
): AdminCollectionSignal | null {
  if (
    snapshot.surface === "dashboard" &&
    collection === "fetchRuns"
  ) {
    return snapshot.fetchRuns;
  }
  if (snapshot.surface === "observability") {
    return snapshot[collection];
  }
  return null;
}

function buildSummaryLabel(props: AdminLiveCollectionNoticeProps, total: number): string {
  if (props.visibleCount != null) {
    return `Showing latest ${props.visibleCount} of ${total}`;
  }
  const singular = props.nounSingular ?? "item";
  const plural = props.nounPlural ?? `${singular}s`;
  const noun = total === 1 ? singular : plural;
  const pageSuffix =
    props.page != null && props.totalPages != null && total > 0
      ? ` — page ${props.page} of ${Math.max(props.totalPages, 1)}`
      : "";
  return `${total} ${noun} total${pageSuffix}`;
}

export function AdminLiveCollectionNotice(
  props: AdminLiveCollectionNoticeProps
) {
  const [total, setTotal] = useState(props.initialTotal);
  const [hasUpdate, setHasUpdate] = useState(false);
  const baselineRevisionRef = useRef(props.initialRevision);

  useEffect(() => {
    const currentSnapshot = window.__newsportalAdminLiveUpdates?.snapshot;
    if (
      currentSnapshot &&
      isAdminLiveSurfaceSnapshot(currentSnapshot, props.surface)
    ) {
      const signal = readCollectionSignal(currentSnapshot, props.collection);
      if (signal) {
        setTotal(signal.total);
        setHasUpdate(signal.revision !== baselineRevisionRef.current);
      }
    }

    function handleLiveUpdate(event: Event): void {
      const detail = (event as CustomEvent<AdminLiveUpdatesEventDetail>).detail;
      if (
        !detail ||
        !isAdminLiveSurfaceSnapshot(detail.snapshot, props.surface)
      ) {
        return;
      }

      const signal = readCollectionSignal(detail.snapshot, props.collection);
      if (!signal) {
        return;
      }

      setTotal(signal.total);
      setHasUpdate(signal.revision !== baselineRevisionRef.current);
    }

    window.addEventListener(ADMIN_LIVE_UPDATES_EVENT, handleLiveUpdate);
    return () => {
      window.removeEventListener(ADMIN_LIVE_UPDATES_EVENT, handleLiveUpdate);
    };
  }, [props.collection, props.surface]);

  return (
    <div className="space-y-2">
      <p className="text-[10px] text-muted-foreground">
        {buildSummaryLabel(props, total)}
      </p>
      {hasUpdate && (
        <div className="flex flex-col items-start gap-2 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
          <p className="font-medium text-foreground">{props.updateMessage}</p>
          <a
            href={props.refreshHref}
            className="inline-flex h-8 items-center rounded-md border border-input px-3 text-xs font-medium transition-colors hover:bg-accent"
          >
            Refresh this page
          </a>
        </div>
      )}
    </div>
  );
}

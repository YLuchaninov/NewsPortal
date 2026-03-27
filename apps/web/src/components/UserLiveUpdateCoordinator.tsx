import { useEffect, useRef } from "react";
import { toast } from "sonner";

import {
  LIVE_UPDATES_EVENT,
  diffLiveUpdates,
  resolveLiveUpdateDelay,
  resolveSurfaceHref,
  resolveSurfaceUpdateMessage,
  type LiveUpdateChanges,
  type LiveUpdateSurface,
  type LiveUpdatesEventDetail,
  type LiveUpdatesResponse,
  type LiveUpdatesSnapshot,
} from "../lib/live-updates";

type ToastSurface = Extract<LiveUpdateSurface, "feed" | "matches" | "notifications">;

interface UserLiveUpdateCoordinatorProps {
  endpoint: string;
  activeSurface: LiveUpdateSurface | null;
}

async function fetchLiveUpdatesSnapshot(
  endpoint: string,
  signal: AbortSignal
): Promise<LiveUpdatesResponse> {
  const response = await fetch(endpoint, {
    method: "GET",
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });

  if (!response.ok) {
    throw new Error(`Live updates request failed with ${response.status}.`);
  }

  return (await response.json()) as LiveUpdatesResponse;
}

function announceSurfaceToast(
  surface: ToastSurface,
  changes: LiveUpdateChanges,
  nextSnapshot: LiveUpdatesSnapshot,
  activeSurface: LiveUpdateSurface | null,
  announcedRevisions: Record<string, string>
): void {
  if (surface === activeSurface) {
    return;
  }
  if (!changes[surface]) {
    return;
  }

  const metric = nextSnapshot[surface];
  if (!metric || announcedRevisions[surface] === metric.revision) {
    return;
  }

  announcedRevisions[surface] = metric.revision;
  toast(resolveSurfaceUpdateMessage(surface), {
    action: {
      label: "Open",
      onClick: () => {
        window.location.assign(resolveSurfaceHref(surface));
      },
    },
  });
}

export function UserLiveUpdateCoordinator({
  endpoint,
  activeSurface,
}: UserLiveUpdateCoordinatorProps) {
  const snapshotRef = useRef<LiveUpdatesSnapshot | null>(null);
  const activeSurfaceRef = useRef<LiveUpdateSurface | null>(activeSurface);
  const timeoutRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const failureCountRef = useRef(0);
  const announcedRevisionsRef = useRef<Record<string, string>>({});

  useEffect(() => {
    activeSurfaceRef.current = activeSurface;
    window.__newsportalLiveUpdates = {
      ...(window.__newsportalLiveUpdates ?? {
        snapshot: snapshotRef.current,
      }),
      activeSurface,
      forceRefresh: window.__newsportalLiveUpdates?.forceRefresh,
    };
  }, [activeSurface]);

  useEffect(() => {
    let cancelled = false;

    function clearScheduledPoll(): void {
      if (timeoutRef.current != null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    }

    function scheduleNextPoll(snapshot: LiveUpdatesSnapshot | null): void {
      clearScheduledPoll();
      const delay = resolveLiveUpdateDelay({
        hidden: document.visibilityState === "hidden",
        snapshot,
        consecutiveFailures: failureCountRef.current,
      });
      if (delay == null) {
        return;
      }
      timeoutRef.current = window.setTimeout(() => {
        void runPoll();
      }, delay);
    }

    async function runPoll(): Promise<void> {
      abortRef.current?.abort();
      const abortController = new AbortController();
      abortRef.current = abortController;

      try {
        const payload = await fetchLiveUpdatesSnapshot(
          endpoint,
          abortController.signal
        );
        if (cancelled) {
          return;
        }

        if (!payload.sessionActive || !payload.snapshot) {
          snapshotRef.current = null;
          window.__newsportalLiveUpdates = {
            snapshot: null,
            activeSurface: activeSurfaceRef.current,
            forceRefresh,
          };
          scheduleNextPoll(null);
          return;
        }

        const previousSnapshot = snapshotRef.current;
        const nextSnapshot = payload.snapshot;
        const changes = diffLiveUpdates(previousSnapshot, nextSnapshot);
        failureCountRef.current = 0;
        snapshotRef.current = nextSnapshot;

        window.__newsportalLiveUpdates = {
          snapshot: nextSnapshot,
          activeSurface: activeSurfaceRef.current,
          forceRefresh,
        };

        announceSurfaceToast(
          "feed",
          changes,
          nextSnapshot,
          activeSurfaceRef.current,
          announcedRevisionsRef.current
        );
        announceSurfaceToast(
          "matches",
          changes,
          nextSnapshot,
          activeSurfaceRef.current,
          announcedRevisionsRef.current
        );
        announceSurfaceToast(
          "notifications",
          changes,
          nextSnapshot,
          activeSurfaceRef.current,
          announcedRevisionsRef.current
        );

        window.dispatchEvent(
          new CustomEvent<LiveUpdatesEventDetail>(LIVE_UPDATES_EVENT, {
            detail: {
              snapshot: nextSnapshot,
              previousSnapshot,
              changes,
            },
          })
        );

        scheduleNextPoll(nextSnapshot);
      } catch (error) {
        if (cancelled) {
          return;
        }
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        failureCountRef.current += 1;
        scheduleNextPoll(snapshotRef.current);
      }
    }

    function forceRefresh(): void {
      clearScheduledPoll();
      void runPoll();
    }

    function handleVisibilityChange(): void {
      if (document.visibilityState === "visible") {
        forceRefresh();
      } else {
        clearScheduledPoll();
      }
    }

    window.__newsportalLiveUpdates = {
      snapshot: snapshotRef.current,
      activeSurface,
      forceRefresh,
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    void runPoll();

    return () => {
      cancelled = true;
      clearScheduledPoll();
      abortRef.current?.abort();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [activeSurface, endpoint]);

  return null;
}

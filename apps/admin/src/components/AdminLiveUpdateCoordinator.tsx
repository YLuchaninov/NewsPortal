import { useEffect, useRef } from "react";

import {
  ADMIN_LIVE_UPDATES_EVENT,
  resolveAdminLiveUpdateDelay,
  type AdminLiveUpdateSurface,
  type AdminLiveUpdatesEventDetail,
  type AdminLiveUpdatesResponse,
  type AdminLiveUpdatesSnapshot,
} from "../lib/live-updates";

interface AdminLiveUpdateCoordinatorProps {
  endpoint: string;
  activeSurface: AdminLiveUpdateSurface | null;
}

async function fetchAdminLiveUpdatesSnapshot(
  endpoint: string,
  signal: AbortSignal
): Promise<AdminLiveUpdatesResponse> {
  const response = await fetch(endpoint, {
    method: "GET",
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });

  if (!response.ok) {
    throw new Error(
      `Admin live updates request failed with ${response.status}.`
    );
  }

  return (await response.json()) as AdminLiveUpdatesResponse;
}

export function AdminLiveUpdateCoordinator({
  endpoint,
  activeSurface,
}: AdminLiveUpdateCoordinatorProps) {
  const snapshotRef = useRef<AdminLiveUpdatesSnapshot | null>(null);
  const activeSurfaceRef = useRef<AdminLiveUpdateSurface | null>(activeSurface);
  const timeoutRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const failureCountRef = useRef(0);

  useEffect(() => {
    activeSurfaceRef.current = activeSurface;
    window.__newsportalAdminLiveUpdates = {
      ...(window.__newsportalAdminLiveUpdates ?? {
        snapshot: snapshotRef.current,
      }),
      activeSurface,
      forceRefresh: window.__newsportalAdminLiveUpdates?.forceRefresh,
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

    function scheduleNextPoll(snapshot: AdminLiveUpdatesSnapshot | null): void {
      clearScheduledPoll();
      const delay = resolveAdminLiveUpdateDelay({
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
        const payload = await fetchAdminLiveUpdatesSnapshot(
          endpoint,
          abortController.signal
        );
        if (cancelled) {
          return;
        }

        if (!payload.sessionActive || !payload.snapshot) {
          snapshotRef.current = null;
          window.__newsportalAdminLiveUpdates = {
            snapshot: null,
            activeSurface: activeSurfaceRef.current,
            forceRefresh,
          };
          scheduleNextPoll(null);
          return;
        }

        const previousSnapshot = snapshotRef.current;
        const nextSnapshot = payload.snapshot;
        const hasChanged =
          previousSnapshot?.revision !== nextSnapshot.revision ||
          previousSnapshot?.surface !== nextSnapshot.surface;

        failureCountRef.current = 0;
        snapshotRef.current = nextSnapshot;

        window.__newsportalAdminLiveUpdates = {
          snapshot: nextSnapshot,
          activeSurface: activeSurfaceRef.current,
          forceRefresh,
        };

        window.dispatchEvent(
          new CustomEvent<AdminLiveUpdatesEventDetail>(
            ADMIN_LIVE_UPDATES_EVENT,
            {
              detail: {
                snapshot: nextSnapshot,
                previousSnapshot,
                hasChanged,
              },
            }
          )
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

    window.__newsportalAdminLiveUpdates = {
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

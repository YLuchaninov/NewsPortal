import { useEffect, useState } from "react";

import { PaginationNav } from "@newsportal/ui";

import { buildInterestPageState, replaceLiveInterestRecords, resolveInterestRepairState } from "../lib/live-interest-state";
import { LIVE_UPDATES_EVENT, type LiveUpdatesEventDetail, type LiveUpdatesSnapshot } from "../lib/live-updates";
import { InterestManager } from "./InterestManager";

interface InterestRecord {
  interest_id: string;
  description?: string;
  compile_status?: string;
  enabled?: boolean;
  priority?: number;
  positive_texts?: string[];
  negative_texts?: string[];
  places?: string[];
  languages_allowed?: string[];
  time_window_hours?: number | null;
  must_have_terms?: string[];
  must_not_have_terms?: string[];
  short_tokens_required?: string[];
  short_tokens_forbidden?: string[];
  updated_at?: string | null;
  created_at?: string | null;
  error_text?: string | null;
}

interface LiveInterestsSectionProps {
  initialInterests: InterestRecord[];
  initialPage: number;
  pageSize: number;
  currentPath: string;
  interestsPath: string;
  interestPathBase: string;
}

function buildPageHref(currentPath: string, nextPage: number): string {
  const target = new URL(currentPath, "http://localhost");
  if (nextPage <= 1) {
    target.searchParams.delete("page");
  } else {
    target.searchParams.set("page", String(nextPage));
  }
  return `${target.pathname}${target.search}`;
}

export function LiveInterestsSection({
  initialInterests,
  initialPage,
  pageSize,
  currentPath,
  interestsPath,
  interestPathBase,
}: LiveInterestsSectionProps) {
  const [allInterests, setAllInterests] = useState<InterestRecord[]>(
    replaceLiveInterestRecords([], initialInterests)
  );
  const [page, setPage] = useState(initialPage);
  const [liveSnapshot, setLiveSnapshot] = useState<LiveUpdatesSnapshot | null>(null);

  const pageState = buildInterestPageState(allInterests, page, pageSize);

  async function refreshInterests(): Promise<void> {
    const response = await fetch(interestsPath, {
      method: "GET",
      cache: "no-store",
      credentials: "same-origin",
    });
    if (!response.ok) {
      throw new Error(`Unable to refresh interests (${response.status}).`);
    }

    const payload = (await response.json()) as { interests?: InterestRecord[] };
    setAllInterests((current) =>
      replaceLiveInterestRecords(current, Array.isArray(payload.interests) ? payload.interests : [])
    );
  }

  async function handleMutationSuccess(): Promise<void> {
    await refreshInterests();
    window.__newsportalLiveUpdates?.forceRefresh?.();
  }

  useEffect(() => {
    setLiveSnapshot(window.__newsportalLiveUpdates?.snapshot ?? null);
  }, []);

  useEffect(() => {
    if (page !== pageState.page) {
      setPage(pageState.page);
      window.history.replaceState(null, "", buildPageHref(currentPath, pageState.page));
    }
  }, [currentPath, page, pageState.page]);

  useEffect(() => {
    function handleLiveUpdate(event: Event): void {
      const detail = (event as CustomEvent<LiveUpdatesEventDetail>).detail;
      if (!detail) {
        return;
      }

      setLiveSnapshot(detail.snapshot);
      if (detail.changes.interests) {
        void refreshInterests();
      }
    }

    window.addEventListener(LIVE_UPDATES_EVENT, handleLiveUpdate);
    return () => {
      window.removeEventListener(LIVE_UPDATES_EVENT, handleLiveUpdate);
    };
  }, [interestsPath]);

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        {pageState.total} interest{pageState.total !== 1 ? "s" : ""} total
        {pageState.total > 0 &&
          ` — page ${pageState.page} of ${Math.max(pageState.totalPages, 1)}`}
      </p>

      <InterestManager
        interests={pageState.items}
        interestsPath={interestsPath}
        interestPathBase={interestPathBase}
        hasAnyInterests={pageState.total > 0}
        onMutationSuccess={handleMutationSuccess}
        readRepairState={(interestId) =>
          resolveInterestRepairState(
            interestId,
            liveSnapshot?.repairJobs ?? []
          )
        }
      />

      {(pageState.hasPrev || pageState.hasNext) && (
        <PaginationNav
          page={pageState.page}
          totalPages={pageState.totalPages}
          hasPrev={pageState.hasPrev}
          hasNext={pageState.hasNext}
          prevHref={buildPageHref(currentPath, pageState.page - 1)}
          nextHref={buildPageHref(currentPath, pageState.page + 1)}
        />
      )}
    </div>
  );
}

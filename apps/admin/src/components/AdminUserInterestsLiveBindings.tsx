import { useEffect, useRef } from "react";

import {
  ADMIN_LIVE_UPDATES_EVENT,
  isAdminLiveSurfaceSnapshot,
  type AdminLiveUpdatesEventDetail,
  type AdminUserInterestCompileTone,
  type AdminUserInterestsLiveSnapshot,
} from "../lib/live-updates";

interface AdminUserInterestsLiveBindingsProps {
  targetUserId: string;
  initialInterestIds: string[];
  refreshHref: string;
}

function compileToneClass(tone: AdminUserInterestCompileTone): string {
  if (tone === "success") {
    return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300";
  }
  if (tone === "warning") {
    return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300";
  }
  if (tone === "error") {
    return "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300";
  }
  return "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200";
}

function setText(
  selector: string,
  value: string
): void {
  const node = document.querySelector<HTMLElement>(selector);
  if (node) {
    node.textContent = value;
  }
}

function toggleNode(selector: string, visible: boolean, text?: string): void {
  const node = document.querySelector<HTMLElement>(selector);
  if (!node) {
    return;
  }
  node.classList.toggle("hidden", !visible);
  if (text != null) {
    node.textContent = text;
  }
}

function applySnapshot(snapshot: AdminUserInterestsLiveSnapshot): void {
  setText(
    '[data-admin-live-interest-count="total"]',
    String(snapshot.counts.total)
  );
  setText(
    '[data-admin-live-interest-count="enabled"]',
    String(snapshot.counts.enabledCount)
  );
  setText(
    '[data-admin-live-interest-count="compiled"]',
    String(snapshot.counts.compiledCount)
  );
  setText(
    "[data-admin-live-interest-summary]",
    `${snapshot.counts.total} interest${
      snapshot.counts.total !== 1 ? "s" : ""
    } for the selected user`
  );

  for (const interest of snapshot.interests) {
    const statusNode = document.querySelector<HTMLElement>(
      `[data-admin-live-interest-status="${interest.interestId}"]`
    );
    if (statusNode) {
      statusNode.textContent = interest.compileLabel;
      statusNode.className = [
        "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium",
        compileToneClass(interest.compileTone),
      ].join(" ");
    }

    setText(
      `[data-admin-live-interest-compile-detail="${interest.interestId}"]`,
      interest.compileDetail ? ` • ${interest.compileDetail}` : ""
    );

    toggleNode(
      `[data-admin-live-interest-error="${interest.interestId}"]`,
      interest.compileStatus === "failed" && Boolean(interest.errorText),
      interest.errorText ?? ""
    );

    toggleNode(
      `[data-admin-live-interest-compiled-pill="${interest.interestId}"]`,
      interest.hasCompiledSnapshot
    );
  }
}

export function AdminUserInterestsLiveBindings({
  targetUserId,
  initialInterestIds,
  refreshHref,
}: AdminUserInterestsLiveBindingsProps) {
  const baselineIdsRef = useRef(initialInterestIds.join("|"));

  useEffect(() => {
    function revealRefreshNotice(): void {
      const container = document.querySelector<HTMLElement>(
        "[data-admin-live-interest-refresh]"
      );
      if (!container) {
        return;
      }
      container.classList.remove("hidden");
      const link = container.querySelector<HTMLAnchorElement>("a");
      if (link) {
        link.href = refreshHref;
      }
    }

    function maybeApplySnapshot(snapshot: AdminUserInterestsLiveSnapshot): void {
      if (snapshot.targetUserId !== targetUserId) {
        return;
      }
      const nextIds = snapshot.interests.map((interest) => interest.interestId).join("|");
      if (nextIds !== baselineIdsRef.current) {
        revealRefreshNotice();
      }
      applySnapshot(snapshot);
    }

    const currentSnapshot = window.__newsportalAdminLiveUpdates?.snapshot;
    if (isAdminLiveSurfaceSnapshot(currentSnapshot, "user-interests")) {
      maybeApplySnapshot(currentSnapshot);
    }

    function handleLiveUpdate(event: Event): void {
      const detail = (event as CustomEvent<AdminLiveUpdatesEventDetail>).detail;
      if (
        !detail ||
        !isAdminLiveSurfaceSnapshot(detail.snapshot, "user-interests")
      ) {
        return;
      }
      maybeApplySnapshot(detail.snapshot);
    }

    window.addEventListener(ADMIN_LIVE_UPDATES_EVENT, handleLiveUpdate);
    return () => {
      window.removeEventListener(ADMIN_LIVE_UPDATES_EVENT, handleLiveUpdate);
    };
  }, [refreshHref, targetUserId]);

  return null;
}

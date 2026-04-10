import { useEffect, useState } from "react";

import {
  ADMIN_LIVE_UPDATES_EVENT,
  isAdminLiveSurfaceSnapshot,
  type AdminDashboardSummarySnapshot,
  type AdminLiveUpdatesEventDetail,
} from "../lib/live-updates";

interface LiveDashboardKpiGridProps {
  initialSummary: AdminDashboardSummarySnapshot;
}

function buildCards(summary: AdminDashboardSummarySnapshot) {
  const llmBudgetCard = {
    label:
      summary.llmBudgetEnabled && summary.llmMonthlyQuotaReached
        ? `LLM Budget · ${
            summary.llmAcceptGrayZoneOnBudgetExhaustion ? "Accept" : "Reject"
          }`
        : "LLM Budget",
    value: !summary.llmBudgetEnabled
      ? "Disabled"
      : summary.llmMonthlyBudgetCents <= 0
      ? "Cap off"
      : summary.llmMonthlyQuotaReached
      ? "Exhausted"
      : `${summary.llmRemainingMonthlyBudgetCents ?? 0}¢ left`,
    color: !summary.llmBudgetEnabled
      ? "text-muted-foreground"
      : summary.llmMonthlyQuotaReached
      ? "text-amber-500"
      : "text-emerald-500",
  };
  return [
    {
      label: "System Feed News",
      value: String(summary.activeNews),
      color: "text-emerald-500",
    },
    {
      label: "Processed 24h",
      value: String(summary.processedToday),
      color: "text-blue-500",
    },
    {
      label: "Total Users",
      value: String(summary.totalUsers),
      color: "text-violet-500",
    },
    {
      label: "Overdue Channels",
      value: String(summary.overdueChannels),
      color:
        summary.overdueChannels > 0
          ? "text-amber-500"
          : "text-muted-foreground",
    },
    {
      label: "Fetch Failures 24h",
      value: String(summary.fetchFailures24h),
      color:
        summary.fetchFailures24h > 0
          ? "text-red-500"
          : "text-muted-foreground",
    },
    {
      label: "LLM Reviews 24h",
      value: String(summary.llmReviewCount24h),
      color: "text-primary",
    },
    llmBudgetCard,
    {
      label: "New Content 24h",
      value: String(summary.newContent24h),
      color: "text-cyan-500",
    },
    {
      label: "Needs Attention",
      value: String(summary.attentionChannels),
      color:
        summary.attentionChannels > 0
          ? "text-amber-500"
          : "text-muted-foreground",
    },
  ];
}

export function LiveDashboardKpiGrid({
  initialSummary,
}: LiveDashboardKpiGridProps) {
  const [summary, setSummary] = useState(initialSummary);

  useEffect(() => {
    const currentSnapshot = window.__newsportalAdminLiveUpdates?.snapshot;
    if (isAdminLiveSurfaceSnapshot(currentSnapshot, "dashboard")) {
      setSummary(currentSnapshot.summary);
    }

    function handleLiveUpdate(event: Event): void {
      const detail = (event as CustomEvent<AdminLiveUpdatesEventDetail>).detail;
      if (!detail || !isAdminLiveSurfaceSnapshot(detail.snapshot, "dashboard")) {
        return;
      }
      setSummary(detail.snapshot.summary);
    }

    window.addEventListener(ADMIN_LIVE_UPDATES_EVENT, handleLiveUpdate);
    return () => {
      window.removeEventListener(ADMIN_LIVE_UPDATES_EVENT, handleLiveUpdate);
    };
  }, []);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {buildCards(summary).map(({ label, value, color }) => (
        <div key={label} className="rounded-xl border border-border bg-card p-4">
          <p className="mb-1 text-xs text-muted-foreground">{label}</p>
          <p className={`text-2xl font-bold ${color}`}>{value}</p>
        </div>
      ))}
    </div>
  );
}

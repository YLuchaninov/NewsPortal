import { useEffect, useState } from "react";

import {
  ADMIN_LIVE_UPDATES_EVENT,
  isAdminLiveSurfaceSnapshot,
  type AdminLiveUpdatesEventDetail,
  type AdminObservabilityWindowSnapshot,
} from "../lib/live-updates";

interface LiveObservabilitySummaryProps {
  initial24h: AdminObservabilityWindowSnapshot;
  initial7d: AdminObservabilityWindowSnapshot;
}

function fmtDecimal(value: number, decimals = 2): string {
  return Number.isFinite(value) ? value.toFixed(decimals) : "0";
}

export function LiveObservabilitySummary({
  initial24h,
  initial7d,
}: LiveObservabilitySummaryProps) {
  const [usage24h, setUsage24h] = useState(initial24h);
  const [usage7d, setUsage7d] = useState(initial7d);

  useEffect(() => {
    const currentSnapshot = window.__newsportalAdminLiveUpdates?.snapshot;
    if (isAdminLiveSurfaceSnapshot(currentSnapshot, "observability")) {
      setUsage24h(currentSnapshot.usage24h);
      setUsage7d(currentSnapshot.usage7d);
    }

    function handleLiveUpdate(event: Event): void {
      const detail = (event as CustomEvent<AdminLiveUpdatesEventDetail>).detail;
      if (
        !detail ||
        !isAdminLiveSurfaceSnapshot(detail.snapshot, "observability")
      ) {
        return;
      }

      setUsage24h(detail.snapshot.usage24h);
      setUsage7d(detail.snapshot.usage7d);
    }

    window.addEventListener(ADMIN_LIVE_UPDATES_EVENT, handleLiveUpdate);
    return () => {
      window.removeEventListener(ADMIN_LIVE_UPDATES_EVENT, handleLiveUpdate);
    };
  }, []);

  const cards = [
    { label: "Reviews (24h)", value: String(usage24h.reviewCount) },
    { label: "Tokens (24h)", value: String(usage24h.totalTokens) },
    {
      label: "Cost USD (24h)",
      value: `$${fmtDecimal(usage24h.costEstimateUsd, 4)}`,
    },
    {
      label: "Avg latency (24h)",
      value: `${fmtDecimal(usage24h.avgLatencyMs, 0)}ms`,
    },
    { label: "Reviews (7d)", value: String(usage7d.reviewCount) },
    { label: "Tokens (7d)", value: String(usage7d.totalTokens) },
    {
      label: "Cost USD (7d)",
      value: `$${fmtDecimal(usage7d.costEstimateUsd, 4)}`,
    },
    {
      label: "Avg latency (7d)",
      value: `${fmtDecimal(usage7d.avgLatencyMs, 0)}ms`,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {cards.map(({ label, value }) => (
        <div key={label} className="rounded-xl border border-border bg-card p-4">
          <p className="mb-1 text-xs text-muted-foreground">{label}</p>
          <p className="text-lg font-bold">{value}</p>
        </div>
      ))}
    </div>
  );
}

import { useEffect, useState } from "react";

import {
  ADMIN_LIVE_UPDATES_EVENT,
  type AdminLlmBudgetSnapshot,
  isAdminLiveSurfaceSnapshot,
  type AdminLiveUpdatesEventDetail,
  type AdminObservabilityWindowSnapshot,
} from "../lib/live-updates";

interface LiveObservabilitySummaryProps {
  initial24h: AdminObservabilityWindowSnapshot;
  initial7d: AdminObservabilityWindowSnapshot;
  initialBudget: AdminLlmBudgetSnapshot;
}

function fmtDecimal(value: number, decimals = 2): string {
  return Number.isFinite(value) ? value.toFixed(decimals) : "0";
}

export function LiveObservabilitySummary({
  initial24h,
  initial7d,
  initialBudget,
}: LiveObservabilitySummaryProps) {
  const [usage24h, setUsage24h] = useState(initial24h);
  const [usage7d, setUsage7d] = useState(initial7d);
  const [llmBudget, setLlmBudget] = useState(initialBudget);

  useEffect(() => {
    const currentSnapshot = window.__newsportalAdminLiveUpdates?.snapshot;
    if (isAdminLiveSurfaceSnapshot(currentSnapshot, "observability")) {
      setUsage24h(currentSnapshot.usage24h);
      setUsage7d(currentSnapshot.usage7d);
      setLlmBudget(currentSnapshot.llmBudget);
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
      setLlmBudget(detail.snapshot.llmBudget);
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

  const budgetState = !llmBudget.enabled
    ? "Disabled"
    : llmBudget.monthlyBudgetCents <= 0
    ? "Cap off"
    : llmBudget.monthlyQuotaReached
    ? "Exhausted"
    : "Tracking";

  const budgetPolicy = llmBudget.acceptGrayZoneOnBudgetExhaustion
    ? "Accept gray zone"
    : "Reject gray zone";

  function fmtUsdFromCents(value: number | null): string {
    if (value == null) {
      return "Cap off";
    }
    return `$${fmtDecimal(value / 100, 2)}`;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cards.map(({ label, value }) => (
          <div key={label} className="rounded-xl border border-border bg-card p-4">
            <p className="mb-1 text-xs text-muted-foreground">{label}</p>
            <p className="text-lg font-bold">{value}</p>
          </div>
        ))}
      </div>

      <div
        className={`rounded-xl border p-4 ${
          llmBudget.enabled && llmBudget.monthlyQuotaReached
            ? "border-amber-300 bg-amber-50/60 dark:border-amber-900/40 dark:bg-amber-950/20"
            : "border-border bg-card"
        }`}
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div>
            <p className="mb-1 text-xs text-muted-foreground">LLM review lane</p>
            <p className="text-lg font-bold">{llmBudget.enabled ? "Enabled" : "Disabled"}</p>
          </div>
          <div>
            <p className="mb-1 text-xs text-muted-foreground">Monthly cap</p>
            <p className="text-lg font-bold">
              {llmBudget.monthlyBudgetCents > 0
                ? fmtUsdFromCents(llmBudget.monthlyBudgetCents)
                : "Cap off"}
            </p>
          </div>
          <div>
            <p className="mb-1 text-xs text-muted-foreground">Spent this UTC month</p>
            <p className="text-lg font-bold">{fmtUsdFromCents(llmBudget.monthToDateCostCents)}</p>
          </div>
          <div>
            <p className="mb-1 text-xs text-muted-foreground">Hard stop</p>
            <p className="text-lg font-bold">{budgetState}</p>
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Remaining: {fmtUsdFromCents(llmBudget.remainingMonthlyBudgetCents)}. Post-cap policy:{" "}
          {budgetPolicy}. Setting the cap to <code>0</code> disables the monthly hard stop.
        </p>
      </div>
    </div>
  );
}

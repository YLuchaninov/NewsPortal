import type { AdminUserInterestCompileState } from "./server/user-interest-admin-page";

export function badgeClass(tone: AdminUserInterestCompileState["tone"]): string {
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

export function formatUpdatedAt(value: unknown): string {
  if (!value) {
    return "unknown";
  }
  return new Date(String(value)).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

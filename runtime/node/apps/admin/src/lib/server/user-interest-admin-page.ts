import {
  resolveAdminUserInterestLookupInput,
  type AdminUserInterestTarget,
} from "./user-interests";

export interface AdminUserInterestSearchState {
  rawUserId: string;
  rawEmail: string;
  lookup: { userId?: string; email?: string } | null;
}

export interface AdminUserInterestContextField {
  name: string;
  value: string;
}

export interface AdminUserInterestCompileState {
  label: string;
  tone: "success" | "warning" | "muted" | "error";
  detail: string | null;
}

function normalizeString(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeTimestamp(value: unknown): string | null {
  const normalized = normalizeString(value);
  if (!normalized) {
    return null;
  }
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return normalized;
  }
  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function resolveAdminUserInterestSearchState(
  searchParams: URLSearchParams
): AdminUserInterestSearchState {
  const rawUserId = normalizeString(searchParams.get("userId"));
  const rawEmail = normalizeString(searchParams.get("email"));
  const lookup = resolveAdminUserInterestLookupInput({
    userId: rawUserId,
    email: rawEmail,
  });

  return {
    rawUserId,
    rawEmail,
    lookup: lookup.userId || lookup.email ? lookup : null,
  };
}

export function buildAdminUserInterestContextFields(
  target: AdminUserInterestTarget,
  redirectTo: string
): AdminUserInterestContextField[] {
  return [
    { name: "userId", value: target.userId },
    { name: "redirectTo", value: redirectTo },
  ];
}

export function formatLineListValue(value: unknown): string {
  return Array.isArray(value)
    ? value
        .map((entry) => normalizeString(entry))
        .filter(Boolean)
        .join("\n")
    : "";
}

export function formatCsvListValue(value: unknown): string {
  return Array.isArray(value)
    ? value
        .map((entry) => normalizeString(entry))
        .filter(Boolean)
        .join(", ")
    : "";
}

export function resolveAdminUserInterestCompileState(
  interest: Record<string, unknown>
): AdminUserInterestCompileState {
  const compileStatus = normalizeString(interest.compile_status) || "pending";
  if (compileStatus === "compiled") {
    return {
      label: "Compiled",
      tone: "success",
      detail: normalizeTimestamp(interest.compiled_at) ?? "Ready for matching",
    };
  }
  if (compileStatus === "failed") {
    return {
      label: "Failed",
      tone: "error",
      detail: normalizeString(interest.error_text) || "Compilation failed",
    };
  }
  if (compileStatus === "queued") {
    return {
      label: "Queued",
      tone: "warning",
      detail: "Worker will recompile this interest shortly",
    };
  }
  return {
    label: "Pending",
    tone: "muted",
    detail: "Waiting for the first successful compile",
  };
}

import {
  ClientActionError,
  createClientActionError,
  reportClientError,
  readClientErrorMessage,
} from "@signalops/ui";

export type JsonRecord = Record<string, unknown>;

export function readText(value: unknown, fallback = "—"): string {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : fallback;
}

export function readCount(value: unknown, fallback = 0): number {
  const parsed =
    typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function formatUtcTimestamp(value: unknown): string {
  if (!value) {
    return "—";
  }
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) {
    return String(value);
  }
  return parsed.toLocaleString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function automationStatusClass(status: string): string {
  if (status === "active" || status === "completed" || status === "published") {
    return "bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-500/20";
  }
  if (status === "failed") {
    return "bg-rose-500/10 text-rose-300 ring-1 ring-rose-500/20";
  }
  if (status === "pending" || status === "draft" || status === "running") {
    return "bg-amber-500/10 text-amber-200 ring-1 ring-amber-500/20";
  }
  return "bg-white/5 text-white/70 ring-1 ring-white/10";
}

export async function postJson(path: string, payload: Record<string, unknown>): Promise<JsonRecord> {
  const response = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify(payload),
  });
  const json = (await response.json().catch(() => ({}))) as JsonRecord;
  if (!response.ok) {
    const error = createClientActionError(json, {
      fallbackMessage: `Request failed with ${response.status}`,
      status: response.status,
    });
    reportClientError(error, {
      context: `Admin request failed: ${path}`,
      fallbackMessage: readText(json.error ?? json.detail, `Request failed with ${response.status}`),
    });
    throw error;
  }
  return json;
}

export function reportAdminActionError(
  error: unknown,
  options: { context: string; fallbackMessage: string }
): string {
  if (error instanceof ClientActionError) {
    return readClientErrorMessage(error, options.fallbackMessage);
  }
  return reportClientError(error, {
    context: options.context,
    fallbackMessage: options.fallbackMessage,
  });
}

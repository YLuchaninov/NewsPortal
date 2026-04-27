export type DiscoveryRecord = Record<string, unknown>;

export type DiscoveryPagedRecord = {
  items: DiscoveryRecord[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
};

export function asRecord(value: unknown): DiscoveryRecord {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as DiscoveryRecord)
    : {};
}

export function asArray(value: unknown): DiscoveryRecord[] {
  return Array.isArray(value) ? value.map((entry) => asRecord(entry)) : [];
}

export function asInt(value: unknown, fallback = 0): number {
  const parsed =
    typeof value === "number" && Number.isFinite(value)
      ? value
      : Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function asFloat(value: unknown, fallback = 0): number {
  const parsed =
    typeof value === "number" && Number.isFinite(value)
      ? value
      : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function asPaged(value: unknown): DiscoveryPagedRecord {
  const row = asRecord(value);
  return {
    items: asArray(row.items),
    page: asInt(row.page, 1),
    pageSize: asInt(row.pageSize, 20),
    total: asInt(row.total, 0),
    totalPages: asInt(row.totalPages, 1),
    hasNext: row.hasNext === true,
    hasPrev: row.hasPrev === true,
  };
}

export function asStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((entry) => String(entry ?? "").trim()).filter(Boolean)
    : [];
}

export function fmtDate(value: unknown): string {
  if (!value) return "—";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
}

export function fmtMoney(cents: unknown): string {
  return `$${(asInt(cents, 0) / 100).toFixed(2)}`;
}

export function fmtUsd(value: unknown): string {
  const amount = asFloat(value, 0);
  return `$${amount >= 1 ? amount.toFixed(2) : amount.toFixed(4)}`;
}

export function fmtBudget(cents: unknown): string {
  const amount = asInt(cents, 0);
  return amount > 0 ? fmtMoney(amount) : "Unlimited";
}

export function fmtPercent(value: unknown): string {
  return `${Math.round(asFloat(value, 0) * 100)}%`;
}

export function metricSourceLabel(value: unknown): string {
  const normalized = String(value ?? "").trim();
  return normalized === "generic_channel_quality"
    ? "generic intake quality"
    : normalized || "generic intake quality";
}

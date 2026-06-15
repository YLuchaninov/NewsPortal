import { collapseWhitespace, decodeHtmlEntities, stripHtmlTags } from "./rss";

export function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

export function normalizePlainText(value: string): string {
  return collapseWhitespace(decodeHtmlEntities(stripHtmlTags(value)));
}

export function readOptionalString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function sanitizeOptionalPositiveInt(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return Math.round(parsed);
}

export function sanitizeOptionalTimestamptzInput(value: unknown): string | null {
  const isPersistableDate = (candidate: Date): boolean => {
    if (!Number.isFinite(candidate.getTime())) {
      return false;
    }
    return candidate.getUTCFullYear() >= 1;
  };

  if (value instanceof Date) {
    return isPersistableDate(value) ? value.toISOString() : null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = new Date(value);
    return isPersistableDate(parsed) ? parsed.toISOString() : null;
  }

  const rawValue = readOptionalString(value);
  if (!rawValue) {
    return null;
  }

  const parsed = new Date(rawValue);
  return isPersistableDate(parsed) ? parsed.toISOString() : null;
}

import { readOptionalInteger } from "../protocol";
import { OPERATING_DOMAIN_VALUES, type OperatingDomain } from "./model";
import { isRecord, readStringArray } from "./shared";

export function readDomains(value: unknown): OperatingDomain[] {
  const requested = readStringArray(value).filter((entry): entry is OperatingDomain =>
    (OPERATING_DOMAIN_VALUES as readonly string[]).includes(entry)
  );
  return requested.length > 0 ? requested : [...OPERATING_DOMAIN_VALUES];
}

export function readSinceHours(value: unknown, fallback = 24): number {
  const parsed = readOptionalInteger(value);
  if (parsed == null) {
    return fallback;
  }
  return Math.min(Math.max(parsed, 1), 24 * 30);
}

export function readEntityIds(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

export function compactRows(rows: unknown[], includeSamples: boolean, limit = 8): unknown[] {
  return includeSamples ? rows.slice(0, limit) : [];
}

export async function allSettledRecord<T extends Record<string, Promise<unknown>>>(
  entries: T
): Promise<Record<keyof T, unknown>> {
  const resolved = await Promise.allSettled(Object.values(entries));
  const result: Record<string, unknown> = {};
  Object.keys(entries).forEach((key, index) => {
    const item = resolved[index];
    result[key] =
      item?.status === "fulfilled"
        ? item.value
        : {
            unavailable: true,
            error: item?.reason instanceof Error ? item.reason.message : "request failed",
          };
  });
  return result as Record<keyof T, unknown>;
}

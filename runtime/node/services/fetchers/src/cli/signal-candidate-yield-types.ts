export type JsonRecord = Record<string, unknown>;

export interface SignalCandidateYieldSnapshot {
  generatedAt: string;
  baseline: JsonRecord;
  views: Record<string, unknown>;
  samples: Record<string, unknown>;
  analysis: JsonRecord;
}

export function asPlainObject(value: unknown): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as JsonRecord;
}

export function toMetricRow(value: JsonRecord, name: string): number {
  const raw = value[name];
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? numeric : 0;
}

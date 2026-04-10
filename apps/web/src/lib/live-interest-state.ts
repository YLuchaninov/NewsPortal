import type { LiveRepairJobSnapshot } from "./live-updates";

export interface InterestListRecord {
  interest_id: string;
  compile_status?: string;
  updated_at?: string | null;
  created_at?: string | null;
}

export interface InterestPageState<T> {
  items: T[];
  page: number;
  total: number;
  totalPages: number;
  hasPrev: boolean;
  hasNext: boolean;
}

export interface InterestRepairState {
  tone: "warning" | "error";
  label: string;
  detail: string | null;
}

function toTimestamp(value: string | null | undefined): number {
  if (!value) {
    return 0;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function replaceLiveInterestRecords<T extends InterestListRecord>(
  _currentRecords: T[],
  nextRecords: T[]
): T[] {
  return [...nextRecords].sort((left, right) => {
    const updatedDelta =
      toTimestamp(right.updated_at ?? right.created_at) -
      toTimestamp(left.updated_at ?? left.created_at);
    if (updatedDelta !== 0) {
      return updatedDelta;
    }
    return String(left.interest_id).localeCompare(String(right.interest_id));
  });
}

export function buildInterestPageState<T>(
  records: T[],
  requestedPage: number,
  pageSize: number
): InterestPageState<T> {
  const total = records.length;
  const totalPages = total > 0 ? Math.ceil(total / pageSize) : 1;
  const page = Math.min(Math.max(requestedPage, 1), totalPages);
  const offset = (page - 1) * pageSize;

  return {
    items: records.slice(offset, offset + pageSize),
    page,
    total,
    totalPages,
    hasPrev: page > 1,
    hasNext: page < totalPages,
  };
}

export function resolveInterestRepairState(
  interestId: string,
  repairJobs: LiveRepairJobSnapshot[]
): InterestRepairState | null {
  const job = repairJobs.find((candidate) => candidate.interestId === interestId);
  if (!job) {
    return null;
  }

  if (job.status === "queued" || job.status === "running") {
    const hasNumericProgress =
      Number.isFinite(job.processedArticles ?? NaN) &&
      Number.isFinite(job.totalArticles ?? NaN) &&
      (job.totalArticles ?? 0) > 0;

    return {
      tone: "warning",
      label: "Syncing matches",
      detail: hasNumericProgress
        ? `${job.processedArticles}/${job.totalArticles} historical content items`
        : "Replaying prior system-selected content",
    };
  }

  if (job.status === "failed") {
    return {
      tone: "error",
      label: "Match sync failed",
      detail: job.errorText ?? "Unable to replay historical content items",
    };
  }

  return null;
}

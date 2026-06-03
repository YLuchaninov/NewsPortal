import type {
  NormalizedFetchOutcome,
  SourceProviderType
} from "@newsportal/contracts";

export interface SourceChannelRow {
  channelId: string;
  providerType: SourceProviderType;
  name: string;
  fetchUrl: string | null;
  configJson: unknown;
  authConfigJson: unknown;
  language: string | null;
  pollIntervalSeconds: number;
  lastFetchAt: string | null;
  adaptiveEnabled: boolean | null;
  effectivePollIntervalSeconds: number | null;
  maxPollIntervalSeconds: number | null;
  nextDueAt: string | null;
  adaptiveStep: number | null;
  lastResultKind: NormalizedFetchOutcome | null;
  consecutiveNoChangePolls: number | null;
  consecutiveFailures: number | null;
  adaptiveReason: string | null;
}

export interface FetchCursorRow {
  cursorType: string;
  cursorValue: string | null;
  cursorJson: Record<string, unknown>;
}

export interface PersistArticleInput {
  channel: SourceChannelRow;
  externalArticleId: string;
  url: string;
  publishedAt: string;
  title: string;
  lead: string;
  body: string;
  lang: string | null;
  confidence: number | null;
  rawPayload: Record<string, unknown>;
}

export interface PersistResourceInput {
  channel: SourceChannelRow;
  externalArticleId: string;
  url: string;
  resourceKind: string;
  title: string;
  summary: string;
  publishedAt: string | null;
  modifiedAt: string | null;
  freshnessMarkerType: string | null;
  freshnessMarkerValue: string | null;
  discoverySource: string;
  classificationJson: Record<string, unknown>;
  rawPayload: Record<string, unknown>;
}

export interface DuplicatePreflightDecision<T extends { externalArticleId: string; url: string }> {
  input: T;
  shouldPersist: boolean;
  duplicateReason: "externalArticleId" | "url" | null;
}

export interface CursorUpdateInput {
  cursorType: string;
  cursorValue: string | null | undefined;
  cursorJson: Record<string, unknown>;
}

export interface ChannelPollCompletion {
  startedAt: string;
  finishedAt: string;
  outcome: NormalizedFetchOutcome;
  httpStatus: number | null;
  retryAfterSeconds: number | null;
  fetchedItemCount: number;
  newArticleCount: number;
  duplicateSuppressedCount: number;
  cursorChanged: boolean;
  errorMessage: string | null;
  cursorUpdates: CursorUpdateInput[];
  providerMetricsJson?: Record<string, unknown>;
  adapterKey?: string | null;
  adapterRuntimeKind?: string | null;
  adapterSelectionMode?: string | null;
}

export type CursorMap = Record<string, FetchCursorRow>;

export function classifyDuplicatePreflightInputs<
  T extends { externalArticleId: string; url: string }
>(
  inputs: readonly T[],
  knownExternalArticleIds: ReadonlySet<string>,
  knownUrls: ReadonlySet<string>
): Array<DuplicatePreflightDecision<T>> {
  const seenExternalArticleIds = new Set<string>();
  const seenUrls = new Set<string>();

  return inputs.map((input) => {
    const externalArticleId = input.externalArticleId.trim();
    const url = input.url.trim();

    if (
      externalArticleId &&
      (knownExternalArticleIds.has(externalArticleId) ||
        seenExternalArticleIds.has(externalArticleId))
    ) {
      return {
        input,
        shouldPersist: false,
        duplicateReason: "externalArticleId"
      };
    }

    if (url && (knownUrls.has(url) || seenUrls.has(url))) {
      return {
        input,
        shouldPersist: false,
        duplicateReason: "url"
      };
    }

    if (externalArticleId) {
      seenExternalArticleIds.add(externalArticleId);
    }
    if (url) {
      seenUrls.add(url);
    }

    return {
      input,
      shouldPersist: true,
      duplicateReason: null
    };
  });
}

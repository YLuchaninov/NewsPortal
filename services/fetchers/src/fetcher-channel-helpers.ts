import type { NormalizedFetchOutcome } from "@newsportal/contracts";

import type { ChannelPollCompletion, CursorUpdateInput } from "./fetcher-persistence";
import {
  canonicalizeUrl,
  collapseWhitespace,
  decodeHtmlEntities,
  stripHtmlTags,
} from "./rss";

export class ChannelFetchError extends Error {
  constructor(
    message: string,
    readonly completion: Omit<ChannelPollCompletion, "startedAt" | "finishedAt" | "cursorUpdates"> & {
      cursorUpdates?: CursorUpdateInput[];
    }
  ) {
    super(message);
    this.name = "ChannelFetchError";
  }
}

export function normalizeWhitespace(value: string): string {
  return collapseWhitespace(decodeHtmlEntities(value));
}

export function derivePlaintextLead(summaryHtml: string, bodyHtml: string): string {
  const summaryText = normalizeWhitespace(stripHtmlTags(summaryHtml));
  if (summaryText) {
    return summaryText;
  }

  const bodyText = normalizeWhitespace(stripHtmlTags(bodyHtml));
  if (!bodyText) {
    return "";
  }

  const sentences = bodyText.split(/(?<=[.!?])\s+/).slice(0, 3);
  return collapseWhitespace(sentences.join(" "));
}

export function derivePlaintextBody(contentHtml: string, summaryHtml: string): string {
  const preferred = normalizeWhitespace(stripHtmlTags(contentHtml));
  if (preferred) {
    return preferred;
  }

  return normalizeWhitespace(stripHtmlTags(summaryHtml));
}

export function pickLanguageHint(
  channelLanguage: string | null,
  feedLanguage: string | null
): { lang: string | null; confidence: number | null } {
  const rawHint = channelLanguage ?? feedLanguage;

  if (!rawHint) {
    return {
      lang: null,
      confidence: null
    };
  }

  const normalized = rawHint.toLowerCase();
  if (normalized.startsWith("uk")) {
    return {
      lang: "uk",
      confidence: 0.8
    };
  }
  if (normalized.startsWith("en")) {
    return {
      lang: "en",
      confidence: 0.8
    };
  }

  return {
    lang: normalized.slice(0, 8),
    confidence: 0.5
  };
}

export function deriveTimestampCursorValue(
  latestPublishedAt: string | null,
  responseLastModified: string | null,
  fetchedAt: string
): string {
  return responseLastModified ?? latestPublishedAt ?? fetchedAt;
}

export function getByPath(value: unknown, path: string): unknown {
  if (!path.trim()) {
    return value;
  }

  const segments = path.split(".").map((segment) => segment.trim()).filter(Boolean);
  let current: unknown = value;
  for (const segment of segments) {
    if (current == null || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

export function normalizeExternalUrl(url: string): string {
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return canonicalizeUrl(url);
  }
  return url;
}

export function rawEmailToBody(rawSource: string): string {
  const separatorIndex = rawSource.search(/\r?\n\r?\n/);
  const body = separatorIndex >= 0 ? rawSource.slice(separatorIndex + 4) : rawSource;
  const cleaned = body
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ");
  return normalizeWhitespace(stripHtmlTags(cleaned));
}

export function parseRetryAfterSeconds(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const numericValue = Number.parseInt(value, 10);
  if (Number.isInteger(numericValue) && numericValue >= 0) {
    return numericValue;
  }

  const dateValue = new Date(value);
  if (Number.isNaN(dateValue.getTime())) {
    return null;
  }

  return Math.max(0, Math.ceil((dateValue.getTime() - Date.now()) / 1000));
}

export function classifyHttpFailure(status: number): NormalizedFetchOutcome {
  if (status === 429) {
    return "rate_limited";
  }
  if (status >= 500 || status === 408) {
    return "transient_failure";
  }
  return "hard_failure";
}

export function classifyUnexpectedFailure(message: string): NormalizedFetchOutcome {
  const normalized = message.toLowerCase();
  if (
    normalized.includes("timeout") ||
    normalized.includes("timed out") ||
    normalized.includes("econn") ||
    normalized.includes("socket") ||
    normalized.includes("network")
  ) {
    return "transient_failure";
  }
  if (normalized.includes("rate limit") || normalized.includes("too many requests")) {
    return "rate_limited";
  }
  return "hard_failure";
}

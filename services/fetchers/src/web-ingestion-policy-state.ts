import { canonicalizeUrl } from "./rss";
import { readOptionalString } from "./web-ingestion-extraction";
import type {
  ConditionalFetchRole,
  WebsiteCachedTextResponseState,
  WebsiteConditionalRequestHits,
  WebsiteConditionalRequestState,
} from "./web-ingestion-types";

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

export function createEmptyConditionalRequestHits(): WebsiteConditionalRequestHits {
  return {
    homepage: 0,
    sitemap: 0,
    feed: 0,
    robots: 0,
    llms: 0,
  };
}

export function cloneConditionalRequestHits(
  input?: Partial<WebsiteConditionalRequestHits> | null
): WebsiteConditionalRequestHits {
  const toCount = (value: unknown): number => {
    const numeric = Number(value ?? 0);
    return Number.isFinite(numeric) ? numeric : 0;
  };
  return {
    homepage: toCount(input?.homepage),
    sitemap: toCount(input?.sitemap),
    feed: toCount(input?.feed),
    robots: toCount(input?.robots),
    llms: toCount(input?.llms),
  };
}

export function readConditionalRequestStates(
  value: unknown
): Record<string, WebsiteConditionalRequestState> {
  const states: Record<string, WebsiteConditionalRequestState> = {};
  for (const [key, rawState] of Object.entries(asRecord(value))) {
    const state = asRecord(rawState);
    states[key] = {
      etag: readOptionalString(state.etag),
      lastModified: readOptionalString(state.lastModified),
      finalUrl: readOptionalString(state.finalUrl),
      contentType: readOptionalString(state.contentType),
      httpStatus:
        typeof state.httpStatus === "number" && Number.isFinite(state.httpStatus)
          ? state.httpStatus
          : (() => {
              const parsed = Number.parseInt(String(state.httpStatus ?? ""), 10);
              return Number.isFinite(parsed) ? parsed : null;
            })(),
      updatedAt: readOptionalString(state.updatedAt),
    };
  }
  return states;
}

export function readCachedTextResponses(
  value: unknown
): Record<string, WebsiteCachedTextResponseState> {
  const states: Record<string, WebsiteCachedTextResponseState> = {};
  for (const [key, rawState] of Object.entries(asRecord(value))) {
    const state = asRecord(rawState);
    const url = readOptionalString(state.url);
    const text = typeof state.text === "string" ? state.text : null;
    if (!url || text == null) {
      continue;
    }
    const status =
      typeof state.status === "number" && Number.isFinite(state.status)
        ? state.status
        : (() => {
            const parsed = Number.parseInt(String(state.status ?? ""), 10);
            return Number.isFinite(parsed) ? parsed : 200;
          })();
    states[key] = {
      url,
      status,
      contentType: readOptionalString(state.contentType),
      text,
      updatedAt: readOptionalString(state.updatedAt) ?? new Date(0).toISOString(),
    };
  }
  return states;
}

export function buildConditionalStateKey(role: ConditionalFetchRole, rawUrl?: string): string {
  if (!rawUrl || ["robots", "homepage", "llms"].includes(role)) {
    return role;
  }
  return `${role}:${canonicalizeUrl(rawUrl)}`;
}

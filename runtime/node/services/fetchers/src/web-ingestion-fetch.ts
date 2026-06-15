import {
  buildWebsiteRequestHeaders,
  type WebsiteAuthContext,
} from "./web-ingestion-headers";
import { buildConditionalStateKey } from "./web-ingestion-policy-state";
import type {
  ConditionalFetchRole,
  WebsiteCachedTextResponseState,
  WebsiteConditionalRequestHits,
  WebsiteConditionalRequestState,
} from "./web-ingestion-types";

export async function fetchTextWithAuth(
  url: string,
  timeoutMs: number,
  headers?: HeadersInit,
  authContext?: WebsiteAuthContext,
  conditional?: {
    role: ConditionalFetchRole;
    key?: string;
    requestValidators: Record<string, WebsiteConditionalRequestState>;
    responseCache: Record<string, WebsiteCachedTextResponseState>;
    conditionalRequestHits?: WebsiteConditionalRequestHits;
    cacheBody?: boolean;
  }
): Promise<{
  url: string;
  status: number;
  text: string;
  contentType: string | null;
  etag: string | null;
  lastModified: string | null;
  conditionalHit: boolean;
  reusedCachedBody: boolean;
}> {
  const conditionalKey = conditional?.key ?? buildConditionalStateKey(conditional?.role ?? "homepage", url);
  const priorValidator = conditional ? conditional.requestValidators[conditionalKey] : undefined;
  const response = await fetch(url, {
    headers: (() => {
      const requestHeaders = authContext
        ? buildWebsiteRequestHeaders({
            requestUrl: url,
            channelUrl: authContext.channelUrl,
            authConfig: authContext.authConfig,
            headers,
          })
        : new Headers(headers);
      if (priorValidator?.etag) {
        requestHeaders.set("if-none-match", priorValidator.etag);
      }
      if (priorValidator?.lastModified) {
        requestHeaders.set("if-modified-since", priorValidator.lastModified);
      }
      return requestHeaders;
    })(),
    signal: AbortSignal.timeout(timeoutMs),
    redirect: "follow",
  });
  const now = new Date().toISOString();
  const etag = response.headers.get("etag");
  const lastModified = response.headers.get("last-modified");
  if (response.status === 304) {
    const cached = conditional ? conditional.responseCache[conditionalKey] : undefined;
    if (conditional) {
      conditional.requestValidators[conditionalKey] = {
        etag: etag ?? priorValidator?.etag ?? null,
        lastModified: lastModified ?? priorValidator?.lastModified ?? null,
        finalUrl: response.url || priorValidator?.finalUrl || url,
        contentType: cached?.contentType ?? priorValidator?.contentType ?? response.headers.get("content-type"),
        httpStatus: cached?.status ?? priorValidator?.httpStatus ?? 304,
        updatedAt: now,
      };
      if (cached) {
        conditional.responseCache[conditionalKey] = {
          ...cached,
          updatedAt: now,
        };
      }
      if (conditional.conditionalRequestHits) {
        conditional.conditionalRequestHits[conditional.role] += 1;
      }
    }
    return {
      url: cached?.url ?? response.url,
      status: response.status,
      text: cached?.text ?? "",
      contentType: cached?.contentType ?? response.headers.get("content-type"),
      etag: etag ?? priorValidator?.etag ?? null,
      lastModified: lastModified ?? priorValidator?.lastModified ?? null,
      conditionalHit: true,
      reusedCachedBody: Boolean(cached?.text),
    };
  }
  const text = await response.text();
  if (conditional) {
    conditional.requestValidators[conditionalKey] = {
      etag: etag ?? null,
      lastModified: lastModified ?? null,
      finalUrl: response.url,
      contentType: response.headers.get("content-type"),
      httpStatus: response.status,
      updatedAt: now,
    };
    if (conditional.cacheBody && response.status === 200) {
      conditional.responseCache[conditionalKey] = {
        url: response.url,
        status: response.status,
        contentType: response.headers.get("content-type"),
        text,
        updatedAt: now,
      };
    }
  }
  return {
    url: response.url,
    status: response.status,
    text,
    contentType: response.headers.get("content-type"),
    etag,
    lastModified,
    conditionalHit: false,
    reusedCachedBody: false,
  };
}

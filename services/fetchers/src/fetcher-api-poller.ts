import {
  parseApiChannelConfig,
  resolveSourceChannelAuthorizationHeader
} from "@newsportal/contracts";

import type { FetchersConfig } from "./config";
import {
  ChannelFetchError,
  classifyHttpFailure,
  getByPath,
  normalizeExternalUrl,
  normalizeWhitespace,
  parseRetryAfterSeconds
} from "./fetcher-channel-helpers";
import type {
  ChannelPollCompletion,
  CursorMap,
  PersistArticleInput,
  SourceChannelRow
} from "./fetcher-persistence";
import { validateAcquisitionUrl } from "./probe-url-guard";
import { fetchApiAdapterItems } from "./api-adapter-registry";

interface ApiChannelPollerDependencies {
  config: FetchersConfig;
  loadCursorMap: (channelId: string) => Promise<CursorMap>;
  persistInputsWithPreflight: (
    channelId: string,
    inputs: readonly PersistArticleInput[]
  ) => Promise<{ ingestedCount: number; duplicateCount: number }>;
  markChannelSuccess: (
    channel: SourceChannelRow,
    completion: ChannelPollCompletion
  ) => Promise<void>;
}

const MAX_API_RESPONSE_BODY_BYTES = 5_000_000;
const API_PAGE_CURSOR_TYPE = "api_page_token";

interface ApiPageFetchResult {
  payload: unknown;
  status: number;
  finalUrl: string;
  retryAfterSeconds: number | null;
}

interface ApiTextFetchResult {
  text: string;
  status: number;
  finalUrl: string;
  retryAfterSeconds: number | null;
}

function buildPagedUrl(rawUrl: string, pageParam: string, pageNumber: number): string {
  const url = new URL(rawUrl);
  url.searchParams.set(pageParam, String(pageNumber));
  return url.toString();
}

function resolveApiItemUrl(rawUrl: string, baseUrl: string): string {
  return normalizeExternalUrl(new URL(rawUrl, baseUrl).toString());
}

function readApiPageCursor(cursors: CursorMap): string | null {
  return cursors[API_PAGE_CURSOR_TYPE]?.cursorValue ?? null;
}

function buildApiRequestBody(apiConfig: ReturnType<typeof parseApiChannelConfig>): string | undefined {
  if (apiConfig.requestMethod !== "POST" || apiConfig.requestBodyJson == null) {
    return undefined;
  }
  return JSON.stringify(apiConfig.requestBodyJson);
}

async function fetchApiPage(input: {
  channel: SourceChannelRow;
  url: string;
  apiConfig: ReturnType<typeof parseApiChannelConfig>;
  authConfigJson: unknown;
  defaultUserAgent: string;
}): Promise<ApiPageFetchResult> {
  const guardedUrl = await validateAcquisitionUrl(input.url, { resolveDns: true });
  if (!guardedUrl.url) {
    const message = `API channel ${input.channel.channelId} fetchUrl is not allowed: ${guardedUrl.error}`;
    throw new ChannelFetchError(message, {
      outcome: "hard_failure",
      httpStatus: null,
      retryAfterSeconds: null,
      fetchedItemCount: 0,
      newArticleCount: 0,
      duplicateSuppressedCount: 0,
      cursorChanged: false,
      errorMessage: message
    });
  }

  const headers = new Headers({
    "user-agent": input.apiConfig.userAgent || input.defaultUserAgent,
    accept: "application/json"
  });
  for (const [name, value] of Object.entries(input.apiConfig.requestHeaders)) {
    headers.set(name, value);
  }
  const requestBody = buildApiRequestBody(input.apiConfig);
  if (requestBody != null) {
    headers.set("content-type", "application/json");
  }
  const authorizationHeader = resolveSourceChannelAuthorizationHeader(
    guardedUrl.url,
    guardedUrl.url,
    input.authConfigJson
  );
  if (authorizationHeader) {
    headers.set("authorization", authorizationHeader);
  }

  const response = await fetch(guardedUrl.url, {
    method: input.apiConfig.requestMethod,
    headers,
    body: requestBody,
    signal: AbortSignal.timeout(input.apiConfig.requestTimeoutMs)
  });
  const guardedFinalUrl = await validateAcquisitionUrl(response.url || guardedUrl.url);
  if (!guardedFinalUrl.url) {
    const message = `API channel ${input.channel.channelId} final URL is not allowed: ${guardedFinalUrl.error}`;
    throw new ChannelFetchError(message, {
      outcome: "hard_failure",
      httpStatus: response.status,
      retryAfterSeconds: null,
      fetchedItemCount: 0,
      newArticleCount: 0,
      duplicateSuppressedCount: 0,
      cursorChanged: false,
      errorMessage: message
    });
  }
  if (!response.ok) {
    const message = `API fetch failed for ${input.channel.channelId}: ${response.status} ${response.statusText}`;
    throw new ChannelFetchError(message, {
      outcome: classifyHttpFailure(response.status),
      httpStatus: response.status,
      retryAfterSeconds: parseRetryAfterSeconds(response.headers.get("retry-after")),
      fetchedItemCount: 0,
      newArticleCount: 0,
      duplicateSuppressedCount: 0,
      cursorChanged: false,
      errorMessage: message
    });
  }

  const contentLength = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_API_RESPONSE_BODY_BYTES) {
    const message = `API fetch failed for ${input.channel.channelId}: response body is too large.`;
    throw new ChannelFetchError(message, {
      outcome: "hard_failure",
      httpStatus: response.status,
      retryAfterSeconds: null,
      fetchedItemCount: 0,
      newArticleCount: 0,
      duplicateSuppressedCount: 0,
      cursorChanged: false,
      errorMessage: message
    });
  }
  const responseBytes = await response.arrayBuffer();
  if (responseBytes.byteLength > MAX_API_RESPONSE_BODY_BYTES) {
    const message = `API fetch failed for ${input.channel.channelId}: response body is too large.`;
    throw new ChannelFetchError(message, {
      outcome: "hard_failure",
      httpStatus: response.status,
      retryAfterSeconds: null,
      fetchedItemCount: 0,
      newArticleCount: 0,
      duplicateSuppressedCount: 0,
      cursorChanged: false,
      errorMessage: message
    });
  }

  return {
    payload: JSON.parse(new TextDecoder().decode(responseBytes)) as unknown,
    status: response.status,
    finalUrl: guardedFinalUrl.url,
    retryAfterSeconds: parseRetryAfterSeconds(response.headers.get("retry-after"))
  };
}

async function fetchApiText(input: {
  channel: SourceChannelRow;
  url: string;
  apiConfig: ReturnType<typeof parseApiChannelConfig>;
  authConfigJson: unknown;
  defaultUserAgent: string;
}): Promise<ApiTextFetchResult> {
  const guardedUrl = await validateAcquisitionUrl(input.url, { resolveDns: true });
  if (!guardedUrl.url) {
    const message = `API adapter channel ${input.channel.channelId} fetchUrl is not allowed: ${guardedUrl.error}`;
    throw new ChannelFetchError(message, {
      outcome: "hard_failure",
      httpStatus: null,
      retryAfterSeconds: null,
      fetchedItemCount: 0,
      newArticleCount: 0,
      duplicateSuppressedCount: 0,
      cursorChanged: false,
      errorMessage: message
    });
  }

  const headers = new Headers({
    "user-agent": input.apiConfig.userAgent || input.defaultUserAgent,
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
  });
  for (const [name, value] of Object.entries(input.apiConfig.requestHeaders)) {
    headers.set(name, value);
  }
  const authorizationHeader = resolveSourceChannelAuthorizationHeader(
    guardedUrl.url,
    guardedUrl.url,
    input.authConfigJson
  );
  if (authorizationHeader) {
    headers.set("authorization", authorizationHeader);
  }

  const response = await fetch(guardedUrl.url, {
    method: "GET",
    headers,
    signal: AbortSignal.timeout(input.apiConfig.requestTimeoutMs)
  });
  const guardedFinalUrl = await validateAcquisitionUrl(response.url || guardedUrl.url);
  if (!guardedFinalUrl.url) {
    const message = `API adapter channel ${input.channel.channelId} final URL is not allowed: ${guardedFinalUrl.error}`;
    throw new ChannelFetchError(message, {
      outcome: "hard_failure",
      httpStatus: response.status,
      retryAfterSeconds: null,
      fetchedItemCount: 0,
      newArticleCount: 0,
      duplicateSuppressedCount: 0,
      cursorChanged: false,
      errorMessage: message
    });
  }
  if (!response.ok) {
    const message = `API adapter fetch failed for ${input.channel.channelId}: ${response.status} ${response.statusText}`;
    throw new ChannelFetchError(message, {
      outcome: classifyHttpFailure(response.status),
      httpStatus: response.status,
      retryAfterSeconds: parseRetryAfterSeconds(response.headers.get("retry-after")),
      fetchedItemCount: 0,
      newArticleCount: 0,
      duplicateSuppressedCount: 0,
      cursorChanged: false,
      errorMessage: message
    });
  }

  const responseBytes = await response.arrayBuffer();
  if (responseBytes.byteLength > MAX_API_RESPONSE_BODY_BYTES) {
    const message = `API adapter fetch failed for ${input.channel.channelId}: response body is too large.`;
    throw new ChannelFetchError(message, {
      outcome: "hard_failure",
      httpStatus: response.status,
      retryAfterSeconds: null,
      fetchedItemCount: 0,
      newArticleCount: 0,
      duplicateSuppressedCount: 0,
      cursorChanged: false,
      errorMessage: message
    });
  }

  return {
    text: new TextDecoder().decode(responseBytes),
    status: response.status,
    finalUrl: guardedFinalUrl.url,
    retryAfterSeconds: parseRetryAfterSeconds(response.headers.get("retry-after"))
  };
}

export async function pollApiProviderChannel(
  channel: SourceChannelRow,
  startedAt: string,
  dependencies: ApiChannelPollerDependencies
): Promise<void> {
  if (!channel.fetchUrl) {
    throw new ChannelFetchError(`API channel ${channel.channelId} is missing fetchUrl.`, {
      outcome: "hard_failure",
      httpStatus: null,
      retryAfterSeconds: null,
      fetchedItemCount: 0,
      newArticleCount: 0,
      duplicateSuppressedCount: 0,
      cursorChanged: false,
      errorMessage: `API channel ${channel.channelId} is missing fetchUrl.`
    });
  }

  const apiConfig = parseApiChannelConfig(channel.configJson);
  const cursors = await dependencies.loadCursorMap(channel.channelId);
  const fetchedAt = new Date().toISOString();
  if (apiConfig.adapter.adapterKey) {
    let lastStatus: number | null = null;
    let lastRetryAfterSeconds: number | null = null;
    const adapterItems = await fetchApiAdapterItems(apiConfig.adapter.adapterKey, {
      channel,
      apiConfig,
      fetchedAt,
      fetchJson: async (url?: string) => {
        const page = await fetchApiPage({
          channel,
          url: url ?? channel.fetchUrl ?? "",
          apiConfig,
          authConfigJson: channel.authConfigJson,
          defaultUserAgent: dependencies.config.defaultUserAgent
        });
        lastStatus = page.status;
        lastRetryAfterSeconds = page.retryAfterSeconds;
        return page.payload;
      },
      fetchText: async (url?: string) => {
        const page = await fetchApiText({
          channel,
          url: url ?? channel.fetchUrl ?? "",
          apiConfig,
          authConfigJson: channel.authConfigJson,
          defaultUserAgent: dependencies.config.defaultUserAgent
        });
        lastStatus = page.status;
        lastRetryAfterSeconds = page.retryAfterSeconds;
        return { text: page.text, finalUrl: page.finalUrl, status: page.status };
      }
    });
    const inputs: PersistArticleInput[] = adapterItems.slice(0, apiConfig.maxItemsPerPoll).map((item) => ({
      channel,
      externalArticleId: item.externalArticleId,
      url: normalizeExternalUrl(item.url),
      publishedAt: item.publishedAt,
      title: item.title,
      lead: item.lead,
      body: item.body,
      lang: item.lang ?? channel.language ?? null,
      confidence: channel.language || item.lang ? 0.8 : 0.5,
      rawPayload: {
        ...item.rawPayload,
        fetchedAt
      }
    }));
    const latestPublishedAt = inputs.reduce<string | null>((latest, item) => {
      return latest && latest > item.publishedAt ? latest : item.publishedAt;
    }, null);
    const { ingestedCount, duplicateCount } = await dependencies.persistInputsWithPreflight(
      channel.channelId,
      inputs
    );

    await dependencies.markChannelSuccess(channel, {
      startedAt,
      finishedAt: fetchedAt,
      outcome: ingestedCount > 0 ? "new_content" : "no_change",
      httpStatus: lastStatus,
      retryAfterSeconds: lastRetryAfterSeconds,
      fetchedItemCount: inputs.length,
      newArticleCount: ingestedCount,
      duplicateSuppressedCount: duplicateCount,
      cursorChanged: latestPublishedAt !== (cursors.timestamp?.cursorValue ?? null),
      errorMessage: null,
      cursorUpdates: [
        {
          cursorType: "timestamp",
          cursorValue: latestPublishedAt ?? fetchedAt,
          cursorJson: {
            provider: "api",
            fetcher: "api_adapter",
            adapterKey: apiConfig.adapter.adapterKey,
            researchMode: apiConfig.adapter.researchMode
          }
        }
      ]
    });
    return;
  }

  const inputs: PersistArticleInput[] = [];
  const fetchedItems: unknown[] = [];
  let latestPublishedAt: string | null = null;
  let lastStatus: number | null = null;
  let lastRetryAfterSeconds: number | null = null;
  let nextPageCursorValue: string | null = null;
  let nextRequestUrl =
    apiConfig.pagination.mode === "next_url" && readApiPageCursor(cursors)
      ? readApiPageCursor(cursors) ?? channel.fetchUrl
      : channel.fetchUrl;
  let nextPageNumber =
    apiConfig.pagination.mode === "page"
      ? Number(readApiPageCursor(cursors) ?? apiConfig.pagination.pageStart)
      : apiConfig.pagination.pageStart;
  if (!Number.isInteger(nextPageNumber) || nextPageNumber <= 0) {
    nextPageNumber = apiConfig.pagination.pageStart;
  }

  for (let pageIndex = 0; pageIndex < apiConfig.pagination.maxPagesPerPoll; pageIndex += 1) {
    const pageUrl =
      apiConfig.pagination.mode === "page"
        ? buildPagedUrl(nextRequestUrl, apiConfig.pagination.pageParam, nextPageNumber)
        : nextRequestUrl;
    const page = await fetchApiPage({
      channel,
      url: pageUrl,
      apiConfig,
      authConfigJson: channel.authConfigJson,
      defaultUserAgent: dependencies.config.defaultUserAgent
    });
    lastStatus = page.status;
    lastRetryAfterSeconds = page.retryAfterSeconds;
    const itemsCandidate = getByPath(page.payload, apiConfig.itemsPath);
    const items = Array.isArray(itemsCandidate)
      ? itemsCandidate
      : Array.isArray(page.payload)
        ? page.payload
        : [];
    fetchedItems.push(...items);

    for (const item of items) {
      if (inputs.length >= apiConfig.maxItemsPerPoll) {
        break;
      }
      const record = (item ?? {}) as Record<string, unknown>;
      const rawUrl = String(getByPath(record, apiConfig.urlField) ?? "").trim();
      if (!rawUrl) {
        continue;
      }
      const publishedAt = String(getByPath(record, apiConfig.publishedAtField) ?? fetchedAt);
      latestPublishedAt = (latestPublishedAt ?? "") > publishedAt ? latestPublishedAt : publishedAt;
      inputs.push({
        channel,
        externalArticleId:
          String(getByPath(record, apiConfig.externalIdField) ?? rawUrl).trim() || rawUrl,
        url: resolveApiItemUrl(rawUrl, page.finalUrl),
        publishedAt,
        title: normalizeWhitespace(String(getByPath(record, apiConfig.titleField) ?? "Untitled article")),
        lead: normalizeWhitespace(String(getByPath(record, apiConfig.leadField) ?? "")),
        body: normalizeWhitespace(String(getByPath(record, apiConfig.bodyField) ?? "")),
        lang:
          String(getByPath(record, apiConfig.languageField) ?? channel.language ?? "").trim() ||
          null,
        confidence: channel.language ? 0.8 : 0.5,
        rawPayload: {
          fetcher: "api",
          fetchedAt,
          pageIndex,
          sourceItem: record
        }
      });
    }

    if (apiConfig.pagination.mode === "none" || inputs.length >= apiConfig.maxItemsPerPoll) {
      break;
    }
    if (apiConfig.pagination.mode === "page") {
      nextPageNumber += 1;
      nextPageCursorValue = String(nextPageNumber);
      nextRequestUrl = channel.fetchUrl;
      continue;
    }

    const nextUrlValue = String(getByPath(page.payload, apiConfig.pagination.nextUrlPath) ?? "").trim();
    if (!nextUrlValue) {
      nextPageCursorValue = null;
      break;
    }
    const guardedNextUrl = await validateAcquisitionUrl(nextUrlValue, {
      baseUrl: page.finalUrl,
      resolveDns: true
    });
    if (!guardedNextUrl.url) {
      nextPageCursorValue = null;
      break;
    }
    nextRequestUrl = guardedNextUrl.url;
    nextPageCursorValue = guardedNextUrl.url;
  }
  const { ingestedCount, duplicateCount } = await dependencies.persistInputsWithPreflight(
    channel.channelId,
    inputs
  );

  await dependencies.markChannelSuccess(channel, {
    startedAt,
    finishedAt: fetchedAt,
    outcome: ingestedCount > 0 ? "new_content" : "no_change",
    httpStatus: lastStatus,
    retryAfterSeconds: lastRetryAfterSeconds,
    fetchedItemCount: Math.min(fetchedItems.length, apiConfig.maxItemsPerPoll),
    newArticleCount: ingestedCount,
    duplicateSuppressedCount: duplicateCount,
    cursorChanged:
      latestPublishedAt !== (cursors.timestamp?.cursorValue ?? null) ||
      nextPageCursorValue !== (cursors[API_PAGE_CURSOR_TYPE]?.cursorValue ?? null),
    errorMessage: null,
    cursorUpdates: [
      {
        cursorType: "timestamp",
        cursorValue: latestPublishedAt ?? fetchedAt,
        cursorJson: {
          provider: "api"
        }
      },
      {
        cursorType: API_PAGE_CURSOR_TYPE,
        cursorValue: nextPageCursorValue,
        cursorJson: {
          provider: "api",
          paginationMode: apiConfig.pagination.mode
        }
      }
    ]
  });
}

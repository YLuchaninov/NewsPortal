import {
  ingressAdapterKeyToLegacyApiAdapterKey,
  parseApiChannelConfig,
  resolveSourceChannelAuthorizationHeader
} from "@signalops/contracts";

import type { FetchersConfig } from "./config";
import {
  ChannelFetchError,
  classifyHttpFailure,
  normalizeExternalUrl,
  parseRetryAfterSeconds
} from "./fetcher-channel-helpers";
import type {
  ChannelPollCompletion,
  CursorMap,
  PersistSignalCandidateInput,
  SourceChannelRow
} from "./fetcher-persistence";
import { validateAcquisitionUrl } from "./probe-url-guard";
import { fetchApiAdapterItems } from "./api-adapter-registry";
import type { ResolvedIngressAdapter } from "./ingress-adapters/resolver";
import { executeDeclarativeApiRuntime } from "./ingress-adapters/declarative-api-runtime";

interface ApiChannelPollerDependencies {
  config: FetchersConfig;
  loadCursorMap: (channelId: string) => Promise<CursorMap>;
  persistInputsWithPreflight: (
    channelId: string,
    inputs: readonly PersistSignalCandidateInput[]
  ) => Promise<{ ingestedCount: number; duplicateCount: number }>;
  markChannelSuccess: (
    channel: SourceChannelRow,
    completion: ChannelPollCompletion
  ) => Promise<void>;
  resolvedAdapter?: ResolvedIngressAdapter | null;
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

function readApiPageCursor(cursors: CursorMap): string | null {
  return cursors[API_PAGE_CURSOR_TYPE]?.cursorValue ?? null;
}

function buildApiRequestBody(apiConfig: ReturnType<typeof parseApiChannelConfig>): string | undefined {
  if (apiConfig.requestMethod !== "POST" || apiConfig.requestBodyJson == null) {
    return undefined;
  }
  return JSON.stringify(apiConfig.requestBodyJson);
}

function parseApiPayload(text: string, responseFormat: ReturnType<typeof parseApiChannelConfig>["responseFormat"]): unknown {
  if (responseFormat === "ndjson") {
    return text
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as unknown);
  }
  return JSON.parse(text) as unknown;
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
      newSignalCandidateCount: 0,
      duplicateSuppressedCount: 0,
      cursorChanged: false,
      errorMessage: message
    });
  }

  const headers = new Headers({
    "user-agent": input.apiConfig.userAgent || input.defaultUserAgent,
    accept: input.apiConfig.responseFormat === "ndjson" ? "application/x-ndjson,application/json" : "application/json"
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
      newSignalCandidateCount: 0,
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
      newSignalCandidateCount: 0,
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
      newSignalCandidateCount: 0,
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
      newSignalCandidateCount: 0,
      duplicateSuppressedCount: 0,
      cursorChanged: false,
      errorMessage: message
    });
  }

  return {
    payload: parseApiPayload(new TextDecoder().decode(responseBytes), input.apiConfig.responseFormat),
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
      newSignalCandidateCount: 0,
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
      newSignalCandidateCount: 0,
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
      newSignalCandidateCount: 0,
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
      newSignalCandidateCount: 0,
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
      newSignalCandidateCount: 0,
      duplicateSuppressedCount: 0,
      cursorChanged: false,
      errorMessage: `API channel ${channel.channelId} is missing fetchUrl.`
    });
  }

  const apiConfig = parseApiChannelConfig(channel.configJson);
  const cursors = await dependencies.loadCursorMap(channel.channelId);
  const fetchedAt = new Date().toISOString();
  const registryAdapterKey =
    dependencies.resolvedAdapter?.providerType === "api" &&
    dependencies.resolvedAdapter.runtimeKind === "builtin"
      ? ingressAdapterKeyToLegacyApiAdapterKey(dependencies.resolvedAdapter.adapterKey)
      : null;
  if (registryAdapterKey) {
    let lastStatus: number | null = null;
    let lastRetryAfterSeconds: number | null = null;
    const adapterItems = await fetchApiAdapterItems(registryAdapterKey, {
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
    const inputs: PersistSignalCandidateInput[] = adapterItems.slice(0, apiConfig.maxItemsPerPoll).map((item) => ({
      channel,
      externalSignalCandidateId: item.externalSignalCandidateId,
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
      newSignalCandidateCount: ingestedCount,
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
            adapterKey: registryAdapterKey,
            researchMode: apiConfig.adapter.researchMode
          }
        }
      ]
    });
    return;
  }

  const runtimeResult = await executeDeclarativeApiRuntime({
    fetchUrl: channel.fetchUrl,
    apiConfig,
    fetchedAt,
    limit: apiConfig.maxItemsPerPoll,
    initialPageCursorValue: readApiPageCursor(cursors),
    channelLanguage: channel.language,
    fetchPage: async (url) =>
      fetchApiPage({
        channel,
        url,
        apiConfig,
        authConfigJson: channel.authConfigJson,
        defaultUserAgent: dependencies.config.defaultUserAgent
      }),
    resolveNextUrl: async (rawUrl, baseUrl) => {
      const guardedNextUrl = await validateAcquisitionUrl(rawUrl, {
        baseUrl,
        resolveDns: true
      });
      return guardedNextUrl.url ?? null;
    }
  });
  const inputs: PersistSignalCandidateInput[] = runtimeResult.items.map((item) => ({
    channel,
    externalSignalCandidateId: item.externalSignalCandidateId,
    url: item.url,
    publishedAt: item.publishedAt,
    title: item.title,
    lead: item.lead,
    body: item.body,
    lang: item.lang,
    confidence: channel.language ? 0.8 : 0.5,
    rawPayload: item.rawPayload
  }));
  const { ingestedCount, duplicateCount } = await dependencies.persistInputsWithPreflight(
    channel.channelId,
    inputs
  );

  await dependencies.markChannelSuccess(channel, {
    startedAt,
    finishedAt: fetchedAt,
    outcome: ingestedCount > 0 ? "new_content" : "no_change",
    httpStatus: runtimeResult.lastStatus,
    retryAfterSeconds: runtimeResult.lastRetryAfterSeconds,
    fetchedItemCount: runtimeResult.fetchedItemCount,
    newSignalCandidateCount: ingestedCount,
    duplicateSuppressedCount: duplicateCount,
    cursorChanged:
      runtimeResult.latestPublishedAt !== (cursors.timestamp?.cursorValue ?? null) ||
      runtimeResult.nextPageCursorValue !== (cursors[API_PAGE_CURSOR_TYPE]?.cursorValue ?? null),
    errorMessage: null,
    cursorUpdates: [
      {
        cursorType: "timestamp",
        cursorValue: runtimeResult.latestPublishedAt ?? fetchedAt,
        cursorJson: {
          provider: "api"
        }
      },
      {
        cursorType: API_PAGE_CURSOR_TYPE,
        cursorValue: runtimeResult.nextPageCursorValue,
        cursorJson: {
          provider: "api",
          paginationMode: apiConfig.pagination.mode
        }
      }
    ]
  });
}

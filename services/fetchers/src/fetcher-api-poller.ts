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
  PersistArticleInput,
  SourceChannelRow
} from "./fetcher-persistence";

interface ApiChannelPollerDependencies {
  config: FetchersConfig;
  persistInputsWithPreflight: (
    channelId: string,
    inputs: readonly PersistArticleInput[]
  ) => Promise<{ ingestedCount: number; duplicateCount: number }>;
  markChannelSuccess: (
    channel: SourceChannelRow,
    completion: ChannelPollCompletion
  ) => Promise<void>;
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
  const headers = new Headers({
    "user-agent": apiConfig.userAgent || dependencies.config.defaultUserAgent,
    accept: "application/json"
  });
  const authorizationHeader = resolveSourceChannelAuthorizationHeader(
    channel.fetchUrl,
    channel.fetchUrl,
    channel.authConfigJson
  );
  if (authorizationHeader) {
    headers.set("authorization", authorizationHeader);
  }

  const response = await fetch(channel.fetchUrl, {
    headers,
    signal: AbortSignal.timeout(apiConfig.requestTimeoutMs)
  });
  const fetchedAt = new Date().toISOString();
  if (!response.ok) {
    const message = `API fetch failed for ${channel.channelId}: ${response.status} ${response.statusText}`;
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

  const payload = (await response.json()) as unknown;
  const itemsCandidate = getByPath(payload, apiConfig.itemsPath);
  const items = Array.isArray(itemsCandidate)
    ? itemsCandidate
    : Array.isArray(payload)
      ? payload
      : [];
  let latestPublishedAt: string | null = null;
  const inputs: PersistArticleInput[] = [];
  for (const item of items.slice(0, apiConfig.maxItemsPerPoll)) {
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
      url: normalizeExternalUrl(rawUrl),
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
        sourceItem: record
      }
    });
  }
  const { ingestedCount, duplicateCount } = await dependencies.persistInputsWithPreflight(
    channel.channelId,
    inputs
  );

  await dependencies.markChannelSuccess(channel, {
    startedAt,
    finishedAt: fetchedAt,
    outcome: ingestedCount > 0 ? "new_content" : "no_change",
    httpStatus: response.status,
    retryAfterSeconds: null,
    fetchedItemCount: Math.min(items.length, apiConfig.maxItemsPerPoll),
    newArticleCount: ingestedCount,
    duplicateSuppressedCount: duplicateCount,
    cursorChanged: true,
    errorMessage: null,
    cursorUpdates: [
      {
        cursorType: "timestamp",
        cursorValue: latestPublishedAt ?? fetchedAt,
        cursorJson: {
          provider: "api"
        }
      }
    ]
  });
}

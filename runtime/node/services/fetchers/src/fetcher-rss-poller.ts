import {
  parseRssChannelConfig,
  resolveSourceChannelAuthorizationHeader,
  type FeedIngressAdapterStrategy
} from "@signalops/contracts";

import type { FetchersConfig } from "./config";
import {
  ChannelFetchError,
  classifyHttpFailure,
  classifyUnexpectedFailure,
  deriveTimestampCursorValue,
  parseRetryAfterSeconds
} from "./fetcher-channel-helpers";
import { adaptFeedIngress } from "./feed-ingress-adapters";
import { buildRssPersistInput } from "./fetcher-persist-inputs";
import { validateAcquisitionUrl } from "./probe-url-guard";
import type {
  ChannelPollCompletion,
  CursorMap,
  PersistSignalCandidateInput,
  SourceChannelRow
} from "./fetcher-persistence";

const MAX_RSS_RESPONSE_BODY_BYTES = 5_000_000;

interface RssChannelPollerDependencies {
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
  addDuplicateSignalCandidateCount: (count: number) => void;
  adapterStrategy?: FeedIngressAdapterStrategy;
  adapterMaxEntryAgeHours?: number | null;
}

export async function pollRssProviderChannel(
  channel: SourceChannelRow,
  startedAt: string,
  dependencies: RssChannelPollerDependencies
): Promise<void> {
  if (!channel.fetchUrl) {
    throw new ChannelFetchError(`RSS channel ${channel.channelId} is missing fetchUrl.`, {
      outcome: "hard_failure",
      httpStatus: null,
      retryAfterSeconds: null,
      fetchedItemCount: 0,
      newSignalCandidateCount: 0,
      duplicateSuppressedCount: 0,
      cursorChanged: false,
      errorMessage: `RSS channel ${channel.channelId} is missing fetchUrl.`
    });
  }

  const guardedFetchUrl = await validateAcquisitionUrl(channel.fetchUrl, { resolveDns: true });
  if (!guardedFetchUrl.url) {
    const message = `RSS channel ${channel.channelId} fetchUrl is not allowed: ${guardedFetchUrl.error}`;
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

  const rssConfig = parseRssChannelConfig(channel.configJson);
  const cursors = await dependencies.loadCursorMap(channel.channelId);
  const headers = new Headers({
    "user-agent": rssConfig.userAgent || dependencies.config.defaultUserAgent,
    accept:
      "application/feed+json, application/json;q=0.95, application/atom+xml;q=0.92, application/rss+xml;q=0.9, application/xml;q=0.85, text/xml;q=0.8"
  });

  if (cursors.etag?.cursorValue) {
    headers.set("if-none-match", cursors.etag.cursorValue);
  }
  if (cursors.timestamp?.cursorValue) {
    headers.set("if-modified-since", cursors.timestamp.cursorValue);
  }
  const authorizationHeader = resolveSourceChannelAuthorizationHeader(
    guardedFetchUrl.url,
    guardedFetchUrl.url,
    channel.authConfigJson
  );
  if (authorizationHeader) {
    headers.set("authorization", authorizationHeader);
  }

  const response = await fetch(guardedFetchUrl.url, {
    headers,
    signal: AbortSignal.timeout(rssConfig.requestTimeoutMs)
  });
  const fetchedAt = new Date().toISOString();
  const guardedFinalUrl = await validateAcquisitionUrl(response.url || guardedFetchUrl.url);
  if (!guardedFinalUrl.url) {
    const message = `RSS channel ${channel.channelId} final URL is not allowed: ${guardedFinalUrl.error}`;
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

  if (response.status === 304) {
    const cursorValue =
      response.headers.get("last-modified") ??
      cursors.timestamp?.cursorValue ??
      null;
    await dependencies.markChannelSuccess(channel, {
      startedAt,
      finishedAt: fetchedAt,
      outcome: "no_change",
      httpStatus: response.status,
      retryAfterSeconds: null,
      fetchedItemCount: 0,
      newSignalCandidateCount: 0,
      duplicateSuppressedCount: 0,
      cursorChanged: cursorValue !== (cursors.timestamp?.cursorValue ?? null),
      errorMessage: null,
      cursorUpdates: [
        {
          cursorType: "etag",
          cursorValue: response.headers.get("etag") ?? cursors.etag?.cursorValue ?? null,
          cursorJson: {
            header: "etag"
          }
        },
        {
          cursorType: "timestamp",
          cursorValue,
          cursorJson: {
            header: "not-modified"
          }
        }
      ]
    });
    return;
  }

  if (!response.ok) {
    const message =
      response.status === 401 || response.status === 403
        ? `RSS fetch authentication failed for ${channel.channelId}: upstream returned ${response.status}. Check the channel Authorization header.`
        : `RSS fetch failed for ${channel.channelId}: ${response.status} ${response.statusText}`;
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
  if (Number.isFinite(contentLength) && contentLength > MAX_RSS_RESPONSE_BODY_BYTES) {
    const message = `RSS fetch failed for ${channel.channelId}: response body is too large.`;
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
  if (responseBytes.byteLength > MAX_RSS_RESPONSE_BODY_BYTES) {
    const message = `RSS fetch failed for ${channel.channelId}: response body is too large.`;
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
  const responseBody = new TextDecoder().decode(responseBytes);
  try {
    const adaptedFeed = await adaptFeedIngress({
      fetchUrl: guardedFinalUrl.url,
      rssConfig,
      fetchedAt,
      contentType: response.headers.get("content-type"),
      responseBody,
      strategy: dependencies.adapterStrategy,
      maxEntryAgeHours: dependencies.adapterMaxEntryAgeHours
    });
    const items = adaptedFeed.entries;
    let invalidItemCount = 0;
    const inputs: PersistSignalCandidateInput[] = [];
    for (const item of items) {
      const input = buildRssPersistInput(
        channel,
        adaptedFeed.parsedFeed,
        item,
        fetchedAt,
        rssConfig.preferContentEncoded
      );
      if (input) {
        inputs.push(input);
      } else {
        invalidItemCount += 1;
      }
    }
    const { ingestedCount, duplicateCount } = await dependencies.persistInputsWithPreflight(
      channel.channelId,
      inputs
    );
    const latestPublishedAt = adaptedFeed.parsedFeed.entries
      .map((item) => item.publishedAt)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) ?? null;
    const timestampCursorValue = deriveTimestampCursorValue(
      latestPublishedAt,
      response.headers.get("last-modified"),
      fetchedAt
    );
    await dependencies.markChannelSuccess(channel, {
      startedAt,
      finishedAt: fetchedAt,
      outcome: ingestedCount > 0 ? "new_content" : "no_change",
      httpStatus: response.status,
      retryAfterSeconds: null,
      fetchedItemCount: adaptedFeed.parsedFeed.entries.slice(0, rssConfig.maxItemsPerPoll).length,
      newSignalCandidateCount: ingestedCount,
      duplicateSuppressedCount: duplicateCount,
      cursorChanged:
        (response.headers.get("etag") ?? null) !== (cursors.etag?.cursorValue ?? null) ||
        timestampCursorValue !== (cursors.timestamp?.cursorValue ?? null),
      errorMessage: null,
      cursorUpdates: [
        {
          cursorType: "etag",
          cursorValue: response.headers.get("etag"),
          cursorJson: {
            header: "etag"
          }
        },
        {
          cursorType: "timestamp",
          cursorValue: timestampCursorValue,
          cursorJson: {
            header: "last-modified"
          }
        }
      ]
    });
    dependencies.addDuplicateSignalCandidateCount(
      invalidItemCount + adaptedFeed.droppedAdapterCount + adaptedFeed.droppedStaleCount
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown RSS parsing failure";
    throw new ChannelFetchError(message, {
      outcome: classifyUnexpectedFailure(message),
      httpStatus: response.status,
      retryAfterSeconds: null,
      fetchedItemCount: 0,
      newSignalCandidateCount: 0,
      duplicateSuppressedCount: 0,
      cursorChanged: false,
      errorMessage: message
    });
  }
}

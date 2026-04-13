import { randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";

import {
  ARTICLE_INGEST_REQUESTED_EVENT,
  RESOURCE_INGEST_REQUESTED_EVENT,
  defaultMaxPollIntervalSeconds,
  createHealthResponse,
  parseApiChannelConfig,
  parseEmailImapChannelConfig,
  parseRssChannelConfig,
  resolveSourceChannelAuthorizationHeader,
  parseWebsiteChannelConfig,
  type HealthResponse,
  type NormalizedFetchOutcome,
  type SourceProviderType
} from "@newsportal/contracts";
import { ImapFlow } from "imapflow";
import type { Pool, PoolClient } from "pg";

import {
  computeAdaptiveTransition,
  resolveRuntimeState
} from "./adaptive-scheduling";
import type { FetchersConfig } from "./config";
import { upsertArticleObservation } from "./document-observations";
import { type ParsedFeed } from "./feed-parser";
import { adaptFeedIngress, type AdaptedFeedEntry } from "./feed-ingress-adapters";
import {
  canonicalizeUrl,
  collapseWhitespace,
  decodeHtmlEntities,
  stripHtmlTags
} from "./rss";
import { runWithConcurrency } from "./scheduler";
import {
  CrawlPolicyCacheService,
  discoverWebsiteResources,
  type DiscoveredWebsiteResource
} from "./web-ingestion";

interface SourceChannelRow {
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

interface FetchCursorRow {
  cursorType: string;
  cursorValue: string | null;
  cursorJson: Record<string, unknown>;
}

interface FetcherState {
  isPolling: boolean;
  lastPollStartedAt: string | null;
  lastPollCompletedAt: string | null;
  lastChannelId: string | null;
  lastError: string | null;
  fetchedChannelCount: number;
  ingestedArticleCount: number;
  duplicateArticleCount: number;
}

interface PersistArticleInput {
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

interface PersistResourceInput {
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

interface DuplicatePreflightDecision<T extends { externalArticleId: string; url: string }> {
  input: T;
  shouldPersist: boolean;
  duplicateReason: "externalArticleId" | "url" | null;
}

interface CursorUpdateInput {
  cursorType: string;
  cursorValue: string | null | undefined;
  cursorJson: Record<string, unknown>;
}

interface ChannelPollCompletion {
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
}

type CursorMap = Record<string, FetchCursorRow>;

class ChannelFetchError extends Error {
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

function normalizeWhitespace(value: string): string {
  return collapseWhitespace(decodeHtmlEntities(value));
}

function derivePlaintextLead(summaryHtml: string, bodyHtml: string): string {
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

function derivePlaintextBody(contentHtml: string, summaryHtml: string): string {
  const preferred = normalizeWhitespace(stripHtmlTags(contentHtml));
  if (preferred) {
    return preferred;
  }

  return normalizeWhitespace(stripHtmlTags(summaryHtml));
}

function pickLanguageHint(
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

function deriveTimestampCursorValue(
  latestPublishedAt: string | null,
  responseLastModified: string | null,
  fetchedAt: string
): string {
  return responseLastModified ?? latestPublishedAt ?? fetchedAt;
}

function getByPath(value: unknown, path: string): unknown {
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

function normalizeExternalUrl(url: string): string {
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return canonicalizeUrl(url);
  }
  return url;
}

function rawEmailToBody(rawSource: string): string {
  const separatorIndex = rawSource.search(/\r?\n\r?\n/);
  const body = separatorIndex >= 0 ? rawSource.slice(separatorIndex + 4) : rawSource;
  const cleaned = body
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ");
  return normalizeWhitespace(stripHtmlTags(cleaned));
}

function uniqueNonEmpty(values: Iterable<string>): string[] {
  return Array.from(
    new Set(
      Array.from(values, (value) => value.trim()).filter(Boolean)
    )
  );
}

function parseRetryAfterSeconds(value: string | null): number | null {
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

function classifyHttpFailure(status: number): NormalizedFetchOutcome {
  if (status === 429) {
    return "rate_limited";
  }
  if (status >= 500 || status === 408) {
    return "transient_failure";
  }
  return "hard_failure";
}

function classifyUnexpectedFailure(message: string): NormalizedFetchOutcome {
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

function isoAfterSeconds(isoTimestamp: string, seconds: number): string {
  return new Date(new Date(isoTimestamp).getTime() + seconds * 1000).toISOString();
}

export function classifyDuplicatePreflightInputs<T extends { externalArticleId: string; url: string }>(
  inputs: readonly T[],
  knownExternalArticleIds: ReadonlySet<string>,
  knownUrls: ReadonlySet<string>
): DuplicatePreflightDecision<T>[] {
  const seenExternalArticleIds = new Set(knownExternalArticleIds);
  const seenUrls = new Set(knownUrls);

  return inputs.map((input) => {
    const externalArticleId = input.externalArticleId.trim();
    const url = input.url.trim();

    if (externalArticleId && seenExternalArticleIds.has(externalArticleId)) {
      return {
        input,
        shouldPersist: false,
        duplicateReason: "externalArticleId"
      };
    }

    if (url && seenUrls.has(url)) {
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

class FetcherService {
  private readonly state: FetcherState = {
    isPolling: false,
    lastPollStartedAt: null,
    lastPollCompletedAt: null,
    lastChannelId: null,
    lastError: null,
    fetchedChannelCount: 0,
    ingestedArticleCount: 0,
    duplicateArticleCount: 0
  };
  private readonly crawlPolicyCache: CrawlPolicyCacheService;

  constructor(
    private readonly pool: Pool,
    private readonly config: FetchersConfig
  ) {
    this.crawlPolicyCache = new CrawlPolicyCacheService(pool);
  }

  getState(): FetcherState {
    return {
      ...this.state
    };
  }

  createHealthResponse(): HealthResponse {
    return createHealthResponse("fetchers", {
      database: "ok",
      isPolling: String(this.state.isPolling),
      fetchedChannelCount: String(this.state.fetchedChannelCount),
      ingestedArticleCount: String(this.state.ingestedArticleCount),
      duplicateArticleCount: String(this.state.duplicateArticleCount),
      lastPollCompletedAt: this.state.lastPollCompletedAt ?? "never"
    });
  }

  async pollOnce(): Promise<void> {
    if (this.state.isPolling) {
      return;
    }

    this.state.isPolling = true;
    this.state.lastPollStartedAt = new Date().toISOString();

    try {
      const channels = await this.loadDueChannels();
      const results = await runWithConcurrency(
        channels,
        this.config.fetchersConcurrency,
        async (channel) => {
          this.state.lastChannelId = channel.channelId;
          await this.pollLoadedChannelSafely(channel);
        }
      );
      const failedChannels = results.filter(
        (result): result is Extract<(typeof results)[number], { status: "rejected" }> =>
          result.status === "rejected"
      );

      this.state.lastError =
        failedChannels.length > 0
          ? `${failedChannels.length} of ${channels.length} due channel(s) failed during the last poll.`
          : null;
    } catch (error) {
      this.state.lastError =
        error instanceof Error ? error.message : "Unknown fetchers poll failure";
      throw error;
    } finally {
      this.state.isPolling = false;
      this.state.lastPollCompletedAt = new Date().toISOString();
    }
  }

  private async withChannelLease<T>(
    channelId: string,
    task: () => Promise<T>
  ): Promise<T | null> {
    const client = await this.pool.connect();
    let locked = false;

    try {
      const result = await client.query<{ locked: boolean }>(
        `
          select pg_try_advisory_lock(
            hashtext('fetch_channel'),
            hashtext($1)
          ) as locked
        `,
        [channelId]
      );
      locked = result.rows[0]?.locked === true;
      if (!locked) {
        return null;
      }
      return await task();
    } finally {
      if (locked) {
        await client.query(
          `
            select pg_advisory_unlock(
              hashtext('fetch_channel'),
              hashtext($1)
            )
          `,
          [channelId]
        );
      }
      client.release();
    }
  }

  private async pollLoadedChannelSafely(channel: SourceChannelRow): Promise<void> {
    const startedAt = new Date().toISOString();
    const leased = await this.withChannelLease(channel.channelId, async () => {
      try {
        await this.pollLoadedChannel(channel, startedAt);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown fetcher channel failure";
        const completion =
          error instanceof ChannelFetchError
            ? {
                ...error.completion,
                startedAt,
                finishedAt: new Date().toISOString(),
                cursorUpdates: error.completion.cursorUpdates ?? []
              }
            : {
                startedAt,
                finishedAt: new Date().toISOString(),
                outcome: classifyUnexpectedFailure(message),
                httpStatus: null,
                retryAfterSeconds: null,
                fetchedItemCount: 0,
                newArticleCount: 0,
                duplicateSuppressedCount: 0,
                cursorChanged: false,
                errorMessage: message,
                cursorUpdates: []
              };

        await this.markChannelFailure(channel, completion).catch(() => undefined);
        throw error;
      }
    });

    if (leased === null) {
      return;
    }
  }

  async pollChannel(channelId: string): Promise<void> {
    const channel = await this.loadChannelById(channelId);
    if (!channel) {
      throw new Error(`Source channel ${channelId} was not found or is not active.`);
    }

    await this.pollLoadedChannelSafely(channel);
  }

  private async pollLoadedChannel(channel: SourceChannelRow, startedAt: string): Promise<void> {
    switch (channel.providerType) {
      case "rss":
        await this.pollRssChannel(channel, startedAt);
        return;
      case "website":
        await this.pollWebsiteChannel(channel, startedAt);
        return;
      case "api":
        await this.pollApiChannel(channel, startedAt);
        return;
      case "email_imap":
        await this.pollEmailImapChannel(channel, startedAt);
        return;
      case "youtube":
        throw new ChannelFetchError("YouTube is future-ready only in the local MVP.", {
          outcome: "hard_failure",
          httpStatus: null,
          retryAfterSeconds: null,
          fetchedItemCount: 0,
          newArticleCount: 0,
          duplicateSuppressedCount: 0,
          cursorChanged: false,
          errorMessage: "YouTube is future-ready only in the local MVP."
        });
      default:
        throw new Error(`Unsupported provider type: ${channel.providerType}`);
    }
  }

  private async pollRssChannel(channel: SourceChannelRow, startedAt: string): Promise<void> {
    if (!channel.fetchUrl) {
      throw new ChannelFetchError(`RSS channel ${channel.channelId} is missing fetchUrl.`, {
        outcome: "hard_failure",
        httpStatus: null,
        retryAfterSeconds: null,
        fetchedItemCount: 0,
        newArticleCount: 0,
        duplicateSuppressedCount: 0,
        cursorChanged: false,
        errorMessage: `RSS channel ${channel.channelId} is missing fetchUrl.`
      });
    }

    const rssConfig = parseRssChannelConfig(channel.configJson);
    const cursors = await this.loadCursorMap(channel.channelId);
    const headers = new Headers({
      "user-agent": rssConfig.userAgent || this.config.defaultUserAgent,
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
      channel.fetchUrl,
      channel.fetchUrl,
      channel.authConfigJson
    );
    if (authorizationHeader) {
      headers.set("authorization", authorizationHeader);
    }

    const response = await fetch(channel.fetchUrl, {
      headers,
      signal: AbortSignal.timeout(rssConfig.requestTimeoutMs)
    });
    const fetchedAt = new Date().toISOString();

    if (response.status === 304) {
      const cursorValue =
        response.headers.get("last-modified") ??
        cursors.timestamp?.cursorValue ??
        null;
      await this.markChannelSuccess(channel, {
        startedAt,
        finishedAt: fetchedAt,
        outcome: "no_change",
        httpStatus: response.status,
        retryAfterSeconds: null,
        fetchedItemCount: 0,
        newArticleCount: 0,
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
        newArticleCount: 0,
        duplicateSuppressedCount: 0,
        cursorChanged: false,
        errorMessage: message
      });
    }

    const responseBody = await response.text();
    try {
      const adaptedFeed = await adaptFeedIngress({
        fetchUrl: channel.fetchUrl,
        rssConfig,
        fetchedAt,
        contentType: response.headers.get("content-type"),
        responseBody
      });
      const items = adaptedFeed.entries;
      let invalidItemCount = 0;
      const inputs: PersistArticleInput[] = [];
      for (const item of items) {
        const input = this.buildRssPersistInput(
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
      const { ingestedCount, duplicateCount } = await this.persistInputsWithPreflight(
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
      await this.markChannelSuccess(channel, {
        startedAt,
        finishedAt: fetchedAt,
        outcome: ingestedCount > 0 ? "new_content" : "no_change",
        httpStatus: response.status,
        retryAfterSeconds: null,
        fetchedItemCount: adaptedFeed.parsedFeed.entries.slice(0, rssConfig.maxItemsPerPoll).length,
        newArticleCount: ingestedCount,
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
      this.state.duplicateArticleCount +=
        invalidItemCount + adaptedFeed.droppedAdapterCount + adaptedFeed.droppedStaleCount;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown RSS parsing failure";
      throw new ChannelFetchError(message, {
        outcome: classifyUnexpectedFailure(message),
        httpStatus: response.status,
        retryAfterSeconds: null,
        fetchedItemCount: 0,
        newArticleCount: 0,
        duplicateSuppressedCount: 0,
        cursorChanged: false,
        errorMessage: message
      });
    }
  }

  private async pollWebsiteChannel(channel: SourceChannelRow, startedAt: string): Promise<void> {
    if (!channel.fetchUrl) {
      throw new ChannelFetchError(`Website channel ${channel.channelId} is missing fetchUrl.`, {
        outcome: "hard_failure",
        httpStatus: null,
        retryAfterSeconds: null,
        fetchedItemCount: 0,
        newArticleCount: 0,
        duplicateSuppressedCount: 0,
        cursorChanged: false,
        errorMessage: `Website channel ${channel.channelId} is missing fetchUrl.`
      });
    }

    const websiteConfig = parseWebsiteChannelConfig(channel.configJson);
    const cursors = await this.loadCursorMap(channel.channelId);
    const policy = await this.crawlPolicyCache.getPolicy(
      channel.fetchUrl,
      websiteConfig.userAgent || this.config.defaultUserAgent,
      websiteConfig.requestTimeoutMs,
      {
        channelUrl: channel.fetchUrl,
        authConfig: channel.authConfigJson
      }
    );
    if (!policy.isAllowed(channel.fetchUrl, websiteConfig.userAgent || this.config.defaultUserAgent)) {
      const message = `Website crawl blocked by robots.txt for ${channel.channelId}.`;
      throw new ChannelFetchError(message, {
        outcome: "hard_failure",
        httpStatus: 403,
        retryAfterSeconds: null,
        fetchedItemCount: 0,
        newArticleCount: 0,
        duplicateSuppressedCount: 0,
        cursorChanged: false,
        errorMessage: message
      });
    }

    const { resources, cursorUpdates, modes, browserAttempt, homepageStatus } = await discoverWebsiteResources({
      channelUrl: channel.fetchUrl,
      policy,
      config: websiteConfig,
      cursors,
      authConfig: channel.authConfigJson
    });
    if (resources.length === 0 && (homepageStatus === 401 || homepageStatus === 403)) {
      const message = `Website fetch authentication failed for ${channel.channelId}: upstream returned ${homepageStatus}. Check the channel Authorization header.`;
      throw new ChannelFetchError(message, {
        outcome: "hard_failure",
        httpStatus: homepageStatus,
        retryAfterSeconds: null,
        fetchedItemCount: 0,
        newArticleCount: 0,
        duplicateSuppressedCount: 0,
        cursorChanged: false,
        errorMessage: message
      });
    }
    if (resources.length === 0 && browserAttempt.attempted && browserAttempt.challengeKind) {
      const message = `Website browser-assisted discovery stopped for ${channel.channelId}: unsupported ${browserAttempt.challengeKind}.`;
      throw new ChannelFetchError(message, {
        outcome: "hard_failure",
        httpStatus: 403,
        retryAfterSeconds: null,
        fetchedItemCount: 0,
        newArticleCount: 0,
        duplicateSuppressedCount: 0,
        cursorChanged: false,
        errorMessage: message
      });
    }
    const fetchedAt = new Date().toISOString();
    const inputs = resources.map((resource) => this.buildWebsitePersistInput(channel, resource, fetchedAt));
    const { ingestedCount, duplicateCount } = await this.persistWebsiteResourcesWithPreflight(
      channel.channelId,
      inputs
    );
    await this.markChannelSuccess(channel, {
      startedAt,
      finishedAt: fetchedAt,
      outcome: ingestedCount > 0 ? "new_content" : "no_change",
      httpStatus: 200,
      retryAfterSeconds: null,
      fetchedItemCount: resources.length,
      newArticleCount: ingestedCount,
      duplicateSuppressedCount: duplicateCount,
      cursorChanged: cursorUpdates.length > 0,
      errorMessage: null,
      cursorUpdates: cursorUpdates.map((cursorUpdate) => ({
        cursorType: cursorUpdate.cursorType,
        cursorValue: cursorUpdate.cursorValue,
        cursorJson: {
          ...cursorUpdate.cursorJson,
          provider: "website",
          modes
        }
      }))
    });
  }

  private async pollApiChannel(channel: SourceChannelRow, startedAt: string): Promise<void> {
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
      "user-agent": apiConfig.userAgent || this.config.defaultUserAgent,
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
    const { ingestedCount, duplicateCount } = await this.persistInputsWithPreflight(
      channel.channelId,
      inputs
    );

    await this.markChannelSuccess(channel, {
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

  private async pollEmailImapChannel(channel: SourceChannelRow, startedAt: string): Promise<void> {
    const imapConfig = parseEmailImapChannelConfig(channel.configJson);
    if (!imapConfig.host || !imapConfig.username || !imapConfig.password) {
      throw new ChannelFetchError(`IMAP channel ${channel.channelId} is missing host/username/password.`, {
        outcome: "hard_failure",
        httpStatus: null,
        retryAfterSeconds: null,
        fetchedItemCount: 0,
        newArticleCount: 0,
        duplicateSuppressedCount: 0,
        cursorChanged: false,
        errorMessage: `IMAP channel ${channel.channelId} is missing host/username/password.`
      });
    }

    const cursors = await this.loadCursorMap(channel.channelId);
    const lastUid = Number(cursors.imap_uid?.cursorValue ?? "0");
    const client = new ImapFlow({
      host: imapConfig.host,
      port: imapConfig.port,
      secure: imapConfig.secure,
      auth: {
        user: imapConfig.username,
        pass: imapConfig.password
      }
    });
    let maxUid = lastUid;
    const fetchedAt = new Date().toISOString();

    try {
      await client.connect();
      await client.mailboxOpen(imapConfig.mailbox);
      const messages: Array<{
        uid: number;
        subject: string;
        fromAddress: string | null;
        publishedAt: string;
        body: string;
      }> = [];

      for await (const message of client.fetch("1:*", {
        uid: true,
        envelope: true,
        internalDate: true,
        source: true
      })) {
        if (typeof message.uid !== "number" || message.uid <= lastUid) {
          continue;
        }
        const envelope = message.envelope;
        const fromAddress = envelope?.from?.[0]?.address ?? null;
        if (imapConfig.searchFrom && fromAddress && fromAddress !== imapConfig.searchFrom) {
          continue;
        }
        const sourceText = Buffer.from(message.source ?? "").toString("utf-8");
        messages.push({
          uid: message.uid,
          subject: normalizeWhitespace(envelope?.subject ?? "Untitled email feed item"),
          fromAddress,
          publishedAt:
            message.internalDate != null
              ? new Date(message.internalDate).toISOString()
              : fetchedAt,
          body: rawEmailToBody(sourceText)
        });
      }

      messages
        .sort((left, right) => right.uid - left.uid)
        .slice(0, imapConfig.maxItemsPerPoll)
        .reverse()
        .forEach((message) => {
          maxUid = Math.max(maxUid, message.uid);
        });

      const inputs = messages
        .sort((left, right) => right.uid - left.uid)
        .slice(0, imapConfig.maxItemsPerPoll)
        .reverse()
        .map((message) => ({
          channel,
          externalArticleId: String(message.uid),
          url: `imap://${imapConfig.host}/${encodeURIComponent(imapConfig.mailbox)}/${message.uid}`,
          publishedAt: message.publishedAt,
          title: message.subject,
          lead: message.body.slice(0, 280),
          body: message.body,
          lang: channel.language,
          confidence: channel.language ? 0.8 : null,
          rawPayload: {
            fetcher: "email_imap",
            fetchedAt,
            email: {
              uid: message.uid,
              subject: message.subject,
              fromAddress: message.fromAddress
            }
          }
        }));

      const { ingestedCount, duplicateCount } = await this.persistInputsWithPreflight(
        channel.channelId,
        inputs
      );

      await this.markChannelSuccess(channel, {
        startedAt,
        finishedAt: fetchedAt,
        outcome: ingestedCount > 0 ? "new_content" : "no_change",
        httpStatus: null,
        retryAfterSeconds: null,
        fetchedItemCount: Math.min(messages.length, imapConfig.maxItemsPerPoll),
        newArticleCount: ingestedCount,
        duplicateSuppressedCount: duplicateCount,
        cursorChanged: String(maxUid) !== String(lastUid),
        errorMessage: null,
        cursorUpdates: [
          {
            cursorType: "imap_uid",
            cursorValue: String(maxUid),
            cursorJson: {
              mailbox: imapConfig.mailbox
            }
          }
        ]
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown IMAP fetch failure";
      throw new ChannelFetchError(message, {
        outcome: classifyUnexpectedFailure(message),
        httpStatus: null,
        retryAfterSeconds: null,
        fetchedItemCount: 0,
        newArticleCount: 0,
        duplicateSuppressedCount: 0,
        cursorChanged: false,
        errorMessage: message
      });
    } finally {
      await client.logout().catch(() => undefined);
    }
  }

  private async loadDueChannels(): Promise<SourceChannelRow[]> {
    const result = await this.pool.query<SourceChannelRow>(
      `
        select
          source_channels.channel_id::text as "channelId",
          source_channels.provider_type as "providerType",
          source_channels.name,
          source_channels.fetch_url as "fetchUrl",
          source_channels.config_json as "configJson",
          source_channels.auth_config_json as "authConfigJson",
          source_channels.language,
          source_channels.poll_interval_seconds as "pollIntervalSeconds",
          source_channels.last_fetch_at as "lastFetchAt",
          runtime.adaptive_enabled as "adaptiveEnabled",
          runtime.effective_poll_interval_seconds as "effectivePollIntervalSeconds",
          runtime.max_poll_interval_seconds as "maxPollIntervalSeconds",
          runtime.next_due_at as "nextDueAt",
          runtime.adaptive_step as "adaptiveStep",
          runtime.last_result_kind as "lastResultKind",
          runtime.consecutive_no_change_polls as "consecutiveNoChangePolls",
          runtime.consecutive_failures as "consecutiveFailures",
          runtime.adaptive_reason as "adaptiveReason"
        from source_channels
        left join source_channel_runtime_state runtime
          on runtime.channel_id = source_channels.channel_id
        where
          source_channels.is_active = true
          and source_channels.provider_type in ('rss', 'website', 'api', 'email_imap')
          and (
            source_channels.provider_type = 'email_imap'
            or source_channels.fetch_url is not null
          )
          and (
            coalesce(
              runtime.next_due_at,
              case
                when source_channels.last_fetch_at is null then now()
                else source_channels.last_fetch_at + make_interval(secs => source_channels.poll_interval_seconds)
              end
            ) <= now()
          )
        order by
          coalesce(
            runtime.next_due_at,
            case
              when source_channels.last_fetch_at is null then to_timestamp(0)
              else source_channels.last_fetch_at + make_interval(secs => source_channels.poll_interval_seconds)
            end
          ),
          coalesce(source_channels.last_fetch_at, to_timestamp(0)),
          source_channels.created_at
        limit $1
      `,
      [this.config.fetchersBatchSize]
    );
    return result.rows;
  }

  private async loadChannelById(channelId: string): Promise<SourceChannelRow | null> {
    const result = await this.pool.query<SourceChannelRow>(
      `
        select
          source_channels.channel_id::text as "channelId",
          source_channels.provider_type as "providerType",
          source_channels.name,
          source_channels.fetch_url as "fetchUrl",
          source_channels.config_json as "configJson",
          source_channels.auth_config_json as "authConfigJson",
          source_channels.language,
          source_channels.poll_interval_seconds as "pollIntervalSeconds",
          source_channels.last_fetch_at as "lastFetchAt",
          runtime.adaptive_enabled as "adaptiveEnabled",
          runtime.effective_poll_interval_seconds as "effectivePollIntervalSeconds",
          runtime.max_poll_interval_seconds as "maxPollIntervalSeconds",
          runtime.next_due_at as "nextDueAt",
          runtime.adaptive_step as "adaptiveStep",
          runtime.last_result_kind as "lastResultKind",
          runtime.consecutive_no_change_polls as "consecutiveNoChangePolls",
          runtime.consecutive_failures as "consecutiveFailures",
          runtime.adaptive_reason as "adaptiveReason"
        from source_channels
        left join source_channel_runtime_state runtime
          on runtime.channel_id = source_channels.channel_id
        where source_channels.channel_id = $1
          and source_channels.is_active = true
        limit 1
      `,
      [channelId]
    );
    return result.rows[0] ?? null;
  }

  private async loadCursorMap(channelId: string): Promise<CursorMap> {
    const result = await this.pool.query<FetchCursorRow>(
      `
        select
          cursor_type as "cursorType",
          cursor_value as "cursorValue",
          cursor_json as "cursorJson"
        from fetch_cursors
        where channel_id = $1
      `,
      [channelId]
    );

    return Object.fromEntries(result.rows.map((row) => [row.cursorType, row])) as CursorMap;
  }

  private buildRssPersistInput(
    channel: SourceChannelRow,
    parsedFeed: ParsedFeed,
    item: AdaptedFeedEntry,
    fetchedAt: string,
    preferContentEncoded: boolean
  ): PersistArticleInput | null {
    if (!item.url) {
      return null;
    }

    const canonicalUrl = canonicalizeUrl(item.url);
    const externalArticleId = item.entry.guid?.trim() || canonicalUrl;
    const publishedAt = item.publishedAt ?? new Date().toISOString();
    const { lang, confidence } = pickLanguageHint(channel.language, parsedFeed.language);
    const title = normalizeWhitespace(item.entry.title);
    const lead = derivePlaintextLead(item.entry.summaryHtml, item.entry.contentHtml);
    const body = preferContentEncoded
      ? derivePlaintextBody(item.entry.contentHtml, item.entry.summaryHtml)
      : derivePlaintextBody(item.entry.summaryHtml, item.entry.contentHtml);
    return {
      channel,
      externalArticleId,
      url: canonicalUrl,
      publishedAt,
      title,
      lead,
      body,
      lang,
      confidence,
      rawPayload: {
        fetcher: parsedFeed.fetcher,
        fetchedAt,
        feedAdapter: item.feedAdapter,
        feed: {
          format: parsedFeed.format,
          title: parsedFeed.title,
          language: parsedFeed.language,
          description: parsedFeed.description,
          generator: parsedFeed.generator,
          publishedAt: parsedFeed.publishedAt
        },
        entry: {
          guid: item.entry.guid,
          title: item.entry.title,
          link: item.entry.url,
          description: item.entry.summaryHtml,
          contentEncoded: item.entry.contentHtml,
          publishedAt: item.entry.publishedAt,
          rawXmlHash: item.entry.rawXmlHash,
          enclosure: item.entry.enclosure,
          mediaContentUrl: item.entry.mediaContentUrl,
          categories: item.entry.categories
        },
        rss: {
          guid: item.entry.guid,
          title: item.entry.title,
          link: item.entry.url,
          description: item.entry.summaryHtml,
          contentEncoded: item.entry.contentHtml,
          publishedAt: item.entry.publishedAt,
          rawXmlHash: item.entry.rawXmlHash,
          enclosure: item.entry.enclosure,
          mediaContentUrl: item.entry.mediaContentUrl,
          categories: item.entry.categories,
          feed: {
            format: parsedFeed.format,
            title: parsedFeed.title,
            language: parsedFeed.language,
            description: parsedFeed.description,
            generator: parsedFeed.generator,
            publishedAt: parsedFeed.publishedAt
          }
        }
      }
    };
  }

  private buildWebsitePersistInput(
    channel: SourceChannelRow,
    resource: DiscoveredWebsiteResource,
    fetchedAt: string
  ): PersistResourceInput {
    return {
      channel,
      externalArticleId: resource.externalResourceId,
      url: resource.normalizedUrl,
      resourceKind: resource.classification.kind,
      title: resource.title ?? "[Pending enrichment]",
      summary: resource.summary ?? "",
      publishedAt: resource.publishedAt,
      modifiedAt: resource.modifiedAt,
      freshnessMarkerType: resource.freshnessMarkerType,
      freshnessMarkerValue: resource.freshnessMarkerValue,
      discoverySource: resource.discoverySource,
      classificationJson: {
        kind: resource.classification.kind,
        confidence: resource.classification.confidence,
        reasons: resource.classification.reasons,
        hintedKinds: resource.hintedKinds
      },
      rawPayload: {
        fetcher: `website_${resource.discoverySource}`,
        fetchedAt,
        discovery: {
          parentUrl: resource.parentUrl,
          freshnessMarkerType: resource.freshnessMarkerType,
          freshnessMarkerValue: resource.freshnessMarkerValue,
          hintedKinds: resource.hintedKinds,
          classification: resource.classification,
          rawSignals: resource.rawSignals
        }
      }
    };
  }

  private async persistInputsWithPreflight(
    channelId: string,
    inputs: readonly PersistArticleInput[]
  ): Promise<{ ingestedCount: number; duplicateCount: number }> {
    const { pendingInputs, duplicateCount: preflightDuplicateCount } =
      await this.filterDuplicatePreflightInputs(channelId, inputs);
    let ingestedCount = 0;
    let duplicateCount = preflightDuplicateCount;

    for (const input of pendingInputs) {
      const persisted = await this.persistArticle(input);
      if (persisted) {
        ingestedCount += 1;
      } else {
        duplicateCount += 1;
      }
    }

    return {
      ingestedCount,
      duplicateCount
    };
  }

  private async persistWebsiteResourcesWithPreflight(
    channelId: string,
    inputs: readonly PersistResourceInput[]
  ): Promise<{ ingestedCount: number; duplicateCount: number }> {
    const { pendingInputs, duplicateCount: preflightDuplicateCount } =
      await this.filterDuplicateWebsiteResourceInputs(channelId, inputs);
    let ingestedCount = 0;
    let duplicateCount = preflightDuplicateCount;

    for (const input of pendingInputs) {
      const persisted = await this.persistWebsiteResource(input);
      if (persisted) {
        ingestedCount += 1;
      } else {
        duplicateCount += 1;
      }
    }

    return {
      ingestedCount,
      duplicateCount
    };
  }

  private async filterDuplicatePreflightInputs<T extends PersistArticleInput>(
    channelId: string,
    inputs: readonly T[]
  ): Promise<{ pendingInputs: T[]; duplicateCount: number }> {
    if (inputs.length === 0) {
      return {
        pendingInputs: [],
        duplicateCount: 0
      };
    }

    const knownExternalArticleIds = uniqueNonEmpty(
      inputs.map((input) => input.externalArticleId)
    );
    const knownUrls = uniqueNonEmpty(inputs.map((input) => input.url));

    const [externalRefResult, articleUrlResult] = await Promise.all([
      knownExternalArticleIds.length > 0
        ? this.pool.query<{ externalArticleId: string }>(
            `
              select external_article_id as "externalArticleId"
              from article_external_refs
              where
                channel_id = $1
                and external_article_id = any($2::text[])
            `,
            [channelId, knownExternalArticleIds]
          )
        : Promise.resolve({ rows: [] } as { rows: Array<{ externalArticleId: string }> }),
      knownUrls.length > 0
        ? this.pool.query<{ url: string }>(
            `
              select url
              from articles
              where
                channel_id = $1
                and url = any($2::text[])
            `,
            [channelId, knownUrls]
          )
        : Promise.resolve({ rows: [] } as { rows: Array<{ url: string }> })
    ]);

    const decisions = classifyDuplicatePreflightInputs(
      inputs,
      new Set(externalRefResult.rows.map((row) => row.externalArticleId)),
      new Set(articleUrlResult.rows.map((row) => row.url))
    );

    return {
      pendingInputs: decisions
        .filter((decision) => decision.shouldPersist)
        .map((decision) => decision.input),
      duplicateCount: decisions.filter((decision) => !decision.shouldPersist).length
    };
  }

  private async filterDuplicateWebsiteResourceInputs<T extends PersistResourceInput>(
    channelId: string,
    inputs: readonly T[]
  ): Promise<{ pendingInputs: T[]; duplicateCount: number }> {
    if (inputs.length === 0) {
      return {
        pendingInputs: [],
        duplicateCount: 0
      };
    }

    const knownExternalResourceIds = uniqueNonEmpty(
      inputs.map((input) => input.externalArticleId)
    );
    const knownUrls = uniqueNonEmpty(inputs.map((input) => input.url));

    const [externalRefResult, resourceUrlResult] = await Promise.all([
      knownExternalResourceIds.length > 0
        ? this.pool.query<{ externalResourceId: string }>(
            `
              select external_resource_id as "externalResourceId"
              from web_resources
              where
                channel_id = $1
                and external_resource_id = any($2::text[])
            `,
            [channelId, knownExternalResourceIds]
          )
        : Promise.resolve({ rows: [] } as { rows: Array<{ externalResourceId: string }> }),
      knownUrls.length > 0
        ? this.pool.query<{ normalizedUrl: string }>(
            `
              select normalized_url as "normalizedUrl"
              from web_resources
              where
                channel_id = $1
                and normalized_url = any($2::text[])
            `,
            [channelId, knownUrls]
          )
        : Promise.resolve({ rows: [] } as { rows: Array<{ normalizedUrl: string }> })
    ]);

    const decisions = classifyDuplicatePreflightInputs(
      inputs,
      new Set(externalRefResult.rows.map((row) => row.externalResourceId)),
      new Set(resourceUrlResult.rows.map((row) => row.normalizedUrl))
    );

    return {
      pendingInputs: decisions
        .filter((decision) => decision.shouldPersist)
        .map((decision) => decision.input),
      duplicateCount: decisions.filter((decision) => !decision.shouldPersist).length
    };
  }

  private async persistArticle(input: PersistArticleInput): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const insertResult = await client.query<{ docId: string }>(
        `
          insert into articles (
            channel_id,
            source_article_id,
            url,
            content_format,
            published_at,
            title,
            lead,
            body,
            lang,
            lang_confidence,
            raw_payload_json
          )
          values (
            $1,
            $2,
            $3,
            'article',
            $4,
            $5,
            $6,
            $7,
            $8,
            $9,
            $10::jsonb
          )
          on conflict do nothing
          returning doc_id::text as "docId"
        `,
        [
          input.channel.channelId,
          input.externalArticleId,
          input.url,
          input.publishedAt,
          input.title,
          input.lead,
          input.body,
          input.lang,
          input.confidence,
          JSON.stringify(input.rawPayload)
        ]
      );
      const insertedArticle = insertResult.rows[0];
      if (!insertedArticle) {
        await client.query("rollback");
        return false;
      }

      await client.query(
        `
          insert into article_external_refs (
            external_ref_id,
            channel_id,
            external_article_id,
            doc_id
          )
          values ($1, $2, $3, $4)
          on conflict (channel_id, external_article_id) do nothing
        `,
        [randomUUID(), input.channel.channelId, input.externalArticleId, insertedArticle.docId]
      );
      await upsertArticleObservation(client, insertedArticle.docId);
      await this.insertOutboxEvent(client, ARTICLE_INGEST_REQUESTED_EVENT, "article", insertedArticle.docId, {
        docId: insertedArticle.docId,
        version: 1
      });
      await client.query("commit");
      return true;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  private async persistWebsiteResource(input: PersistResourceInput): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");

      const existing = await client.query<{
        resourceId: string;
        freshnessMarkerValue: string | null;
        discoverySource: string;
      }>(
        `
          select
            resource_id::text as "resourceId",
            freshness_marker_value as "freshnessMarkerValue",
            discovery_source as "discoverySource"
          from web_resources
          where channel_id = $1 and normalized_url = $2
          limit 1
        `,
        [input.channel.channelId, input.url]
      );
      const existingRow = existing.rows[0];
      if (existingRow) {
        const freshnessChanged =
          (existingRow.freshnessMarkerValue ?? "") !== (input.freshnessMarkerValue ?? "") ||
          existingRow.discoverySource !== input.discoverySource;
        if (!freshnessChanged) {
          await client.query("rollback");
          return false;
        }

        await client.query(
          `
            update web_resources
            set
              title = $3,
              summary = $4,
              resource_kind = $5,
              discovery_source = $6,
              freshness_marker_type = $7,
              freshness_marker_value = $8,
              published_at = $9,
              modified_at = $10,
              classification_json = $11::jsonb,
              raw_payload_json = $12::jsonb,
              extraction_state = 'pending',
              extraction_error = null,
              updated_at = now()
            where resource_id = $1 and channel_id = $2
          `,
          [
            existingRow.resourceId,
            input.channel.channelId,
            input.title,
            input.summary,
            input.resourceKind,
            input.discoverySource,
            input.freshnessMarkerType,
            input.freshnessMarkerValue,
            input.publishedAt,
            input.modifiedAt,
            JSON.stringify(input.classificationJson),
            JSON.stringify(input.rawPayload)
          ]
        );
        await this.insertOutboxEvent(client, RESOURCE_INGEST_REQUESTED_EVENT, "resource", existingRow.resourceId, {
          resourceId: existingRow.resourceId,
          version: 1
        });
        await client.query("commit");
        return true;
      }

      const insertResult = await client.query<{ resourceId: string }>(
        `
          insert into web_resources (
            channel_id,
            external_resource_id,
            url,
            normalized_url,
            resource_kind,
            discovery_source,
            freshness_marker_type,
            freshness_marker_value,
            published_at,
            modified_at,
            title,
            summary,
            classification_json,
            raw_payload_json
          )
          values (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8,
            $9,
            $10,
            $11,
            $12,
            $13::jsonb,
            $14::jsonb
          )
          on conflict do nothing
          returning resource_id::text as "resourceId"
        `,
        [
          input.channel.channelId,
          input.externalArticleId,
          input.url,
          input.url,
          input.resourceKind,
          input.discoverySource,
          input.freshnessMarkerType,
          input.freshnessMarkerValue,
          input.publishedAt,
          input.modifiedAt,
          input.title,
          input.summary,
          JSON.stringify(input.classificationJson),
          JSON.stringify(input.rawPayload)
        ]
      );
      const insertedResource = insertResult.rows[0];
      if (!insertedResource) {
        await client.query("rollback");
        return false;
      }

      await this.insertOutboxEvent(client, RESOURCE_INGEST_REQUESTED_EVENT, "resource", insertedResource.resourceId, {
        resourceId: insertedResource.resourceId,
        version: 1
      });
      await client.query("commit");
      return true;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  private async insertOutboxEvent(
    client: PoolClient,
    eventType: string,
    aggregateType: string,
    aggregateId: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    await client.query(
      `
        insert into outbox_events (
          event_id,
          event_type,
          aggregate_type,
          aggregate_id,
          payload_json
        )
        values ($1, $2, $3, $4, $5::jsonb)
      `,
      [randomUUID(), eventType, aggregateType, aggregateId, JSON.stringify(payload)]
    );
  }

  private buildScheduleSnapshot(channel: SourceChannelRow): Record<string, unknown> {
    const runtimeState = resolveRuntimeState(channel.pollIntervalSeconds, {
      adaptiveEnabled: channel.adaptiveEnabled,
      effectivePollIntervalSeconds: channel.effectivePollIntervalSeconds,
      maxPollIntervalSeconds: channel.maxPollIntervalSeconds,
      nextDueAt: channel.nextDueAt,
      adaptiveStep: channel.adaptiveStep,
      lastResultKind: channel.lastResultKind,
      consecutiveNoChangePolls: channel.consecutiveNoChangePolls,
      consecutiveFailures: channel.consecutiveFailures,
      adaptiveReason: channel.adaptiveReason
    });

    return {
      basePollIntervalSeconds: channel.pollIntervalSeconds,
      adaptiveEnabled: runtimeState.adaptiveEnabled,
      effectivePollIntervalSeconds: runtimeState.effectivePollIntervalSeconds,
      maxPollIntervalSeconds: runtimeState.maxPollIntervalSeconds,
      nextDueAt:
        channel.nextDueAt ??
        (channel.lastFetchAt
          ? isoAfterSeconds(
              channel.lastFetchAt,
              runtimeState.effectivePollIntervalSeconds
            )
          : null) ??
        null,
      adaptiveStep: runtimeState.adaptiveStep,
      lastResultKind: runtimeState.lastResultKind,
      consecutiveNoChangePolls: runtimeState.consecutiveNoChangePolls,
      consecutiveFailures: runtimeState.consecutiveFailures,
      adaptiveReason: runtimeState.adaptiveReason
    };
  }

  private async upsertRuntimeState(
    client: PoolClient,
    channel: SourceChannelRow,
    completion: ChannelPollCompletion
  ): Promise<void> {
    const nextState = computeAdaptiveTransition({
      basePollIntervalSeconds: channel.pollIntervalSeconds,
      fetchedAt: completion.finishedAt,
      outcome: completion.outcome,
      retryAfterSeconds: completion.retryAfterSeconds,
      state: {
        adaptiveEnabled: channel.adaptiveEnabled,
        effectivePollIntervalSeconds: channel.effectivePollIntervalSeconds,
        maxPollIntervalSeconds:
          channel.maxPollIntervalSeconds ??
          defaultMaxPollIntervalSeconds(channel.pollIntervalSeconds),
        nextDueAt: channel.nextDueAt,
        adaptiveStep: channel.adaptiveStep,
        lastResultKind: channel.lastResultKind,
        consecutiveNoChangePolls: channel.consecutiveNoChangePolls,
        consecutiveFailures: channel.consecutiveFailures,
        adaptiveReason: channel.adaptiveReason
      }
    });

    await client.query(
      `
        insert into source_channel_runtime_state (
          channel_id,
          adaptive_enabled,
          effective_poll_interval_seconds,
          max_poll_interval_seconds,
          next_due_at,
          adaptive_step,
          last_result_kind,
          consecutive_no_change_polls,
          consecutive_failures,
          adaptive_reason,
          updated_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
        on conflict (channel_id)
        do update
        set
          adaptive_enabled = excluded.adaptive_enabled,
          effective_poll_interval_seconds = excluded.effective_poll_interval_seconds,
          max_poll_interval_seconds = excluded.max_poll_interval_seconds,
          next_due_at = excluded.next_due_at,
          adaptive_step = excluded.adaptive_step,
          last_result_kind = excluded.last_result_kind,
          consecutive_no_change_polls = excluded.consecutive_no_change_polls,
          consecutive_failures = excluded.consecutive_failures,
          adaptive_reason = excluded.adaptive_reason,
          updated_at = excluded.updated_at
      `,
      [
        channel.channelId,
        nextState.adaptiveEnabled,
        nextState.effectivePollIntervalSeconds,
        nextState.maxPollIntervalSeconds,
        nextState.nextDueAt,
        nextState.adaptiveStep,
        nextState.lastResultKind,
        nextState.consecutiveNoChangePolls,
        nextState.consecutiveFailures,
        nextState.adaptiveReason
      ]
    );
  }

  private async insertFetchRun(
    client: PoolClient,
    channel: SourceChannelRow,
    completion: ChannelPollCompletion
  ): Promise<void> {
    await client.query(
      `
        insert into channel_fetch_runs (
          fetch_run_id,
          channel_id,
          provider_type,
          scheduled_at,
          started_at,
          finished_at,
          outcome_kind,
          http_status,
          retry_after_seconds,
          fetch_duration_ms,
          fetched_item_count,
          new_article_count,
          duplicate_suppressed_count,
          cursor_changed,
          error_text,
          schedule_snapshot_json
        )
        values (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11,
          $12,
          $13,
          $14,
          $15,
          $16::jsonb
        )
      `,
      [
        randomUUID(),
        channel.channelId,
        channel.providerType,
        channel.nextDueAt ??
          channel.lastFetchAt ??
          completion.startedAt,
        completion.startedAt,
        completion.finishedAt,
        completion.outcome,
        completion.httpStatus,
        completion.retryAfterSeconds,
        Math.max(
          0,
          new Date(completion.finishedAt).getTime() -
            new Date(completion.startedAt).getTime()
        ),
        completion.fetchedItemCount,
        completion.newArticleCount,
        completion.duplicateSuppressedCount,
        completion.cursorChanged,
        completion.errorMessage,
        JSON.stringify(this.buildScheduleSnapshot(channel))
      ]
    );
  }

  private async markChannelSuccess(
    channel: SourceChannelRow,
    completion: ChannelPollCompletion
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query(
        `
          update source_channels
          set
            last_fetch_at = $2,
            last_success_at = $2,
            last_error_at = null,
            last_error_message = null,
            updated_at = now()
          where channel_id = $1
        `,
        [channel.channelId, completion.finishedAt]
      );

      for (const cursorUpdate of completion.cursorUpdates) {
        if (!cursorUpdate.cursorValue) {
          continue;
        }
        await this.upsertCursor(
          client,
          channel.channelId,
          cursorUpdate.cursorType,
          cursorUpdate.cursorValue,
          cursorUpdate.cursorJson
        );
      }
      await this.upsertRuntimeState(client, channel, completion);
      await this.insertFetchRun(client, channel, completion);
      await client.query("commit");
      this.state.fetchedChannelCount += 1;
      this.state.ingestedArticleCount += completion.newArticleCount;
      this.state.duplicateArticleCount += completion.duplicateSuppressedCount;
      this.state.lastError = null;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  private async markChannelFailure(
    channel: SourceChannelRow,
    completion: ChannelPollCompletion
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query(
        `
          update source_channels
          set
            last_fetch_at = $2,
            last_error_at = $2,
            last_error_message = $3,
            updated_at = now()
          where channel_id = $1
        `,
        [channel.channelId, completion.finishedAt, completion.errorMessage]
      );
      await this.upsertRuntimeState(client, channel, completion);
      await this.insertFetchRun(client, channel, completion);
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  private async upsertCursor(
    client: PoolClient,
    channelId: string,
    cursorType: string,
    cursorValue: string,
    cursorJson: Record<string, unknown>
  ): Promise<void> {
    await client.query(
      `
        insert into fetch_cursors (
          cursor_id,
          channel_id,
          cursor_type,
          cursor_value,
          cursor_json,
          updated_at
        )
        values ($1, $2, $3, $4, $5::jsonb, now())
        on conflict (channel_id, cursor_type)
        do update
        set
          cursor_value = excluded.cursor_value,
          cursor_json = excluded.cursor_json,
          updated_at = excluded.updated_at
      `,
      [randomUUID(), channelId, cursorType, cursorValue, JSON.stringify(cursorJson)]
    );
  }
}

export class RssFetcherService extends FetcherService {}

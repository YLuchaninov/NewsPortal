import { Buffer } from "node:buffer";

import {
  createHealthResponse,
  parseApiChannelConfig,
  parseEmailImapChannelConfig,
  parseRssChannelConfig,
  resolveSourceChannelAuthorizationHeader,
  parseWebsiteChannelConfig,
  type HealthResponse,
  type NormalizedFetchOutcome
} from "@newsportal/contracts";
import { ImapFlow } from "imapflow";
import type { Pool } from "pg";

import type { FetchersConfig } from "./config";
import { type ParsedFeed } from "./feed-parser";
import { adaptFeedIngress, type AdaptedFeedEntry } from "./feed-ingress-adapters";
import {
  classifyDuplicatePreflightInputs,
  FetcherPersistenceRepository,
  type ChannelPollCompletion,
  type CursorUpdateInput,
  type PersistArticleInput,
  type PersistResourceInput,
  type SourceChannelRow
} from "./fetcher-persistence";
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

class AsyncSemaphore {
  private readonly waiting: Array<() => void> = [];
  private available: number;

  constructor(initialCapacity: number) {
    this.available = Math.max(1, Math.floor(initialCapacity) || 1);
  }

  async acquire(): Promise<() => void> {
    if (this.available > 0) {
      this.available -= 1;
      return () => this.release();
    }

    await new Promise<void>((resolve) => {
      this.waiting.push(resolve);
    });
    this.available -= 1;
    return () => this.release();
  }

  private release(): void {
    this.available += 1;
    const next = this.waiting.shift();
    if (next) {
      next();
    }
  }
}

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

export { classifyDuplicatePreflightInputs };

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
  private readonly persistence: FetcherPersistenceRepository;

  constructor(
    pool: Pool,
    private readonly config: FetchersConfig
  ) {
    this.crawlPolicyCache = new CrawlPolicyCacheService(pool);
    this.persistence = new FetcherPersistenceRepository(pool);
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
      const providerLimiters = new Map<string, AsyncSemaphore>([
        ["rss", new AsyncSemaphore(this.config.fetchersRssConcurrency)],
        ["website", new AsyncSemaphore(this.config.fetchersWebsiteConcurrency)]
      ]);
      const results = await runWithConcurrency(
        channels,
        this.config.fetchersConcurrency,
        async (channel) => {
          const releaseProviderSlot = await (providerLimiters.get(channel.providerType)?.acquire() ??
            Promise.resolve(() => undefined));
          this.state.lastChannelId = channel.channelId;
          try {
            await this.pollLoadedChannelSafely(channel);
          } finally {
            releaseProviderSlot();
          }
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
    return this.persistence.withChannelLease(channelId, task);
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

    const {
      resources,
      cursorUpdates,
      modes,
      browserAttempt,
      homepageStatus,
      metrics,
      policyState,
    } = await discoverWebsiteResources({
      channelUrl: channel.fetchUrl,
      policy,
      config: websiteConfig,
      cursors,
      authConfig: channel.authConfigJson
    });
    await this.crawlPolicyCache.persistConditionalState(
      channel.fetchUrl,
      policyState,
      channel.authConfigJson == null
        ? undefined
        : {
            channelUrl: channel.fetchUrl,
            authConfig: channel.authConfigJson,
          }
    );
    const providerMetricsJson: Record<string, unknown> = {
      ...metrics,
      modes,
    };
    const homepageConditionalStatus =
      policyState.responseCache.homepage?.status ??
      policyState.requestValidators.homepage?.httpStatus ??
      null;
    const authFailureStatus =
      homepageStatus === 401 || homepageStatus === 403
        ? homepageStatus
        : homepageConditionalStatus === 401 || homepageConditionalStatus === 403
          ? homepageConditionalStatus
        : policy.httpStatus === 401 || policy.httpStatus === 403
          ? policy.httpStatus
          : null;
    if (resources.length === 0 && authFailureStatus) {
      const message = `Website fetch authentication failed for ${channel.channelId}: upstream returned ${authFailureStatus}. Check the channel Authorization header.`;
      throw new ChannelFetchError(message, {
        outcome: "hard_failure",
        httpStatus: authFailureStatus,
        retryAfterSeconds: null,
        fetchedItemCount: 0,
        newArticleCount: 0,
        duplicateSuppressedCount: 0,
        cursorChanged: false,
        errorMessage: message,
        providerMetricsJson,
      });
    }
    if (resources.length === 0 && browserAttempt.challengeKind) {
      const message = browserAttempt.attempted
        ? `Website browser-assisted discovery stopped for ${channel.channelId}: unsupported ${browserAttempt.challengeKind}.`
        : `Website discovery stopped for ${channel.channelId}: upstream presented unsupported ${browserAttempt.challengeKind}.`;
      throw new ChannelFetchError(message, {
        outcome: "hard_failure",
        httpStatus: 403,
        retryAfterSeconds: null,
        fetchedItemCount: 0,
        newArticleCount: 0,
        duplicateSuppressedCount: 0,
        cursorChanged: false,
        errorMessage: message,
        providerMetricsJson,
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
      providerMetricsJson,
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
    return this.persistence.loadDueChannels(this.config);
  }

  private async loadChannelById(channelId: string): Promise<SourceChannelRow | null> {
    return this.persistence.loadChannelById(channelId);
  }

  private async loadCursorMap(channelId: string) {
    return this.persistence.loadCursorMap(channelId);
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
        hintedKinds: resource.hintedKinds,
        discovery: {
          kind: resource.classification.kind,
          confidence: resource.classification.confidence,
          reasons: resource.classification.reasons,
          hintedKinds: resource.hintedKinds,
          discoverySource: resource.discoverySource,
        },
        resolved: {
          kind: resource.classification.kind,
          confidence: resource.classification.confidence,
          reasonSource: "discovery",
        },
        transition: {
          kindChanged: false,
          fromKind: resource.classification.kind,
          toKind: resource.classification.kind,
          reasonSource: "discovery",
        }
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
    return this.persistence.persistArticlesWithPreflight(channelId, inputs);
  }

  private async persistWebsiteResourcesWithPreflight(
    channelId: string,
    inputs: readonly PersistResourceInput[]
  ): Promise<{ ingestedCount: number; duplicateCount: number }> {
    return this.persistence.persistWebsiteResourcesWithPreflight(channelId, inputs);
  }

  private async markChannelSuccess(
    channel: SourceChannelRow,
    completion: ChannelPollCompletion
  ): Promise<void> {
    await this.persistence.markChannelSuccess(channel, completion);
    this.state.fetchedChannelCount += 1;
    this.state.ingestedArticleCount += completion.newArticleCount;
    this.state.duplicateArticleCount += completion.duplicateSuppressedCount;
    this.state.lastError = null;
  }

  private async markChannelFailure(
    channel: SourceChannelRow,
    completion: ChannelPollCompletion
  ): Promise<void> {
    await this.persistence.markChannelFailure(channel, completion);
  }
}

export class RssFetcherService extends FetcherService {}

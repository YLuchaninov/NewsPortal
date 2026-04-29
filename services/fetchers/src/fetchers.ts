import { Buffer } from "node:buffer";

import {
  createHealthResponse,
  parseApiChannelConfig,
  parseEmailImapChannelConfig,
  parseRssChannelConfig,
  resolveSourceChannelAuthorizationHeader,
  parseWebsiteChannelConfig,
  type HealthResponse
} from "@newsportal/contracts";
import { ImapFlow } from "imapflow";
import type { Pool } from "pg";

import { AsyncSemaphore } from "./async-semaphore";
import type { FetchersConfig } from "./config";
import {
  ChannelFetchError,
  classifyHttpFailure,
  classifyUnexpectedFailure,
  deriveTimestampCursorValue,
  getByPath,
  normalizeExternalUrl,
  normalizeWhitespace,
  parseRetryAfterSeconds,
  rawEmailToBody,
} from "./fetcher-channel-helpers";
import { adaptFeedIngress } from "./feed-ingress-adapters";
import { buildRssPersistInput, buildWebsitePersistInput } from "./fetcher-persist-inputs";
import {
  classifyDuplicatePreflightInputs,
  FetcherPersistenceRepository,
  type ChannelPollCompletion,
  type PersistArticleInput,
  type PersistResourceInput,
  type SourceChannelRow
} from "./fetcher-persistence";
import { runWithConcurrency } from "./scheduler";
import {
  CrawlPolicyCacheService,
  discoverWebsiteResources
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
    const inputs = resources.map((resource) => buildWebsitePersistInput(channel, resource, fetchedAt));
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

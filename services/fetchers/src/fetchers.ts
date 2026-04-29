import { Buffer } from "node:buffer";

import {
  createHealthResponse,
  parseEmailImapChannelConfig,
  type HealthResponse
} from "@newsportal/contracts";
import { ImapFlow } from "imapflow";
import type { Pool } from "pg";

import { AsyncSemaphore } from "./async-semaphore";
import type { FetchersConfig } from "./config";
import { pollApiProviderChannel } from "./fetcher-api-poller";
import { pollRssProviderChannel } from "./fetcher-rss-poller";
import { pollWebsiteProviderChannel } from "./fetcher-website-poller";
import {
  ChannelFetchError,
  classifyUnexpectedFailure,
  normalizeWhitespace,
  rawEmailToBody,
} from "./fetcher-channel-helpers";
import {
  classifyDuplicatePreflightInputs,
  FetcherPersistenceRepository,
  type ChannelPollCompletion,
  type PersistArticleInput,
  type PersistResourceInput,
  type SourceChannelRow
} from "./fetcher-persistence";
import { runWithConcurrency } from "./scheduler";
import { CrawlPolicyCacheService } from "./web-ingestion";

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
    await pollRssProviderChannel(channel, startedAt, {
      config: this.config,
      loadCursorMap: this.loadCursorMap.bind(this),
      persistInputsWithPreflight: this.persistInputsWithPreflight.bind(this),
      markChannelSuccess: this.markChannelSuccess.bind(this),
      addDuplicateArticleCount: (count) => {
        this.state.duplicateArticleCount += count;
      }
    });
  }

  private async pollWebsiteChannel(channel: SourceChannelRow, startedAt: string): Promise<void> {
    await pollWebsiteProviderChannel(channel, startedAt, {
      config: this.config,
      crawlPolicyCache: this.crawlPolicyCache,
      loadCursorMap: this.loadCursorMap.bind(this),
      persistWebsiteResourcesWithPreflight: this.persistWebsiteResourcesWithPreflight.bind(this),
      markChannelSuccess: this.markChannelSuccess.bind(this)
    });
  }

  private async pollApiChannel(channel: SourceChannelRow, startedAt: string): Promise<void> {
    await pollApiProviderChannel(channel, startedAt, {
      config: this.config,
      persistInputsWithPreflight: this.persistInputsWithPreflight.bind(this),
      markChannelSuccess: this.markChannelSuccess.bind(this)
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

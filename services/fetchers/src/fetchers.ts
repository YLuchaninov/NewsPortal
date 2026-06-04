import {
  createHealthResponse,
  defaultMaxEntryAgeHoursForFeedIngressAdapter,
  ingressAdapterKeyToLegacyRssStrategy,
  type HealthResponse
} from "@signalops/contracts";
import type { Pool } from "pg";

import { AsyncSemaphore } from "./async-semaphore";
import type { FetchersConfig } from "./config";
import { pollApiProviderChannel } from "./fetcher-api-poller";
import { pollEmailImapProviderChannel } from "./fetcher-email-imap-poller";
import { pollRssProviderChannel } from "./fetcher-rss-poller";
import { pollWebsiteProviderChannel } from "./fetcher-website-poller";
import {
  ChannelFetchError,
  classifyUnexpectedFailure,
} from "./fetcher-channel-helpers";
import {
  classifyDuplicatePreflightInputs,
  FetcherPersistenceRepository,
  type ChannelPollCompletion,
  type PersistArticleInput,
  type PersistResourceInput,
  type SourceChannelRow
} from "./fetcher-persistence";
import {
  applyResolvedIngressAdapterToChannel,
  buildIngressAdapterProviderMetrics,
  resolveIngressAdapterForChannel,
  type ResolvedIngressAdapter,
} from "./ingress-adapters/resolver";
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

const MAX_DUE_CHANNELS_PER_HOST_PER_POLL = 3;

function channelHostKey(channel: SourceChannelRow): string {
  if (!channel.fetchUrl) {
    return `${channel.providerType}:${channel.channelId}`;
  }
  try {
    return `${channel.providerType}:${new URL(channel.fetchUrl).host.toLowerCase()}`;
  } catch {
    return `${channel.providerType}:${channel.channelId}`;
  }
}

function applyHostPoliteBudget(channels: SourceChannelRow[]): SourceChannelRow[] {
  const hostCounts = new Map<string, number>();
  return channels.filter((channel) => {
    const key = channelHostKey(channel);
    const count = hostCounts.get(key) ?? 0;
    if (count >= MAX_DUE_CHANNELS_PER_HOST_PER_POLL) {
      return false;
    }
    hostCounts.set(key, count + 1);
    return true;
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
  private readonly persistence: FetcherPersistenceRepository;

  constructor(
    private readonly pool: Pool,
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
    const resolved = await resolveIngressAdapterForChannel(this.pool, channel);
    const resolvedChannel = applyResolvedIngressAdapterToChannel(channel, resolved);
    switch (resolvedChannel.providerType) {
      case "rss":
        await this.pollRssChannel(resolvedChannel, startedAt, resolved);
        return;
      case "website":
        await this.pollWebsiteChannel(resolvedChannel, startedAt, resolved);
        return;
      case "api":
        await this.pollApiChannel(resolvedChannel, startedAt, resolved);
        return;
      case "email_imap":
        await this.pollEmailImapChannel(resolvedChannel, startedAt, resolved);
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
          errorMessage: "YouTube is future-ready only in the local MVP.",
          adapterKey: resolved?.adapterKey ?? null,
          adapterRuntimeKind: resolved?.runtimeKind ?? null,
          adapterSelectionMode: resolved?.selectionMode ?? null,
        });
      default:
        throw new Error(`Unsupported provider type: ${resolvedChannel.providerType}`);
    }
  }

  private enrichPollCompletion(
    completion: ChannelPollCompletion,
    resolved: ResolvedIngressAdapter | null
  ): ChannelPollCompletion {
    if (!resolved) {
      return completion;
    }
    return {
      ...completion,
      adapterKey: resolved.adapterKey,
      adapterRuntimeKind: resolved.runtimeKind,
      adapterSelectionMode: resolved.selectionMode,
      providerMetricsJson: {
        ...(completion.providerMetricsJson ?? {}),
        ...buildIngressAdapterProviderMetrics(resolved),
      },
    };
  }

  private async pollRssChannel(
    channel: SourceChannelRow,
    startedAt: string,
    resolved: ResolvedIngressAdapter | null
  ): Promise<void> {
    const adapterStrategy =
      resolved?.providerType === "rss"
        ? ingressAdapterKeyToLegacyRssStrategy(resolved.adapterKey) ?? "generic"
        : "generic";
    await pollRssProviderChannel(channel, startedAt, {
      config: this.config,
      loadCursorMap: this.loadCursorMap.bind(this),
      persistInputsWithPreflight: this.persistInputsWithPreflight.bind(this),
      markChannelSuccess: (successChannel, completion) =>
        this.markChannelSuccess(successChannel, this.enrichPollCompletion(completion, resolved)),
      addDuplicateArticleCount: (count) => {
        this.state.duplicateArticleCount += count;
      },
      adapterStrategy,
      adapterMaxEntryAgeHours:
        typeof resolved?.bindingConfigJson.maxEntryAgeHours === "number"
          ? resolved.bindingConfigJson.maxEntryAgeHours
          : defaultMaxEntryAgeHoursForFeedIngressAdapter(adapterStrategy)
    });
  }

  private async pollWebsiteChannel(
    channel: SourceChannelRow,
    startedAt: string,
    resolved: ResolvedIngressAdapter | null
  ): Promise<void> {
    await pollWebsiteProviderChannel(channel, startedAt, {
      config: this.config,
      crawlPolicyCache: this.crawlPolicyCache,
      loadCursorMap: this.loadCursorMap.bind(this),
      persistWebsiteResourcesWithPreflight: this.persistWebsiteResourcesWithPreflight.bind(this),
      markChannelSuccess: (successChannel, completion) =>
        this.markChannelSuccess(successChannel, this.enrichPollCompletion(completion, resolved))
    });
  }

  private async pollApiChannel(
    channel: SourceChannelRow,
    startedAt: string,
    resolved: ResolvedIngressAdapter | null
  ): Promise<void> {
    await pollApiProviderChannel(channel, startedAt, {
      config: this.config,
      resolvedAdapter: resolved,
      loadCursorMap: this.loadCursorMap.bind(this),
      persistInputsWithPreflight: this.persistInputsWithPreflight.bind(this),
      markChannelSuccess: (successChannel, completion) =>
        this.markChannelSuccess(successChannel, this.enrichPollCompletion(completion, resolved))
    });
  }

  private async pollEmailImapChannel(
    channel: SourceChannelRow,
    startedAt: string,
    resolved: ResolvedIngressAdapter | null
  ): Promise<void> {
    await pollEmailImapProviderChannel(channel, startedAt, {
      loadCursorMap: this.loadCursorMap.bind(this),
      persistInputsWithPreflight: this.persistInputsWithPreflight.bind(this),
      markChannelSuccess: (successChannel, completion) =>
        this.markChannelSuccess(successChannel, this.enrichPollCompletion(completion, resolved))
    });
  }

  private async loadDueChannels(): Promise<SourceChannelRow[]> {
    return applyHostPoliteBudget(await this.persistence.loadDueChannels(this.config));
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

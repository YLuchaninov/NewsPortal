import type { Pool } from "pg";

import { FetcherChannelStateRepository } from "./fetcher-channel-state-repository";
import { FetcherContentRepository } from "./fetcher-content-repository";
import type { FetchersConfig } from "./config";
import type {
  ChannelPollCompletion,
  CursorMap,
  PersistArticleInput,
  PersistResourceInput,
  SourceChannelRow
} from "./fetcher-persistence-types";

export {
  classifyDuplicatePreflightInputs,
  type ChannelPollCompletion,
  type CursorMap,
  type CursorUpdateInput,
  type DuplicatePreflightDecision,
  type FetchCursorRow,
  type PersistArticleInput,
  type PersistResourceInput,
  type SourceChannelRow
} from "./fetcher-persistence-types";

export class FetcherPersistenceRepository {
  private readonly channelState: FetcherChannelStateRepository;
  private readonly content: FetcherContentRepository;

  constructor(pool: Pool) {
    this.channelState = new FetcherChannelStateRepository(pool);
    this.content = new FetcherContentRepository(pool);
  }

  withChannelLease<T>(channelId: string, task: () => Promise<T>): Promise<T | null> {
    return this.channelState.withChannelLease(channelId, task);
  }

  loadDueChannels(config: FetchersConfig): Promise<SourceChannelRow[]> {
    return this.channelState.loadDueChannels(config);
  }

  loadChannelById(channelId: string): Promise<SourceChannelRow | null> {
    return this.channelState.loadChannelById(channelId);
  }

  loadCursorMap(channelId: string): Promise<CursorMap> {
    return this.channelState.loadCursorMap(channelId);
  }

  persistArticlesWithPreflight(
    channelId: string,
    inputs: readonly PersistArticleInput[]
  ): Promise<{ ingestedCount: number; duplicateCount: number }> {
    return this.content.persistArticlesWithPreflight(channelId, inputs);
  }

  persistWebsiteResourcesWithPreflight(
    channelId: string,
    inputs: readonly PersistResourceInput[]
  ): Promise<{ ingestedCount: number; duplicateCount: number }> {
    return this.content.persistWebsiteResourcesWithPreflight(channelId, inputs);
  }

  markChannelSuccess(channel: SourceChannelRow, completion: ChannelPollCompletion): Promise<void> {
    return this.channelState.markChannelSuccess(channel, completion);
  }

  markChannelFailure(channel: SourceChannelRow, completion: ChannelPollCompletion): Promise<void> {
    return this.channelState.markChannelFailure(channel, completion);
  }
}

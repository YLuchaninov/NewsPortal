import { parseWebsiteChannelConfig } from "@signalops/contracts";

import type { FetchersConfig } from "./config";
import { ChannelFetchError } from "./fetcher-channel-helpers";
import { buildWebsitePersistInput } from "./fetcher-persist-inputs";
import type {
  ChannelPollCompletion,
  CursorMap,
  PersistResourceInput,
  SourceChannelRow
} from "./fetcher-persistence";
import {
  CrawlPolicyCacheService,
  discoverWebsiteResources
} from "./web-ingestion";

interface WebsiteChannelPollerDependencies {
  config: FetchersConfig;
  crawlPolicyCache: CrawlPolicyCacheService;
  loadCursorMap: (channelId: string) => Promise<CursorMap>;
  persistWebsiteResourcesWithPreflight: (
    channelId: string,
    inputs: readonly PersistResourceInput[]
  ) => Promise<{ ingestedCount: number; duplicateCount: number }>;
  markChannelSuccess: (
    channel: SourceChannelRow,
    completion: ChannelPollCompletion
  ) => Promise<void>;
}

export async function pollWebsiteProviderChannel(
  channel: SourceChannelRow,
  startedAt: string,
  dependencies: WebsiteChannelPollerDependencies
): Promise<void> {
  if (!channel.fetchUrl) {
    throw new ChannelFetchError(`Website channel ${channel.channelId} is missing fetchUrl.`, {
      outcome: "hard_failure",
      httpStatus: null,
      retryAfterSeconds: null,
      fetchedItemCount: 0,
      newSignalCandidateCount: 0,
      duplicateSuppressedCount: 0,
      cursorChanged: false,
      errorMessage: `Website channel ${channel.channelId} is missing fetchUrl.`
    });
  }

  const websiteConfig = parseWebsiteChannelConfig(channel.configJson);
  const cursors = await dependencies.loadCursorMap(channel.channelId);
  const policy = await dependencies.crawlPolicyCache.getPolicy(
    channel.fetchUrl,
    websiteConfig.userAgent || dependencies.config.defaultUserAgent,
    websiteConfig.requestTimeoutMs,
    {
      channelUrl: channel.fetchUrl,
      authConfig: channel.authConfigJson
    }
  );
  if (!policy.isAllowed(channel.fetchUrl, websiteConfig.userAgent || dependencies.config.defaultUserAgent)) {
    const message = `Website crawl blocked by robots.txt for ${channel.channelId}.`;
    throw new ChannelFetchError(message, {
      outcome: "hard_failure",
      httpStatus: 403,
      retryAfterSeconds: null,
      fetchedItemCount: 0,
      newSignalCandidateCount: 0,
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
  await dependencies.crawlPolicyCache.persistConditionalState(
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
      newSignalCandidateCount: 0,
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
      newSignalCandidateCount: 0,
      duplicateSuppressedCount: 0,
      cursorChanged: false,
      errorMessage: message,
      providerMetricsJson,
    });
  }
  const fetchedAt = new Date().toISOString();
  const inputs = resources.map((resource) => buildWebsitePersistInput(channel, resource, fetchedAt));
  const { ingestedCount, duplicateCount } = await dependencies.persistWebsiteResourcesWithPreflight(
    channel.channelId,
    inputs
  );
  await dependencies.markChannelSuccess(channel, {
    startedAt,
    finishedAt: fetchedAt,
    outcome: ingestedCount > 0 ? "new_content" : "no_change",
    httpStatus: 200,
    retryAfterSeconds: null,
    fetchedItemCount: resources.length,
    newSignalCandidateCount: ingestedCount,
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

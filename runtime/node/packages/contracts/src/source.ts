import { parseApiChannelConfig } from "./source/api";
import { parseEmailImapChannelConfig } from "./source/email-imap";
import type { ParsedSourceChannelConfig, SourceProviderType } from "./source/model";
import { parseRssChannelConfig } from "./source/rss";
import { parseWebsiteChannelConfig } from "./source/website";

export {
  ADMIN_CREATE_PROVIDER_TYPES,
  BETA_INGEST_PROVIDER_TYPES,
  BULK_IMPORT_PROVIDER_TYPES,
  PROVIDER_CAPABILITY_STATUSES,
  SIGNALOPS_PROVIDER_CAPABILITIES,
  formatProviderCapabilityLabel,
  getProviderCapability,
  isBetaIngestProviderType,
} from "./source/capabilities";
export type {
  BetaIngestProviderType,
  ProviderCapability,
  ProviderCapabilityStatus,
  SignalOpsProviderLane,
} from "./source/capabilities";
export { parseApiChannelConfig } from "./source/api";
export { parseEmailImapChannelConfig } from "./source/email-imap";
export {
  API_ADAPTER_ACCESS_KINDS,
  API_ADAPTER_KEYS,
  API_ADAPTER_RESEARCH_MODES,
  API_ADAPTER_TOS_RISKS,
  CHANNEL_SCHEDULE_PRESETS,
  DEFAULT_AGGREGATOR_MAX_ENTRY_AGE_HOURS,
  DEFAULT_CHANNEL_ENRICHMENT_MIN_BODY_LENGTH,
  DEFAULT_SOURCE_CHANNEL_ADAPTIVE_MAX_CAP_SECONDS,
  FEED_INGRESS_ADAPTER_STRATEGIES,
  MAX_SOURCE_CHANNEL_POLL_INTERVAL_SECONDS,
  RESOURCE_KINDS,
} from "./source/model";
export type {
  ApiAdapterAccessKind,
  ApiAdapterKey,
  ApiAdapterResearchMode,
  ApiAdapterTosRisk,
  ApiChannelConfig,
  EmailImapChannelConfig,
  FeedIngressAdapterStrategy,
  NormalizedFetchOutcome,
  ParsedSourceChannelConfig,
  ResourceKind,
  RssAdminChannelInput,
  RssChannelConfig,
  SourceChannelAuthConfig,
  SourceChannelAuthSummary,
  SourceChannelRuntimeState,
  SourceChannelSchedulePatch,
  SourceProviderType,
  WebResourceDetail,
  WebResourceExtractionState,
  WebResourcePreview,
  WebResourceProjectionState,
  WebsiteChannelConfig,
} from "./source/model";
export {
  defaultMaxEntryAgeHoursForFeedIngressAdapter,
  inferFeedIngressAdapterStrategy,
  parseRssChannelConfig,
  resolveFeedIngressAdapterStrategy,
  resolveRssChannelAdapterStrategy,
  resolveRssChannelMaxEntryAgeHours,
} from "./source/rss";
export {
  buildSourceChannelAuthSummary,
  defaultMaxPollIntervalSeconds,
  normalizeMaxPollIntervalSeconds,
  parseSourceChannelAuthConfig,
  resolveSourceChannelAuthorizationHeader,
  serializeSourceChannelAuthConfig,
} from "./source/shared";
export { parseWebsiteChannelConfig } from "./source/website";

export function parseSourceChannelConfig(
  providerType: SourceProviderType,
  config: unknown
): ParsedSourceChannelConfig {
  switch (providerType) {
    case "rss":
      return parseRssChannelConfig(config);
    case "website":
      return parseWebsiteChannelConfig(config);
    case "api":
      return parseApiChannelConfig(config);
    case "email_imap":
      return parseEmailImapChannelConfig(config);
    case "youtube":
      throw new Error("YouTube source channel config is future-hidden and unsupported for beta runtime.");
    default:
      throw new Error(`Unsupported provider type: ${String(providerType)}`);
  }
}

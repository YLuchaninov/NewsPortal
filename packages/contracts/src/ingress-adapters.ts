import {
  API_ADAPTER_KEYS,
  FEED_INGRESS_ADAPTER_STRATEGIES,
  type ApiAdapterKey,
  type FeedIngressAdapterStrategy,
  type SourceProviderType,
} from "./source";

export const INGRESS_ADAPTER_RUNTIME_KINDS = ["declarative", "builtin"] as const;
export const INGRESS_ADAPTER_OUTPUT_MODES = ["signal_candidates", "web_resources", "mixed"] as const;
export const INGRESS_ADAPTER_STATUSES = ["active", "draft", "disabled", "archived"] as const;
export const INGRESS_ADAPTER_SELECTION_MODES = [
  "manual",
  "mcp",
  "auto",
  "migration",
  "builtin_default",
] as const;
export const INGRESS_ADAPTER_RESOLUTION_SOURCES = [
  "binding",
  "legacy_config",
  "recommended_default",
  "provider_default",
] as const;

export type IngressAdapterRuntimeKind = (typeof INGRESS_ADAPTER_RUNTIME_KINDS)[number];
export type IngressAdapterOutputMode = (typeof INGRESS_ADAPTER_OUTPUT_MODES)[number];
export type IngressAdapterStatus = (typeof INGRESS_ADAPTER_STATUSES)[number];
export type IngressAdapterSelectionMode = (typeof INGRESS_ADAPTER_SELECTION_MODES)[number];
export type IngressAdapterResolutionSource = (typeof INGRESS_ADAPTER_RESOLUTION_SOURCES)[number];

export interface AdapterMatchRules {
  urlHostContains?: string[];
  urlPathContains?: string[];
  urlPathExcludes?: string[];
  contentType?: string[];
  jsonPathExists?: string[];
  htmlSelectorExists?: string[];
  providerConfigFlags?: Record<string, unknown>;
  allowAutoSelect?: boolean;
}

export interface DeclarativeIngressRecipe {
  request?: Record<string, unknown>;
  response?: Record<string, unknown>;
  pagination?: Record<string, unknown>;
  items?: string;
  map?: Record<string, unknown>;
  constants?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  maxItems?: number;
  [key: string]: unknown;
}

export interface IngressAdapterDescriptor {
  adapterKey: string;
  title: string;
  description: string;
  runtimeKind: IngressAdapterRuntimeKind;
  providerType: SourceProviderType;
  outputMode: IngressAdapterOutputMode;
  priority: number;
  status: IngressAdapterStatus;
  matchRules: AdapterMatchRules;
  configSchema: Record<string, unknown>;
  recipe?: DeclarativeIngressRecipe | null;
  moduleName?: string | null;
  metadata?: Record<string, unknown>;
  isSystem?: boolean;
  editable?: boolean;
}

export interface SourceChannelAdapterBindingContract {
  channelId: string;
  adapterKey: string;
  config: Record<string, unknown>;
  selectionMode: IngressAdapterSelectionMode;
  enabled: boolean;
  selectedBy?: string | null;
  selectionReason?: string | null;
}

export interface AdapterRecommendation {
  adapterKey: string;
  title: string;
  priority: number;
  matchedRules: string[];
  failedRules: string[];
  autoBindable: boolean;
  reason: string;
}

export interface ResolvedAdapterBinding {
  source: IngressAdapterResolutionSource;
  adapterKey: string;
  runtimeKind: IngressAdapterRuntimeKind;
  providerType: SourceProviderType;
  outputMode: IngressAdapterOutputMode;
  selectionMode: IngressAdapterSelectionMode | "provider_default";
  config: Record<string, unknown>;
  descriptor?: IngressAdapterDescriptor | null;
}

const LEGACY_RSS_STRATEGY_TO_ADAPTER_KEY: Record<FeedIngressAdapterStrategy, string> = {
  generic: "rss.generic",
  reddit_search_rss: "rss.reddit_search_rss",
  hn_comments_feed: "rss.hn_comments_feed",
  google_news_rss: "rss.google_news_rss",
};

export function legacyRssStrategyToIngressAdapterKey(
  strategy: FeedIngressAdapterStrategy | null | undefined
): string {
  return strategy ? LEGACY_RSS_STRATEGY_TO_ADAPTER_KEY[strategy] : "rss.generic";
}

export function ingressAdapterKeyToLegacyRssStrategy(
  adapterKey: string | null | undefined
): FeedIngressAdapterStrategy | null {
  const normalized = String(adapterKey ?? "").trim();
  for (const [strategy, key] of Object.entries(LEGACY_RSS_STRATEGY_TO_ADAPTER_KEY)) {
    if (normalized === key) {
      return strategy as FeedIngressAdapterStrategy;
    }
  }
  return null;
}

export function legacyApiAdapterKeyToIngressAdapterKey(
  adapterKey: ApiAdapterKey | string | null | undefined
): string | null {
  const normalized = String(adapterKey ?? "").trim();
  if (!normalized) {
    return null;
  }
  if ((API_ADAPTER_KEYS as readonly string[]).includes(normalized)) {
    return `api.${normalized}`;
  }
  return null;
}

export function ingressAdapterKeyToLegacyApiAdapterKey(
  adapterKey: string | null | undefined
): ApiAdapterKey | null {
  const normalized = String(adapterKey ?? "").trim();
  const prefix = "api.";
  if (!normalized.startsWith(prefix)) {
    return null;
  }
  const legacyKey = normalized.slice(prefix.length);
  return (API_ADAPTER_KEYS as readonly string[]).includes(legacyKey)
    ? (legacyKey as ApiAdapterKey)
    : null;
}

export function defaultIngressAdapterKeyForProvider(providerType: SourceProviderType): string | null {
  switch (providerType) {
    case "rss":
      return "rss.generic";
    case "website":
      return "website.generic_discovery";
    case "api":
      return "api.generic_json_mapping";
    case "email_imap":
      return "email_imap.generic_mailbox";
    case "youtube":
      return null;
  }
}

export function isKnownLegacyRssStrategy(value: string): value is FeedIngressAdapterStrategy {
  return (FEED_INGRESS_ADAPTER_STRATEGIES as readonly string[]).includes(value);
}

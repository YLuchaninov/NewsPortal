export type SourceProviderType = "rss" | "website" | "api" | "email_imap" | "youtube";
export const API_ADAPTER_KEYS = [
  "hn_algolia_search",
  "github_issues_search",
  "stack_exchange_search",
  "ddgs_search",
  "searxng_search",
  "brave_search",
  "tavily_search",
  "exa_search",
  "serpapi_google_news_research",
  "discourse_search",
  "greenhouse_job_board",
  "lever_postings",
  "ashby_job_postings",
  "remotive_jobs",
  "remoteok_jobs",
  "weworkremotely_rss",
  "peopleperhour_public_projects_research",
  "freelancer_public_projects_research",
  "guru_public_projects_research",
  "malt_public_projects_research",
  "contra_public_search_research",
  "upwork_public_signal_research",
  "linkedin_public_signal_research"
] as const;
export const API_ADAPTER_RESEARCH_MODES = ["production", "research_only"] as const;
export const API_ADAPTER_ACCESS_KINDS = [
  "official_free",
  "official_free_key",
  "official_paid",
  "github_unofficial_public",
  "github_unofficial_restricted",
  "closed_access",
  "unsupported"
] as const;
export const API_ADAPTER_TOS_RISKS = ["low", "medium", "high", "unknown"] as const;
export const FEED_INGRESS_ADAPTER_STRATEGIES = [
  "generic",
  "reddit_search_rss",
  "hn_comments_feed",
  "google_news_rss"
] as const;
export const RESOURCE_KINDS = [
  "editorial",
  "listing",
  "entity",
  "document",
  "data_file",
  "api_payload",
  "unknown"
] as const;
export type ResourceKind = (typeof RESOURCE_KINDS)[number];
export type FeedIngressAdapterStrategy = (typeof FEED_INGRESS_ADAPTER_STRATEGIES)[number];
export type WebResourceExtractionState = "pending" | "enriched" | "skipped" | "failed";
export type WebResourceProjectionState =
  | "pending"
  | "projected_to_common_pipeline"
  | "explicitly_rejected_before_pipeline";
export type NormalizedFetchOutcome =
  | "new_content"
  | "no_change"
  | "rate_limited"
  | "transient_failure"
  | "hard_failure";

export const MAX_SOURCE_CHANNEL_POLL_INTERVAL_SECONDS = 604800;
export const DEFAULT_SOURCE_CHANNEL_ADAPTIVE_MAX_CAP_SECONDS = 259200;
export const DEFAULT_CHANNEL_ENRICHMENT_MIN_BODY_LENGTH = 500;
export const DEFAULT_AGGREGATOR_MAX_ENTRY_AGE_HOURS = 168;
export const CHANNEL_SCHEDULE_PRESETS = {
  fast: 300,
  normal: 900,
  slow: 3600,
  daily: 86400,
  three_day: 259200
} as const;

export type ApiAdapterKey = (typeof API_ADAPTER_KEYS)[number];
export type ApiAdapterResearchMode = (typeof API_ADAPTER_RESEARCH_MODES)[number];
export type ApiAdapterAccessKind = (typeof API_ADAPTER_ACCESS_KINDS)[number];
export type ApiAdapterTosRisk = (typeof API_ADAPTER_TOS_RISKS)[number];

export interface SourceChannelRuntimeState {
  adaptiveEnabled: boolean;
  effectivePollIntervalSeconds: number;
  maxPollIntervalSeconds: number;
  nextDueAt: string | null;
  adaptiveStep: number;
  lastResultKind: NormalizedFetchOutcome | null;
  consecutiveNoChangePolls: number;
  consecutiveFailures: number;
  adaptiveReason: string | null;
}

export interface WebResourcePreview {
  resource_id: string;
  channel_id: string;
  channel_name?: string | null;
  url?: string | null;
  final_url?: string | null;
  normalized_url?: string | null;
  title?: string | null;
  summary?: string | null;
  lang?: string | null;
  published_at?: string | null;
  discovered_at?: string | null;
  updated_at?: string | null;
  resource_kind?: ResourceKind | string;
  discovery_source?: string | null;
  extraction_state?: WebResourceExtractionState | string;
  extraction_error?: string | null;
  projection_state?: WebResourceProjectionState | string;
  projection_error?: string | null;
  projected_signal_candidate_id?: string | null;
  projected_signal_candidate_title?: string | null;
  content_item_id?: string | null;
  content_item_ready?: boolean;
  selection_source?: string | null;
  selection_decision?: string | null;
  selection_mode?: string | null;
  selection_summary?: string | null;
  selection_reason?: string | null;
  selection_hold_count?: number | null;
  selection_llm_review_pending_count?: number | null;
  selection_guidance?: Record<string, unknown> | null;
  documents_count?: number;
  media_count?: number;
  links_out_count?: number;
  child_resources_count?: number;
}

export interface WebResourceDetail extends WebResourcePreview {
  body?: string | null;
  body_html?: string | null;
  classification_json?: Record<string, unknown> | null;
  attributes_json?: Record<string, unknown> | null;
  documents_json?: unknown[] | null;
  media_json?: unknown[] | null;
  links_out_json?: unknown[] | null;
  child_resources_json?: unknown[] | null;
  raw_payload_json?: Record<string, unknown> | null;
  selection_diagnostics?: Record<string, unknown> | null;
  analysis_summary?: Record<string, unknown> | null;
}

export interface SourceChannelSchedulePatch {
  pollIntervalSeconds: number;
  adaptiveEnabled?: boolean;
  maxPollIntervalSeconds?: number | null;
}

export interface SourceChannelAuthConfig {
  authorizationHeader: string | null;
}

export interface SourceChannelAuthSummary {
  hasAuthorizationHeader: boolean;
}

export interface RssChannelConfig {
  maxItemsPerPoll: number;
  requestTimeoutMs: number;
  userAgent: string;
  preferContentEncoded: boolean;
  adapterStrategy: FeedIngressAdapterStrategy | null;
  maxEntryAgeHours: number | null;
}

export interface RssAdminChannelInput {
  channelId?: string;
  providerType?: "rss";
  name: string;
  fetchUrl: string;
  language?: string | null;
  isActive?: boolean;
  pollIntervalSeconds?: number;
  adaptiveEnabled?: boolean;
  maxPollIntervalSeconds?: number | null;
  maxItemsPerPoll?: number;
  requestTimeoutMs?: number;
  userAgent?: string;
  preferContentEncoded?: boolean;
  adapterStrategy?: FeedIngressAdapterStrategy | null;
  maxEntryAgeHours?: number | null;
  enrichmentEnabled?: boolean;
  enrichmentMinBodyLength?: number;
}

export interface WebsiteChannelConfig {
  maxResourcesPerPoll: number;
  requestTimeoutMs: number;
  totalPollTimeoutMs: number;
  userAgent: string;
  sitemapDiscoveryEnabled: boolean;
  feedDiscoveryEnabled: boolean;
  collectionDiscoveryEnabled: boolean;
  downloadDiscoveryEnabled: boolean;
  browserFallbackEnabled: boolean;
  maxBrowserFetchesPerPoll: number;
  allowedUrlPatterns: string[];
  blockedUrlPatterns: string[];
  collectionSeedUrls: string[];
  downloadPatterns: string[];
  crawlDelayMs: number;
  classification: {
    enableRoughPageTypeDetection: boolean;
    minConfidenceForTypedExtraction: number;
  };
  curated: {
    preferCollectionDiscovery: boolean;
    preferBrowserFallback: boolean;
    editorialUrlPatterns: string[];
    listingUrlPatterns: string[];
    entityUrlPatterns: string[];
    documentUrlPatterns: string[];
    dataFileUrlPatterns: string[];
  };
  extraction: {
    minEditorialBodyLength: number;
    allowInlineJsonExtraction: boolean;
    allowBrowserNetworkCapture: boolean;
    extractTables: boolean;
    extractDownloads: boolean;
  };
}

export interface ApiChannelConfig {
  maxItemsPerPoll: number;
  requestTimeoutMs: number;
  userAgent: string;
  requestMethod: "GET" | "POST";
  requestHeaders: Record<string, string>;
  requestBodyJson: unknown | null;
  responseFormat: "json" | "ndjson";
  pagination: {
    mode: "none" | "next_url" | "page" | "cursor";
    nextUrlPath: string;
    pageParam: string;
    pageStart: number;
    cursorParam: string;
    cursorPath: string;
    maxPagesPerPoll: number;
  };
  itemsPath: string;
  titleField: string | string[];
  leadField: string | string[];
  bodyField: string | string[];
  urlField: string | string[];
  urlTemplate: string | null;
  publishedAtField: string | string[];
  externalIdField: string | string[];
  languageField: string | string[];
  adapter: {
    adapterKey: ApiAdapterKey | null;
    researchMode: ApiAdapterResearchMode;
    accessKind: ApiAdapterAccessKind | null;
    sourceRole: string | null;
    contentKind: ResourceKind | string | null;
    query: string | null;
    platform: string | null;
    searchQuery: {
      query: string | null;
      platform: string | null;
      siteFilter: string | null;
      locale: string | null;
      timeRange: string | null;
      maxResults: number;
      searchProvider: string | null;
      directCoverage: boolean;
    };
    organization: string | null;
    tags: string[];
    githubEvidence: unknown[];
    tosRisk: ApiAdapterTosRisk;
    requiresProductionReplacement: boolean;
  };
}

export interface EmailImapChannelConfig {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  mailbox: string;
  searchFrom?: string | null;
  searchSinceHours: number | null;
  maxMessageBytes: number;
  bodyPreference: "text" | "html";
  maxItemsPerPoll: number;
}

export type ParsedSourceChannelConfig =
  | RssChannelConfig
  | WebsiteChannelConfig
  | ApiChannelConfig
  | EmailImapChannelConfig;

export const DEFAULT_RSS_CHANNEL_CONFIG: RssChannelConfig = {
  maxItemsPerPoll: 20,
  requestTimeoutMs: 10000,
  userAgent: "SignalOpsFetchers/0.1 (+https://signalops.local)",
  preferContentEncoded: true,
  adapterStrategy: null,
  maxEntryAgeHours: null
};

export const DEFAULT_WEBSITE_CHANNEL_CONFIG: WebsiteChannelConfig = {
  maxResourcesPerPoll: 20,
  requestTimeoutMs: 10000,
  totalPollTimeoutMs: 60000,
  userAgent: "SignalOpsFetchers/0.1 (+https://signalops.local)",
  sitemapDiscoveryEnabled: true,
  feedDiscoveryEnabled: true,
  collectionDiscoveryEnabled: true,
  downloadDiscoveryEnabled: true,
  browserFallbackEnabled: false,
  maxBrowserFetchesPerPoll: 2,
  allowedUrlPatterns: [],
  blockedUrlPatterns: [],
  collectionSeedUrls: [],
  downloadPatterns: [".pdf", ".csv", ".xlsx", ".json", ".xml", ".zip"],
  crawlDelayMs: 1000,
  classification: {
    enableRoughPageTypeDetection: true,
    minConfidenceForTypedExtraction: 0.45
  },
  curated: {
    preferCollectionDiscovery: false,
    preferBrowserFallback: false,
    editorialUrlPatterns: [],
    listingUrlPatterns: [],
    entityUrlPatterns: [],
    documentUrlPatterns: [],
    dataFileUrlPatterns: []
  },
  extraction: {
    minEditorialBodyLength: 500,
    allowInlineJsonExtraction: true,
    allowBrowserNetworkCapture: true,
    extractTables: true,
    extractDownloads: true
  }
};

export const DEFAULT_API_CHANNEL_CONFIG: ApiChannelConfig = {
  maxItemsPerPoll: 20,
  requestTimeoutMs: 10000,
  userAgent: "SignalOpsFetchers/0.1 (+https://signalops.local)",
  requestMethod: "GET",
  requestHeaders: {},
  requestBodyJson: null,
  responseFormat: "json",
  pagination: {
    mode: "none",
    nextUrlPath: "next",
    pageParam: "page",
    pageStart: 1,
    cursorParam: "cursor",
    cursorPath: "nextCursor",
    maxPagesPerPoll: 1
  },
  itemsPath: "items",
  titleField: "title",
  leadField: "lead",
  bodyField: "body",
  urlField: "url",
  urlTemplate: null,
  publishedAtField: "publishedAt",
  externalIdField: "id",
  languageField: "language",
  adapter: {
    adapterKey: null,
    researchMode: "production",
    accessKind: null,
    sourceRole: null,
    contentKind: null,
    query: null,
    platform: null,
    searchQuery: {
      query: null,
      platform: null,
      siteFilter: null,
      locale: null,
      timeRange: null,
      maxResults: 20,
      searchProvider: null,
      directCoverage: false
    },
    organization: null,
    tags: [],
    githubEvidence: [],
    tosRisk: "unknown",
    requiresProductionReplacement: false
  }
};

export const DEFAULT_EMAIL_IMAP_CHANNEL_CONFIG: EmailImapChannelConfig = {
  host: "",
  port: 993,
  secure: true,
  username: "",
  password: "",
  mailbox: "INBOX",
  searchFrom: null as string | null,
  searchSinceHours: 720,
  maxMessageBytes: 524288,
  bodyPreference: "text",
  maxItemsPerPoll: 20
};

export const DEFAULT_SOURCE_CHANNEL_AUTH_CONFIG: SourceChannelAuthConfig = {
  authorizationHeader: null
};

export type SourceProviderType = "rss" | "website" | "api" | "email_imap" | "youtube";
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
  projected_article_id?: string | null;
  projected_article_title?: string | null;
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
  itemsPath: string;
  titleField: string;
  leadField: string;
  bodyField: string;
  urlField: string;
  publishedAtField: string;
  externalIdField: string;
  languageField: string;
}

export interface EmailImapChannelConfig {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  mailbox: string;
  searchFrom?: string | null;
  maxItemsPerPoll: number;
}

export type ParsedSourceChannelConfig =
  | RssChannelConfig
  | WebsiteChannelConfig
  | ApiChannelConfig
  | EmailImapChannelConfig;

const DEFAULT_RSS_CHANNEL_CONFIG: RssChannelConfig = {
  maxItemsPerPoll: 20,
  requestTimeoutMs: 10000,
  userAgent: "NewsPortalFetchers/0.1 (+https://newsportal.local)",
  preferContentEncoded: true,
  adapterStrategy: null,
  maxEntryAgeHours: null
};

const DEFAULT_WEBSITE_CHANNEL_CONFIG: WebsiteChannelConfig = {
  maxResourcesPerPoll: 20,
  requestTimeoutMs: 10000,
  totalPollTimeoutMs: 60000,
  userAgent: "NewsPortalFetchers/0.1 (+https://newsportal.local)",
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

const DEFAULT_API_CHANNEL_CONFIG: ApiChannelConfig = {
  maxItemsPerPoll: 20,
  requestTimeoutMs: 10000,
  userAgent: "NewsPortalFetchers/0.1 (+https://newsportal.local)",
  itemsPath: "items",
  titleField: "title",
  leadField: "lead",
  bodyField: "body",
  urlField: "url",
  publishedAtField: "publishedAt",
  externalIdField: "id",
  languageField: "language"
};

const DEFAULT_EMAIL_IMAP_CHANNEL_CONFIG: EmailImapChannelConfig = {
  host: "",
  port: 993,
  secure: true,
  username: "",
  password: "",
  mailbox: "INBOX",
  searchFrom: null as string | null,
  maxItemsPerPoll: 20
};

const DEFAULT_SOURCE_CHANNEL_AUTH_CONFIG: SourceChannelAuthConfig = {
  authorizationHeader: null
};

function asRecord(config: unknown): Record<string, unknown> {
  if (config == null) {
    return {};
  }

  if (typeof config !== "object" || Array.isArray(config)) {
    throw new Error("Source channel config must be an object.");
  }

  return config as Record<string, unknown>;
}

function readPositiveInteger(
  value: unknown,
  fallback: number,
  fieldName: string
): number {
  if (value == null) {
    return fallback;
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new Error(`Source channel config field "${fieldName}" must be a positive integer.`);
  }

  return value;
}

function readNumberInRange(
  value: unknown,
  fallback: number,
  fieldName: string,
  min: number,
  max: number
): number {
  if (value == null) {
    return fallback;
  }

  if (typeof value !== "number" || Number.isNaN(value) || value < min || value > max) {
    throw new Error(
      `Source channel config field "${fieldName}" must be a number between ${min} and ${max}.`
    );
  }

  return value;
}

export function defaultMaxPollIntervalSeconds(basePollIntervalSeconds: number): number {
  if (!Number.isInteger(basePollIntervalSeconds) || basePollIntervalSeconds <= 0) {
    throw new Error("Base poll interval must be a positive integer.");
  }

  return Math.min(
    basePollIntervalSeconds * 16,
    DEFAULT_SOURCE_CHANNEL_ADAPTIVE_MAX_CAP_SECONDS
  );
}

export function normalizeMaxPollIntervalSeconds(
  basePollIntervalSeconds: number,
  maxPollIntervalSeconds: number | null | undefined
): number {
  const fallback = defaultMaxPollIntervalSeconds(basePollIntervalSeconds);
  if (maxPollIntervalSeconds == null) {
    return fallback;
  }

  if (!Number.isInteger(maxPollIntervalSeconds) || maxPollIntervalSeconds <= 0) {
    throw new Error('Source channel config field "maxPollIntervalSeconds" must be a positive integer.');
  }

  return Math.max(
    basePollIntervalSeconds,
    Math.min(maxPollIntervalSeconds, MAX_SOURCE_CHANNEL_POLL_INTERVAL_SECONDS)
  );
}

function readBoolean(value: unknown, fallback: boolean, fieldName: string): boolean {
  if (value == null) {
    return fallback;
  }

  if (typeof value !== "boolean") {
    throw new Error(`Source channel config field "${fieldName}" must be a boolean.`);
  }

  return value;
}

function readString(value: unknown, fallback: string, fieldName: string): string {
  if (value == null) {
    return fallback;
  }

  if (typeof value !== "string") {
    throw new Error(`Source channel config field "${fieldName}" must be a string.`);
  }

  return value.trim() || fallback;
}

function readOptionalString(
  value: unknown,
  fallback: string | null,
  fieldName: string
): string | null {
  if (value == null) {
    return fallback;
  }

  if (typeof value !== "string") {
    throw new Error(`Source channel config field "${fieldName}" must be a string.`);
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function readNullablePositiveInteger(
  value: unknown,
  fallback: number | null,
  fieldName: string
): number | null {
  if (value == null) {
    return fallback;
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new Error(`Source channel config field "${fieldName}" must be a positive integer.`);
  }

  return value;
}

function readFeedIngressAdapterStrategy(
  value: unknown,
  fallback: FeedIngressAdapterStrategy | null,
  fieldName: string
): FeedIngressAdapterStrategy | null {
  if (value == null) {
    return fallback;
  }

  if (typeof value !== "string") {
    throw new Error(`Source channel config field "${fieldName}" must be a string.`);
  }

  const normalized = value.trim();
  if (!normalized) {
    return fallback;
  }

  if (
    (FEED_INGRESS_ADAPTER_STRATEGIES as readonly string[]).includes(normalized)
  ) {
    return normalized as FeedIngressAdapterStrategy;
  }

  throw new Error(
    `Source channel config field "${fieldName}" must be one of ${FEED_INGRESS_ADAPTER_STRATEGIES.join(", ")}.`
  );
}

export function inferFeedIngressAdapterStrategy(
  fetchUrl: string | null | undefined
): FeedIngressAdapterStrategy {
  if (!fetchUrl) {
    return "generic";
  }

  try {
    const parsed = new URL(fetchUrl);
    const hostname = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname.toLowerCase();

    if (hostname.endsWith("reddit.com") && pathname.includes("search.rss")) {
      return "reddit_search_rss";
    }

    if (hostname === "hnrss.org") {
      return "hn_comments_feed";
    }

    if (hostname === "news.google.com" && pathname.startsWith("/rss/")) {
      return "google_news_rss";
    }
  } catch {
    return "generic";
  }

  return "generic";
}

export function defaultMaxEntryAgeHoursForFeedIngressAdapter(
  strategy: FeedIngressAdapterStrategy
): number | null {
  switch (strategy) {
    case "reddit_search_rss":
    case "hn_comments_feed":
    case "google_news_rss":
      return DEFAULT_AGGREGATOR_MAX_ENTRY_AGE_HOURS;
    case "generic":
    default:
      return null;
  }
}

export function resolveFeedIngressAdapterStrategy(
  fetchUrl: string | null | undefined,
  explicitStrategy: FeedIngressAdapterStrategy | null | undefined
): FeedIngressAdapterStrategy {
  return explicitStrategy ?? inferFeedIngressAdapterStrategy(fetchUrl);
}

export function resolveRssChannelAdapterStrategy(
  fetchUrl: string | null | undefined,
  config: Pick<RssChannelConfig, "adapterStrategy">
): FeedIngressAdapterStrategy {
  return resolveFeedIngressAdapterStrategy(fetchUrl, config.adapterStrategy);
}

export function resolveRssChannelMaxEntryAgeHours(
  fetchUrl: string | null | undefined,
  config: Pick<RssChannelConfig, "adapterStrategy" | "maxEntryAgeHours">
): number | null {
  if (config.maxEntryAgeHours != null) {
    return config.maxEntryAgeHours;
  }

  return defaultMaxEntryAgeHoursForFeedIngressAdapter(
    resolveFeedIngressAdapterStrategy(fetchUrl, config.adapterStrategy)
  );
}

function readStringList(
  value: unknown,
  fallback: string[],
  fieldName: string
): string[] {
  if (value == null) {
    return [...fallback];
  }

  if (!Array.isArray(value)) {
    throw new Error(`Source channel config field "${fieldName}" must be an array of strings.`);
  }

  return value.map((item, index) => {
    if (typeof item !== "string") {
      throw new Error(
        `Source channel config field "${fieldName}" item ${index} must be a string.`
      );
    }

    const trimmed = item.trim();
    if (!trimmed) {
      throw new Error(
        `Source channel config field "${fieldName}" item ${index} must not be empty.`
      );
    }

    return trimmed;
  });
}

export function parseRssChannelConfig(config: unknown): RssChannelConfig {
  const candidate = asRecord(config);

  return {
    maxItemsPerPoll: readPositiveInteger(
      candidate.maxItemsPerPoll,
      DEFAULT_RSS_CHANNEL_CONFIG.maxItemsPerPoll,
      "maxItemsPerPoll"
    ),
    requestTimeoutMs: readPositiveInteger(
      candidate.requestTimeoutMs,
      DEFAULT_RSS_CHANNEL_CONFIG.requestTimeoutMs,
      "requestTimeoutMs"
    ),
    userAgent: readString(
      candidate.userAgent,
      DEFAULT_RSS_CHANNEL_CONFIG.userAgent,
      "userAgent"
    ),
    preferContentEncoded: readBoolean(
      candidate.preferContentEncoded,
      DEFAULT_RSS_CHANNEL_CONFIG.preferContentEncoded,
      "preferContentEncoded"
    ),
    adapterStrategy: readFeedIngressAdapterStrategy(
      candidate.adapterStrategy,
      DEFAULT_RSS_CHANNEL_CONFIG.adapterStrategy,
      "adapterStrategy"
    ),
    maxEntryAgeHours: readNullablePositiveInteger(
      candidate.maxEntryAgeHours,
      DEFAULT_RSS_CHANNEL_CONFIG.maxEntryAgeHours,
      "maxEntryAgeHours"
    )
  };
}

export function parseSourceChannelAuthConfig(config: unknown): SourceChannelAuthConfig {
  const candidate = asRecord(config);

  return {
    authorizationHeader: readOptionalString(
      candidate.authorizationHeader,
      DEFAULT_SOURCE_CHANNEL_AUTH_CONFIG.authorizationHeader,
      "authorizationHeader"
    )
  };
}

export function serializeSourceChannelAuthConfig(
  config: SourceChannelAuthConfig
): Record<string, unknown> {
  const parsed = parseSourceChannelAuthConfig(config);
  const serialized: Record<string, unknown> = {};

  if (parsed.authorizationHeader) {
    serialized.authorizationHeader = parsed.authorizationHeader;
  }

  return serialized;
}

export function buildSourceChannelAuthSummary(config: unknown): SourceChannelAuthSummary {
  return {
    hasAuthorizationHeader: Boolean(parseSourceChannelAuthConfig(config).authorizationHeader)
  };
}

export function resolveSourceChannelAuthorizationHeader(
  requestUrl: string,
  channelUrl: string | null | undefined,
  authConfig: unknown
): string | null {
  const authorizationHeader = parseSourceChannelAuthConfig(authConfig).authorizationHeader;
  if (!authorizationHeader || !channelUrl) {
    return null;
  }

  try {
    const requestOrigin = new URL(requestUrl).origin;
    const channelOrigin = new URL(channelUrl).origin;
    return requestOrigin === channelOrigin ? authorizationHeader : null;
  } catch {
    return null;
  }
}

export function parseWebsiteChannelConfig(config: unknown): WebsiteChannelConfig {
  const candidate = asRecord(config);
  const classification = asRecord(candidate.classification);
  const curated = asRecord(candidate.curated);
  const extraction = asRecord(candidate.extraction);

  return {
    maxResourcesPerPoll: readPositiveInteger(
      candidate.maxResourcesPerPoll,
      DEFAULT_WEBSITE_CHANNEL_CONFIG.maxResourcesPerPoll,
      "maxResourcesPerPoll"
    ),
    requestTimeoutMs: readPositiveInteger(
      candidate.requestTimeoutMs,
      DEFAULT_WEBSITE_CHANNEL_CONFIG.requestTimeoutMs,
      "requestTimeoutMs"
    ),
    totalPollTimeoutMs: readPositiveInteger(
      candidate.totalPollTimeoutMs,
      DEFAULT_WEBSITE_CHANNEL_CONFIG.totalPollTimeoutMs,
      "totalPollTimeoutMs"
    ),
    userAgent: readString(
      candidate.userAgent,
      DEFAULT_WEBSITE_CHANNEL_CONFIG.userAgent,
      "userAgent"
    ),
    sitemapDiscoveryEnabled: readBoolean(
      candidate.sitemapDiscoveryEnabled,
      DEFAULT_WEBSITE_CHANNEL_CONFIG.sitemapDiscoveryEnabled,
      "sitemapDiscoveryEnabled"
    ),
    feedDiscoveryEnabled: readBoolean(
      candidate.feedDiscoveryEnabled,
      DEFAULT_WEBSITE_CHANNEL_CONFIG.feedDiscoveryEnabled,
      "feedDiscoveryEnabled"
    ),
    collectionDiscoveryEnabled: readBoolean(
      candidate.collectionDiscoveryEnabled,
      DEFAULT_WEBSITE_CHANNEL_CONFIG.collectionDiscoveryEnabled,
      "collectionDiscoveryEnabled"
    ),
    downloadDiscoveryEnabled: readBoolean(
      candidate.downloadDiscoveryEnabled,
      DEFAULT_WEBSITE_CHANNEL_CONFIG.downloadDiscoveryEnabled,
      "downloadDiscoveryEnabled"
    ),
    browserFallbackEnabled: readBoolean(
      candidate.browserFallbackEnabled,
      DEFAULT_WEBSITE_CHANNEL_CONFIG.browserFallbackEnabled,
      "browserFallbackEnabled"
    ),
    maxBrowserFetchesPerPoll: readPositiveInteger(
      candidate.maxBrowserFetchesPerPoll,
      DEFAULT_WEBSITE_CHANNEL_CONFIG.maxBrowserFetchesPerPoll,
      "maxBrowserFetchesPerPoll"
    ),
    allowedUrlPatterns: readStringList(
      candidate.allowedUrlPatterns,
      DEFAULT_WEBSITE_CHANNEL_CONFIG.allowedUrlPatterns,
      "allowedUrlPatterns"
    ),
    blockedUrlPatterns: readStringList(
      candidate.blockedUrlPatterns,
      DEFAULT_WEBSITE_CHANNEL_CONFIG.blockedUrlPatterns,
      "blockedUrlPatterns"
    ),
    collectionSeedUrls: readStringList(
      candidate.collectionSeedUrls,
      DEFAULT_WEBSITE_CHANNEL_CONFIG.collectionSeedUrls,
      "collectionSeedUrls"
    ),
    downloadPatterns: readStringList(
      candidate.downloadPatterns,
      DEFAULT_WEBSITE_CHANNEL_CONFIG.downloadPatterns,
      "downloadPatterns"
    ),
    crawlDelayMs: readPositiveInteger(
      candidate.crawlDelayMs,
      DEFAULT_WEBSITE_CHANNEL_CONFIG.crawlDelayMs,
      "crawlDelayMs"
    ),
    classification: {
      enableRoughPageTypeDetection: readBoolean(
        classification.enableRoughPageTypeDetection,
        DEFAULT_WEBSITE_CHANNEL_CONFIG.classification.enableRoughPageTypeDetection,
        "classification.enableRoughPageTypeDetection"
      ),
      minConfidenceForTypedExtraction: readNumberInRange(
        classification.minConfidenceForTypedExtraction,
        DEFAULT_WEBSITE_CHANNEL_CONFIG.classification.minConfidenceForTypedExtraction,
        "classification.minConfidenceForTypedExtraction",
        0,
        1
      )
    },
    curated: {
      preferCollectionDiscovery: readBoolean(
        curated.preferCollectionDiscovery,
        DEFAULT_WEBSITE_CHANNEL_CONFIG.curated.preferCollectionDiscovery,
        "curated.preferCollectionDiscovery"
      ),
      preferBrowserFallback: readBoolean(
        curated.preferBrowserFallback,
        DEFAULT_WEBSITE_CHANNEL_CONFIG.curated.preferBrowserFallback,
        "curated.preferBrowserFallback"
      ),
      editorialUrlPatterns: readStringList(
        curated.editorialUrlPatterns,
        DEFAULT_WEBSITE_CHANNEL_CONFIG.curated.editorialUrlPatterns,
        "curated.editorialUrlPatterns"
      ),
      listingUrlPatterns: readStringList(
        curated.listingUrlPatterns,
        DEFAULT_WEBSITE_CHANNEL_CONFIG.curated.listingUrlPatterns,
        "curated.listingUrlPatterns"
      ),
      entityUrlPatterns: readStringList(
        curated.entityUrlPatterns,
        DEFAULT_WEBSITE_CHANNEL_CONFIG.curated.entityUrlPatterns,
        "curated.entityUrlPatterns"
      ),
      documentUrlPatterns: readStringList(
        curated.documentUrlPatterns,
        DEFAULT_WEBSITE_CHANNEL_CONFIG.curated.documentUrlPatterns,
        "curated.documentUrlPatterns"
      ),
      dataFileUrlPatterns: readStringList(
        curated.dataFileUrlPatterns,
        DEFAULT_WEBSITE_CHANNEL_CONFIG.curated.dataFileUrlPatterns,
        "curated.dataFileUrlPatterns"
      )
    },
    extraction: {
      minEditorialBodyLength: readPositiveInteger(
        extraction.minEditorialBodyLength,
        DEFAULT_WEBSITE_CHANNEL_CONFIG.extraction.minEditorialBodyLength,
        "extraction.minEditorialBodyLength"
      ),
      allowInlineJsonExtraction: readBoolean(
        extraction.allowInlineJsonExtraction,
        DEFAULT_WEBSITE_CHANNEL_CONFIG.extraction.allowInlineJsonExtraction,
        "extraction.allowInlineJsonExtraction"
      ),
      allowBrowserNetworkCapture: readBoolean(
        extraction.allowBrowserNetworkCapture,
        DEFAULT_WEBSITE_CHANNEL_CONFIG.extraction.allowBrowserNetworkCapture,
        "extraction.allowBrowserNetworkCapture"
      ),
      extractTables: readBoolean(
        extraction.extractTables,
        DEFAULT_WEBSITE_CHANNEL_CONFIG.extraction.extractTables,
        "extraction.extractTables"
      ),
      extractDownloads: readBoolean(
        extraction.extractDownloads,
        DEFAULT_WEBSITE_CHANNEL_CONFIG.extraction.extractDownloads,
        "extraction.extractDownloads"
      )
    }
  };
}

export function parseApiChannelConfig(config: unknown): ApiChannelConfig {
  const candidate = asRecord(config);

  return {
    maxItemsPerPoll: readPositiveInteger(
      candidate.maxItemsPerPoll,
      DEFAULT_API_CHANNEL_CONFIG.maxItemsPerPoll,
      "maxItemsPerPoll"
    ),
    requestTimeoutMs: readPositiveInteger(
      candidate.requestTimeoutMs,
      DEFAULT_API_CHANNEL_CONFIG.requestTimeoutMs,
      "requestTimeoutMs"
    ),
    userAgent: readString(
      candidate.userAgent,
      DEFAULT_API_CHANNEL_CONFIG.userAgent,
      "userAgent"
    ),
    itemsPath: readString(candidate.itemsPath, DEFAULT_API_CHANNEL_CONFIG.itemsPath, "itemsPath"),
    titleField: readString(
      candidate.titleField,
      DEFAULT_API_CHANNEL_CONFIG.titleField,
      "titleField"
    ),
    leadField: readString(candidate.leadField, DEFAULT_API_CHANNEL_CONFIG.leadField, "leadField"),
    bodyField: readString(candidate.bodyField, DEFAULT_API_CHANNEL_CONFIG.bodyField, "bodyField"),
    urlField: readString(candidate.urlField, DEFAULT_API_CHANNEL_CONFIG.urlField, "urlField"),
    publishedAtField: readString(
      candidate.publishedAtField,
      DEFAULT_API_CHANNEL_CONFIG.publishedAtField,
      "publishedAtField"
    ),
    externalIdField: readString(
      candidate.externalIdField,
      DEFAULT_API_CHANNEL_CONFIG.externalIdField,
      "externalIdField"
    ),
    languageField: readString(
      candidate.languageField,
      DEFAULT_API_CHANNEL_CONFIG.languageField,
      "languageField"
    )
  };
}

export function parseEmailImapChannelConfig(config: unknown): EmailImapChannelConfig {
  const candidate = asRecord(config);

  return {
    host: readString(candidate.host, DEFAULT_EMAIL_IMAP_CHANNEL_CONFIG.host, "host"),
    port: readPositiveInteger(candidate.port, DEFAULT_EMAIL_IMAP_CHANNEL_CONFIG.port, "port"),
    secure: readBoolean(candidate.secure, DEFAULT_EMAIL_IMAP_CHANNEL_CONFIG.secure, "secure"),
    username: readString(
      candidate.username,
      DEFAULT_EMAIL_IMAP_CHANNEL_CONFIG.username,
      "username"
    ),
    password: readString(
      candidate.password,
      DEFAULT_EMAIL_IMAP_CHANNEL_CONFIG.password,
      "password"
    ),
    mailbox: readString(
      candidate.mailbox,
      DEFAULT_EMAIL_IMAP_CHANNEL_CONFIG.mailbox,
      "mailbox"
    ),
    searchFrom: readOptionalString(
      candidate.searchFrom,
      DEFAULT_EMAIL_IMAP_CHANNEL_CONFIG.searchFrom ?? null,
      "searchFrom"
    ),
    maxItemsPerPoll: readPositiveInteger(
      candidate.maxItemsPerPoll,
      DEFAULT_EMAIL_IMAP_CHANNEL_CONFIG.maxItemsPerPoll,
      "maxItemsPerPoll"
    )
  };
}

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
      return parseApiChannelConfig(config);
    default:
      throw new Error(`Unsupported provider type: ${String(providerType)}`);
  }
}

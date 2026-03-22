export type SourceProviderType = "rss" | "website" | "api" | "email_imap" | "youtube";

export interface RssChannelConfig {
  maxItemsPerPoll: number;
  requestTimeoutMs: number;
  userAgent: string;
  preferContentEncoded: boolean;
}

export interface RssAdminChannelInput {
  channelId?: string;
  providerType?: "rss";
  name: string;
  fetchUrl: string;
  language?: string | null;
  isActive?: boolean;
  pollIntervalSeconds?: number;
  maxItemsPerPoll?: number;
  requestTimeoutMs?: number;
  userAgent?: string;
  preferContentEncoded?: boolean;
}

export interface WebsiteChannelConfig {
  maxItemsPerPoll: number;
  requestTimeoutMs: number;
  userAgent: string;
  followLinks: boolean;
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
  preferContentEncoded: true
};

const DEFAULT_WEBSITE_CHANNEL_CONFIG: WebsiteChannelConfig = {
  maxItemsPerPoll: 20,
  requestTimeoutMs: 10000,
  userAgent: "NewsPortalFetchers/0.1 (+https://newsportal.local)",
  followLinks: false
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
    )
  };
}

export function parseWebsiteChannelConfig(config: unknown): WebsiteChannelConfig {
  const candidate = asRecord(config);

  return {
    maxItemsPerPoll: readPositiveInteger(
      candidate.maxItemsPerPoll,
      DEFAULT_WEBSITE_CHANNEL_CONFIG.maxItemsPerPoll,
      "maxItemsPerPoll"
    ),
    requestTimeoutMs: readPositiveInteger(
      candidate.requestTimeoutMs,
      DEFAULT_WEBSITE_CHANNEL_CONFIG.requestTimeoutMs,
      "requestTimeoutMs"
    ),
    userAgent: readString(
      candidate.userAgent,
      DEFAULT_WEBSITE_CHANNEL_CONFIG.userAgent,
      "userAgent"
    ),
    followLinks: readBoolean(
      candidate.followLinks,
      DEFAULT_WEBSITE_CHANNEL_CONFIG.followLinks,
      "followLinks"
    )
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

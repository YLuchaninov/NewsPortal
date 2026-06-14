import {
  API_ADAPTER_ACCESS_KINDS,
  API_ADAPTER_KEYS,
  API_ADAPTER_RESEARCH_MODES,
  API_ADAPTER_TOS_RISKS,
  DEFAULT_API_CHANNEL_CONFIG,
} from "./model";
import type {
  ApiAdapterAccessKind,
  ApiAdapterKey,
  ApiAdapterResearchMode,
  ApiAdapterTosRisk,
  ApiChannelConfig,
} from "./model";
import {
  asRecord,
  assertJsonCompatible,
  readBoolean,
  readOptionalString,
  readPositiveInteger,
  readString,
  readStringList,
  readStringOrStringList,
} from "./shared";

function readApiRequestMethod(value: unknown): ApiChannelConfig["requestMethod"] {
  if (value == null) {
    return DEFAULT_API_CHANNEL_CONFIG.requestMethod;
  }
  if (typeof value !== "string") {
    throw new Error('Source channel config field "requestMethod" must be a string.');
  }
  const normalized = value.trim().toUpperCase();
  if (normalized === "GET" || normalized === "POST") {
    return normalized;
  }
  throw new Error('Source channel config field "requestMethod" must be GET or POST.');
}

function readApiPaginationMode(value: unknown): ApiChannelConfig["pagination"]["mode"] {
  if (value == null) {
    return DEFAULT_API_CHANNEL_CONFIG.pagination.mode;
  }
  if (typeof value !== "string") {
    throw new Error('Source channel config field "pagination.mode" must be a string.');
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "none" || normalized === "next_url" || normalized === "page" || normalized === "cursor") {
    return normalized;
  }
  throw new Error('Source channel config field "pagination.mode" must be none, next_url, page, or cursor.');
}

function readApiResponseFormat(value: unknown): ApiChannelConfig["responseFormat"] {
  if (value == null) {
    return DEFAULT_API_CHANNEL_CONFIG.responseFormat;
  }
  if (typeof value !== "string") {
    throw new Error('Source channel config field "responseFormat" must be a string.');
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "json" || normalized === "ndjson") {
    return normalized;
  }
  throw new Error('Source channel config field "responseFormat" must be json or ndjson.');
}

function readApiAdapterEnum<T extends readonly string[]>(
  value: unknown,
  allowedValues: T,
  fallback: T[number] | null,
  fieldName: string
): T[number] | null {
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
  if ((allowedValues as readonly string[]).includes(normalized)) {
    return normalized as T[number];
  }
  throw new Error(
    `Source channel config field "${fieldName}" must be one of ${allowedValues.join(", ")}.`
  );
}

function readApiAdapterConfig(config: Record<string, unknown>): ApiChannelConfig["adapter"] {
  const nested = config.api != null ? asRecord(config.api) : {};
  const adapterSource =
    nested.adapterKey != null || nested.adapter != null
      ? nested
      : config.adapter != null
        ? asRecord(config.adapter)
        : config;
  const searchQuerySource =
    adapterSource.searchQuery != null
      ? asRecord(adapterSource.searchQuery)
      : nested.searchQuery != null
        ? asRecord(nested.searchQuery)
        : {};
  const adapterKey = readApiAdapterEnum(
    adapterSource.adapterKey,
    API_ADAPTER_KEYS,
    DEFAULT_API_CHANNEL_CONFIG.adapter.adapterKey,
    "adapterKey"
  ) as ApiAdapterKey | null;
  const researchMode = readApiAdapterEnum(
    adapterSource.researchMode,
    API_ADAPTER_RESEARCH_MODES,
    adapterKey && String(adapterKey).endsWith("_research") ? "research_only" : DEFAULT_API_CHANNEL_CONFIG.adapter.researchMode,
    "researchMode"
  ) as ApiAdapterResearchMode;
  const accessKind = readApiAdapterEnum(
    adapterSource.accessKind,
    API_ADAPTER_ACCESS_KINDS,
    DEFAULT_API_CHANNEL_CONFIG.adapter.accessKind,
    "accessKind"
  ) as ApiAdapterAccessKind | null;
  const tosRisk = readApiAdapterEnum(
    adapterSource.tosRisk,
    API_ADAPTER_TOS_RISKS,
    researchMode === "research_only" ? "high" : DEFAULT_API_CHANNEL_CONFIG.adapter.tosRisk,
    "tosRisk"
  ) as ApiAdapterTosRisk;

  return {
    adapterKey,
    researchMode,
    accessKind,
    sourceRole: readOptionalString(
      adapterSource.sourceRole,
      DEFAULT_API_CHANNEL_CONFIG.adapter.sourceRole,
      "sourceRole"
    ),
    contentKind: readOptionalString(
      adapterSource.contentKind,
      DEFAULT_API_CHANNEL_CONFIG.adapter.contentKind,
      "contentKind"
    ),
    query: readOptionalString(adapterSource.query, DEFAULT_API_CHANNEL_CONFIG.adapter.query, "query"),
    platform: readOptionalString(
      adapterSource.platform,
      DEFAULT_API_CHANNEL_CONFIG.adapter.platform,
      "platform"
    ),
    searchQuery: {
      query:
        readOptionalString(searchQuerySource.query, null, "searchQuery.query") ??
        readOptionalString(adapterSource.query, DEFAULT_API_CHANNEL_CONFIG.adapter.searchQuery.query, "query"),
      platform:
        readOptionalString(searchQuerySource.platform, null, "searchQuery.platform") ??
        readOptionalString(adapterSource.platform, DEFAULT_API_CHANNEL_CONFIG.adapter.searchQuery.platform, "platform"),
      siteFilter: readOptionalString(
        searchQuerySource.siteFilter,
        DEFAULT_API_CHANNEL_CONFIG.adapter.searchQuery.siteFilter,
        "searchQuery.siteFilter"
      ),
      locale: readOptionalString(
        searchQuerySource.locale,
        DEFAULT_API_CHANNEL_CONFIG.adapter.searchQuery.locale,
        "searchQuery.locale"
      ),
      timeRange: readOptionalString(
        searchQuerySource.timeRange,
        DEFAULT_API_CHANNEL_CONFIG.adapter.searchQuery.timeRange,
        "searchQuery.timeRange"
      ),
      maxResults: readPositiveInteger(
        searchQuerySource.maxResults,
        DEFAULT_API_CHANNEL_CONFIG.adapter.searchQuery.maxResults,
        "searchQuery.maxResults"
      ),
      searchProvider: readOptionalString(
        searchQuerySource.searchProvider,
        DEFAULT_API_CHANNEL_CONFIG.adapter.searchQuery.searchProvider,
        "searchQuery.searchProvider"
      ),
      directCoverage: readBoolean(
        searchQuerySource.directCoverage,
        DEFAULT_API_CHANNEL_CONFIG.adapter.searchQuery.directCoverage,
        "searchQuery.directCoverage"
      )
    },
    organization: readOptionalString(
      adapterSource.organization,
      DEFAULT_API_CHANNEL_CONFIG.adapter.organization,
      "organization"
    ),
    tags: readStringList(adapterSource.tags, DEFAULT_API_CHANNEL_CONFIG.adapter.tags, "tags"),
    githubEvidence: Array.isArray(adapterSource.githubEvidence)
      ? adapterSource.githubEvidence.map((item, index) =>
          assertJsonCompatible(item, `githubEvidence[${index}]`)
        )
      : [...DEFAULT_API_CHANNEL_CONFIG.adapter.githubEvidence],
    tosRisk,
    requiresProductionReplacement: readBoolean(
      adapterSource.requiresProductionReplacement,
      researchMode === "research_only",
      "requiresProductionReplacement"
    )
  };
}

const API_REQUEST_HEADER_BLOCKLIST = new Set([
  "authorization",
  "cookie",
  "host",
  "content-length",
  "connection",
  "user-agent",
  "accept",
]);

function readApiRequestHeaders(value: unknown): Record<string, string> {
  if (value == null) {
    return { ...DEFAULT_API_CHANNEL_CONFIG.requestHeaders };
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error('Source channel config field "requestHeaders" must be an object.');
  }
  const headers: Record<string, string> = {};
  for (const [rawName, rawValue] of Object.entries(value as Record<string, unknown>)) {
    const name = rawName.trim().toLowerCase();
    if (!name) {
      throw new Error('Source channel config field "requestHeaders" must not include empty names.');
    }
    if (API_REQUEST_HEADER_BLOCKLIST.has(name)) {
      throw new Error(`Source channel config request header "${rawName}" is managed by SignalOps.`);
    }
    if (typeof rawValue !== "string") {
      throw new Error(`Source channel config request header "${rawName}" must be a string.`);
    }
    const headerValue = rawValue.trim();
    if (!headerValue) {
      throw new Error(`Source channel config request header "${rawName}" must not be empty.`);
    }
    headers[name] = headerValue;
  }
  return headers;
}

export function parseApiChannelConfig(config: unknown): ApiChannelConfig {
  const candidate = asRecord(config);
  const pagination = asRecord(candidate.pagination);

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
    requestMethod: readApiRequestMethod(candidate.requestMethod),
    requestHeaders: readApiRequestHeaders(candidate.requestHeaders),
    requestBodyJson:
      candidate.requestBodyJson === undefined
        ? DEFAULT_API_CHANNEL_CONFIG.requestBodyJson
        : assertJsonCompatible(candidate.requestBodyJson, "requestBodyJson"),
    responseFormat: readApiResponseFormat(candidate.responseFormat),
    pagination: {
      mode: readApiPaginationMode(pagination.mode),
      nextUrlPath: readString(
        pagination.nextUrlPath,
        DEFAULT_API_CHANNEL_CONFIG.pagination.nextUrlPath,
        "pagination.nextUrlPath"
      ),
      pageParam: readString(
        pagination.pageParam,
        DEFAULT_API_CHANNEL_CONFIG.pagination.pageParam,
        "pagination.pageParam"
      ),
      pageStart: readPositiveInteger(
        pagination.pageStart,
        DEFAULT_API_CHANNEL_CONFIG.pagination.pageStart,
        "pagination.pageStart"
      ),
      cursorParam: readString(
        pagination.cursorParam,
        DEFAULT_API_CHANNEL_CONFIG.pagination.cursorParam,
        "pagination.cursorParam"
      ),
      cursorPath: readString(
        pagination.cursorPath,
        DEFAULT_API_CHANNEL_CONFIG.pagination.cursorPath,
        "pagination.cursorPath"
      ),
      maxPagesPerPoll: Math.min(
        10,
        readPositiveInteger(
          pagination.maxPagesPerPoll,
          DEFAULT_API_CHANNEL_CONFIG.pagination.maxPagesPerPoll,
          "pagination.maxPagesPerPoll"
        )
      )
    },
    itemsPath: readString(candidate.itemsPath, DEFAULT_API_CHANNEL_CONFIG.itemsPath, "itemsPath"),
    titleField: readStringOrStringList(
      candidate.titleField,
      DEFAULT_API_CHANNEL_CONFIG.titleField,
      "titleField"
    ),
    leadField: readStringOrStringList(candidate.leadField, DEFAULT_API_CHANNEL_CONFIG.leadField, "leadField"),
    bodyField: readStringOrStringList(candidate.bodyField, DEFAULT_API_CHANNEL_CONFIG.bodyField, "bodyField"),
    urlField: readStringOrStringList(candidate.urlField, DEFAULT_API_CHANNEL_CONFIG.urlField, "urlField"),
    urlTemplate: readOptionalString(
      candidate.urlTemplate,
      DEFAULT_API_CHANNEL_CONFIG.urlTemplate,
      "urlTemplate"
    ),
    publishedAtField: readStringOrStringList(
      candidate.publishedAtField,
      DEFAULT_API_CHANNEL_CONFIG.publishedAtField,
      "publishedAtField"
    ),
    externalIdField: readStringOrStringList(
      candidate.externalIdField,
      DEFAULT_API_CHANNEL_CONFIG.externalIdField,
      "externalIdField"
    ),
    languageField: readStringOrStringList(
      candidate.languageField,
      DEFAULT_API_CHANNEL_CONFIG.languageField,
      "languageField"
    ),
    adapter: readApiAdapterConfig(candidate)
  };
}

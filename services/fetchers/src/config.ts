export interface FetchersConfig {
  databaseUrl: string;
  fetchersPort: number;
  fetchersPollIntervalMs: number;
  fetchersBatchSize: number;
  fetchersConcurrency: number;
  defaultRequestTimeoutMs: number;
  defaultUserAgent: string;
  enrichmentEnabled: boolean;
  enrichmentConcurrency: number;
  enrichmentTimeoutMs: number;
  enrichmentUserAgent: string;
  enrichmentMaxOembedPerArticle: number;
  enrichmentOembedTimeoutMs: number;
  enrichmentPerDomainConcurrency: number;
  enrichmentPerDomainMinIntervalMs: number;
}

function readNumber(name: string, fallback: number): number {
  const rawValue = process.env[name];

  if (!rawValue) {
    return fallback;
  }

  const parsed = Number(rawValue);

  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be a number.`);
  }

  return parsed;
}

function readBoolean(name: string, fallback: boolean): boolean {
  const rawValue = process.env[name];
  if (!rawValue) {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(rawValue.trim().toLowerCase());
}

function buildPostgresUrl(): string {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const user = process.env.POSTGRES_USER ?? "newsportal";
  const password = process.env.POSTGRES_PASSWORD ?? "newsportal";
  const host = process.env.POSTGRES_HOST ?? "127.0.0.1";
  const port =
    process.env.POSTGRES_PORT ??
    (host === "127.0.0.1" || host === "localhost" ? "55432" : "5432");
  const database = process.env.POSTGRES_DB ?? "newsportal";

  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
}

export function loadFetchersConfig(): FetchersConfig {
  const defaultUserAgent =
    process.env.FETCHERS_USER_AGENT ??
    "NewsPortalFetchers/0.1 (+https://newsportal.local)";

  return {
    databaseUrl: buildPostgresUrl(),
    fetchersPort: readNumber("FETCHERS_PORT", 4100),
    fetchersPollIntervalMs: readNumber("FETCHERS_POLL_INTERVAL_MS", 5000),
    fetchersBatchSize: readNumber("FETCHERS_BATCH_SIZE", 100),
    fetchersConcurrency: Math.max(1, Math.floor(readNumber("FETCHERS_CONCURRENCY", 4))),
    defaultRequestTimeoutMs: readNumber("FETCHERS_REQUEST_TIMEOUT_MS", 10000),
    defaultUserAgent,
    enrichmentEnabled: readBoolean("ENRICHMENT_ENABLED", true),
    enrichmentConcurrency: Math.max(1, Math.floor(readNumber("ENRICHMENT_CONCURRENCY", 5))),
    enrichmentTimeoutMs: readNumber("ENRICHMENT_TIMEOUT_MS", 15000),
    enrichmentUserAgent: process.env.ENRICHMENT_USER_AGENT ?? defaultUserAgent,
    enrichmentMaxOembedPerArticle: Math.max(
      1,
      Math.floor(readNumber("ENRICHMENT_MAX_OEMBED_PER_ARTICLE", 3))
    ),
    enrichmentOembedTimeoutMs: readNumber("ENRICHMENT_OEMBED_TIMEOUT_MS", 10000),
    enrichmentPerDomainConcurrency: Math.max(
      1,
      Math.floor(readNumber("ENRICHMENT_PER_DOMAIN_CONCURRENCY", 2))
    ),
    enrichmentPerDomainMinIntervalMs: Math.max(
      0,
      Math.floor(readNumber("ENRICHMENT_PER_DOMAIN_MIN_INTERVAL_MS", 1000))
    )
  };
}

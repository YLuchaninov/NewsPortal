import { SafeSearchType, SearchTimeType, search, searchNews } from "duck-duck-scrape";
import type { SearchOptions, SearchResults } from "duck-duck-scrape/lib/search/search";
import type { NewsSearchOptions, NewsSearchResults } from "duck-duck-scrape/lib/search/news";

import { normalizeWhitespace } from "./fetcher-channel-helpers";

export interface DirectDdgsSearchRequest {
  query: string;
  maxResults: number;
  resultType?: "text" | "news";
  timeRange?: string | null;
  locale?: string | null;
}

export interface DirectDdgsSearchPayload {
  results: Array<Record<string, unknown>>;
  meta: {
    provider: "ddgs";
    execution: "fetchers_direct";
    implementation: "duck-duck-scrape";
    resultType: "text" | "news";
    timeRange: string | null;
    locale: string;
    cost_cents: 0;
  };
}

export interface DirectDdgsSearchClient {
  search: (query: string, options?: SearchOptions) => Promise<SearchResults>;
  searchNews: (query: string, options?: NewsSearchOptions) => Promise<NewsSearchResults>;
}

const DEFAULT_DDGS_CLIENT: DirectDdgsSearchClient = {
  search,
  searchNews,
};

function normalizeTimeRange(value: string | null | undefined): SearchTimeType | undefined {
  switch (String(value ?? "").trim().toLowerCase()) {
    case "day":
    case "d":
      return SearchTimeType.DAY;
    case "week":
    case "w":
      return SearchTimeType.WEEK;
    case "month":
    case "mo":
    case "m":
      return SearchTimeType.MONTH;
    case "year":
    case "y":
      return SearchTimeType.YEAR;
    default:
      return undefined;
  }
}

function normalizeLocale(value: string | null | undefined): string {
  return normalizeWhitespace(value ?? "") || "en-us";
}

function readMaxResults(value: number): number {
  return Math.max(1, Math.min(20, Math.trunc(Number.isFinite(value) ? value : 10)));
}

function stripHtml(value: unknown): string {
  return normalizeWhitespace(String(value ?? "").replace(/<[^>]*>/gu, " "));
}

function readPublishedAt(value: number): string | null {
  const maybeMillis = value < 10_000_000_000 ? value * 1000 : value;
  const date = new Date(maybeMillis);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function fetchDirectDdgsSearchPayload(
  request: DirectDdgsSearchRequest,
  client: DirectDdgsSearchClient = DEFAULT_DDGS_CLIENT,
): Promise<DirectDdgsSearchPayload> {
  const query = normalizeWhitespace(request.query);
  if (!query) {
    return {
      results: [],
      meta: {
        provider: "ddgs",
        execution: "fetchers_direct",
        implementation: "duck-duck-scrape",
        resultType: request.resultType ?? "text",
        timeRange: request.timeRange ?? null,
        locale: normalizeLocale(request.locale),
        cost_cents: 0,
      },
    };
  }

  const maxResults = readMaxResults(request.maxResults);
  const locale = normalizeLocale(request.locale);
  const time = normalizeTimeRange(request.timeRange);
  const resultType = request.resultType === "news" ? "news" : "text";
  const common = {
    safeSearch: SafeSearchType.MODERATE,
    locale,
    ...(time ? { time } : {}),
  };

  if (resultType === "news") {
    const payload = await client.searchNews(query, common);
    return {
      results: payload.results.slice(0, maxResults).map((item, index) => ({
        title: item.title,
        url: item.url,
        snippet: stripHtml(item.excerpt),
        body: stripHtml(item.excerpt),
        source: item.syndicate,
        published_at: readPublishedAt(item.date),
        provider_rank: index + 1,
      })),
      meta: {
        provider: "ddgs",
        execution: "fetchers_direct",
        implementation: "duck-duck-scrape",
        resultType,
        timeRange: request.timeRange ?? null,
        locale,
        cost_cents: 0,
      },
    };
  }

  const payload = await client.search(query, common);
  return {
    results: payload.results.slice(0, maxResults).map((item, index) => ({
      title: item.title,
      url: item.url,
      snippet: stripHtml(item.rawDescription || item.description),
      body: stripHtml(item.rawDescription || item.description),
      source: item.hostname,
      published_at: null,
      provider_rank: index + 1,
    })),
    meta: {
      provider: "ddgs",
      execution: "fetchers_direct",
      implementation: "duck-duck-scrape",
      resultType,
      timeRange: request.timeRange ?? null,
      locale,
      cost_cents: 0,
    },
  };
}

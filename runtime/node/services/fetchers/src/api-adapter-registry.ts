import type { ApiAdapterKey, ApiChannelConfig } from "@signalops/contracts";

import type { SourceChannelRow } from "./fetcher-persistence";
import { normalizeWhitespace } from "./fetcher-channel-helpers";
import {
  fetchDirectDdgsSearchPayload,
  type DirectDdgsSearchPayload,
  type DirectDdgsSearchRequest,
} from "./ddgs-direct-search";

export interface ApiAdapterFetchedItem {
  externalSignalCandidateId: string;
  url: string;
  publishedAt: string;
  title: string;
  lead: string;
  body: string;
  lang: string | null;
  rawPayload: Record<string, unknown>;
}

export interface ApiAdapterContext {
  channel: SourceChannelRow;
  apiConfig: ApiChannelConfig;
  fetchedAt: string;
  fetchJson: (url?: string) => Promise<unknown>;
  fetchText: (url?: string) => Promise<{ text: string; finalUrl: string; status: number }>;
  fetchSearch?: (request: DirectDdgsSearchRequest) => Promise<DirectDdgsSearchPayload>;
}

const OFFICIAL_JSON_ADAPTERS = new Set<ApiAdapterKey>([
  "hn_algolia_search",
  "github_issues_search",
  "stack_exchange_search",
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
]);

const RESEARCH_HTML_ADAPTERS = new Set<ApiAdapterKey>([
  "peopleperhour_public_projects_research",
  "freelancer_public_projects_research",
  "guru_public_projects_research",
  "malt_public_projects_research",
  "contra_public_search_research",
  "upwork_public_signal_research",
  "linkedin_public_signal_research",
]);

function asRecord(value: unknown): Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is Record<string, unknown> => {
        return entry != null && typeof entry === "object" && !Array.isArray(entry);
      })
    : [];
}

function readString(value: unknown): string {
  return normalizeWhitespace(String(value ?? ""));
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    const normalized = readString(value);
    if (normalized) {
      return normalized;
    }
  }
  return "";
}

function readDate(value: unknown, fallback: string): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    const maybeSeconds = value < 10_000_000_000 ? value * 1000 : value;
    const date = new Date(maybeSeconds);
    return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
  }
  const raw = readString(value);
  if (!raw) {
    return fallback;
  }
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

function stripHtml(value: unknown): string {
  return readString(String(value ?? "").replace(/<[^>]*>/gu, " "));
}

function resolveUrl(rawUrl: string, baseUrl: string): string | null {
  try {
    return new URL(rawUrl, baseUrl).toString();
  } catch {
    return null;
  }
}

function buildRawPayload(
  adapterKey: ApiAdapterKey,
  apiConfig: ApiChannelConfig,
  sourceItem: unknown,
  extra: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    fetcher: "api_adapter",
    adapterKey,
    researchMode: apiConfig.adapter.researchMode,
    accessKind: apiConfig.adapter.accessKind,
    sourceRole: apiConfig.adapter.sourceRole,
    contentKind: apiConfig.adapter.contentKind,
    tosRisk: apiConfig.adapter.tosRisk,
    requiresProductionReplacement: apiConfig.adapter.requiresProductionReplacement,
    sourceItem,
    ...extra,
  };
}

function buildSearchRawPayload(
  adapterKey: ApiAdapterKey,
  apiConfig: ApiChannelConfig,
  sourceItem: unknown,
  extra: Record<string, unknown> = {}
): Record<string, unknown> {
  return buildRawPayload(adapterKey, apiConfig, sourceItem, {
    directCoverage: apiConfig.adapter.searchQuery.directCoverage,
    searchQuery: {
      query: apiConfig.adapter.searchQuery.query ?? apiConfig.adapter.query,
      platform: apiConfig.adapter.searchQuery.platform ?? apiConfig.adapter.platform,
      siteFilter: apiConfig.adapter.searchQuery.siteFilter,
      locale: apiConfig.adapter.searchQuery.locale,
      timeRange: apiConfig.adapter.searchQuery.timeRange,
      maxResults: apiConfig.adapter.searchQuery.maxResults,
      searchProvider: apiConfig.adapter.searchQuery.searchProvider ?? adapterKey,
    },
    ...extra,
  });
}

function normalizeJsonItem(input: {
  adapterKey: ApiAdapterKey;
  apiConfig: ApiChannelConfig;
  fetchedAt: string;
  item: Record<string, unknown>;
  baseUrl: string;
  id: unknown;
  title: unknown;
  url: unknown;
  publishedAt?: unknown;
  lead?: unknown;
  body?: unknown;
  lang?: unknown;
  extra?: Record<string, unknown>;
}): ApiAdapterFetchedItem | null {
  const url = resolveUrl(readString(input.url), input.baseUrl);
  const title = firstString(input.title, "Untitled listing");
  if (!url || !title) {
    return null;
  }
  const id = firstString(input.id, url);
  return {
    externalSignalCandidateId: `${input.adapterKey}:${id}`,
    url,
    publishedAt: readDate(input.publishedAt, input.fetchedAt),
    title,
    lead: readString(input.lead),
    body: stripHtml(input.body),
    lang: readString(input.lang) || null,
    rawPayload: buildRawPayload(input.adapterKey, input.apiConfig, input.item, input.extra),
  };
}

function normalizeHn(payload: unknown, context: ApiAdapterContext): ApiAdapterFetchedItem[] {
  const hits = asRecordArray(asRecord(payload).hits);
  return hits
    .map((item) =>
      normalizeJsonItem({
        adapterKey: "hn_algolia_search",
        apiConfig: context.apiConfig,
        fetchedAt: context.fetchedAt,
        item,
        baseUrl: context.channel.fetchUrl ?? "https://hn.algolia.com/",
        id: item.objectID,
        title: firstString(item.title, item.story_title),
        url:
          firstString(item.url, item.story_url) ||
          `https://news.ycombinator.com/item?id=${readString(item.objectID)}`,
        publishedAt: item.created_at,
        lead: item.author,
        body: firstString(item.comment_text, item.story_text),
      })
    )
    .filter((item): item is ApiAdapterFetchedItem => Boolean(item));
}

function normalizeStackExchange(payload: unknown, context: ApiAdapterContext): ApiAdapterFetchedItem[] {
  return asRecordArray(asRecord(payload).items)
    .map((item) =>
      normalizeJsonItem({
        adapterKey: "stack_exchange_search",
        apiConfig: context.apiConfig,
        fetchedAt: context.fetchedAt,
        item,
        baseUrl: context.channel.fetchUrl ?? "https://api.stackexchange.com/",
        id: item.question_id,
        title: item.title,
        url: item.link,
        publishedAt: item.creation_date,
        lead: Array.isArray(item.tags) ? item.tags.join(", ") : "",
        body: item.body,
        extra: { tags: Array.isArray(item.tags) ? item.tags : [] },
      })
    )
    .filter((item): item is ApiAdapterFetchedItem => Boolean(item));
}

function normalizeGitHubIssues(payload: unknown, context: ApiAdapterContext): ApiAdapterFetchedItem[] {
  return asRecordArray(asRecord(payload).items)
    .map((item) => {
      const user = asRecord(item.user);
      const labels = asRecordArray(item.labels).map((label) => readString(label.name)).filter(Boolean);
      return normalizeJsonItem({
        adapterKey: "github_issues_search",
        apiConfig: context.apiConfig,
        fetchedAt: context.fetchedAt,
        item,
        baseUrl: context.channel.fetchUrl ?? "https://api.github.com/",
        id: firstString(item.id, item.node_id, item.html_url),
        title: item.title,
        url: item.html_url,
        publishedAt: firstString(item.created_at, item.updated_at),
        lead: firstString(user.login, labels.join(", ")),
        body: item.body,
        extra: { labels, repositoryUrl: item.repository_url ?? null },
      });
    })
    .filter((item): item is ApiAdapterFetchedItem => Boolean(item));
}

function normalizeGreenhouse(payload: unknown, context: ApiAdapterContext): ApiAdapterFetchedItem[] {
  return asRecordArray(asRecord(payload).jobs)
    .map((item) =>
      normalizeJsonItem({
        adapterKey: "greenhouse_job_board",
        apiConfig: context.apiConfig,
        fetchedAt: context.fetchedAt,
        item,
        baseUrl: context.channel.fetchUrl ?? "https://boards-api.greenhouse.io/",
        id: item.id,
        title: item.title,
        url: item.absolute_url,
        publishedAt: firstString(item.updated_at, item.created_at),
        lead: item.location != null ? JSON.stringify(item.location) : "",
        body: item.content,
      })
    )
    .filter((item): item is ApiAdapterFetchedItem => Boolean(item));
}

function normalizeLever(payload: unknown, context: ApiAdapterContext): ApiAdapterFetchedItem[] {
  return asRecordArray(payload)
    .map((item) =>
      normalizeJsonItem({
        adapterKey: "lever_postings",
        apiConfig: context.apiConfig,
        fetchedAt: context.fetchedAt,
        item,
        baseUrl: context.channel.fetchUrl ?? "https://api.lever.co/",
        id: item.id,
        title: item.text,
        url: firstString(item.hostedUrl, item.applyUrl),
        publishedAt: item.createdAt,
        lead: item.categories != null ? JSON.stringify(item.categories) : "",
        body: firstString(item.descriptionPlain, item.description),
      })
    )
    .filter((item): item is ApiAdapterFetchedItem => Boolean(item));
}

function normalizeAshby(payload: unknown, context: ApiAdapterContext): ApiAdapterFetchedItem[] {
  const jobs = asRecordArray(asRecord(payload).jobs);
  return jobs
    .map((item) =>
      normalizeJsonItem({
        adapterKey: "ashby_job_postings",
        apiConfig: context.apiConfig,
        fetchedAt: context.fetchedAt,
        item,
        baseUrl: context.channel.fetchUrl ?? "https://api.ashbyhq.com/",
        id: item.id,
        title: item.title,
        url: firstString(item.jobUrl, item.applyUrl),
        publishedAt: firstString(item.publishedDate, item.updatedAt),
        lead: item.locationName,
        body: firstString(item.descriptionPlain, item.descriptionHtml),
      })
    )
    .filter((item): item is ApiAdapterFetchedItem => Boolean(item));
}

function normalizeRemotive(payload: unknown, context: ApiAdapterContext): ApiAdapterFetchedItem[] {
  return asRecordArray(asRecord(payload).jobs)
    .map((item) =>
      normalizeJsonItem({
        adapterKey: "remotive_jobs",
        apiConfig: context.apiConfig,
        fetchedAt: context.fetchedAt,
        item,
        baseUrl: context.channel.fetchUrl ?? "https://remotive.com/",
        id: item.id,
        title: firstString(item.title, item.position),
        url: item.url,
        publishedAt: item.publication_date,
        lead: firstString(item.company_name, item.category),
        body: item.description,
      })
    )
    .filter((item): item is ApiAdapterFetchedItem => Boolean(item));
}

function normalizeRemoteOk(payload: unknown, context: ApiAdapterContext): ApiAdapterFetchedItem[] {
  return asRecordArray(payload)
    .filter((item) => item.id != null || item.slug != null)
    .map((item) =>
      normalizeJsonItem({
        adapterKey: "remoteok_jobs",
        apiConfig: context.apiConfig,
        fetchedAt: context.fetchedAt,
        item,
        baseUrl: context.channel.fetchUrl ?? "https://remoteok.com/",
        id: firstString(item.id, item.slug, item.url),
        title: firstString(item.position, item.title),
        url: firstString(item.url, item.apply_url),
        publishedAt: firstString(item.date, item.epoch),
        lead: firstString(item.company, item.location),
        body: firstString(item.description, item.tags),
      })
    )
    .filter((item): item is ApiAdapterFetchedItem => Boolean(item));
}

function normalizeSearchResult(input: {
  adapterKey: ApiAdapterKey;
  context: ApiAdapterContext;
  item: Record<string, unknown>;
  rank: number;
  baseUrl: string;
  id?: unknown;
  title: unknown;
  url: unknown;
  publishedAt?: unknown;
  snippet?: unknown;
  body?: unknown;
  extra?: Record<string, unknown>;
}): ApiAdapterFetchedItem | null {
  const url = resolveUrl(readString(input.url), input.baseUrl);
  const title = firstString(input.title, input.url);
  if (!url || !title || isSearchAdClickUrl(url)) {
    return null;
  }
  return {
    externalSignalCandidateId: `${input.adapterKey}:${firstString(input.id, url)}`,
    url,
    publishedAt: readDate(input.publishedAt, input.context.fetchedAt),
    title,
    lead: readString(input.snippet),
    body: stripHtml(firstString(input.body, input.snippet)),
    lang: input.context.channel.language ?? null,
    rawPayload: buildSearchRawPayload(input.adapterKey, input.context.apiConfig, input.item, {
      resultRank: input.rank,
      providerResultUrl: url,
      ...input.extra,
    }),
  };
}

function isSearchAdClickUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase();
    return (
      (hostname.endsWith("bing.com") && path === "/aclick")
      || hostname.endsWith("googleadservices.com")
      || hostname.endsWith("doubleclick.net")
    );
  } catch {
    return false;
  }
}

function normalizeSearxng(payload: unknown, context: ApiAdapterContext): ApiAdapterFetchedItem[] {
  return asRecordArray(asRecord(payload).results)
    .slice(0, context.apiConfig.adapter.searchQuery.maxResults)
    .map((item, index) =>
      normalizeSearchResult({
        adapterKey: "searxng_search",
        context,
        item,
        rank: index + 1,
        baseUrl: context.channel.fetchUrl ?? "https://searx.local/",
        id: firstString(item.url, item.parsed_url),
        title: item.title,
        url: item.url,
        publishedAt: firstString(item.publishedDate, item.published_date),
        snippet: firstString(item.content, item.snippet),
        body: firstString(item.content, item.snippet),
        extra: { engine: item.engine ?? null, category: item.category ?? null },
      })
    )
    .filter((item): item is ApiAdapterFetchedItem => Boolean(item));
}

function normalizeDdgsSearch(payload: unknown, context: ApiAdapterContext): ApiAdapterFetchedItem[] {
  return asRecordArray(asRecord(payload).results)
    .slice(0, context.apiConfig.adapter.searchQuery.maxResults)
    .map((item, index) =>
      normalizeSearchResult({
        adapterKey: "ddgs_search",
        context,
        item,
        rank: index + 1,
        baseUrl: context.channel.fetchUrl ?? "https://duckduckgo.com/",
        id: firstString(item.url, item.provider_rank),
        title: item.title,
        url: item.url,
        publishedAt: firstString(item.published_at, item.publishedAt),
        snippet: firstString(item.snippet, item.body),
        body: firstString(item.snippet, item.body),
        extra: {
          source: item.source ?? null,
          ddgsProviderRank: item.provider_rank ?? null,
          ddgsMeta: asRecord(payload).meta ?? null,
        },
      })
    )
    .filter((item): item is ApiAdapterFetchedItem => Boolean(item));
}

function normalizeBraveSearch(payload: unknown, context: ApiAdapterContext): ApiAdapterFetchedItem[] {
  const root = asRecord(payload);
  const web = asRecordArray(asRecord(root.web).results);
  const news = asRecordArray(asRecord(root.news).results);
  return [...web, ...news]
    .slice(0, context.apiConfig.adapter.searchQuery.maxResults)
    .map((item, index) =>
      normalizeSearchResult({
        adapterKey: "brave_search",
        context,
        item,
        rank: index + 1,
        baseUrl: context.channel.fetchUrl ?? "https://api.search.brave.com/",
        id: firstString(item.url, item.profile),
        title: item.title,
        url: item.url,
        publishedAt: firstString(item.age, item.page_age),
        snippet: firstString(item.description, item.extra_snippets),
        body: firstString(item.description, item.extra_snippets),
        extra: { familyFriendly: item.family_friendly ?? null },
      })
    )
    .filter((item): item is ApiAdapterFetchedItem => Boolean(item));
}

function normalizeTavilySearch(payload: unknown, context: ApiAdapterContext): ApiAdapterFetchedItem[] {
  return asRecordArray(asRecord(payload).results)
    .slice(0, context.apiConfig.adapter.searchQuery.maxResults)
    .map((item, index) =>
      normalizeSearchResult({
        adapterKey: "tavily_search",
        context,
        item,
        rank: index + 1,
        baseUrl: context.channel.fetchUrl ?? "https://api.tavily.com/",
        id: item.url,
        title: item.title,
        url: item.url,
        publishedAt: firstString(item.published_date, item.publishedAt),
        snippet: item.content,
        body: firstString(item.raw_content, item.content),
        extra: { score: item.score ?? null },
      })
    )
    .filter((item): item is ApiAdapterFetchedItem => Boolean(item));
}

function normalizeExaSearch(payload: unknown, context: ApiAdapterContext): ApiAdapterFetchedItem[] {
  return asRecordArray(asRecord(payload).results)
    .slice(0, context.apiConfig.adapter.searchQuery.maxResults)
    .map((item, index) =>
      normalizeSearchResult({
        adapterKey: "exa_search",
        context,
        item,
        rank: index + 1,
        baseUrl: context.channel.fetchUrl ?? "https://api.exa.ai/",
        id: firstString(item.id, item.url),
        title: item.title,
        url: item.url,
        publishedAt: firstString(item.publishedDate, item.published_at),
        snippet: Array.isArray(item.highlights) ? item.highlights.join(" ") : item.text,
        body: firstString(item.text, Array.isArray(item.highlights) ? item.highlights.join(" ") : ""),
        extra: { score: item.score ?? null, author: item.author ?? null },
      })
    )
    .filter((item): item is ApiAdapterFetchedItem => Boolean(item));
}

function normalizeSerpApiGoogleNews(payload: unknown, context: ApiAdapterContext): ApiAdapterFetchedItem[] {
  return asRecordArray(asRecord(payload).news_results)
    .slice(0, context.apiConfig.adapter.searchQuery.maxResults)
    .map((item, index) =>
      normalizeSearchResult({
        adapterKey: "serpapi_google_news_research",
        context,
        item,
        rank: index + 1,
        baseUrl: context.channel.fetchUrl ?? "https://serpapi.com/",
        id: firstString(item.link, item.position),
        title: item.title,
        url: item.link,
        publishedAt: firstString(item.date, item.created_at),
        snippet: firstString(item.snippet, item.source),
        body: firstString(item.snippet, item.source),
        extra: { source: item.source ?? null, position: item.position ?? index + 1 },
      })
    )
    .filter((item): item is ApiAdapterFetchedItem => Boolean(item));
}

function normalizeDiscourseSearch(payload: unknown, context: ApiAdapterContext): ApiAdapterFetchedItem[] {
  const topics = asRecordArray(asRecord(payload).topics);
  return topics
    .slice(0, context.apiConfig.adapter.searchQuery.maxResults)
    .map((item, index) => {
      const id = firstString(item.id, item.slug);
      const slug = readString(item.slug);
      const url = firstString(
        item.url,
        id && slug ? `/t/${slug}/${id}` : id ? `/t/${id}` : ""
      );
      return normalizeSearchResult({
        adapterKey: "discourse_search",
        context,
        item,
        rank: index + 1,
        baseUrl: context.channel.fetchUrl ?? "https://discourse.local/",
        id,
        title: item.title,
        url,
        publishedAt: firstString(item.created_at, item.last_posted_at, item.bumped_at),
        snippet: firstString(item.excerpt, item.blurb),
        body: firstString(item.excerpt, item.blurb),
        extra: { postsCount: item.posts_count ?? null, categoryId: item.category_id ?? null },
      });
    })
    .filter((item): item is ApiAdapterFetchedItem => Boolean(item));
}

function classifyProjectLink(input: {
  adapterKey: ApiAdapterKey;
  url: string;
  title: string;
  surrounding: string;
}): { accepted: boolean; confidence: number; reason: string } {
  const url = input.url.toLowerCase();
  const text = `${input.title} ${stripHtml(input.surrounding)}`.toLowerCase();
  const rejectUrl =
    /(?:\/(?:category|categories|search|find|browse|login|signin|signup|register|profile|profiles|user|users|freelancers|talent|how-it-works|about|help|support|blog|tags?)(?:\/|$)|[?&](?:category|page|sort|filter)=)/u.test(url)
    || isPeoplePerHourCategoryUrl(input.url);
  const rejectTitle =
    /^(?:data science|cms development|technology|ai services|social media|business|writing|marketing|video|music|browse|search|sign in|log in)$/iu.test(input.title.trim());
  if (rejectUrl || rejectTitle) {
    return { accepted: false, confidence: 0, reason: rejectUrl ? "navigation_or_category_url" : "navigation_or_category_title" };
  }
  const detailUrl = /(?:\/(?:projects?|jobs?|freelance-jobs|work|task|brief|contest|post|t)\/|-\d{3,}(?:\b|$))/u.test(url);
  const buyerAsk = /\b(?:need|looking for|hire|seeking|wanted|required|build|develop|migrate|integrat(?:e|ion)|fix|take over|custom|budget|proposal|rfp|quote)\b/iu.test(text);
  const scope = /\b(?:project|task|brief|deliverable|requirements|scope|milestone|proposal|quote|budget|deadline|specialist|consultant|expert|provider|service|support|implementation|migration|integration|custom|build|develop|fix|take over|automation|dashboard|portal|platform|website|application|app)\b/iu.test(text);
  const budget = /(?:\$|€|£)\s?[0-9][0-9,]*|\b[0-9][0-9,]*\s?(?:usd|eur|gbp)\b/iu.test(text);
  const confidence = Math.min(1, (detailUrl ? 0.35 : 0) + (buyerAsk ? 0.3 : 0) + (scope ? 0.25 : 0) + (budget ? 0.1 : 0));
  if (confidence < 0.55) {
    return { accepted: false, confidence, reason: "insufficient_project_detail_evidence" };
  }
  return { accepted: true, confidence, reason: "project_detail_evidence" };
}

function isPeoplePerHourCategoryUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.toLowerCase().endsWith("peopleperhour.com")) {
      return false;
    }
    const parts = parsed.pathname.toLowerCase().split("/").filter(Boolean);
    if (parts[0] !== "freelance-jobs") {
      return false;
    }
    const tail = parts.slice(1);
    if (tail.length === 0) {
      return true;
    }
    return !tail.some((part) => /-\d{3,}(?:$|[/?#])/u.test(part));
  } catch {
    return false;
  }
}

async function extractResearchHtmlItems(
  adapterKey: ApiAdapterKey,
  html: string,
  baseUrl: string,
  context: ApiAdapterContext
): Promise<ApiAdapterFetchedItem[]> {
  const results: ApiAdapterFetchedItem[] = [];
  const seen = new Set<string>();
  const linkPattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]{1,500}?)<\/a>/giu;
  let match: RegExpExecArray | null;
  while ((match = linkPattern.exec(html)) && results.length < context.apiConfig.maxItemsPerPoll) {
    const rawUrl = match[1] ?? "";
    const title = stripHtml(match[2] ?? "");
    if (title.length < 8) {
      continue;
    }
    const url = resolveUrl(rawUrl, baseUrl);
    if (!url || seen.has(url)) {
      continue;
    }
    seen.add(url);
    const surrounding = html.slice(Math.max(0, match.index - 500), Math.min(html.length, match.index + 1000));
    const classification = classifyProjectLink({ adapterKey, url, title, surrounding });
    if (!classification.accepted) {
      continue;
    }
    let bodyHtml = surrounding;
    let finalUrl = url;
    let detailFetchAttempted = false;
    if (classification.confidence < 0.8 && results.length < 3) {
      try {
        const detail = await context.fetchText(url);
        detailFetchAttempted = true;
        finalUrl = detail.finalUrl || url;
        bodyHtml = detail.text || surrounding;
      } catch {
        detailFetchAttempted = true;
      }
    }
    const budget = firstString(
      bodyHtml.match(/(?:\$|€|£)\s?[0-9][0-9,]*(?:\s?-\s?(?:\$|€|£)?\s?[0-9][0-9,]*)?/u)?.[0],
      bodyHtml.match(/\b[0-9][0-9,]*\s?(?:USD|EUR|GBP)\b/iu)?.[0]
    );
    results.push({
      externalSignalCandidateId: `${adapterKey}:${finalUrl}`,
      url: finalUrl,
      publishedAt: context.fetchedAt,
      title,
      lead: budget ? `Budget/scope hint: ${budget}` : "",
      body: stripHtml(bodyHtml).slice(0, 8000),
      lang: context.channel.language ?? null,
      rawPayload: buildRawPayload(adapterKey, context.apiConfig, { url, title }, {
        researchOnly: true,
        extractionKind: "project_detail",
        projectDetailConfidence: classification.confidence,
        rejectedAnchorReason: null,
        detailFetchAttempted,
        budgetHint: budget || null,
      }),
    });
  }
  return results;
}

export async function fetchApiAdapterItems(
  adapterKey: ApiAdapterKey,
  context: ApiAdapterContext
): Promise<ApiAdapterFetchedItem[]> {
  if (adapterKey === "ddgs_search") {
    const searchQuery = context.apiConfig.adapter.searchQuery;
    const payload = await (context.fetchSearch ?? fetchDirectDdgsSearchPayload)({
      query: searchQuery.query ?? context.apiConfig.adapter.query ?? "",
      maxResults: searchQuery.maxResults,
      resultType: "text",
      timeRange: searchQuery.timeRange,
      locale: searchQuery.locale,
    });
    return normalizeDdgsSearch(payload, context);
  }

  if (OFFICIAL_JSON_ADAPTERS.has(adapterKey)) {
    const payload = await context.fetchJson();
    switch (adapterKey) {
      case "hn_algolia_search":
        return normalizeHn(payload, context);
      case "github_issues_search":
        return normalizeGitHubIssues(payload, context);
      case "stack_exchange_search":
        return normalizeStackExchange(payload, context);
      case "searxng_search":
        return normalizeSearxng(payload, context);
      case "brave_search":
        return normalizeBraveSearch(payload, context);
      case "tavily_search":
        return normalizeTavilySearch(payload, context);
      case "exa_search":
        return normalizeExaSearch(payload, context);
      case "serpapi_google_news_research":
        return normalizeSerpApiGoogleNews(payload, context);
      case "discourse_search":
        return normalizeDiscourseSearch(payload, context);
      case "greenhouse_job_board":
        return normalizeGreenhouse(payload, context);
      case "lever_postings":
        return normalizeLever(payload, context);
      case "ashby_job_postings":
        return normalizeAshby(payload, context);
      case "remotive_jobs":
        return normalizeRemotive(payload, context);
      case "remoteok_jobs":
        return normalizeRemoteOk(payload, context);
      default:
        return [];
    }
  }

  if (adapterKey === "weworkremotely_rss") {
    const response = await context.fetchText();
    return extractResearchHtmlItems(adapterKey, response.text, response.finalUrl, context);
  }

  if (RESEARCH_HTML_ADAPTERS.has(adapterKey)) {
    const response = await context.fetchText();
    return extractResearchHtmlItems(adapterKey, response.text, response.finalUrl, context);
  }

  return [];
}

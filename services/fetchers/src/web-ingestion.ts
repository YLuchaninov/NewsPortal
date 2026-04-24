import type { Pool } from "pg";

import {
  parseSourceChannelAuthConfig,
  parseWebsiteChannelConfig,
  RESOURCE_KINDS,
  resolveSourceChannelAuthorizationHeader,
  type ResourceKind,
  type WebsiteChannelConfig
} from "@newsportal/contracts";

import { parseFeed } from "./feed-parser";
import { canonicalizeUrl, collapseWhitespace, decodeHtmlEntities, stripHtmlTags } from "./rss";

const MAX_SITEMAP_DEPTH = 3;
const MAX_SITEMAP_FETCHES = 10;
const MAX_COLLECTION_FETCHES = 5;
const SET_DIFF_CURSOR_LIMIT = 200;
const JSON_URL_CANDIDATE_LIMIT = 300;
const DEFAULT_PROBE_SAMPLE_COUNT = 5;
const SAME_SITE_PROTOCOLS = new Set(["http:", "https:"]);
const DATE_PATH_PATTERN = /\/20\d{2}\/\d{2}\/\d{2}\//;
const DOWNLOAD_EXTENSION_PATTERN = /\.(pdf|csv|xlsx|xls|json|xml|zip)(?:$|\?)/i;
const FEED_HINT_PATTERN = /(rss|atom|feed)(?:\.xml)?(?:$|\?)/i;
const CAPTCHA_PATTERN = /\b(captcha|recaptcha|hcaptcha|cf-turnstile|turnstile)\b/i;
const LOGIN_GATE_TEXT_PATTERN =
  /\b(login required|member login|sign in to continue|log in to continue|please sign in|please log in|password required|enter your password|forgot your password)\b/i;
const LOGIN_HEADING_PATTERN = /<(?:title|h1|h2)\b[^>]*>[\s\S]{0,160}\b(sign in|log in)\b/i;
const PASSWORD_INPUT_PATTERN = /<input\b[^>]*type=["']password["'][^>]*>/i;
const LOGIN_FORM_PATTERN =
  /<form\b[\s\S]{0,4000}\b(sign in|log in|password|email|username|continue with (?:google|github|sso|email))\b/i;
const CLOUDFLARE_PATTERN = /\b(cloudflare|checking your browser|cf-browser-verification|just a moment)\b/i;
const ACCESS_BLOCK_PATTERN =
  /\b(access denied|bot detected|request blocked|forbidden|powered and protected by akamai|akamai|bm-verify)\b|\/_sec\/verify\b/i;

export type WebsiteDiscoveryMode =
  | "sitemap"
  | "feed"
  | "collection"
  | "inline_data"
  | "download"
  | "browser_assisted";

export type WebsiteChallengeKind =
  | "login"
  | "captcha"
  | "cloudflare_js_challenge"
  | "unsupported_block";

type ConditionalFetchRole = "robots" | "homepage" | "llms" | "sitemap" | "feed";

export interface WebsiteConditionalRequestState {
  etag: string | null;
  lastModified: string | null;
  finalUrl: string | null;
  contentType: string | null;
  httpStatus: number | null;
  updatedAt: string | null;
}

export interface WebsiteCachedTextResponseState {
  url: string;
  status: number;
  contentType: string | null;
  text: string;
  updatedAt: string;
}

export interface WebsiteConditionalRequestHits {
  homepage: number;
  sitemap: number;
  feed: number;
  robots: number;
  llms: number;
}

export interface CrawlPolicyCacheRow {
  domain: string;
  robots_txt_url: string;
  robots_txt_body: string | null;
  sitemap_urls: string[];
  feed_urls: string[];
  llms_txt_url: string | null;
  llms_txt_body: string | null;
  request_validators_json: Record<string, unknown>;
  response_cache_json: Record<string, unknown>;
  fetched_at: string;
  expires_at: string;
  fetch_error: string | null;
  http_status: number | null;
  conditional_request_hits?: WebsiteConditionalRequestHits;
}

export interface CursorSnapshot {
  cursorType: string;
  cursorValue: string | null;
  cursorJson: Record<string, unknown>;
}

export interface WebsiteCursorUpdate {
  cursorType: string;
  cursorValue: string;
  cursorJson: Record<string, unknown>;
}

export interface DiscoveredWebsiteResource {
  url: string;
  normalizedUrl: string;
  externalResourceId: string;
  title: string | null;
  summary: string | null;
  parentUrl: string | null;
  publishedAt: string | null;
  modifiedAt: string | null;
  freshnessMarkerType: "timestamp" | "lastmod" | "set_diff" | null;
  freshnessMarkerValue: string | null;
  discoverySource: string;
  hintedKinds: ResourceKind[];
  classification: {
    kind: ResourceKind;
    confidence: number;
    reasons: string[];
  };
  rawSignals: Record<string, unknown>;
}

export interface WebsiteCapabilities {
  sitemapUrls: string[];
  feedUrls: string[];
  inlineDataHints: boolean;
  jsHeavyHint: boolean;
  challengeKindHint: WebsiteChallengeKind | null;
  supportsDownloads: boolean;
  defaultCollectionUrls: string[];
  contentTypes: string[];
  homepageHtml: string | null;
  homepageStatus: number | null;
}

export interface WebsiteBrowserAttempt {
  attempted: boolean;
  recommended: boolean;
  recommendationReasons: string[];
  challengeKind: WebsiteChallengeKind | null;
  blockedReason: string | null;
}

export interface WebsiteDiscoveryMetrics {
  staticCandidateCount: number;
  staticAcceptedCount: number;
  browserRecommended: boolean;
  browserAttempted: boolean;
  browserRecommendationReasons: string[];
  browserChallengeKind: WebsiteChallengeKind | null;
  browserDiscoveredCount: number;
  browserAcceptedCount: number;
  browserOnlyAcceptedCount: number;
  finalAcceptedCount: number;
  modeCounts: Record<string, number>;
  resourceKindCounts: Record<string, number>;
  conditionalRequestHits: WebsiteConditionalRequestHits;
}

export interface DiscoveryWebsiteProbeResult {
  url: string;
  final_url: string;
  title: string;
  classification: {
    kind: ResourceKind;
    confidence: number;
    reasons: string[];
  };
  capabilities: {
    supports_feed_discovery: boolean;
    supports_collection_discovery: boolean;
    supports_download_discovery: boolean;
    inline_data_hint: boolean;
    js_heavy_hint: boolean;
  };
  discovered_feed_urls: string[];
  listing_urls: string[];
  document_urls: string[];
  detail_count_estimate: number;
  listing_count_estimate: number;
  document_count_estimate: number;
    sample_resources: Array<{
      url: string;
      title: string | null;
      kind: ResourceKind;
      discovery_source: string;
      reasons?: string[];
    }>;
  is_news_site: boolean;
  has_hidden_rss: boolean;
  hidden_rss_urls: string[];
  article_count_estimate: number;
  freshness: "daily" | "unknown";
  date_patterns_found: boolean;
  category_urls: string[];
  sample_articles: Array<{
    url: string;
    title: string | null;
    date: string | null;
  }>;
  browser_assisted_recommended: boolean;
  browser_assisted_recommendation_reasons?: string[];
  challenge_kind: WebsiteChallengeKind | null;
}

interface ParsedRobotsGroup {
  agents: string[];
  rules: Array<{ kind: "allow" | "disallow"; pattern: string }>;
  crawlDelaySeconds: number | null;
}

interface ParsedRobotsPolicy {
  groups: ParsedRobotsGroup[];
}

export interface RuntimeCrawlPolicy {
  domain: string;
  sitemapUrls: string[];
  feedUrls: string[];
  llmsTxtBody: string | null;
  fetchedAt: string;
  expiresAt: string;
  fetchError: string | null;
  httpStatus: number | null;
  requestValidators: Record<string, WebsiteConditionalRequestState>;
  responseCache: Record<string, WebsiteCachedTextResponseState>;
  conditionalRequestHits: WebsiteConditionalRequestHits;
  isAllowed: (rawUrl: string, userAgent: string) => boolean;
  crawlDelaySeconds: (userAgent: string) => number | null;
}

interface WebsiteAuthContext {
  channelUrl: string;
  authConfig: unknown;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function createEmptyConditionalRequestHits(): WebsiteConditionalRequestHits {
  return {
    homepage: 0,
    sitemap: 0,
    feed: 0,
    robots: 0,
    llms: 0,
  };
}

function cloneConditionalRequestHits(
  input?: Partial<WebsiteConditionalRequestHits> | null
): WebsiteConditionalRequestHits {
  const toCount = (value: unknown): number => {
    const numeric = Number(value ?? 0);
    return Number.isFinite(numeric) ? numeric : 0;
  };
  return {
    homepage: toCount(input?.homepage),
    sitemap: toCount(input?.sitemap),
    feed: toCount(input?.feed),
    robots: toCount(input?.robots),
    llms: toCount(input?.llms),
  };
}

function readConditionalRequestStates(
  value: unknown
): Record<string, WebsiteConditionalRequestState> {
  const states: Record<string, WebsiteConditionalRequestState> = {};
  for (const [key, rawState] of Object.entries(asRecord(value))) {
    const state = asRecord(rawState);
    states[key] = {
      etag: readOptionalString(state.etag),
      lastModified: readOptionalString(state.lastModified),
      finalUrl: readOptionalString(state.finalUrl),
      contentType: readOptionalString(state.contentType),
      httpStatus:
        typeof state.httpStatus === "number" && Number.isFinite(state.httpStatus)
          ? state.httpStatus
          : (() => {
              const parsed = Number.parseInt(String(state.httpStatus ?? ""), 10);
              return Number.isFinite(parsed) ? parsed : null;
            })(),
      updatedAt: readOptionalString(state.updatedAt),
    };
  }
  return states;
}

function readCachedTextResponses(
  value: unknown
): Record<string, WebsiteCachedTextResponseState> {
  const states: Record<string, WebsiteCachedTextResponseState> = {};
  for (const [key, rawState] of Object.entries(asRecord(value))) {
    const state = asRecord(rawState);
    const url = readOptionalString(state.url);
    const text = typeof state.text === "string" ? state.text : null;
    if (!url || text == null) {
      continue;
    }
    const status =
      typeof state.status === "number" && Number.isFinite(state.status)
        ? state.status
        : (() => {
            const parsed = Number.parseInt(String(state.status ?? ""), 10);
            return Number.isFinite(parsed) ? parsed : 200;
          })();
    states[key] = {
      url,
      status,
      contentType: readOptionalString(state.contentType),
      text,
      updatedAt: readOptionalString(state.updatedAt) ?? new Date(0).toISOString(),
    };
  }
  return states;
}

function buildConditionalStateKey(role: ConditionalFetchRole, rawUrl?: string): string {
  if (!rawUrl || ["robots", "homepage", "llms"].includes(role)) {
    return role;
  }
  return `${role}:${canonicalizeUrl(rawUrl)}`;
}

function readOptionalString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeText(value: string): string {
  return collapseWhitespace(decodeHtmlEntities(stripHtmlTags(value)));
}

function detectLoginGate(html: string | null, normalizedText: string): boolean {
  const source = html ?? "";
  if (PASSWORD_INPUT_PATTERN.test(source)) {
    return true;
  }
  if (LOGIN_GATE_TEXT_PATTERN.test(normalizedText)) {
    return true;
  }
  return LOGIN_HEADING_PATTERN.test(source) && LOGIN_FORM_PATTERN.test(source);
}

function detectWebsiteChallengeKind(html: string | null, textContent?: string | null): WebsiteChallengeKind | null {
  const normalizedText = normalizeText(textContent ?? html ?? "");
  const haystack = `${html ?? ""}\n${normalizedText}`;
  if (!haystack.trim()) {
    return null;
  }
  if (CAPTCHA_PATTERN.test(haystack)) {
    return "captcha";
  }
  if (detectLoginGate(html, normalizedText)) {
    return "login";
  }
  if (CLOUDFLARE_PATTERN.test(haystack)) {
    return "cloudflare_js_challenge";
  }
  if (ACCESS_BLOCK_PATTERN.test(haystack)) {
    return "unsupported_block";
  }
  return null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeUrl(rawUrl: string, baseUrl?: string): string | null {
  try {
    const absolute = baseUrl ? new URL(rawUrl, baseUrl).toString() : new URL(rawUrl).toString();
    const normalized = canonicalizeUrl(absolute);
    const parsed = new URL(normalized);
    if (!SAME_SITE_PROTOCOLS.has(parsed.protocol)) {
      return null;
    }
    return normalized;
  } catch {
    return null;
  }
}

function compareIsoTimestamps(left: string | null, right: string | null): number {
  const leftTime = left ? Date.parse(left) : Number.NaN;
  const rightTime = right ? Date.parse(right) : Number.NaN;
  if (Number.isNaN(leftTime) && Number.isNaN(rightTime)) {
    return 0;
  }
  if (Number.isNaN(leftTime)) {
    return -1;
  }
  if (Number.isNaN(rightTime)) {
    return 1;
  }
  return leftTime - rightTime;
}

function chooseLatest(left: string | null, right: string | null): string | null {
  return compareIsoTimestamps(left, right) >= 0 ? left : right;
}

function appendItems<T>(target: T[], incoming: readonly T[]): void {
  for (const item of incoming) {
    target.push(item);
  }
}

function extractAttribute(tagSource: string, attributeName: string): string | null {
  const expression = new RegExp(`${attributeName}\\s*=\\s*["']([^"']+)["']`, "i");
  return readOptionalString(tagSource.match(expression)?.[1] ?? null);
}

function extractAnchorLinks(html: string, baseUrl: string): Array<{ url: string; text: string }> {
  const links: Array<{ url: string; text: string }> = [];
  const matches = html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi);
  for (const match of matches) {
    const normalizedUrl = normalizeUrl(match[1] ?? "", baseUrl);
    if (!normalizedUrl) {
      continue;
    }
    links.push({
      url: normalizedUrl,
      text: normalizeText(match[2] ?? "")
    });
  }
  return links;
}

interface CollectionLinkCandidate {
  url: string;
  text: string;
  summary: string | null;
  publishedAt: string | null;
}

const COLLECTION_NAV_TEXT_PATTERN =
  /^(read more|learn more|more|next|previous|older|newer|view all|all news|all updates|contact|about|privacy|terms|careers)$/i;
const COLLECTION_CONTEXT_NOISE_PATTERN =
  /\b(menu_level|submenu|no_menu_link|usa-nav|breadcrumb|skip to main|main navigation)\b|<\/?[a-z][^>]*>|\b[a-z0-9_-]+__\d+\b/i;

function isLikelyContentContext(value: string | null | undefined): boolean {
  if (!value) {
    return false;
  }
  return !COLLECTION_CONTEXT_NOISE_PATTERN.test(value);
}

function extractCollectionTitleHint(contextHtml: string): string | null {
  const headingMatch = contextHtml.match(
    /<(?:h1|h2|h3|h4)\b[^>]*>([\s\S]*?)<\/(?:h1|h2|h3|h4)>/i
  );
  const headingText = normalizeText(headingMatch?.[1] ?? "");
  if (headingText.length >= 16) {
    return headingText;
  }

  const titledFieldMatch = contextHtml.match(
    /field--name-title[\s\S]{0,240}?>([\s\S]*?)<\/span>/i
  );
  const titledFieldText = normalizeText(titledFieldMatch?.[1] ?? "");
  if (titledFieldText.length >= 16) {
    return titledFieldText;
  }

  return null;
}

function extractPublishedAtHint(value: string): string | null {
  const datetime = readOptionalString(value.match(/\bdatetime=["']([^"']+)["']/i)?.[1] ?? null);
  if (datetime) {
    const parsed = Date.parse(datetime);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed).toISOString();
    }
  }

  const isoDate = readOptionalString(value.match(/\b(20\d{2}-\d{2}-\d{2})(?:[tT ][0-9:.\-+Z]+)?\b/)?.[1] ?? null);
  if (isoDate) {
    const parsed = Date.parse(isoDate);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed).toISOString();
    }
  }

  const textualDate = readOptionalString(
    value.match(
      /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},\s+20\d{2}\b/i
    )?.[0] ?? null
  );
  if (textualDate) {
    const parsed = Date.parse(textualDate);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed).toISOString();
    }
  }

  return null;
}

export function extractCollectionLinkCandidates(html: string, baseUrl: string): CollectionLinkCandidate[] {
  const links: CollectionLinkCandidate[] = [];
  const matches = html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi);
  for (const match of matches) {
    const url = normalizeUrl(match[1] ?? "", baseUrl);
    if (!url) {
      continue;
    }
    const rawText = normalizeText(match[2] ?? "");
    const index = typeof match.index === "number" ? match.index : 0;
    const source = match[0] ?? "";
    const contextHtml = html.slice(Math.max(0, index - 220), Math.min(html.length, index + source.length + 420));
    const text =
      COLLECTION_NAV_TEXT_PATTERN.test(rawText)
        ? extractCollectionTitleHint(contextHtml) ?? rawText
        : rawText;
    const publishedAt = extractPublishedAtHint(contextHtml);
    const contextText = normalizeText(contextHtml)
      .replace(rawText, " ")
      .replace(text, " ")
      .replace(/\b(read more|learn more|continue reading)\b/gi, " ")
      .trim();
    const summaryCandidate =
      contextText.length > Math.max(40, text.length + 16)
        ? contextText.slice(0, 320)
        : null;
    const summary = isLikelyContentContext(summaryCandidate) ? summaryCandidate : null;
    if (
      !text ||
      !isLikelyContentContext(text) ||
      (COLLECTION_NAV_TEXT_PATTERN.test(text) && !publishedAt && !summary)
    ) {
      continue;
    }
    links.push({
      url,
      text,
      summary,
      publishedAt,
    });
  }
  return links;
}

function extractLinkTagUrls(
  html: string,
  baseUrl: string,
  typeHints: readonly string[]
): string[] {
  const urls: string[] = [];
  const matches = html.matchAll(/<link\b[^>]*>/gi);
  for (const match of matches) {
    const source = match[0] ?? "";
    const href = extractAttribute(source, "href");
    const typeValue = (extractAttribute(source, "type") ?? "").toLowerCase();
    if (!href || !typeHints.some((hint) => typeValue.includes(hint))) {
      continue;
    }
    const normalizedUrl = normalizeUrl(href, baseUrl);
    if (normalizedUrl) {
      urls.push(normalizedUrl);
    }
  }
  return Array.from(new Set(urls));
}

function extractHtmlTitle(html: string): string | null {
  return readOptionalString(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? null);
}

function detectInlineDataHint(html: string): boolean {
  return /__NEXT_DATA__|__NUXT__|__APOLLO_STATE__|data-reactroot|window\.__INITIAL_STATE__/i.test(html);
}

function detectJsHeavyHint(html: string): boolean {
  const scriptCount = (html.match(/<script\b/gi) ?? []).length;
  const textLength = normalizeText(html).length;
  return scriptCount >= 10 && textLength <= 800;
}

function extractDefaultCollectionUrls(html: string, baseUrl: string): string[] {
  const candidates: string[] = [];
  for (const link of extractAnchorLinks(html, baseUrl)) {
    const path = new URL(link.url).pathname.toLowerCase();
    if (/(category|browse|archive|latest|search|list|directory|jobs|datasets)/.test(path)) {
      candidates.push(link.url);
    }
  }
  return Array.from(new Set(candidates)).slice(0, MAX_COLLECTION_FETCHES);
}

function isRootPath(pathname: string): boolean {
  return pathname === "" || pathname === "/";
}

function shouldKeepDefaultCollectionSeed(channelUrl: string, seedUrl: string): boolean {
  try {
    const channelPath = new URL(channelUrl).pathname.toLowerCase();
    const seedPath = new URL(seedUrl).pathname.toLowerCase();
    if (isRootPath(channelPath)) {
      return true;
    }
    if (channelPath === seedPath) {
      return true;
    }
    const channelSegments = channelPath.split("/").filter(Boolean);
    const seedSegments = seedPath.split("/").filter(Boolean);
    if (channelSegments.length === 0 || seedSegments.length === 0) {
      return false;
    }
    if (channelSegments[0] === seedSegments[0]) {
      return true;
    }
    return (
      channelPath.startsWith(`${seedPath}/`) ||
      seedPath.startsWith(`${channelPath}/`)
    );
  } catch {
    return false;
  }
}

function selectCollectionSeedUrls(input: {
  channelUrl: string;
  defaultCollectionUrls: readonly string[];
  configuredSeedUrls: readonly string[];
}): string[] {
  return Array.from(
    new Set([
      input.channelUrl,
      ...input.defaultCollectionUrls.filter((seedUrl) =>
        shouldKeepDefaultCollectionSeed(input.channelUrl, seedUrl)
      ),
      ...input.configuredSeedUrls
        .map((url) => normalizeUrl(url, input.channelUrl))
        .filter((url): url is string => Boolean(url)),
    ])
  ).slice(0, MAX_COLLECTION_FETCHES);
}

function extractDownloadUrls(
  html: string,
  baseUrl: string,
  downloadPatterns: readonly string[]
): string[] {
  const patterns = downloadPatterns
    .map((pattern) => pattern.trim())
    .filter(Boolean)
    .map((pattern) => new RegExp(`${escapeRegExp(pattern)}(?:$|\\?)`, "i"));

  const urls: string[] = [];
  for (const link of extractAnchorLinks(html, baseUrl)) {
    if (patterns.some((pattern) => pattern.test(link.url))) {
      urls.push(link.url);
    }
  }
  return Array.from(new Set(urls));
}

function pathContainsSegment(pathname: string, segments: readonly string[]): boolean {
  const expression = new RegExp(
    `(?:^|/)(?:${segments.map((segment) => escapeRegExp(segment)).join("|")})(?:/|$)`,
    "i"
  );
  return expression.test(pathname);
}

function inferResourceKindsFromPath(pathname: string): ResourceKind[] {
  const lowerPath = pathname.toLowerCase();
  const segments = lowerPath.split("/").filter(Boolean);
  const depth = segments.length;
  const lastSegment = segments.at(-1) ?? "";
  const collectionEditorialSegments = new Set([
    "changelog",
    "release-notes",
    "release-note",
    "announcements",
    "announcement",
    "press-releases",
    "press-release",
    "newsroom",
    "updates",
    "update"
  ]);
  const editorialSegments = new Set([
    "news",
    "blog",
    "blogs",
    "article",
    "articles",
    "story",
    "stories",
    "post",
    "posts"
  ]);
  if (DOWNLOAD_EXTENSION_PATTERN.test(lowerPath)) {
    if (/\.(csv|xlsx|xls|json|xml|zip)(?:$|\?)/i.test(lowerPath)) {
      return ["data_file"];
    }
    return ["document"];
  }
  if (pathContainsSegment(lowerPath, [
    "changelog",
    "release-notes",
    "release-note",
    "announcements",
    "announcement",
    "press-releases",
    "press-release",
    "newsroom",
    "updates",
    "update"
  ])) {
    if (
      DATE_PATH_PATTERN.test(lowerPath) ||
      (depth >= 2 && !collectionEditorialSegments.has(lastSegment)) ||
      /-\d{4,}$/.test(lastSegment)
    ) {
      return ["editorial"];
    }
    return ["listing"];
  }
  if (pathContainsSegment(lowerPath, [
    "search",
    "category",
    "categories",
    "tag",
    "tags",
    "browse",
    "archive",
    "archives",
    "list",
    "lists",
    "directory",
    "directories"
  ])) {
    return ["listing"];
  }
  if (pathContainsSegment(lowerPath, [
    "news",
    "blog",
    "blogs",
    "article",
    "articles",
    "story",
    "stories",
    "post",
    "posts"
  ])) {
    if (
      DATE_PATH_PATTERN.test(lowerPath) ||
      (depth >= 2 && !editorialSegments.has(lastSegment)) ||
      /[-_][a-z0-9]{5,}/i.test(lastSegment)
    ) {
      return ["editorial"];
    }
    return ["listing"];
  }
  if (pathContainsSegment(lowerPath, [
    "product",
    "products",
    "job",
    "jobs",
    "dataset",
    "datasets",
    "company",
    "companies",
    "profile",
    "profiles",
    "person",
    "people",
    "detail",
    "details"
  ])) {
    return ["entity"];
  }
  if (DATE_PATH_PATTERN.test(lowerPath)) {
    return ["editorial"];
  }
  return ["unknown"];
}

export function inferResourceKindsFromUrl(rawUrl: string): ResourceKind[] {
  try {
    return inferResourceKindsFromPath(new URL(rawUrl).pathname);
  } catch {
    return ["unknown"];
  }
}

export function classifyResourceCandidate(input: {
  url: string;
  title?: string | null;
  summary?: string | null;
  hintedKinds?: readonly ResourceKind[];
  overrideKinds?: readonly ResourceKind[];
  structuredTypes?: readonly string[];
  hasRepeatedCards?: boolean;
  hasPagination?: boolean;
  hasDownloads?: boolean;
  publishedAtHint?: string | null;
  discoverySource?: string | null;
}): { kind: ResourceKind; confidence: number; reasons: string[] } {
  const scores = new Map<ResourceKind, number>(RESOURCE_KINDS.map((kind) => [kind, 0]));
  const reasons: string[] = [];
  const titleText = normalizeText(input.title ?? "");
  const summaryText = normalizeText(input.summary ?? "");
  const combinedText = `${titleText} ${summaryText}`.trim();
  const hintedKinds = (input.hintedKinds ?? []).filter((kind) => kind !== "unknown");
  const editorialHinted = hintedKinds.includes("editorial");
  const listingHinted = hintedKinds.includes("listing");
  const hasEditorialStructuredType = (input.structuredTypes ?? []).some((structuredType) =>
    /(newsarticle|article|blogposting)/i.test(structuredType)
  );
  const detailLikeEditorialSignals =
    editorialHinted &&
    !listingHinted &&
    (Boolean(input.publishedAtHint) ||
      titleText.length >= 24 ||
      summaryText.length >= 80 ||
      hasEditorialStructuredType);
  for (const kind of hintedKinds) {
    scores.set(kind, (scores.get(kind) ?? 0) + 3);
    reasons.push(`hint:${kind}`);
  }
  for (const kind of (input.overrideKinds ?? []).filter((candidate) => candidate !== "unknown")) {
    scores.set(kind, (scores.get(kind) ?? 0) + 5);
    reasons.push(`override:${kind}`);
  }

  for (const structuredType of input.structuredTypes ?? []) {
    const normalized = structuredType.toLowerCase();
    if (/(newsarticle|article|blogposting)/.test(normalized)) {
      scores.set("editorial", (scores.get("editorial") ?? 0) + 4);
      reasons.push(`structured:${structuredType}`);
    }
    if (/(itemlist|collectionpage|searchresultspage)/.test(normalized)) {
      scores.set("listing", (scores.get("listing") ?? 0) + 4);
      reasons.push(`structured:${structuredType}`);
    }
    if (/(product|dataset|jobposting|organization|person)/.test(normalized)) {
      scores.set("entity", (scores.get("entity") ?? 0) + 4);
      reasons.push(`structured:${structuredType}`);
    }
  }

  if (input.hasRepeatedCards) {
    scores.set("listing", (scores.get("listing") ?? 0) + (detailLikeEditorialSignals ? 1 : 3));
    reasons.push(detailLikeEditorialSignals ? "layout:repeated_cards_ambient" : "layout:repeated_cards");
  }
  if (input.hasPagination) {
    scores.set("listing", (scores.get("listing") ?? 0) + (detailLikeEditorialSignals ? 1 : 2));
    reasons.push(detailLikeEditorialSignals ? "layout:pagination_ambient" : "layout:pagination");
  }
  if (input.hasDownloads) {
    scores.set("document", (scores.get("document") ?? 0) + 1);
    scores.set("data_file", (scores.get("data_file") ?? 0) + 1);
    reasons.push("layout:downloads");
  }
  if (editorialHinted && !listingHinted && titleText.length >= 24) {
    scores.set("editorial", (scores.get("editorial") ?? 0) + 2);
    reasons.push("path:editorial_detail");
  }
  if (input.publishedAtHint) {
    scores.set("editorial", (scores.get("editorial") ?? 0) + 3);
    reasons.push("signal:published_at");
  }
  if (titleText.length >= 24 && summaryText.length >= 80) {
    scores.set("editorial", (scores.get("editorial") ?? 0) + 2);
    reasons.push("signal:title_summary");
  }
  if (
    input.discoverySource === "collection_page" &&
    input.hasRepeatedCards &&
    titleText.length >= 20 &&
    (Boolean(input.publishedAtHint) || summaryText.length >= 80)
  ) {
    scores.set("editorial", (scores.get("editorial") ?? 0) + 3);
    reasons.push("collection:article_card");
  }
  if (/\b(press release|announc(?:e|es|ing)|statement|policy update|launch(?:es|ed)?|introduc(?:e|es|ed)|what'?s new)\b/i.test(combinedText)) {
    scores.set("editorial", (scores.get("editorial") ?? 0) + 2);
    reasons.push("text:editorial");
  }
  if (/\b(changelog|release notes|release note|all updates|latest news|archive)\b/i.test(combinedText)) {
    scores.set("listing", (scores.get("listing") ?? 0) + 2);
    reasons.push("text:listing");
  }
  if (/\b(procurement|tender|request for proposal|rfp|invitation to bid|bid notice|call for tender)\b/i.test(combinedText)) {
    scores.set("listing", (scores.get("listing") ?? 0) + 2);
    scores.set("document", (scores.get("document") ?? 0) + 1);
    reasons.push("text:procurement");
  }
  if (
    detailLikeEditorialSignals &&
    input.discoverySource !== "collection_page" &&
    (Boolean(input.publishedAtHint) || summaryText.length >= 80)
  ) {
    scores.set("editorial", (scores.get("editorial") ?? 0) + 2);
    reasons.push("detail:editorial_page");
  }

  const candidates = Array.from(scores.entries()).sort((left, right) => right[1] - left[1]);
  const top = candidates[0] ?? ["unknown", 0];
  const second = candidates[1] ?? ["unknown", 0];
  const kind = (top[0] as ResourceKind) || "unknown";
  const margin = Math.max(0, top[1] - second[1]);
  const confidence = top[1] <= 0 ? 0.2 : Math.min(0.95, 0.35 + margin * 0.15 + top[1] * 0.05);
  return {
    kind: confidence < 0.45 ? "unknown" : kind,
    confidence: Number(confidence.toFixed(2)),
    reasons: reasons.slice(0, 6)
  };
}

function dedupeResources(resources: readonly DiscoveredWebsiteResource[]): DiscoveredWebsiteResource[] {
  const seen = new Map<string, DiscoveredWebsiteResource>();
  for (const resource of resources) {
    const existing = seen.get(resource.normalizedUrl);
    if (!existing) {
      seen.set(resource.normalizedUrl, resource);
      continue;
    }

    const mergedKinds = Array.from(new Set([...existing.hintedKinds, ...resource.hintedKinds]));
    const mergedReasons = Array.from(
      new Set([...existing.classification.reasons, ...resource.classification.reasons])
    );
    seen.set(resource.normalizedUrl, {
      ...existing,
      title: existing.title ?? resource.title,
      summary: existing.summary ?? resource.summary,
      parentUrl: existing.parentUrl ?? resource.parentUrl,
      publishedAt: chooseLatest(existing.publishedAt, resource.publishedAt),
      modifiedAt: chooseLatest(existing.modifiedAt, resource.modifiedAt),
      freshnessMarkerType:
        existing.freshnessMarkerType ??
        resource.freshnessMarkerType,
      freshnessMarkerValue:
        chooseLatest(existing.freshnessMarkerValue, resource.freshnessMarkerValue) ??
        existing.freshnessMarkerValue ??
        resource.freshnessMarkerValue,
      hintedKinds: mergedKinds.length > 0 ? mergedKinds : ["unknown"],
      classification:
        existing.classification.confidence >= resource.classification.confidence
          ? {
              ...existing.classification,
              reasons: mergedReasons
            }
          : {
              ...resource.classification,
              reasons: mergedReasons
            },
      rawSignals: {
        ...existing.rawSignals,
        ...resource.rawSignals
      }
    });
  }
  return Array.from(seen.values());
}

function parseXmlEntries(xml: string, nodeName: "url" | "sitemap"): Array<{ loc: string; lastmod: string | null }> {
  const entries: Array<{ loc: string; lastmod: string | null }> = [];
  const expression = new RegExp(`<${nodeName}\\b[^>]*>([\\s\\S]*?)<\\/${nodeName}>`, "gi");
  for (const match of xml.matchAll(expression)) {
    const body = match[1] ?? "";
    const loc = readOptionalString(body.match(/<loc>([\s\S]*?)<\/loc>/i)?.[1] ?? null);
    if (!loc) {
      continue;
    }
    entries.push({
      loc,
      lastmod: readOptionalString(body.match(/<lastmod>([\s\S]*?)<\/lastmod>/i)?.[1] ?? null)
    });
  }
  return entries;
}

function parseJsonLdTypes(html: string): string[] {
  const types: string[] = [];
  for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    const payload = readOptionalString(match[1] ?? "");
    if (!payload) {
      continue;
    }
    try {
      const parsed = JSON.parse(payload) as unknown;
      const stack = Array.isArray(parsed) ? [...parsed] : [parsed];
      while (stack.length > 0) {
        const item = stack.pop();
        if (!item || typeof item !== "object") {
          continue;
        }
        if (Array.isArray(item)) {
          appendItems(stack, item);
          continue;
        }
        const record = item as Record<string, unknown>;
        const type = record["@type"];
        if (typeof type === "string" && type.trim()) {
          types.push(type.trim());
        } else if (Array.isArray(type)) {
          for (const nested of type) {
            if (typeof nested === "string" && nested.trim()) {
              types.push(nested.trim());
            }
          }
        }
        for (const value of Object.values(record)) {
          if (value && typeof value === "object") {
            stack.push(value);
          }
        }
      }
    } catch {
      continue;
    }
  }
  return Array.from(new Set(types));
}

function extractJsonUrls(value: unknown, baseUrl: string, accumulator: Set<string>): void {
  if (accumulator.size >= JSON_URL_CANDIDATE_LIMIT) {
    return;
  }
  if (typeof value === "string") {
    const normalizedUrl = normalizeUrl(value, baseUrl);
    if (normalizedUrl) {
      accumulator.add(normalizedUrl);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      extractJsonUrls(item, baseUrl, accumulator);
      if (accumulator.size >= JSON_URL_CANDIDATE_LIMIT) {
        return;
      }
    }
    return;
  }
  if (!value || typeof value !== "object") {
    return;
  }
  for (const nestedValue of Object.values(value as Record<string, unknown>)) {
    extractJsonUrls(nestedValue, baseUrl, accumulator);
    if (accumulator.size >= JSON_URL_CANDIDATE_LIMIT) {
      return;
    }
  }
}

function extractInlineDataUrls(html: string, baseUrl: string): string[] {
  const accumulator = new Set<string>();
  for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    const payload = readOptionalString(match[1] ?? "");
    if (!payload || (!payload.startsWith("{") && !payload.startsWith("["))) {
      continue;
    }
    try {
      const parsed = JSON.parse(payload) as unknown;
      extractJsonUrls(parsed, baseUrl, accumulator);
    } catch {
      continue;
    }
  }
  return Array.from(accumulator);
}

function compilePatterns(patterns: readonly string[]): RegExp[] {
  return patterns
    .map((pattern) => pattern.trim())
    .filter(Boolean)
    .flatMap((pattern) => {
      try {
        return [new RegExp(pattern, "i")];
      } catch {
        return [];
      }
    });
}

function resolveCuratedOverrideKinds(url: string, config: WebsiteChannelConfig): ResourceKind[] {
  const kinds: ResourceKind[] = [];
  const overridePatterns: Array<[ResourceKind, string[]]> = [
    ["editorial", config.curated.editorialUrlPatterns],
    ["listing", config.curated.listingUrlPatterns],
    ["entity", config.curated.entityUrlPatterns],
    ["document", config.curated.documentUrlPatterns],
    ["data_file", config.curated.dataFileUrlPatterns],
  ];
  for (const [kind, patterns] of overridePatterns) {
    if (compilePatterns(patterns).some((pattern) => pattern.test(url))) {
      kinds.push(kind);
    }
  }
  return Array.from(new Set(kinds));
}

function summarizeResourceKinds(resources: readonly DiscoveredWebsiteResource[]): {
  editorialCount: number;
  listingCount: number;
  unknownCount: number;
} {
  let editorialCount = 0;
  let listingCount = 0;
  let unknownCount = 0;
  for (const resource of resources) {
    if (resource.classification.kind === "editorial") {
      editorialCount += 1;
      continue;
    }
    if (resource.classification.kind === "listing") {
      listingCount += 1;
      continue;
    }
    if (resource.classification.kind === "unknown") {
      unknownCount += 1;
    }
  }
  return {
    editorialCount,
    listingCount,
    unknownCount,
  };
}

function matchesSameDomain(url: string, baseDomain: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname.toLowerCase() === baseDomain.toLowerCase();
  } catch {
    return false;
  }
}

function applyPatternFilters(
  resources: readonly DiscoveredWebsiteResource[],
  config: WebsiteChannelConfig
): DiscoveredWebsiteResource[] {
  const allowPatterns = compilePatterns(config.allowedUrlPatterns);
  const denyPatterns = compilePatterns(config.blockedUrlPatterns);
  return resources.filter((resource) => {
    const parentUrl = resource.parentUrl;
    if (allowPatterns.length > 0 && !allowPatterns.some((pattern) => pattern.test(resource.url))) {
      return false;
    }
    if (parentUrl && denyPatterns.some((pattern) => pattern.test(parentUrl))) {
      return false;
    }
    return !denyPatterns.some((pattern) => pattern.test(resource.url));
  });
}

function selectLatestTimestamp(
  resources: readonly DiscoveredWebsiteResource[],
  markerType: "timestamp" | "lastmod"
): string | null {
  let latest: string | null = null;
  for (const resource of resources) {
    if (resource.freshnessMarkerType !== markerType || !resource.freshnessMarkerValue) {
      continue;
    }
    latest = chooseLatest(latest, resource.freshnessMarkerValue);
  }
  return latest;
}

function matchesCursor(resource: DiscoveredWebsiteResource, cursors: Record<string, CursorSnapshot>): boolean {
  if (resource.freshnessMarkerType === "timestamp" && resource.freshnessMarkerValue) {
    const previous = cursors.timestamp?.cursorValue;
    return previous != null && compareIsoTimestamps(resource.freshnessMarkerValue, previous) <= 0;
  }
  if (resource.freshnessMarkerType === "lastmod" && resource.freshnessMarkerValue) {
    const previous = cursors.lastmod?.cursorValue;
    return previous != null && compareIsoTimestamps(resource.freshnessMarkerValue, previous) <= 0;
  }

  const seenUrls = Array.isArray(cursors.set_diff?.cursorJson?.last_seen_urls)
    ? new Set(
        (cursors.set_diff?.cursorJson?.last_seen_urls as unknown[])
          .filter((item): item is string => typeof item === "string" && item.length > 0)
      )
    : new Set<string>();
  return seenUrls.has(resource.normalizedUrl);
}

function parseCrawlDelay(value: string | null): number | null {
  if (!value) {
    return null;
  }
  const parsed = Number(value.trim());
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  return parsed;
}

export function parseRobotsTxt(body: string): ParsedRobotsPolicy {
  const groups: ParsedRobotsGroup[] = [];
  let current: ParsedRobotsGroup | null = null;

  for (const rawLine of body.split(/\r?\n/)) {
    const commentIndex = rawLine.indexOf("#");
    const line = (commentIndex >= 0 ? rawLine.slice(0, commentIndex) : rawLine).trim();
    if (!line) {
      current = null;
      continue;
    }

    const separatorIndex = line.indexOf(":");
    if (separatorIndex < 0) {
      continue;
    }

    const directive = line.slice(0, separatorIndex).trim().toLowerCase();
    const value = line.slice(separatorIndex + 1).trim();
    if (directive === "user-agent") {
      if (!current) {
        current = {
          agents: [],
          rules: [],
          crawlDelaySeconds: null
        };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      continue;
    }
    if (!current) {
      continue;
    }
    if (directive === "allow" || directive === "disallow") {
      current.rules.push({
        kind: directive,
        pattern: value || "/"
      });
      continue;
    }
    if (directive === "crawl-delay") {
      current.crawlDelaySeconds = parseCrawlDelay(value);
    }
  }

  return { groups };
}

function ruleMatches(pathname: string, pattern: string): boolean {
  const anchored = pattern.endsWith("$");
  const normalizedPattern = anchored ? pattern.slice(0, -1) : pattern;
  const expression = new RegExp(
    `^${normalizedPattern.split("*").map(escapeRegExp).join(".*")}${anchored ? "$" : ""}`
  );
  return expression.test(pathname);
}

function findMatchingGroup(policy: ParsedRobotsPolicy, userAgent: string): ParsedRobotsGroup | null {
  const normalizedAgent = userAgent.trim().toLowerCase();
  let bestMatch: ParsedRobotsGroup | null = null;
  let bestLength = -1;

  for (const group of policy.groups) {
    for (const agent of group.agents) {
      if (agent === "*" || normalizedAgent.startsWith(agent)) {
        const length = agent === "*" ? 0 : agent.length;
        if (length > bestLength) {
          bestMatch = group;
          bestLength = length;
        }
      }
    }
  }

  return bestMatch;
}

export function isAllowedByRobots(body: string | null, rawUrl: string, userAgent: string): boolean {
  if (!body) {
    return true;
  }
  const group = findMatchingGroup(parseRobotsTxt(body), userAgent);
  if (!group) {
    return true;
  }

  const pathname = new URL(rawUrl).pathname || "/";
  const matches = group.rules
    .filter((rule) => ruleMatches(pathname, rule.pattern))
    .sort((left, right) => right.pattern.length - left.pattern.length);
  if (matches.length === 0) {
    return true;
  }
  if (matches.length > 1 && matches[0].pattern.length === matches[1].pattern.length) {
    if (matches[0].kind === "allow" || matches[1].kind === "allow") {
      return true;
    }
  }
  return matches[0]?.kind !== "disallow";
}

function crawlDelayForUserAgent(body: string | null, userAgent: string): number | null {
  if (!body) {
    return null;
  }
  const group = findMatchingGroup(parseRobotsTxt(body), userAgent);
  return group?.crawlDelaySeconds ?? null;
}

function extractSitemapUrlsFromRobots(body: string | null, baseUrl: string): string[] {
  if (!body) {
    return [];
  }
  const urls: string[] = [];
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!/^sitemap:/i.test(line)) {
      continue;
    }
    const value = line.slice(line.indexOf(":") + 1).trim();
    const normalizedUrl = normalizeUrl(value, baseUrl);
    if (normalizedUrl) {
      urls.push(normalizedUrl);
    }
  }
  return Array.from(new Set(urls));
}

export function selectWebsiteDiscoveryModes(
  capabilities: WebsiteCapabilities,
  config: WebsiteChannelConfig
): WebsiteDiscoveryMode[] {
  const modes: WebsiteDiscoveryMode[] = [];
  if (config.collectionDiscoveryEnabled && config.curated.preferCollectionDiscovery) {
    modes.push("collection");
  }
  if (capabilities.sitemapUrls.length > 0 && config.sitemapDiscoveryEnabled) {
    modes.push("sitemap");
  }
  if (capabilities.feedUrls.length > 0 && config.feedDiscoveryEnabled) {
    modes.push("feed");
  }
  if (config.collectionDiscoveryEnabled && !modes.includes("collection")) {
    modes.push("collection");
  }
  if (capabilities.inlineDataHints) {
    modes.push("inline_data");
  }
  if (capabilities.supportsDownloads && config.downloadDiscoveryEnabled) {
    modes.push("download");
  }
  return modes;
}

function evaluateBrowserAssistedDiscoveryRecommendation(input: {
  capabilities: WebsiteCapabilities;
  config: WebsiteChannelConfig;
  staticResourceCount: number;
  staticNoChangeEvidence?: boolean;
  staticEditorialCount?: number;
  staticListingCount?: number;
  staticUnknownCount?: number;
}): { recommended: boolean; reasons: string[] } {
  if (!input.config.browserFallbackEnabled) {
    return { recommended: false, reasons: ["browser_disabled"] };
  }

  const reasons: string[] = [];
  if (input.capabilities.challengeKindHint) {
    reasons.push(`challenge_hint:${input.capabilities.challengeKindHint}`);
  }
  if (input.config.curated.preferBrowserFallback) {
    reasons.push("override:prefer_browser");
  }
  if (input.staticNoChangeEvidence && input.staticResourceCount === 0 && !input.config.curated.preferBrowserFallback) {
    return { recommended: false, reasons: ["static_no_change_empty"] };
  }
  if (input.staticResourceCount === 0) {
    reasons.push("static_empty");
  }
  if (input.capabilities.jsHeavyHint) {
    reasons.push("js_heavy_hint");
  }
  if (input.capabilities.inlineDataHints) {
    reasons.push("inline_data_hint");
  }
  const staticEditorialSufficient =
    (input.staticEditorialCount ?? 0) >= 3 &&
    (input.staticEditorialCount ?? 0) >= Math.max(1, input.staticListingCount ?? 0) &&
    input.staticResourceCount >= 3;
  if (staticEditorialSufficient) {
    reasons.push("static_editorial_sufficient");
  }
  if (
    (input.staticUnknownCount ?? 0) >= 3 &&
    (input.staticUnknownCount ?? 0) >= (input.staticResourceCount - (input.staticListingCount ?? 0))
  ) {
    reasons.push("static_unknown_heavy");
  }
  if (
    (input.staticListingCount ?? 0) > 0 &&
    (input.staticEditorialCount ?? 0) === 0 &&
    input.capabilities.jsHeavyHint
  ) {
    reasons.push("listing_only_static");
  }

  const recommended =
    !staticEditorialSufficient &&
    (input.config.curated.preferBrowserFallback ||
      input.staticResourceCount === 0 ||
      Boolean(input.capabilities.challengeKindHint) ||
      (input.capabilities.jsHeavyHint &&
        input.staticResourceCount < Math.min(2, input.config.maxResourcesPerPoll)) ||
      ((input.capabilities.jsHeavyHint || input.capabilities.inlineDataHints) &&
        (input.staticUnknownCount ?? 0) >= 3) ||
      ((input.capabilities.jsHeavyHint || input.capabilities.inlineDataHints) &&
        (input.staticListingCount ?? 0) > 0 &&
        (input.staticEditorialCount ?? 0) === 0));

  return {
    recommended,
    reasons: Array.from(new Set(reasons)).slice(0, recommended ? 6 : 3),
  };
}

export function shouldAttemptBrowserAssistedDiscovery(input: {
  capabilities: WebsiteCapabilities;
  config: WebsiteChannelConfig;
  staticResourceCount: number;
  staticNoChangeEvidence?: boolean;
}): boolean {
  return evaluateBrowserAssistedDiscoveryRecommendation(input).recommended;
}

function resourceFromUrl(
  rawUrl: string,
  config: WebsiteChannelConfig,
  options: {
    baseUrl?: string;
    title?: string | null;
    summary?: string | null;
    parentUrl?: string | null;
    publishedAt?: string | null;
    modifiedAt?: string | null;
    freshnessMarkerType?: "timestamp" | "lastmod" | "set_diff" | null;
    freshnessMarkerValue?: string | null;
    discoverySource: string;
    structuredTypes?: string[];
    hasRepeatedCards?: boolean;
    hasPagination?: boolean;
    hasDownloads?: boolean;
    overrideKinds?: ResourceKind[];
    rawSignals?: Record<string, unknown>;
  }
): DiscoveredWebsiteResource | null {
  const normalizedUrl = normalizeUrl(rawUrl, options.baseUrl);
  if (!normalizedUrl) {
    return null;
  }
  const hintedKinds = Array.from(
    new Set([
      ...inferResourceKindsFromUrl(normalizedUrl),
      ...resolveCuratedOverrideKinds(normalizedUrl, config),
      ...(options.overrideKinds ?? [])
    ])
  );
  const classification = classifyResourceCandidate({
    url: normalizedUrl,
    title: options.title,
    summary: options.summary,
    hintedKinds,
    overrideKinds: resolveCuratedOverrideKinds(normalizedUrl, config),
    structuredTypes: options.structuredTypes,
    hasRepeatedCards: options.hasRepeatedCards,
    hasPagination: options.hasPagination,
    hasDownloads: options.hasDownloads,
    publishedAtHint: options.publishedAt,
    discoverySource: options.discoverySource
  });
  return {
    url: normalizedUrl,
    normalizedUrl,
    externalResourceId: normalizedUrl,
    title: options.title ?? null,
    summary: options.summary ?? null,
    parentUrl: options.parentUrl ?? null,
    publishedAt: options.publishedAt ?? null,
    modifiedAt: options.modifiedAt ?? null,
    freshnessMarkerType: options.freshnessMarkerType ?? null,
    freshnessMarkerValue: options.freshnessMarkerValue ?? null,
    discoverySource: options.discoverySource,
    hintedKinds,
    classification,
    rawSignals: options.rawSignals ?? {}
  };
}

function hasAuthorizationHeaderConfigured(authContext?: WebsiteAuthContext): boolean {
  return Boolean(
    authContext && parseSourceChannelAuthConfig(authContext.authConfig).authorizationHeader
  );
}

export function buildWebsiteRequestHeaders(input: {
  requestUrl: string;
  channelUrl: string | null | undefined;
  authConfig: unknown;
  headers?: HeadersInit;
}): Headers {
  const requestHeaders = new Headers(input.headers);
  const authorizationHeader = resolveSourceChannelAuthorizationHeader(
    input.requestUrl,
    input.channelUrl,
    input.authConfig
  );
  if (authorizationHeader) {
    requestHeaders.set("authorization", authorizationHeader);
  }
  return requestHeaders;
}

export function buildBrowserRouteHeaders(input: {
  requestUrl: string;
  channelUrl: string | null | undefined;
  authConfig: unknown;
  headers?: Record<string, string>;
}): Record<string, string> {
  const normalizedHeaders = buildWebsiteRequestHeaders({
    requestUrl: input.requestUrl,
    channelUrl: input.channelUrl,
    authConfig: input.authConfig,
    headers: input.headers
  });
  const serializedHeaders: Record<string, string> = {};
  normalizedHeaders.forEach((value, key) => {
    serializedHeaders[key] = value;
  });
  return serializedHeaders;
}

async function fetchTextWithAuth(
  url: string,
  timeoutMs: number,
  headers?: HeadersInit,
  authContext?: WebsiteAuthContext,
  conditional?: {
    role: ConditionalFetchRole;
    key?: string;
    requestValidators: Record<string, WebsiteConditionalRequestState>;
    responseCache: Record<string, WebsiteCachedTextResponseState>;
    conditionalRequestHits?: WebsiteConditionalRequestHits;
    cacheBody?: boolean;
  }
): Promise<{
  url: string;
  status: number;
  text: string;
  contentType: string | null;
  etag: string | null;
  lastModified: string | null;
  conditionalHit: boolean;
  reusedCachedBody: boolean;
}> {
  const conditionalKey = conditional?.key ?? buildConditionalStateKey(conditional?.role ?? "homepage", url);
  const priorValidator = conditional ? conditional.requestValidators[conditionalKey] : undefined;
  const response = await fetch(url, {
    headers: (() => {
      const requestHeaders = authContext
        ? buildWebsiteRequestHeaders({
            requestUrl: url,
            channelUrl: authContext.channelUrl,
            authConfig: authContext.authConfig,
            headers
          })
        : new Headers(headers);
      if (priorValidator?.etag) {
        requestHeaders.set("if-none-match", priorValidator.etag);
      }
      if (priorValidator?.lastModified) {
        requestHeaders.set("if-modified-since", priorValidator.lastModified);
      }
      return requestHeaders;
    })(),
    signal: AbortSignal.timeout(timeoutMs),
    redirect: "follow"
  });
  const now = new Date().toISOString();
  const etag = response.headers.get("etag");
  const lastModified = response.headers.get("last-modified");
  if (response.status === 304) {
    const cached = conditional ? conditional.responseCache[conditionalKey] : undefined;
    if (conditional) {
      conditional.requestValidators[conditionalKey] = {
        etag: etag ?? priorValidator?.etag ?? null,
        lastModified: lastModified ?? priorValidator?.lastModified ?? null,
        finalUrl: response.url || priorValidator?.finalUrl || url,
        contentType: cached?.contentType ?? priorValidator?.contentType ?? response.headers.get("content-type"),
        httpStatus: cached?.status ?? priorValidator?.httpStatus ?? 304,
        updatedAt: now,
      };
      if (cached) {
        conditional.responseCache[conditionalKey] = {
          ...cached,
          updatedAt: now,
        };
      }
      if (conditional.conditionalRequestHits) {
        conditional.conditionalRequestHits[conditional.role] += 1;
      }
    }
    return {
      url: cached?.url ?? response.url,
      status: response.status,
      text: cached?.text ?? "",
      contentType: cached?.contentType ?? response.headers.get("content-type"),
      etag: etag ?? priorValidator?.etag ?? null,
      lastModified: lastModified ?? priorValidator?.lastModified ?? null,
      conditionalHit: true,
      reusedCachedBody: Boolean(cached?.text),
    };
  }
  const text = await response.text();
  if (conditional) {
    conditional.requestValidators[conditionalKey] = {
      etag: etag ?? null,
      lastModified: lastModified ?? null,
      finalUrl: response.url,
      contentType: response.headers.get("content-type"),
      httpStatus: response.status,
      updatedAt: now,
    };
    if (conditional.cacheBody && response.status === 200) {
      conditional.responseCache[conditionalKey] = {
        url: response.url,
        status: response.status,
        contentType: response.headers.get("content-type"),
        text,
        updatedAt: now,
      };
    }
  }
  return {
    url: response.url,
    status: response.status,
    text,
    contentType: response.headers.get("content-type"),
    etag,
    lastModified,
    conditionalHit: false,
    reusedCachedBody: false,
  };
}

export class CrawlPolicyCacheService {
  constructor(private readonly pool: Pool) {}

  async getPolicy(
    rawUrl: string,
    userAgent: string,
    requestTimeoutMs: number,
    authContext?: WebsiteAuthContext
  ): Promise<RuntimeCrawlPolicy> {
    const parsedUrl = new URL(rawUrl);
    const domain = parsedUrl.hostname.toLowerCase();
    const cached = await this.loadRow(domain);
    if (hasAuthorizationHeaderConfigured(authContext)) {
      const liveRow = await this.fetchPolicyRow(
        rawUrl,
        userAgent,
        requestTimeoutMs,
        authContext,
        cached
      );
      return this.buildRuntimePolicy(liveRow, userAgent);
    }

    if (cached && Date.parse(cached.expires_at) > Date.now()) {
      return this.buildRuntimePolicy(cached, userAgent);
    }

    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("select pg_advisory_xact_lock(hashtext($1))", [domain]);
      const insideTransaction = await this.loadRow(domain, client);
      if (insideTransaction && Date.parse(insideTransaction.expires_at) > Date.now()) {
        await client.query("commit");
        return this.buildRuntimePolicy(insideTransaction, userAgent);
      }

      const row = await this.fetchPolicyRow(
        rawUrl,
        userAgent,
        requestTimeoutMs,
        undefined,
        insideTransaction ?? cached
      );

      await client.query(
        `
          insert into crawl_policy_cache (
            domain,
            robots_txt_url,
            robots_txt_body,
            sitemap_urls,
            feed_urls,
            llms_txt_url,
            llms_txt_body,
            request_validators_json,
            response_cache_json,
            fetched_at,
            expires_at,
            fetch_error,
            http_status
          )
          values ($1, $2, $3, $4::text[], $5::text[], $6, $7, $8::jsonb, $9::jsonb, $10, $11, $12, $13)
          on conflict (domain)
          do update
          set
            robots_txt_url = excluded.robots_txt_url,
            robots_txt_body = excluded.robots_txt_body,
            sitemap_urls = excluded.sitemap_urls,
            feed_urls = excluded.feed_urls,
            llms_txt_url = excluded.llms_txt_url,
            llms_txt_body = excluded.llms_txt_body,
            request_validators_json = excluded.request_validators_json,
            response_cache_json = excluded.response_cache_json,
            fetched_at = excluded.fetched_at,
            expires_at = excluded.expires_at,
            fetch_error = excluded.fetch_error,
            http_status = excluded.http_status
        `,
        [
          row.domain,
          row.robots_txt_url,
          row.robots_txt_body,
          row.sitemap_urls,
          row.feed_urls,
          row.llms_txt_url,
          row.llms_txt_body,
          JSON.stringify(row.request_validators_json ?? {}),
          JSON.stringify(row.response_cache_json ?? {}),
          row.fetched_at,
          row.expires_at,
          row.fetch_error,
          row.http_status
        ]
      );
      await client.query("commit");
      return this.buildRuntimePolicy(row, userAgent);
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  private async fetchPolicyRow(
    rawUrl: string,
    userAgent: string,
    requestTimeoutMs: number,
    authContext?: WebsiteAuthContext,
    previousRow?: CrawlPolicyCacheRow | null
  ): Promise<CrawlPolicyCacheRow> {
    const parsedUrl = new URL(rawUrl);
    const domain = parsedUrl.hostname.toLowerCase();
    const baseOrigin = parsedUrl.origin;
    const requestValidators = readConditionalRequestStates(previousRow?.request_validators_json);
    const responseCache = readCachedTextResponses(previousRow?.response_cache_json);
    const conditionalRequestHits = createEmptyConditionalRequestHits();
    let robotsBody: string | null = null;
    let llmsTxtBody: string | null = null;
    let httpStatus: number | null = null;
    let fetchError: string | null = null;
    let sitemapUrls: string[] = [];
    let feedUrls: string[] = [];

    try {
      const robotsResponse = await fetchTextWithAuth(
        `${baseOrigin}/robots.txt`,
        Math.min(requestTimeoutMs, 5000),
        { "user-agent": userAgent },
        authContext,
        {
          role: "robots",
          requestValidators,
          responseCache,
          conditionalRequestHits,
          cacheBody: true,
        }
      );
      httpStatus = robotsResponse.status;
      if (robotsResponse.status === 200 || (robotsResponse.status === 304 && robotsResponse.reusedCachedBody)) {
        robotsBody = robotsResponse.text;
        sitemapUrls = extractSitemapUrlsFromRobots(robotsBody, baseOrigin);
      } else if (![404, 410].includes(robotsResponse.status)) {
        fetchError = `HTTP ${robotsResponse.status}`;
      }
    } catch (error) {
      fetchError = error instanceof Error ? error.message : "robots_fetch_failed";
    }

    try {
      const homepage = await fetchTextWithAuth(
        `${baseOrigin}/`,
        Math.min(requestTimeoutMs, 5000),
        { "user-agent": userAgent, accept: "text/html,application/xhtml+xml" },
        authContext,
        {
          role: "homepage",
          requestValidators,
          responseCache,
          conditionalRequestHits,
          cacheBody: true,
        }
      );
      if (homepage.status === 200 || (homepage.status === 304 && homepage.reusedCachedBody)) {
        feedUrls = extractLinkTagUrls(homepage.text, homepage.url, ["rss", "atom", "xml"]);
      }
    } catch {
      // best effort
    }

    try {
      const llms = await fetchTextWithAuth(
        `${baseOrigin}/llms.txt`,
        Math.min(requestTimeoutMs, 3000),
        { "user-agent": userAgent, accept: "text/plain,text/markdown" },
        authContext,
        {
          role: "llms",
          requestValidators,
          responseCache,
          conditionalRequestHits,
          cacheBody: true,
        }
      );
      if (llms.status === 200 || (llms.status === 304 && llms.reusedCachedBody)) {
        llmsTxtBody = llms.text;
      }
    } catch {
      // best effort
    }

    const ttlMs = fetchError ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
    return {
      domain,
      robots_txt_url: `${baseOrigin}/robots.txt`,
      robots_txt_body: robotsBody,
      sitemap_urls: sitemapUrls,
      feed_urls: feedUrls,
      llms_txt_url: `${baseOrigin}/llms.txt`,
      llms_txt_body: llmsTxtBody,
      request_validators_json: requestValidators,
      response_cache_json: responseCache,
      fetched_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + ttlMs).toISOString(),
      fetch_error: fetchError,
      http_status: httpStatus,
      conditional_request_hits: conditionalRequestHits
    };
  }

  private async loadRow(domain: string, client?: { query: Pool["query"] }): Promise<CrawlPolicyCacheRow | null> {
    const executor = client ?? this.pool;
    const result = await executor.query<CrawlPolicyCacheRow>(
      `
        select
          domain,
          robots_txt_url,
          robots_txt_body,
          sitemap_urls,
          feed_urls,
          llms_txt_url,
          llms_txt_body,
          request_validators_json,
          response_cache_json,
          fetched_at::text,
          expires_at::text,
          fetch_error,
          http_status
        from crawl_policy_cache
        where domain = $1
        limit 1
      `,
      [domain]
    );
    return result.rows[0] ?? null;
  }

  private buildRuntimePolicy(row: CrawlPolicyCacheRow, userAgent: string): RuntimeCrawlPolicy {
    return {
      domain: row.domain,
      sitemapUrls: row.sitemap_urls ?? [],
      feedUrls: row.feed_urls ?? [],
      llmsTxtBody: row.llms_txt_body,
      fetchedAt: row.fetched_at,
      expiresAt: row.expires_at,
      fetchError: row.fetch_error,
      httpStatus: row.http_status,
      requestValidators: readConditionalRequestStates(row.request_validators_json),
      responseCache: readCachedTextResponses(row.response_cache_json),
      conditionalRequestHits: cloneConditionalRequestHits(row.conditional_request_hits),
      isAllowed: (rawUrl, agent) => isAllowedByRobots(row.robots_txt_body, rawUrl, agent || userAgent),
      crawlDelaySeconds: (agent) => crawlDelayForUserAgent(row.robots_txt_body, agent || userAgent)
    };
  }

  async persistConditionalState(
    rawUrl: string,
    state: {
      requestValidators: Record<string, WebsiteConditionalRequestState>;
      responseCache: Record<string, WebsiteCachedTextResponseState>;
    },
    authContext?: WebsiteAuthContext
  ): Promise<void> {
    if (hasAuthorizationHeaderConfigured(authContext)) {
      return;
    }
    const domain = new URL(rawUrl).hostname.toLowerCase();
    await this.pool.query(
      `
        update crawl_policy_cache
        set
          request_validators_json = $2::jsonb,
          response_cache_json = $3::jsonb
        where domain = $1
      `,
      [domain, JSON.stringify(state.requestValidators), JSON.stringify(state.responseCache)]
    );
  }
}

export async function probeWebsiteCapabilities(
  channelUrl: string,
  policy: RuntimeCrawlPolicy,
  config: WebsiteChannelConfig
): Promise<WebsiteCapabilities> {
  const contentTypes: string[] = [];
  const homepageKey = buildConditionalStateKey("homepage", channelUrl);
  const homepage = policy.responseCache[homepageKey];
  const homepageState = policy.requestValidators[homepageKey];
  if (homepage?.contentType) {
    contentTypes.push(homepage.contentType);
  } else if (homepageState?.contentType) {
    contentTypes.push(homepageState.contentType);
  }
  const homepageStatus = homepage?.status ?? homepageState?.httpStatus ?? null;
  if (!homepage || homepage.status !== 200) {
    return {
      sitemapUrls: policy.sitemapUrls,
      feedUrls: policy.feedUrls,
      inlineDataHints: false,
      jsHeavyHint: false,
      challengeKindHint: null,
      supportsDownloads: false,
      defaultCollectionUrls: [],
      contentTypes,
      homepageHtml: null,
      homepageStatus
    };
  }
  const feedUrls = Array.from(
    new Set([
      ...policy.feedUrls,
      ...extractLinkTagUrls(homepage.text, homepage.url, ["rss", "atom", "xml"])
    ])
  );
  return {
    sitemapUrls: policy.sitemapUrls,
    feedUrls,
    inlineDataHints: detectInlineDataHint(homepage.text),
    jsHeavyHint: detectJsHeavyHint(homepage.text),
    challengeKindHint: detectWebsiteChallengeKind(homepage.text),
    supportsDownloads:
      extractDownloadUrls(homepage.text, homepage.url, config.downloadPatterns).length > 0,
    defaultCollectionUrls: extractDefaultCollectionUrls(homepage.text, homepage.url),
    contentTypes,
    homepageHtml: homepage.text,
    homepageStatus: homepage.status
  };
}

async function discoverFromSitemaps(
  sitemapUrls: readonly string[],
  policy: RuntimeCrawlPolicy,
  config: WebsiteChannelConfig,
  baseDomain: string,
  conditionalState: {
    requestValidators: Record<string, WebsiteConditionalRequestState>;
    responseCache: Record<string, WebsiteCachedTextResponseState>;
    conditionalRequestHits: WebsiteConditionalRequestHits;
  },
  authContext?: WebsiteAuthContext
): Promise<DiscoveredWebsiteResource[]> {
  const resources: DiscoveredWebsiteResource[] = [];
  const queue = sitemapUrls.map((url) => ({ url, depth: 0 }));
  const visited = new Set<string>();

  while (queue.length > 0 && visited.size < MAX_SITEMAP_FETCHES) {
    const current = queue.shift();
    if (!current || visited.has(current.url) || current.depth > MAX_SITEMAP_DEPTH) {
      continue;
    }
    visited.add(current.url);
    if (!policy.isAllowed(current.url, config.userAgent)) {
      continue;
    }
    let response: Awaited<ReturnType<typeof fetchTextWithAuth>>;
    try {
      response = await fetchTextWithAuth(
        current.url,
        config.requestTimeoutMs,
        {
          "user-agent": config.userAgent,
          accept: "application/xml,text/xml"
        },
        authContext,
        {
          role: "sitemap",
          key: buildConditionalStateKey("sitemap", current.url),
          requestValidators: conditionalState.requestValidators,
          responseCache: conditionalState.responseCache,
          conditionalRequestHits: conditionalState.conditionalRequestHits,
          cacheBody: false,
        }
      );
    } catch {
      continue;
    }
    if (response.status === 304) {
      continue;
    }
    if (response.status !== 200) {
      continue;
    }

    const isSitemapIndex = /<sitemapindex\b/i.test(response.text);
    if (isSitemapIndex) {
      for (const entry of parseXmlEntries(response.text, "sitemap")) {
        const normalizedUrl = normalizeUrl(entry.loc, current.url);
        if (normalizedUrl) {
          queue.push({ url: normalizedUrl, depth: current.depth + 1 });
        }
      }
      continue;
    }

    const structuredTypes = /news:/i.test(response.text) ? ["NewsArticle"] : [];
    for (const entry of parseXmlEntries(response.text, "url")) {
      const normalizedUrl = normalizeUrl(entry.loc, current.url);
      if (!normalizedUrl || !matchesSameDomain(normalizedUrl, baseDomain)) {
        continue;
      }
      const resource = resourceFromUrl(normalizedUrl, config, {
        discoverySource: "sitemap",
        modifiedAt: entry.lastmod,
        freshnessMarkerType: entry.lastmod ? "lastmod" : null,
        freshnessMarkerValue: entry.lastmod,
        structuredTypes,
        rawSignals: {
          sitemapUrl: current.url
        }
      });
      if (resource) {
        resources.push(resource);
      }
    }
  }
  return resources;
}

async function discoverFromFeeds(
  feedUrls: readonly string[],
  config: WebsiteChannelConfig,
  baseDomain: string,
  conditionalState: {
    requestValidators: Record<string, WebsiteConditionalRequestState>;
    responseCache: Record<string, WebsiteCachedTextResponseState>;
    conditionalRequestHits: WebsiteConditionalRequestHits;
  },
  authContext?: WebsiteAuthContext
): Promise<DiscoveredWebsiteResource[]> {
  const resources: DiscoveredWebsiteResource[] = [];
  for (const feedUrl of feedUrls.slice(0, MAX_COLLECTION_FETCHES)) {
    try {
      const response = await fetchTextWithAuth(
        feedUrl,
        config.requestTimeoutMs,
        {
          "user-agent": config.userAgent,
          accept:
            "application/feed+json, application/json;q=0.95, application/atom+xml;q=0.92, application/rss+xml;q=0.9, application/xml;q=0.85, text/xml;q=0.8"
        },
        authContext,
        {
          role: "feed",
          key: buildConditionalStateKey("feed", feedUrl),
          requestValidators: conditionalState.requestValidators,
          responseCache: conditionalState.responseCache,
          conditionalRequestHits: conditionalState.conditionalRequestHits,
          cacheBody: false,
        }
      );
      if (response.status === 304) {
        continue;
      }
      if (response.status !== 200) {
        continue;
      }
      const parsedFeed = parseFeed({
        body: response.text,
        contentType: response.contentType
      });
      for (const entry of parsedFeed.entries.slice(0, config.maxResourcesPerPoll)) {
        if (!entry.url) {
          continue;
        }
        const normalizedUrl = normalizeUrl(entry.url);
        if (!normalizedUrl || !matchesSameDomain(normalizedUrl, baseDomain)) {
          continue;
        }
        const resource = resourceFromUrl(normalizedUrl, config, {
          title: entry.title,
          summary: normalizeText(entry.summaryHtml),
          publishedAt: entry.publishedAt,
          modifiedAt: entry.publishedAt,
          freshnessMarkerType: entry.publishedAt ? "timestamp" : null,
          freshnessMarkerValue: entry.publishedAt,
          discoverySource: "feed",
          structuredTypes: ["Article"],
          rawSignals: {
            feedUrl
          }
        });
        if (resource) {
          resources.push(resource);
        }
      }
    } catch {
      continue;
    }
  }
  return resources;
}

async function discoverFromCollectionPages(
  channelUrl: string,
  capabilities: WebsiteCapabilities,
  policy: RuntimeCrawlPolicy,
  config: WebsiteChannelConfig,
  baseDomain: string,
  authContext?: WebsiteAuthContext
): Promise<DiscoveredWebsiteResource[]> {
  const seedUrls = selectCollectionSeedUrls({
    channelUrl,
    defaultCollectionUrls: capabilities.defaultCollectionUrls,
    configuredSeedUrls: config.collectionSeedUrls,
  });
  const resources: DiscoveredWebsiteResource[] = [];

  for (const seedUrl of seedUrls) {
    if (!policy.isAllowed(seedUrl, config.userAgent)) {
      continue;
    }
    try {
      const response = await fetchTextWithAuth(
        seedUrl,
        config.requestTimeoutMs,
        {
          "user-agent": config.userAgent,
          accept: "text/html,application/xhtml+xml"
        },
        authContext
      );
      if (response.status !== 200 || !(response.contentType ?? "").includes("html")) {
        continue;
      }
      if (detectWebsiteChallengeKind(response.text)) {
        continue;
      }
      const links = extractCollectionLinkCandidates(response.text, response.url);
      const hasRepeatedCards = links.length >= 8;
      const hasPagination = /\b(page|pagination|next)\b/i.test(response.text);
      const structuredTypes = parseJsonLdTypes(response.text);
      const seedRelatedToChannel = shouldKeepDefaultCollectionSeed(channelUrl, seedUrl);
      for (const link of links) {
        if (!matchesSameDomain(link.url, baseDomain) || link.url === seedUrl || FEED_HINT_PATTERN.test(link.url)) {
          continue;
        }
        if (DOWNLOAD_EXTENSION_PATTERN.test(link.url)) {
          continue;
        }
        const linkKinds = inferResourceKindsFromUrl(link.url);
        const strongDetailCandidate =
          Boolean(link.publishedAt) ||
          ((link.summary?.length ?? 0) >= 80 && isLikelyContentContext(link.summary)) ||
          linkKinds.includes("editorial");
        if (!seedRelatedToChannel && !strongDetailCandidate) {
          continue;
        }
        const resource = resourceFromUrl(link.url, config, {
          title: link.text || null,
          summary: link.summary,
          parentUrl: seedUrl,
          publishedAt: link.publishedAt,
          freshnessMarkerType: "set_diff",
          freshnessMarkerValue: null,
          discoverySource: "collection_page",
          structuredTypes,
          hasRepeatedCards,
          hasPagination,
          rawSignals: {
            parentUrl: seedUrl,
            collectionPublishedAt: link.publishedAt,
            collectionSummary: link.summary,
          }
        });
        if (resource) {
          resources.push(resource);
        }
      }
    } catch {
      continue;
    }
  }
  return resources;
}

function discoverFromInlineData(
  channelUrl: string,
  capabilities: WebsiteCapabilities,
  config: WebsiteChannelConfig,
  baseDomain: string
): DiscoveredWebsiteResource[] {
  if (!capabilities.homepageHtml) {
    return [];
  }
  const urls = extractInlineDataUrls(capabilities.homepageHtml, channelUrl);
  const resources: DiscoveredWebsiteResource[] = [];
  for (const url of urls) {
    if (!matchesSameDomain(url, baseDomain) || FEED_HINT_PATTERN.test(url)) {
      continue;
    }
    const resource = resourceFromUrl(url, config, {
      discoverySource: "inline_data",
      freshnessMarkerType: "set_diff",
      freshnessMarkerValue: null,
      rawSignals: {
        source: "__NEXT_DATA__"
      }
    });
    if (resource) {
      resources.push(resource);
    }
  }
  return resources;
}

function discoverFromDownloads(
  channelUrl: string,
  capabilities: WebsiteCapabilities,
  config: WebsiteChannelConfig,
  baseDomain: string
): DiscoveredWebsiteResource[] {
  if (!capabilities.homepageHtml) {
    return [];
  }
  const downloadUrls = extractDownloadUrls(
    capabilities.homepageHtml,
    channelUrl,
    config.downloadPatterns
  );
  const resources: DiscoveredWebsiteResource[] = [];
  for (const url of downloadUrls) {
    if (!matchesSameDomain(url, baseDomain)) {
      continue;
    }
    const resource = resourceFromUrl(url, config, {
      discoverySource: "download",
      freshnessMarkerType: "set_diff",
      freshnessMarkerValue: null,
      hasDownloads: true,
      rawSignals: {
        parentUrl: channelUrl
      }
    });
    if (resource) {
      resources.push(resource);
    }
  }
  return resources;
}

interface BrowserSeedCapture {
  resources: DiscoveredWebsiteResource[];
  finalUrl: string;
  title: string;
  listingUrls: string[];
  documentUrls: string[];
  detailCountEstimate: number;
  listingCountEstimate: number;
  documentCountEstimate: number;
  datePatternsFound: boolean;
  challengeKind: WebsiteChallengeKind | null;
}

function buildBrowserDiscoveryRawSignals(input: {
  browserPageUrl: string;
  browserSeedUrl: string;
  captureSource: "dom" | "network";
  jsHeavyHint: boolean;
  challengeKind: WebsiteChallengeKind | null;
}): Record<string, unknown> {
  return {
    browserAssisted: true,
    browserCaptureSource: input.captureSource,
    browserPageUrl: input.browserPageUrl,
    browserSeedUrl: input.browserSeedUrl,
    browserJsHeavyHint: input.jsHeavyHint,
    browserChallengeKind: input.challengeKind,
  };
}

async function captureBrowserSeedPage(input: {
  page: any;
  seedUrl: string;
  baseDomain: string;
  config: WebsiteChannelConfig;
  capabilities: WebsiteCapabilities;
  deadlineAt: number;
  authContext?: WebsiteAuthContext;
}): Promise<BrowserSeedCapture> {
  const networkCandidateUrls = new Set<string>();
  const networkTasks: Promise<void>[] = [];
  input.page.on("response", (response: any) => {
    if (!input.config.extraction.allowBrowserNetworkCapture) {
      return;
    }
    networkTasks.push(
      (async () => {
        const responseUrl = String(response.url?.() ?? "");
        if (!responseUrl || !matchesSameDomain(responseUrl, input.baseDomain)) {
          return;
        }
        const headers = typeof response.headers === "function" ? response.headers() : {};
        const contentType = String(headers["content-type"] ?? headers["Content-Type"] ?? "").toLowerCase();
        if (contentType.includes("json")) {
          try {
            const payload = await response.text();
            const parsed = JSON.parse(payload) as unknown;
            extractJsonUrls(parsed, responseUrl, networkCandidateUrls);
          } catch {
            // best effort only
          }
        }
        if (
          contentType.includes("html") ||
          contentType.includes("json") ||
          DOWNLOAD_EXTENSION_PATTERN.test(responseUrl)
        ) {
          const normalizedUrl = normalizeUrl(responseUrl);
          if (normalizedUrl) {
            networkCandidateUrls.add(normalizedUrl);
          }
        }
      })()
    );
  });

  const remainingBudgetMs = Math.max(2000, input.deadlineAt - Date.now());
  const pageTimeoutMs = Math.max(2000, Math.min(input.config.requestTimeoutMs, remainingBudgetMs));
  if (input.authContext) {
    const authContext = input.authContext;
    await input.page.route("**/*", async (route: any) => {
      await route.continue({
        headers: buildBrowserRouteHeaders({
          requestUrl: String(route.request().url?.() ?? ""),
          channelUrl: authContext.channelUrl,
          authConfig: authContext.authConfig,
          headers: route.request().headers?.() ?? {}
        })
      });
    });
  }
  await input.page.goto(input.seedUrl, {
    waitUntil: "domcontentloaded",
    timeout: pageTimeoutMs,
  });
  try {
    await input.page.waitForLoadState("networkidle", {
      timeout: Math.max(1000, Math.min(5000, pageTimeoutMs)),
    });
  } catch {
    // Some JS-heavy sites never become fully idle; DOM content is enough for bounded probing.
  }
  await Promise.allSettled(networkTasks);

  const finalUrl = String(input.page.url?.() ?? input.seedUrl);
  const html = String(await input.page.content());
  const bodyText = String((await input.page.textContent("body").catch(() => "")) ?? "");
  const challengeKind = detectWebsiteChallengeKind(html, bodyText);
  const title =
    readOptionalString((await input.page.title().catch(() => "")) ?? "") ??
    readOptionalString(extractHtmlTitle(html)) ??
    new URL(finalUrl).hostname;
  const structuredTypes = parseJsonLdTypes(html);
  const links = extractAnchorLinks(html, finalUrl);
  const listingUrls = links
    .map((link) => link.url)
    .filter((url, index, items) =>
      index === items.indexOf(url) &&
      matchesSameDomain(url, input.baseDomain) &&
      inferResourceKindsFromUrl(url).includes("listing")
    )
    .slice(0, 10);
  const documentUrls = extractDownloadUrls(html, finalUrl, input.config.downloadPatterns)
    .filter((url, index, items) => index === items.indexOf(url) && matchesSameDomain(url, input.baseDomain))
    .slice(0, 10);

  if (challengeKind) {
    return {
      resources: [],
      finalUrl,
      title,
      listingUrls,
      documentUrls,
      detailCountEstimate: 0,
      listingCountEstimate: listingUrls.length,
      documentCountEstimate: documentUrls.length,
      datePatternsFound: false,
      challengeKind,
    };
  }

  const hasRepeatedCards = links.length >= 8;
  const hasPagination = /\b(page|pagination|next)\b/i.test(html);
  const datePatternsFound =
    /\b20\d{2}-\d{2}-\d{2}\b/.test(bodyText) ||
    /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2},\s+20\d{2}\b/i.test(bodyText);
  const resources: DiscoveredWebsiteResource[] = [];

  for (const link of links) {
    if (!matchesSameDomain(link.url, input.baseDomain) || link.url === finalUrl || FEED_HINT_PATTERN.test(link.url)) {
      continue;
    }
    const resource = resourceFromUrl(link.url, input.config, {
      title: link.text || null,
      parentUrl: finalUrl,
      freshnessMarkerType: "set_diff",
      freshnessMarkerValue: null,
      discoverySource: DOWNLOAD_EXTENSION_PATTERN.test(link.url)
        ? "browser_assisted_download"
        : "browser_assisted_dom",
      structuredTypes,
      hasRepeatedCards,
      hasPagination,
      hasDownloads: documentUrls.length > 0,
      rawSignals: buildBrowserDiscoveryRawSignals({
        browserPageUrl: finalUrl,
        browserSeedUrl: input.seedUrl,
        captureSource: "dom",
        jsHeavyHint: input.capabilities.jsHeavyHint,
        challengeKind,
      }),
    });
    if (resource) {
      resources.push(resource);
    }
  }

  for (const networkUrl of networkCandidateUrls) {
    if (
      !matchesSameDomain(networkUrl, input.baseDomain) ||
      networkUrl === finalUrl ||
      FEED_HINT_PATTERN.test(networkUrl)
    ) {
      continue;
    }
    const resource = resourceFromUrl(networkUrl, input.config, {
      parentUrl: finalUrl,
      freshnessMarkerType: "set_diff",
      freshnessMarkerValue: null,
      discoverySource: "browser_assisted_network",
      hasDownloads: DOWNLOAD_EXTENSION_PATTERN.test(networkUrl),
      rawSignals: buildBrowserDiscoveryRawSignals({
        browserPageUrl: finalUrl,
        browserSeedUrl: input.seedUrl,
        captureSource: "network",
        jsHeavyHint: input.capabilities.jsHeavyHint,
        challengeKind,
      }),
    });
    if (resource) {
      resources.push(resource);
    }
  }

  const deduped = dedupeResources(resources);
  const detailCountEstimate = deduped.filter((resource) =>
    ["editorial", "entity"].includes(resource.classification.kind)
  ).length;
  const listingCountEstimate =
    listingUrls.length ||
    deduped.filter((resource) => resource.classification.kind === "listing").length;
  const documentCountEstimate =
    documentUrls.length ||
    deduped.filter((resource) => ["document", "data_file"].includes(resource.classification.kind)).length;

  return {
    resources: deduped,
    finalUrl,
    title,
    listingUrls,
    documentUrls,
    detailCountEstimate,
    listingCountEstimate,
    documentCountEstimate,
    datePatternsFound,
    challengeKind,
  };
}

async function discoverFromBrowserAssisted(input: {
  channelUrl: string;
  capabilities: WebsiteCapabilities;
  config: WebsiteChannelConfig;
  baseDomain: string;
  authContext?: WebsiteAuthContext;
}): Promise<{
  resources: DiscoveredWebsiteResource[];
  listingUrls: string[];
  documentUrls: string[];
  title: string | null;
  finalUrl: string;
  challengeKind: WebsiteChallengeKind | null;
  datePatternsFound: boolean;
}> {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: input.config.userAgent,
  });
  const deadlineAt = Date.now() + Math.max(input.config.requestTimeoutMs, input.config.totalPollTimeoutMs);
  const seedUrls = Array.from(
    selectCollectionSeedUrls({
      channelUrl: input.channelUrl,
      defaultCollectionUrls: input.capabilities.defaultCollectionUrls,
      configuredSeedUrls: input.config.collectionSeedUrls,
    })
  ).slice(0, Math.max(1, input.config.maxBrowserFetchesPerPoll));

  const listingUrls = new Set<string>();
  const documentUrls = new Set<string>();
  const discovered: DiscoveredWebsiteResource[] = [];
  let title: string | null = null;
  let finalUrl = input.channelUrl;
  let datePatternsFound = false;
  let challengeKind: WebsiteChallengeKind | null = input.capabilities.challengeKindHint;

  try {
    for (const seedUrl of seedUrls) {
      if (Date.now() >= deadlineAt) {
        break;
      }
      const page = await context.newPage();
      try {
        const capture = await captureBrowserSeedPage({
          page,
          seedUrl,
          baseDomain: input.baseDomain,
          config: input.config,
          capabilities: input.capabilities,
          deadlineAt,
          authContext: input.authContext,
        });
        title = title ?? capture.title;
        finalUrl = capture.finalUrl || finalUrl;
        datePatternsFound = datePatternsFound || capture.datePatternsFound;
        capture.listingUrls.forEach((url) => listingUrls.add(url));
        capture.documentUrls.forEach((url) => documentUrls.add(url));
        if (capture.challengeKind) {
          challengeKind = capture.challengeKind;
          break;
        }
        appendItems(discovered, capture.resources);
      } finally {
        await page.close().catch(() => undefined);
      }
    }
  } finally {
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }

  return {
    resources: dedupeResources(discovered),
    listingUrls: Array.from(listingUrls).slice(0, 10),
    documentUrls: Array.from(documentUrls).slice(0, 10),
    title,
    finalUrl,
    challengeKind,
    datePatternsFound,
  };
}

function classifyWebsiteProbeFromResources(input: {
  resources: readonly DiscoveredWebsiteResource[];
  discoveredFeedUrls: readonly string[];
  challengeKind: WebsiteChallengeKind | null;
}): { kind: ResourceKind; confidence: number; reasons: string[] } {
  if (input.challengeKind) {
    return {
      kind: "unknown",
      confidence: 0.2,
      reasons: [`challenge:${input.challengeKind}`],
    };
  }
  const editorialCount = input.resources.filter((item) => item.classification.kind === "editorial").length;
  const listingCount = input.resources.filter((item) => item.classification.kind === "listing").length;
  const entityCount = input.resources.filter((item) => item.classification.kind === "entity").length;
  const documentCount = input.resources.filter((item) =>
    ["document", "data_file"].includes(item.classification.kind)
  ).length;
  if (editorialCount > 0) {
    return {
      kind: "editorial",
      confidence: Number(Math.min(0.95, 0.72 + editorialCount * 0.04).toFixed(2)),
      reasons: [
        "detail:editorial",
        ...(input.discoveredFeedUrls.length > 0 ? ["hint:feed"] : []),
      ],
    };
  }
  if (listingCount > 0) {
    return {
      kind: "listing",
      confidence: Number(Math.min(0.9, 0.64 + listingCount * 0.04).toFixed(2)),
      reasons: ["layout:listing"],
    };
  }
  if (entityCount > 0) {
    return {
      kind: "entity",
      confidence: Number(Math.min(0.9, 0.62 + entityCount * 0.04).toFixed(2)),
      reasons: ["detail:entity"],
    };
  }
  if (documentCount > 0) {
    return {
      kind: "document",
      confidence: Number(Math.min(0.88, 0.58 + documentCount * 0.04).toFixed(2)),
      reasons: ["layout:downloads"],
    };
  }
  return {
    kind: "unknown",
    confidence: 0.2,
    reasons: ["probe:no_resources"],
  };
}

function buildDiscoveryWebsiteProbeResult(input: {
  url: string;
  finalUrl: string;
  title: string | null;
  capabilities: WebsiteCapabilities;
  discoveredFeedUrls: readonly string[];
  resources: readonly DiscoveredWebsiteResource[];
  browserAttempt: WebsiteBrowserAttempt;
  listingUrls: readonly string[];
  documentUrls: readonly string[];
  datePatternsFound: boolean;
  sampleCount: number;
}): DiscoveryWebsiteProbeResult {
  const sampleResources = input.resources.slice(0, Math.max(1, input.sampleCount)).map((resource) => ({
    url: resource.url,
    title: resource.title,
    kind: resource.classification.kind,
    discovery_source: resource.discoverySource,
    reasons: resource.classification.reasons.slice(0, 4),
  }));
  const sampleArticles = sampleResources
    .filter((resource) => ["editorial", "entity"].includes(resource.kind))
    .slice(0, Math.max(1, input.sampleCount))
    .map((resource) => ({
      url: resource.url,
      title: resource.title,
      date: null,
    }));
  const detailCountEstimate = input.resources.filter((resource) =>
    ["editorial", "entity"].includes(resource.classification.kind)
  ).length;
  const listingCountEstimate =
    input.listingUrls.length ||
    input.resources.filter((resource) => resource.classification.kind === "listing").length;
  const documentCountEstimate =
    input.documentUrls.length ||
    input.resources.filter((resource) => ["document", "data_file"].includes(resource.classification.kind)).length;
  const classification = classifyWebsiteProbeFromResources({
    resources: input.resources,
    discoveredFeedUrls: input.discoveredFeedUrls,
    challengeKind: input.browserAttempt.challengeKind,
  });

  return {
    url: input.url,
    final_url: input.finalUrl,
    title: input.title ?? new URL(input.finalUrl || input.url).hostname,
    classification,
    capabilities: {
      supports_feed_discovery: input.discoveredFeedUrls.length > 0,
      supports_collection_discovery:
        input.capabilities.defaultCollectionUrls.length > 0 || listingCountEstimate > 0,
      supports_download_discovery:
        input.capabilities.supportsDownloads || documentCountEstimate > 0,
      inline_data_hint: input.capabilities.inlineDataHints,
      js_heavy_hint: input.capabilities.jsHeavyHint,
    },
    discovered_feed_urls: [...input.discoveredFeedUrls],
    listing_urls: [...input.listingUrls].slice(0, 10),
    document_urls: [...input.documentUrls].slice(0, 10),
    detail_count_estimate: detailCountEstimate,
    listing_count_estimate: listingCountEstimate,
    document_count_estimate: documentCountEstimate,
    sample_resources: sampleResources,
    is_news_site: classification.kind === "editorial",
    has_hidden_rss: input.discoveredFeedUrls.length > 0,
    hidden_rss_urls: [...input.discoveredFeedUrls],
    article_count_estimate: detailCountEstimate,
    freshness: input.datePatternsFound ? "daily" : "unknown",
    date_patterns_found: input.datePatternsFound,
    category_urls: [...input.listingUrls].slice(0, 10),
    sample_articles: sampleArticles,
    browser_assisted_recommended: input.browserAttempt.recommended,
    browser_assisted_recommendation_reasons: input.browserAttempt.recommendationReasons,
    challenge_kind: input.browserAttempt.challengeKind,
  };
}

export async function probeWebsitesForDiscovery(input: {
  pool: Pool;
  urls: string[];
  sampleCount?: number;
  config?: Partial<WebsiteChannelConfig>;
}): Promise<{ probed_websites: DiscoveryWebsiteProbeResult[] }> {
  const config = parseWebsiteChannelConfig({
    browserFallbackEnabled: true,
    maxResourcesPerPoll: Math.max(DEFAULT_PROBE_SAMPLE_COUNT, input.sampleCount ?? DEFAULT_PROBE_SAMPLE_COUNT),
    ...input.config,
  });
  const crawlPolicyCache = new CrawlPolicyCacheService(input.pool);
  const results: DiscoveryWebsiteProbeResult[] = [];
  for (const rawUrl of Array.from(new Set(input.urls.map((url) => url.trim()).filter(Boolean)))) {
    try {
      const policy = await crawlPolicyCache.getPolicy(rawUrl, config.userAgent, config.requestTimeoutMs);
      const capabilities = await probeWebsiteCapabilities(rawUrl, policy, config);
      const baseDomain = new URL(rawUrl).hostname.toLowerCase();
      const conditionalState = {
        requestValidators: { ...policy.requestValidators },
        responseCache: { ...policy.responseCache },
        conditionalRequestHits: cloneConditionalRequestHits(policy.conditionalRequestHits),
      };
      const staticModes = selectWebsiteDiscoveryModes(capabilities, {
        ...config,
        browserFallbackEnabled: false,
      });
      const staticDiscovered: DiscoveredWebsiteResource[] = [];
      for (const mode of staticModes) {
        if (mode === "sitemap") {
          appendItems(
            staticDiscovered,
            await discoverFromSitemaps(
              capabilities.sitemapUrls,
              policy,
              config,
              baseDomain,
              conditionalState
            )
          );
        } else if (mode === "feed") {
          appendItems(
            staticDiscovered,
            await discoverFromFeeds(capabilities.feedUrls, config, baseDomain, conditionalState)
          );
        } else if (mode === "collection") {
          appendItems(
            staticDiscovered,
            await discoverFromCollectionPages(rawUrl, capabilities, policy, config, baseDomain)
          );
        } else if (mode === "inline_data") {
          appendItems(staticDiscovered, discoverFromInlineData(rawUrl, capabilities, config, baseDomain));
        } else if (mode === "download") {
          appendItems(staticDiscovered, discoverFromDownloads(rawUrl, capabilities, config, baseDomain));
        }
      }
      const dedupedStatic = dedupeResources(staticDiscovered).slice(0, config.maxResourcesPerPoll);
      let mergedResources = [...dedupedStatic];
      let listingUrls = dedupedStatic
        .filter((resource) => resource.classification.kind === "listing")
        .map((resource) => resource.url)
        .slice(0, 10);
      let documentUrls = dedupedStatic
        .filter((resource) => ["document", "data_file"].includes(resource.classification.kind))
        .map((resource) => resource.url)
        .slice(0, 10);
      let finalUrl = rawUrl;
      let title = readOptionalString(extractHtmlTitle(capabilities.homepageHtml ?? "")) ?? null;
      let datePatternsFound = /\b20\d{2}-\d{2}-\d{2}\b/.test(capabilities.homepageHtml ?? "");
      const staticSummary = summarizeResourceKinds(dedupedStatic);
      const browserRecommendation = evaluateBrowserAssistedDiscoveryRecommendation({
        capabilities,
        config,
        staticResourceCount: dedupedStatic.length,
        staticEditorialCount: staticSummary.editorialCount,
        staticListingCount: staticSummary.listingCount,
        staticUnknownCount: staticSummary.unknownCount,
      });
      const browserAttempt: WebsiteBrowserAttempt = {
        attempted: false,
        recommended: browserRecommendation.recommended,
        recommendationReasons: browserRecommendation.reasons,
        challengeKind: capabilities.challengeKindHint,
        blockedReason: null,
      };
      if (browserAttempt.recommended) {
        browserAttempt.attempted = true;
        try {
          const browserDiscovery = await discoverFromBrowserAssisted({
            channelUrl: rawUrl,
            capabilities,
            config,
            baseDomain,
          });
          finalUrl = browserDiscovery.finalUrl || finalUrl;
          title = title ?? browserDiscovery.title;
          datePatternsFound = datePatternsFound || browserDiscovery.datePatternsFound;
          listingUrls = Array.from(new Set([...listingUrls, ...browserDiscovery.listingUrls])).slice(0, 10);
          documentUrls = Array.from(new Set([...documentUrls, ...browserDiscovery.documentUrls])).slice(0, 10);
          if (browserDiscovery.challengeKind) {
            browserAttempt.challengeKind = browserDiscovery.challengeKind;
            browserAttempt.blockedReason = `unsupported:${browserDiscovery.challengeKind}`;
            mergedResources = [];
          } else {
            browserAttempt.challengeKind = null;
            mergedResources = dedupeResources([...mergedResources, ...browserDiscovery.resources]).slice(
              0,
              config.maxResourcesPerPoll
            );
          }
        } catch (error) {
          browserAttempt.challengeKind = "unsupported_block";
          browserAttempt.blockedReason = error instanceof Error ? error.message : "browser_probe_failed";
          mergedResources = dedupeResources(mergedResources);
        }
      }
      results.push(
        buildDiscoveryWebsiteProbeResult({
          url: rawUrl,
          finalUrl,
          title,
          capabilities,
          discoveredFeedUrls: capabilities.feedUrls,
          resources: mergedResources,
          browserAttempt,
          listingUrls,
          documentUrls,
          datePatternsFound,
          sampleCount: input.sampleCount ?? DEFAULT_PROBE_SAMPLE_COUNT,
        })
      );
    } catch {
      let fallbackTitle = rawUrl;
      try {
        fallbackTitle = new URL(rawUrl).hostname;
      } catch {
        // keep the raw URL when parsing fails
      }
      results.push({
        url: rawUrl,
        final_url: rawUrl,
        title: fallbackTitle,
        classification: {
          kind: "unknown",
          confidence: 0.0,
          reasons: ["probe_error"],
        },
        capabilities: {
          supports_feed_discovery: false,
          supports_collection_discovery: false,
          supports_download_discovery: false,
          inline_data_hint: false,
          js_heavy_hint: false,
        },
        discovered_feed_urls: [],
        listing_urls: [],
        document_urls: [],
        detail_count_estimate: 0,
        listing_count_estimate: 0,
        document_count_estimate: 0,
        sample_resources: [],
        is_news_site: false,
        has_hidden_rss: false,
        hidden_rss_urls: [],
        article_count_estimate: 0,
        freshness: "unknown",
        date_patterns_found: false,
        category_urls: [],
        sample_articles: [],
        browser_assisted_recommended: false,
        challenge_kind: null,
      });
    }
  }
  return { probed_websites: results };
}

export async function discoverWebsiteResources(input: {
  channelUrl: string;
  policy: RuntimeCrawlPolicy;
  config: WebsiteChannelConfig;
  cursors: Record<string, CursorSnapshot>;
  authConfig?: unknown;
}): Promise<{
  resources: DiscoveredWebsiteResource[];
  cursorUpdates: WebsiteCursorUpdate[];
  modes: WebsiteDiscoveryMode[];
  browserAttempt: WebsiteBrowserAttempt;
  homepageStatus: number | null;
  metrics: WebsiteDiscoveryMetrics;
  policyState: {
    requestValidators: Record<string, WebsiteConditionalRequestState>;
    responseCache: Record<string, WebsiteCachedTextResponseState>;
  };
}> {
  const baseDomain = new URL(input.channelUrl).hostname.toLowerCase();
  const conditionalState = {
    requestValidators: { ...input.policy.requestValidators },
    responseCache: { ...input.policy.responseCache },
    conditionalRequestHits: cloneConditionalRequestHits(input.policy.conditionalRequestHits),
  };
  const authContext =
    input.authConfig == null
      ? undefined
      : {
          channelUrl: input.channelUrl,
          authConfig: input.authConfig
        };
  const capabilities = await probeWebsiteCapabilities(
    input.channelUrl,
    input.policy,
    input.config
  );
  const modes = selectWebsiteDiscoveryModes(capabilities, input.config);
  const discovered: DiscoveredWebsiteResource[] = [];

  for (const mode of modes) {
    if (mode === "sitemap") {
      appendItems(
        discovered,
        await discoverFromSitemaps(
          capabilities.sitemapUrls,
          input.policy,
          input.config,
          baseDomain,
          conditionalState,
          authContext
        )
      );
      continue;
    }
    if (mode === "feed") {
      appendItems(
        discovered,
        await discoverFromFeeds(
          capabilities.feedUrls,
          input.config,
          baseDomain,
          conditionalState,
          authContext
        )
      );
      continue;
    }
    if (mode === "collection") {
      appendItems(
        discovered,
        await discoverFromCollectionPages(
          input.channelUrl,
          capabilities,
          input.policy,
          input.config,
          baseDomain,
          authContext
        )
      );
      continue;
    }
    if (mode === "inline_data") {
      appendItems(discovered, discoverFromInlineData(input.channelUrl, capabilities, input.config, baseDomain));
      continue;
    }
    if (mode === "download") {
      appendItems(
        discovered,
        discoverFromDownloads(input.channelUrl, capabilities, input.config, baseDomain)
      );
    }
  }

  const deduped = dedupeResources(discovered);
  let filtered = applyPatternFilters(deduped, input.config)
    .filter((resource) => !matchesCursor(resource, input.cursors))
    .slice(0, input.config.maxResourcesPerPoll);
  const staticCandidateCount = deduped.length;
  const staticAcceptedUrls = new Set(filtered.map((resource) => resource.normalizedUrl));
  const browserAttempt: WebsiteBrowserAttempt = {
    attempted: false,
          recommended: false,
          recommendationReasons: [],
          challengeKind: capabilities.challengeKindHint,
          blockedReason: null,
        };
  const filteredSummary = summarizeResourceKinds(filtered);
  const browserRecommendation = evaluateBrowserAssistedDiscoveryRecommendation({
    capabilities,
    config: input.config,
    staticResourceCount: filtered.length,
    staticNoChangeEvidence:
      conditionalState.conditionalRequestHits.sitemap > 0 ||
      conditionalState.conditionalRequestHits.feed > 0,
    staticEditorialCount: filteredSummary.editorialCount,
    staticListingCount: filteredSummary.listingCount,
    staticUnknownCount: filteredSummary.unknownCount,
  });
  browserAttempt.recommended = browserRecommendation.recommended;
  browserAttempt.recommendationReasons = browserRecommendation.reasons;
  let browserDiscoveredCount = 0;
  if (browserAttempt.recommended) {
    browserAttempt.attempted = true;
    modes.push("browser_assisted");
    try {
      const browserDiscovery = await discoverFromBrowserAssisted({
        channelUrl: input.channelUrl,
        capabilities,
        config: input.config,
        baseDomain,
        authContext,
      });
      browserDiscoveredCount = browserDiscovery.resources.length;
      if (browserDiscovery.challengeKind) {
        browserAttempt.challengeKind = browserDiscovery.challengeKind;
        browserAttempt.blockedReason = `unsupported:${browserDiscovery.challengeKind}`;
        if (filtered.length === 0) {
          filtered = [];
        }
      } else {
        browserAttempt.challengeKind = null;
        filtered = applyPatternFilters(
          dedupeResources([...filtered, ...browserDiscovery.resources]),
          input.config
        )
          .filter((resource) => !matchesCursor(resource, input.cursors))
          .slice(0, input.config.maxResourcesPerPoll);
      }
    } catch (error) {
      browserAttempt.challengeKind = "unsupported_block";
      browserAttempt.blockedReason = error instanceof Error ? error.message : "browser_discovery_failed";
    }
  }
  const browserAcceptedCount = filtered.filter(
    (resource) => Boolean(resource.rawSignals.browserAssisted)
  ).length;
  const browserOnlyAcceptedCount = filtered.filter(
    (resource) => Boolean(resource.rawSignals.browserAssisted) && !staticAcceptedUrls.has(resource.normalizedUrl)
  ).length;
  const modeCounts = filtered.reduce<Record<string, number>>((counts, resource) => {
    counts[resource.discoverySource] = (counts[resource.discoverySource] ?? 0) + 1;
    return counts;
  }, {});
  const resourceKindCounts = filtered.reduce<Record<string, number>>((counts, resource) => {
    counts[resource.classification.kind] = (counts[resource.classification.kind] ?? 0) + 1;
    return counts;
  }, {});

  const cursorUpdates: WebsiteCursorUpdate[] = [];
  const latestTimestamp = selectLatestTimestamp(filtered, "timestamp");
  if (latestTimestamp) {
    cursorUpdates.push({
      cursorType: "timestamp",
      cursorValue: latestTimestamp,
      cursorJson: {
        source: "website_discovery"
      }
    });
  }
  const latestLastmod = selectLatestTimestamp(filtered, "lastmod");
  if (latestLastmod) {
    cursorUpdates.push({
      cursorType: "lastmod",
      cursorValue: latestLastmod,
      cursorJson: {
        source: "website_discovery"
      }
    });
  }
  if (filtered.length > 0) {
    cursorUpdates.push({
      cursorType: "set_diff",
      cursorValue: new Date().toISOString(),
      cursorJson: {
        last_seen_urls: filtered.map((resource) => resource.normalizedUrl).slice(0, SET_DIFF_CURSOR_LIMIT)
      }
    });
  }

  return {
    resources: filtered,
    cursorUpdates,
    modes,
    browserAttempt,
    homepageStatus: capabilities.homepageStatus,
    metrics: {
      staticCandidateCount,
      staticAcceptedCount: staticAcceptedUrls.size,
      browserRecommended: browserAttempt.recommended,
      browserAttempted: browserAttempt.attempted,
      browserRecommendationReasons: browserAttempt.recommendationReasons,
      browserChallengeKind: browserAttempt.challengeKind,
      browserDiscoveredCount,
      browserAcceptedCount,
      browserOnlyAcceptedCount,
      finalAcceptedCount: filtered.length,
      modeCounts,
      resourceKindCounts,
      conditionalRequestHits: conditionalState.conditionalRequestHits,
    },
    policyState: {
      requestValidators: conditionalState.requestValidators,
      responseCache: conditionalState.responseCache,
    },
  };
}

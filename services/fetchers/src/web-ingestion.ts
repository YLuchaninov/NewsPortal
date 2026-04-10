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
const LOGIN_PATTERN = /\b(sign in|log in|login required|member login|password)\b/i;
const CLOUDFLARE_PATTERN = /\b(cloudflare|checking your browser|cf-browser-verification|just a moment)\b/i;
const ACCESS_BLOCK_PATTERN = /\b(access denied|bot detected|request blocked|forbidden)\b/i;

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

export interface CrawlPolicyCacheRow {
  domain: string;
  robots_txt_url: string;
  robots_txt_body: string | null;
  sitemap_urls: string[];
  feed_urls: string[];
  llms_txt_url: string | null;
  llms_txt_body: string | null;
  fetched_at: string;
  expires_at: string;
  fetch_error: string | null;
  http_status: number | null;
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
  challengeKind: WebsiteChallengeKind | null;
  blockedReason: string | null;
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
  isAllowed: (rawUrl: string, userAgent: string) => boolean;
  crawlDelaySeconds: (userAgent: string) => number | null;
}

interface WebsiteAuthContext {
  channelUrl: string;
  authConfig: unknown;
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

function detectWebsiteChallengeKind(html: string | null, textContent?: string | null): WebsiteChallengeKind | null {
  const normalizedText = normalizeText(textContent ?? html ?? "");
  const haystack = `${html ?? ""}\n${normalizedText}`;
  if (!haystack.trim()) {
    return null;
  }
  if (CAPTCHA_PATTERN.test(haystack)) {
    return "captcha";
  }
  if (LOGIN_PATTERN.test(haystack)) {
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
  if (DOWNLOAD_EXTENSION_PATTERN.test(lowerPath)) {
    if (/\.(csv|xlsx|xls|json|xml|zip)(?:$|\?)/i.test(lowerPath)) {
      return ["data_file"];
    }
    return ["document"];
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
  if (DATE_PATH_PATTERN.test(lowerPath) || pathContainsSegment(lowerPath, [
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
  structuredTypes?: readonly string[];
  hasRepeatedCards?: boolean;
  hasPagination?: boolean;
  hasDownloads?: boolean;
}): { kind: ResourceKind; confidence: number; reasons: string[] } {
  const scores = new Map<ResourceKind, number>(RESOURCE_KINDS.map((kind) => [kind, 0]));
  const reasons: string[] = [];
  const hintedKinds = (input.hintedKinds ?? []).filter((kind) => kind !== "unknown");
  for (const kind of hintedKinds) {
    scores.set(kind, (scores.get(kind) ?? 0) + 3);
    reasons.push(`hint:${kind}`);
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
    scores.set("listing", (scores.get("listing") ?? 0) + 3);
    reasons.push("layout:repeated_cards");
  }
  if (input.hasPagination) {
    scores.set("listing", (scores.get("listing") ?? 0) + 2);
    reasons.push("layout:pagination");
  }
  if (input.hasDownloads) {
    scores.set("document", (scores.get("document") ?? 0) + 1);
    scores.set("data_file", (scores.get("data_file") ?? 0) + 1);
    reasons.push("layout:downloads");
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
          stack.push(...item);
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
    if (allowPatterns.length > 0 && !allowPatterns.some((pattern) => pattern.test(resource.url))) {
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
  if (capabilities.sitemapUrls.length > 0 && config.sitemapDiscoveryEnabled) {
    modes.push("sitemap");
  }
  if (capabilities.feedUrls.length > 0 && config.feedDiscoveryEnabled) {
    modes.push("feed");
  }
  if (config.collectionDiscoveryEnabled) {
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

export function shouldAttemptBrowserAssistedDiscovery(input: {
  capabilities: WebsiteCapabilities;
  config: WebsiteChannelConfig;
  staticResourceCount: number;
}): boolean {
  if (!input.config.browserFallbackEnabled) {
    return false;
  }
  if (input.capabilities.challengeKindHint) {
    return true;
  }
  if (input.staticResourceCount === 0) {
    return true;
  }
  return (
    input.capabilities.jsHeavyHint &&
    input.staticResourceCount < Math.min(2, input.config.maxResourcesPerPoll)
  );
}

function resourceFromUrl(
  rawUrl: string,
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
    rawSignals?: Record<string, unknown>;
  }
): DiscoveredWebsiteResource | null {
  const normalizedUrl = normalizeUrl(rawUrl, options.baseUrl);
  if (!normalizedUrl) {
    return null;
  }
  const hintedKinds = inferResourceKindsFromUrl(normalizedUrl);
  const classification = classifyResourceCandidate({
    url: normalizedUrl,
    title: options.title,
    summary: options.summary,
    hintedKinds,
    structuredTypes: options.structuredTypes,
    hasRepeatedCards: options.hasRepeatedCards,
    hasPagination: options.hasPagination,
    hasDownloads: options.hasDownloads
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
  authContext?: WebsiteAuthContext
): Promise<{
  url: string;
  status: number;
  text: string;
  contentType: string | null;
}> {
  const response = await fetch(url, {
    headers: authContext
      ? buildWebsiteRequestHeaders({
          requestUrl: url,
          channelUrl: authContext.channelUrl,
          authConfig: authContext.authConfig,
          headers
        })
      : headers,
    signal: AbortSignal.timeout(timeoutMs),
    redirect: "follow"
  });
  return {
    url: response.url,
    status: response.status,
    text: await response.text(),
    contentType: response.headers.get("content-type")
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
    if (hasAuthorizationHeaderConfigured(authContext)) {
      const liveRow = await this.fetchPolicyRow(rawUrl, userAgent, requestTimeoutMs, authContext);
      return this.buildRuntimePolicy(liveRow, userAgent);
    }

    const cached = await this.loadRow(domain);
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

      const row = await this.fetchPolicyRow(rawUrl, userAgent, requestTimeoutMs);

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
            fetched_at,
            expires_at,
            fetch_error,
            http_status
          )
          values ($1, $2, $3, $4::text[], $5::text[], $6, $7, $8, $9, $10, $11)
          on conflict (domain)
          do update
          set
            robots_txt_url = excluded.robots_txt_url,
            robots_txt_body = excluded.robots_txt_body,
            sitemap_urls = excluded.sitemap_urls,
            feed_urls = excluded.feed_urls,
            llms_txt_url = excluded.llms_txt_url,
            llms_txt_body = excluded.llms_txt_body,
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
    authContext?: WebsiteAuthContext
  ): Promise<CrawlPolicyCacheRow> {
    const parsedUrl = new URL(rawUrl);
    const domain = parsedUrl.hostname.toLowerCase();
    const baseOrigin = parsedUrl.origin;
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
        authContext
      );
      httpStatus = robotsResponse.status;
      if (robotsResponse.status === 200) {
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
        authContext
      );
      if (homepage.status === 200) {
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
        authContext
      );
      if (llms.status === 200) {
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
      fetched_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + ttlMs).toISOString(),
      fetch_error: fetchError,
      http_status: httpStatus
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
      isAllowed: (rawUrl, agent) => isAllowedByRobots(row.robots_txt_body, rawUrl, agent || userAgent),
      crawlDelaySeconds: (agent) => crawlDelayForUserAgent(row.robots_txt_body, agent || userAgent)
    };
  }
}

export async function probeWebsiteCapabilities(
  channelUrl: string,
  policy: RuntimeCrawlPolicy,
  config: WebsiteChannelConfig,
  authContext?: WebsiteAuthContext
): Promise<WebsiteCapabilities> {
  const contentTypes: string[] = [];
  try {
    const homepage = await fetchTextWithAuth(
      channelUrl,
      config.requestTimeoutMs,
      {
        "user-agent": config.userAgent,
        accept: "text/html,application/xhtml+xml"
      },
      authContext
    );
    if (homepage.contentType) {
      contentTypes.push(homepage.contentType);
    }
    if (homepage.status !== 200) {
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
        homepageStatus: homepage.status
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
  } catch {
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
      homepageStatus: null
    };
  }
}

async function discoverFromSitemaps(
  sitemapUrls: readonly string[],
  policy: RuntimeCrawlPolicy,
  config: WebsiteChannelConfig,
  baseDomain: string,
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
        authContext
      );
    } catch {
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
      const resource = resourceFromUrl(normalizedUrl, {
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
        authContext
      );
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
        const resource = resourceFromUrl(normalizedUrl, {
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
  const seedUrls = Array.from(
    new Set([
      channelUrl,
      ...capabilities.defaultCollectionUrls,
      ...config.collectionSeedUrls.map((url) => normalizeUrl(url, channelUrl)).filter((url): url is string => Boolean(url))
    ])
  ).slice(0, MAX_COLLECTION_FETCHES);
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
      const links = extractAnchorLinks(response.text, response.url);
      const hasRepeatedCards = links.length >= 8;
      const hasPagination = /\b(page|pagination|next)\b/i.test(response.text);
      const structuredTypes = parseJsonLdTypes(response.text);
      for (const link of links) {
        if (!matchesSameDomain(link.url, baseDomain) || link.url === seedUrl || FEED_HINT_PATTERN.test(link.url)) {
          continue;
        }
        if (DOWNLOAD_EXTENSION_PATTERN.test(link.url)) {
          continue;
        }
        const resource = resourceFromUrl(link.url, {
          title: link.text || null,
          parentUrl: seedUrl,
          freshnessMarkerType: "set_diff",
          freshnessMarkerValue: null,
          discoverySource: "collection_page",
          structuredTypes,
          hasRepeatedCards,
          hasPagination,
          rawSignals: {
            parentUrl: seedUrl
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
    const resource = resourceFromUrl(url, {
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
    const resource = resourceFromUrl(url, {
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
    const resource = resourceFromUrl(link.url, {
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
    const resource = resourceFromUrl(networkUrl, {
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
    new Set([
      input.channelUrl,
      ...input.capabilities.defaultCollectionUrls,
      ...input.config.collectionSeedUrls
        .map((url) => normalizeUrl(url, input.channelUrl))
        .filter((url): url is string => Boolean(url)),
    ])
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
        discovered.push(...capture.resources);
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
      const staticModes = selectWebsiteDiscoveryModes(capabilities, {
        ...config,
        browserFallbackEnabled: false,
      });
      const staticDiscovered: DiscoveredWebsiteResource[] = [];
      for (const mode of staticModes) {
        if (mode === "sitemap") {
          staticDiscovered.push(
            ...(await discoverFromSitemaps(capabilities.sitemapUrls, policy, config, baseDomain))
          );
        } else if (mode === "feed") {
          staticDiscovered.push(
            ...(await discoverFromFeeds(capabilities.feedUrls, config, baseDomain))
          );
        } else if (mode === "collection") {
          staticDiscovered.push(
            ...(await discoverFromCollectionPages(rawUrl, capabilities, policy, config, baseDomain))
          );
        } else if (mode === "inline_data") {
          staticDiscovered.push(...discoverFromInlineData(rawUrl, capabilities, baseDomain));
        } else if (mode === "download") {
          staticDiscovered.push(
            ...discoverFromDownloads(rawUrl, capabilities, config, baseDomain)
          );
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
      const browserAttempt: WebsiteBrowserAttempt = {
        attempted: false,
        recommended: shouldAttemptBrowserAssistedDiscovery({
          capabilities,
          config,
          staticResourceCount: dedupedStatic.length,
        }),
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
}> {
  const baseDomain = new URL(input.channelUrl).hostname.toLowerCase();
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
    input.config,
    authContext
  );
  const modes = selectWebsiteDiscoveryModes(capabilities, input.config);
  const discovered: DiscoveredWebsiteResource[] = [];

  for (const mode of modes) {
    if (mode === "sitemap") {
      discovered.push(
        ...(await discoverFromSitemaps(
          capabilities.sitemapUrls,
          input.policy,
          input.config,
          baseDomain,
          authContext
        ))
      );
      continue;
    }
    if (mode === "feed") {
      discovered.push(
        ...(await discoverFromFeeds(capabilities.feedUrls, input.config, baseDomain, authContext))
      );
      continue;
    }
    if (mode === "collection") {
      discovered.push(
        ...(await discoverFromCollectionPages(
          input.channelUrl,
          capabilities,
          input.policy,
          input.config,
          baseDomain,
          authContext
        ))
      );
      continue;
    }
    if (mode === "inline_data") {
      discovered.push(...discoverFromInlineData(input.channelUrl, capabilities, baseDomain));
      continue;
    }
    if (mode === "download") {
      discovered.push(
        ...discoverFromDownloads(input.channelUrl, capabilities, input.config, baseDomain)
      );
    }
  }

  const deduped = dedupeResources(discovered);
  let filtered = applyPatternFilters(deduped, input.config)
    .filter((resource) => !matchesCursor(resource, input.cursors))
    .slice(0, input.config.maxResourcesPerPoll);
  const browserAttempt: WebsiteBrowserAttempt = {
    attempted: false,
    recommended: shouldAttemptBrowserAssistedDiscovery({
      capabilities,
      config: input.config,
      staticResourceCount: filtered.length,
    }),
    challengeKind: capabilities.challengeKindHint,
    blockedReason: null,
  };
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
    homepageStatus: capabilities.homepageStatus
  };
}

import type {
  ResourceKind,
  WebsiteChannelConfig
} from "@signalops/contracts";

import { canonicalizeUrl, collapseWhitespace, decodeHtmlEntities, stripHtmlTags } from "./rss";
import {
  classifyResourceCandidate,
  inferResourceKindsFromUrl,
} from "./web-ingestion-classification";
import { chooseLatest } from "./web-ingestion-cursors";
import type {
  DiscoveredWebsiteResource,
  WebsiteCapabilities,
  WebsiteChallengeKind,
  WebsiteDiscoveryMode,
} from "./web-ingestion-types";

export {
  matchesCursor,
  selectLatestTimestamp,
} from "./web-ingestion-cursors";

export const MAX_COLLECTION_FETCHES = 5;
const JSON_URL_CANDIDATE_LIMIT = 300;
const SAME_SITE_PROTOCOLS = new Set(["http:", "https:"]);
export const DOWNLOAD_EXTENSION_PATTERN = /\.(pdf|csv|xlsx|xls|json|xml|zip)(?:$|\?)/i;
export const FEED_HINT_PATTERN = /(rss|atom|feed)(?:\.xml)?(?:$|\?)/i;
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

export interface CollectionLinkCandidate {
  url: string;
  text: string;
  summary: string | null;
  publishedAt: string | null;
}

const COLLECTION_NAV_TEXT_PATTERN =
  /^(read more|learn more|more|next|previous|older|newer|view all|all news|all updates|contact|about|privacy|terms|careers)$/i;
const COLLECTION_CONTEXT_NOISE_PATTERN =
  /\b(menu_level|submenu|no_menu_link|usa-nav|breadcrumb|skip to main|main navigation)\b|<\/?[a-z][^>]*>|\b[a-z0-9_-]+__\d+\b/i;

export function readOptionalString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeText(value: string): string {
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

export function detectWebsiteChallengeKind(
  html: string | null,
  textContent?: string | null
): WebsiteChallengeKind | null {
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

export function normalizeUrl(rawUrl: string, baseUrl?: string): string | null {
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

export function appendItems<T>(target: T[], incoming: readonly T[]): void {
  for (const item of incoming) {
    target.push(item);
  }
}

function extractAttribute(tagSource: string, attributeName: string): string | null {
  const expression = new RegExp(`${attributeName}\\s*=\\s*["']([^"']+)["']`, "i");
  return readOptionalString(tagSource.match(expression)?.[1] ?? null);
}

export function extractAnchorLinks(html: string, baseUrl: string): Array<{ url: string; text: string }> {
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

export function isLikelyContentContext(value: string | null | undefined): boolean {
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

export function extractLinkTagUrls(
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

export function extractHtmlTitle(html: string): string | null {
  return readOptionalString(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? null);
}

export function detectInlineDataHint(html: string): boolean {
  return /__NEXT_DATA__|__NUXT__|__APOLLO_STATE__|data-reactroot|window\.__INITIAL_STATE__/i.test(html);
}

export function detectJsHeavyHint(html: string): boolean {
  const scriptCount = (html.match(/<script\b/gi) ?? []).length;
  const textLength = normalizeText(html).length;
  return scriptCount >= 10 && textLength <= 800;
}

export function extractDefaultCollectionUrls(html: string, baseUrl: string): string[] {
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

export function shouldKeepDefaultCollectionSeed(channelUrl: string, seedUrl: string): boolean {
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

export function selectCollectionSeedUrls(input: {
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

export function extractDownloadUrls(
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

export function dedupeResources(resources: readonly DiscoveredWebsiteResource[]): DiscoveredWebsiteResource[] {
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

export function parseXmlEntries(
  xml: string,
  nodeName: "url" | "sitemap"
): Array<{ loc: string; lastmod: string | null }> {
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

export function parseJsonLdTypes(html: string): string[] {
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

export function extractJsonUrls(value: unknown, baseUrl: string, accumulator: Set<string>): void {
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

export function extractInlineDataUrls(html: string, baseUrl: string): string[] {
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

export function summarizeResourceKinds(resources: readonly DiscoveredWebsiteResource[]): {
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

export function matchesSameDomain(url: string, baseDomain: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname.toLowerCase() === baseDomain.toLowerCase();
  } catch {
    return false;
  }
}

export function applyPatternFilters(
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

export function evaluateBrowserAssistedDiscoveryRecommendation(input: {
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

export function resourceFromUrl(
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

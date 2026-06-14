import { extractSitemapUrlsFromRobots } from "./web-ingestion-robots";
import {
  extractAnchorLinks,
  extractLinkTagUrls,
  parseXmlEntries,
} from "./web-ingestion-extraction";
import { probeFeedsForDiscovery, type FeedProbeResult } from "./feed-probe";
import { normalizeProbeUrl, validateAcquisitionUrl } from "./probe-url-guard";

export interface FeedAlternativesInput {
  urls: string[];
  sampleCount: number;
  userAgent: string;
  timeoutMs: number;
  maxCandidatesPerUrl: number;
}

export interface FeedAlternativeCandidate {
  provider_type: "rss" | "website" | "adapter_required";
  fetch_url: string | null;
  status: "candidate" | "needs_probe" | "api_mapping_required" | "adapter_required";
  strategy:
    | "direct_feed_validation"
    | "html_alternate"
    | "http_link_header"
    | "robots_sitemap"
    | "sitemap_index"
    | "sitemap_url"
    | "cms_platform_hint"
    | "same_site_link"
    | "well_known_feed_path"
    | "website_fallback"
    | "adapter_required";
  confidence: number;
  reason: string;
  feed_probe_evidence?: FeedProbeResult;
  evidence?: Record<string, unknown>;
}

export interface FeedAlternativesPlanResult {
  url: string;
  final_url: string | null;
  candidates: FeedAlternativeCandidate[];
  warnings: string[];
}

const MAX_BODY_BYTES = 2_000_000;
const MAX_PROBED_CANDIDATES = 24;
const FEED_TYPE_HINTS = [
  "application/rss+xml",
  "application/atom+xml",
  "application/feed+json",
  "application/json",
  "application/rdf+xml",
  "application/xml",
  "text/xml",
];
const WELL_KNOWN_FEED_PATHS = [
  "/feed.xml",
  "/rss.xml",
  "/atom.xml",
  "/feed/",
  "/feed",
  "/rss/",
  "/rss",
  "/index.xml",
  "/feed.json",
  "/jsonfeed.json",
  "/blog/feed/",
  "/news/feed/",
  "/press/feed/",
  "/updates/feed/",
  "/feeds/posts/default?alt=rss",
];
const COMMON_SITEMAP_PATHS = [
  "/robots.txt",
  "/sitemap.xml",
  "/sitemap_index.xml",
  "/sitemap-news.xml",
  "/post-sitemap.xml",
  "/page-sitemap.xml",
];
const COLLECTION_PATH_HINT_RE = /(?:^|\/)(blog|news|press|updates|signal_candidates|posts|insights|resources)(?:\/|$)/i;
const FEED_PATH_HINT_RE = /(?:feed|rss|atom|jsonfeed|\.xml$|\.rss$|\.atom$)/i;

interface TextFetchResult {
  finalUrl: string;
  contentType: string | null;
  linkHeader: string | null;
  text: string;
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean)));
}

function normalizeUrl(rawUrl: string, baseUrl?: string): string | null {
  const normalized = normalizeProbeUrl(rawUrl, baseUrl);
  return normalized.url;
}

function originOf(rawUrl: string): string | null {
  try {
    return new URL(rawUrl).origin;
  } catch {
    return null;
  }
}

function isSameOrigin(left: string, right: string): boolean {
  try {
    return new URL(left).origin === new URL(right).origin;
  } catch {
    return false;
  }
}

function resolveOriginPath(rawUrl: string, path: string): string | null {
  const origin = originOf(rawUrl);
  return origin ? normalizeUrl(`${origin}${path}`) : null;
}

function inferFeedUrlFromCollection(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    const path = url.pathname.replace(/\/+$/, "");
    if (!path || path === "/") {
      return normalizeUrl("/feed/", url.origin);
    }
    if (FEED_PATH_HINT_RE.test(path)) {
      return normalizeUrl(url.toString());
    }
    return normalizeUrl(`${path}/feed/`, url.origin);
  } catch {
    return null;
  }
}

async function fetchText(url: string, input: Pick<FeedAlternativesInput, "userAgent" | "timeoutMs">): Promise<TextFetchResult> {
  const guardedInitialUrl = await validateAcquisitionUrl(url, { resolveDns: true });
  if (!guardedInitialUrl.url) {
    throw new Error(guardedInitialUrl.error ?? "Alternative discovery URL is not allowed.");
  }
  const response = await fetch(guardedInitialUrl.url, {
    headers: {
      "user-agent": input.userAgent,
      accept: "text/html,application/xml,text/xml,application/rss+xml,application/atom+xml,application/feed+json,application/json,*/*;q=0.8",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(input.timeoutMs),
  });
  if (!response.ok) {
    throw new Error(`Alternative discovery fetch failed with ${response.status} ${response.statusText}.`);
  }
  const guardedFinalUrl = await validateAcquisitionUrl(response.url || url, { resolveDns: true });
  if (!guardedFinalUrl.url) {
    throw new Error(guardedFinalUrl.error ?? "Alternative discovery final URL is not allowed.");
  }
  const contentLength = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    throw new Error("Alternative discovery response body is too large.");
  }
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > MAX_BODY_BYTES) {
    throw new Error("Alternative discovery response body is too large.");
  }
  return {
    finalUrl: guardedFinalUrl.url,
    contentType: response.headers.get("content-type"),
    linkHeader: response.headers.get("link"),
    text: new TextDecoder().decode(bytes),
  };
}

function pushCandidate(
  candidates: FeedAlternativeCandidate[],
  candidate: FeedAlternativeCandidate,
): void {
  const key = `${candidate.provider_type}:${candidate.fetch_url ?? ""}:${candidate.strategy}`;
  const exists = candidates.some(
    (item) => `${item.provider_type}:${item.fetch_url ?? ""}:${item.strategy}` === key,
  );
  if (!exists) {
    candidates.push(candidate);
  }
}

function parseLinkHeaderFeedUrls(value: string | null, baseUrl: string): string[] {
  if (!value) {
    return [];
  }
  const urls: string[] = [];
  for (const match of value.matchAll(/<([^>]+)>\s*;\s*([^,]+)/g)) {
    const rawUrl = String(match[1] ?? "").trim();
    const params = String(match[2] ?? "").toLowerCase();
    if (!/\brel\s*=\s*"?[^"]*\balternate\b/.test(params)) {
      continue;
    }
    if (!FEED_TYPE_HINTS.some((hint) => params.includes(hint))) {
      continue;
    }
    const resolvedUrl = normalizeUrl(rawUrl, baseUrl);
    if (resolvedUrl) {
      urls.push(resolvedUrl);
    }
  }
  return uniqueStrings(urls);
}

function addCmsHintCandidates(baseUrl: string, html: string, candidates: FeedAlternativeCandidate[]): void {
  const normalized = html.toLowerCase();
  const hints: Array<{ path: string; reason: string; confidence: number }> = [];
  if (/(wp-content|wp-json|generator["'][^>]*wordpress)/i.test(normalized)) {
    hints.push({ path: "/feed/", reason: "WordPress-like page metadata suggests a first-party feed path.", confidence: 0.68 });
  }
  if (/(ghost\/api|content=["'][^"']*ghost|generator["'][^>]*ghost)/i.test(normalized)) {
    hints.push({ path: "/rss/", reason: "Ghost-like page metadata suggests a first-party RSS path.", confidence: 0.66 });
  }
  if (/(generator["'][^>]*drupal|drupal-settings-json)/i.test(normalized)) {
    hints.push({ path: "/rss.xml", reason: "Drupal-like page metadata suggests a first-party RSS path.", confidence: 0.62 });
  }
  if (/(blogger\.com|blogspot|generator["'][^>]*blogger)/i.test(normalized)) {
    hints.push({ path: "/feeds/posts/default?alt=rss", reason: "Blogger-like page metadata suggests a posts feed path.", confidence: 0.62 });
  }

  for (const hint of hints) {
    const fetchUrl = resolveOriginPath(baseUrl, hint.path);
    if (!fetchUrl) {
      continue;
    }
    pushCandidate(candidates, {
      provider_type: "rss",
      fetch_url: fetchUrl,
      status: "needs_probe",
      strategy: "cms_platform_hint",
      confidence: hint.confidence,
      reason: hint.reason,
    });
  }
}

function addWellKnownCandidates(baseUrl: string, candidates: FeedAlternativeCandidate[]): void {
  for (const path of WELL_KNOWN_FEED_PATHS) {
    const fetchUrl = resolveOriginPath(baseUrl, path);
    if (!fetchUrl) {
      continue;
    }
    pushCandidate(candidates, {
      provider_type: "rss",
      fetch_url: fetchUrl,
      status: "needs_probe",
      strategy: "well_known_feed_path",
      confidence: 0.42,
      reason: `Well-known feed path ${path}; requires feed-probe evidence before onboarding.`,
    });
  }
}

function addSameSiteLinkCandidates(baseUrl: string, html: string, candidates: FeedAlternativeCandidate[]): void {
  for (const link of extractAnchorLinks(html, baseUrl).slice(0, 100)) {
    if (!isSameOrigin(baseUrl, link.url)) {
      continue;
    }
    const combined = `${link.url} ${link.text}`.toLowerCase();
    if (/(rss|feed|atom|json feed|subscribe)/i.test(combined)) {
      pushCandidate(candidates, {
        provider_type: "rss",
        fetch_url: link.url,
        status: "needs_probe",
        strategy: "same_site_link",
        confidence: 0.58,
        reason: "Same-site link has feed/subscribe wording and needs feed-probe validation.",
        evidence: { linkText: link.text },
      });
      continue;
    }
    if (COLLECTION_PATH_HINT_RE.test(new URL(link.url).pathname) || /(news|blog|press|updates|signal_candidates)/i.test(link.text)) {
      const feedUrl = inferFeedUrlFromCollection(link.url);
      if (feedUrl) {
        pushCandidate(candidates, {
          provider_type: "rss",
          fetch_url: feedUrl,
          status: "needs_probe",
          strategy: "same_site_link",
          confidence: 0.48,
          reason: "Same-site collection link suggests a nearby feed path; requires feed-probe validation.",
          evidence: { collectionUrl: link.url, linkText: link.text },
        });
      }
    }
  }
}

async function addSitemapCandidates(
  baseUrl: string,
  input: Pick<FeedAlternativesInput, "userAgent" | "timeoutMs">,
  candidates: FeedAlternativeCandidate[],
  warnings: string[],
): Promise<void> {
  const origin = originOf(baseUrl);
  if (!origin) {
    return;
  }
  const sitemapUrls = new Set<string>();
  try {
    const robotsUrl = `${origin}/robots.txt`;
    const robots = await fetchText(robotsUrl, input);
    for (const sitemapUrl of extractSitemapUrlsFromRobots(robots.text, origin)) {
      sitemapUrls.add(sitemapUrl);
    }
  } catch (error) {
    warnings.push(error instanceof Error ? `robots_txt: ${error.message}` : "robots_txt: fetch failed");
  }
  for (const path of COMMON_SITEMAP_PATHS.filter((path) => path !== "/robots.txt")) {
    const sitemapUrl = resolveOriginPath(origin, path);
    if (sitemapUrl) {
      sitemapUrls.add(sitemapUrl);
    }
  }

  const sitemapQueue = [...sitemapUrls].slice(0, 6);
  const visited = new Set<string>();
  while (sitemapQueue.length > 0 && visited.size < 10) {
    const sitemapUrl = sitemapQueue.shift();
    if (!sitemapUrl || visited.has(sitemapUrl)) {
      continue;
    }
    visited.add(sitemapUrl);
    try {
      const response = await fetchText(sitemapUrl, input);
      const sitemapEntries = parseXmlEntries(response.text, "sitemap")
        .sort((left, right) => String(right.lastmod ?? "").localeCompare(String(left.lastmod ?? "")))
        .slice(0, 4);
      for (const entry of sitemapEntries) {
        const normalized = normalizeUrl(entry.loc, sitemapUrl);
        if (normalized && isSameOrigin(baseUrl, normalized) && !visited.has(normalized)) {
          sitemapQueue.push(normalized);
        }
      }
      for (const entry of parseXmlEntries(response.text, "url").slice(0, 60)) {
        const normalized = normalizeUrl(entry.loc, sitemapUrl);
        if (!normalized || !isSameOrigin(baseUrl, normalized)) {
          continue;
        }
        if (FEED_PATH_HINT_RE.test(new URL(normalized).pathname)) {
          pushCandidate(candidates, {
            provider_type: "rss",
            fetch_url: normalized,
            status: "needs_probe",
            strategy: "sitemap_url",
            confidence: 0.56,
            reason: "Sitemap URL itself looks feed-like; requires feed-probe validation.",
            evidence: { sitemapUrl, lastmod: entry.lastmod },
          });
          continue;
        }
        if (COLLECTION_PATH_HINT_RE.test(new URL(normalized).pathname)) {
          const feedUrl = inferFeedUrlFromCollection(normalized);
          if (feedUrl) {
            pushCandidate(candidates, {
              provider_type: "rss",
              fetch_url: feedUrl,
              status: "needs_probe",
              strategy: sitemapEntries.length > 0 ? "sitemap_index" : "robots_sitemap",
              confidence: 0.5,
              reason: "Sitemap collection URL suggests a nearby feed path; requires feed-probe validation.",
              evidence: { sitemapUrl, collectionUrl: normalized, lastmod: entry.lastmod },
            });
          }
        }
      }
    } catch (error) {
      warnings.push(error instanceof Error ? `sitemap ${sitemapUrl}: ${error.message}` : `sitemap ${sitemapUrl}: fetch failed`);
    }
  }
}

function addWebsiteFallback(baseUrl: string, candidates: FeedAlternativeCandidate[]): void {
  pushCandidate(candidates, {
    provider_type: "website",
    fetch_url: baseUrl,
    status: "candidate",
    strategy: "website_fallback",
    confidence: 0.34,
    reason: "No validated feed is guaranteed; website ingestion remains the safe fallback when RSS is unavailable.",
  });
}

async function validateFeedCandidates(
  candidates: FeedAlternativeCandidate[],
  input: Pick<FeedAlternativesInput, "sampleCount" | "userAgent" | "timeoutMs">,
): Promise<FeedAlternativeCandidate[]> {
  const feedUrls = uniqueStrings(
    candidates
      .filter((candidate) => candidate.provider_type === "rss" && candidate.fetch_url)
      .sort((left, right) => right.confidence - left.confidence)
      .map((candidate) => candidate.fetch_url),
  ).slice(0, MAX_PROBED_CANDIDATES);
  if (feedUrls.length === 0) {
    return candidates;
  }
  const probe = await probeFeedsForDiscovery({
    urls: feedUrls,
    sampleCount: input.sampleCount,
    userAgent: input.userAgent,
    timeoutMs: input.timeoutMs,
  });
  const evidenceByUrl = new Map<string, FeedProbeResult>();
  for (const row of probe.probed_feeds) {
    evidenceByUrl.set(row.url, row);
  }
  return candidates.map((candidate) => {
    const evidence = candidate.fetch_url ? evidenceByUrl.get(candidate.fetch_url) : undefined;
    if (!evidence?.is_valid_rss) {
      return candidate;
    }
    return {
      ...candidate,
      fetch_url: evidence.feed_url || evidence.final_url || candidate.fetch_url,
      status: "candidate",
      confidence: Math.max(candidate.confidence, 0.88),
      reason: `${candidate.reason} Feed-probe validated the candidate.`,
      feed_probe_evidence: evidence,
    };
  });
}

export async function planFeedAlternativesForDiscovery(
  input: FeedAlternativesInput,
): Promise<{ alternative_plans: FeedAlternativesPlanResult[] }> {
  const plans: FeedAlternativesPlanResult[] = [];
  const urls = uniqueStrings(input.urls).slice(0, 10);
  const maxCandidatesPerUrl = Math.max(1, Math.min(100, Math.trunc(input.maxCandidatesPerUrl)));
  for (const rawUrl of urls) {
    const warnings: string[] = [];
    const normalized = await validateAcquisitionUrl(rawUrl, { resolveDns: true });
    if (!normalized.url) {
      plans.push({
        url: rawUrl,
        final_url: null,
        candidates: [],
        warnings: [normalized.error ?? "URL is not allowed for alternative discovery."],
      });
      continue;
    }

    let finalUrl = normalized.url;
    const candidates: FeedAlternativeCandidate[] = [
      {
        provider_type: "rss",
        fetch_url: normalized.url,
        status: "needs_probe",
        strategy: "direct_feed_validation",
        confidence: FEED_PATH_HINT_RE.test(new URL(normalized.url).pathname) ? 0.74 : 0.44,
        reason: "Validate the current URL as a feed before searching replacements.",
      },
    ];
    addWellKnownCandidates(normalized.url, candidates);

    try {
      const page = await fetchText(normalized.url, input);
      finalUrl = page.finalUrl;
      for (const linkUrl of parseLinkHeaderFeedUrls(page.linkHeader, page.finalUrl)) {
        pushCandidate(candidates, {
          provider_type: "rss",
          fetch_url: linkUrl,
          status: "needs_probe",
          strategy: "http_link_header",
          confidence: 0.78,
          reason: "HTTP Link header advertises an alternate feed; requires feed-probe validation.",
        });
      }
      for (const linkUrl of extractLinkTagUrls(page.text, page.finalUrl, FEED_TYPE_HINTS)) {
        pushCandidate(candidates, {
          provider_type: "rss",
          fetch_url: linkUrl,
          status: "needs_probe",
          strategy: "html_alternate",
          confidence: 0.82,
          reason: "HTML alternate link advertises a feed; requires feed-probe validation.",
        });
      }
      addCmsHintCandidates(page.finalUrl, page.text, candidates);
      addSameSiteLinkCandidates(page.finalUrl, page.text, candidates);
    } catch (error) {
      warnings.push(error instanceof Error ? `page_probe: ${error.message}` : "page_probe: fetch failed");
    }

    await addSitemapCandidates(finalUrl, input, candidates, warnings);
    addWebsiteFallback(finalUrl, candidates);

    const validated = await validateFeedCandidates(candidates, input);
    plans.push({
      url: rawUrl,
      final_url: finalUrl,
      candidates: validated
        .sort((left, right) => {
          const leftValid = left.status === "candidate" && left.provider_type === "rss" ? 1 : 0;
          const rightValid = right.status === "candidate" && right.provider_type === "rss" ? 1 : 0;
          return rightValid - leftValid || right.confidence - left.confidence;
        })
        .slice(0, maxCandidatesPerUrl),
      warnings,
    });
  }
  return { alternative_plans: plans };
}

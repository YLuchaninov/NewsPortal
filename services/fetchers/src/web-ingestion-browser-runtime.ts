import type { WebsiteChannelConfig } from "@signalops/contracts";

import { inferResourceKindsFromUrl } from "./web-ingestion-classification";
import {
  DOWNLOAD_EXTENSION_PATTERN,
  FEED_HINT_PATTERN,
  appendItems,
  dedupeResources,
  detectWebsiteChallengeKind,
  extractAnchorLinks,
  extractDownloadUrls,
  extractHtmlTitle,
  extractJsonUrls,
  matchesSameDomain,
  normalizeUrl,
  parseJsonLdTypes,
  readOptionalString,
  resourceFromUrl,
  selectCollectionSeedUrls,
} from "./web-ingestion-extraction";
import {
  buildBrowserRouteHeaders,
  type WebsiteAuthContext,
} from "./web-ingestion-headers";
import type {
  DiscoveredWebsiteResource,
  WebsiteCapabilities,
  WebsiteChallengeKind,
} from "./web-ingestion-types";

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
          headers: route.request().headers?.() ?? {},
        }),
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

export async function discoverFromBrowserAssisted(input: {
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

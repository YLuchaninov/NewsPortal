import {
  createSignalOpsErrorDiagnostic,
  SIGNALOPS_ERROR_CODES,
  type SignalOpsErrorDiagnostic,
} from "@signalops/contracts";
import { parseDocument } from "htmlparser2";

import { parseFeed, type ParsedFeedDiagnostic } from "./feed-parser/index";
import { normalizeProbeUrl, validateAcquisitionUrl } from "./probe-url-guard";

export interface FeedProbeInput {
  urls: string[];
  sampleCount: number;
  userAgent: string;
  timeoutMs: number;
}

export interface FeedProbeSampleEntry {
  title: string;
  link: string;
  snippet: string;
  published_at: string | null;
}

export interface FeedProbeResult {
  url: string;
  feed_url: string;
  final_url: string;
  is_valid_rss: boolean;
  feed_title: string;
  sample_entries: FeedProbeSampleEntry[];
  discovered_feed_urls: string[];
  diagnostics: ParsedFeedDiagnostic[];
  error_code: string | null;
  error_diagnostic: SignalOpsErrorDiagnostic | null;
  error_text: string | null;
}

const FEED_CONTENT_TYPE_HINTS = [
  "application/rss+xml",
  "application/atom+xml",
  "application/feed+json",
  "application/json",
  "application/rdf+xml",
  "application/xml",
  "text/xml",
];
const MAX_FEED_PROBE_URLS = 10;
const MAX_FEED_PROBE_BODY_BYTES = 2_000_000;

class FeedProbeError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "FeedProbeError";
    this.code = code;
  }
}

function diagnostic(code: string, message: string): SignalOpsErrorDiagnostic {
  return createSignalOpsErrorDiagnostic({ code, message });
}

function resultErrorFields(errorCode: string, errorText: string): Pick<FeedProbeResult, "error_code" | "error_diagnostic" | "error_text"> {
  return {
    error_code: errorCode,
    error_diagnostic: diagnostic(errorCode, errorText),
    error_text: errorText,
  };
}

function discoverFeedUrlsFromHtml(html: string, baseUrl: string): string[] {
  const urls: string[] = [];
  let htmlBaseUrl = baseUrl;
  const document = parseDocument(html);
  const visit = (node: unknown): void => {
    if (!node || typeof node !== "object") {
      return;
    }
    const record = node as {
      name?: unknown;
      attribs?: Record<string, string>;
      children?: unknown[];
    };
    const nodeName = String(record.name ?? "").toLowerCase();
    if (nodeName === "base") {
      const href = String(record.attribs?.href ?? "").trim();
      const resolved = href ? normalizeProbeUrl(href, baseUrl) : { url: null };
      if (resolved.url) {
        htmlBaseUrl = resolved.url;
      }
    }
    if (nodeName === "link") {
      const attribs = record.attribs ?? {};
      const relTokens = new Set(String(attribs.rel ?? "").toLowerCase().split(/\s+/).filter(Boolean));
      const typeValue = String(attribs.type ?? "").toLowerCase();
      const href = String(attribs.href ?? "").trim();
      if (
        href &&
        relTokens.has("alternate") &&
        FEED_CONTENT_TYPE_HINTS.some((hint) => typeValue.includes(hint))
      ) {
        const resolved = normalizeProbeUrl(href, htmlBaseUrl);
        if (resolved.url && !urls.includes(resolved.url)) {
          urls.push(resolved.url);
        }
      }
    }
    for (const child of record.children ?? []) {
      visit(child);
    }
  };
  for (const child of document.children) {
    visit(child);
  }
  return urls;
}

function discoverFeedUrlsFromLinkHeader(value: string | null, baseUrl: string): string[] {
  if (!value) {
    return [];
  }
  const urls: string[] = [];
  const matches = value.matchAll(/<([^>]+)>\s*;\s*([^,]+)/g);
  for (const match of matches) {
    const rawUrl = String(match[1] ?? "").trim();
    const params = String(match[2] ?? "").toLowerCase();
    if (!/\brel\s*=\s*"?[^"]*\balternate\b/.test(params)) {
      continue;
    }
    if (!FEED_CONTENT_TYPE_HINTS.some((hint) => params.includes(hint))) {
      continue;
    }
    const resolved = normalizeProbeUrl(rawUrl, baseUrl);
    if (resolved.url && !urls.includes(resolved.url)) {
      urls.push(resolved.url);
    }
  }
  return urls;
}

function sampleEntries(parsed: ReturnType<typeof parseFeed>, sampleCount: number): FeedProbeSampleEntry[] {
  return parsed.entries.slice(0, sampleCount).map((entry) => ({
    title: entry.title,
    link: entry.url ?? "",
    snippet: entry.summaryHtml || entry.contentHtml || entry.title,
    published_at: entry.publishedAt,
  }));
}

async function fetchText(url: string, input: Pick<FeedProbeInput, "userAgent" | "timeoutMs">): Promise<{
  finalUrl: string;
  contentType: string | null;
  linkHeader: string | null;
  text: string;
}> {
  const guardedInitialUrl = await validateAcquisitionUrl(url, { resolveDns: true });
  if (!guardedInitialUrl.url) {
    throw new FeedProbeError(
      SIGNALOPS_ERROR_CODES.acquisitionUrlBlocked,
      guardedInitialUrl.error ?? "Feed probe URL is not allowed.",
    );
  }
  const response = await fetch(guardedInitialUrl.url, {
    headers: {
      "user-agent": input.userAgent,
      accept: "application/rss+xml,application/atom+xml,application/feed+json,application/json,application/xml,text/xml,text/html,*/*;q=0.8",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(input.timeoutMs),
  });
  if (!response.ok) {
    throw new FeedProbeError(
      SIGNALOPS_ERROR_CODES.providerFetchFailed,
      `Feed probe fetch failed with ${response.status} ${response.statusText}.`,
    );
  }
  const guardedFinalUrl = await validateAcquisitionUrl(response.url || url, { resolveDns: true });
  if (!guardedFinalUrl.url) {
    throw new FeedProbeError(
      SIGNALOPS_ERROR_CODES.acquisitionUrlFinalBlocked,
      guardedFinalUrl.error ?? "Feed probe final URL is not allowed.",
    );
  }
  const contentLength = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_FEED_PROBE_BODY_BYTES) {
    throw new FeedProbeError(SIGNALOPS_ERROR_CODES.providerFetchTooLarge, "Feed probe response body is too large.");
  }
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > MAX_FEED_PROBE_BODY_BYTES) {
    throw new FeedProbeError(SIGNALOPS_ERROR_CODES.providerFetchTooLarge, "Feed probe response body is too large.");
  }
  return {
    finalUrl: guardedFinalUrl.url,
    contentType: response.headers.get("content-type"),
    linkHeader: response.headers.get("link"),
    text: new TextDecoder().decode(bytes),
  };
}

function parseProbeBody(
  input: {
    url: string;
    finalUrl: string;
    contentType: string | null;
    text: string;
  },
  sampleCount: number,
): Omit<FeedProbeResult, "url" | "discovered_feed_urls" | "error_code" | "error_diagnostic" | "error_text"> {
  const parsed = parseFeed({
    body: input.text,
    contentType: input.contentType,
    feedUrl: input.finalUrl,
    baseUrl: input.finalUrl,
  });
  return {
    feed_url: input.finalUrl,
    final_url: input.finalUrl,
    is_valid_rss: parsed.entries.length > 0 || Boolean(parsed.title),
    feed_title: parsed.title ?? "",
    sample_entries: sampleEntries(parsed, sampleCount),
    diagnostics: parsed.diagnostics ?? [],
  };
}

export async function probeFeedsForDiscovery(input: FeedProbeInput): Promise<{ probed_feeds: FeedProbeResult[] }> {
  const results: FeedProbeResult[] = [];
  const urls = Array.from(new Set(input.urls.map((item) => item.trim()).filter(Boolean))).slice(
    0,
    MAX_FEED_PROBE_URLS,
  );
  for (const url of urls) {
    const normalizedUrl = await validateAcquisitionUrl(url, { resolveDns: true });
    if (!normalizedUrl.url) {
      const errorText = normalizedUrl.error ?? "Invalid feed probe URL.";
      results.push({
        url,
        feed_url: url,
        final_url: url,
        is_valid_rss: false,
        feed_title: "",
        sample_entries: [],
        discovered_feed_urls: [],
        diagnostics: [],
        ...resultErrorFields(SIGNALOPS_ERROR_CODES.acquisitionUrlBlocked, errorText),
      });
      continue;
    }

    try {
      const response = await fetchText(normalizedUrl.url, input);
      try {
        const parsed = parseProbeBody(
          {
            url: normalizedUrl.url,
            finalUrl: response.finalUrl,
            contentType: response.contentType,
            text: response.text,
          },
          input.sampleCount,
        );
        results.push({
          url: normalizedUrl.url,
          ...parsed,
          discovered_feed_urls: [],
          error_code: null,
          error_diagnostic: null,
          error_text: null,
        });
        continue;
      } catch {
        const discovered = Array.from(
          new Set([
            ...discoverFeedUrlsFromLinkHeader(response.linkHeader, response.finalUrl),
            ...discoverFeedUrlsFromHtml(response.text, response.finalUrl),
          ]),
        );
        let accepted: FeedProbeResult | null = null;
        for (const feedUrl of discovered) {
          try {
            const feedResponse = await fetchText(feedUrl, input);
            const parsed = parseProbeBody(
              {
                url: feedUrl,
                finalUrl: feedResponse.finalUrl,
                contentType: feedResponse.contentType,
                text: feedResponse.text,
              },
              input.sampleCount,
            );
            if (parsed.is_valid_rss) {
              accepted = {
                url: normalizedUrl.url,
                ...parsed,
                discovered_feed_urls: discovered,
                error_code: null,
                error_diagnostic: null,
                error_text: null,
              };
              break;
            }
          } catch {
            continue;
          }
        }
        if (accepted) {
          results.push(accepted);
        } else {
          const errorText = "No valid feed found at URL or discovered alternates.";
          results.push({
            url: normalizedUrl.url,
            feed_url: response.finalUrl,
            final_url: response.finalUrl,
            is_valid_rss: false,
            feed_title: "",
            sample_entries: [],
            discovered_feed_urls: discovered,
            diagnostics: [],
            ...resultErrorFields(SIGNALOPS_ERROR_CODES.feedProbeNoValidFeed, errorText),
          });
        }
      }
    } catch (error) {
      const errorText = error instanceof Error ? error.message : "Feed probe failed.";
      const errorCode = error instanceof FeedProbeError ? error.code : SIGNALOPS_ERROR_CODES.feedProbeFailed;
      results.push({
        url: normalizedUrl.url,
        feed_url: normalizedUrl.url,
        final_url: normalizedUrl.url,
        is_valid_rss: false,
        feed_title: "",
        sample_entries: [],
        discovered_feed_urls: [],
        diagnostics: [],
        ...resultErrorFields(errorCode, errorText),
      });
    }
  }

  return { probed_feeds: results };
}

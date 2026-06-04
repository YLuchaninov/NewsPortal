import {
  createSignalOpsErrorDiagnostic,
  SIGNALOPS_ERROR_CODES,
  type SignalOpsErrorDiagnostic,
} from "@signalops/contracts";

import { validateAcquisitionUrl } from "./probe-url-guard";

export interface DiscoveryUrlValidationInput {
  urls: string[];
  userAgent: string;
  timeoutMs: number;
}

export interface DiscoveryUrlValidationResult {
  url: string;
  status: number | null;
  content_type: string | null;
  final_url: string;
  is_rss_candidate: boolean;
  is_website_candidate: boolean;
  source_type_hint: "rss" | "website" | "unknown";
  error_code: string | null;
  error_diagnostic: SignalOpsErrorDiagnostic | null;
  error_text: string | null;
}

const MAX_DISCOVERY_URL_VALIDATION_URLS = 10;

function classifySourceType(
  url: string,
  contentType: string | null,
): Pick<DiscoveryUrlValidationResult, "is_rss_candidate" | "is_website_candidate" | "source_type_hint"> {
  const loweredUrl = url.toLowerCase();
  const loweredType = (contentType ?? "").toLowerCase();
  const isRss =
    ["application/rss+xml", "application/atom+xml", "xml", "rss", "atom"].some((hint) =>
      loweredType.includes(hint),
    ) || ["/feed", "/rss", ".rss", ".xml", "atom"].some((hint) => loweredUrl.includes(hint));
  const isWebsite = loweredType.includes("text/html") || loweredUrl.startsWith("http://") || loweredUrl.startsWith("https://");
  const sourceTypeHint = isRss ? "rss" : isWebsite ? "website" : "unknown";
  return {
    is_rss_candidate: isRss,
    is_website_candidate: isWebsite,
    source_type_hint: sourceTypeHint,
  };
}

function diagnostic(code: string, message: string): SignalOpsErrorDiagnostic {
  return createSignalOpsErrorDiagnostic({ code, message });
}

async function validateOneUrl(
  rawUrl: string,
  input: Pick<DiscoveryUrlValidationInput, "userAgent" | "timeoutMs">,
): Promise<DiscoveryUrlValidationResult> {
  const guarded = await validateAcquisitionUrl(rawUrl, { resolveDns: true });
  if (!guarded.url) {
    const errorText = guarded.error ?? "Discovery URL is not allowed.";
    return {
      url: rawUrl,
      status: null,
      content_type: null,
      final_url: rawUrl,
      ...classifySourceType(rawUrl, null),
      error_code: SIGNALOPS_ERROR_CODES.acquisitionUrlBlocked,
      error_diagnostic: diagnostic(SIGNALOPS_ERROR_CODES.acquisitionUrlBlocked, errorText),
      error_text: errorText,
    };
  }

  try {
    const response = await fetch(guarded.url, {
      headers: {
        "user-agent": input.userAgent,
        accept: "application/rss+xml,application/atom+xml,application/feed+json,application/json,application/xml,text/xml,text/html,*/*;q=0.8",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(input.timeoutMs),
    });
    await response.body?.cancel().catch(() => undefined);
    const guardedFinalUrl = await validateAcquisitionUrl(response.url || guarded.url, { resolveDns: true });
    if (!guardedFinalUrl.url) {
      const errorText = guardedFinalUrl.error ?? "Discovery URL final location is not allowed.";
      return {
        url: guarded.url,
        status: response.status,
        content_type: response.headers.get("content-type"),
        final_url: response.url || guarded.url,
        ...classifySourceType(response.url || guarded.url, response.headers.get("content-type")),
        error_code: SIGNALOPS_ERROR_CODES.acquisitionUrlFinalBlocked,
        error_diagnostic: diagnostic(SIGNALOPS_ERROR_CODES.acquisitionUrlFinalBlocked, errorText),
        error_text: errorText,
      };
    }

    return {
      url: guarded.url,
      status: response.status,
      content_type: response.headers.get("content-type"),
      final_url: guardedFinalUrl.url,
      ...classifySourceType(guardedFinalUrl.url, response.headers.get("content-type")),
      error_code: null,
      error_diagnostic: null,
      error_text: null,
    };
  } catch (error) {
    const errorText = error instanceof Error ? error.message : "Discovery URL validation failed.";
    return {
      url: guarded.url,
      status: null,
      content_type: null,
      final_url: guarded.url,
      ...classifySourceType(guarded.url, null),
      error_code: SIGNALOPS_ERROR_CODES.providerFetchFailed,
      error_diagnostic: diagnostic(SIGNALOPS_ERROR_CODES.providerFetchFailed, errorText),
      error_text: errorText,
    };
  }
}

export async function validateUrlsForDiscovery(
  input: DiscoveryUrlValidationInput,
): Promise<{ validated_urls: DiscoveryUrlValidationResult[] }> {
  const urls = Array.from(new Set(input.urls.map((item) => item.trim()).filter(Boolean))).slice(
    0,
    MAX_DISCOVERY_URL_VALIDATION_URLS,
  );
  const validated_urls: DiscoveryUrlValidationResult[] = [];
  for (const url of urls) {
    validated_urls.push(await validateOneUrl(url, input));
  }
  return { validated_urls };
}

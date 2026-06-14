import {
  isAdminChannelProviderType,
  type AdminChannelProviderType
} from "./channel-providers";

function normalizeString(value: unknown): string {
  return String(value ?? "").trim();
}

export type ChannelProviderShapeClassification =
  | "feed_like"
  | "semantic_query_feed"
  | "website_page"
  | "api_like"
  | "email_imap"
  | "unknown";

export interface ChannelProviderShapeAlternative {
  providerType: AdminChannelProviderType | "adapter_required";
  fetchUrl: string | null;
  reason: string;
  requiresMapping?: boolean;
  requiresAdapter?: boolean;
}

export interface ChannelProviderShapeValidation {
  classification: ChannelProviderShapeClassification;
  blocker: string | null;
  recommendedProviderType: AdminChannelProviderType | "adapter_required" | null;
  recommendedAlternatives: ChannelProviderShapeAlternative[];
  feedProbeEvidence?: Record<string, unknown> | null;
}

function normalizeUrlKey(value: unknown): string {
  const raw = normalizeString(value);
  if (!raw) {
    return "";
  }
  try {
    const url = new URL(raw);
    url.hash = "";
    url.search = "";
    url.hostname = url.hostname.toLowerCase();
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.toString();
  } catch {
    return raw.toLowerCase().replace(/\/+$/, "");
  }
}

const SOURCE_IDENTITY_NON_SEMANTIC_QUERY_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "fbclid",
  "gclid",
  "dclid",
  "mc_cid",
  "mc_eid",
  "ref",
  "source",
  "count",
  "limit",
  "page",
  "per_page"
]);

function isSemanticQueryFeedUrl(url: URL): boolean {
  const hostname = url.hostname.toLowerCase();
  const pathname = url.pathname.replace(/\/+$/, "").toLowerCase() || "/";
  const hasMeaningfulQuery = Array.from(url.searchParams.keys()).some((key) => {
    const normalized = key.trim().toLowerCase();
    return (
      normalized &&
      !normalized.startsWith("utm_") &&
      !SOURCE_IDENTITY_NON_SEMANTIC_QUERY_PARAMS.has(normalized)
    );
  });
  if (!hasMeaningfulQuery) {
    return false;
  }
  return (
    hostname.includes("rss") ||
    hostname.includes("feeds") ||
    /(^|\/)(feed|feeds|rss|atom|search\.rss)(\/|\.|$)/i.test(pathname) ||
    /\.(rss|atom|xml)$/i.test(pathname) ||
    hostname.includes("feedburner")
  );
}

export function normalizeSourceIdentityUrlKey(
  value: unknown,
  options: { preserveSemanticQuery?: boolean } = {}
): string {
  const raw = normalizeString(value);
  if (!raw) {
    return "";
  }

  try {
    const url = new URL(raw);
    const preserveSearchParams = options.preserveSemanticQuery === true || isSemanticQueryFeedUrl(url);
    const semanticSearchEntries = preserveSearchParams
      ? Array.from(url.searchParams.entries())
          .map(([key, entryValue]) => [key.trim().toLowerCase(), entryValue.trim()] as const)
          .filter(
            ([key, entryValue]) =>
              key &&
              entryValue &&
              !key.startsWith("utm_") &&
              !SOURCE_IDENTITY_NON_SEMANTIC_QUERY_PARAMS.has(key)
          )
          .sort(([leftKey, leftValue], [rightKey, rightValue]) => {
            const keyComparison = leftKey.localeCompare(rightKey);
            return keyComparison === 0 ? leftValue.localeCompare(rightValue) : keyComparison;
          })
      : [];

    url.hash = "";
    url.search = "";
    url.hostname = url.hostname.toLowerCase();
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";

    if (semanticSearchEntries.length > 0) {
      const semanticSearch = new URLSearchParams();
      semanticSearchEntries.forEach(([key, entryValue]) => semanticSearch.append(key, entryValue));
      url.search = semanticSearch.toString();
    }

    return url.toString();
  } catch {
    return raw.toLowerCase().replace(/\/+$/, "");
  }
}

function isFeedLikeUrl(value: unknown): boolean {
  const raw = normalizeString(value);
  if (!raw) {
    return false;
  }
  try {
    const url = new URL(raw);
    if (isSemanticQueryFeedUrl(url) || url.hostname.toLowerCase().includes("rss")) {
      return true;
    }
  } catch {
    // Fall through to normalized path-based checks.
  }
  const normalized = normalizeUrlKey(value);
  if (!normalized) {
    return false;
  }
  try {
    const url = new URL(normalized);
    if (isSemanticQueryFeedUrl(url)) {
      return true;
    }
  } catch {
    // Fall through to path-based checks.
  }
  return (
    /(^|\/)(feed|feeds|rss|atom)(\/|\.|$)/i.test(normalized) ||
    /\.(rss|atom|xml)$/i.test(normalized) ||
    normalized.includes("feedburner")
  );
}

function isApiLikeUrl(value: unknown): boolean {
  const normalized = normalizeUrlKey(value);
  if (!normalized) {
    return false;
  }
  try {
    const url = new URL(normalized);
    const path = url.pathname.toLowerCase();
    if (isSemanticQueryFeedUrl(url) || isFeedLikeUrl(url.toString())) {
      return false;
    }
    return (
      /(^|\/)(api|graphql|openapi|swagger)(\/|\.|$)/i.test(path) ||
      /\.(json|ndjson)$/i.test(path) ||
      (url.searchParams.has("format") &&
        String(url.searchParams.get("format")).toLowerCase() === "json")
    );
  } catch {
    return /(^|\/)(api|graphql|openapi|swagger)(\/|\.|$)/i.test(normalized) ||
      /\.(json|ndjson)$/i.test(normalized);
  }
}

function isWebsiteOnlyUrl(value: unknown): boolean {
  const raw = normalizeString(value);
  if (!raw || isFeedLikeUrl(raw)) {
    return false;
  }
  try {
    const url = new URL(raw);
    const path = url.pathname.replace(/\/+$/, "");
    return !path || path === "/" || !/\.(rss|atom|xml)$/i.test(path);
  } catch {
    return false;
  }
}

function readFeedProbeEvidence(payload: Record<string, unknown>): Record<string, unknown> | null {
  const evidence = payload.feedProbeEvidence ?? payload.feed_probe_evidence;
  if (evidence != null && typeof evidence === "object" && !Array.isArray(evidence)) {
    return evidence as Record<string, unknown>;
  }
  const validation = payload.validation;
  if (validation != null && typeof validation === "object" && !Array.isArray(validation)) {
    const nested = (validation as Record<string, unknown>).feedProbeEvidence;
    if (nested != null && typeof nested === "object" && !Array.isArray(nested)) {
      return nested as Record<string, unknown>;
    }
  }
  return null;
}

export function hasValidFeedProbeEvidence(
  payload: Record<string, unknown>,
  fetchUrl: string | null
): boolean {
  const evidence = readFeedProbeEvidence(payload);
  if (!evidence) {
    return false;
  }
  const valid = evidence.isValidRss ?? evidence.is_valid_rss;
  if (valid !== true) {
    return false;
  }
  const evidenceUrl = normalizeUrlKey(
    evidence.feedUrl ?? evidence.feed_url ?? evidence.finalUrl ?? evidence.final_url
  );
  const normalizedFetchUrl = normalizeUrlKey(fetchUrl);
  return !evidenceUrl || !normalizedFetchUrl || evidenceUrl === normalizedFetchUrl;
}

export function readSourceCandidateStatus(payload: Record<string, unknown>): string | null {
  const status = normalizeString(
    payload.sourceCandidateStatus ?? payload.candidateStatus ?? payload.alternativeStatus
  );
  return status || null;
}

export function classifyChannelProviderShape(
  providerType: AdminChannelProviderType | string | null,
  fetchUrl: string | null
): ChannelProviderShapeClassification {
  if (providerType === "email_imap") {
    return "email_imap";
  }
  if (!normalizeString(fetchUrl)) {
    return "unknown";
  }
  try {
    const url = new URL(String(fetchUrl));
    if (isSemanticQueryFeedUrl(url)) {
      return "semantic_query_feed";
    }
  } catch {
    // Fall through to other checks.
  }
  if (isFeedLikeUrl(fetchUrl)) {
    return "feed_like";
  }
  if (isApiLikeUrl(fetchUrl)) {
    return "api_like";
  }
  if (isWebsiteOnlyUrl(fetchUrl)) {
    return "website_page";
  }
  return "unknown";
}

export function buildProviderShapeValidation(
  providerType: AdminChannelProviderType | string | null,
  fetchUrl: string | null,
  payload: Record<string, unknown> = {}
): ChannelProviderShapeValidation {
  const classification = classifyChannelProviderShape(providerType, fetchUrl);
  const feedProbeEvidence = readFeedProbeEvidence(payload);
  const alternatives: ChannelProviderShapeAlternative[] = [];
  let blocker: string | null = null;
  let recommendedProviderType: AdminChannelProviderType | "adapter_required" | null;

  if (classification === "api_like" && providerType !== "api") {
    blocker = "api_mapping_required";
    recommendedProviderType = "api";
    alternatives.push({
      providerType: "api",
      fetchUrl,
      reason: "URL shape looks like a structured API endpoint; configure API field mappings instead of onboarding it as RSS/website.",
      requiresMapping: true
    });
  } else if (providerType === "rss" && classification === "website_page") {
    if (hasValidFeedProbeEvidence(payload, fetchUrl)) {
      recommendedProviderType = "rss";
    } else {
      blocker = "rss_requires_feed_evidence";
      recommendedProviderType = "website";
      alternatives.push({
        providerType: "website",
        fetchUrl,
        reason: "URL looks like a website page/root. Use website ingestion or run channel alternatives to discover a real feed URL."
      });
      alternatives.push({
        providerType: "rss",
        fetchUrl: null,
        reason: "Run feed autodiscovery; only onboard RSS when fetchers feed-probe validates a discovered RSS/Atom/JSON Feed."
      });
    }
  } else if (providerType === "website" && ["feed_like", "semantic_query_feed"].includes(classification)) {
    recommendedProviderType = "rss";
    alternatives.push({
      providerType: "rss",
      fetchUrl,
      reason: "URL looks feed-like; RSS is usually the safer provider when the feed probe validates it."
    });
  } else if (providerType === "api" && classification !== "api_like") {
    recommendedProviderType = "api";
  } else {
    recommendedProviderType = isAdminChannelProviderType(String(providerType ?? ""))
      ? (providerType as AdminChannelProviderType)
      : null;
  }

  return {
    classification,
    blocker,
    recommendedProviderType,
    recommendedAlternatives: alternatives,
    ...(feedProbeEvidence ? { feedProbeEvidence } : {})
  };
}

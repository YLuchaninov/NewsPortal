import { createHash, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

import {
  extractFromHtml,
  type ArticleData,
} from "@extractus/article-extractor";
import type { Pool, PoolClient } from "pg";

import { ARTICLE_INGEST_REQUESTED_EVENT, type ResourceKind } from "@newsportal/contracts";

import type { FetchersConfig } from "./config";
import { upsertArticleObservation } from "./document-observations";
import {
  CrawlPolicyCacheService,
  classifyResourceCandidate,
  inferResourceKindsFromUrl,
} from "./web-ingestion";
import { canonicalizeUrl, collapseWhitespace, decodeHtmlEntities, stripHtmlTags } from "./rss";

type ExtractionState = "pending" | "skipped" | "enriched" | "failed";
type ProjectionState =
  | "pending"
  | "projected_to_common_pipeline"
  | "explicitly_rejected_before_pipeline";

interface EnrichmentLogger {
  info(payload: unknown, message?: string): void;
  warn(payload: unknown, message?: string): void;
  error(payload: unknown, message?: string): void;
}

interface WebResourceRow {
  resourceId: string;
  channelId: string;
  externalResourceId: string | null;
  url: string;
  normalizedUrl: string;
  finalUrl: string | null;
  resourceKind: string;
  title: string;
  summary: string;
  body: string | null;
  bodyHtml: string | null;
  lang: string | null;
  langConfidence: number | null;
  publishedAt: string | null;
  modifiedAt: string | null;
  classificationJson: Record<string, unknown>;
  attributesJson: Record<string, unknown>;
  documentsJson: unknown[];
  mediaJson: unknown[];
  childResourcesJson: unknown[];
  linksOutJson: unknown[];
  rawPayloadJson: Record<string, unknown>;
  extractionState: string;
  extractionError: string | null;
  projectedArticleId: string | null;
  channelName: string;
  userAgent: string;
  requestTimeoutMs: number;
  minEditorialBodyLength: number;
}

export interface ResourceEnrichmentRequest {
  force?: boolean;
}

export interface ResourceEnrichmentResult {
  status: "skipped" | "enriched" | "failed";
  resource_id: string;
  resource_kind: ResourceKind;
  extraction_state: Exclude<ExtractionState, "pending">;
  projected_doc_id: string | null;
  documents_count: number;
  media_count: number;
  error?: string | null;
}

export interface ReplayStoredProjectionOptions {
  force?: boolean;
}

class AsyncSemaphore {
  private readonly waiting: Array<() => void> = [];
  private available: number;

  constructor(initialCapacity: number) {
    this.available = Math.max(1, Math.floor(initialCapacity) || 1);
  }

  async acquire(): Promise<() => void> {
    if (this.available > 0) {
      this.available -= 1;
      return () => this.release();
    }

    await new Promise<void>((resolve) => {
      this.waiting.push(resolve);
    });
    this.available -= 1;
    return () => this.release();
  }

  private release(): void {
    this.available += 1;
    const next = this.waiting.shift();
    if (next) {
      next();
    }
  }
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function normalizeText(value: string): string {
  return collapseWhitespace(decodeHtmlEntities(stripHtmlTags(value)));
}

function readOptionalString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function maybeExternalUrl(value: unknown, baseUrl?: string): string | null {
  const raw = readOptionalString(value);
  if (!raw) {
    return null;
  }
  try {
    const url = baseUrl ? new URL(raw, baseUrl) : new URL(raw);
    if (!["http:", "https:"].includes(url.protocol)) {
      return null;
    }
    return canonicalizeUrl(url.toString());
  } catch {
    return null;
  }
}

function extractMetaContent(html: string, names: readonly string[]): string | null {
  for (const name of names) {
    const match = html.match(
      new RegExp(
        `<meta[^>]+(?:name|property)=["']${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]+content=["']([\\s\\S]*?)["'][^>]*>`,
        "i"
      )
    );
    const value = readOptionalString(match?.[1] ?? null);
    if (value) {
      return value;
    }
  }
  return null;
}

function extractHtmlTitle(html: string): string | null {
  return readOptionalString(normalizeText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? ""));
}

function extractH1(html: string): string | null {
  return readOptionalString(normalizeText(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? ""));
}

function extractStructuredTypes(html: string): string[] {
  const types = new Set<string>();
  for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    const payload = readOptionalString(match[1] ?? null);
    if (!payload) {
      continue;
    }
    try {
      const parsed = JSON.parse(payload) as unknown;
      const stack = Array.isArray(parsed) ? [...parsed] : [parsed];
      while (stack.length > 0) {
        const value = stack.pop();
        if (!value || typeof value !== "object") {
          continue;
        }
        if (Array.isArray(value)) {
          stack.push(...value);
          continue;
        }
        const record = value as Record<string, unknown>;
        const typeValue = record["@type"];
        if (typeof typeValue === "string" && typeValue.trim()) {
          types.add(typeValue.trim());
        }
        if (Array.isArray(typeValue)) {
          for (const item of typeValue) {
            if (typeof item === "string" && item.trim()) {
              types.add(item.trim());
            }
          }
        }
        for (const nested of Object.values(record)) {
          if (nested && typeof nested === "object") {
            stack.push(nested);
          }
        }
      }
    } catch {
      continue;
    }
  }
  return Array.from(types);
}

function extractAnchorLinks(html: string, baseUrl: string): Array<{ url: string; title: string }> {
  const links: Array<{ url: string; title: string }> = [];
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const url = maybeExternalUrl(match[1] ?? "", baseUrl);
    if (!url) {
      continue;
    }
    links.push({
      url,
      title: normalizeText(match[2] ?? "")
    });
  }
  return links;
}

function extractImageUrls(html: string, baseUrl: string): string[] {
  const urls = new Set<string>();
  const ogImage = maybeExternalUrl(extractMetaContent(html, ["og:image", "twitter:image"]), baseUrl);
  if (ogImage) {
    urls.add(ogImage);
  }
  for (const match of html.matchAll(/<img\b[^>]*src=["']([^"']+)["'][^>]*>/gi)) {
    const url = maybeExternalUrl(match[1] ?? "", baseUrl);
    if (!url) {
      continue;
    }
    urls.add(url);
    if (urls.size >= 5) {
      break;
    }
  }
  return Array.from(urls);
}

function extractDownloadLinks(html: string, baseUrl: string): Array<{ url: string; title: string }> {
  return extractAnchorLinks(html, baseUrl).filter((link) => /\.(pdf|csv|xlsx|xls|json|xml|zip)(?:$|\?)/i.test(link.url));
}

function extractDefinitionListAttributes(html: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const match of html.matchAll(/<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/gi)) {
    const key = normalizeText(match[1] ?? "");
    const value = normalizeText(match[2] ?? "");
    if (key && value) {
      attributes[key] = value;
    }
  }
  return attributes;
}

function extractTableAttributes(html: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const match of html.matchAll(/<tr[^>]*>\s*<t[hd][^>]*>([\s\S]*?)<\/t[hd]>\s*<t[hd][^>]*>([\s\S]*?)<\/t[hd]>\s*<\/tr>/gi)) {
    const key = normalizeText(match[1] ?? "");
    const value = normalizeText(match[2] ?? "");
    if (key && value && !(key in attributes)) {
      attributes[key] = value;
    }
  }
  return attributes;
}

function summarizeBody(body: string, maxLength = 320): string {
  const normalized = normalizeText(body);
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1).trim()}…`;
}

function computeContentHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function isProjectableResourceKind(kind: ResourceKind): boolean {
  return kind !== "unknown";
}

function buildProjectableBody(extraction: ExtractionPersistShape): string {
  return readOptionalString(extraction.body) ??
    readOptionalString(extraction.summary) ??
    readOptionalString(extraction.title) ??
    "";
}

interface ProjectionDecision {
  shouldProject: boolean;
  projectionState: ProjectionState;
  projectionError: string | null;
  body: string;
}

function resolveProjectionDecision(
  extraction: ExtractionPersistShape,
): ProjectionDecision {
  if (extraction.status === "failed") {
    return {
      shouldProject: false,
      projectionState: "explicitly_rejected_before_pipeline",
      projectionError: extraction.errorText ?? "resource_enrichment_failed",
      body: "",
    };
  }

  if (extraction.status === "skipped") {
    return {
      shouldProject: false,
      projectionState: "explicitly_rejected_before_pipeline",
      projectionError: extraction.errorText ?? "resource_extraction_skipped",
      body: "",
    };
  }

  if (!isProjectableResourceKind(extraction.resourceKind)) {
    return {
      shouldProject: false,
      projectionState: "explicitly_rejected_before_pipeline",
      projectionError: "unsupported_resource_kind",
      body: "",
    };
  }

  if (!readOptionalString(extraction.finalUrl)) {
    return {
      shouldProject: false,
      projectionState: "explicitly_rejected_before_pipeline",
      projectionError: "missing_final_url",
      body: "",
    };
  }

  const body = buildProjectableBody(extraction);
  if (!body) {
    return {
      shouldProject: false,
      projectionState: "explicitly_rejected_before_pipeline",
      projectionError: "missing_projectable_content",
      body,
    };
  }

  return {
    shouldProject: true,
    projectionState: "projected_to_common_pipeline",
    projectionError: null,
    body,
  };
}

function buildPersistedExtraction(resource: WebResourceRow): ExtractionPersistShape {
  return {
    status:
      resource.extractionState === "failed"
        ? "failed"
        : resource.extractionState === "skipped"
          ? "skipped"
          : "enriched",
    resourceKind:
      ([
        "editorial",
        "listing",
        "entity",
        "document",
        "data_file",
        "api_payload",
        "unknown",
      ] as const).includes(resource.resourceKind as ResourceKind)
        ? (resource.resourceKind as ResourceKind)
        : "unknown",
    finalUrl: resource.finalUrl ?? resource.url,
    title: resource.title,
    summary: resource.summary,
    body: resource.body,
    bodyHtml: resource.bodyHtml,
    lang: resource.lang,
    langConfidence: resource.langConfidence,
    publishedAt: resource.publishedAt,
    modifiedAt: resource.modifiedAt,
    classificationJson: resource.classificationJson,
    attributesJson: resource.attributesJson,
    documentsJson: asArray(resource.documentsJson),
    mediaJson: asArray(resource.mediaJson),
    childResourcesJson: asArray(resource.childResourcesJson),
    linksOutJson: asArray(resource.linksOutJson),
    contentHash: resource.body ? computeContentHash(resource.body) : null,
    errorText: resource.extractionError,
    projectedDocId: resource.projectedArticleId,
  };
}

function buildArticleParserOptions() {
  return {
    descriptionTruncateLen: 320,
    descriptionLengthThreshold: 120,
    contentLengthThreshold: 120,
    wordsPerMinute: 240,
  };
}

interface EditorialExtractorDecision {
  shouldInvoke: boolean;
  reason: "short_body" | "missing_title" | "missing_summary" | "missing_published_at" | "not_needed";
}

function extractDiscoveryClassification(
  classificationJson: Record<string, unknown>
): {
  kind: string;
  confidence: number | null;
  reasons: string[];
  hintedKinds: string[];
  discoverySource: string | null;
} {
  const nestedDiscovery = asRecord(classificationJson.discovery);
  const discoverySource =
    readOptionalString(nestedDiscovery.discoverySource) ??
    readOptionalString(asRecord(classificationJson.observability).discoverySource) ??
    null;
  const confidenceValue =
    typeof nestedDiscovery.confidence === "number" && Number.isFinite(nestedDiscovery.confidence)
      ? nestedDiscovery.confidence
      : typeof classificationJson.confidence === "number" && Number.isFinite(classificationJson.confidence)
      ? (classificationJson.confidence as number)
      : null;
  const reasonsSource = asArray(nestedDiscovery.reasons ?? classificationJson.reasons)
    .map((value) => readOptionalString(value))
    .filter((value): value is string => Boolean(value));
  const hintedKinds = asArray(nestedDiscovery.hintedKinds ?? classificationJson.hintedKinds)
    .map((value) => readOptionalString(value))
    .filter((value): value is string => Boolean(value));
  return {
    kind: readOptionalString(nestedDiscovery.kind) ?? readOptionalString(classificationJson.kind) ?? "unknown",
    confidence: confidenceValue,
    reasons: reasonsSource,
    hintedKinds,
    discoverySource,
  };
}

export function resolveEditorialExtractorDecision(input: {
  baseBody: string;
  title: string | null;
  summary: string | null;
  publishedAt: string | null;
  minEditorialBodyLength: number;
}): EditorialExtractorDecision {
  if (input.baseBody.length < input.minEditorialBodyLength) {
    return { shouldInvoke: true, reason: "short_body" };
  }
  if (!readOptionalString(input.title)) {
    return { shouldInvoke: true, reason: "missing_title" };
  }
  if (!readOptionalString(input.summary)) {
    return { shouldInvoke: true, reason: "missing_summary" };
  }
  if (!readOptionalString(input.publishedAt)) {
    return { shouldInvoke: true, reason: "missing_published_at" };
  }
  return { shouldInvoke: false, reason: "not_needed" };
}

export function buildWebsiteResourceClassificationJson(input: {
  priorClassificationJson: Record<string, unknown>;
  enrichmentClassification: {
    kind: ResourceKind;
    confidence: number;
    reasons: string[];
  };
  resolvedKind: ResourceKind;
  structuredTypes: string[];
  hintedKinds: ResourceKind[];
  reasonSource: "discovery" | "enrichment" | "stored_kind_fallback";
  resolutionReasons?: string[];
}): Record<string, unknown> {
  const discovery = extractDiscoveryClassification(input.priorClassificationJson);
  const discoveryKind = discovery.kind || "unknown";
  const resolutionReasons = asArray(input.resolutionReasons)
    .map((value) => readOptionalString(value))
    .filter((value): value is string => Boolean(value));
  const topLevelConfidence =
    input.reasonSource === "discovery"
      ? (discovery.confidence ?? input.enrichmentClassification.confidence)
      : input.enrichmentClassification.confidence;
  const topLevelReasons =
    input.reasonSource === "stored_kind_fallback"
      ? [...input.enrichmentClassification.reasons, "fallback:stored_kind", ...resolutionReasons]
      : input.reasonSource === "discovery"
      ? [...discovery.reasons, ...resolutionReasons]
      : [...input.enrichmentClassification.reasons, ...resolutionReasons];
  return {
    kind: input.resolvedKind,
    confidence: topLevelConfidence,
    reasons: Array.from(new Set(topLevelReasons)),
    hintedKinds: input.hintedKinds,
    discovery: {
      kind: discoveryKind,
      confidence: discovery.confidence,
      reasons: discovery.reasons,
      hintedKinds: discovery.hintedKinds,
      discoverySource: discovery.discoverySource,
    },
    enrichment: {
      kind: input.enrichmentClassification.kind,
      confidence: input.enrichmentClassification.confidence,
      reasons: input.enrichmentClassification.reasons,
      hintedKinds: input.hintedKinds,
      structuredTypes: input.structuredTypes,
    },
    resolved: {
      kind: input.resolvedKind,
      confidence: topLevelConfidence,
      reasonSource: input.reasonSource,
      reasons: resolutionReasons,
    },
    transition: {
      kindChanged: discoveryKind !== input.resolvedKind,
      fromKind: discoveryKind,
      toKind: input.resolvedKind,
      reasonSource: input.reasonSource,
    },
  };
}

function hasEditorialStructuredType(structuredTypes: readonly string[]): boolean {
  return structuredTypes.some((structuredType) => /(newsarticle|article|blogposting)/i.test(structuredType));
}

export function shouldRetainDiscoveryEditorialKind(input: {
  discoveryKind: string;
  enrichmentKind: ResourceKind;
  hintedKinds: ResourceKind[];
  structuredTypes: string[];
  publishedAt: string | null;
  title: string | null;
  summary: string | null;
  bodyText: string | null;
  hasRepeatedCards: boolean;
  hasPagination: boolean;
}): boolean {
  if (input.discoveryKind !== "editorial" || input.enrichmentKind !== "listing") {
    return false;
  }

  const editorialSignals = [
    input.hintedKinds.includes("editorial"),
    hasEditorialStructuredType(input.structuredTypes),
    Boolean(readOptionalString(input.publishedAt)),
    normalizeText(input.title ?? "").length >= 24,
    normalizeText(input.summary ?? "").length >= 80 || normalizeText(input.bodyText ?? "").length >= 500,
  ].filter(Boolean).length;

  const listingSignals = [
    input.hintedKinds.includes("listing") && !input.hintedKinds.includes("editorial"),
    input.hasRepeatedCards,
    input.hasPagination,
  ].filter(Boolean).length;

  return editorialSignals >= 3 && editorialSignals > listingSignals;
}

interface ExtractionPersistShape {
  status: Exclude<ExtractionState, "pending">;
  resourceKind: ResourceKind;
  finalUrl: string;
  title: string;
  summary: string;
  body: string | null;
  bodyHtml: string | null;
  lang: string | null;
  langConfidence: number | null;
  publishedAt: string | null;
  modifiedAt: string | null;
  classificationJson: Record<string, unknown>;
  attributesJson: Record<string, unknown>;
  documentsJson: unknown[];
  mediaJson: unknown[];
  childResourcesJson: unknown[];
  linksOutJson: unknown[];
  contentHash: string | null;
  errorText: string | null;
  projectedDocId: string | null;
}

export class ResourceEnrichmentService {
  private readonly globalSemaphore: AsyncSemaphore;
  private readonly domainSemaphores = new Map<string, AsyncSemaphore>();
  private readonly domainNextAllowedAt = new Map<string, number>();

  constructor(
    private readonly pool: Pool,
    private readonly config: FetchersConfig,
    private readonly logger: EnrichmentLogger,
    private readonly crawlPolicyCache = new CrawlPolicyCacheService(pool),
  ) {
    this.globalSemaphore = new AsyncSemaphore(config.enrichmentConcurrency);
  }

  async enrichResource(
    resourceId: string,
    request: ResourceEnrichmentRequest = {},
  ): Promise<ResourceEnrichmentResult> {
    const resource = await this.loadResource(resourceId);
    if (!resource) {
      throw new Error(`Resource ${resourceId} was not found for enrichment.`);
    }

    const force = request.force === true;
    if (!force && resource.extractionState === "enriched") {
      return {
        status: "skipped",
        resource_id: resource.resourceId,
        resource_kind: this.resolveResourceKind(resource.resourceKind),
        extraction_state: "skipped",
        projected_doc_id: resource.projectedArticleId,
        documents_count: asArray(resource.documentsJson).length,
        media_count: asArray(resource.mediaJson).length,
        error: "already_enriched",
      };
    }

    try {
      const extraction = await this.extractResource(resource);
      return await this.persistExtraction(resource, extraction);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown resource enrichment failure.";
      this.logger.warn({ error, resourceId }, "Resource enrichment failed.");
      return await this.persistExtraction(resource, {
        status: "failed",
        resourceKind: this.resolveResourceKind(resource.resourceKind),
        finalUrl: resource.finalUrl ?? resource.url,
        title: resource.title,
        summary: resource.summary,
        body: resource.body,
        bodyHtml: resource.bodyHtml,
        lang: resource.lang,
        langConfidence: resource.langConfidence,
        publishedAt: resource.publishedAt,
        modifiedAt: resource.modifiedAt,
        classificationJson: resource.classificationJson,
        attributesJson: resource.attributesJson,
        documentsJson: asArray(resource.documentsJson),
        mediaJson: asArray(resource.mediaJson),
        childResourcesJson: [],
        linksOutJson: [],
        contentHash: resource.body ? computeContentHash(resource.body) : null,
        errorText: message,
        projectedDocId: resource.projectedArticleId,
      });
    }
  }

  private async loadResource(resourceId: string): Promise<WebResourceRow | null> {
    const result = await this.pool.query<WebResourceRow>(
      `
        select
          wr.resource_id::text as "resourceId",
          wr.channel_id::text as "channelId",
          wr.external_resource_id as "externalResourceId",
          wr.url,
          wr.normalized_url as "normalizedUrl",
          wr.final_url as "finalUrl",
          wr.resource_kind as "resourceKind",
          wr.title,
          wr.summary,
          wr.body,
          wr.body_html as "bodyHtml",
          wr.lang,
          wr.lang_confidence as "langConfidence",
          wr.published_at::text as "publishedAt",
          wr.modified_at::text as "modifiedAt",
          wr.classification_json as "classificationJson",
          wr.attributes_json as "attributesJson",
          wr.documents_json as "documentsJson",
          wr.media_json as "mediaJson",
          wr.child_resources_json as "childResourcesJson",
          wr.links_out_json as "linksOutJson",
          wr.raw_payload_json as "rawPayloadJson",
          wr.extraction_state as "extractionState",
          wr.extraction_error as "extractionError",
          wr.projected_article_id::text as "projectedArticleId",
          sc.name as "channelName",
          coalesce(sc.config_json ->> 'userAgent', $2) as "userAgent",
          coalesce((sc.config_json ->> 'requestTimeoutMs')::int, $3) as "requestTimeoutMs",
          coalesce((sc.config_json #>> '{extraction,minEditorialBodyLength}')::int, 500) as "minEditorialBodyLength"
        from web_resources wr
        join source_channels sc on sc.channel_id = wr.channel_id
        where wr.resource_id = $1
        limit 1
      `,
      [resourceId, this.config.defaultUserAgent, this.config.defaultRequestTimeoutMs],
    );

    return result.rows[0] ?? null;
  }

  async replayStoredProjection(
    resourceId: string,
    options: ReplayStoredProjectionOptions = {},
  ): Promise<ResourceEnrichmentResult> {
    const resource = await this.loadResource(resourceId);
    if (!resource) {
      throw new Error(`Resource ${resourceId} was not found for projection replay.`);
    }

    const extractionState =
      resource.extractionState === "failed"
        ? "failed"
        : resource.extractionState === "skipped"
          ? "skipped"
          : "enriched";

    if (resource.projectedArticleId && options.force !== true) {
      return {
        status: "skipped",
        resource_id: resource.resourceId,
        resource_kind: this.resolveResourceKind(resource.resourceKind),
        extraction_state: extractionState,
        projected_doc_id: resource.projectedArticleId,
        documents_count: asArray(resource.documentsJson).length,
        media_count: asArray(resource.mediaJson).length,
        error: "already_projected",
      };
    }

    if (resource.extractionState !== "enriched") {
      return {
        status: "skipped",
        resource_id: resource.resourceId,
        resource_kind: this.resolveResourceKind(resource.resourceKind),
        extraction_state: extractionState,
        projected_doc_id: resource.projectedArticleId,
        documents_count: asArray(resource.documentsJson).length,
        media_count: asArray(resource.mediaJson).length,
        error: "resource_not_enriched",
      };
    }

    return await this.persistExtraction(resource, buildPersistedExtraction(resource));
  }

  private resolveResourceKind(rawKind: string): ResourceKind {
    return (["editorial", "listing", "entity", "document", "data_file", "api_payload", "unknown"] as const).includes(
      rawKind as ResourceKind
    )
      ? (rawKind as ResourceKind)
      : "unknown";
  }

  private getDomainSemaphore(hostname: string): AsyncSemaphore {
    const key = hostname.toLowerCase();
    const existing = this.domainSemaphores.get(key);
    if (existing) {
      return existing;
    }

    const created = new AsyncSemaphore(this.config.enrichmentPerDomainConcurrency);
    this.domainSemaphores.set(key, created);
    return created;
  }

  private async withExternalFetchSlot<T>(rawUrl: string, task: () => Promise<T>): Promise<T> {
    const url = new URL(rawUrl);
    const releaseGlobal = await this.globalSemaphore.acquire();
    const releaseDomain = await this.getDomainSemaphore(url.hostname).acquire();

    try {
      const nextAllowedAt = this.domainNextAllowedAt.get(url.hostname) ?? 0;
      const waitMs = Math.max(0, nextAllowedAt - Date.now());
      if (waitMs > 0) {
        await delay(waitMs);
      }
      this.domainNextAllowedAt.set(
        url.hostname,
        Date.now() + this.config.enrichmentPerDomainMinIntervalMs,
      );
      return await task();
    } finally {
      releaseDomain();
      releaseGlobal();
    }
  }

  private async extractResource(resource: WebResourceRow): Promise<ExtractionPersistShape> {
    const policy = await this.crawlPolicyCache.getPolicy(
      resource.url,
      resource.userAgent,
      resource.requestTimeoutMs,
    );
    if (!policy.isAllowed(resource.url, resource.userAgent)) {
      throw new Error("robots.txt disallows crawling this resource URL.");
    }

    const response = await this.withExternalFetchSlot(resource.url, async () =>
      fetch(resource.url, {
        headers: {
          "user-agent": resource.userAgent,
          accept: "text/html,application/xhtml+xml,application/json,application/xml,text/plain,*/*;q=0.8",
        },
        signal: AbortSignal.timeout(Math.max(resource.requestTimeoutMs, this.config.enrichmentTimeoutMs)),
        redirect: "follow",
      })
    );

    if (!response.ok) {
      throw new Error(`Resource fetch failed with ${response.status} ${response.statusText}.`);
    }

    const finalUrl = canonicalizeUrl(response.url);
    const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
    const modifiedAt = response.headers.get("last-modified");
    const contentLanguage = response.headers.get("content-language");

    if (!contentType.includes("html")) {
      const text = await response.text();
      const resourceKind = /\.(csv|xlsx|xls|json|xml|zip)(?:$|\?)/i.test(finalUrl)
        ? "data_file"
        : "document";
      const documentTitle = resource.title || finalUrl.split("/").at(-1) || resource.channelName;
      const body = normalizeText(text).slice(0, 4000) || null;
      return {
        status: "enriched",
        resourceKind,
        finalUrl,
        title: documentTitle,
        summary: resource.summary || summarizeBody(body ?? documentTitle),
        body,
        bodyHtml: null,
        lang: contentLanguage ? contentLanguage.split(",")[0]?.trim() ?? null : resource.lang,
        langConfidence: contentLanguage ? 0.7 : resource.langConfidence,
        publishedAt: resource.publishedAt,
        modifiedAt: modifiedAt ?? resource.modifiedAt,
        classificationJson: buildWebsiteResourceClassificationJson({
          priorClassificationJson: resource.classificationJson,
          enrichmentClassification: {
            kind: resourceKind,
            confidence: 0.9,
            reasons: ["content_type:file"],
          },
          resolvedKind: resourceKind,
          structuredTypes: [],
          hintedKinds: inferResourceKindsFromUrl(finalUrl),
          reasonSource: "enrichment",
        }),
        attributesJson: {
          contentType,
          sizeBytes: readOptionalString(response.headers.get("content-length")),
          observability: {
            structuredTypes: [],
            linkCount: 0,
            downloadCount: 1,
            hasRepeatedCards: false,
            hasPagination: false,
            hintedKinds: inferResourceKindsFromUrl(finalUrl),
            discoverySource: readOptionalString(
              extractDiscoveryClassification(resource.classificationJson).discoverySource
            ),
          },
        },
        documentsJson: [
          {
            url: finalUrl,
            title: documentTitle,
            contentType,
          },
        ],
        mediaJson: [],
        childResourcesJson: [],
        linksOutJson: [],
        contentHash: body ? computeContentHash(body) : null,
        errorText: null,
        projectedDocId: null,
      };
    }

    const html = await response.text();
    const structuredTypes = extractStructuredTypes(html);
    const title =
      extractMetaContent(html, ["og:title", "twitter:title"]) ??
      extractH1(html) ??
      extractHtmlTitle(html) ??
      resource.title ??
      resource.channelName;
    const summary = extractMetaContent(html, ["description", "og:description"]) ?? resource.summary;
    const links = extractAnchorLinks(html, finalUrl);
    const downloads = extractDownloadLinks(html, finalUrl);
    const hasRepeatedCards = links.length >= 8;
    const hasPagination = /\b(page|pagination|next)\b/i.test(html);
    const hintedKinds = inferResourceKindsFromUrl(finalUrl);
    const discoveryClassification = extractDiscoveryClassification(resource.classificationJson);
    const classification = classifyResourceCandidate({
      url: finalUrl,
      title,
      summary,
      hintedKinds,
      structuredTypes,
      hasRepeatedCards,
      hasPagination,
      hasDownloads: downloads.length > 0,
      publishedAtHint: resource.publishedAt,
    });
    const baseBody = normalizeText(html);
    const retainDiscoveryEditorialKind = shouldRetainDiscoveryEditorialKind({
      discoveryKind: discoveryClassification.kind,
      enrichmentKind: classification.kind,
      hintedKinds,
      structuredTypes,
      publishedAt: resource.publishedAt,
      title,
      summary,
      bodyText: baseBody,
      hasRepeatedCards,
      hasPagination,
    });
    const resolvedKind = retainDiscoveryEditorialKind
      ? "editorial"
      : classification.kind === "unknown"
      ? this.resolveResourceKind(resource.resourceKind)
      : classification.kind;
    const classificationReasonSource: "discovery" | "enrichment" | "stored_kind_fallback" =
      retainDiscoveryEditorialKind
        ? "discovery"
        : classification.kind === "unknown"
        ? resolvedKind === extractDiscoveryClassification(resource.classificationJson).kind
          ? "discovery"
          : "stored_kind_fallback"
        : resolvedKind === extractDiscoveryClassification(resource.classificationJson).kind
        ? "discovery"
        : "enrichment";
    const resolvedClassificationJson = buildWebsiteResourceClassificationJson({
      priorClassificationJson: resource.classificationJson,
      enrichmentClassification: classification,
      resolvedKind,
      structuredTypes,
      hintedKinds,
      reasonSource: classificationReasonSource,
      resolutionReasons: retainDiscoveryEditorialKind ? ["guard:retain_editorial_detail"] : [],
    });
    const baseSummary = summary ?? summarizeBody(baseBody);
    const baseObservability = {
      structuredTypes,
      linkCount: links.length,
      downloadCount: downloads.length,
      hasRepeatedCards,
      hasPagination,
      hintedKinds: inferResourceKindsFromUrl(finalUrl),
      discoverySource: readOptionalString(
        extractDiscoveryClassification(resource.classificationJson).discoverySource
      ),
    };
    const mediaJson = extractImageUrls(html, finalUrl).map((url) => ({
      mediaKind: "image",
      storageKind: "external_url",
      sourceUrl: url,
      title,
      altText: title,
    }));
    const linksOutJson = links.slice(0, 50).map((link) => ({
      url: link.url,
      title: link.title,
    }));

    if (resolvedKind === "editorial") {
      const extractorDecision = resolveEditorialExtractorDecision({
        baseBody,
        title,
        summary: baseSummary,
        publishedAt: resource.publishedAt,
        minEditorialBodyLength: resource.minEditorialBodyLength,
      });
      let extracted: ArticleData | null = null;
      if (extractorDecision.shouldInvoke) {
        try {
          extracted = await extractFromHtml(
            html,
            finalUrl,
            buildArticleParserOptions(),
          );
        } catch (error) {
          this.logger.warn({ error, resourceId: resource.resourceId }, "Editorial extraction fallback triggered.");
        }
      }

      const bodyHtml = readOptionalString(extracted?.content) ?? html;
      const body = normalizeText(bodyHtml);
      const publishedAt = readOptionalString(extracted?.published) ?? resource.publishedAt;
      const bodyUpliftChars = body.length - baseBody.length;
      const bodyUpliftRatio = baseBody.length > 0
        ? Number((body.length / baseBody.length).toFixed(4))
        : body.length > 0
        ? 1
        : 0;
      const extraction: ExtractionPersistShape = {
        status: "enriched",
        resourceKind: "editorial",
        finalUrl,
        title: readOptionalString(extracted?.title) ?? title,
        summary: readOptionalString(extracted?.description) ?? baseSummary ?? summarizeBody(body),
        body,
        bodyHtml,
        lang: contentLanguage ? contentLanguage.split(",")[0]?.trim() ?? null : resource.lang,
        langConfidence: contentLanguage ? 0.7 : resource.langConfidence,
        publishedAt,
        modifiedAt: modifiedAt ?? resource.modifiedAt,
        classificationJson: resolvedClassificationJson,
        attributesJson: {
          author: readOptionalString(extracted?.author),
          siteName: readOptionalString(extractMetaContent(html, ["og:site_name"])),
          observability: baseObservability,
          editorialExtraction: {
            articleExtractorInvoked: extractorDecision.shouldInvoke,
            articleExtractorReason: extractorDecision.reason,
            articleExtractorFetchReused: extractorDecision.shouldInvoke,
            baseBodyLength: baseBody.length,
            finalBodyLength: body.length,
            bodyUpliftChars,
            bodyUpliftRatio,
            bodyChanged: body !== baseBody,
            extractorImprovedBody: extractorDecision.shouldInvoke && body.length > baseBody.length,
          },
        },
        documentsJson: downloads.slice(0, 10).map((item) => ({
          url: item.url,
          title: item.title || item.url.split("/").at(-1) || "document",
        })),
        mediaJson,
        childResourcesJson: [],
        linksOutJson,
        contentHash: body ? computeContentHash(body) : null,
        errorText: null,
        projectedDocId: null,
      };
      return extraction;
    }

    if (resolvedKind === "listing") {
      const childResourcesJson = links
        .filter((link) => link.url !== finalUrl)
        .slice(0, 25)
        .map((link) => ({
          url: link.url,
          title: link.title,
          hintedKinds: inferResourceKindsFromUrl(link.url),
        }));
      return {
        status: "enriched",
        resourceKind: "listing",
        finalUrl,
        title,
        summary: summary ?? summarizeBody(baseBody),
        body: summarizeBody(baseBody, 2000),
        bodyHtml: null,
        lang: contentLanguage ? contentLanguage.split(",")[0]?.trim() ?? null : resource.lang,
        langConfidence: contentLanguage ? 0.7 : resource.langConfidence,
        publishedAt: resource.publishedAt,
        modifiedAt: modifiedAt ?? resource.modifiedAt,
        classificationJson: resolvedClassificationJson,
        attributesJson: {
          cardCount: links.length,
          paginationDetected: hasPagination,
          observability: baseObservability,
        },
        documentsJson: downloads.slice(0, 10),
        mediaJson,
        childResourcesJson,
        linksOutJson,
        contentHash: computeContentHash(JSON.stringify(childResourcesJson)),
        errorText: null,
        projectedDocId: null,
      };
    }

    if (resolvedKind === "entity") {
      const attributesJson = {
        ...extractDefinitionListAttributes(html),
        ...extractTableAttributes(html),
        observability: baseObservability,
      };
      return {
        status: "enriched",
        resourceKind: "entity",
        finalUrl,
        title,
        summary: summary ?? summarizeBody(baseBody),
        body: summarizeBody(baseBody, 3000),
        bodyHtml: null,
        lang: contentLanguage ? contentLanguage.split(",")[0]?.trim() ?? null : resource.lang,
        langConfidence: contentLanguage ? 0.7 : resource.langConfidence,
        publishedAt: resource.publishedAt,
        modifiedAt: modifiedAt ?? resource.modifiedAt,
        classificationJson: resolvedClassificationJson,
        attributesJson,
        documentsJson: downloads.slice(0, 10),
        mediaJson,
        childResourcesJson: [],
        linksOutJson,
        contentHash: computeContentHash(JSON.stringify(attributesJson) + baseBody),
        errorText: null,
        projectedDocId: null,
      };
    }

    return {
      status: "enriched",
      resourceKind: resolvedKind === "unknown" ? "unknown" : resolvedKind,
      finalUrl,
      title,
      summary: summary ?? summarizeBody(baseBody),
      body: summarizeBody(baseBody, 3000),
      bodyHtml: null,
      lang: contentLanguage ? contentLanguage.split(",")[0]?.trim() ?? null : resource.lang,
      langConfidence: contentLanguage ? 0.7 : resource.langConfidence,
      publishedAt: resource.publishedAt,
      modifiedAt: modifiedAt ?? resource.modifiedAt,
      classificationJson: resolvedClassificationJson,
      attributesJson: {
        observability: baseObservability,
      },
      documentsJson: downloads.slice(0, 10),
      mediaJson,
      childResourcesJson: [],
      linksOutJson,
      contentHash: baseBody ? computeContentHash(baseBody) : null,
      errorText: null,
      projectedDocId: null,
    };
  }

  private async persistExtraction(
    resource: WebResourceRow,
    extraction: ExtractionPersistShape,
  ): Promise<ResourceEnrichmentResult> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      let projectedDocId = extraction.projectedDocId;
      const projectionDecision = resolveProjectionDecision(extraction);
      if (projectionDecision.shouldProject) {
        projectedDocId = await this.ensureProjectedArticle(
          client,
          resource,
          extraction,
          projectionDecision.body,
        );
      }
      const projectionState =
        projectionDecision.shouldProject && projectedDocId
          ? "projected_to_common_pipeline"
          : projectionDecision.shouldProject
          ? "explicitly_rejected_before_pipeline"
          : projectionDecision.projectionState;
      const projectionError =
        projectionDecision.shouldProject && projectedDocId
          ? null
          : projectionDecision.shouldProject
          ? "projection_insert_failed"
          : projectionDecision.projectionError;

      await client.query(
        `
          update web_resources
          set
            final_url = $2,
            resource_kind = $3,
            title = $4,
            summary = $5,
            body = $6,
            body_html = $7,
            lang = $8,
            lang_confidence = $9,
            published_at = $10,
            modified_at = $11,
            classification_json = $12::jsonb,
            attributes_json = $13::jsonb,
            documents_json = $14::jsonb,
            media_json = $15::jsonb,
            child_resources_json = $16::jsonb,
            links_out_json = $17::jsonb,
            content_hash = $18,
            extraction_state = $19,
            extraction_error = $20,
            projected_article_id = $21,
            projection_state = $22,
            projection_error = $23,
            enriched_at = case when $19 = 'enriched' then now() else enriched_at end,
            updated_at = now()
          where resource_id = $1
        `,
        [
          resource.resourceId,
          extraction.finalUrl,
          extraction.resourceKind,
          extraction.title,
          extraction.summary,
          extraction.body,
          extraction.bodyHtml,
          extraction.lang,
          extraction.langConfidence,
          extraction.publishedAt,
          extraction.modifiedAt,
          JSON.stringify(extraction.classificationJson),
          JSON.stringify(extraction.attributesJson),
          JSON.stringify(extraction.documentsJson),
          JSON.stringify(extraction.mediaJson),
          JSON.stringify(extraction.childResourcesJson),
          JSON.stringify(extraction.linksOutJson),
          extraction.contentHash,
          extraction.status,
          extraction.errorText,
          projectedDocId,
          projectionState,
          projectionError,
        ],
      );

      await client.query("commit");
      return {
        status: extraction.status === "failed" ? "failed" : extraction.status,
        resource_id: resource.resourceId,
        resource_kind: extraction.resourceKind,
        extraction_state: extraction.status,
        projected_doc_id: projectedDocId,
        documents_count: extraction.documentsJson.length,
        media_count: extraction.mediaJson.length,
        error: extraction.errorText ?? projectionError,
      };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  private async ensureProjectedArticle(
    client: PoolClient,
    resource: WebResourceRow,
    extraction: ExtractionPersistShape,
    projectedBody: string,
  ): Promise<string | null> {
    const sourceArticleId = resource.externalResourceId ?? resource.normalizedUrl;
    const publishedAt = extraction.publishedAt ?? resource.publishedAt ?? new Date().toISOString();
    const articlePayload = JSON.stringify({
      fetcher: "resource_projection",
      websiteAcquisition: {
        resourceId: resource.resourceId,
        normalizedUrl: resource.normalizedUrl,
        finalUrl: extraction.finalUrl,
        discoverySource:
          asRecord(resource.rawPayloadJson.discovery).discoverySource ??
          resource.rawPayloadJson.discoverySource ??
          null,
        resourceKind: extraction.resourceKind,
      },
      resource: {
        resourceId: resource.resourceId,
        normalizedUrl: resource.normalizedUrl,
        resourceKind: extraction.resourceKind,
      },
    });
    const insertResult = await client.query<{ docId: string }>(
      `
        insert into articles (
          channel_id,
          source_article_id,
          url,
          content_kind,
          content_format,
          published_at,
          title,
          lead,
          body,
          lang,
          lang_confidence,
          raw_payload_json
        )
        values (
          $1,
          $2,
          $3,
          $4,
          'article',
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11::jsonb
        )
        on conflict do nothing
        returning doc_id::text as "docId"
      `,
      [
        resource.channelId,
        sourceArticleId,
        extraction.finalUrl,
        extraction.resourceKind,
        publishedAt,
        extraction.title,
        extraction.summary,
        projectedBody,
        extraction.lang,
        extraction.langConfidence,
        articlePayload,
      ],
    );
    let docId = insertResult.rows[0]?.docId ?? null;
    if (!docId) {
      const existing = await client.query<{ docId: string }>(
        `
          update articles
          set
            content_kind = $4,
            published_at = $5,
            title = $6,
            lead = $7,
            body = $8,
            lang = $9,
            lang_confidence = $10,
            raw_payload_json = raw_payload_json || $11::jsonb,
            updated_at = now()
          where channel_id = $1
            and (
              source_article_id = $2
              or url = $3
            )
          returning doc_id::text as "docId"
        `,
        [
          resource.channelId,
          sourceArticleId,
          extraction.finalUrl,
          extraction.resourceKind,
          publishedAt,
          extraction.title,
          extraction.summary,
          projectedBody,
          extraction.lang,
          extraction.langConfidence,
          articlePayload,
        ],
      );
      docId = existing.rows[0]?.docId ?? null;
    }
    if (!docId) {
      const existing = await client.query<{ docId: string }>(
        `
          select doc_id::text as "docId"
          from articles
          where channel_id = $1
            and (
              source_article_id = $2
              or url = $3
            )
          limit 1
        `,
        [resource.channelId, sourceArticleId, extraction.finalUrl],
      );
      docId = existing.rows[0]?.docId ?? null;
    }
    if (!docId) {
      return null;
    }

    await client.query(
      `
        insert into article_external_refs (
          external_ref_id,
          channel_id,
          external_article_id,
          doc_id
        )
        values ($1, $2, $3, $4)
        on conflict (channel_id, external_article_id) do nothing
      `,
      [randomUUID(), resource.channelId, sourceArticleId, docId],
    );

    if (!resource.projectedArticleId) {
      await upsertArticleObservation(client, docId);
      await client.query(
        `
          insert into outbox_events (
            event_id,
            event_type,
            aggregate_type,
            aggregate_id,
            payload_json
          )
          values ($1, $2, 'article', $3, $4::jsonb)
          on conflict do nothing
        `,
        [
          randomUUID(),
          ARTICLE_INGEST_REQUESTED_EVENT,
          docId,
          JSON.stringify({
            docId,
            version: 1,
          }),
        ],
      );
    }

    return docId;
  }
}

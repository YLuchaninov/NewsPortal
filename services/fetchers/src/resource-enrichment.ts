import { setTimeout as delay } from "node:timers/promises";

import {
  extractFromHtml,
  type ArticleData,
} from "@extractus/article-extractor";
import type { Pool } from "pg";

import type { ResourceKind } from "@newsportal/contracts";

import { AsyncSemaphore } from "./async-semaphore";
import type { FetchersConfig } from "./config";
import {
  buildWebsiteResourceClassificationJson,
  extractDiscoveryClassification,
  resolveEditorialExtractorDecision,
  shouldRetainDiscoveryEditorialKind,
} from "./resource-enrichment-classification";
import {
  asArray,
  computeContentHash,
  extractAnchorLinks,
  extractDefinitionListAttributes,
  extractDownloadLinks,
  extractH1,
  extractHtmlTitle,
  extractImageUrls,
  extractMetaContent,
  extractStructuredTypes,
  extractTableAttributes,
  normalizeText,
  readOptionalString,
  summarizeBody,
} from "./resource-enrichment-extraction";
import {
  buildPersistedExtraction,
  ResourceEnrichmentRepository,
  type ExtractionPersistShape,
  type WebResourceRow,
} from "./resource-enrichment-persistence";
import {
  CrawlPolicyCacheService,
  classifyResourceCandidate,
  inferResourceKindsFromUrl,
} from "./web-ingestion";
import { canonicalizeUrl } from "./rss";
import { validateAcquisitionUrl } from "./probe-url-guard";

export {
  buildWebsiteResourceClassificationJson,
  resolveEditorialExtractorDecision,
  shouldRetainDiscoveryEditorialKind,
} from "./resource-enrichment-classification";

type ExtractionState = "pending" | "skipped" | "enriched" | "failed";

interface EnrichmentLogger {
  info(payload: unknown, message?: string): void;
  warn(payload: unknown, message?: string): void;
  error(payload: unknown, message?: string): void;
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

function buildArticleParserOptions() {
  return {
    descriptionTruncateLen: 320,
    descriptionLengthThreshold: 120,
    contentLengthThreshold: 120,
    wordsPerMinute: 240,
  };
}

export class ResourceEnrichmentService {
  private readonly globalSemaphore: AsyncSemaphore;
  private readonly domainSemaphores = new Map<string, AsyncSemaphore>();
  private readonly domainNextAllowedAt = new Map<string, number>();
  private readonly repository: ResourceEnrichmentRepository;

  constructor(
    private readonly pool: Pool,
    private readonly config: FetchersConfig,
    private readonly logger: EnrichmentLogger,
    private readonly crawlPolicyCache = new CrawlPolicyCacheService(pool),
  ) {
    this.globalSemaphore = new AsyncSemaphore(config.enrichmentConcurrency);
    this.repository = new ResourceEnrichmentRepository(pool, config);
  }

  async enrichResource(
    resourceId: string,
    request: ResourceEnrichmentRequest = {},
  ): Promise<ResourceEnrichmentResult> {
    const resource = await this.repository.loadResource(resourceId);
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
      return await this.repository.persistExtraction(resource, extraction);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown resource enrichment failure.";
      this.logger.warn({ error, resourceId }, "Resource enrichment failed.");
      return await this.repository.persistExtraction(resource, {
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

  async replayStoredProjection(
    resourceId: string,
    options: ReplayStoredProjectionOptions = {},
  ): Promise<ResourceEnrichmentResult> {
    const resource = await this.repository.loadResource(resourceId);
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

    return await this.repository.persistExtraction(resource, buildPersistedExtraction(resource));
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
    const guardedResourceUrl = await validateAcquisitionUrl(resource.url, { resolveDns: true });
    if (!guardedResourceUrl.url) {
      throw new Error(guardedResourceUrl.error ?? "Resource URL is not allowed.");
    }
    const resourceUrl = guardedResourceUrl.url;
    const policy = await this.crawlPolicyCache.getPolicy(
      resourceUrl,
      resource.userAgent,
      resource.requestTimeoutMs,
    );
    if (!policy.isAllowed(resourceUrl, resource.userAgent)) {
      throw new Error("robots.txt disallows crawling this resource URL.");
    }

    const response = await this.withExternalFetchSlot(resourceUrl, async () =>
      fetch(resourceUrl, {
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

    const guardedFinalUrl = await validateAcquisitionUrl(response.url || resourceUrl);
    if (!guardedFinalUrl.url) {
      throw new Error(guardedFinalUrl.error ?? "Resource final URL is not allowed.");
    }
    const finalUrl = canonicalizeUrl(guardedFinalUrl.url);
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


}

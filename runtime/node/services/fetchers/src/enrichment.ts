import { setTimeout as delay } from "node:timers/promises";

import {
  extract as extractSignalCandidate,
  type ArticleData,
} from "@extractus/article-extractor";
import {
  extract as extractOEmbed,
  hasProvider as hasOEmbedProvider,
  type OembedData,
} from "@extractus/oembed-extractor";
import type { Pool, PoolClient } from "pg";

import { AsyncSemaphore } from "./async-semaphore";
import type { FetchersConfig } from "./config";
import { validateAcquisitionUrl } from "./probe-url-guard";
import { canonicalizeUrl, collapseWhitespace, decodeHtmlEntities, stripHtmlTags } from "./rss";

type EnrichmentState = "pending" | "skipped" | "enriched" | "failed";
type MediaKind = "image" | "video" | "embed";
type StorageKind = "external_url" | "youtube";

interface EnrichmentLogger {
  info(payload: unknown, message?: string): void;
  warn(payload: unknown, message?: string): void;
  error(payload: unknown, message?: string): void;
}

interface RawPayloadEntry {
  link?: unknown;
  description?: unknown;
  contentEncoded?: unknown;
  enclosure?: unknown;
  mediaContentUrl?: unknown;
}

interface SignalCandidateEnrichmentRow {
  docId: string;
  channelId: string;
  providerType: string;
  url: string;
  title: string;
  lead: string;
  body: string;
  rawPayloadJson: unknown;
  enrichmentState: string | null;
  fullContentHtml: string | null;
  channelName: string;
  enrichmentEnabled: boolean;
  enrichmentMinBodyLength: number;
}

interface MediaAssetCandidate {
  mediaKind: MediaKind;
  storageKind: StorageKind;
  sourceUrl: string;
  canonicalUrl: string | null;
  thumbnailUrl: string | null;
  mimeType: string | null;
  title: string | null;
  altText: string | null;
  widthPx: number | null;
  heightPx: number | null;
  durationSeconds: number | null;
  embedHtml: string | null;
  metadataJson: Record<string, unknown>;
}

interface EnrichmentPersistInput {
  state: Exclude<EnrichmentState, "pending">;
  body: string;
  bodyReplaced: boolean;
  fullContentHtml: string | null;
  extractedDescription: string | null;
  extractedAuthor: string | null;
  extractedTtrSeconds: number | null;
  extractedImageUrl: string | null;
  extractedFaviconUrl: string | null;
  extractedPublishedAt: string | null;
  extractedSourceName: string | null;
  mediaAssets: MediaAssetCandidate[];
}

export interface SignalCandidateEnrichmentRequest {
  force?: boolean;
}

export interface SignalCandidateEnrichmentResult {
  status: "skipped" | "enriched" | "failed";
  doc_id: string;
  enrichment_state: Exclude<EnrichmentState, "pending">;
  body_replaced: boolean;
  media_asset_count: number;
  error?: string | null;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function normalizePlainText(value: string): string {
  return collapseWhitespace(decodeHtmlEntities(stripHtmlTags(value)));
}

function readOptionalString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function sanitizeOptionalPositiveInt(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return Math.round(parsed);
}

export function sanitizeOptionalTimestamptzInput(value: unknown): string | null {
  const isPersistableDate = (candidate: Date): boolean => {
    if (!Number.isFinite(candidate.getTime())) {
      return false;
    }
    return candidate.getUTCFullYear() >= 1;
  };

  if (value instanceof Date) {
    return isPersistableDate(value) ? value.toISOString() : null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = new Date(value);
    return isPersistableDate(parsed) ? parsed.toISOString() : null;
  }

  const rawValue = readOptionalString(value);
  if (!rawValue) {
    return null;
  }

  const parsed = new Date(rawValue);
  return isPersistableDate(parsed) ? parsed.toISOString() : null;
}

function readRawPayloadEntry(rawPayload: unknown): RawPayloadEntry {
  const payload = asRecord(rawPayload);
  const entry = asRecord(payload.entry);
  if (Object.keys(entry).length > 0) {
    return entry;
  }

  const legacyRss = asRecord(payload.rss);
  return {
    link: legacyRss.link,
    description: legacyRss.description,
    contentEncoded: legacyRss.contentEncoded,
    enclosure: legacyRss.enclosure,
    mediaContentUrl: legacyRss.mediaContentUrl,
  };
}

function guessMediaKind(sourceUrl: string, mimeType?: string | null): MediaKind {
  const normalizedMime = String(mimeType ?? "").toLowerCase();
  const normalizedUrl = sourceUrl.toLowerCase();

  if (
    normalizedMime.startsWith("video/") ||
    normalizedUrl.endsWith(".mp4") ||
    normalizedUrl.endsWith(".webm") ||
    normalizedUrl.endsWith(".mov")
  ) {
    return "video";
  }

  return "image";
}

function toCanonicalUrl(sourceUrl: string): string | null {
  try {
    return canonicalizeUrl(sourceUrl);
  } catch {
    return sourceUrl;
  }
}

function maybeExternalUrl(sourceUrl: unknown): string | null {
  const rawValue = readOptionalString(sourceUrl);
  if (!rawValue) {
    return null;
  }

  try {
    const url = new URL(rawValue);
    if (!["http:", "https:"].includes(url.protocol)) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function buildFeedMediaCandidates(signal_candidate: SignalCandidateEnrichmentRow): MediaAssetCandidate[] {
  const entry = readRawPayloadEntry(signal_candidate.rawPayloadJson);
  const assets: MediaAssetCandidate[] = [];
  const seen = new Set<string>();

  const addCandidate = (
    sourceUrl: string | null,
    mimeType: string | null,
    origin: string,
  ): void => {
    if (!sourceUrl) {
      return;
    }

    const key = sourceUrl.toLowerCase();
    if (seen.has(key)) {
      return;
    }
    seen.add(key);

    const mediaKind = guessMediaKind(sourceUrl, mimeType);
    assets.push({
      mediaKind,
      storageKind: "external_url",
      sourceUrl,
      canonicalUrl: toCanonicalUrl(sourceUrl),
      thumbnailUrl: null,
      mimeType,
      title: null,
      altText: signal_candidate.title || null,
      widthPx: null,
      heightPx: null,
      durationSeconds: null,
      embedHtml: null,
      metadataJson: {
        owner: "enrichment",
        origin,
      },
    });
  };

  const enclosure = asRecord(entry.enclosure);
  addCandidate(
    maybeExternalUrl(enclosure.url),
    readOptionalString(enclosure.type),
    "feed.enclosure",
  );
  addCandidate(
    maybeExternalUrl(entry.mediaContentUrl),
    null,
    "feed.media_content",
  );

  return assets;
}

function buildSignalCandidateImageCandidate(
  signal_candidate: SignalCandidateEnrichmentRow,
  extracted: ArticleData | null,
): MediaAssetCandidate[] {
  const sourceUrl = maybeExternalUrl(extracted?.image);
  if (!sourceUrl) {
    return [];
  }

  return [
    {
      mediaKind: "image",
      storageKind: "external_url",
      sourceUrl,
      canonicalUrl: toCanonicalUrl(sourceUrl),
      thumbnailUrl: null,
      mimeType: null,
      title: extracted?.title ?? signal_candidate.title ?? null,
      altText: extracted?.title ?? signal_candidate.title ?? null,
      widthPx: null,
      heightPx: null,
      durationSeconds: null,
      embedHtml: null,
      metadataJson: {
        owner: "enrichment",
        origin: "signal_candidate_extractor.image",
      },
    },
  ];
}

function extractUrlCandidatesFromHtml(html: string): string[] {
  const urls = html.match(/https?:\/\/[^\s"'<>]+/gi) ?? [];
  return Array.from(new Set(urls.map((url) => url.trim())));
}

function dedupeMediaCandidates(candidates: MediaAssetCandidate[]): MediaAssetCandidate[] {
  const seen = new Set<string>();
  const output: MediaAssetCandidate[] = [];

  for (const candidate of candidates) {
    const key = `${candidate.mediaKind}::${candidate.sourceUrl.toLowerCase()}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(candidate);
  }

  return output;
}

function applySortOrder(candidates: MediaAssetCandidate[]): MediaAssetCandidate[] {
  const weight = (candidate: MediaAssetCandidate): number => {
    const origin = String(candidate.metadataJson.origin ?? "");
    if (origin === "signal_candidate_extractor.image") {
      return 0;
    }
    if (candidate.mediaKind === "image") {
      return 1;
    }
    if (candidate.mediaKind === "video") {
      return 2;
    }
    return 3;
  };

  return [...candidates].sort((left, right) => weight(left) - weight(right));
}

function buildSignalCandidateParserOptions() {
  return {
    descriptionTruncateLen: 320,
    descriptionLengthThreshold: 120,
    contentLengthThreshold: 120,
    wordsPerMinute: 240,
  };
}

function resolveStorageKind(sourceUrl: string): StorageKind {
  if (/^https?:\/\/(?:www\.)?(youtube\.com|youtu\.be)\//i.test(sourceUrl)) {
    return "youtube";
  }

  return "external_url";
}

export class SignalCandidateEnrichmentService {
  private readonly globalSemaphore: AsyncSemaphore;
  private readonly domainSemaphores = new Map<string, AsyncSemaphore>();
  private readonly domainNextAllowedAt = new Map<string, number>();

  constructor(
    private readonly pool: Pool,
    private readonly config: FetchersConfig,
    private readonly logger: EnrichmentLogger,
  ) {
    this.globalSemaphore = new AsyncSemaphore(config.enrichmentConcurrency);
  }

  async enrichSignalCandidate(
    docId: string,
    request: SignalCandidateEnrichmentRequest = {},
  ): Promise<SignalCandidateEnrichmentResult> {
    const signal_candidate = await this.loadSignalCandidate(docId);
    if (!signal_candidate) {
      throw new Error(`SignalCandidate ${docId} was not found for enrichment.`);
    }

    const force = request.force === true;
    const feedMediaCandidates = buildFeedMediaCandidates(signal_candidate);
    const skipReason = this.resolveSkipReason(signal_candidate, force);

    let extracted: ArticleData | null = null;
    let extractionError: string | null = null;

    if (skipReason === null) {
      try {
        const guardedSignalCandidateUrl = await validateAcquisitionUrl(signal_candidate.url, { resolveDns: true });
        if (!guardedSignalCandidateUrl.url) {
          throw new Error(guardedSignalCandidateUrl.error ?? "SignalCandidate enrichment URL is not allowed.");
        }
        const signalCandidateUrl = guardedSignalCandidateUrl.url;
        extracted = await this.withExternalFetchSlot(signalCandidateUrl, async () =>
          extractSignalCandidate(
            signalCandidateUrl,
            buildSignalCandidateParserOptions(),
            {
              headers: {
                "user-agent": this.config.enrichmentUserAgent,
              },
              signal: AbortSignal.timeout(this.config.enrichmentTimeoutMs),
            },
          ),
        );
      } catch (error) {
        extractionError =
          error instanceof Error ? error.message : "Unknown enrichment extraction failure.";
        this.logger.warn({ error, docId }, "SignalCandidate enrichment extract failed.");
      }
    }

    const persisted = await this.persistEnrichmentOutcome(
      signal_candidate,
      {
        force,
        extracted,
        extractionError,
        feedMediaCandidates,
        skipReason,
      },
    );

    return persisted;
  }

  private async loadSignalCandidate(docId: string): Promise<SignalCandidateEnrichmentRow | null> {
    const result = await this.pool.query<SignalCandidateEnrichmentRow>(
      `
        select
          a.doc_id::text as "docId",
          a.channel_id::text as "channelId",
          sc.provider_type as "providerType",
          a.url,
          a.title,
          a.lead,
          a.body,
          a.raw_payload_json as "rawPayloadJson",
          a.enrichment_state as "enrichmentState",
          a.full_content_html as "fullContentHtml",
          sc.name as "channelName",
          sc.enrichment_enabled as "enrichmentEnabled",
          sc.enrichment_min_body_length as "enrichmentMinBodyLength"
        from signal_candidates a
        join source_channels sc on sc.channel_id = a.channel_id
        where a.doc_id = $1
        limit 1
      `,
      [docId],
    );

    return result.rows[0] ?? null;
  }

  private resolveSkipReason(
    signal_candidate: SignalCandidateEnrichmentRow,
    force: boolean,
  ): string | null {
    if (!this.config.enrichmentEnabled) {
      return "global_disabled";
    }

    if (!force && !signal_candidate.enrichmentEnabled) {
      return "channel_disabled";
    }

    try {
      const url = new URL(signal_candidate.url);
      if (!["http:", "https:"].includes(url.protocol)) {
        return "unsupported_url";
      }
    } catch {
      return "invalid_url";
    }

    if (force) {
      return null;
    }

    const currentLength = normalizePlainText(signal_candidate.body).length;
    if (currentLength >= signal_candidate.enrichmentMinBodyLength) {
      return "body_long_enough";
    }

    return null;
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

  private async withExternalFetchSlot<T>(
    rawUrl: string,
    task: () => Promise<T>,
  ): Promise<T> {
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

  private async resolveOEmbedCandidates(
    signal_candidate: SignalCandidateEnrichmentRow,
    extracted: ArticleData | null,
  ): Promise<MediaAssetCandidate[]> {
    if (!extracted) {
      return [];
    }

    const seen = new Set<string>();
    const candidates = [
      ...((Array.isArray(extracted.links) ? extracted.links : []) as string[]),
      ...extractUrlCandidatesFromHtml(extracted.content ?? ""),
    ]
      .map((url) => maybeExternalUrl(url))
      .filter((url): url is string => Boolean(url))
      .filter((url) => hasOEmbedProvider(url));

    const limited = candidates.filter((candidate) => {
      const key = candidate.toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    }).slice(0, this.config.enrichmentMaxOembedPerSignalCandidate);

    const assets: MediaAssetCandidate[] = [];

    for (const candidateUrl of limited) {
      try {
        const guardedCandidateUrl = await validateAcquisitionUrl(candidateUrl, { resolveDns: true });
        if (!guardedCandidateUrl.url) {
          throw new Error(guardedCandidateUrl.error ?? "oEmbed URL is not allowed.");
        }
        const candidateFetchUrl = guardedCandidateUrl.url;
        const oembed = await this.withExternalFetchSlot(candidateFetchUrl, async () =>
          extractOEmbed(
            candidateFetchUrl,
            { maxwidth: 800 },
            {
              headers: {
                "user-agent": this.config.enrichmentUserAgent,
              },
              signal: AbortSignal.timeout(this.config.enrichmentOembedTimeoutMs),
            },
          ),
        );
        const mapped = this.mapOEmbedCandidate(signal_candidate, candidateFetchUrl, oembed);
        if (mapped) {
          assets.push(mapped);
        }
      } catch (error) {
        this.logger.warn({ error, candidateUrl, docId: signal_candidate.docId }, "oEmbed resolution failed.");
      }
    }

    return assets;
  }

  private mapOEmbedCandidate(
    signal_candidate: SignalCandidateEnrichmentRow,
    candidateUrl: string,
    data: OembedData,
  ): MediaAssetCandidate | null {
    if (data.type === "video" || data.type === "rich") {
      const richData = data as OembedData & { html?: string; width?: number; height?: number };
      if (!richData.html) {
        return null;
      }

      return {
        mediaKind: data.type === "video" ? "video" : "embed",
        storageKind: resolveStorageKind(candidateUrl),
        sourceUrl: candidateUrl,
        canonicalUrl: toCanonicalUrl(candidateUrl),
        thumbnailUrl: maybeExternalUrl(data.thumbnail_url) ?? null,
        mimeType: null,
        title: readOptionalString(data.title) ?? signal_candidate.title ?? null,
        altText: readOptionalString(data.title) ?? signal_candidate.title ?? null,
        widthPx: sanitizeOptionalPositiveInt((richData as { width?: unknown }).width),
        heightPx: sanitizeOptionalPositiveInt((richData as { height?: unknown }).height),
        durationSeconds: null,
        embedHtml: richData.html,
        metadataJson: {
          owner: "enrichment",
          origin: "oembed",
          provider_name: data.provider_name ?? null,
          provider_url: data.provider_url ?? null,
          type: data.type,
        },
      };
    }

    if (data.type === "photo") {
      const photo = data as OembedData & { url?: string; width?: number; height?: number };
      const imageUrl = maybeExternalUrl(photo.url);
      if (!imageUrl) {
        return null;
      }

      return {
        mediaKind: "image",
        storageKind: "external_url",
        sourceUrl: imageUrl,
        canonicalUrl: toCanonicalUrl(imageUrl),
        thumbnailUrl: maybeExternalUrl(data.thumbnail_url) ?? null,
        mimeType: null,
        title: readOptionalString(data.title) ?? signal_candidate.title ?? null,
        altText: readOptionalString(data.title) ?? signal_candidate.title ?? null,
        widthPx: sanitizeOptionalPositiveInt((photo as { width?: unknown }).width),
        heightPx: sanitizeOptionalPositiveInt((photo as { height?: unknown }).height),
        durationSeconds: null,
        embedHtml: null,
        metadataJson: {
          owner: "enrichment",
          origin: "oembed",
          provider_name: data.provider_name ?? null,
          provider_url: data.provider_url ?? null,
          type: data.type,
        },
      };
    }

    return null;
  }

  private async persistEnrichmentOutcome(
    signal_candidate: SignalCandidateEnrichmentRow,
    input: {
      force: boolean;
      extracted: ArticleData | null;
      extractionError: string | null;
      feedMediaCandidates: MediaAssetCandidate[];
      skipReason: string | null;
    },
  ): Promise<SignalCandidateEnrichmentResult> {
    const currentBody = normalizePlainText(signal_candidate.body);
    const extractedContentHtml = readOptionalString(input.extracted?.content);
    const extractedPlaintext = extractedContentHtml
      ? normalizePlainText(extractedContentHtml)
      : "";
    const feedEntry = readRawPayloadEntry(signal_candidate.rawPayloadJson);
    const feedContentHtml = readOptionalString(feedEntry.contentEncoded);
    const bodyThreshold = signal_candidate.enrichmentMinBodyLength;
    const bodyReplaced =
      Boolean(extractedPlaintext) &&
      (input.force ||
        (currentBody.length < bodyThreshold && extractedPlaintext.length > currentBody.length + 80));

    const state: Exclude<EnrichmentState, "pending"> =
      input.extractionError
        ? "failed"
        : input.extracted
          ? "enriched"
          : "skipped";

    const mediaAssets = applySortOrder(
      dedupeMediaCandidates(
        [
          ...input.feedMediaCandidates,
          ...buildSignalCandidateImageCandidate(signal_candidate, input.extracted),
          ...(await this.resolveOEmbedCandidates(signal_candidate, input.extracted)),
        ],
      ),
    );

    const persistInput: EnrichmentPersistInput = {
      state,
      body: bodyReplaced ? extractedPlaintext : signal_candidate.body,
      bodyReplaced,
      fullContentHtml:
        state === "enriched"
          ? extractedContentHtml
          : state === "skipped"
            ? feedContentHtml
            : signal_candidate.fullContentHtml,
      extractedDescription:
        state === "enriched" ? readOptionalString(input.extracted?.description) : null,
      extractedAuthor:
        state === "enriched" ? readOptionalString(input.extracted?.author) : null,
      extractedTtrSeconds:
        state === "enriched" ? sanitizeOptionalPositiveInt(input.extracted?.ttr) : null,
      extractedImageUrl:
        state === "enriched" ? maybeExternalUrl(input.extracted?.image) : null,
      extractedFaviconUrl:
        state === "enriched" ? maybeExternalUrl(input.extracted?.favicon) : null,
      extractedPublishedAt:
        state === "enriched" ? sanitizeOptionalTimestamptzInput(input.extracted?.published) : null,
      extractedSourceName:
        state === "enriched"
          ? readOptionalString(input.extracted?.source) ?? signal_candidate.channelName
          : null,
      mediaAssets,
    };

    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query(
        `
          update signal_candidates
          set
            enrichment_state = $2,
            enriched_at = case
              when $2 in ('enriched', 'skipped') then now()
              else enriched_at
            end,
            body = $3,
            full_content_html = $4,
            extracted_description = case when $2 = 'enriched' then $5 else extracted_description end,
            extracted_author = case when $2 = 'enriched' then $6 else extracted_author end,
            extracted_ttr_seconds = case when $2 = 'enriched' then $7 else extracted_ttr_seconds end,
            extracted_image_url = case when $2 = 'enriched' then $8 else extracted_image_url end,
            extracted_favicon_url = case when $2 = 'enriched' then $9 else extracted_favicon_url end,
            extracted_published_at = case when $2 = 'enriched' then $10::timestamptz else extracted_published_at end,
            extracted_source_name = case when $2 = 'enriched' then $11 else extracted_source_name end,
            updated_at = now()
          where doc_id = $1
        `,
        [
          signal_candidate.docId,
          persistInput.state,
          persistInput.body,
          persistInput.fullContentHtml,
          persistInput.extractedDescription,
          persistInput.extractedAuthor,
          persistInput.extractedTtrSeconds,
          persistInput.extractedImageUrl,
          persistInput.extractedFaviconUrl,
          persistInput.extractedPublishedAt,
          persistInput.extractedSourceName,
        ],
      );

      const mediaAssetCount = await this.replaceMediaAssets(
        client,
        signal_candidate.docId,
        persistInput.mediaAssets,
      );

      await client.query("commit");

      return {
        status: persistInput.state,
        doc_id: signal_candidate.docId,
        enrichment_state: persistInput.state,
        body_replaced: persistInput.bodyReplaced,
        media_asset_count: mediaAssetCount,
        error: input.extractionError,
      };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  private async replaceMediaAssets(
    client: PoolClient,
    docId: string,
    assets: MediaAssetCandidate[],
  ): Promise<number> {
    await client.query(
      `
        delete from signal_candidate_media_assets
        where doc_id = $1
      `,
      [docId],
    );

    if (assets.length === 0) {
      await client.query(
        `
          update signal_candidates
          set
            has_media = false,
            primary_media_asset_id = null,
            updated_at = now()
          where doc_id = $1
        `,
        [docId],
      );
      return 0;
    }

    let primaryMediaAssetId: string | null = null;
    let insertedCount = 0;

    for (const [index, asset] of assets.entries()) {
      const result = await client.query<{ assetId: string }>(
        `
          insert into signal_candidate_media_assets (
            doc_id,
            media_kind,
            storage_kind,
            source_url,
            canonical_url,
            thumbnail_url,
            mime_type,
            title,
            alt_text,
            width_px,
            height_px,
            duration_seconds,
            embed_html,
            sort_order,
            metadata_json
          )
          values (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8,
            $9,
            $10,
            $11,
            $12,
            $13,
            $14,
            $15::jsonb
          )
          returning asset_id::text as "assetId"
        `,
        [
          docId,
          asset.mediaKind,
          asset.storageKind,
          asset.sourceUrl,
          asset.canonicalUrl,
          asset.thumbnailUrl,
          asset.mimeType,
          asset.title,
          asset.altText,
          asset.widthPx,
          asset.heightPx,
          asset.durationSeconds,
          asset.embedHtml,
          index,
          JSON.stringify(asset.metadataJson),
        ],
      );

      const assetId = result.rows[0]?.assetId ?? null;
      insertedCount += 1;

      if (!primaryMediaAssetId && assetId && asset.mediaKind !== "embed") {
        primaryMediaAssetId = assetId;
      }
    }

    await client.query(
      `
        update signal_candidates
        set
          has_media = true,
          primary_media_asset_id = $2,
          updated_at = now()
        where doc_id = $1
      `,
      [docId, primaryMediaAssetId],
    );

    return insertedCount;
  }
}

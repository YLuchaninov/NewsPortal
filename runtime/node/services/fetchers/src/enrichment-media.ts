import type { ArticleData } from "@extractus/article-extractor";
import type { OembedData } from "@extractus/oembed-extractor";

import { canonicalizeUrl } from "./rss";
import {
  asRecord,
  readOptionalString,
  sanitizeOptionalPositiveInt,
} from "./enrichment-normalization";
import type {
  MediaAssetCandidate,
  MediaKind,
  RawPayloadEntry,
  SignalCandidateEnrichmentRow,
  StorageKind,
} from "./enrichment-types";

export function readRawPayloadEntry(rawPayload: unknown): RawPayloadEntry {
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

export function maybeExternalUrl(sourceUrl: unknown): string | null {
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

export function buildFeedMediaCandidates(signal_candidate: SignalCandidateEnrichmentRow): MediaAssetCandidate[] {
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

export function buildSignalCandidateImageCandidate(
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

export function extractUrlCandidatesFromHtml(html: string): string[] {
  const urls = html.match(/https?:\/\/[^\s"'<>]+/gi) ?? [];
  return Array.from(new Set(urls.map((url) => url.trim())));
}

export function dedupeMediaCandidates(candidates: MediaAssetCandidate[]): MediaAssetCandidate[] {
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

export function applySortOrder(candidates: MediaAssetCandidate[]): MediaAssetCandidate[] {
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

export function buildSignalCandidateParserOptions() {
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

export function mapOEmbedCandidate(
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

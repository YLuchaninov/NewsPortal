export type EnrichmentState = "pending" | "skipped" | "enriched" | "failed";
export type MediaKind = "image" | "video" | "embed";
export type StorageKind = "external_url" | "youtube";

export interface EnrichmentLogger {
  info(payload: unknown, message?: string): void;
  warn(payload: unknown, message?: string): void;
  error(payload: unknown, message?: string): void;
}

export interface RawPayloadEntry {
  link?: unknown;
  description?: unknown;
  contentEncoded?: unknown;
  enclosure?: unknown;
  mediaContentUrl?: unknown;
}

export interface SignalCandidateEnrichmentRow {
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

export interface MediaAssetCandidate {
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

export interface EnrichmentPersistInput {
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

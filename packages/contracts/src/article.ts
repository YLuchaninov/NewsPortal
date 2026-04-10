export type ArticleProcessingState =
  | "raw"
  | "normalized"
  | "deduped"
  | "embedded"
  | "clustered"
  | "matched"
  | "notified";

export type ArticleEnrichmentState = "pending" | "skipped" | "enriched" | "failed";
export type ArticleMediaKind = "image" | "video" | "embed";
export type ArticleMediaStorageKind = "external_url" | "youtube" | "object_storage";

export interface ArticleMediaAsset {
  asset_id?: string;
  doc_id?: string;
  media_kind?: ArticleMediaKind;
  storage_kind?: ArticleMediaStorageKind;
  source_url?: string;
  canonical_url?: string | null;
  thumbnail_url?: string | null;
  mime_type?: string | null;
  title?: string | null;
  alt_text?: string | null;
  width_px?: number | null;
  height_px?: number | null;
  duration_seconds?: number | null;
  embed_html?: string | null;
  sort_order?: number;
  metadata_json?: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
}

export interface ArticlePreview {
  doc_id: string;
  url?: string;
  title?: string;
  lead?: string;
  lang?: string | null;
  published_at?: string | null;
  ingested_at?: string | null;
  processing_state?: ArticleProcessingState | string;
  visibility_state?: string;
  event_cluster_id?: string | null;
  final_selection_decision?: string | null;
  final_selection_selected?: boolean;
  final_selection_verification_state?: string | null;
  system_feed_decision?: string | null;
  system_feed_eligible?: boolean;
  observation_state?: string | null;
  duplicate_kind?: string | null;
  canonical_document_id?: string | null;
  canonical_document_url?: string | null;
  canonical_domain?: string | null;
  canonical_observation_count?: number | null;
  canonical_first_observed_at?: string | null;
  canonical_last_observed_at?: string | null;
  canonical_verification_state?: string | null;
  story_cluster_id?: string | null;
  story_cluster_title?: string | null;
  story_cluster_verification_state?: string | null;
  story_cluster_document_count?: number | null;
  story_cluster_source_family_count?: number | null;
  story_cluster_corroboration_count?: number | null;
  verification_target_type?: string | null;
  verification_target_id?: string | null;
  has_media?: boolean;
  enrichment_state?: ArticleEnrichmentState | string;
  source_name?: string | null;
  author_name?: string | null;
  read_time_seconds?: number | null;
  primary_media_asset_id?: string | null;
  primary_media_kind?: ArticleMediaKind | null;
  primary_media_storage_kind?: ArticleMediaStorageKind | null;
  primary_media_url?: string | null;
  primary_media_thumbnail_url?: string | null;
  primary_media_source_url?: string | null;
  primary_media_title?: string | null;
  primary_media_alt_text?: string | null;
  like_count?: number;
  dislike_count?: number;
  matched_interest_id?: string | null;
  matched_interest_description?: string | null;
  interest_match_score?: number | null;
  interest_match_decision?: string | null;
}

export interface ArticleDetail extends ArticlePreview {
  channel_id?: string;
  channel_name?: string | null;
  ingested_at?: string;
  updated_at?: string;
  body?: string;
  raw_payload_json?: Record<string, unknown> | null;
  full_content_html?: string | null;
  extracted_description?: string | null;
  extracted_author?: string | null;
  extracted_ttr_seconds?: number | null;
  extracted_image_url?: string | null;
  extracted_favicon_url?: string | null;
  extracted_published_at?: string | null;
  extracted_source_name?: string | null;
  enrichment_debug?: Record<string, unknown> | null;
  media_assets?: ArticleMediaAsset[];
}

export interface ArticleEnrichmentResult {
  status: "skipped" | "enriched" | "failed";
  doc_id: string;
  enrichment_state: ArticleEnrichmentState | string;
  body_replaced: boolean;
  media_asset_count: number;
  error?: string | null;
}

export interface ArticleEnrichmentRetryRequest {
  requestedBy?: string;
}

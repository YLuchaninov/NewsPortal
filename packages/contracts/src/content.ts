import type { PaginationQuery } from "./pagination";
import type { ResourceKind } from "./source";

export type ContentItemOrigin = "editorial" | "resource";
export type WebContentListSort = "latest" | "oldest" | "title_asc" | "title_desc";
export type ContentItemSelectionDecision =
  | "pending_ai_review"
  | "selected"
  | "gray_zone"
  | "rejected"
  | "filtered_out"
  | "kind_enabled"
  | "unknown";

export interface WebContentListQuery extends PaginationQuery {
  sort?: WebContentListSort;
  q?: string;
}

export interface ContentItemPreview {
  content_item_id: string;
  content_kind: ResourceKind;
  origin_type: ContentItemOrigin;
  origin_id: string;
  url?: string | null;
  title?: string | null;
  summary?: string | null;
  lead?: string | null;
  lang?: string | null;
  published_at?: string | null;
  ingested_at?: string | null;
  updated_at?: string | null;
  source_name?: string | null;
  author_name?: string | null;
  read_time_seconds?: number | null;
  system_selection_decision?: ContentItemSelectionDecision | string | null;
  system_selected?: boolean;
  has_media?: boolean;
  primary_media_kind?: string | null;
  primary_media_url?: string | null;
  primary_media_thumbnail_url?: string | null;
  primary_media_source_url?: string | null;
  primary_media_title?: string | null;
  primary_media_alt_text?: string | null;
  like_count?: number | null;
  dislike_count?: number | null;
  matched_interest_id?: string | null;
  matched_interest_description?: string | null;
  interest_match_score?: number | null;
  interest_match_decision?: string | null;
}

export interface ContentItemDetail extends ContentItemPreview {
  body?: string | null;
  body_html?: string | null;
  raw_payload_json?: Record<string, unknown> | null;
  classification_json?: Record<string, unknown> | null;
  attributes_json?: Record<string, unknown> | null;
  documents_json?: unknown[] | null;
  media_json?: unknown[] | null;
  links_out_json?: unknown[] | null;
  child_resources_json?: unknown[] | null;
  extraction_state?: string | null;
  extraction_error?: string | null;
  channel_id?: string | null;
  channel_name?: string | null;
  media_assets?: unknown[];
  enrichment_debug?: Record<string, unknown> | null;
}

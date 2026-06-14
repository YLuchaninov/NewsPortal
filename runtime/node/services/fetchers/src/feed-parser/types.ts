export interface ParsedFeedMediaEnclosure {
  url: string;
  type: string;
  length: number;
}

export type ParsedFeedFormat = "rss2" | "rss1" | "atom" | "jsonfeed";
export type ParsedFeedFetcher = "rss" | "atom" | "jsonfeed";

export interface ParsedFeedEntry {
  guid: string | null;
  title: string;
  url: string | null;
  summaryHtml: string;
  contentHtml: string;
  publishedAt: string | null;
  rawXmlHash: string;
  enclosure: ParsedFeedMediaEnclosure | null;
  mediaContentUrl: string | null;
  categories: string[];
}

export type ParsedFeedDiagnosticCode =
  | "relative_url_resolved"
  | "guid_permalink_used"
  | "invalid_date_ignored"
  | "malformed_optional_field_ignored";

export interface ParsedFeedDiagnostic {
  code: ParsedFeedDiagnosticCode;
  message: string;
  field?: string;
  entryId?: string | null;
}

export interface ParsedFeed {
  format: ParsedFeedFormat;
  fetcher: ParsedFeedFetcher;
  title: string | null;
  language: string | null;
  description: string | null;
  generator: string | null;
  publishedAt: string | null;
  entries: ParsedFeedEntry[];
  diagnostics?: ParsedFeedDiagnostic[];
}

export type JsonRecord = Record<string, unknown>;

export interface FeedEntry extends JsonRecord {
  title?: unknown;
  link?: unknown;
  published?: unknown;
  baseUrl?: unknown;
}

export interface FeedData extends JsonRecord {
  title?: unknown;
  language?: unknown;
  description?: unknown;
  generator?: unknown;
  published?: unknown;
  entries?: FeedEntry[];
}

export interface ParseFeedInput {
  body: string;
  contentType?: string | null;
  feedUrl?: string | null;
  baseUrl?: string | null;
}

export interface FeedParseContext {
  aliases: Map<string, string>;
  baseUrl: string | null;
  diagnostics: ParsedFeedDiagnostic[];
}

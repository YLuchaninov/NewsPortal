import { createHash } from "node:crypto";

import {
  extractFromJson,
  extractFromXml,
  type FeedData,
  type FeedEntry,
} from "@extractus/feed-extractor";
import { XMLParser } from "fast-xml-parser";

import { canonicalizeUrl, decodeHtmlEntities } from "./rss";

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

export interface ParsedFeed {
  format: ParsedFeedFormat;
  fetcher: ParsedFeedFetcher;
  title: string | null;
  language: string | null;
  description: string | null;
  generator: string | null;
  publishedAt: string | null;
  entries: ParsedFeedEntry[];
}

type JsonRecord = Record<string, unknown>;

interface ParseFeedInput {
  body: string;
  contentType?: string | null;
}

function sortForHash(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => sortForHash(entry));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as JsonRecord)
        .sort()
        .map((key) => [key, sortForHash((value as JsonRecord)[key])])
    );
  }

  return value;
}

function hashRawEntry(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(sortForHash(value)))
    .digest("hex");
}

function normalizeMaybeString(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeMaybeString(entry)).filter(Boolean).join(" ");
  }

  if (typeof value === "string") {
    return decodeHtmlEntities(value.trim());
  }

  if (!value || typeof value !== "object") {
    return "";
  }

  const candidate = value as JsonRecord;
  for (const key of ["#text", "_text", "_cdata", "$t", "text", "html"]) {
    if (typeof candidate[key] === "string") {
      return decodeHtmlEntities(String(candidate[key]).trim());
    }
  }

  if (Array.isArray(candidate.text)) {
    return candidate.text.map((entry) => normalizeMaybeString(entry)).filter(Boolean).join(" ");
  }

  return "";
}

function readUrlLikeValue(value: unknown): string | null {
  if (Array.isArray(value)) {
    for (const candidate of value) {
      const resolved = readUrlLikeValue(candidate);
      if (resolved) {
        return resolved;
      }
    }
    return null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as JsonRecord;
  for (const key of ["@_url", "url", "@_href", "href"]) {
    if (typeof candidate[key] === "string" && String(candidate[key]).trim()) {
      return String(candidate[key]).trim();
    }
  }

  return null;
}

function readLink(value: unknown): string | null {
  const rawLink = readUrlLikeValue(value) ?? normalizeMaybeString(value);
  if (!rawLink) {
    return null;
  }

  try {
    return canonicalizeUrl(rawLink);
  } catch {
    return rawLink;
  }
}

function readAtomLink(value: unknown): string | null {
  if (Array.isArray(value)) {
    const preferred = value.find((candidate) => {
      if (!candidate || typeof candidate !== "object") {
        return false;
      }

      const rel = (candidate as JsonRecord)["@_rel"];
      return rel == null || String(rel).trim() === "" || String(rel).trim() === "alternate";
    });

    return readAtomLink(preferred ?? value[0]);
  }

  return readLink(value);
}

function readPublishedAt(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function coerceEnclosure(value: unknown): ParsedFeedMediaEnclosure | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as JsonRecord;
  const url = readUrlLikeValue(candidate);
  const type = typeof candidate["@_type"] === "string"
    ? String(candidate["@_type"]).trim()
    : typeof candidate.type === "string"
      ? String(candidate.type).trim()
      : typeof candidate.mime_type === "string"
        ? String(candidate.mime_type).trim()
        : "";

  const rawLength = candidate["@_length"] ?? candidate.length ?? candidate.size_in_bytes ?? 0;
  const length = Number(rawLength);

  if (!url) {
    return null;
  }

  return {
    url,
    type,
    length: Number.isFinite(length) && length >= 0 ? length : 0,
  };
}

function coerceMediaContentUrl(value: unknown): string | null {
  if (Array.isArray(value)) {
    for (const candidate of value) {
      const resolved = coerceMediaContentUrl(candidate);
      if (resolved) {
        return resolved;
      }
    }
    return null;
  }

  return readUrlLikeValue(value);
}

function coerceCategoryStrings(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => coerceCategoryStrings(entry));
  }

  if (typeof value === "string") {
    const trimmed = decodeHtmlEntities(value.trim());
    return trimmed ? [trimmed] : [];
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  const candidate = value as JsonRecord;
  for (const key of ["text", "#text", "_text", "$t", "term", "@_term", "label", "@_label"]) {
    if (typeof candidate[key] === "string" && String(candidate[key]).trim()) {
      return [decodeHtmlEntities(String(candidate[key]).trim())];
    }
  }

  return [];
}

function readRawSummaryHtml(entry: JsonRecord): string {
  return (
    normalizeMaybeString(entry.description) ||
    normalizeMaybeString(entry.summary) ||
    ""
  );
}

function readRawContentHtml(entry: JsonRecord): string {
  return (
    normalizeMaybeString(entry["content:encoded"]) ||
    normalizeMaybeString(entry.content_html) ||
    normalizeMaybeString(entry.content) ||
    ""
  );
}

function detectFeedFormatFromBody(body: string, contentType?: string | null): ParsedFeedFormat {
  const normalizedType = String(contentType ?? "").toLowerCase();
  const trimmed = body.trim();

  if (
    normalizedType.includes("application/feed+json") ||
    normalizedType.includes("application/json") ||
    trimmed.startsWith("{")
  ) {
    return "jsonfeed";
  }

  if (/<rdf:rdf[\s>]/i.test(body)) {
    return "rss1";
  }

  if (/<feed[\s>]/i.test(body)) {
    return "atom";
  }

  return "rss2";
}

function parseFeedData(input: ParseFeedInput): { data: FeedData | null; format: ParsedFeedFormat } {
  const format = detectFeedFormatFromBody(input.body, input.contentType);
  const options = {
    normalization: true,
    useISODateFormat: true,
    descriptionMaxLen: 0,
    getExtraFeedFields: (feedData: object) => ({
      rawLanguage:
        (feedData as JsonRecord).language ??
        (feedData as JsonRecord)["xml:lang"] ??
        null,
    }),
    getExtraEntryFields: (entryData: object) => {
      const entry = entryData as JsonRecord;
      return {
        guid: normalizeMaybeString(entry.guid) || normalizeMaybeString(entry.id) || null,
        rawSummaryHtml: readRawSummaryHtml(entry),
        rawContentHtml: readRawContentHtml(entry),
        enclosure:
          coerceEnclosure(entry.enclosure) ??
          coerceEnclosure(Array.isArray(entry.attachments) ? entry.attachments[0] : entry.attachments),
        mediaContentUrl: coerceMediaContentUrl(entry["media:content"]),
        categories:
          coerceCategoryStrings(entry.category).length > 0
            ? coerceCategoryStrings(entry.category)
            : coerceCategoryStrings(entry.tags),
        rawEntryHash: hashRawEntry(entry),
      };
    },
  };

  if (format === "jsonfeed") {
    const parsedJson = JSON.parse(input.body) as JsonRecord;
    return {
      data: extractFromJson(parsedJson as unknown as string, options),
      format,
    };
  }

  return {
    data: extractFromXml(input.body, options),
    format,
  };
}

function toFetcher(format: ParsedFeedFormat): ParsedFeedFetcher {
  if (format === "atom") {
    return "atom";
  }

  if (format === "jsonfeed") {
    return "jsonfeed";
  }

  return "rss";
}

function parseTolerantAtomFeed(body: string): ParsedFeed {
  const parser = new XMLParser({
    attributeNamePrefix: "@_",
    ignoreAttributes: false,
    processEntities: false,
    htmlEntities: false
  });
  const parsed = parser.parse(body) as JsonRecord;
  const feed = parsed.feed;

  if (!feed || typeof feed !== "object" || Array.isArray(feed)) {
    throw new Error("Invalid Reddit RSS payload: expected an Atom feed.");
  }

  const feedRecord = feed as JsonRecord;
  const rawEntries = Array.isArray(feedRecord.entry)
    ? feedRecord.entry
    : feedRecord.entry == null
      ? []
      : [feedRecord.entry];

  return {
    format: "atom",
    fetcher: "atom",
    title: normalizeMaybeString(feedRecord.title) || null,
    language:
      normalizeMaybeString(feedRecord.language) ||
      normalizeMaybeString(feedRecord["xml:lang"]) ||
      (typeof feedRecord["@_xml:lang"] === "string" && feedRecord["@_xml:lang"].trim()
        ? String(feedRecord["@_xml:lang"]).trim()
        : null),
    description: normalizeMaybeString(feedRecord.subtitle) || null,
    generator: normalizeMaybeString(feedRecord.generator) || null,
    publishedAt: readPublishedAt(
      normalizeMaybeString(feedRecord.updated) ||
        normalizeMaybeString(feedRecord.published) ||
        null
    ),
    entries: rawEntries
      .filter((entry): entry is JsonRecord => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry))
      .map((entry) => {
        const guid = normalizeMaybeString(entry.id) || normalizeMaybeString(entry.guid) || null;
        const summaryHtml = normalizeMaybeString(entry.summary);
        const contentHtml = normalizeMaybeString(entry.content);

        return {
          guid,
          title: normalizeMaybeString(entry.title) || "Untitled feed item",
          url: readAtomLink(entry.link),
          summaryHtml,
          contentHtml,
          publishedAt: readPublishedAt(
            normalizeMaybeString(entry.updated) ||
              normalizeMaybeString(entry.published) ||
              normalizeMaybeString(entry.issued) ||
              null
          ),
          rawXmlHash: hashRawEntry(entry),
          enclosure: coerceEnclosure(entry.enclosure),
          mediaContentUrl: coerceMediaContentUrl(entry["media:content"]),
          categories: Array.from(
            new Set(
              coerceCategoryStrings(entry.category).filter((category) => category.length > 0)
            )
          ),
        } satisfies ParsedFeedEntry;
      }),
  };
}

export function parseFeed(input: ParseFeedInput): ParsedFeed {
  const { data, format } = parseFeedData(input);
  if (!data) {
    throw new Error("Invalid feed payload: unsupported RSS/ATOM/JSON Feed format.");
  }

  const entries = Array.isArray(data.entries) ? data.entries : [];

  return {
    format,
    fetcher: toFetcher(format),
    title: typeof data.title === "string" && data.title.trim() ? data.title : null,
    language:
      typeof data.language === "string" && data.language.trim()
        ? data.language
        : typeof (data as JsonRecord).rawLanguage === "string" &&
            String((data as JsonRecord).rawLanguage).trim()
          ? String((data as JsonRecord).rawLanguage)
          : null,
    description:
      typeof data.description === "string" && data.description.trim() ? data.description : null,
    generator:
      typeof data.generator === "string" && data.generator.trim() ? data.generator : null,
    publishedAt: readPublishedAt(data.published),
    entries: entries.map((entry) => {
      const entryRecord = entry as FeedEntry & JsonRecord;
      const guid =
        typeof entryRecord.guid === "string" && entryRecord.guid.trim()
          ? entryRecord.guid.trim()
          : typeof entryRecord.id === "string" && entryRecord.id.trim()
            ? entryRecord.id.trim()
            : null;

      return {
        guid,
        title:
          typeof entry.title === "string" && entry.title.trim()
            ? entry.title
            : "Untitled feed item",
        url: readLink(entry.link),
        summaryHtml:
          typeof entryRecord.rawSummaryHtml === "string" ? entryRecord.rawSummaryHtml : "",
        contentHtml:
          typeof entryRecord.rawContentHtml === "string" ? entryRecord.rawContentHtml : "",
        publishedAt: readPublishedAt(entry.published),
        rawXmlHash:
          typeof entryRecord.rawEntryHash === "string" && entryRecord.rawEntryHash.trim()
            ? entryRecord.rawEntryHash
            : hashRawEntry(entryRecord),
        enclosure: coerceEnclosure(entryRecord.enclosure),
        mediaContentUrl: coerceMediaContentUrl(entryRecord.mediaContentUrl),
        categories: Array.from(
          new Set(
            coerceCategoryStrings(entryRecord.categories).filter((category) => category.length > 0)
          )
        ),
      } satisfies ParsedFeedEntry;
    }),
  };
}

export function parseRedditSearchFeed(input: ParseFeedInput): ParsedFeed {
  return parseTolerantAtomFeed(input.body);
}

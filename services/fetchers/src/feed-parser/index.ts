import { XMLParser, XMLValidator } from "fast-xml-parser";
import { parseFeed as parseFeedsmithFeed } from "feedsmith";

import {
  buildNamespaceAliases,
  canonicalizeMaybeRelativeUrl,
  coerceCategoryStrings,
  coerceEnclosure,
  coerceMediaContentUrl,
  contextForRecord,
  createContext,
  DEFAULT_NAMESPACE_ALIASES,
  firstString,
  getAttributeValue,
  getRecordValue,
  getRecordValues,
  hashRawEntry,
  isRecord,
  mergeUniqueStrings,
  normalizeMaybeString,
  readAtomLink,
  readLink,
  readPublishedAt,
  resolveRelativeBase,
  toArray,
} from "./helpers";
import type {
  FeedData,
  FeedEntry,
  FeedParseContext,
  JsonRecord,
  ParseFeedInput,
  ParsedFeed,
  ParsedFeedEntry,
  ParsedFeedFetcher,
  ParsedFeedFormat,
  ParsedFeedMediaEnclosure,
} from "./types";
export type {
  ParseFeedInput,
  ParsedFeed,
  ParsedFeedDiagnostic,
  ParsedFeedDiagnosticCode,
  ParsedFeedEntry,
  ParsedFeedFetcher,
  ParsedFeedFormat,
  ParsedFeedMediaEnclosure,
} from "./types";

function readRawSummaryHtml(entry: JsonRecord, context: FeedParseContext): string {
  return firstString([
    getRecordValue(entry, context.aliases, ["description"]),
    getRecordValue(entry, context.aliases, ["summary"]),
  ]);
}

function readRawContentHtml(entry: JsonRecord, context: FeedParseContext): string {
  return firstString([
    getRecordValue(entry, context.aliases, ["content:encoded"]),
    getRecordValue(entry, context.aliases, ["content_html"]),
    getRecordValue(entry, context.aliases, ["content"]),
    getRecordValue(entry, context.aliases, ["content_text"]),
  ]);
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

  const feedsmithFormat = detectFeedsmithFormat(body);
  if (feedsmithFormat) {
    return feedsmithFormat;
  }

  if (/<(?:[a-z_][\w.-]*:)?rdf[\s>]/i.test(body)) {
    return "rss1";
  }

  if (/<feed[\s>]/i.test(body)) {
    return "atom";
  }

  return "rss2";
}

function detectFeedsmithFormat(body: string): ParsedFeedFormat | null {
  try {
    const parsed = parseFeedsmithFeed(body);
    switch (parsed.format) {
      case "atom":
        return "atom";
      case "json":
        return "jsonfeed";
      case "rdf":
        return "rss1";
      case "rss":
        return "rss2";
      default:
        return null;
    }
  } catch {
    return null;
  }
}

function urlLikeString(value: unknown): string | null {
  const normalized = normalizeMaybeString(value);
  return /^https?:\/\//i.test(normalized) ? normalized : null;
}

function readGuid(entry: JsonRecord, context: FeedParseContext): string | null {
  return firstString([
    getRecordValue(entry, context.aliases, ["guid"]),
    getRecordValue(entry, context.aliases, ["id"]),
  ]) || null;
}

function guidPermalinkAllowed(entry: JsonRecord, context: FeedParseContext): boolean {
  const guid = getRecordValue(entry, context.aliases, ["guid"]);
  if (!isRecord(guid)) {
    return true;
  }

  const isPermalink = getAttributeValue(guid, context.aliases, ["isPermaLink", "ispermalink"]);
  return String(isPermalink ?? "true").toLowerCase() !== "false";
}

function readEntryLink(entry: JsonRecord, context: FeedParseContext, entryId?: string | null): string | null {
  const directLink = getRecordValue(entry, context.aliases, ["link"]);
  const atomLink = getRecordValue(entry, context.aliases, ["atom:link"]);
  const guid = getRecordValue(entry, context.aliases, ["guid"]);
  const id = getRecordValue(entry, context.aliases, ["id"]);
  const directParsedLink = directLink
    ? (Array.isArray(directLink) || isRecord(directLink)
        ? readAtomLink(directLink, context, "alternate", entryId)
        : readLink(directLink, context, "link", entryId))
    : null;

  return (
    directParsedLink ??
    (atomLink ? readAtomLink(atomLink, context, "alternate", entryId) : null) ??
    (guidPermalinkAllowed(entry, context) && urlLikeString(guid)
      ? (() => {
          context.diagnostics.push({
            code: "guid_permalink_used",
            field: "guid",
            entryId,
            message: "Used URL-like guid as feed entry permalink.",
          });
          return readLink(guid, context, "guid", entryId);
        })()
      : null) ??
    (urlLikeString(id) ? readLink(id, context, "id", entryId) : null)
  );
}

function readEntryPublished(entry: JsonRecord, context: FeedParseContext): string {
  return firstString([
    getRecordValue(entry, context.aliases, ["pubDate"]),
    getRecordValue(entry, context.aliases, ["published"]),
    getRecordValue(entry, context.aliases, ["updated"]),
    getRecordValue(entry, context.aliases, ["modified"]),
    getRecordValue(entry, context.aliases, ["issued"]),
    getRecordValue(entry, context.aliases, ["dc:date"]),
    getRecordValue(entry, context.aliases, ["dcterms:issued"]),
    getRecordValue(entry, context.aliases, ["dcterms:modified"]),
    getRecordValue(entry, context.aliases, ["date_published"]),
    getRecordValue(entry, context.aliases, ["date_modified"]),
  ]);
}

function readEntryCategories(entry: JsonRecord, context: FeedParseContext): string[] {
  return mergeUniqueStrings(
    coerceCategoryStrings(getRecordValues(entry, context.aliases, ["category"]), context.aliases),
    coerceCategoryStrings(getRecordValues(entry, context.aliases, ["tags"]), context.aliases),
    coerceCategoryStrings(getRecordValues(entry, context.aliases, ["dc:subject", "dcterms:subject"]), context.aliases),
    coerceCategoryStrings(getRecordValues(entry, context.aliases, ["media:keywords"]), context.aliases)
  );
}

function readAtomEnclosure(entry: JsonRecord, context: FeedParseContext, entryId?: string | null): ParsedFeedMediaEnclosure | null {
  const links = [
    ...getRecordValues(entry, context.aliases, ["link"]),
    ...getRecordValues(entry, context.aliases, ["atom:link"]),
  ];
  const enclosures = links.filter((candidate) => {
    if (!isRecord(candidate)) {
      return false;
    }

    return String(getAttributeValue(candidate, context.aliases, ["rel"]) ?? "").trim() === "enclosure";
  });

  return coerceEnclosure(enclosures, context, entryId);
}

function buildFeedEntry(entry: JsonRecord, context: FeedParseContext): FeedEntry {
  const entryContext = contextForRecord(entry, context);
  const guid = readGuid(entry, entryContext);
  const link = readEntryLink(entry, entryContext, guid);
  const mediaContent = getRecordValue(entry, entryContext.aliases, ["media:content"]);
  const attachments = getRecordValue(entry, entryContext.aliases, ["attachments"]);

  return {
    id: guid,
    guid,
    title: firstString([getRecordValue(entry, entryContext.aliases, ["title"])]),
    link,
    published: readEntryPublished(entry, entryContext),
    rawSummaryHtml: readRawSummaryHtml(entry, entryContext),
    rawContentHtml: readRawContentHtml(entry, entryContext),
    enclosure:
      coerceEnclosure(getRecordValue(entry, entryContext.aliases, ["enclosure"]), entryContext, guid) ??
      readAtomEnclosure(entry, entryContext, guid) ??
      coerceEnclosure(mediaContent, entryContext, guid) ??
      coerceEnclosure(attachments, entryContext, guid),
    mediaContentUrl:
      coerceMediaContentUrl(mediaContent, entryContext, guid) ??
      coerceMediaContentUrl(attachments, entryContext, guid),
    categories: readEntryCategories(entry, entryContext),
    rawEntryHash: hashRawEntry(entry),
    baseUrl: entryContext.baseUrl,
  };
}

function parseJsonFeedData(body: string, context: FeedParseContext): FeedData {
  const feed = JSON.parse(body) as JsonRecord;
  const items = toArray(feed.items).filter(
    (entry): entry is JsonRecord => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry)
  );
  const feedContext = {
    ...context,
    baseUrl:
      canonicalizeMaybeRelativeUrl(firstString([feed.feed_url, feed.home_page_url]), context, "feed_url") ??
      context.baseUrl,
  };

  return {
    title: normalizeMaybeString(feed.title),
    language: normalizeMaybeString(feed.language),
    description: normalizeMaybeString(feed.description),
    generator: "",
    published: normalizeMaybeString(feed.date_published ?? feed.date_modified),
    rawLanguage: feed.language ?? null,
    entries: items.map((entry) => buildFeedEntry({
      ...entry,
      guid: entry.id,
      link: entry.url,
      published: entry.date_published ?? entry.date_modified,
      summary: entry.summary,
      content: entry.content_html ?? entry.content_text,
      enclosure: entry.attachments,
      category: entry.tags,
    }, feedContext)),
  };
}

function parseRssFeedData(root: JsonRecord, context: FeedParseContext): FeedData | null {
  const rss = getRecordValue(root, context.aliases, ["rss"]);
  const channel = rss && typeof rss === "object" && !Array.isArray(rss)
    ? getRecordValue(rss as JsonRecord, context.aliases, ["channel"])
    : null;

  if (!channel || typeof channel !== "object" || Array.isArray(channel)) {
    return null;
  }

  const feed = channel as JsonRecord;
  const rssContext = contextForRecord(rss as JsonRecord, context);
  const channelContext = contextForRecord(feed, rssContext);
  const channelHasXmlBase = getAttributeValue(feed, channelContext.aliases, ["xml:base", "base"]) != null;
  const channelLinkValue = getRecordValue(feed, channelContext.aliases, ["link"]);
  const channelLink = readLink(channelLinkValue, channelContext, "channel.link");
  const channelBase = resolveRelativeBase(channelLinkValue, channelContext);
  const feedContext = {
    ...channelContext,
    baseUrl: channelHasXmlBase ? channelContext.baseUrl : channelBase ?? channelLink ?? channelContext.baseUrl,
  };
  const items = toArray(getRecordValue(feed, feedContext.aliases, ["item"])).filter(
    (entry): entry is JsonRecord => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry)
  );

  return {
    title: firstString([getRecordValue(feed, feedContext.aliases, ["title"])]),
    language: firstString([getRecordValue(feed, feedContext.aliases, ["language"])]),
    description: firstString([getRecordValue(feed, feedContext.aliases, ["description"])]),
    generator: firstString([getRecordValue(feed, feedContext.aliases, ["generator"])]),
    published: firstString([
      getRecordValue(feed, feedContext.aliases, ["lastBuildDate"]),
      getRecordValue(feed, feedContext.aliases, ["pubDate"]),
      getRecordValue(feed, feedContext.aliases, ["dc:date", "dcterms:issued"]),
    ]),
    rawLanguage:
      getRecordValue(feed, feedContext.aliases, ["language"]) ??
      getAttributeValue(feed, feedContext.aliases, ["xml:lang", "lang"]) ??
      null,
    entries: items.map((entry) => buildFeedEntry(entry, feedContext)),
  };
}

function parseRdfFeedData(root: JsonRecord, context: FeedParseContext): FeedData | null {
  const rdf = getRecordValue(root, context.aliases, ["rdf:RDF", "rdf"]);
  if (!rdf || typeof rdf !== "object" || Array.isArray(rdf)) {
    return null;
  }

  const feed = rdf as JsonRecord;
  const feedContext = contextForRecord(feed, context);
  const channelValue = getRecordValue(feed, feedContext.aliases, ["channel"]);
  const channel = isRecord(channelValue)
    ? channelValue
    : {};
  const items = toArray(getRecordValue(feed, feedContext.aliases, ["item"])).filter(
    (entry): entry is JsonRecord => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry)
  );

  return {
    title: firstString([getRecordValue(channel, feedContext.aliases, ["title"])]),
    language: firstString([getRecordValue(channel, feedContext.aliases, ["language"])]),
    description: firstString([getRecordValue(channel, feedContext.aliases, ["description"])]),
    generator: firstString([getRecordValue(channel, feedContext.aliases, ["generator"])]),
    published: firstString([
      getRecordValue(channel, feedContext.aliases, ["date", "dc:date", "dcterms:issued"]),
    ]),
    rawLanguage:
      getRecordValue(channel, feedContext.aliases, ["language"]) ??
      getAttributeValue(channel, feedContext.aliases, ["xml:lang", "lang"]) ??
      null,
    entries: items.map((entry) => buildFeedEntry(entry, feedContext)),
  };
}

function parseAtomFeedData(root: JsonRecord, context: FeedParseContext): FeedData | null {
  const atom = getRecordValue(root, context.aliases, ["feed"]);
  if (!atom || typeof atom !== "object" || Array.isArray(atom)) {
    return null;
  }

  const feed = atom as JsonRecord;
  const feedContext = contextForRecord(feed, context);
  const feedHasXmlBase = getAttributeValue(feed, feedContext.aliases, ["xml:base", "base"]) != null;
  const feedLinkValue = getRecordValue(feed, feedContext.aliases, ["link", "atom:link"]);
  const feedLink = readAtomLink(feedLinkValue, feedContext);
  const feedBase = resolveRelativeBase(feedLinkValue, feedContext);
  const entryContext = {
    ...feedContext,
    baseUrl: feedHasXmlBase ? feedContext.baseUrl : feedBase ?? feedLink ?? feedContext.baseUrl,
  };
  const entries = toArray(getRecordValue(feed, entryContext.aliases, ["entry"])).filter(
    (entry): entry is JsonRecord => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry)
  );

  return {
    title: firstString([getRecordValue(feed, entryContext.aliases, ["title"])]),
    language:
      firstString([getRecordValue(feed, entryContext.aliases, ["language"])]) ||
      firstString([getAttributeValue(feed, entryContext.aliases, ["xml:lang", "lang"])]),
    description: firstString([getRecordValue(feed, entryContext.aliases, ["subtitle"])]),
    generator: firstString([getRecordValue(feed, entryContext.aliases, ["generator"])]),
    published: firstString([getRecordValue(feed, entryContext.aliases, ["updated", "published"])]),
    rawLanguage:
      getRecordValue(feed, entryContext.aliases, ["language"]) ??
      getAttributeValue(feed, entryContext.aliases, ["xml:lang", "lang"]) ??
      null,
    entries: entries.map((entry) => buildFeedEntry(entry, entryContext)),
  };
}

function parseXmlFeedData(body: string, format: ParsedFeedFormat, context: FeedParseContext): FeedData | null {
  if (XMLValidator.validate(body) !== true) {
    throw new Error("The XML document is not well-formed");
  }

  const parser = new XMLParser({
    attributeNamePrefix: "@_",
    ignoreAttributes: false,
  });
  const root = parser.parse(body) as JsonRecord;
  const xmlContext = {
    ...context,
    aliases: buildNamespaceAliases(root),
  };

  if (format === "atom") {
    return parseAtomFeedData(root, xmlContext);
  }

  if (format === "rss1") {
    return parseRdfFeedData(root, xmlContext);
  }

  return parseRssFeedData(root, xmlContext);
}

function parseFeedsmithFeedData(body: string, context: FeedParseContext): { data: FeedData | null; format: ParsedFeedFormat | null } {
  try {
    const parsed = parseFeedsmithFeed(body);
    const feed: JsonRecord = isRecord(parsed.feed) ? parsed.feed : {};
    const format = parsed.format === "atom"
      ? "atom"
      : parsed.format === "json"
        ? "jsonfeed"
        : parsed.format === "rdf"
          ? "rss1"
          : parsed.format === "rss"
            ? "rss2"
            : null;
    if (!format) {
      return { data: null, format: null };
    }

    const entriesKey = format === "atom" ? "entries" : "items";
    const items = toArray(feed[entriesKey]).filter(isRecord);
    return {
      format,
      data: {
        title: normalizeMaybeString(feed.title),
        language: normalizeMaybeString(feed.language),
        description: normalizeMaybeString(feed.description ?? feed.subtitle),
        generator: normalizeMaybeString(feed.generator),
        published: normalizeMaybeString(feed.published ?? feed.updated ?? feed.pubDate),
        rawLanguage: feed.language ?? null,
        entries: items.map((entry) => {
          const normalizedEntry = {
            ...entry,
            guid: entry.guid ?? entry.id ?? getAttributeValue(entry, context.aliases, ["rdf:about", "about"]),
            link: entry.link ?? entry.url ?? entry.links,
            published:
              entry.published ??
              entry.updated ??
              entry.pubDate ??
              entry.date_published ??
              entry.date_modified,
            summary: entry.summary ?? entry.description,
            content: entry.content ?? entry.content_encoded ?? entry.content_html ?? entry.content_text,
            enclosure: entry.enclosure ?? entry.enclosures ?? entry.attachments,
            category: entry.category ?? entry.categories ?? entry.tags,
          } satisfies JsonRecord;
          return buildFeedEntry(normalizedEntry, context);
        }),
      },
    };
  } catch {
    return { data: null, format: null };
  }
}

function parseFeedData(input: ParseFeedInput): { data: FeedData | null; format: ParsedFeedFormat } {
  const format = detectFeedFormatFromBody(input.body, input.contentType);
  const context = createContext(input);
  let data = format === "jsonfeed"
    ? parseJsonFeedData(input.body, context)
    : parseXmlFeedData(input.body, format, context);
  let resolvedFormat = format;

  if (!data) {
    const feedsmith = parseFeedsmithFeedData(input.body, context);
    data = feedsmith.data;
    resolvedFormat = feedsmith.format ?? resolvedFormat;
  }

  if (data) {
    data.diagnostics = context.diagnostics;
  }
  return { data, format: resolvedFormat };
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

function parseTolerantAtomFeed(input: ParseFeedInput): ParsedFeed {
  const parser = new XMLParser({
    attributeNamePrefix: "@_",
    ignoreAttributes: false,
    processEntities: false,
    htmlEntities: false
  });
  const parsed = parser.parse(input.body) as JsonRecord;
  const context = createContext(input, buildNamespaceAliases(parsed));
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
        null,
      context,
      "feed.updated"
    ),
    entries: rawEntries
      .filter((entry): entry is JsonRecord => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry))
      .map((entry) => {
        const entryContext = contextForRecord(entry, context);
        const guid = normalizeMaybeString(entry.id) || normalizeMaybeString(entry.guid) || null;
        const summaryHtml = normalizeMaybeString(entry.summary);
        const contentHtml = normalizeMaybeString(entry.content);

        return {
          guid,
          title: normalizeMaybeString(entry.title) || "Untitled feed item",
          url: readAtomLink(entry.link, entryContext, "alternate", guid),
          summaryHtml,
          contentHtml,
          publishedAt: readPublishedAt(
            normalizeMaybeString(entry.updated) ||
              normalizeMaybeString(entry.published) ||
              normalizeMaybeString(entry.issued) ||
              null,
            entryContext,
            "entry.updated"
          ),
          rawXmlHash: hashRawEntry(entry),
          enclosure:
            coerceEnclosure(entry.enclosure, entryContext, guid) ??
            readAtomEnclosure(entry, entryContext, guid),
          mediaContentUrl: coerceMediaContentUrl(entry["media:content"], entryContext, guid),
          categories: Array.from(
            new Set(
              coerceCategoryStrings(entry.category, entryContext.aliases).filter((category) => category.length > 0)
            )
          ),
        } satisfies ParsedFeedEntry;
      }),
    diagnostics: context.diagnostics.length > 0 ? context.diagnostics : undefined,
  };
}

export function parseFeed(input: ParseFeedInput): ParsedFeed {
  const { data, format } = parseFeedData(input);
  if (!data) {
    throw new Error("Invalid feed payload: unsupported RSS/ATOM/JSON Feed format.");
  }

  const entries = Array.isArray(data.entries) ? data.entries : [];
  const diagnostics = Array.isArray(data.diagnostics) ? data.diagnostics : [];
  const outputContext: FeedParseContext = {
    aliases: new Map(DEFAULT_NAMESPACE_ALIASES),
    baseUrl: null,
    diagnostics,
  };

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
    publishedAt: readPublishedAt(data.published, outputContext, "feed.published"),
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
        url: typeof entry.link === "string" ? entry.link : readLink(entry.link, outputContext),
        summaryHtml:
          typeof entryRecord.rawSummaryHtml === "string" ? entryRecord.rawSummaryHtml : "",
        contentHtml:
          typeof entryRecord.rawContentHtml === "string" ? entryRecord.rawContentHtml : "",
        publishedAt: readPublishedAt(entry.published, outputContext, "entry.published"),
        rawXmlHash:
          typeof entryRecord.rawEntryHash === "string" && entryRecord.rawEntryHash.trim()
            ? entryRecord.rawEntryHash
            : hashRawEntry(entryRecord),
        enclosure: coerceEnclosure(entryRecord.enclosure, outputContext, guid),
        mediaContentUrl: coerceMediaContentUrl(entryRecord.mediaContentUrl, outputContext, guid),
        categories: Array.from(
          new Set(
            coerceCategoryStrings(entryRecord.categories, outputContext.aliases).filter((category) => category.length > 0)
          )
        ),
      } satisfies ParsedFeedEntry;
    }),
    diagnostics: diagnostics.length > 0 ? diagnostics : undefined,
  };
}

export function parseRedditSearchFeed(input: ParseFeedInput): ParsedFeed {
  return parseTolerantAtomFeed(input);
}

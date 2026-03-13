import { createHash } from "node:crypto";

export interface ParsedRssItem {
  guid: string | null;
  title: string;
  url: string | null;
  summaryHtml: string;
  contentHtml: string;
  publishedAt: string | null;
  rawXmlHash: string;
}

interface ParsedRssFeed {
  title: string | null;
  language: string | null;
  items: ParsedRssItem[];
}

const HTML_ENTITY_MAP: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: "\""
};

function stripCdata(value: string): string {
  return value.replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "");
}

export function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (_, entity: string) => {
    if (entity.startsWith("#x") || entity.startsWith("#X")) {
      const parsed = Number.parseInt(entity.slice(2), 16);
      return Number.isNaN(parsed) ? `&${entity};` : String.fromCodePoint(parsed);
    }

    if (entity.startsWith("#")) {
      const parsed = Number.parseInt(entity.slice(1), 10);
      return Number.isNaN(parsed) ? `&${entity};` : String.fromCodePoint(parsed);
    }

    return HTML_ENTITY_MAP[entity] ?? `&${entity};`;
  });
}

export function stripHtmlTags(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");
}

export function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeTagContent(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const withoutCdata = stripCdata(value.trim());
  return decodeHtmlEntities(withoutCdata).trim();
}

function escapeTagName(tagName: string): string {
  return tagName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractTagContent(block: string, tagName: string): string | null {
  const pattern = new RegExp(
    `<${escapeTagName(tagName)}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escapeTagName(tagName)}>`,
    "i"
  );
  const match = block.match(pattern);
  return normalizeTagContent(match?.[1] ?? null);
}

function extractFirstTagContent(block: string, tagNames: string[]): string | null {
  for (const tagName of tagNames) {
    const value = extractTagContent(block, tagName);

    if (value) {
      return value;
    }
  }

  return null;
}

export function canonicalizeUrl(rawUrl: string): string {
  const url = new URL(rawUrl);
  url.hash = "";

  const paramsToDelete = new Set<string>();
  for (const key of url.searchParams.keys()) {
    const lowerKey = key.toLowerCase();

    if (
      lowerKey.startsWith("utm_") ||
      lowerKey === "fbclid" ||
      lowerKey === "gclid" ||
      lowerKey === "mc_cid" ||
      lowerKey === "mc_eid"
    ) {
      paramsToDelete.add(key);
    }
  }

  for (const key of paramsToDelete) {
    url.searchParams.delete(key);
  }

  url.searchParams.sort();
  url.protocol = url.protocol.toLowerCase();
  url.hostname = url.hostname.toLowerCase();

  if (url.pathname !== "/" && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.slice(0, -1);
  }

  return url.toString();
}

function parseDate(rawValue: string | null): string | null {
  if (!rawValue) {
    return null;
  }

  const parsed = new Date(rawValue);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function parseRssFeed(xml: string): ParsedRssFeed {
  const channelBlockMatch = xml.match(/<channel(?:\s[^>]*)?>([\s\S]*?)<\/channel>/i);
  const channelBlock = channelBlockMatch?.[1] ?? xml;
  const itemBlocks = Array.from(xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi));

  const items = itemBlocks.map((match) => {
    const itemBlock = match[1];
    const guid = extractFirstTagContent(itemBlock, ["guid"]);
    const title =
      collapseWhitespace(extractFirstTagContent(itemBlock, ["title"]) ?? "") ||
      "Untitled RSS item";
    const rawUrl = extractFirstTagContent(itemBlock, ["link"]);

    return {
      guid,
      title,
      url: rawUrl,
      summaryHtml: extractFirstTagContent(itemBlock, ["description"]) ?? "",
      contentHtml:
        extractFirstTagContent(itemBlock, ["content:encoded", "content"]) ?? "",
      publishedAt: parseDate(
        extractFirstTagContent(itemBlock, [
          "pubDate",
          "published",
          "dc:date",
          "updated"
        ])
      ),
      rawXmlHash: createHash("sha256").update(itemBlock).digest("hex")
    } satisfies ParsedRssItem;
  });

  return {
    title: extractFirstTagContent(channelBlock, ["title"]),
    language: extractFirstTagContent(channelBlock, ["language"]),
    items
  };
}

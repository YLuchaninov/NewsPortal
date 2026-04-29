import { createHash } from "node:crypto";

import { canonicalizeUrl, collapseWhitespace, decodeHtmlEntities, stripHtmlTags } from "./rss";

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

export function normalizeText(value: string): string {
  return collapseWhitespace(decodeHtmlEntities(stripHtmlTags(value)));
}

export function readOptionalString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function maybeExternalUrl(value: unknown, baseUrl?: string): string | null {
  const raw = readOptionalString(value);
  if (!raw) {
    return null;
  }
  try {
    const url = baseUrl ? new URL(raw, baseUrl) : new URL(raw);
    if (!["http:", "https:"].includes(url.protocol)) {
      return null;
    }
    return canonicalizeUrl(url.toString());
  } catch {
    return null;
  }
}

export function extractMetaContent(html: string, names: readonly string[]): string | null {
  for (const name of names) {
    const match = html.match(
      new RegExp(
        `<meta[^>]+(?:name|property)=["']${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]+content=["']([\\s\\S]*?)["'][^>]*>`,
        "i"
      )
    );
    const value = readOptionalString(match?.[1] ?? null);
    if (value) {
      return value;
    }
  }
  return null;
}

export function extractHtmlTitle(html: string): string | null {
  return readOptionalString(normalizeText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? ""));
}

export function extractH1(html: string): string | null {
  return readOptionalString(normalizeText(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? ""));
}

export function extractStructuredTypes(html: string): string[] {
  const types = new Set<string>();
  for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    const payload = readOptionalString(match[1] ?? null);
    if (!payload) {
      continue;
    }
    try {
      const parsed = JSON.parse(payload) as unknown;
      const stack = Array.isArray(parsed) ? [...parsed] : [parsed];
      while (stack.length > 0) {
        const value = stack.pop();
        if (!value || typeof value !== "object") {
          continue;
        }
        if (Array.isArray(value)) {
          stack.push(...value);
          continue;
        }
        const record = value as Record<string, unknown>;
        const typeValue = record["@type"];
        if (typeof typeValue === "string" && typeValue.trim()) {
          types.add(typeValue.trim());
        }
        if (Array.isArray(typeValue)) {
          for (const item of typeValue) {
            if (typeof item === "string" && item.trim()) {
              types.add(item.trim());
            }
          }
        }
        for (const nested of Object.values(record)) {
          if (nested && typeof nested === "object") {
            stack.push(nested);
          }
        }
      }
    } catch {
      continue;
    }
  }
  return Array.from(types);
}

export function extractAnchorLinks(html: string, baseUrl: string): Array<{ url: string; title: string }> {
  const links: Array<{ url: string; title: string }> = [];
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const url = maybeExternalUrl(match[1] ?? "", baseUrl);
    if (!url) {
      continue;
    }
    links.push({
      url,
      title: normalizeText(match[2] ?? "")
    });
  }
  return links;
}

export function extractImageUrls(html: string, baseUrl: string): string[] {
  const urls = new Set<string>();
  const ogImage = maybeExternalUrl(extractMetaContent(html, ["og:image", "twitter:image"]), baseUrl);
  if (ogImage) {
    urls.add(ogImage);
  }
  for (const match of html.matchAll(/<img\b[^>]*src=["']([^"']+)["'][^>]*>/gi)) {
    const url = maybeExternalUrl(match[1] ?? "", baseUrl);
    if (!url) {
      continue;
    }
    urls.add(url);
    if (urls.size >= 5) {
      break;
    }
  }
  return Array.from(urls);
}

export function extractDownloadLinks(html: string, baseUrl: string): Array<{ url: string; title: string }> {
  return extractAnchorLinks(html, baseUrl).filter((link) => /\.(pdf|csv|xlsx|xls|json|xml|zip)(?:$|\?)/i.test(link.url));
}

export function extractDefinitionListAttributes(html: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const match of html.matchAll(/<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/gi)) {
    const key = normalizeText(match[1] ?? "");
    const value = normalizeText(match[2] ?? "");
    if (key && value) {
      attributes[key] = value;
    }
  }
  return attributes;
}

export function extractTableAttributes(html: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const match of html.matchAll(/<tr[^>]*>\s*<t[hd][^>]*>([\s\S]*?)<\/t[hd]>\s*<t[hd][^>]*>([\s\S]*?)<\/t[hd]>\s*<\/tr>/gi)) {
    const key = normalizeText(match[1] ?? "");
    const value = normalizeText(match[2] ?? "");
    if (key && value && !(key in attributes)) {
      attributes[key] = value;
    }
  }
  return attributes;
}

export function summarizeBody(body: string, maxLength = 320): string {
  const normalized = normalizeText(body);
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1).trim()}…`;
}

export function computeContentHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

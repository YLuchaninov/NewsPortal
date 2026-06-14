import { createHash } from "node:crypto";

import { canonicalizeUrl, decodeHtmlEntities } from "../rss";
import type {
  FeedParseContext,
  JsonRecord,
  ParseFeedInput,
  ParsedFeedMediaEnclosure,
} from "./types";

const NAMESPACE_CANONICAL_BY_URI: Record<string, string> = {
  "http://purl.org/dc/elements/1.1/": "dc",
  "http://purl.org/dc/terms/": "dcterms",
  "http://purl.org/rss/1.0/modules/content/": "content",
  "http://search.yahoo.com/mrss/": "media",
  "http://www.w3.org/2005/Atom": "atom",
  "http://www.w3.org/1999/02/22-rdf-syntax-ns#": "rdf",
};

export const DEFAULT_NAMESPACE_ALIASES = new Map<string, string>([
  ["dc", "dc"],
  ["dcterms", "dcterms"],
  ["content", "content"],
  ["media", "media"],
  ["atom", "atom"],
  ["rdf", "rdf"],
]);

export function toArray(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }

  return value == null ? [] : [value];
}

export function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stripAttributePrefix(key: string): string {
  return key.startsWith("@_") ? key.slice(2) : key;
}

function canonicalFieldName(key: string, aliases: Map<string, string>): string {
  const stripped = stripAttributePrefix(key).toLowerCase();
  const separatorIndex = stripped.indexOf(":");
  if (separatorIndex === -1) {
    return stripped;
  }

  const prefix = stripped.slice(0, separatorIndex);
  const local = stripped.slice(separatorIndex + 1);
  return `${aliases.get(prefix) ?? prefix}:${local}`;
}

export function getRecordValue(
  record: JsonRecord,
  aliases: Map<string, string>,
  names: readonly string[]
): unknown {
  const expected = new Set(names.map((name) => canonicalFieldName(name, aliases)));
  for (const [key, value] of Object.entries(record)) {
    if (expected.has(canonicalFieldName(key, aliases))) {
      return value;
    }
  }

  return undefined;
}

export function getRecordValues(
  record: JsonRecord,
  aliases: Map<string, string>,
  names: readonly string[]
): unknown[] {
  const expected = new Set(names.map((name) => canonicalFieldName(name, aliases)));
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(record)) {
    if (expected.has(canonicalFieldName(key, aliases))) {
      values.push(...toArray(value));
    }
  }

  return values;
}

export function getAttributeValue(
  record: JsonRecord,
  aliases: Map<string, string>,
  names: readonly string[]
): unknown {
  const expected = new Set(names.map((name) => canonicalFieldName(name, aliases)));
  for (const [key, value] of Object.entries(record)) {
    if (!key.startsWith("@_")) {
      continue;
    }

    if (expected.has(canonicalFieldName(key, aliases))) {
      return value;
    }
  }

  return undefined;
}

export function firstString(values: readonly unknown[]): string {
  for (const value of values) {
    const normalized = normalizeMaybeString(value);
    if (normalized) {
      return normalized;
    }
  }

  return "";
}

function collectNamespaceAliases(value: unknown, aliases: Map<string, string>): void {
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectNamespaceAliases(entry, aliases);
    }
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  for (const [key, rawValue] of Object.entries(value)) {
    const stripped = stripAttributePrefix(key).toLowerCase();
    if (stripped.startsWith("xmlns:") && typeof rawValue === "string") {
      const prefix = stripped.slice("xmlns:".length);
      const canonical = NAMESPACE_CANONICAL_BY_URI[rawValue.trim()];
      if (canonical) {
        aliases.set(prefix, canonical);
      }
    }
    collectNamespaceAliases(rawValue, aliases);
  }
}

export function buildNamespaceAliases(root: unknown): Map<string, string> {
  const aliases = new Map(DEFAULT_NAMESPACE_ALIASES);
  collectNamespaceAliases(root, aliases);
  return aliases;
}

export function createContext(input: Pick<ParseFeedInput, "feedUrl" | "baseUrl">, aliases?: Map<string, string>): FeedParseContext {
  return {
    aliases: aliases ?? new Map(DEFAULT_NAMESPACE_ALIASES),
    baseUrl: input.baseUrl ?? input.feedUrl ?? null,
    diagnostics: [],
  };
}

export function resolveRelativeBase(rawValue: unknown, context: FeedParseContext): string | null {
  const raw = normalizeMaybeString(rawValue);
  if (!raw) {
    return context.baseUrl;
  }

  try {
    return new URL(raw, context.baseUrl ?? undefined).toString();
  } catch {
    context.diagnostics.push({
      code: "malformed_optional_field_ignored",
      field: "xml:base",
      message: "Ignored malformed xml:base value.",
    });
    return context.baseUrl;
  }
}

export function contextForRecord(record: JsonRecord, context: FeedParseContext): FeedParseContext {
  return {
    ...context,
    baseUrl: resolveRelativeBase(getAttributeValue(record, context.aliases, ["xml:base", "base"]), context),
  };
}

export function canonicalizeMaybeRelativeUrl(
  rawUrl: string,
  context: FeedParseContext,
  field: string,
  entryId?: string | null
): string | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const resolved = new URL(trimmed, context.baseUrl ?? undefined).toString();
    if (resolved !== trimmed) {
      context.diagnostics.push({
        code: "relative_url_resolved",
        field,
        entryId,
        message: `Resolved relative feed URL field ${field}.`,
      });
    }
    return canonicalizeUrl(resolved);
  } catch {
    try {
      return canonicalizeUrl(trimmed);
    } catch {
      return trimmed;
    }
  }
}

export function mergeUniqueStrings(...groups: readonly string[][]): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const group of groups) {
    for (const value of group) {
      const normalized = decodeHtmlEntities(value.trim());
      if (!normalized || seen.has(normalized)) {
        continue;
      }
      seen.add(normalized);
      merged.push(normalized);
    }
  }

  return merged;
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

export function hashRawEntry(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(sortForHash(value)))
    .digest("hex");
}

export function normalizeMaybeString(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeMaybeString(entry)).filter(Boolean).join(" ");
  }

  if (typeof value === "string") {
    return decodeHtmlEntities(value.trim());
  }

  if (typeof value === "number" || typeof value === "bigint" || typeof value === "boolean") {
    return String(value).trim();
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

export function readUrlLikeValue(value: unknown, context?: FeedParseContext): string | null {
  if (Array.isArray(value)) {
    for (const candidate of value) {
      const resolved = readUrlLikeValue(candidate, context);
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
  const aliases = context?.aliases ?? DEFAULT_NAMESPACE_ALIASES;
  for (const key of ["url", "href"]) {
    const resolved = getAttributeValue(candidate, aliases, [key]) ?? getRecordValue(candidate, aliases, [key]);
    if (typeof resolved === "string" && resolved.trim()) {
      return resolved.trim();
    }
  }

  return null;
}

export function readLink(
  value: unknown,
  context: FeedParseContext,
  field = "link",
  entryId?: string | null
): string | null {
  const rawLink = readUrlLikeValue(value, context) ?? normalizeMaybeString(value);
  if (!rawLink) {
    return null;
  }

  return canonicalizeMaybeRelativeUrl(rawLink, context, field, entryId);
}

export function readAtomLink(
  value: unknown,
  context: FeedParseContext,
  preferredRel = "alternate",
  entryId?: string | null
): string | null {
  if (Array.isArray(value)) {
    const preferred = value.find((candidate) => {
      if (!candidate || typeof candidate !== "object") {
        return false;
      }

      const rel = getAttributeValue(candidate as JsonRecord, context.aliases, ["rel"]);
      return rel == null || String(rel).trim() === "" || String(rel).trim() === preferredRel;
    });

    if (preferred) {
      return readAtomLink(preferred, context, preferredRel, entryId);
    }

    if (preferredRel === "alternate") {
      const fallback = value.find((candidate) => {
        if (!candidate || typeof candidate !== "object") {
          return false;
        }

        const rel = getAttributeValue(candidate as JsonRecord, context.aliases, ["rel"]);
        return String(rel ?? "").trim() !== "enclosure";
      });
      return readAtomLink(fallback ?? value[0], context, preferredRel, entryId);
    }

    return readAtomLink(value[0], context, preferredRel, entryId);
  }

  if (isRecord(value)) {
    const rel = String(getAttributeValue(value, context.aliases, ["rel"]) ?? "").trim();
    if (preferredRel === "alternate" && rel === "enclosure") {
      return null;
    }
    if (preferredRel !== "alternate" && rel && rel !== preferredRel) {
      return null;
    }
  }

  return readLink(value, context, preferredRel === "alternate" ? "link" : `link:${preferredRel}`, entryId);
}

export function readPublishedAt(value: unknown, context?: FeedParseContext, field = "published"): string | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    context?.diagnostics.push({
      code: "invalid_date_ignored",
      field,
      message: `Ignored invalid feed date field ${field}.`,
    });
    return null;
  }

  return parsed.toISOString();
}

export function coerceEnclosure(value: unknown, context: FeedParseContext, entryId?: string | null): ParsedFeedMediaEnclosure | null {
  if (Array.isArray(value)) {
    for (const candidate of value) {
      const enclosure = coerceEnclosure(candidate, context, entryId);
      if (enclosure) {
        return enclosure;
      }
    }
    return null;
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as JsonRecord;
  const rawUrl = readUrlLikeValue(candidate, context);
  const url = rawUrl ? canonicalizeMaybeRelativeUrl(rawUrl, context, "enclosure", entryId) : null;
  const typeValue =
    getAttributeValue(candidate, context.aliases, ["type"]) ??
    getRecordValue(candidate, context.aliases, ["type", "mime_type"]);
  const type = typeof typeValue === "string" ? typeValue.trim() : "";

  const rawLength =
    getAttributeValue(candidate, context.aliases, ["length"]) ??
    getRecordValue(candidate, context.aliases, ["length", "size_in_bytes"]) ??
    0;
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

export function coerceMediaContentUrl(value: unknown, context: FeedParseContext, entryId?: string | null): string | null {
  if (Array.isArray(value)) {
    for (const candidate of value) {
      const resolved = coerceMediaContentUrl(candidate, context, entryId);
      if (resolved) {
        return resolved;
      }
    }
    return null;
  }

  const rawUrl = readUrlLikeValue(value, context);
  return rawUrl ? canonicalizeMaybeRelativeUrl(rawUrl, context, "media:content", entryId) : null;
}

export function coerceCategoryStrings(value: unknown, aliases: Map<string, string> = DEFAULT_NAMESPACE_ALIASES): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => coerceCategoryStrings(entry, aliases));
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
    const resolved = key.startsWith("@_")
      ? getAttributeValue(candidate, aliases, [key.slice(2)])
      : getRecordValue(candidate, aliases, [key]);
    if (typeof resolved === "string" && resolved.trim()) {
      return [decodeHtmlEntities(resolved.trim())];
    }
  }

  return [];
}

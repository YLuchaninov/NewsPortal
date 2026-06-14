import type { NormalizedFetchOutcome } from "@signalops/contracts";

import type { ChannelPollCompletion, CursorUpdateInput } from "./fetcher-persistence";
import {
  canonicalizeUrl,
  collapseWhitespace,
  decodeHtmlEntities,
  stripHtmlTags,
} from "./rss";

export class ChannelFetchError extends Error {
  constructor(
    message: string,
    readonly completion: Omit<ChannelPollCompletion, "startedAt" | "finishedAt" | "cursorUpdates"> & {
      cursorUpdates?: CursorUpdateInput[];
    }
  ) {
    super(message);
    this.name = "ChannelFetchError";
  }
}

export function normalizeWhitespace(value: string): string {
  return collapseWhitespace(decodeHtmlEntities(value));
}

export function derivePlaintextLead(summaryHtml: string, bodyHtml: string): string {
  const summaryText = normalizeWhitespace(stripHtmlTags(summaryHtml));
  if (summaryText) {
    return summaryText;
  }

  const bodyText = normalizeWhitespace(stripHtmlTags(bodyHtml));
  if (!bodyText) {
    return "";
  }

  const sentences = bodyText.split(/(?<=[.!?])\s+/).slice(0, 3);
  return collapseWhitespace(sentences.join(" "));
}

export function derivePlaintextBody(contentHtml: string, summaryHtml: string): string {
  const preferred = normalizeWhitespace(stripHtmlTags(contentHtml));
  if (preferred) {
    return preferred;
  }

  return normalizeWhitespace(stripHtmlTags(summaryHtml));
}

export function pickLanguageHint(
  channelLanguage: string | null,
  feedLanguage: string | null
): { lang: string | null; confidence: number | null } {
  const rawHint = channelLanguage ?? feedLanguage;

  if (!rawHint) {
    return {
      lang: null,
      confidence: null
    };
  }

  const normalized = rawHint.toLowerCase();
  if (normalized.startsWith("uk")) {
    return {
      lang: "uk",
      confidence: 0.8
    };
  }
  if (normalized.startsWith("en")) {
    return {
      lang: "en",
      confidence: 0.8
    };
  }

  return {
    lang: normalized.slice(0, 8),
    confidence: 0.5
  };
}

export function deriveTimestampCursorValue(
  latestPublishedAt: string | null,
  responseLastModified: string | null,
  fetchedAt: string
): string {
  return responseLastModified ?? latestPublishedAt ?? fetchedAt;
}

export function getByPath(value: unknown, path: string): unknown {
  if (!path.trim()) {
    return value;
  }

  const segments = path.split(".").map((segment) => segment.trim()).filter(Boolean);
  let current: unknown = value;
  for (const segment of segments) {
    if (Array.isArray(current)) {
      const index = Number.parseInt(segment, 10);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) {
        return undefined;
      }
      current = current[index];
      continue;
    }
    if (current == null || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

export function normalizeExternalUrl(url: string): string {
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return canonicalizeUrl(url);
  }
  return url;
}

export function rawEmailToBody(rawSource: string): string {
  return extractEmailMessageContent(rawSource, { bodyPreference: "text" }).body;
}

export interface ExtractedEmailAttachment {
  filename: string | null;
  contentType: string | null;
  disposition: string | null;
}

export interface ExtractedEmailContent {
  body: string;
  links: string[];
  attachments: ExtractedEmailAttachment[];
}

interface ParsedEmailPart {
  headers: Map<string, string>;
  body: string;
}

function splitEmailHeaders(rawSource: string): ParsedEmailPart {
  const separatorMatch = /\r?\n\r?\n/.exec(rawSource);
  if (!separatorMatch || separatorMatch.index < 0) {
    return {
      headers: new Map(),
      body: rawSource
    };
  }

  const headerText = rawSource.slice(0, separatorMatch.index);
  const bodyOffset = separatorMatch.index + separatorMatch[0].length;
  const unfolded = headerText.replace(/\r?\n[ \t]+/g, " ");
  const headers = new Map<string, string>();
  for (const line of unfolded.split(/\r?\n/)) {
    const colonIndex = line.indexOf(":");
    if (colonIndex <= 0) {
      continue;
    }
    const name = line.slice(0, colonIndex).trim().toLowerCase();
    const value = line.slice(colonIndex + 1).trim();
    if (name) {
      headers.set(name, value);
    }
  }

  return {
    headers,
    body: rawSource.slice(bodyOffset)
  };
}

function readHeaderParameter(headerValue: string | null | undefined, parameterName: string): string | null {
  if (!headerValue) {
    return null;
  }
  const pattern = new RegExp(`${parameterName}\\*?=(?:"([^"]+)"|([^;]+))`, "i");
  const match = pattern.exec(headerValue);
  return (match?.[1] ?? match?.[2] ?? null)?.trim() ?? null;
}

function splitMultipartBody(body: string, boundary: string): ParsedEmailPart[] {
  const marker = `--${boundary}`;
  const parts: ParsedEmailPart[] = [];
  for (const section of body.split(marker).slice(1)) {
    if (section.startsWith("--")) {
      break;
    }
    const trimmed = section.replace(/^\r?\n/, "").replace(/\r?\n$/, "");
    if (!trimmed.trim()) {
      continue;
    }
    parts.push(splitEmailHeaders(trimmed));
  }
  return parts;
}

function decodeEmailPartBody(body: string, encoding: string | null): string {
  const normalizedEncoding = encoding?.trim().toLowerCase() ?? "";
  if (normalizedEncoding === "base64") {
    try {
      return Buffer.from(body.replace(/\s+/g, ""), "base64").toString("utf-8");
    } catch {
      return body;
    }
  }
  if (normalizedEncoding === "quoted-printable") {
    const softLineBreaksRemoved = body.replace(/=\r?\n/g, "");
    return softLineBreaksRemoved.replace(/=([0-9a-f]{2})/gi, (_match, hex: string) =>
      String.fromCharCode(Number.parseInt(hex, 16))
    );
  }
  return body;
}

function collectEmailLeafParts(
  part: ParsedEmailPart,
  output: {
    textBodies: string[];
    htmlBodies: string[];
    attachments: ExtractedEmailAttachment[];
  }
): void {
  const contentType = part.headers.get("content-type") ?? "text/plain";
  const disposition = part.headers.get("content-disposition") ?? null;
  const boundary = readHeaderParameter(contentType, "boundary");
  const normalizedContentType = contentType.split(";")[0]?.trim().toLowerCase() ?? "text/plain";
  const normalizedDisposition = disposition?.split(";")[0]?.trim().toLowerCase() ?? null;
  const filename =
    readHeaderParameter(disposition, "filename") ??
    readHeaderParameter(contentType, "name");

  if (normalizedDisposition === "attachment" || filename) {
    output.attachments.push({
      filename,
      contentType: normalizedContentType || null,
      disposition: normalizedDisposition
    });
    return;
  }

  if (normalizedContentType.startsWith("multipart/") && boundary) {
    for (const child of splitMultipartBody(part.body, boundary)) {
      collectEmailLeafParts(child, output);
    }
    return;
  }

  const decodedBody = decodeEmailPartBody(
    part.body,
    part.headers.get("content-transfer-encoding") ?? null
  );
  if (normalizedContentType === "text/html") {
    output.htmlBodies.push(decodedBody);
    return;
  }
  if (normalizedContentType === "text/plain") {
    output.textBodies.push(decodedBody);
  }
}

function normalizeEmailBodyText(value: string, stripMarkup: boolean): string {
  const withoutActiveContent = value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ");
  return normalizeWhitespace(stripMarkup ? stripHtmlTags(withoutActiveContent) : withoutActiveContent);
}

function extractEmailLinks(value: string): string[] {
  const links = new Set<string>();
  for (const match of value.matchAll(/\bhttps?:\/\/[^\s<>"')]+/gi)) {
    links.add(match[0]);
    if (links.size >= 20) {
      break;
    }
  }
  return [...links];
}

export function extractEmailMessageContent(
  rawSource: string,
  options: { bodyPreference: "text" | "html" }
): ExtractedEmailContent {
  const root = splitEmailHeaders(rawSource);
  const collected = {
    textBodies: [] as string[],
    htmlBodies: [] as string[],
    attachments: [] as ExtractedEmailAttachment[]
  };
  collectEmailLeafParts(root, collected);

  const preferredBodies =
    options.bodyPreference === "html" ? collected.htmlBodies : collected.textBodies;
  const fallbackBodies =
    options.bodyPreference === "html" ? collected.textBodies : collected.htmlBodies;
  const rawBody = [...preferredBodies, ...fallbackBodies].find((value) => value.trim()) ?? root.body;
  const body = normalizeEmailBodyText(rawBody, true);

  return {
    body,
    links: extractEmailLinks([rawBody, ...collected.htmlBodies, ...collected.textBodies].join("\n")),
    attachments: collected.attachments.slice(0, 20)
  };
}

export function parseRetryAfterSeconds(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const numericValue = Number.parseInt(value, 10);
  if (Number.isInteger(numericValue) && numericValue >= 0) {
    return numericValue;
  }

  const dateValue = new Date(value);
  if (Number.isNaN(dateValue.getTime())) {
    return null;
  }

  return Math.max(0, Math.ceil((dateValue.getTime() - Date.now()) / 1000));
}

export function classifyHttpFailure(status: number): NormalizedFetchOutcome {
  if (status === 429) {
    return "rate_limited";
  }
  if (status >= 500 || status === 408) {
    return "transient_failure";
  }
  return "hard_failure";
}

export function classifyUnexpectedFailure(message: string): NormalizedFetchOutcome {
  const normalized = message.toLowerCase();
  if (
    normalized.includes("timeout") ||
    normalized.includes("timed out") ||
    normalized.includes("econn") ||
    normalized.includes("socket") ||
    normalized.includes("network")
  ) {
    return "transient_failure";
  }
  if (normalized.includes("rate limit") || normalized.includes("too many requests")) {
    return "rate_limited";
  }
  return "hard_failure";
}

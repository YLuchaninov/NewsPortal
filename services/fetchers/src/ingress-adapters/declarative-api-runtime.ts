import type { parseApiChannelConfig } from "@newsportal/contracts";

import {
  getByPath,
  normalizeExternalUrl,
  normalizeWhitespace,
} from "../fetcher-channel-helpers";

type ApiChannelConfig = ReturnType<typeof parseApiChannelConfig>;

export interface DeclarativeApiPageResult {
  payload: unknown;
  finalUrl: string;
  status: number;
  retryAfterSeconds: number | null;
}

export interface DeclarativeApiMappedItem {
  externalArticleId: string;
  url: string;
  publishedAt: string;
  title: string;
  lead: string;
  body: string;
  lang: string | null;
  rawPayload: Record<string, unknown>;
}

export interface DeclarativeApiRuntimeResult {
  items: DeclarativeApiMappedItem[];
  fetchedItemCount: number;
  latestPublishedAt: string | null;
  nextPageCursorValue: string | null;
  lastStatus: number | null;
  lastRetryAfterSeconds: number | null;
  diagnostics: Array<Record<string, unknown>>;
}

function buildPagedUrl(rawUrl: string, pageParam: string, pageNumber: number): string {
  const url = new URL(rawUrl);
  url.searchParams.set(pageParam, String(pageNumber));
  return url.toString();
}

function buildCursorUrl(rawUrl: string, cursorParam: string, cursorValue: string | null): string {
  if (!cursorValue) {
    return rawUrl;
  }
  const url = new URL(rawUrl);
  url.searchParams.set(cursorParam, cursorValue);
  return url.toString();
}

function resolveApiItemUrl(rawUrl: string, baseUrl: string): string {
  return normalizeExternalUrl(new URL(rawUrl, baseUrl).toString());
}

function interpolateUrlTemplate(template: string, record: Record<string, unknown>): string {
  return template.replace(/\{([^{}]+)\}/g, (_match, rawPath: string) => {
    const value = getByPath(record, String(rawPath).trim());
    return encodeURIComponent(String(value ?? "").trim());
  });
}

function getByFirstPath(record: Record<string, unknown>, path: string | string[]): unknown {
  const paths = Array.isArray(path) ? path : [path];
  for (const candidate of paths) {
    const value = getVirtualField(record, candidate) ?? getByPath(record, candidate);
    if (value != null && String(value).trim() !== "") {
      return value;
    }
  }
  return undefined;
}

function getVirtualField(record: Record<string, unknown>, path: string): unknown {
  if (path === "firstDocumentUrl") {
    return firstStringFrom(record, [
      "document.url",
      "document.href",
      "documents.0.url",
      "documents.0.href",
      "attachments.0.url",
      "attachments.0.href",
      "files.0.url",
      "links.documents.0.url",
    ]);
  }
  if (path === "firstItemUrl") {
    return firstStringFrom(record, ["url", "href", "link", "links.0.url", "items.0.url", "detail.url", "detail.href"]);
  }
  if (path === "firstIssuerName") {
    return firstStringFrom(record, [
      "issuer.name",
      "issuer",
      "owner.name",
      "owner",
      "buyer.name",
      "buyer",
      "entity.name",
      "organization.name",
    ]);
  }
  return undefined;
}

function firstStringFrom(record: Record<string, unknown>, paths: string[]): string | undefined {
  for (const path of paths) {
    const value = getByPath(record, path);
    if (value != null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return undefined;
}

export async function executeDeclarativeApiRuntime(input: {
  fetchUrl: string;
  apiConfig: ApiChannelConfig;
  fetchedAt: string;
  limit: number;
  initialPageCursorValue?: string | null;
  channelLanguage?: string | null;
  fetchPage: (url: string, pageIndex: number) => Promise<DeclarativeApiPageResult>;
  resolveNextUrl?: (rawUrl: string, baseUrl: string) => Promise<string | null>;
}): Promise<DeclarativeApiRuntimeResult> {
  const items: DeclarativeApiMappedItem[] = [];
  let fetchedItemCount = 0;
  let latestPublishedAt: string | null = null;
  let lastStatus: number | null = null;
  let lastRetryAfterSeconds: number | null = null;
  let nextPageCursorValue: string | null = null;
  let nextRequestUrl =
    input.apiConfig.pagination.mode === "next_url" && input.initialPageCursorValue
      ? input.initialPageCursorValue
      : input.fetchUrl;
  let nextCursorValue =
    input.apiConfig.pagination.mode === "cursor"
      ? input.initialPageCursorValue ?? null
      : null;
  let nextPageNumber =
    input.apiConfig.pagination.mode === "page"
      ? Number(input.initialPageCursorValue ?? input.apiConfig.pagination.pageStart)
      : input.apiConfig.pagination.pageStart;
  if (!Number.isInteger(nextPageNumber) || nextPageNumber <= 0) {
    nextPageNumber = input.apiConfig.pagination.pageStart;
  }
  const diagnostics: Array<Record<string, unknown>> = [];

  for (let pageIndex = 0; pageIndex < input.apiConfig.pagination.maxPagesPerPoll; pageIndex += 1) {
    const pageUrl =
      input.apiConfig.pagination.mode === "page"
        ? buildPagedUrl(nextRequestUrl, input.apiConfig.pagination.pageParam, nextPageNumber)
        : input.apiConfig.pagination.mode === "cursor"
          ? buildCursorUrl(input.fetchUrl, input.apiConfig.pagination.cursorParam, nextCursorValue)
          : nextRequestUrl;
    const page = await input.fetchPage(pageUrl, pageIndex);
    lastStatus = page.status;
    lastRetryAfterSeconds = page.retryAfterSeconds;
    const itemsCandidate = getByPath(page.payload, input.apiConfig.itemsPath);
    const pageItems = Array.isArray(itemsCandidate)
      ? itemsCandidate
      : Array.isArray(page.payload)
        ? page.payload
        : [];
    fetchedItemCount += pageItems.length;
    diagnostics.push({
      level: "info",
      message: `Fetched declarative API page ${pageIndex + 1}.`,
      itemCount: pageItems.length,
      paginationMode: input.apiConfig.pagination.mode,
    });

    for (const item of pageItems) {
      if (items.length >= input.limit) {
        break;
      }
      const record = (item ?? {}) as Record<string, unknown>;
      const rawFieldUrl = String(getByFirstPath(record, input.apiConfig.urlField) ?? "").trim();
      const rawUrl =
        rawFieldUrl ||
        (input.apiConfig.urlTemplate
          ? interpolateUrlTemplate(input.apiConfig.urlTemplate, record)
          : "");
      if (!rawUrl) {
        continue;
      }
      const publishedAt = String(getByFirstPath(record, input.apiConfig.publishedAtField) ?? input.fetchedAt);
      const documentUrl = String(getVirtualField(record, "firstDocumentUrl") ?? "").trim() || null;
      const issuerOrOwner = String(getVirtualField(record, "firstIssuerName") ?? "").trim() || null;
      latestPublishedAt = (latestPublishedAt ?? "") > publishedAt ? latestPublishedAt : publishedAt;
      items.push({
        externalArticleId:
          String(getByFirstPath(record, input.apiConfig.externalIdField) ?? rawUrl).trim() || rawUrl,
        url: resolveApiItemUrl(rawUrl, page.finalUrl),
        publishedAt,
        title: normalizeWhitespace(String(getByFirstPath(record, input.apiConfig.titleField) ?? "Untitled article")),
        lead: normalizeWhitespace(String(getByFirstPath(record, input.apiConfig.leadField) ?? "")),
        body: normalizeWhitespace(String(getByFirstPath(record, input.apiConfig.bodyField) ?? "")),
        lang:
          String(getByFirstPath(record, input.apiConfig.languageField) ?? input.channelLanguage ?? "").trim() ||
          null,
        rawPayload: {
          fetcher: "api",
          fetchedAt: input.fetchedAt,
          pageIndex,
          sourceItem: record,
          itemObservation: {
            title: normalizeWhitespace(String(getByFirstPath(record, input.apiConfig.titleField) ?? "Untitled article")),
            source_url: input.fetchUrl,
            item_url: resolveApiItemUrl(rawUrl, page.finalUrl),
            document_url: documentUrl,
            issuer_or_owner: issuerOrOwner,
            published_at: publishedAt,
            deadline_or_end_date: firstStringFrom(record, ["deadline", "deadlineAt", "endDate", "closingDate", "expiresAt"]) ?? null,
            body_or_scope: normalizeWhitespace(String(getByFirstPath(record, input.apiConfig.bodyField) ?? "")),
            evidence_snippets: [
              normalizeWhitespace(String(getByFirstPath(record, input.apiConfig.titleField) ?? "")),
              normalizeWhitespace(String(getByFirstPath(record, input.apiConfig.leadField) ?? "")),
            ].filter(Boolean),
            language: String(getByFirstPath(record, input.apiConfig.languageField) ?? input.channelLanguage ?? "").trim() || null,
            geo: firstStringFrom(record, ["geo", "location", "country", "region"]) ?? null,
            raw_payload_json: record,
            source_scope_artifact_id: null,
            source_understanding_artifact_id: null,
          },
        },
      });
    }

    if (input.apiConfig.pagination.mode === "none" || items.length >= input.limit) {
      break;
    }
    if (input.apiConfig.pagination.mode === "page") {
      nextPageNumber += 1;
      nextPageCursorValue = String(nextPageNumber);
      nextRequestUrl = input.fetchUrl;
      continue;
    }
    if (input.apiConfig.pagination.mode === "cursor") {
      const cursorValue = String(getByPath(page.payload, input.apiConfig.pagination.cursorPath) ?? "").trim();
      if (!cursorValue) {
        nextPageCursorValue = null;
        break;
      }
      nextPageCursorValue = cursorValue;
      nextCursorValue = cursorValue;
      nextRequestUrl = buildCursorUrl(input.fetchUrl, input.apiConfig.pagination.cursorParam, cursorValue);
      continue;
    }
    const nextUrlValue = String(getByPath(page.payload, input.apiConfig.pagination.nextUrlPath) ?? "").trim();
    if (!nextUrlValue) {
      nextPageCursorValue = null;
      break;
    }
    nextRequestUrl = input.resolveNextUrl
      ? (await input.resolveNextUrl(nextUrlValue, page.finalUrl)) ?? ""
      : new URL(nextUrlValue, page.finalUrl).toString();
    if (!nextRequestUrl) {
      nextPageCursorValue = null;
      break;
    }
    nextPageCursorValue = nextRequestUrl;
  }

  return {
    items,
    fetchedItemCount: Math.min(fetchedItemCount, input.limit),
    latestPublishedAt,
    nextPageCursorValue,
    lastStatus,
    lastRetryAfterSeconds,
    diagnostics,
  };
}

import { RESOURCE_KINDS, type ResourceKind } from "@newsportal/contracts";

import { collapseWhitespace, decodeHtmlEntities, stripHtmlTags } from "./rss";

const DATE_PATH_PATTERN = /\/20\d{2}\/\d{2}\/\d{2}\//;
const DOWNLOAD_EXTENSION_PATTERN = /\.(pdf|csv|xlsx|xls|json|xml|zip)(?:$|\?)/i;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeText(value: string): string {
  return collapseWhitespace(decodeHtmlEntities(stripHtmlTags(value)));
}

function pathContainsSegment(pathname: string, segments: readonly string[]): boolean {
  const expression = new RegExp(
    `(?:^|/)(?:${segments.map((segment) => escapeRegExp(segment)).join("|")})(?:/|$)`,
    "i"
  );
  return expression.test(pathname);
}

function inferResourceKindsFromPath(pathname: string): ResourceKind[] {
  const lowerPath = pathname.toLowerCase();
  const segments = lowerPath.split("/").filter(Boolean);
  const depth = segments.length;
  const lastSegment = segments.at(-1) ?? "";
  const collectionEditorialSegments = new Set([
    "changelog",
    "release-notes",
    "release-note",
    "announcements",
    "announcement",
    "press-releases",
    "press-release",
    "newsroom",
    "updates",
    "update",
  ]);
  const editorialSegments = new Set([
    "news",
    "blog",
    "blogs",
    "article",
    "articles",
    "story",
    "stories",
    "post",
    "posts",
  ]);
  if (DOWNLOAD_EXTENSION_PATTERN.test(lowerPath)) {
    if (/\.(csv|xlsx|xls|json|xml|zip)(?:$|\?)/i.test(lowerPath)) {
      return ["data_file"];
    }
    return ["document"];
  }
  if (pathContainsSegment(lowerPath, [
    "changelog",
    "release-notes",
    "release-note",
    "announcements",
    "announcement",
    "press-releases",
    "press-release",
    "newsroom",
    "updates",
    "update",
  ])) {
    if (
      DATE_PATH_PATTERN.test(lowerPath) ||
      (depth >= 2 && !collectionEditorialSegments.has(lastSegment)) ||
      /-\d{4,}$/.test(lastSegment)
    ) {
      return ["editorial"];
    }
    return ["listing"];
  }
  if (pathContainsSegment(lowerPath, [
    "search",
    "category",
    "categories",
    "tag",
    "tags",
    "browse",
    "archive",
    "archives",
    "list",
    "lists",
    "directory",
    "directories",
  ])) {
    return ["listing"];
  }
  if (pathContainsSegment(lowerPath, [
    "news",
    "blog",
    "blogs",
    "article",
    "articles",
    "story",
    "stories",
    "post",
    "posts",
  ])) {
    if (
      DATE_PATH_PATTERN.test(lowerPath) ||
      (depth >= 2 && !editorialSegments.has(lastSegment)) ||
      /[-_][a-z0-9]{5,}/i.test(lastSegment)
    ) {
      return ["editorial"];
    }
    return ["listing"];
  }
  if (pathContainsSegment(lowerPath, [
    "product",
    "products",
    "job",
    "jobs",
    "dataset",
    "datasets",
    "company",
    "companies",
    "profile",
    "profiles",
    "person",
    "people",
    "detail",
    "details",
  ])) {
    return ["entity"];
  }
  if (DATE_PATH_PATTERN.test(lowerPath)) {
    return ["editorial"];
  }
  return ["unknown"];
}

export function inferResourceKindsFromUrl(rawUrl: string): ResourceKind[] {
  try {
    return inferResourceKindsFromPath(new URL(rawUrl).pathname);
  } catch {
    return ["unknown"];
  }
}

export function classifyResourceCandidate(input: {
  url: string;
  title?: string | null;
  summary?: string | null;
  hintedKinds?: readonly ResourceKind[];
  overrideKinds?: readonly ResourceKind[];
  structuredTypes?: readonly string[];
  hasRepeatedCards?: boolean;
  hasPagination?: boolean;
  hasDownloads?: boolean;
  publishedAtHint?: string | null;
  discoverySource?: string | null;
}): { kind: ResourceKind; confidence: number; reasons: string[] } {
  const scores = new Map<ResourceKind, number>(RESOURCE_KINDS.map((kind) => [kind, 0]));
  const reasons: string[] = [];
  const titleText = normalizeText(input.title ?? "");
  const summaryText = normalizeText(input.summary ?? "");
  const combinedText = `${titleText} ${summaryText}`.trim();
  const hintedKinds = (input.hintedKinds ?? []).filter((kind) => kind !== "unknown");
  const editorialHinted = hintedKinds.includes("editorial");
  const listingHinted = hintedKinds.includes("listing");
  const hasEditorialStructuredType = (input.structuredTypes ?? []).some((structuredType) =>
    /(newsarticle|article|blogposting)/i.test(structuredType)
  );
  const detailLikeEditorialSignals =
    editorialHinted &&
    !listingHinted &&
    (Boolean(input.publishedAtHint) ||
      titleText.length >= 24 ||
      summaryText.length >= 80 ||
      hasEditorialStructuredType);
  for (const kind of hintedKinds) {
    scores.set(kind, (scores.get(kind) ?? 0) + 3);
    reasons.push(`hint:${kind}`);
  }
  for (const kind of (input.overrideKinds ?? []).filter((candidate) => candidate !== "unknown")) {
    scores.set(kind, (scores.get(kind) ?? 0) + 5);
    reasons.push(`override:${kind}`);
  }

  for (const structuredType of input.structuredTypes ?? []) {
    const normalized = structuredType.toLowerCase();
    if (/(newsarticle|article|blogposting)/.test(normalized)) {
      scores.set("editorial", (scores.get("editorial") ?? 0) + 4);
      reasons.push(`structured:${structuredType}`);
    }
    if (/(itemlist|collectionpage|searchresultspage)/.test(normalized)) {
      scores.set("listing", (scores.get("listing") ?? 0) + 4);
      reasons.push(`structured:${structuredType}`);
    }
    if (/(product|dataset|jobposting|organization|person)/.test(normalized)) {
      scores.set("entity", (scores.get("entity") ?? 0) + 4);
      reasons.push(`structured:${structuredType}`);
    }
  }

  if (input.hasRepeatedCards) {
    scores.set("listing", (scores.get("listing") ?? 0) + (detailLikeEditorialSignals ? 1 : 3));
    reasons.push(detailLikeEditorialSignals ? "layout:repeated_cards_ambient" : "layout:repeated_cards");
  }
  if (input.hasPagination) {
    scores.set("listing", (scores.get("listing") ?? 0) + (detailLikeEditorialSignals ? 1 : 2));
    reasons.push(detailLikeEditorialSignals ? "layout:pagination_ambient" : "layout:pagination");
  }
  if (input.hasDownloads) {
    scores.set("document", (scores.get("document") ?? 0) + 1);
    scores.set("data_file", (scores.get("data_file") ?? 0) + 1);
    reasons.push("layout:downloads");
  }
  if (editorialHinted && !listingHinted && titleText.length >= 24) {
    scores.set("editorial", (scores.get("editorial") ?? 0) + 2);
    reasons.push("path:editorial_detail");
  }
  if (input.publishedAtHint) {
    scores.set("editorial", (scores.get("editorial") ?? 0) + 3);
    reasons.push("signal:published_at");
  }
  if (titleText.length >= 24 && summaryText.length >= 80) {
    scores.set("editorial", (scores.get("editorial") ?? 0) + 2);
    reasons.push("signal:title_summary");
  }
  if (
    input.discoverySource === "collection_page" &&
    input.hasRepeatedCards &&
    titleText.length >= 20 &&
    (Boolean(input.publishedAtHint) || summaryText.length >= 80)
  ) {
    scores.set("editorial", (scores.get("editorial") ?? 0) + 3);
    reasons.push("collection:article_card");
  }
  if (/\b(press release|announc(?:e|es|ing)|statement|policy update|launch(?:es|ed)?|introduc(?:e|es|ed)|what'?s new)\b/i.test(combinedText)) {
    scores.set("editorial", (scores.get("editorial") ?? 0) + 2);
    reasons.push("text:editorial");
  }
  if (/\b(changelog|release notes|release note|all updates|latest news|archive)\b/i.test(combinedText)) {
    scores.set("listing", (scores.get("listing") ?? 0) + 2);
    reasons.push("text:listing");
  }
  if (/\b(procurement|tender|request for proposal|rfp|invitation to bid|bid notice|call for tender)\b/i.test(combinedText)) {
    scores.set("listing", (scores.get("listing") ?? 0) + 2);
    scores.set("document", (scores.get("document") ?? 0) + 1);
    reasons.push("text:procurement");
  }
  if (
    detailLikeEditorialSignals &&
    input.discoverySource !== "collection_page" &&
    (Boolean(input.publishedAtHint) || summaryText.length >= 80)
  ) {
    scores.set("editorial", (scores.get("editorial") ?? 0) + 2);
    reasons.push("detail:editorial_page");
  }

  const candidates = Array.from(scores.entries()).sort((left, right) => right[1] - left[1]);
  const top = candidates[0] ?? ["unknown", 0];
  const second = candidates[1] ?? ["unknown", 0];
  const kind = (top[0] as ResourceKind) || "unknown";
  const margin = Math.max(0, top[1] - second[1]);
  const confidence = top[1] <= 0 ? 0.2 : Math.min(0.95, 0.35 + margin * 0.15 + top[1] * 0.05);
  return {
    kind: confidence < 0.45 ? "unknown" : kind,
    confidence: Number(confidence.toFixed(2)),
    reasons: reasons.slice(0, 6),
  };
}

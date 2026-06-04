import type { ResourceKind } from "@signalops/contracts";

import {
  asArray,
  asRecord,
  normalizeText,
  readOptionalString,
} from "./resource-enrichment-extraction";

interface EditorialExtractorDecision {
  shouldInvoke: boolean;
  reason: "short_body" | "missing_title" | "missing_summary" | "missing_published_at" | "not_needed";
}

export function extractDiscoveryClassification(
  classificationJson: Record<string, unknown>
): {
  kind: string;
  confidence: number | null;
  reasons: string[];
  hintedKinds: string[];
  discoverySource: string | null;
} {
  const nestedDiscovery = asRecord(classificationJson.discovery);
  const discoverySource =
    readOptionalString(nestedDiscovery.discoverySource) ??
    readOptionalString(asRecord(classificationJson.observability).discoverySource) ??
    null;
  const confidenceValue =
    typeof nestedDiscovery.confidence === "number" && Number.isFinite(nestedDiscovery.confidence)
      ? nestedDiscovery.confidence
      : typeof classificationJson.confidence === "number" && Number.isFinite(classificationJson.confidence)
      ? (classificationJson.confidence as number)
      : null;
  const reasonsSource = asArray(nestedDiscovery.reasons ?? classificationJson.reasons)
    .map((value) => readOptionalString(value))
    .filter((value): value is string => Boolean(value));
  const hintedKinds = asArray(nestedDiscovery.hintedKinds ?? classificationJson.hintedKinds)
    .map((value) => readOptionalString(value))
    .filter((value): value is string => Boolean(value));
  return {
    kind: readOptionalString(nestedDiscovery.kind) ?? readOptionalString(classificationJson.kind) ?? "unknown",
    confidence: confidenceValue,
    reasons: reasonsSource,
    hintedKinds,
    discoverySource,
  };
}

export function resolveEditorialExtractorDecision(input: {
  baseBody: string;
  title: string | null;
  summary: string | null;
  publishedAt: string | null;
  minEditorialBodyLength: number;
}): EditorialExtractorDecision {
  if (input.baseBody.length < input.minEditorialBodyLength) {
    return { shouldInvoke: true, reason: "short_body" };
  }
  if (!readOptionalString(input.title)) {
    return { shouldInvoke: true, reason: "missing_title" };
  }
  if (!readOptionalString(input.summary)) {
    return { shouldInvoke: true, reason: "missing_summary" };
  }
  if (!readOptionalString(input.publishedAt)) {
    return { shouldInvoke: true, reason: "missing_published_at" };
  }
  return { shouldInvoke: false, reason: "not_needed" };
}

export function buildWebsiteResourceClassificationJson(input: {
  priorClassificationJson: Record<string, unknown>;
  enrichmentClassification: {
    kind: ResourceKind;
    confidence: number;
    reasons: string[];
  };
  resolvedKind: ResourceKind;
  structuredTypes: string[];
  hintedKinds: ResourceKind[];
  reasonSource: "discovery" | "enrichment" | "stored_kind_fallback";
  resolutionReasons?: string[];
}): Record<string, unknown> {
  const discovery = extractDiscoveryClassification(input.priorClassificationJson);
  const discoveryKind = discovery.kind || "unknown";
  const resolutionReasons = asArray(input.resolutionReasons)
    .map((value) => readOptionalString(value))
    .filter((value): value is string => Boolean(value));
  const topLevelConfidence =
    input.reasonSource === "discovery"
      ? (discovery.confidence ?? input.enrichmentClassification.confidence)
      : input.enrichmentClassification.confidence;
  const topLevelReasons =
    input.reasonSource === "stored_kind_fallback"
      ? [...input.enrichmentClassification.reasons, "fallback:stored_kind", ...resolutionReasons]
      : input.reasonSource === "discovery"
      ? [...discovery.reasons, ...resolutionReasons]
      : [...input.enrichmentClassification.reasons, ...resolutionReasons];
  return {
    kind: input.resolvedKind,
    confidence: topLevelConfidence,
    reasons: Array.from(new Set(topLevelReasons)),
    hintedKinds: input.hintedKinds,
    discovery: {
      kind: discoveryKind,
      confidence: discovery.confidence,
      reasons: discovery.reasons,
      hintedKinds: discovery.hintedKinds,
      discoverySource: discovery.discoverySource,
    },
    enrichment: {
      kind: input.enrichmentClassification.kind,
      confidence: input.enrichmentClassification.confidence,
      reasons: input.enrichmentClassification.reasons,
      hintedKinds: input.hintedKinds,
      structuredTypes: input.structuredTypes,
    },
    resolved: {
      kind: input.resolvedKind,
      confidence: topLevelConfidence,
      reasonSource: input.reasonSource,
      reasons: resolutionReasons,
    },
    transition: {
      kindChanged: discoveryKind !== input.resolvedKind,
      fromKind: discoveryKind,
      toKind: input.resolvedKind,
      reasonSource: input.reasonSource,
    },
  };
}

function hasEditorialStructuredType(structuredTypes: readonly string[]): boolean {
  return structuredTypes.some((structuredType) => /(newsarticle|article|blogposting)/i.test(structuredType));
}

export function shouldRetainDiscoveryEditorialKind(input: {
  discoveryKind: string;
  enrichmentKind: ResourceKind;
  hintedKinds: ResourceKind[];
  structuredTypes: string[];
  publishedAt: string | null;
  title: string | null;
  summary: string | null;
  bodyText: string | null;
  hasRepeatedCards: boolean;
  hasPagination: boolean;
}): boolean {
  if (input.discoveryKind !== "editorial" || input.enrichmentKind !== "listing") {
    return false;
  }

  const editorialSignals = [
    input.hintedKinds.includes("editorial"),
    hasEditorialStructuredType(input.structuredTypes),
    Boolean(readOptionalString(input.publishedAt)),
    normalizeText(input.title ?? "").length >= 24,
    normalizeText(input.summary ?? "").length >= 80 || normalizeText(input.bodyText ?? "").length >= 500,
  ].filter(Boolean).length;

  const listingSignals = [
    input.hintedKinds.includes("listing") && !input.hintedKinds.includes("editorial"),
    input.hasRepeatedCards,
    input.hasPagination,
  ].filter(Boolean).length;

  return editorialSignals >= 3 && editorialSignals > listingSignals;
}

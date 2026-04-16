import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWebsiteResourceClassificationJson,
  resolveEditorialExtractorDecision,
  shouldRetainDiscoveryEditorialKind,
} from "../../../services/fetchers/src/resource-enrichment.ts";

test("resolveEditorialExtractorDecision invokes extractor for materially incomplete base editorial content", () => {
  assert.deepEqual(
    resolveEditorialExtractorDecision({
      baseBody: "Short body",
      title: "EU policy update",
      summary: "Summary",
      publishedAt: "2026-04-15T12:00:00Z",
      minEditorialBodyLength: 200,
    }),
    {
      shouldInvoke: true,
      reason: "short_body",
    }
  );

  assert.deepEqual(
    resolveEditorialExtractorDecision({
      baseBody: "Long enough ".repeat(30),
      title: "EU policy update",
      summary: "",
      publishedAt: "2026-04-15T12:00:00Z",
      minEditorialBodyLength: 120,
    }),
    {
      shouldInvoke: true,
      reason: "missing_summary",
    }
  );
});

test("resolveEditorialExtractorDecision skips extractor when base editorial content is already strong", () => {
  assert.deepEqual(
    resolveEditorialExtractorDecision({
      baseBody: "Strong editorial body ".repeat(40),
      title: "EU policy update",
      summary: "Already usable summary",
      publishedAt: "2026-04-15T12:00:00Z",
      minEditorialBodyLength: 120,
    }),
    {
      shouldInvoke: false,
      reason: "not_needed",
    }
  );
});

test("buildWebsiteResourceClassificationJson preserves discovery truth and records enrichment transitions", () => {
  const classification = buildWebsiteResourceClassificationJson({
    priorClassificationJson: {
      kind: "listing",
      confidence: 0.62,
      reasons: ["path:listing"],
      hintedKinds: ["listing"],
      discovery: {
        kind: "listing",
        confidence: 0.62,
        reasons: ["path:listing"],
        hintedKinds: ["listing"],
        discoverySource: "collection_page",
      },
    },
    enrichmentClassification: {
      kind: "editorial",
      confidence: 0.88,
      reasons: ["structured:Article"],
    },
    resolvedKind: "editorial",
    structuredTypes: ["Article"],
    hintedKinds: ["editorial"],
    reasonSource: "enrichment",
  });

  assert.equal(classification.kind, "editorial");
  assert.deepEqual(classification.discovery, {
    kind: "listing",
    confidence: 0.62,
    reasons: ["path:listing"],
    hintedKinds: ["listing"],
    discoverySource: "collection_page",
  });
  assert.deepEqual(classification.transition, {
    kindChanged: true,
    fromKind: "listing",
    toKind: "editorial",
    reasonSource: "enrichment",
  });
  assert.deepEqual(classification.enrichment, {
    kind: "editorial",
    confidence: 0.88,
    reasons: ["structured:Article"],
    hintedKinds: ["editorial"],
    structuredTypes: ["Article"],
  });
});

test("shouldRetainDiscoveryEditorialKind keeps strong article-like detail pages editorial despite listing-biased layout noise", () => {
  assert.equal(
    shouldRetainDiscoveryEditorialKind({
      discoveryKind: "editorial",
      enrichmentKind: "listing",
      hintedKinds: ["editorial"],
      structuredTypes: ["WebPage"],
      publishedAt: "2026-04-16T12:00:00Z",
      title: "EU policy package reaches final approval",
      summary:
        "The final package includes implementation guidance, deadlines, and a summary of the last negotiation round.",
      bodyText: "Detailed article body ".repeat(40),
      hasRepeatedCards: true,
      hasPagination: true,
    }),
    true
  );
});

test("buildWebsiteResourceClassificationJson can record an editorial-retention guard without losing discovery truth", () => {
  const classification = buildWebsiteResourceClassificationJson({
    priorClassificationJson: {
      kind: "editorial",
      confidence: 0.78,
      reasons: ["path:editorial_detail"],
      hintedKinds: ["editorial"],
      discovery: {
        kind: "editorial",
        confidence: 0.78,
        reasons: ["path:editorial_detail"],
        hintedKinds: ["editorial"],
        discoverySource: "collection_page",
      },
    },
    enrichmentClassification: {
      kind: "listing",
      confidence: 0.74,
      reasons: ["layout:repeated_cards", "layout:pagination"],
    },
    resolvedKind: "editorial",
    structuredTypes: ["WebPage"],
    hintedKinds: ["editorial"],
    reasonSource: "discovery",
    resolutionReasons: ["guard:retain_editorial_detail"],
  });

  assert.equal(classification.kind, "editorial");
  assert.deepEqual(classification.transition, {
    kindChanged: false,
    fromKind: "editorial",
    toKind: "editorial",
    reasonSource: "discovery",
  });
  assert.deepEqual(classification.resolved, {
    kind: "editorial",
    confidence: 0.78,
    reasonSource: "discovery",
    reasons: ["guard:retain_editorial_detail"],
  });
  assert.ok((classification.reasons as string[]).includes("guard:retain_editorial_detail"));
});

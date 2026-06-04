import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWebsiteResourceClassificationJson,
  resolveEditorialExtractorDecision,
  shouldRetainDiscoveryEditorialKind,
} from "../../../services/fetchers/src/resource-enrichment.ts";
import { extractPdfDocument } from "../../../services/fetchers/src/resource-pdf-extraction.ts";

function bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function textPdfFixture(): Uint8Array {
  return bytes(`%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>
endobj
4 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
5 0 obj
<< /Length 95 >>
stream
BT /F1 24 Tf 72 720 Td (RFP Document Title) Tj 0 -32 Td (Issuer City deadline June 30 2026) Tj ET
endstream
endobj
6 0 obj
<< /Title (Procurement RFP Metadata Title) /CreationDate (D:20260601120000Z) >>
endobj
xref
0 7
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000241 00000 n
0000000311 00000 n
0000000456 00000 n
trailer
<< /Size 7 /Root 1 0 R /Info 6 0 R >>
startxref
548
%%EOF`);
}

function emptyPdfFixture(): Uint8Array {
  return bytes(`%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>
endobj
xref
0 4
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
trailer
<< /Size 4 /Root 1 0 R >>
startxref
190
%%EOF`);
}

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
      reasons: ["structured:SignalCandidate"],
    },
    resolvedKind: "editorial",
    structuredTypes: ["SignalCandidate"],
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
    reasons: ["structured:SignalCandidate"],
    hintedKinds: ["editorial"],
    structuredTypes: ["SignalCandidate"],
  });
});

test("shouldRetainDiscoveryEditorialKind keeps strong signal_candidate-like detail pages editorial despite listing-biased layout noise", () => {
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
      bodyText: "Detailed signal_candidate body ".repeat(40),
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

test("PDF extraction maps text PDFs to bounded document evidence", async () => {
  const result = await extractPdfDocument(textPdfFixture(), {
    fallbackTitle: "fallback.pdf",
    maxPages: 5,
    maxTextChars: 500,
    timeoutMs: 5_000,
  });

  assert.equal(result.status, "extracted");
  assert.equal(result.title, "Procurement RFP Metadata Title");
  assert.match(result.body ?? "", /Issuer City deadline June 30 2026/);
  assert.equal(result.pageCount, 1);
  assert.equal(result.parsedPageCount, 1);
  assert.equal(result.truncated, false);
  assert.equal(result.publishedAt, "2026-06-01T12:00:00.000Z");
  assert.equal(result.parser.name, "pdfjs-dist");
  assert.equal(result.parser.version, "6.0.227");
});

test("PDF extraction keeps image-only or empty PDFs explicit instead of hallucinating text", async () => {
  const result = await extractPdfDocument(emptyPdfFixture(), {
    fallbackTitle: "empty.pdf",
    timeoutMs: 5_000,
  });

  assert.equal(result.status, "skipped");
  assert.equal(result.body, null);
  assert.equal(result.errorReason, "pdf_text_empty_or_image_only");
  assert.equal(result.pageCount, 1);
});

test("PDF extraction rejects oversized PDFs before parsing", async () => {
  const result = await extractPdfDocument(new Uint8Array(32), {
    fallbackTitle: "oversized.pdf",
    maxBytes: 16,
  });

  assert.equal(result.status, "skipped");
  assert.equal(result.errorReason, "pdf_size_exceeds_limit");
  assert.equal(result.truncated, true);
});

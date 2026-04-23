import assert from "node:assert/strict";
import test from "node:test";

import {
  assertFullShippedCoverage,
  buildMcpDocParityMatrix,
  getUntestedShippedEntries,
} from "../../../infra/scripts/lib/mcp-http-doc-parity.mjs";

test("MCP doc-parity matrix separates shipped coverage from deferred planning-doc entries", () => {
  const matrix = buildMcpDocParityMatrix({
    shippedTools: [{ name: "admin.summary.get" }, { name: "channels.create" }],
    shippedResources: [{ uri: "newsportal://admin/summary" }],
    shippedPrompts: [{ name: "sequence.draft" }],
    coveredTools: ["admin.summary.get", "channels.create"],
    coveredResources: ["newsportal://admin/summary"],
    coveredPrompts: ["sequence.draft"],
  });

  assert.equal(getUntestedShippedEntries(matrix).length, 0);
  assert.doesNotThrow(() => assertFullShippedCoverage(matrix));

  const deferredPrompt = matrix.legacy.prompts.find(
    (entry) => entry.name === "system_interest.polish"
  );
  const deferredResource = matrix.legacy.resources.find(
    (entry) => entry.uri === "newsportal://discovery/profiles"
  );
  const nonHttpExample = matrix.legacy.examples.find(
    (entry) => entry.name === "stdio-first local MCP workflow"
  );

  assert.equal(deferredPrompt?.classification, "documented-but-deferred");
  assert.equal(deferredResource?.classification, "documented-but-deferred");
  assert.equal(nonHttpExample?.classification, "not-http-applicable");
});

test("MCP doc-parity matrix reports shipped entries that were not exercised", () => {
  const matrix = buildMcpDocParityMatrix({
    shippedTools: [{ name: "admin.summary.get" }, { name: "channels.create" }],
    shippedResources: [{ uri: "newsportal://admin/summary" }, { uri: "newsportal://channels" }],
    shippedPrompts: [{ name: "sequence.draft" }, { name: "cleanup.guidance" }],
    coveredTools: ["admin.summary.get"],
    coveredResources: ["newsportal://admin/summary"],
    coveredPrompts: ["sequence.draft"],
  });

  const missing = getUntestedShippedEntries(matrix).map(
    (entry) => entry.name ?? entry.uri ?? "unknown"
  );
  assert.deepEqual(missing.sort(), ["channels.create", "cleanup.guidance", "newsportal://channels"]);
  assert.throws(() => assertFullShippedCoverage(matrix), /without coverage/i);
});

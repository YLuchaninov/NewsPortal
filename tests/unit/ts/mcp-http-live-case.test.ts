import assert from "node:assert/strict";
import test from "node:test";

import { LIVE_CASE } from "../../../infra/scripts/test-mcp-http-live.mjs";

test("MCP live recall case stays targeted to high-signal developer domains", () => {
  const recallPolicy = LIVE_CASE.recallPolicy ?? {};
  const seedQueries = LIVE_CASE.recallMission?.seedQueries ?? [];
  const preferredDomains = recallPolicy.preferredDomains ?? [];
  const negativeDomains = recallPolicy.negativeDomains ?? [];

  assert.ok(seedQueries.length >= 4);
  assert.ok(seedQueries.every((query) => String(query).startsWith("site:")));
  assert.ok(preferredDomains.includes("blog.jetbrains.com"));
  assert.ok(preferredDomains.includes("github.blog"));
  assert.ok(preferredDomains.includes("blog.cloudflare.com"));
  assert.ok(negativeDomains.includes("feedspot.com"));
  assert.ok(negativeDomains.includes("rss.app"));
  assert.ok(negativeDomains.includes("wikipedia.org"));
  assert.equal(LIVE_CASE.recallMission?.maxCandidates, 8);
  assert.equal(recallPolicy.minPromotionScore, 0.2);
});

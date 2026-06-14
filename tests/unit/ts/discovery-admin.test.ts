import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { readRuntimeConfig } from "../../../runtime/node/packages/config/src/index.ts";
import { createSignalOpsSdk } from "../../../runtime/node/packages/sdk/src/index.ts";
import * as discoveryBff from "../../../runtime/node/apps/admin/src/pages/bff/admin/discovery.ts";

test("listDiscoveryVNextRecords preserves vNext filters and pagination params", async () => {
  let requestedUrl = "";
  const sdk = createSignalOpsSdk({
    baseUrl: "http://api.example.test",
    fetchImpl: (async (input: RequestInfo | URL) => {
      requestedUrl = String(input);
      return new Response(
        JSON.stringify({
          items: [],
          page: 2,
          pageSize: 12,
          total: 18,
          totalPages: 2,
          hasNext: false,
          hasPrev: true,
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        }
      );
    }) as typeof fetch,
  });

  await sdk.listDiscoveryVNextRecords<Record<string, unknown>>("artifacts", {
    artifactType: "RoutingDecision",
    status: "validated",
    page: 2,
    pageSize: 12,
  });

  assert.equal(
    requestedUrl,
    "http://api.example.test/maintenance/discovery/artifacts?status=validated&artifactType=RoutingDecision&page=2&pageSize=12"
  );
});

test("createDiscoveryVNextRun posts to the vNext runs endpoint", async () => {
  let requestedUrl = "";
  let requestedMethod = "";
  const sdk = createSignalOpsSdk({
    baseUrl: "http://api.example.test",
    fetchImpl: (async (input: RequestInfo | URL, init?: RequestInit) => {
      requestedUrl = String(input);
      requestedMethod = String(init?.method ?? "GET");
      return new Response(JSON.stringify({ vnext_run_id: "run-1" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch,
  });

  await sdk.createDiscoveryVNextRun<Record<string, unknown>>({
    runKind: "full",
    triggerKind: "operator",
    request: {},
    budget: {},
  });

  assert.equal(requestedMethod, "POST");
  assert.equal(requestedUrl, "http://api.example.test/maintenance/discovery/runs");
});

test("Discovery vNext admin BFF exports only the POST action handler", () => {
  assert.equal(typeof discoveryBff.POST, "function");
  assert.equal("buildDiscoveryMissionCreateApiPayload" in discoveryBff, false);
  assert.equal("buildDiscoveryRecallMissionCreateApiPayload" in discoveryBff, false);
  assert.equal("buildDiscoveryCandidateReviewApiPayload" in discoveryBff, false);
});

test("Discovery vNext admin BFF exposes full workflow intents and guarded rollback", async () => {
  const source = await readFile(
    new URL("../../../runtime/node/apps/admin/src/pages/bff/admin/discovery.ts", import.meta.url),
    "utf8"
  );

  for (const intent of [
    "start-run",
    "llm-gateway",
    "start-replay",
    "prepare-rollback",
    "apply-rollback",
  ]) {
    assert.match(source, new RegExp(`intent === ["']${intent}["']`));
  }
  assert.match(source, /actionToken:\s*\{\s*scope:\s*"discovery"\s*\}/);
  assert.match(source, /Confirm destructive rollback before applying it\./);
  assert.match(source, /parseObjectJson\(payload\.requestJson\)/);
  assert.match(source, /parseObjectJson\(payload\.budgetJson/);
});

test("Discovery vNext admin workspace exposes full resources and detail links", async () => {
  const source = await readFile(
    new URL("../../../runtime/node/apps/admin/src/pages/discovery.astro", import.meta.url),
    "utf8"
  );

  for (const title of [
    "Runs",
    "Artifacts",
    "Candidates",
    "Source Inventory",
    "Policies",
    "Adapter Backlog",
    "Replay",
    "Rollback",
    "Run Steps",
    "Query Attempts",
    "LLM Gateway",
    "Monitoring State",
    "Source Observations",
  ]) {
    assert.match(source, new RegExp(`title:\\s*["']${title}["']`));
  }
  assert.match(source, /href=\{`\/discovery\/\$\{panel\.resource\}\/\$\{recordId\(panel, row\)\}`\}/);
  assert.doesNotMatch(source, /Discovery v3|source priors|coverage graph|endpoint promotion/i);
});

test("readRuntimeConfig keeps discovery runtime defaults and quota support", () => {
  const defaults = readRuntimeConfig(
    {
      SIGNALOPS_APP_BASE_URL: "http://127.0.0.1:4321/",
      SIGNALOPS_API_BASE_URL: "http://127.0.0.1:8000",
      GEMINI_MODEL: "legacy-model-placeholder",
    },
    {}
  );
  assert.equal(defaults.discoverySearchProvider, "ddgs");
  assert.equal(defaults.discoveryLlmModel, "legacy-model-placeholder");
  assert.equal(defaults.discoveryMonthlyBudgetCents, 0);
  assert.equal(defaults.llmReviewEnabled, true);
  assert.equal(defaults.llmReviewMonthlyBudgetCents, 0);
  assert.equal(defaults.llmReviewBudgetExhaustAcceptGrayZone, false);

  const overridden = readRuntimeConfig(
    {
      SIGNALOPS_APP_BASE_URL: "http://127.0.0.1:4321/",
      SIGNALOPS_API_BASE_URL: "http://127.0.0.1:8000",
      DISCOVERY_SEARCH_PROVIDER: "stub",
      DISCOVERY_GEMINI_MODEL: "discovery-model-placeholder",
      DISCOVERY_MONTHLY_BUDGET_CENTS: "2500",
      LLM_REVIEW_ENABLED: "0",
      LLM_REVIEW_MONTHLY_BUDGET_CENTS: "900",
      LLM_REVIEW_BUDGET_EXHAUST_ACCEPT_GRAY_ZONE: "1",
    },
    {}
  );
  assert.equal(overridden.discoverySearchProvider, "stub");
  assert.equal(overridden.discoveryLlmModel, "discovery-model-placeholder");
  assert.equal(overridden.discoveryMonthlyBudgetCents, 2500);
  assert.equal(overridden.llmReviewEnabled, false);
  assert.equal(overridden.llmReviewMonthlyBudgetCents, 900);
  assert.equal(overridden.llmReviewBudgetExhaustAcceptGrayZone, true);
});

test("getLlmBudgetSummary uses the maintenance endpoint", async () => {
  let requestedUrl = "";
  const sdk = createSignalOpsSdk({
    baseUrl: "http://api.example.test",
    fetchImpl: (async (input: RequestInfo | URL) => {
      requestedUrl = String(input);
      return new Response(JSON.stringify({ monthlyQuotaReached: false }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch,
  });

  await sdk.getLlmBudgetSummary<Record<string, unknown>>();

  assert.equal(requestedUrl, "http://api.example.test/maintenance/llm-budget-summary");
});

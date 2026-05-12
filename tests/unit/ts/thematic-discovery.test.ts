import assert from "node:assert/strict";
import test from "node:test";

import {
  planAdapterResearch,
  planIndirectTargetChannelsWithPool,
  planIndirectTargets,
  planSourceRoles,
} from "../../../packages/control-plane/src/thematic-discovery.ts";

test("source-role planner exposes non-RSS roles for rare-signal objectives", () => {
  const plan = planSourceRoles({
    objective: "Find hidden project demand in communities and marketplaces",
    rareSignal: true,
  });

  const roles = plan.roles.map((role) => role.sourceRole);
  assert.ok(roles.includes("project_marketplace"));
  assert.ok(roles.includes("ats_job_board"));
  assert.ok(roles.includes("community_search"));
  assert.ok(roles.includes("indirect_aggregator"));
  assert.equal(plan.roles.find((role) => role.sourceRole === "project_marketplace")?.directSelectionInfluence, false);
});

test("adapter research separates official public APIs from restricted platforms", () => {
  const official = planAdapterResearch({
    platforms: ["Stack Exchange", "Remotive"],
    includeResearchOnly: true,
  });
  const restricted = planAdapterResearch({
    platforms: ["Upwork", "LinkedIn"],
    includeResearchOnly: true,
  });

  assert.deepEqual(
    official.candidates.map((candidate) => candidate.accessKind).sort(),
    ["official_free", "official_free"],
  );
  assert.ok(restricted.candidates.some((candidate) => candidate.accessKind === "closed_access"));
  assert.ok(
    restricted.candidates.every((candidate) => candidate.defaultPollingAllowed === false),
  );
});

test("adapter research can exclude research-only candidates for production planning", () => {
  const plan = planAdapterResearch({
    sourceRoles: ["project_marketplace"],
    includeResearchOnly: false,
  });

  assert.equal(plan.candidates.length, 0);
});

test("indirect target planner creates bounded site queries without direct coverage claims", () => {
  const plan = planIndirectTargets({
    platforms: ["upwork.com"],
    queryTerms: ["need developer", "looking for agency"],
    maxQueries: 1,
  });

  assert.equal(plan.queries.length, 1);
  assert.equal(plan.queries[0]?.sourceRole, "indirect_aggregator");
  assert.equal(plan.queries[0]?.directCoverage, false);
  assert.match(String(plan.queries[0]?.query), /site:upwork\.com/);
});

test("indirect target channel planner materializes search adapter rows without mutation", async () => {
  const pool = {
    state: { queries: 0 },
    async query(sql: string, params: unknown[]) {
      this.state.queries += 1;
      assert.match(sql, /from discovery_source_endpoints/);
      assert.deepEqual(params, [2]);
      return {
        rows: [
          {
            endpoint_id: "11111111-1111-4111-8111-111111111111",
            endpoint_url: "search://site%3Aupwork.com%20MVP",
            title: "Indirect",
            description: "site:upwork.com MVP budget",
            evidence_json: {
              indirectAggregator: {
                platform: "upwork.com",
                query: "site:upwork.com MVP budget",
              },
            },
            updated_at: new Date("2026-05-11T10:00:00.000Z"),
          },
        ],
      };
    },
  };

  const plan = await planIndirectTargetChannelsWithPool(pool as never, {
    searchProvider: "searxng_search",
    baseUrl: "https://searx.example",
    maxChannels: 2,
    locale: "en-US",
    timeRange: "month",
  });

  assert.equal(pool.state.queries, 1);
  assert.equal(plan.readyCount, 1);
  assert.equal(plan.bulkOnboardRows.length, 1);
  assert.equal(plan.items[0]?.status, "ready_for_bulk_onboard");
  assert.equal(plan.items[0]?.bulkOnboardRow?.providerType, "api");
  assert.equal(plan.items[0]?.bulkOnboardRow?.adapter?.adapterKey, "searxng_search");
  assert.equal(plan.items[0]?.bulkOnboardRow?.adapter?.searchQuery.directCoverage, false);
});

test("indirect target channel planner defaults to DDGS research bridge", async () => {
  const pool = {
    async query() {
      return {
        rows: [
          {
            endpoint_id: "11111111-1111-4111-8111-111111111111",
            description: "site:upwork.com looking for developer",
            evidence_json: {
              indirectAggregator: {
                platform: "upwork.com",
                query: "site:upwork.com looking for developer",
              },
            },
          },
        ],
      };
    },
  };

  const plan = await planIndirectTargetChannelsWithPool(pool as never, { maxChannels: 1 });

  assert.equal(plan.searchProvider, "ddgs_search");
  assert.equal(plan.readyCount, 1);
  assert.equal(plan.items[0]?.bulkOnboardRow?.adapter?.adapterKey, "ddgs_search");
  assert.equal(plan.items[0]?.bulkOnboardRow?.adapter?.researchMode, "research_only");
  assert.match(String(plan.items[0]?.bulkOnboardRow?.fetchUrl), /\/maintenance\/discovery\/search\/ddgs/);
});

test("indirect target channel planner reports needs_config when SearXNG base URL is absent", async () => {
  const pool = {
    async query() {
      return {
        rows: [
          {
            endpoint_id: "11111111-1111-4111-8111-111111111111",
            description: "site:linkedin.com looking for developer",
            evidence_json: {
              indirectAggregator: {
                platform: "linkedin.com",
                query: "site:linkedin.com looking for developer",
              },
            },
          },
        ],
      };
    },
  };

  const plan = await planIndirectTargetChannelsWithPool(pool as never, {
    searchProvider: "searxng_search",
  });

  assert.equal(plan.readyCount, 0);
  assert.equal(plan.needsConfigCount, 1);
  assert.equal(plan.items[0]?.blocker, "searxng_base_url_required");
});

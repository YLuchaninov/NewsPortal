import assert from "node:assert/strict";
import test from "node:test";

import { DISCOVERY_RUNTIME_CASE_PACKS } from "../../../infra/scripts/lib/discovery-live-example-cases.mjs";
import {
  buildDomainMatrixCaseRuns,
  buildDomainScopedCase,
  determineDomainMatrixVerdicts,
  getRuntimeDomainMatrixTargets,
  summarizeDomainCaseRun,
} from "../../../infra/scripts/lib/discovery-live-domain-matrix.mjs";

const exampleA = DISCOVERY_RUNTIME_CASE_PACKS.find((item) => item.key === "example_a_job_board");
const exampleB = DISCOVERY_RUNTIME_CASE_PACKS.find((item) => item.key === "example_b_dev_news");
const exampleC = DISCOVERY_RUNTIME_CASE_PACKS.find((item) => item.key === "example_c_outsourcing");

test("runtime case packs expose exactly three domain matrix targets for A/B/C", () => {
  assert.ok(exampleA);
  assert.ok(exampleB);
  assert.ok(exampleC);
  assert.deepEqual(getRuntimeDomainMatrixTargets(exampleA!).map((item) => item.domain), [
    "hnrss.org",
    "weworkremotely.com",
    "remoteok.com",
  ]);
  assert.deepEqual(getRuntimeDomainMatrixTargets(exampleB!).map((item) => item.domain), [
    "infoq.com",
    "github.blog",
    "blog.cloudflare.com",
  ]);
  assert.deepEqual(getRuntimeDomainMatrixTargets(exampleC!).map((item) => item.domain), [
    "sam.gov",
    "ted.europa.eu",
    "contractsfinder.service.gov.uk",
  ]);

  const matrixRuns = buildDomainMatrixCaseRuns(DISCOVERY_RUNTIME_CASE_PACKS);
  assert.equal(matrixRuns.length, 9);
  assert.equal(new Set(matrixRuns.map((item) => `${item.parentCaseKey}:${item.domain}`)).size, 9);
});

test("domain-scoped cases keep profile identity while narrowing benchmark and seeds", () => {
  assert.ok(exampleB);
  const scoped = buildDomainScopedCase(exampleB!, { domain: "github.blog", label: "GitHub Blog" });

  assert.equal(scoped.parentCaseKey, "example_b_dev_news");
  assert.equal(scoped.proofProfile.profileKey, "example_b_dev_news_proof");
  assert.equal(scoped.graphPolicy, exampleB!.graphPolicy);
  assert.equal(scoped.recallPolicy, exampleB!.recallPolicy);
  assert.deepEqual(scoped.yieldBenchmark.domains, ["github.blog"]);
  assert.ok(scoped.graphMission.seedTopics.every((item: string) => item.startsWith("site:github.blog ")));
  assert.ok(scoped.recallMission.seedQueries.every((item: string) => item.startsWith("site:github.blog ")));
  assert.ok(scoped.graphClasses.every((item: { classKey: string }) => item.classKey.includes("github_blog")));
});

test("domain run summary requires target-domain candidate and downstream or baseline evidence", () => {
  const summary = summarizeDomainCaseRun(
    {
      key: "example_b_dev_news__domain_github_blog",
      parentCaseKey: "example_b_dev_news",
      label: "Example B — github.blog",
      runtimeVerdict: "pass",
      yieldVerdict: "pass",
      graphLane: {
        candidates: [
          {
            domain: "github.blog",
            url: "https://github.blog/engineering/",
            decision: "approved",
            benchmarkLike: true,
            registeredChannelId: "channel-1",
          },
        ],
      },
      recallLane: { candidates: [] },
      baselineEvidence: [],
      discoveryEvidence: [
        {
          channelId: "channel-1",
          fetchRuns: [{ outcomeKind: "success", httpStatus: 200, errorText: "" }],
          articles: [],
          interestFilterResults: [],
          finalSelection: { total: 0, selected: 0 },
          systemFeed: { total: 0, eligible: 0 },
        },
      ],
    },
    { domain: "github.blog" }
  );

  assert.equal(summary.targetYieldVerdict, "pass");
  assert.equal(summary.rootCauseClassification, "yield_pass");
  assert.equal(summary.targetBenchmarkLikeCandidates, 1);
  assert.deepEqual(summary.targetRegisteredChannelIds, ["channel-1"]);
});

test("domain matrix verdict uses three runs with two required passes per domain", () => {
  const runs = [
    { parentCaseKey: "example_b_dev_news", domain: "github.blog", targetYieldVerdict: "pass", runtimeVerdict: "pass", rootCauseClassification: "yield_pass" },
    { parentCaseKey: "example_b_dev_news", domain: "github.blog", targetYieldVerdict: "weak", runtimeVerdict: "pass", rootCauseClassification: "target_domain_generation_problem" },
    { parentCaseKey: "example_b_dev_news", domain: "github.blog", targetYieldVerdict: "pass", runtimeVerdict: "pass", rootCauseClassification: "yield_pass" },
  ];

  const verdicts = determineDomainMatrixVerdicts(runs, { repeatCount: 3, minPassingRuns: 2 });

  assert.equal(verdicts.runtimeVerdict, "pass");
  assert.equal(verdicts.yieldVerdict, "pass");
  assert.equal(verdicts.finalVerdict, "pass");
  assert.equal(verdicts.perDomain[0].passingRuns, 2);
});

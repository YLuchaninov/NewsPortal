import assert from "node:assert/strict";
import test from "node:test";

import {
  determineProductMegaFlowVerdict,
  PRODUCT_MEGA_FLOW_SCENARIOS,
  summarizeFilterBucketEvidence,
  summarizeSequenceEvidence,
} from "../../../infra/scripts/lib/product-mega-flow-proof.mjs";

const PASSING_COMMANDS = [
  "channel-auth-compose",
  "providers-compose",
  "website-compose",
  "web-viewports",
  "web-ui-audit",
  "discovery-admin-compose",
  "mcp-compose",
  "discovery-yield-compose",
].map((key) => ({
  key,
  status: "passed",
  exitCode: 0,
}));

const MCP_ARTIFACT = {
  kind: "deterministic-mcp-http-proof",
  scenarios: [
    { key: "sequence-operator-flows" },
    { key: "content-analysis-operator-flows" },
    { key: "read-only-operator-needs" },
    { key: "template-interest-channel-flows" },
  ],
};

function caseRun(key: string) {
  return {
    key,
    runtimeVerdict: "pass",
    yieldVerdict: "pass",
    rootCauseClassification: "yield_pass",
    materializedProfile: {
      profile_key: `${key}_proof`,
    },
    manualReplaySettings: {
      graphMissionId: "graph",
      recallMissionId: "recall",
    },
    graphLane: {
      candidates: [
        {
          decision: "approved",
          benchmarkLike: true,
          registeredChannelId: `${key}-channel`,
        },
      ],
    },
    recallLane: {
      candidates: [],
    },
    baselineEvidence: [
      {
        fetchRuns: [{ outcomeKind: "success", httpStatus: 200 }],
        articles: [{ docId: `${key}-doc`, title: "Selected article" }],
        interestFilterResults: [
          {
            semanticDecision: "approve",
            compatDecision: "approve",
          },
        ],
        finalSelection: {
          total: 1,
          selected: 1,
        },
        systemFeed: {
          total: 1,
          eligible: 1,
        },
      },
    ],
    discoveryEvidence: [],
  };
}

function discoveryReport() {
  return {
    runtimeVerdict: "pass",
    yieldVerdict: "pass",
    finalVerdict: "pass",
    caseRuns: PRODUCT_MEGA_FLOW_SCENARIOS.map((scenario) => caseRun(scenario.key)),
  };
}

test("product mega-flow scenario metadata exists exactly for A/B/C with unique fixture namespaces", () => {
  assert.deepEqual(PRODUCT_MEGA_FLOW_SCENARIOS.map((item) => item.example), ["A", "B", "C"]);
  assert.deepEqual(PRODUCT_MEGA_FLOW_SCENARIOS.map((item) => item.key), [
    "example_a_job_board",
    "example_b_dev_news",
    "example_c_outsourcing",
  ]);
  assert.equal(new Set(PRODUCT_MEGA_FLOW_SCENARIOS.map((item) => item.fixtureNamespace)).size, 3);
});

test("filter bucket summary requires selected, rejected/held policy and duplicate evidence", () => {
  const passing = summarizeFilterBucketEvidence({
    caseRun: caseRun("example_a_job_board"),
    commandResults: PASSING_COMMANDS,
    mcpArtifact: MCP_ARTIFACT,
  });

  assert.equal(passing.selected.passed, true);
  assert.equal(passing.negativeKeywordsRejected.passed, true);
  assert.equal(passing.contentKindOrTimeWindowRejected.passed, true);
  assert.equal(passing.contentFilterHeldOrRejected.passed, true);
  assert.equal(passing.duplicateCanonicalFamily.passed, true);

  const missingSelection = summarizeFilterBucketEvidence({
    caseRun: {
      ...caseRun("example_a_job_board"),
      baselineEvidence: [
        {
          interestFilterResults: [{ semanticDecision: "reject" }],
          finalSelection: { total: 0, selected: 0 },
          systemFeed: { total: 0, eligible: 0 },
        },
      ],
    },
    commandResults: PASSING_COMMANDS.filter((item) => item.key !== "web-viewports"),
    mcpArtifact: MCP_ARTIFACT,
  });
  assert.equal(missingSelection.selected.passed, false);
});

test("sequence evidence summary requires success, cancel, failure and retry paths", () => {
  const passing = summarizeSequenceEvidence({
    commandResults: PASSING_COMMANDS,
    mcpArtifact: MCP_ARTIFACT,
  });

  assert.equal(passing.resourceIngestSuccess.passed, true);
  assert.equal(passing.articleIngestSuccess.passed, true);
  assert.equal(passing.notificationDigestSuccess.passed, true);
  assert.equal(passing.cancelPath.passed, true);
  assert.equal(passing.failurePath.passed, true);
  assert.equal(passing.retryPath.passed, true);

  const missingRetry = summarizeSequenceEvidence({
    commandResults: PASSING_COMMANDS,
    mcpArtifact: { kind: "deterministic-mcp-http-proof", scenarios: [] },
  });
  assert.equal(missingRetry.retryPath.passed, false);
});

test("product mega-flow verdict passes only when all domains and child proof commands pass", () => {
  const passing = determineProductMegaFlowVerdict({
    discoveryReport: discoveryReport(),
    commandResults: PASSING_COMMANDS,
    mcpArtifact: MCP_ARTIFACT,
    yieldProofReport: { finalVerdict: "pass" },
  });

  assert.equal(passing.runtimeVerdict, "pass");
  assert.equal(passing.yieldVerdict, "pass");
  assert.equal(passing.finalVerdict, "pass");
  assert.equal(passing.scenarioSummaries.length, 3);
  assert.equal(passing.scenarioSummaries[0]?.adminManagedTruth.profileKey, "example_a_job_board_proof");

  const passingWithoutSeparateYieldProof = determineProductMegaFlowVerdict({
    discoveryReport: discoveryReport(),
    commandResults: PASSING_COMMANDS.filter((item) => item.key !== "discovery-yield-compose"),
    mcpArtifact: MCP_ARTIFACT,
    yieldProofReport: null,
  });

  assert.equal(passingWithoutSeparateYieldProof.finalVerdict, "pass");

  const failing = determineProductMegaFlowVerdict({
    discoveryReport: {
      ...discoveryReport(),
      caseRuns: [
        { ...caseRun("example_a_job_board"), yieldVerdict: "fail" },
        caseRun("example_b_dev_news"),
        caseRun("example_c_outsourcing"),
      ],
    },
    commandResults: PASSING_COMMANDS,
    mcpArtifact: MCP_ARTIFACT,
    yieldProofReport: { finalVerdict: "pass" },
  });

  assert.equal(failing.finalVerdict, "fail");
  assert.equal(failing.scenarioSummaries[0].status, "failed");
});

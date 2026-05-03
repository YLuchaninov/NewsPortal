import assert from "node:assert/strict";
import test from "node:test";

import {
  determineProductTotalLiveAuditVerdict,
  PRODUCT_TOTAL_LIVE_DIAGNOSTIC_COMMANDS,
  PRODUCT_TOTAL_LIVE_REQUIRED_COMMANDS,
  PRODUCT_TOTAL_LIVE_STATUSES,
  summarizeProviderExternalResiduals,
} from "../../../infra/scripts/lib/product-total-live-audit-proof.mjs";

function commandResult(key: string, status = "passed", parsedArtifacts: unknown[] = []) {
  return {
    key,
    status,
    exitCode: status === "passed" ? 0 : 1,
    parsedArtifacts: parsedArtifacts.map((parsed, index) => ({
      jsonPath: `/tmp/${key}-${index}.json`,
      parsed,
    })),
  };
}

function passingMegaArtifact() {
  return {
    kind: "newsportal-product-mega-flow-proof",
    finalVerdict: "pass",
    runtimeVerdict: "pass",
    yieldVerdict: "pass",
    scenarios: [
      {
        key: "example_a_job_board",
        liveSelectedArticleEvidence: { selectedFinalRows: 1 },
      },
      {
        key: "example_b_dev_news",
        liveSelectedArticleEvidence: { selectedFinalRows: 1 },
      },
      {
        key: "example_c_outsourcing",
        liveSelectedArticleEvidence: { selectedFinalRows: 1 },
      },
    ],
  };
}

function passingRequiredCommands(extraArtifacts: Record<string, unknown[]> = {}) {
  return PRODUCT_TOTAL_LIVE_REQUIRED_COMMANDS.map((item) =>
    commandResult(
      item.key,
      "passed",
      item.key === "product-mega-flow-compose"
        ? [passingMegaArtifact()]
        : extraArtifacts[item.key] ?? []
    )
  );
}

test("total-live provider evidence marks API and Email IMAP external live as not applicable when fixtures pass", () => {
  const evidence = summarizeProviderExternalResiduals(
    passingRequiredCommands().filter((item) =>
      ["providers-compose", "channel-auth-compose", "product-mega-flow-compose", "website-admin-compose"].includes(item.key)
    )
  );

  assert.equal(evidence.api.fixture.status, PRODUCT_TOTAL_LIVE_STATUSES.passed);
  assert.equal(evidence.emailImap.fixture.status, PRODUCT_TOTAL_LIVE_STATUSES.passed);
  assert.equal(evidence.api.externalLive.status, PRODUCT_TOTAL_LIVE_STATUSES.notApplicable);
  assert.equal(evidence.api.externalLive.reason, "no_real_external_target_available");
  assert.equal(evidence.emailImap.externalLive.status, PRODUCT_TOTAL_LIVE_STATUSES.notApplicable);
});

test("total-live fails when strict A/B/C mega-flow fails even if other commands pass", () => {
  const commandResults = passingRequiredCommands({
    "product-mega-flow-compose": [
      {
        ...passingMegaArtifact(),
        finalVerdict: "fail",
      },
    ],
  });
  commandResults[0] = commandResult("product-mega-flow-compose", "passed", [
    {
      ...passingMegaArtifact(),
      finalVerdict: "fail",
    },
  ]);

  const verdict = determineProductTotalLiveAuditVerdict({
    env: { status: "passed" },
    commandResults,
    diagnosticCommands: [],
  });

  assert.equal(verdict.runtimeVerdict, "fail");
  assert.equal(verdict.finalVerdict, "fail");
  assert.equal(verdict.strictMegaFlow.status, PRODUCT_TOTAL_LIVE_STATUSES.failed);
});

test("total-live returns weak when only live diagnostic lanes have classified residuals", () => {
  const commandResults = [
    ...passingRequiredCommands(),
    commandResult("discovery-mega-compose", "failed", [
      {
        kind: "newsportal-live-discovery-domain-matrix",
        runtimeVerdict: "pass",
        yieldVerdict: "weak",
        finalVerdict: "yield_weak",
        matrix: {
          rootCauseCounts: {
            target_domain_generation_problem: 3,
          },
        },
      },
    ]),
    commandResult("website-matrix-compose", "passed", [
      {
        evidencePath: "/tmp/newsportal-live-website-matrix-proof.json",
        summary: {
          verdictCounts: {
            accepted: 2,
            observed_truthful_unsupported_or_blocked: 1,
          },
        },
        siteResults: [],
      },
    ]),
  ];

  const verdict = determineProductTotalLiveAuditVerdict({
    env: { status: "passed" },
    commandResults,
    diagnosticCommands: PRODUCT_TOTAL_LIVE_DIAGNOSTIC_COMMANDS.filter((item) =>
      ["discovery-mega-compose", "website-matrix-compose"].includes(item.key)
    ),
  });

  assert.equal(verdict.runtimeVerdict, "pass");
  assert.equal(verdict.finalVerdict, "weak");
  assert.deepEqual(
    verdict.diagnosticWeak.map((item) => item.key).sort(),
    ["discovery-mega-compose", "website-matrix-compose"]
  );
});

test("total-live fails for unclassified diagnostic failures", () => {
  const verdict = determineProductTotalLiveAuditVerdict({
    env: { status: "passed" },
    commandResults: [
      ...passingRequiredCommands(),
      commandResult("website-matrix-compose", "failed", [
        {
          evidencePath: "/tmp/newsportal-live-website-matrix-proof.json",
          summary: {
            verdictCounts: {
              unexpected_failure: 1,
            },
          },
          siteResults: [],
        },
      ]),
    ],
    diagnosticCommands: PRODUCT_TOTAL_LIVE_DIAGNOSTIC_COMMANDS.filter((item) =>
      item.key === "website-matrix-compose"
    ),
  });

  assert.equal(verdict.runtimeVerdict, "fail");
  assert.equal(verdict.finalVerdict, "fail");
  assert.equal(
    verdict.diagnosticSummaries["website-matrix-compose"]?.status,
    PRODUCT_TOTAL_LIVE_STATUSES.failed
  );
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  determineLocalProductStatus,
  evaluateLocalProductCommandResult,
  isStrictLiveInternet,
  PRODUCT_LOCAL_STATUSES,
} from "../../../infra/scripts/lib/product-local-proof.mjs";

function commandResult(overrides: Record<string, unknown> = {}) {
  return {
    key: "website-matrix-compose",
    status: "failed",
    exitCode: 1,
    weakAllowed: true,
    parsedArtifacts: [
      {
        jsonPath: "/tmp/signalops-live-website-matrix-proof.json",
        parsed: {
          evidencePath: "/tmp/signalops-live-website-matrix-proof.json",
          summary: {
            verdictCounts: {
              observed_expected_shape: 7,
              observed_truthful_unsupported_or_blocked: 8,
              observed_partial_or_empty_shape: 1,
            },
          },
          siteResults: [],
        },
      },
    ],
    ...overrides,
  };
}

test("local product full accepts classified live website residuals as weak outside strict live mode", () => {
  const result = evaluateLocalProductCommandResult(commandResult(), {
    strictLiveInternet: false,
  });

  assert.equal(result.acceptanceStatus, PRODUCT_LOCAL_STATUSES.weak);
  assert.equal(result.diagnosticSummary?.status, "weak_with_classified_residual");
  assert.equal(
    determineLocalProductStatus({
      envStatus: "passed",
      commandResults: [result],
    }),
    PRODUCT_LOCAL_STATUSES.weak
  );
});

test("local product full fails classified live website residuals when strict live mode is explicit", () => {
  const result = evaluateLocalProductCommandResult(commandResult(), {
    strictLiveInternet: true,
  });

  assert.equal(result.acceptanceStatus, PRODUCT_LOCAL_STATUSES.failed);
  assert.equal(result.acceptanceReason, "strict_live_internet_requires_passing_website_matrix");
});

test("local product full still fails unexpected live website matrix failures", () => {
  const result = evaluateLocalProductCommandResult(
    commandResult({
      parsedArtifacts: [
        {
          jsonPath: "/tmp/signalops-live-website-matrix-proof.json",
          parsed: {
            evidencePath: "/tmp/signalops-live-website-matrix-proof.json",
            summary: {
              verdictCounts: {
                unexpected_failure: 1,
              },
            },
            siteResults: [],
          },
        },
      ],
    }),
    { strictLiveInternet: false }
  );

  assert.equal(result.acceptanceStatus, PRODUCT_LOCAL_STATUSES.failed);
  assert.equal(result.acceptanceReason, "website_matrix_unexpected_failure");
});

test("strict live env accepts explicit truthy values only", () => {
  assert.equal(isStrictLiveInternet({ SIGNALOPS_STRICT_LIVE_INTERNET: "1" }), true);
  assert.equal(isStrictLiveInternet({ SIGNALOPS_STRICT_LIVE_INTERNET: "true" }), true);
  assert.equal(isStrictLiveInternet({ SIGNALOPS_STRICT_LIVE_INTERNET: "false" }), false);
  assert.equal(isStrictLiveInternet({}), false);
});

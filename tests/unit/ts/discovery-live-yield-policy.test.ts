import assert from "node:assert/strict";
import test from "node:test";

import {
  DISCOVERY_RUNTIME_CASE_PACKS,
  DISCOVERY_VALIDATION_CASE_PACKS,
  DISCOVERY_LIVE_DEFAULTS,
} from "../../../infra/scripts/lib/discovery-live-example-cases.mjs";
import {
  buildCaseYieldSummary,
  classifyCaseRootCause,
  classifyGraphCandidate,
  classifyRecallCandidate,
  determineCaseVerdicts,
  determineMultiRunYieldProof,
  determineRunVerdicts,
  evaluateCalibration,
  isBenchmarkLikeCandidate,
  NORMALIZED_YIELD_REASON_BUCKETS,
  summarizeAggregateRootCauses,
} from "../../../infra/scripts/lib/discovery-live-yield-policy.mjs";

const exampleB = DISCOVERY_RUNTIME_CASE_PACKS.find((item) => item.key === "example_b_dev_news");
const exampleC = DISCOVERY_RUNTIME_CASE_PACKS.find((item) => item.key === "example_c_outsourcing");
const genericLongTail = DISCOVERY_VALIDATION_CASE_PACKS.find(
  (item) => item.key === "generic_long_tail_exploratory"
);

test("benchmark matcher recognizes benchmark-like candidates per case", () => {
  assert.ok(exampleB);
  assert.ok(exampleC);

  assert.equal(
    isBenchmarkLikeCandidate(
      {
        provider_type: "website",
        url: "https://github.blog/engineering/",
        title: "GitHub engineering updates for developers",
        evaluation_json: { classification: { kind: "editorial" } },
      },
      exampleB!
    ),
    true
  );

  assert.equal(
    isBenchmarkLikeCandidate(
      {
        provider_type: "website",
        url: "https://sam.gov/opp/123/view",
        title: "Software modernization request for proposal",
        evaluation_json: { classification: { kind: "editorial" } },
      },
      exampleC!
    ),
    true
  );
});

test("case-specific graph policy rejects noise and keeps benchmark-like candidates approvable", () => {
  assert.ok(exampleB);
  assert.ok(exampleC);

  const exampleBApprove = classifyGraphCandidate(
    {
      provider_type: "website",
      is_valid: true,
      relevance_score: 0.82,
      url: "https://blog.cloudflare.com/",
      title: "Cloudflare engineering release for developers",
      search_query: "official engineering updates",
      tactic_key: "official engineering updates",
      evaluation_json: { classification: { kind: "editorial" } },
    },
    exampleB!,
    DISCOVERY_LIVE_DEFAULTS
  );
  assert.equal(exampleBApprove.decision, "approvable");

  const exampleBReject = classifyGraphCandidate(
    {
      provider_type: "rss",
      is_valid: true,
      relevance_score: 0.95,
      url: "https://www.feedspot.com/feed.xml",
      title: "Top 100 developer blogs directory",
      search_query: "developer news rss",
      tactic_key: "developer news rss",
      evaluation_json: { classification: { kind: "editorial" } },
    },
    exampleB!,
    DISCOVERY_LIVE_DEFAULTS
  );
  assert.equal(exampleBReject.decision, "rejected");
  assert.equal(exampleBReject.rejectionReason, "below_auto_approval_threshold");

  const exampleCReject = classifyGraphCandidate(
    {
      provider_type: "website",
      is_valid: true,
      relevance_score: 0.93,
      url: "https://agency.example.com/software-outsourcing-services",
      title: "Software outsourcing services",
      search_query: "procurement notice",
      tactic_key: "procurement notice",
      evaluation_json: { classification: { kind: "editorial" } },
    },
    exampleC!,
    DISCOVERY_LIVE_DEFAULTS
  );
  assert.equal(exampleCReject.decision, "rejected");
  assert.equal(exampleCReject.rejectionReason, "below_auto_approval_threshold");
});

test("recall policy distinguishes promotable, rejected, and residual candidates", () => {
  assert.ok(exampleB);

  const promotable = classifyRecallCandidate(
    {
      provider_type: "website",
      source_quality_recall_score: 0.55,
      url: "https://engineering.fb.com/",
      title: "Engineering architecture blog",
      quality_signal_source: "official engineering blog",
      evaluation_json: { classification: { kind: "editorial" } },
    },
    exampleB!,
    DISCOVERY_LIVE_DEFAULTS
  );
  assert.equal(promotable.decision, "promotable");

  const residual = classifyRecallCandidate(
    {
      provider_type: "website",
      source_quality_recall_score: 0.8,
      url: "https://example.com/dev",
      title: "Developer community",
      quality_signal_source: "developer community",
      evaluation_json: {
        classification: { kind: "editorial" },
        browser_assisted_recommended: true,
      },
    },
    exampleB!,
    DISCOVERY_LIVE_DEFAULTS
  );
  assert.equal(residual.decision, "rejected");
  assert.equal(residual.rejectionReason, "browser_assisted_residual");
});

test("calibration fixtures meet the default agreement threshold", () => {
  assert.ok(exampleB);
  assert.ok(exampleC);
  assert.ok(genericLongTail);

  const exampleBCalibration = evaluateCalibration(exampleB!, DISCOVERY_LIVE_DEFAULTS);
  const exampleCCalibration = evaluateCalibration(exampleC!, DISCOVERY_LIVE_DEFAULTS);
  const genericCalibration = evaluateCalibration(genericLongTail!, DISCOVERY_LIVE_DEFAULTS);

  assert.equal(exampleBCalibration.passed, true);
  assert.equal(exampleCCalibration.passed, true);
  assert.equal(genericCalibration.passed, true);
  assert.ok(exampleBCalibration.agreementRatio >= 0.8);
  assert.ok(exampleCCalibration.agreementRatio >= 0.8);
  assert.ok(genericCalibration.agreementRatio >= 0.8);
});

test("run and multi-run verdicts separate runtime failure from weak yield", () => {
  assert.ok(exampleB);

  const weakCaseVerdicts = determineCaseVerdicts(
    exampleB!,
    {
      graphLane: { mission: { mission_id: "m1" }, candidates: [] },
      recallLane: { mission: { recall_mission_id: "r1" }, candidates: [] },
      downstreamEvidence: [],
      coverageMatrix: exampleB!.interestNames.map((interestName) => ({
        interestName,
        status: "candidate_found_not_onboarded",
      })),
    },
    DISCOVERY_LIVE_DEFAULTS
  );
  assert.equal(weakCaseVerdicts.runtimeVerdict, "pass");
  assert.equal(weakCaseVerdicts.yieldVerdict, "weak");

  const runVerdicts = determineRunVerdicts({
    preconditions: [{ status: "passed" }],
    preflight: [{ status: "passed" }],
    caseRuns: [
      {
        key: exampleB!.key,
        label: exampleB!.label,
        runtimeVerdict: "pass",
        yieldVerdict: "weak",
      },
    ],
  });
  assert.deepEqual(runVerdicts, {
    runtimeVerdict: "pass",
    yieldVerdict: "weak",
    finalVerdict: "yield_weak",
  });

  const multiRun = determineMultiRunYieldProof(
    [
      {
        runtimeVerdict: "pass",
        caseRuns: [
          { key: "example_b_dev_news", label: "Example B", yieldVerdict: "pass" },
          { key: "example_c_outsourcing", label: "Example C", yieldVerdict: "pass" },
        ],
      },
      {
        runtimeVerdict: "pass",
        caseRuns: [
          { key: "example_b_dev_news", label: "Example B", yieldVerdict: "pass" },
          { key: "example_c_outsourcing", label: "Example C", yieldVerdict: "weak" },
        ],
      },
      {
        runtimeVerdict: "pass",
        caseRuns: [
          { key: "example_b_dev_news", label: "Example B", yieldVerdict: "weak" },
          { key: "example_c_outsourcing", label: "Example C", yieldVerdict: "weak" },
        ],
      },
    ],
    DISCOVERY_LIVE_DEFAULTS
  );
  assert.equal(multiRun.runtimeVerdict, "pass");
  assert.equal(multiRun.yieldVerdict, "weak");
  assert.equal(multiRun.finalVerdict, "yield_weak");
});

test("root-cause classification stays generic across case packs", () => {
  assert.ok(exampleB);

  const generationProblem = classifyCaseRootCause(
    exampleB!,
    {
      graphLane: { mission: { mission_id: "m1" }, candidates: [] },
      recallLane: { mission: { recall_mission_id: "r1" }, candidates: [] },
      downstreamEvidence: [],
      coverageMatrix: [],
    },
    DISCOVERY_LIVE_DEFAULTS
  );
  assert.equal(generationProblem, "generation_problem");

  const reviewPolicyProblem = determineCaseVerdicts(
    exampleB!,
    {
      graphLane: {
        mission: { mission_id: "m1" },
        candidates: [
          {
            decision: "rejected",
            benchmarkLike: true,
            rejectionReason: "below_auto_approval_threshold",
            domain: "infoq.com",
            tacticKey: "developer news rss",
          },
        ],
      },
      recallLane: { mission: { recall_mission_id: "r1" }, candidates: [] },
      downstreamEvidence: [],
      coverageMatrix: exampleB!.interestNames.map((interestName) => ({
        interestName,
        status: "candidate_found_not_onboarded",
      })),
    },
    DISCOVERY_LIVE_DEFAULTS
  );
  assert.equal(reviewPolicyProblem.rootCauseClassification, "review_policy_problem");

  const downstreamUsefulness = determineCaseVerdicts(
    {
      ...exampleB!,
      yieldAcceptance: {
        minChannelsWithDownstreamEvidence: 2,
      },
    },
    {
      graphLane: {
        mission: { mission_id: "m1" },
        candidates: [
          {
            decision: "approved",
            benchmarkLike: true,
            registeredChannelId: "channel-1",
            domain: "infoq.com",
            tacticKey: "developer news rss",
          },
        ],
      },
      recallLane: { mission: { recall_mission_id: "r1" }, candidates: [] },
      downstreamEvidence: [
        {
          channelId: "channel-1",
          fetchRuns: [{ started_at: "2026-04-19T00:00:00Z" }],
          articles: [],
          interestFilterResults: [],
          finalSelection: { total: 0, selected: 0 },
        },
      ],
      coverageMatrix: exampleB!.interestNames.map((interestName) => ({
        interestName,
        status: "source_onboarded_no_match_yet",
      })),
    },
    DISCOVERY_LIVE_DEFAULTS
  );
  assert.equal(downstreamUsefulness.rootCauseClassification, "downstream_usefulness_problem");

  const aggregate = summarizeAggregateRootCauses([
    { rootCauseClassification: "review_policy_problem" },
    { rootCauseClassification: "review_policy_problem" },
    { rootCauseClassification: "downstream_usefulness_problem" },
  ]);
  assert.equal(aggregate.dominantRootCause, "review_policy_problem");
  assert.deepEqual(aggregate.counts, {
    review_policy_problem: 2,
    downstream_usefulness_problem: 1,
  });
});

test("yield summary exposes normalized buckets including registration failures", () => {
  assert.ok(exampleB);

  const summary = buildCaseYieldSummary(
    exampleB!,
    {
      graphLane: {
        mission: { mission_id: "m1" },
        candidates: [
          {
            decision: "approved",
            benchmarkLike: true,
            registeredChannelId: null,
            registrationFailed: true,
            domain: "infoq.com",
            tacticKey: "developer news rss",
          },
          {
            decision: "rejected",
            benchmarkLike: true,
            rejectionReason: "below_auto_approval_threshold",
            domain: "feedspot.com",
            tacticKey: "developer news rss",
          },
        ],
      },
      recallLane: {
        mission: { recall_mission_id: "r1" },
        candidates: [
          {
            decision: "rejected",
            benchmarkLike: false,
            rejectionReason: "unsupported_challenge",
            domain: "example.com",
            tacticKey: "developer community",
          },
        ],
      },
      downstreamEvidence: [],
      coverageMatrix: exampleB!.interestNames.map((interestName, index) => ({
        interestName,
        status: index === 0 ? "candidate_found_not_onboarded" : "no_viable_live_source_found",
      })),
    },
    DISCOVERY_LIVE_DEFAULTS
  );

  for (const bucket of NORMALIZED_YIELD_REASON_BUCKETS) {
    assert.ok(bucket in summary.normalizedReasonBuckets);
  }
  assert.equal(summary.normalizedReasonBuckets.registration_failed, 1);
  assert.equal(summary.normalizedReasonBuckets.below_auto_approval_threshold, 1);
  assert.equal(summary.normalizedReasonBuckets.unsupported_challenge, 1);
  assert.equal(summary.normalizedReasonBuckets.candidate_found_not_onboarded, 1);
});

test("multi-run proof keeps per-pack root-cause drift counts", () => {
  const multiRun = determineMultiRunYieldProof(
    [
      {
        runtimeVerdict: "pass",
        caseRuns: [
          {
            key: "example_b_dev_news",
            label: "Example B",
            yieldVerdict: "weak",
            rootCauseClassification: "review_policy_problem",
          },
        ],
      },
      {
        runtimeVerdict: "pass",
        caseRuns: [
          {
            key: "example_b_dev_news",
            label: "Example B",
            yieldVerdict: "pass",
            rootCauseClassification: "yield_pass",
          },
        ],
      },
      {
        runtimeVerdict: "pass",
        caseRuns: [
          {
            key: "example_b_dev_news",
            label: "Example B",
            yieldVerdict: "weak",
            rootCauseClassification: "review_policy_problem",
          },
        ],
      },
    ],
    DISCOVERY_LIVE_DEFAULTS
  );

  assert.deepEqual(multiRun.perCase, [
    {
      key: "example_b_dev_news",
      label: "Example B",
      passingRuns: 1,
      totalRuns: 3,
      yieldVerdicts: ["weak", "pass", "weak"],
      rootCauseCounts: {
        review_policy_problem: 2,
        yield_pass: 1,
      },
    },
  ]);
  assert.deepEqual(multiRun.aggregateRootCauses, {
    review_policy_problem: 2,
    yield_pass: 1,
  });
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  EXTENDED_LIVE_CALIBRATION_CASE_PACKS,
  LIVE_CALIBRATION_CASE_PACKS,
  ALL_LIVE_CALIBRATION_CASE_PACKS,
  allowedSearchProvidersFromEnv,
  buildReplayEvalFixture,
  buildTuningRecommendations,
  determineLiveCalibrationVerdicts,
  validateLiveCalibrationCasePack,
} from "../../../infra/scripts/lib/discovery-live-calibration.mjs";

test("live calibration case validation rejects social API and email providers", () => {
  const valid = validateLiveCalibrationCasePack(LIVE_CALIBRATION_CASE_PACKS);
  assert.equal(valid.passed, true);
  assert.equal(validateLiveCalibrationCasePack(EXTENDED_LIVE_CALIBRATION_CASE_PACKS).passed, true);

  const invalid = validateLiveCalibrationCasePack([
    {
      key: "bad_social",
      target: { prompt: "find social signals" },
      expectedProviderIds: ["reddit", "api", "email_imap"],
    },
  ]);

  assert.equal(invalid.passed, false);
  assert.match(invalid.errors.join(" "), /reddit/u);
  assert.match(invalid.errors.join(" "), /api/u);
  assert.match(invalid.errors.join(" "), /email_imap/u);
});

test("extended live calibration cases stay separate from core and cover expected roles", () => {
  assert.ok(ALL_LIVE_CALIBRATION_CASE_PACKS.length > LIVE_CALIBRATION_CASE_PACKS.length);
  assert.ok(LIVE_CALIBRATION_CASE_PACKS.every((casePack) => casePack.caseSet === "core"));
  assert.ok(EXTENDED_LIVE_CALIBRATION_CASE_PACKS.every((casePack) => casePack.caseSet === "extended"));

  const extendedKeys = new Set(EXTENDED_LIVE_CALIBRATION_CASE_PACKS.map((casePack) => casePack.key));
  assert.deepEqual(
    [...extendedKeys].sort(),
    [
      "localized_procurement_pl_de",
      "primary_data_open_data_gap",
      "regulatory_policy_watch",
      "report_research_library_bootstrap",
      "security_advisory_bootstrap",
      "vendor_ecosystem_expansion",
    ].sort()
  );
});

test("localized PL/DE procurement case includes localized seeds and role targets", () => {
  const procurement = EXTENDED_LIVE_CALIBRATION_CASE_PACKS.find((casePack) => casePack.key === "localized_procurement_pl_de");
  assert.ok(procurement);
  assert.equal(procurement.flow, "gap_fill");
  assert.ok(Object.hasOwn(procurement.sourceRoleTargets, "procurement_signal"));
  assert.deepEqual(procurement.target.seedLanguages, ["pl", "de", "en"]);
  assert.ok(procurement.target.seedTopics.some((topic) => /przetarg|zamówienie/iu.test(topic)));
  assert.ok(procurement.target.seedTopics.some((topic) => /Ausschreibung|Vergabe/u.test(topic)));
});

test("live acceptance verdict requires repeated passing runs per core flow", () => {
  const casePacks = LIVE_CALIBRATION_CASE_PACKS.slice(0, 2);
  const iterations = [
    { caseKey: casePacks[0].key, runtimePassed: true, flowPassed: true, rootCauses: [] },
    { caseKey: casePacks[0].key, runtimePassed: true, flowPassed: true, rootCauses: [] },
    { caseKey: casePacks[0].key, runtimePassed: true, flowPassed: false, rootCauses: ["no_results"] },
    { caseKey: casePacks[1].key, runtimePassed: true, flowPassed: true, rootCauses: [] },
    { caseKey: casePacks[1].key, runtimePassed: true, flowPassed: false, rootCauses: ["review_policy_problem"] },
    { caseKey: casePacks[1].key, runtimePassed: true, flowPassed: false, rootCauses: ["review_policy_problem"] },
  ];

  const verdicts = determineLiveCalibrationVerdicts(iterations, {
    mode: "acceptance",
    casePacks,
  });

  assert.equal(verdicts.runtimeVerdict, "pass");
  assert.equal(verdicts.qualityVerdict, "weak");
  assert.equal(verdicts.finalVerdict, "yield_weak");
  assert.equal(verdicts.perCase[0]?.verdict, "pass");
  assert.equal(verdicts.perCase[1]?.verdict, "weak");
});

test("extended live-polish acceptance uses the same repeated 2-of-3 gate", () => {
  const casePacks = EXTENDED_LIVE_CALIBRATION_CASE_PACKS.slice(0, 1);
  const iterations = [
    { caseKey: casePacks[0].key, runtimePassed: true, flowPassed: true, rootCauses: [] },
    { caseKey: casePacks[0].key, runtimePassed: true, flowPassed: true, rootCauses: [] },
    { caseKey: casePacks[0].key, runtimePassed: true, flowPassed: false, rootCauses: ["missing_evidence"] },
  ];

  const verdicts = determineLiveCalibrationVerdicts(iterations, {
    mode: "acceptance",
    casePacks,
  });

  assert.equal(verdicts.finalVerdict, "pass");
  assert.equal(verdicts.perCase[0]?.caseSet, "extended");
  assert.equal(verdicts.perCase[0]?.passingRuns, 2);
});

test("tuning recommendations map live root causes to safe knobs", () => {
  const recommendations = buildTuningRecommendations({
    aggregateRootCauseCounts: {
      no_results: 2,
      provider_health_event: 1,
      duplicate_pressure: 1,
    },
  });

  assert.deepEqual(
    recommendations.map((item) => item.knob),
    ["provider_health", "query_templates", "identity_resolution"]
  );
  assert.ok(recommendations.every((item) => !/auto.?apply/iu.test(item.recommendation)));
});

test("replay fixture preserves provider votes and missing-evidence root causes", () => {
  const fixture = buildReplayEvalFixture({
    caseSet: "extended",
    caseKey: "bootstrap_rss_atom",
    targetId: "target-1",
    flow: "bootstrap",
    flowPassed: false,
    endpointScoreSummary: { count: 1, min: 0.4, max: 0.4, avg: 0.4 },
    queryDiversity: { queryCount: 2, roleCount: 1, providerCount: 1 },
    providerVotes: { ddgs: 1 },
    rootCauses: ["missing_evidence", "no_results"],
  });

  assert.equal(fixture.targetJson.caseSet, "extended");
  assert.equal(fixture.providerFixturesJson.caseSet, "extended");
  assert.equal(fixture.targetJson.caseKey, "bootstrap_rss_atom");
  assert.deepEqual(fixture.providerFixturesJson.providerVotes, { ddgs: 1 });
  assert.deepEqual(
    fixture.expectedRejectsJson.map((item) => item.failureMode),
    ["missing_evidence", "no_results"]
  );
});

test("fanout provider selection keeps paid providers gated by keys", () => {
  assert.deepEqual(
    allowedSearchProvidersFromEnv({
      DISCOVERY_SEARCH_PROVIDERS: "ddgs,brave,serper",
      DISCOVERY_BRAVE_API_KEY: "",
      DISCOVERY_SERPER_API_KEY: "",
    }),
    ["ddgs"]
  );
  assert.deepEqual(
    allowedSearchProvidersFromEnv({
      DISCOVERY_SEARCH_PROVIDERS: "ddgs,brave,serper",
      DISCOVERY_BRAVE_API_KEY: "brave-key",
      DISCOVERY_SERPER_API_KEY: "serper-key",
    }),
    ["ddgs", "brave", "serper"]
  );
});

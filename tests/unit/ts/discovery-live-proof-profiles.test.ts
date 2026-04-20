import assert from "node:assert/strict";
import test from "node:test";

import { DISCOVERY_RUNTIME_CASE_PACKS } from "../../../infra/scripts/lib/discovery-live-example-cases.mjs";
import {
  buildDiscoveryProfilePayload,
  buildManualReplaySettings,
  buildProfileBackedGraphMissionPayload,
  buildProfileBackedRecallMissionPayload,
  getCaseProofProfile,
} from "../../../infra/scripts/lib/discovery-live-proof-profiles.mjs";

const exampleB = DISCOVERY_RUNTIME_CASE_PACKS.find((item) => item.key === "example_b_dev_news");
const exampleC = DISCOVERY_RUNTIME_CASE_PACKS.find((item) => item.key === "example_c_outsourcing");

test("proof profile payload is derived from case-pack truth", () => {
  assert.ok(exampleB);

  const profileMeta = getCaseProofProfile(exampleB!);
  const payload = buildDiscoveryProfilePayload(exampleB!);

  assert.equal(profileMeta.profileKey, "example_b_dev_news_proof");
  assert.equal(profileMeta.displayName, "Example B — Dev News Proof");
  assert.equal(payload.profileKey, "example_b_dev_news_proof");
  assert.equal(payload.status, "active");
  assert.deepEqual(payload.graphPolicyJson.providerTypes, ["rss", "website"]);
  assert.ok(payload.graphPolicyJson.preferredDomains.includes("infoq.com"));
  assert.ok(payload.graphPolicyJson.blockedDomains.includes("feedspot.com"));
  assert.ok(payload.recallPolicyJson.preferredDomains.includes("engineering.fb.com"));
  assert.ok(payload.recallPolicyJson.blockedDomains.includes("feedspot.com"));
  assert.ok(payload.yieldBenchmarkJson.domains.includes("github.blog"));
});

test("profile-backed mission payloads keep seeds mission-owned while attaching profile linkage", () => {
  assert.ok(exampleC);

  const profilePayload = buildDiscoveryProfilePayload(exampleC!);

  const graphPayload = buildProfileBackedGraphMissionPayload(
    exampleC!,
    "run-123",
    "profile-xyz"
  );
  const recallPayload = buildProfileBackedRecallMissionPayload(
    exampleC!,
    "run-123",
    "profile-xyz"
  );

  assert.equal(graphPayload.profileId, "profile-xyz");
  assert.equal(recallPayload.profileId, "profile-xyz");
  assert.ok(graphPayload.seedTopics.includes("digital services procurement portal"));
  assert.ok(
    recallPayload.seedQueries.includes(
      "site:contractsfinder.service.gov.uk digital transformation procurement"
    )
  );
  assert.deepEqual(profilePayload.graphPolicyJson.supportedWebsiteKinds, [
    "editorial",
    "procurement_portal",
    "listing",
  ]);
  assert.deepEqual(profilePayload.recallPolicyJson.supportedWebsiteKinds, [
    "editorial",
    "procurement_portal",
    "listing",
  ]);
  assert.deepEqual(graphPayload.targetProviderTypes, ["rss", "website"]);
  assert.deepEqual(recallPayload.targetProviderTypes, ["rss", "website"]);
});

test("manual replay settings expose canonical profile and applied snapshot truth", () => {
  assert.ok(exampleB);

  const settings = buildManualReplaySettings(exampleB!, {
    materializedProfile: {
      profile_id: "profile-1",
      profile_key: "example_b_dev_news_proof",
      display_name: "Example B — Dev News Proof",
      version: 4,
      status: "active",
    },
    graphMission: {
      applied_profile_version: 4,
      applied_policy_json: {
        lane: "graph",
        graphPolicy: { preferredDomains: ["infoq.com"] },
      },
    },
    recallMission: {
      applied_profile_version: 4,
      applied_policy_json: {
        lane: "recall",
        recallPolicy: { preferredDomains: ["engineering.fb.com"] },
      },
    },
  });

  assert.equal(settings.profile.profileId, "profile-1");
  assert.equal(settings.profile.profileKey, "example_b_dev_news_proof");
  assert.equal(settings.profile.version, 4);
  assert.equal(settings.graphMission.appliedProfileVersion, 4);
  assert.equal(settings.recallMission.appliedProfileVersion, 4);
  assert.ok(settings.graphMission.seedTopics.includes("official engineering blog updates"));
  assert.ok(settings.recallMission.seedQueries.includes("site:blog.jetbrains.com company blog feed"));
  assert.ok(settings.graphPolicy.preferredDomains.includes("infoq.com"));
  assert.ok(settings.recallPolicy.preferredDomains.includes("engineering.fb.com"));
  assert.ok(settings.yieldBenchmark.domains.includes("github.blog"));
});

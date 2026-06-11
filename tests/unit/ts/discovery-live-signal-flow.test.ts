import assert from "node:assert/strict";
import test from "node:test";

import {
  buildProofInterestArchiveActions,
  buildInterestPayload,
  isFetchedExplainableSignalAttempt,
  rankSignalCandidatesForProof,
  isSelectedSignalAttempt,
  SIGNAL_PACKS,
} from "../../../infra/scripts/test-discovery-vnext-mcp-live-signal-flow.mjs";

test("live signal flow does not stop on rejected fetched evidence", () => {
  const rejectedFetchedAttempt = {
    webResources: [],
    signal_candidates: [
      {
        final_selection_decision: "rejected",
        final_selection_selected: false,
      },
    ],
    contentItems: [],
    explainableItems: [{ kind: "signal_candidate", id: "doc-1" }],
  };

  assert.equal(isFetchedExplainableSignalAttempt(rejectedFetchedAttempt), true);
  assert.equal(isSelectedSignalAttempt(rejectedFetchedAttempt), false);
});

test("live signal flow stops when selected or content evidence exists", () => {
  assert.equal(
    isSelectedSignalAttempt({
      signal_candidates: [{ final_selection_selected: true }],
      contentItems: [],
    }),
    true
  );
  assert.equal(
    isSelectedSignalAttempt({
      signal_candidates: [],
      contentItems: [{ content_item_id: "signal_candidate:doc-1" }],
    }),
    true
  );
});

test("live signal proof packs define multiple named candidate-signal groups", () => {
  for (const pack of SIGNAL_PACKS) {
    const payload = buildInterestPayload(pack, "unit");
    assert.ok(
      Array.isArray(payload.candidate_positive_signals),
      `${pack.key} should pass candidate signals as an array`
    );
    assert.ok(
      payload.candidate_positive_signals.length >= 3,
      `${pack.key} should include enough groups for evidence-led uplift`
    );
    for (const signal of payload.candidate_positive_signals) {
      assert.match(signal, /^[a-z0-9_]+:\s+\S/i);
      assert.match(signal, /,/);
    }
  }
});

test("live signal proof archives old active proof interests only", () => {
  const actions = buildProofInterestArchiveActions(
    [
      {
        interestTemplateId: "11111111-1111-4111-8111-111111111111",
        name: "Security advisory signal source discovery [live-mcp-signal-deadbeef]",
        isActive: true,
      },
      {
        interestTemplateId: "22222222-2222-4222-8222-222222222222",
        name: "Security advisory signal source discovery [live-mcp-signal-cafebabe]",
        isActive: true,
      },
      {
        interestTemplateId: "33333333-3333-4333-8333-333333333333",
        name: "Normal production interest",
        isActive: true,
      },
      {
        interestTemplateId: "44444444-4444-4444-8444-444444444444",
        name: "Policy regulatory signal source discovery [live-mcp-signal-deadbeef]",
        isActive: false,
      },
    ],
    "live-mcp-signal-cafebabe"
  );

  assert.deepEqual(actions, [
    {
      interestTemplateId: "11111111-1111-4111-8111-111111111111",
      confirm: true,
    },
  ]);
});

test("live signal proof ranks signal-like candidates ahead of wrapper pages", () => {
  const [securityPack] = SIGNAL_PACKS;
  const ranked = rankSignalCandidatesForProof(securityPack, [
    {
      doc_id: "login",
      title: "Palo Alto Networks - Sign In",
      lead: "Sign in to continue.",
    },
    {
      doc_id: "bug-bounty",
      title: "Palo Alto Networks Bug Bounty",
      lead: "Report a vulnerability in our products.",
    },
    {
      doc_id: "cve",
      title: "CVE-2026-0265 PAN-OS: Authentication Bypass with Cloud Authentication Service enabled",
      lead: "Critical vulnerability advisory with affected versions, patch, mitigation and update guidance.",
    },
  ]);

  assert.equal(ranked[0].doc_id, "cve");
  assert.equal(ranked.at(-1)?.doc_id, "login");
});

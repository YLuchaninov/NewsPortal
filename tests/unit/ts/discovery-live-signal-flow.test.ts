import assert from "node:assert/strict";
import test from "node:test";

import {
  buildProofInterestArchiveActions,
  buildInterestPayload,
  isFetchedExplainableSignalAttempt,
  rankDiscoveryCandidatesForProof,
  rankSignalCandidatesForProof,
  isSelectedSignalAttempt,
  SIGNAL_PACKS,
} from "../../../infra/scripts/proof/test-discovery-vnext-mcp-live-signal-flow.mjs";

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

test("live signal proof opts into explicit marker auto-select policy", () => {
  const payload = buildInterestPayload(SIGNAL_PACKS[0], "unit");

  assert.equal(payload.selection_profile_signal_visibility, "explicit_marker");
  assert.equal(payload.selection_profile_auto_select_mode, "evidence_or_llm");
  assert.equal(payload.selection_profile_auto_select_min_positive_groups, 1);
  assert.equal(payload.selection_profile_auto_select_min_cue_hits, 1);
  assert.equal(payload.selection_profile_auto_select_requires_no_noise, true);
  assert.equal(payload.selection_profile_auto_select_requires_no_technical_veto, true);
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

test("live signal proof prefers official regulatory sources over social and consultancy noise", () => {
  const policyPack = SIGNAL_PACKS.find((pack) => pack.key === "policy_regulatory");
  assert.ok(policyPack);

  const ranked = rankDiscoveryCandidatesForProof(policyPack, [
    {
      candidate_id: "linkedin",
      canonical_url: "https://www.linkedin.com/posts/example_compliance-deadline",
      canonical_domain: "linkedin.com",
      acquisition_json: {
        paths: [
          {
            title: "Compliance Deadline LinkedIn Post",
            snippet: "Public consultation and regulatory compliance deadline commentary.",
          },
        ],
      },
    },
    {
      candidate_id: "consultancy",
      canonical_url: "https://example-consulting.test/regulatory-compliance-deadlines",
      canonical_domain: "example-consulting.test",
      acquisition_json: {
        paths: [
          {
            title: "Regulatory Compliance Consultancy",
            snippet: "Schedule a consultation with compliance experts before the deadline.",
          },
        ],
      },
    },
    {
      candidate_id: "official",
      canonical_url: "https://www.federalregister.gov/documents/2026/05/20/example",
      canonical_domain: "federalregister.gov",
      acquisition_json: {
        paths: [
          {
            title: "Extending the Compliance Deadline",
            snippet: "Official regulatory notice with compliance deadline and public guidance.",
          },
        ],
      },
    },
  ]);

  assert.equal(ranked[0].candidate_id, "official");
  assert.equal(ranked.at(-1)?.candidate_id, "linkedin");
});

test("live signal proof prefers changelog sources over generic support pages", () => {
  const changelogPack = SIGNAL_PACKS.find((pack) => pack.key === "software_changelogs");
  assert.ok(changelogPack);

  const ranked = rankDiscoveryCandidatesForProof(changelogPack, [
    {
      candidate_id: "support-download",
      canonical_url: "https://support.apple.com/en-us/106445",
      canonical_domain: "support.apple.com",
      acquisition_json: {
        paths: [
          {
            title: "Download Windows Migration Assistant",
            snippet: "Migration assistant download support page.",
          },
        ],
      },
    },
    {
      candidate_id: "changelog",
      canonical_url: "https://github.blog/changelog/type/deprecations",
      canonical_domain: "github.blog",
      acquisition_json: {
        paths: [
          {
            title: "GitHub Changelog Deprecations",
            snippet: "Official changelog with deprecation notice, API changes and migration guidance.",
          },
        ],
      },
    },
  ]);

  assert.equal(ranked[0].candidate_id, "changelog");
});

test("live signal proof prefers official release notes over software support noise", () => {
  const changelogPack = SIGNAL_PACKS.find((pack) => pack.key === "software_changelogs");
  assert.ok(changelogPack);

  const ranked = rankDiscoveryCandidatesForProof(changelogPack, [
    {
      candidate_id: "generic-help",
      canonical_url: "https://learn.microsoft.com/en-us/answers/questions/5917628/deprecation-notice-received-yet-the-server-is-curr",
      canonical_domain: "learn.microsoft.com",
      acquisition_json: {
        paths: [
          {
            title: "Deprecation Notice received - Yet the server is current on updates",
            snippet: "Support question about a local server and updates.",
          },
        ],
      },
    },
    {
      candidate_id: "release-notes",
      canonical_url: "https://www.keycloak.org/docs/latest/release_notes/index.html",
      canonical_domain: "keycloak.org",
      acquisition_json: {
        paths: [
          {
            title: "Release Notes - Keycloak",
            snippet: "Official release notes with breaking changes, deprecations and migration guidance.",
          },
        ],
      },
    },
    {
      candidate_id: "tutorial",
      canonical_url: "https://example.dev/tutorial/api-migration-guide",
      canonical_domain: "example.dev",
      acquisition_json: {
        paths: [
          {
            title: "API migration guide tutorial",
            snippet: "Third-party tutorial and commentary about upgrading an API integration.",
          },
        ],
      },
    },
  ]);

  assert.equal(ranked[0].candidate_id, "release-notes");
  assert.equal(ranked.at(-1)?.candidate_id, "tutorial");
});

test("live signal proof prefers deprecation feeds over generic migration downloads", () => {
  const changelogPack = SIGNAL_PACKS.find((pack) => pack.key === "software_changelogs");
  assert.ok(changelogPack);

  const ranked = rankDiscoveryCandidatesForProof(changelogPack, [
    {
      candidate_id: "migration-download",
      canonical_url: "https://support.example.com/download/windows-migration-assistant",
      canonical_domain: "support.example.com",
      acquisition_json: {
        paths: [
          {
            title: "Download Windows Migration Assistant",
            snippet: "Generic support download without release history.",
          },
        ],
      },
    },
    {
      candidate_id: "deprecations",
      canonical_url: "https://developers.openai.com/api/docs/deprecations",
      canonical_domain: "developers.openai.com",
      acquisition_json: {
        paths: [
          {
            title: "Deprecations - API",
            snippet: "Official API deprecations with removed API versions and recommended migration replacements.",
          },
        ],
      },
    },
  ]);

  assert.equal(ranked[0].candidate_id, "deprecations");
});

export const PRODUCT_MEGA_FLOW_REQUIRED_FINAL_VERDICT = "pass";

export const PRODUCT_MEGA_FLOW_SCENARIOS = [
  {
    key: "example_a_listing_sources",
    example: "A",
    label: "Example A — recurring listing sources",
    productDomain: "recurring listing source discovery",
    fixtureNamespace: "mega_flow_example_a_listings",
    discoveryCaseKey: "example_a_listing_sources",
  },
  {
    key: "example_b_editorial_updates",
    example: "B",
    label: "Example B — editorial update sources",
    productDomain: "editorial update source discovery",
    fixtureNamespace: "mega_flow_example_b_editorial",
    discoveryCaseKey: "example_b_editorial_updates",
  },
  {
    key: "example_c_public_notices",
    example: "C",
    label: "Example C — public notice sources",
    productDomain: "public notice source discovery",
    fixtureNamespace: "mega_flow_example_c_notices",
    discoveryCaseKey: "example_c_public_notices",
  },
];

export const PRODUCT_MEGA_FLOW_REQUIRED_COMMANDS = [
  command("channel-auth-compose", "provider-fixtures", ["test:channel-auth:compose"], {
    proves: ["rss-channel-auth", "website-channel-auth", "api-channel-auth", "email-imap-channel-auth"],
    maxAttempts: 2,
  }),
  command("providers-compose", "provider-fixtures", ["test:providers:compose"], {
    proves: ["api-downstream", "email-imap-downstream"],
  }),
  command("website-compose", "provider-fixtures", ["test:website:compose"], {
    proves: ["website-downstream", "resource-sequence-success", "signal_candidate-sequence-success"],
  }),
  command("web-viewports", "surface-fixtures", ["test:web:viewports"], {
    proves: ["web-selected-item-display"],
    maxAttempts: 2,
  }),
  command("web-ui-audit", "surface-fixtures", ["test:web:ui-audit"], {
    proves: ["saved-digest", "notification-feedback", "admin-automation-buttons"],
    maxAttempts: 2,
  }),
  command("mcp-compose", "operator-fixtures", ["test:mcp:compose"], {
    proves: [
      "mcp-canonical-reads",
      "content-analysis-policy",
      "content-filter-policy",
      "sequence-cancel",
      "sequence-fail",
      "sequence-retry",
    ],
    requiredArtifactKind: "deterministic-mcp-http-proof",
  }),
];

function command(key, lane, args, metadata = {}) {
  return {
    key,
    lane,
    executable: "pnpm",
    args,
    ...metadata,
  };
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value != null && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function commandPassed(commandResults, key) {
  return asArray(commandResults).some((item) => item.key === key && item.status === "passed");
}

function readProfileKey(profile) {
  return normalizeText(profile?.profileKey) || normalizeText(profile?.profile_key);
}

function sumEvidenceRows(caseRun) {
  return [...asArray(caseRun?.baselineEvidence), ...asArray(caseRun?.discoveryEvidence)];
}

function countSelectedRows(caseRun) {
  return sumEvidenceRows(caseRun).reduce((total, row) => {
    const finalSelection = asObject(row?.finalSelection);
    return total + Number(finalSelection.selected ?? 0);
  }, 0);
}

function countLiveSelectionProofRows(proof) {
  return asArray(proof?.selectedSignalCandidates).length;
}

function countInterestFilterRows(caseRun) {
  return sumEvidenceRows(caseRun).reduce(
    (total, row) => total + asArray(row?.interestFilterResults).length,
    0
  );
}

function countDownstreamRows(caseRun) {
  return sumEvidenceRows(caseRun).filter((row) => {
    const finalSelection = asObject(row?.finalSelection);
    const systemFeed = asObject(row?.systemFeed);
    return (
      asArray(row?.fetchRuns).length > 0
      || asArray(row?.signal_candidates).length > 0
      || asArray(row?.interestFilterResults).length > 0
      || Number(finalSelection.total ?? 0) > 0
      || Number(systemFeed.total ?? 0) > 0
    );
  }).length;
}

function countPositiveDiscoveryEndpoints(caseRun) {
  const allEndpoints = [
    ...asArray(caseRun?.vnextLane?.sourceInventory),
    ...asArray(caseRun?.vnextLane?.candidates),
    ...asArray(caseRun?.artifactLane?.candidates),
  ];
  return allEndpoints.filter((endpoint) => {
    const decision = normalizeText(endpoint?.decision ?? endpoint?.recommendedAction).toLowerCase();
    return decision === "approved" || decision === "promoted" || decision === "duplicate";
  }).length;
}

function classifyMissingLiveSelection(caseRun, liveDiscovery) {
  if (liveDiscovery.selectedFinalRows > 0) {
    return null;
  }
  if (liveDiscovery.finalVerdict !== "pass") {
    return "live_discovery_not_passing";
  }
  if (liveDiscovery.downstreamEvidenceRows <= 0) {
    return "no_live_downstream_evidence";
  }
  if (liveDiscovery.interestFilterRows <= 0) {
    return "no_interest_filter_rows_for_live_signal_candidates";
  }
  if (liveDiscovery.positiveDiscoveryEndpoints <= 0) {
    return "no_positive_live_discovery_endpoint";
  }

  const fetchOnlyRows = sumEvidenceRows(caseRun).filter((row) => {
    const finalSelection = asObject(row?.finalSelection);
    return asArray(row?.fetchRuns).length > 0
      && asArray(row?.signal_candidates).length === 0
      && asArray(row?.interestFilterResults).length === 0
      && Number(finalSelection.total ?? 0) === 0;
  });
  if (fetchOnlyRows.length > 0) {
    return "live_fetch_succeeded_but_no_current_window_signal_candidate_selection";
  }

  return "live_signal_candidates_not_selected_by_interest_policy";
}

function mcpArtifactHasScenario(mcpArtifact, scenarioKey) {
  return asArray(mcpArtifact?.scenarios).some(
    (scenario) => scenario?.key === scenarioKey && !scenario?.error
  );
}

export function summarizeFilterBucketEvidence(input) {
  const caseRun = input?.caseRun ?? {};
  const commandResults = asArray(input?.commandResults);
  const mcpArtifact = input?.mcpArtifact ?? null;
  const selectedRows = countSelectedRows(caseRun);
  const interestFilterRows = countInterestFilterRows(caseRun);
  const deterministicSelectionPassed = commandPassed(commandResults, "web-viewports");
  const deterministicPolicyPassed = commandPassed(commandResults, "mcp-compose");
  const mcpContentAnalysisPassed = mcpArtifactHasScenario(
    mcpArtifact,
    "content-analysis-operator-flows"
  );

  return {
    selected: {
      passed: selectedRows > 0 || deterministicSelectionPassed,
      source:
        selectedRows > 0
          ? "live-discovery-final-selection"
          : "deterministic-product-fixture-selection",
      count: selectedRows > 0 ? selectedRows : Number(deterministicSelectionPassed),
      liveSelectedRows: selectedRows,
      deterministicFixturePassed: deterministicSelectionPassed,
    },
    negativeKeywordsRejected: {
      passed: deterministicPolicyPassed,
      source: "deterministic-mcp-policy-fixtures",
    },
    contentKindOrTimeWindowRejected: {
      passed: deterministicPolicyPassed,
      source:
        interestFilterRows > 0
          ? "live-interest-filter-results-plus-mcp-policy-fixtures"
          : "deterministic-mcp-policy-fixtures",
      interestFilterRows,
    },
    contentFilterHeldOrRejected: {
      passed: mcpContentAnalysisPassed,
      source: "deterministic-mcp-content-filter-policy",
    },
    duplicateCanonicalFamily: {
      passed:
        commandPassed(commandResults, "providers-compose")
        || countPositiveDiscoveryEndpoints(caseRun) > 0,
      source: "provider-preflight-or-live-discovery-duplicate-endpoints",
    },
  };
}

export function summarizeSequenceEvidence(input) {
  const commandResults = asArray(input?.commandResults);
  const mcpArtifact = input?.mcpArtifact ?? null;
  const sequenceOperatorPassed = mcpArtifactHasScenario(mcpArtifact, "sequence-operator-flows");

  return {
    resourceIngestSuccess: {
      passed: commandPassed(commandResults, "website-compose"),
      source: "website-compose-resource-sequence",
    },
    signalCandidateIngestSuccess: {
      passed: commandPassed(commandResults, "website-compose"),
      source: "website-compose-signal_candidate-sequence",
    },
    enrichmentContentAnalysisSuccess: {
      passed: mcpArtifactHasScenario(mcpArtifact, "content-analysis-operator-flows"),
      source: "mcp-content-analysis-operator-flow",
    },
    notificationDigestSuccess: {
      passed: commandPassed(commandResults, "web-ui-audit"),
      source: "web-ui-audit-saved-digest-and-notification",
    },
    cancelPath: {
      passed: sequenceOperatorPassed,
      source: "mcp-sequence-operator-flow",
    },
    failurePath: {
      passed: sequenceOperatorPassed,
      source: "mcp-sequence-operator-flow",
    },
    retryPath: {
      passed: sequenceOperatorPassed,
      source: "mcp-sequence-operator-flow",
    },
  };
}

export function summarizeSurfaceEvidence(input) {
  const commandResults = asArray(input?.commandResults);
  const mcpArtifact = input?.mcpArtifact ?? null;

  return {
    web: {
      passed: commandPassed(commandResults, "web-viewports"),
      source: "web-viewports",
    },
    admin: {
      passed:
        commandPassed(commandResults, "discovery-admin-compose")
        && commandPassed(commandResults, "channel-auth-compose"),
      source: "discovery-admin-compose-plus-channel-auth-compose",
    },
    mcp: {
      passed:
        commandPassed(commandResults, "mcp-compose")
        && mcpArtifactHasScenario(mcpArtifact, "read-only-operator-needs")
        && mcpArtifactHasScenario(mcpArtifact, "template-interest-channel-flows"),
      source: "mcp-compose",
    },
  };
}

export function summarizeProviderEvidence(commandResults) {
  return {
    rss: {
      passed: commandPassed(commandResults, "channel-auth-compose"),
      source: "channel-auth-compose",
    },
    website: {
      passed:
        commandPassed(commandResults, "website-compose")
        && commandPassed(commandResults, "channel-auth-compose"),
      source: "website-compose-plus-channel-auth-compose",
    },
    api: {
      passed:
        commandPassed(commandResults, "providers-compose")
        && commandPassed(commandResults, "channel-auth-compose"),
      source: "providers-compose-plus-channel-auth-compose",
    },
    emailImap: {
      passed:
        commandPassed(commandResults, "providers-compose")
        && commandPassed(commandResults, "channel-auth-compose"),
      source: "providers-compose-plus-channel-auth-compose",
    },
  };
}

function allBucketsPassed(summary) {
  return Object.values(summary).every((item) => item?.passed === true);
}

export function buildProductMegaFlowScenarioSummary(input) {
  const scenario = input?.scenario ?? {};
  const discoveryReport = input?.discoveryReport ?? {};
  const commandResults = asArray(input?.commandResults);
  const mcpArtifact = input?.mcpArtifact ?? null;
  const liveSelectionProof = asObject(input?.liveSelectionProof);
  const scenarioLiveSelectionProof = asObject(liveSelectionProof[scenario.key]);
  const caseRun = asArray(discoveryReport?.caseRuns).find(
    (item) => item?.key === scenario.discoveryCaseKey || item?.key === scenario.key
  );
  const providerEvidence = summarizeProviderEvidence(commandResults);
  const filterEvidence = summarizeFilterBucketEvidence({ caseRun, commandResults, mcpArtifact });
  const sequenceEvidence = summarizeSequenceEvidence({ commandResults, mcpArtifact });
  const surfaceEvidence = summarizeSurfaceEvidence({ commandResults, mcpArtifact });
  const discoverySelectedRows = countSelectedRows(caseRun);
  const replaySelectedRows = countLiveSelectionProofRows(scenarioLiveSelectionProof);
  const liveDiscovery = {
    runtimeVerdict: normalizeText(caseRun?.runtimeVerdict) || "fail",
    yieldVerdict: normalizeText(caseRun?.yieldVerdict) || "fail",
    finalVerdict:
      normalizeText(discoveryReport?.finalVerdict) === "pass"
      && normalizeText(caseRun?.runtimeVerdict) === "pass"
      && normalizeText(caseRun?.yieldVerdict) === "pass"
        ? "pass"
        : "fail",
    selectedFinalRows: discoverySelectedRows + replaySelectedRows,
    discoverySelectedFinalRows: discoverySelectedRows,
    replaySelectedFinalRows: replaySelectedRows,
    downstreamEvidenceRows: countDownstreamRows(caseRun),
    interestFilterRows: countInterestFilterRows(caseRun),
    positiveDiscoveryEndpoints: countPositiveDiscoveryEndpoints(caseRun),
    rootCauseClassification: caseRun?.rootCauseClassification ?? null,
  };
  const liveSelectedSignalCandidateEvidence = {
    passed: liveDiscovery.selectedFinalRows > 0,
    source:
      discoverySelectedRows > 0
        ? "live-discovery-final-selection"
        : replaySelectedRows > 0
          ? "live-proof-selection-replay"
        : "missing",
    selectedFinalRows: liveDiscovery.selectedFinalRows,
    discoverySelectedFinalRows: discoverySelectedRows,
    replaySelectedFinalRows: replaySelectedRows,
    selectedSignalCandidates: asArray(scenarioLiveSelectionProof.selectedSignalCandidates),
    residualReason: classifyMissingLiveSelection(caseRun, liveDiscovery),
  };
  const adminManagedTruth = {
    passed: Boolean(
      caseRun?.materializedProfile
      && readProfileKey(caseRun?.materializedProfile)
      && caseRun?.manualReplaySettings
    ),
    profileKey: readProfileKey(caseRun?.materializedProfile) || null,
  };
  const liveDiscoveryAccepted =
    liveDiscovery.finalVerdict === "pass"
    && liveDiscovery.downstreamEvidenceRows > 0
    && liveDiscovery.positiveDiscoveryEndpoints > 0
    && liveSelectedSignalCandidateEvidence.passed;
  const passed =
    adminManagedTruth.passed
    && liveDiscoveryAccepted
    && allBucketsPassed(providerEvidence)
    && allBucketsPassed(filterEvidence)
    && allBucketsPassed(sequenceEvidence)
    && allBucketsPassed(surfaceEvidence);

  return {
    key: scenario.key,
    example: scenario.example,
    label: scenario.label,
    productDomain: scenario.productDomain,
    fixtureNamespace: scenario.fixtureNamespace,
    status: passed ? "passed" : "failed",
    adminManagedTruth,
    liveDiscoveryAccepted,
    liveDiscovery,
    liveSelectedSignalCandidateEvidence,
    providerEvidence,
    filterEvidence,
    sequenceEvidence,
    surfaceEvidence,
  };
}

export function determineProductMegaFlowVerdict(input) {
  const discoveryReport = input?.discoveryReport ?? {};
  const commandResults = asArray(input?.commandResults);
  const mcpArtifact = input?.mcpArtifact ?? null;
  const yieldProofReport = input?.yieldProofReport ?? null;
  const scenarios = asArray(input?.scenarios).length > 0
    ? asArray(input.scenarios)
    : PRODUCT_MEGA_FLOW_SCENARIOS;
  const scenarioSummaries = scenarios.map((scenario) =>
    buildProductMegaFlowScenarioSummary({
      scenario,
      discoveryReport,
      commandResults,
      mcpArtifact,
      liveSelectionProof: input?.liveSelectionProof ?? null,
    })
  );
  const commandFailures = commandResults.filter((item) => item.status !== "passed");
  const discoveryFinalVerdict = normalizeText(discoveryReport?.finalVerdict) || "fail";
  const discoveryRuntimeVerdict = normalizeText(discoveryReport?.runtimeVerdict) || "fail";
  const discoveryYieldVerdict = normalizeText(discoveryReport?.yieldVerdict) || "fail";
  const yieldProofRequired = yieldProofReport != null;
  const yieldProofFinalVerdict = yieldProofRequired
    ? normalizeText(yieldProofReport?.finalVerdict) || "fail"
    : "not_required";
  const runtimeVerdict =
    discoveryRuntimeVerdict === "pass"
    && commandFailures.length === 0
    && scenarioSummaries.every((item) => item.liveDiscovery.runtimeVerdict === "pass")
      ? "pass"
      : "fail";
  const yieldVerdict =
    runtimeVerdict === "pass"
    && discoveryYieldVerdict === "pass"
    && (!yieldProofRequired || yieldProofFinalVerdict === "pass")
    && scenarioSummaries.every((item) => item.status === "passed")
      ? "pass"
      : "fail";
  const finalVerdict =
    runtimeVerdict === "pass"
    && yieldVerdict === "pass"
    && discoveryFinalVerdict === PRODUCT_MEGA_FLOW_REQUIRED_FINAL_VERDICT
      ? "pass"
      : "fail";

  return {
    runtimeVerdict,
    yieldVerdict,
    finalVerdict,
    discoveryFinalVerdict,
    yieldProofFinalVerdict,
    commandFailures,
    scenarioSummaries,
  };
}

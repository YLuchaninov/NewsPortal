function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function preflightStatusSucceeded(status) {
  return status === "passed" || status === "skipped";
}

function formatInterestTable(rows) {
  const header = ["| Interest | Status |", "| --- | --- |"];
  for (const row of rows) {
    header.push(`| ${row.interestName} | ${row.status} |`);
  }
  return header.join("\n");
}

export function formatDiscoveryCaseMarkdown(caseRun) {
  const approvedOrPromoted = [
    ...caseRun.graphLane.candidates.filter((item) => item.decision === "approved"),
    ...caseRun.recallLane.candidates.filter(
      (item) => item.decision === "promoted" || item.decision === "duplicate"
    ),
  ];
  const downstreamSummary = caseRun.downstreamEvidence
    .map((evidence) => {
      const filterRows = evidence.interestFilterResults?.length ?? 0;
      const finalSelected = evidence.finalSelection?.selected ?? 0;
      const systemEligible = evidence.systemFeed?.eligible ?? 0;
      const lane = evidence.lane || "unknown";
      return `- ${evidence.channelName || evidence.channelId} (${lane}): filters=${filterRows}, selected=${finalSelected}, eligible=${systemEligible}`;
    })
    .join("\n");

  return [
    `## ${caseRun.label}`,
    ``,
    `Status: \`${caseRun.status}\``,
    `Runtime verdict: \`${caseRun.runtimeVerdict}\``,
    `Yield verdict: \`${caseRun.yieldVerdict}\``,
    `Pack class: \`${caseRun.packClass}\``,
    `Root cause: \`${caseRun.rootCauseClassification}\``,
    ``,
    `Manual replay profile: \`${caseRun.manualReplaySettings?.profile?.profileKey || "n/a"}\` · ${caseRun.manualReplaySettings?.profile?.displayName || "n/a"} · applied graph v${caseRun.manualReplaySettings?.graphMission?.appliedProfileVersion ?? "—"} · applied recall v${caseRun.manualReplaySettings?.recallMission?.appliedProfileVersion ?? "—"}`,
    ``,
    `Approved/promoted channels: ${approvedOrPromoted.length}`,
    `Yield summary: reviewed=${caseRun.yieldSummary.candidatesReviewed}, benchmark_like=${caseRun.yieldSummary.benchmarkLikeCandidatesFound}, approved_or_promoted=${caseRun.yieldSummary.candidatesApprovedOrPromoted}, onboarded=${caseRun.yieldSummary.channelsOnboarded}, downstream=${caseRun.yieldSummary.channelsWithDownstreamEvidence}, covered_interests=${caseRun.yieldSummary.interestsCoveredDownstream}`,
    `Evidence funnel: fetch_runs=${caseRun.yieldSummary.channelsWithFetchRuns}, articles=${caseRun.yieldSummary.channelsWithArticles}, interest_filters=${caseRun.yieldSummary.channelsWithInterestFilterResults}, final_selection=${caseRun.yieldSummary.channelsWithFinalSelectionResults}`,
    `Baseline evidence: successful_fetches=${caseRun.yieldSummary.baselineSuccessfulFetches ?? 0}, required=${caseRun.yieldSummary.minimumBaselineSuccessfulFetches ?? 0}`,
    `Content-analysis evidence: \`${caseRun.contentAnalysisEvidence?.status ?? "unknown"}\``,
    ``,
    approvedOrPromoted.length > 0
      ? approvedOrPromoted
          .map((row) => `- ${row.title || row.url} -> ${row.registeredChannelId || "no_channel_id"}`)
          .join("\n")
      : "- none",
    ``,
    `Per-interest coverage`,
    ``,
    formatInterestTable(caseRun.coverageMatrix),
    ``,
    `Downstream evidence`,
    ``,
    downstreamSummary || "- none",
    ``,
    `Content-analysis counts`,
    ``,
    `- analyses: ${JSON.stringify(caseRun.contentAnalysisEvidence?.analysisTypeCounts ?? {})}`,
    `- entities: ${JSON.stringify(caseRun.contentAnalysisEvidence?.entityTypeCounts ?? {})}`,
    `- labels: ${JSON.stringify(caseRun.contentAnalysisEvidence?.labelTypeCounts ?? {})}`,
    `- filter modes: ${JSON.stringify(caseRun.contentAnalysisEvidence?.filterModes ?? {})}`,
    ...(asArray(caseRun.contentAnalysisEvidence?.failures).length > 0
      ? asArray(caseRun.contentAnalysisEvidence.failures).map((failure) => `- failure: ${failure}`)
      : ["- failures: none"]),
    ``,
    `Weak-yield reasons`,
    ``,
    Object.keys(caseRun.yieldSummary.weakYieldReasons).length > 0
      ? Object.entries(caseRun.yieldSummary.weakYieldReasons)
          .map(([key, count]) => `- ${key}: ${count}`)
          .join("\n")
      : "- none",
    ``,
    `Normalized reason buckets`,
    ``,
    Object.entries(caseRun.yieldSummary.normalizedReasonBuckets ?? {})
      .map(([key, count]) => `- ${key}: ${count}`)
      .join("\n"),
    ``,
    `Stage loss buckets`,
    ``,
    Object.entries(caseRun.yieldSummary.stageLossBuckets ?? {})
      .map(([key, count]) => `- ${key}: ${count}`)
      .join("\n"),
    ``,
    `Productivity buckets`,
    ``,
    Object.entries(caseRun.yieldSummary.productivityBuckets ?? {})
      .map(([key, count]) => `- ${key}: ${count}`)
      .join("\n"),
    ``,
    `Top rejected domains`,
    ``,
    caseRun.yieldSummary.topRejectedDomains.length > 0
      ? caseRun.yieldSummary.topRejectedDomains
          .map((item) => `- ${item.domain}: ${item.count}`)
          .join("\n")
      : "- none",
    ``,
    `Top rejected tactics`,
    ``,
    caseRun.yieldSummary.topRejectedTactics.length > 0
      ? caseRun.yieldSummary.topRejectedTactics
          .map((item) => `- ${item.tactic}: ${item.count}`)
          .join("\n")
      : "- none",
    ``,
    `Benchmark-like candidates`,
    ``,
    `- found: ${caseRun.yieldSummary.benchmarkLikeCandidatesFound}`,
    `- rejected: ${caseRun.yieldSummary.benchmarkLikeCandidatesRejected}`,
    ...Object.entries(caseRun.yieldSummary.benchmarkLikeRejectedReasons).map(
      ([key, count]) => `- ${key}: ${count}`
    ),
    ``,
    `Manual replay settings`,
    ``,
    `- profile key: ${caseRun.manualReplaySettings?.profile?.profileKey || "n/a"}`,
    `- profile display name: ${caseRun.manualReplaySettings?.profile?.displayName || "n/a"}`,
    `- graph preferred domains: ${(caseRun.manualReplaySettings?.graphPolicy?.preferredDomains ?? []).join(", ") || "—"}`,
    `- graph blocked domains: ${(caseRun.manualReplaySettings?.graphPolicy?.blockedDomains ?? []).join(", ") || "—"}`,
    `- recall preferred domains: ${(caseRun.manualReplaySettings?.recallPolicy?.preferredDomains ?? []).join(", ") || "—"}`,
    `- recall blocked domains: ${(caseRun.manualReplaySettings?.recallPolicy?.blockedDomains ?? []).join(", ") || "—"}`,
    `- benchmark domains: ${(caseRun.manualReplaySettings?.yieldBenchmark?.domains ?? []).join(", ") || "—"}`,
    `- graph seed topics: ${(caseRun.manualReplaySettings?.graphMission?.seedTopics ?? []).join(" | ") || "—"}`,
    `- recall seed queries: ${(caseRun.manualReplaySettings?.recallMission?.seedQueries ?? []).join(" | ") || "—"}`,
    ``,
  ].join("\n");
}

export function formatDiscoveryEvidenceMarkdown(report) {
  return [
    `# Live Discovery Case Pack Evidence`,
    ``,
    `Run id: \`${report.runId}\``,
    `Started at: \`${report.startedAt}\``,
    `Runtime verdict: \`${report.runtimeVerdict}\``,
    `Yield verdict: \`${report.yieldVerdict}\``,
    `Final verdict: \`${report.finalVerdict}\``,
    ``,
    `## Preflight`,
    ``,
    `- DDGS-only guard: \`${report.ddgsOnlyGuard.status}\``,
    `- Preconditions: ${
      report.preconditions.every((item) => item.status === "passed") ? "`passed`" : "`failed`"
    }`,
    `- Proof commands: ${
      report.preflight.every((item) => preflightStatusSucceeded(item.status)) ? "`passed`" : "`failed`"
    }`,
    `- Calibration: \`${report.calibrationPassed ? "passed" : "failed"}\``,
    `- Runtime case packs: ${report.enabledCasePacks.runtime.map((item) => `\`${item.shortLabel}\``).join(", ") || "none"}`,
    `- Validation case packs: ${report.enabledCasePacks.validation.map((item) => `\`${item.shortLabel}\``).join(", ") || "none"}`,
    ``,
    ...report.preflight.map((item) => {
      const suffix = item.reason ? ` (${item.reason})` : "";
      return `- ${item.name}: \`${item.status}\`${suffix}`;
    }),
    ``,
    `## Calibration`,
    ``,
    ...report.calibration.map(
      (item) =>
        `- ${item.label}: \`${item.passed ? "passed" : "failed"}\` (${item.matched}/${item.total}, agreement=${item.agreementRatio.toFixed(2)}, min=${item.minimumAgreement.toFixed(2)})`
    ),
    ``,
    `## Aggregate Root Causes`,
    ``,
    `- Dominant root cause: \`${report.aggregateYieldDiagnostics?.dominantRootCause || "n/a"}\``,
    ...Object.entries(report.aggregateYieldDiagnostics?.counts ?? {}).map(
      ([key, count]) => `- ${key}: ${count}`
    ),
    ``,
    ...report.caseRuns.map((caseRun) => formatDiscoveryCaseMarkdown(caseRun)),
  ].join("\n");
}

export function parseJsonArtifactPath(output) {
  const matches = [...String(output).matchAll(/Wrote JSON evidence to (.+\.json)/g)];
  const last = matches.at(-1);
  return last ? last[1].trim() : "";
}

export function formatYieldProofMarkdown(report) {
  const perCase = Array.isArray(report.multiRun?.perCase) ? report.multiRun.perCase : [];
  const aggregateRootCauses = report.multiRun?.aggregateRootCauses ?? {};
  return [
    "# Live Discovery Yield Proof",
    "",
    `Run id: \`${report.runId}\``,
    `Started at: \`${report.startedAt}\``,
    `Runtime verdict: \`${report.runtimeVerdict}\``,
    `Yield verdict: \`${report.yieldVerdict}\``,
    `Final verdict: \`${report.finalVerdict}\``,
    "",
    "## Aggregated runs",
    "",
    ...report.runs.map(
      (item, index) =>
        `- Run ${index + 1}: path=\`${item.jsonPath || "missing"}\`, final=\`${item.finalVerdict}\`, runtime=\`${item.runtimeVerdict}\`, yield=\`${item.yieldVerdict}\`, calibration=\`${item.calibrationPassed ? "passed" : "failed"}\`, dominant_root_cause=\`${item.aggregateYieldDiagnostics?.dominantRootCause || "n/a"}\``
    ),
    "",
    "## Per-case yield counts",
    "",
    ...(perCase.length > 0
      ? perCase.map((item) => {
          const rootCauseSummary = Object.entries(item.rootCauseCounts ?? {})
            .map(([key, count]) => `${key}:${count}`)
            .join(", ");
          return `- ${item.label}: ${item.passingRuns}/${item.totalRuns} passing runs (required ${report.multiRun?.requiredPassingRuns ?? "n/a"}); root_causes=[${rootCauseSummary || "none"}]`;
        })
      : ["- Multi-run summary unavailable because the proof stopped early."]),
    "",
    "## Aggregate Root Causes",
    "",
    ...(Object.keys(aggregateRootCauses).length > 0
      ? Object.entries(aggregateRootCauses).map(([key, count]) => `- ${key}: ${count}`)
      : ["- None recorded."]),
  ].join("\n");
}

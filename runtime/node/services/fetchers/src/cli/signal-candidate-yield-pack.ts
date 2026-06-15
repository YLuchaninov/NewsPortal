import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  asPlainObject,
  toMetricRow,
  type JsonRecord,
  type SignalCandidateYieldSnapshot,
} from "./signal-candidate-yield-types";

async function writeJson(targetPath: string, value: unknown): Promise<void> {
  await writeFile(targetPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function renderBulletList(rows: Array<{ label: string; detail: string }>): string {
  if (rows.length === 0) {
    return "- none";
  }

  return rows
    .map((row) => `- ${row.label}: ${row.detail}`)
    .join("\n");
}

function renderAnalysisMarkdown(snapshot: SignalCandidateYieldSnapshot): string {
  const baseline = snapshot.baseline;
  const lossBuckets = Array.isArray(snapshot.analysis.lossBuckets)
    ? (snapshot.analysis.lossBuckets as JsonRecord[])
    : [];
  const rootCauses = Array.isArray(snapshot.analysis.rootCauses)
    ? (snapshot.analysis.rootCauses as JsonRecord[])
    : [];
  const failureCohorts = Array.isArray(snapshot.analysis.failureCohorts)
    ? (snapshot.analysis.failureCohorts as JsonRecord[])
    : [];
  const duplicateFamilies = Array.isArray(snapshot.analysis.duplicateFamilies)
    ? (snapshot.analysis.duplicateFamilies as JsonRecord[])
    : [];
  const nearThresholdTemplates = Array.isArray(snapshot.analysis.nearThresholdTemplates)
    ? (snapshot.analysis.nearThresholdTemplates as JsonRecord[])
    : [];
  const falsePositiveWinners = Array.isArray(snapshot.analysis.falsePositiveWinners)
    ? (snapshot.analysis.falsePositiveWinners as JsonRecord[])
    : [];

  return `# SignalCandidate Yield Diagnostics

Generated at: ${snapshot.generatedAt}

## Baseline

- Active RSS channels: ${toMetricRow(baseline, "activeRssChannels")}
- Fetch runs: ${toMetricRow(baseline, "fetchRuns")}
- SignalCandidate rows: ${toMetricRow(baseline, "signalCandidateRows")}
- Distinct URLs: ${toMetricRow(baseline, "distinctUrls")}
- System feed rows: ${toMetricRow(baseline, "systemFeedRows")}
- Eligible rows: ${toMetricRow(baseline, "eligibleRows")}
- Filtered rows: ${toMetricRow(baseline, "filteredRows")}
- Pending signal_candidate.ingest.requested runs: ${toMetricRow(baseline, "pendingSignalCandidateIngestRuns")}
- Transient fetch failures: ${toMetricRow(baseline, "transientFetchFailures")}

## Loss Buckets

${renderBulletList(
    lossBuckets.map((bucket) => ({
      label: String(bucket.bucket ?? "unknown"),
      detail: `${bucket.count ?? 0} ${String(bucket.unit ?? "items")}`
    }))
  )}

## Root Cause Rank

${renderBulletList(
    rootCauses.map((cause) => ({
      label: `#${cause.rank ?? "?"} ${String(cause.bucket ?? "unknown")}`,
      detail: `${cause.count ?? 0} ${String(cause.unit ?? "items")} — ${String(
        cause.reason ?? ""
      )}`.trim()
    }))
  )}

## Failure Cohorts

${renderBulletList(
    failureCohorts.slice(0, 10).map((row) => ({
      label: `${String(row.host ?? "unknown")} / ${String(row.errorFamily ?? "unknown")}`,
      detail: `${row.channelCount ?? 0} channels`
    }))
  )}

## Duplicate Families

${renderBulletList(
    duplicateFamilies.slice(0, 10).map((row) => ({
      label: `${String(row.host ?? "unknown")} / ${String(row.country ?? "global")}`,
      detail: `${row.duplicateRows ?? 0} duplicate rows over ${row.distinctUrls ?? 0} distinct URLs`
    }))
  )}

## Near-Threshold Templates

${renderBulletList(
    nearThresholdTemplates.slice(0, 10).map((row) => ({
      label: String(row.criterionDescription ?? "unknown"),
      detail: `${row.nearThresholdRows ?? 0} near-threshold rows, max score ${row.maxScore ?? "0"}`
    }))
  )}

## False-Positive Winners

${renderBulletList(
    falsePositiveWinners.slice(0, 12).map((row) => ({
      label: String(row.title ?? "untitled"),
      detail: `${String(row.cohort ?? "candidate")} via ${String(row.channelName ?? "unknown channel")} (${String(
        row.host ?? "unknown host"
      )})`
    }))
  )}
`;
}

export async function writeSnapshotPack(
  snapshot: SignalCandidateYieldSnapshot,
  targetDir: string
): Promise<void> {
  await mkdir(targetDir, { recursive: true });
  await Promise.all([
    writeJson(path.join(targetDir, "snapshot.json"), snapshot),
    writeJson(path.join(targetDir, "baseline.json"), snapshot.baseline),
    writeJson(path.join(targetDir, "views.json"), snapshot.views),
    writeJson(path.join(targetDir, "samples.json"), snapshot.samples),
    writeJson(path.join(targetDir, "analysis.json"), snapshot.analysis),
    writeFile(path.join(targetDir, "analysis.md"), renderAnalysisMarkdown(snapshot), "utf8"),
    writeJson(path.join(targetDir, "channel-health.json"), snapshot.views.channelHealth),
    writeJson(path.join(targetDir, "fetch-outcome-breakdown.json"), snapshot.views.fetchOutcomeBreakdown),
    writeJson(path.join(targetDir, "pipeline-runs.json"), snapshot.views.pipelineRuns),
    writeJson(path.join(targetDir, "signal_candidate-state-distribution.json"), snapshot.views.signalCandidateStateDistribution),
    writeJson(path.join(targetDir, "url-ratio.json"), snapshot.views.urlRatio),
    writeJson(path.join(targetDir, "duplicate-url-groups.json"), snapshot.views.topDuplicateUrlGroups),
    writeJson(path.join(targetDir, "criterion-score-histogram.json"), snapshot.views.criterionScoreHistogram),
    writeJson(path.join(targetDir, "near-threshold-rows.json"), snapshot.views.topNearThresholdRows),
    writeJson(path.join(targetDir, "eligible-rows.json"), snapshot.views.currentEligibleRows)
  ]);
}

export async function writeComparisonPack(
  comparison: JsonRecord,
  targetDir: string
): Promise<void> {
  await mkdir(targetDir, { recursive: true });
  await writeJson(path.join(targetDir, "comparison.json"), comparison);
  const eligibleSetCheck = asPlainObject(comparison.eligibleSetCheck);
  const deltas = asPlainObject(comparison.deltas);
  const body = `# Before / After Comparison

- Pending signal_candidate.ingest.requested delta: ${deltas.pendingSignalCandidateIngestRuns ?? 0}
- Transient fetch failure delta: ${deltas.transientFetchFailures ?? 0}
- Duplicate row delta: ${deltas.duplicateRows ?? 0}
- Eligible row delta: ${deltas.eligibleRows ?? 0}
- Missing previously eligible doc IDs: ${
    Array.isArray(eligibleSetCheck.missingPreviouslyEligibleDocIds)
      ? (eligibleSetCheck.missingPreviouslyEligibleDocIds as unknown[]).length
      : 0
  }
- New eligible doc IDs: ${
    Array.isArray(eligibleSetCheck.newEligibleDocIds)
      ? (eligibleSetCheck.newEligibleDocIds as unknown[]).length
      : 0
  }
`;
  await writeFile(path.join(targetDir, "comparison.md"), body, "utf8");
}

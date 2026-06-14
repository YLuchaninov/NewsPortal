import { readOptionalString } from "../protocol";
import type { McpToolContext } from "../tools/shared";
import { OPERATING_DOMAIN_REGISTRY, OPERATING_DOMAIN_VALUES, type OperatingDomain } from "./model";
import { compactRows, readEntityIds, readSinceHours } from "./guidance-common";
import { isRecord } from "./shared";
import { buildSystemHealth } from "./system-health";

export async function explainOperatorIssue(context: McpToolContext, args: Record<string, unknown>) {
  const symptom = readOptionalString(args.symptom) ?? "general operational issue";
  const domain = (readOptionalString(args.domain) ?? inferDomainFromSymptom(symptom)) as OperatingDomain;
  const sinceHours = readSinceHours(args.sinceHours, 24);
  const includeSamples = args.includeSamples === true;
  const entityIds = readEntityIds(args.entityIds);
  const guide = OPERATING_DOMAIN_REGISTRY[domain];
  const health = await buildSystemHealth(context, {
    domains: [domain],
    sinceHours,
    includeSamples,
  });
  const selectionStalePassThrough =
    isRecord(health.health) && isRecord(health.health.selectionStalePassThrough)
      ? health.health.selectionStalePassThrough
      : {};
  const stalePassThroughCount = Number(selectionStalePassThrough.stalePassThroughCount ?? 0);
  const likelyCauses =
    domain === "selection" && stalePassThroughCount > 0 && guide
      ? [
          "selection backfill needed: selected/pass_through rows exist with total_filter_count=0 and no system_criterion interest_filter_results",
          ...guide.commonCauses,
        ]
      : guide?.commonCauses;

  return {
    generatedAt: new Date().toISOString(),
    symptom,
    domain,
    sourceOfTruth: health.sourceOfTruth,
    diagnosis: guide
      ? {
          lifecycle: guide.lifecycle,
          likelyCauses,
          normalStatesToCheck: guide.normalStates,
          readBackChecks: guide.readBackChecks,
        }
      : {
          unknownDomain: domain,
          knownDomains: OPERATING_DOMAIN_VALUES,
        },
    evidence: {
      entityIds,
      health: health.health,
      issues: health.issues,
      samples: compactRows(Object.values(health.samples ?? {}), includeSamples),
    },
    staleDataWarnings: [
      `Evidence is scoped to the last ${sinceHours} hours unless entityIds force a narrower read.`,
      "If async workers are still running, repeat the same read after the run finishes.",
      ...(domain === "selection" && stalePassThroughCount > 0
        ? [
            "Selection backfill is likely needed before trusting selected/pass_through counts after interest/template/criteria changes.",
          ]
        : []),
    ],
    nextSteps:
      domain === "selection" && stalePassThroughCount > 0
        ? [
            "maintenance.reindex.request payload={indexName: interest_centroids, jobKind: backfill}",
            "maintenance.reindex_jobs.list until completed/failed",
            "operator.report.verify reportKind=selection after completion",
          ]
        : guide?.readBackChecks ?? ["operator.system.health"],
  };
}

function inferDomainFromSymptom(symptom: string): OperatingDomain {
  const normalized = symptom.toLowerCase();
  if (normalized.includes("website") || normalized.includes("resource") || normalized.includes("project")) {
    return "website_pipeline";
  }
  if (normalized.includes("llm") || normalized.includes("budget") || normalized.includes("gray")) {
    return "llm_budget";
  }
  if (normalized.includes("discover") || normalized.includes("candidate") || normalized.includes("recall")) {
    return "discovery";
  }
  if (normalized.includes("sequence") || normalized.includes("run")) {
    return "sequences";
  }
  if (normalized.includes("filter") || normalized.includes("analysis") || normalized.includes("label")) {
    return "content_analysis";
  }
  if (normalized.includes("cleanup") || normalized.includes("token")) {
    return "cleanup";
  }
  if (normalized.includes("channel") || normalized.includes("fetch")) {
    return "channels";
  }
  return "selection";
}

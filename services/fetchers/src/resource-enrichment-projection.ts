import type { ResourceKind } from "@newsportal/contracts";

import { readOptionalString } from "./resource-enrichment-extraction";

export type ResourceProjectionState =
  | "pending"
  | "projected_to_common_pipeline"
  | "explicitly_rejected_before_pipeline";

export type ResourceExtractionStatus = "skipped" | "enriched" | "failed";

export interface ResourceProjectionInput {
  status: ResourceExtractionStatus;
  resourceKind: ResourceKind;
  finalUrl: string | null;
  title: string | null;
  summary: string | null;
  body: string | null;
  errorText: string | null;
}

export interface ResourceProjectionDecision {
  shouldProject: boolean;
  projectionState: ResourceProjectionState;
  projectionError: string | null;
  body: string;
}

export function isProjectableResourceKind(kind: ResourceKind): boolean {
  return kind !== "unknown";
}

export function buildProjectableBody(extraction: ResourceProjectionInput): string {
  return readOptionalString(extraction.body) ??
    readOptionalString(extraction.summary) ??
    readOptionalString(extraction.title) ??
    "";
}

export function resolveProjectionDecision(
  extraction: ResourceProjectionInput,
): ResourceProjectionDecision {
  if (extraction.status === "failed") {
    return {
      shouldProject: false,
      projectionState: "explicitly_rejected_before_pipeline",
      projectionError: extraction.errorText ?? "resource_enrichment_failed",
      body: "",
    };
  }

  if (extraction.status === "skipped") {
    return {
      shouldProject: false,
      projectionState: "explicitly_rejected_before_pipeline",
      projectionError: extraction.errorText ?? "resource_extraction_skipped",
      body: "",
    };
  }

  if (!isProjectableResourceKind(extraction.resourceKind)) {
    return {
      shouldProject: false,
      projectionState: "explicitly_rejected_before_pipeline",
      projectionError: "unsupported_resource_kind",
      body: "",
    };
  }

  if (!readOptionalString(extraction.finalUrl)) {
    return {
      shouldProject: false,
      projectionState: "explicitly_rejected_before_pipeline",
      projectionError: "missing_final_url",
      body: "",
    };
  }

  const body = buildProjectableBody(extraction);
  if (!body) {
    return {
      shouldProject: false,
      projectionState: "explicitly_rejected_before_pipeline",
      projectionError: "missing_projectable_content",
      body,
    };
  }

  return {
    shouldProject: true,
    projectionState: "projected_to_common_pipeline",
    projectionError: null,
    body,
  };
}

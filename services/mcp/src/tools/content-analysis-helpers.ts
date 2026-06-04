import {
  type JsonSchema,
} from "@signalops/contracts";

import {
  normalizePayloadStringListFields,
  readOptionalString,
} from "./shared";

const CONTENT_ANALYSIS_SUBJECT_TYPES = ["article", "web_resource", "story_cluster"] as const;
const CONTENT_ANALYSIS_MODULES = [
  "ner",
  "sentiment",
  "category",
  "cluster_summary",
  "system_interest_labels",
  "content_filter",
  "structured_extraction",
] as const;

export function normalizeContentAnalysisBackfillPayload(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  return normalizePayloadStringListFields(payload, {
    subjectTypes: { allowedValues: CONTENT_ANALYSIS_SUBJECT_TYPES },
    modules: { allowedValues: CONTENT_ANALYSIS_MODULES },
    subjectIds: undefined,
  });
}

export function expectedShapeForSchema(schema: JsonSchema): Record<string, unknown> {
  const properties = schema.properties ? Object.keys(schema.properties) : [];
  return {
    type: schema.type ?? "any",
    required: [...(schema.required ?? [])],
    allowedProperties: properties,
    additionalProperties: schema.additionalProperties ?? true,
  };
}

export function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((entry) => readOptionalString(entry)).filter((entry): entry is string => Boolean(entry))
    : [];
}

export function readEntityIds(args: Record<string, unknown>): Record<string, unknown> {
  const entityIds = args.entityIds;
  return entityIds != null && typeof entityIds === "object" && !Array.isArray(entityIds)
    ? (entityIds as Record<string, unknown>)
    : {};
}

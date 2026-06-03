import type { JsonSchema } from "./schema";

const stringSchema = { type: "string" } satisfies JsonSchema;
const nullableStringSchema = { type: ["string", "null"] } satisfies JsonSchema;
const booleanSchema = { type: "boolean" } satisfies JsonSchema;
const integerSchema = { type: "integer" } satisfies JsonSchema;
const flexibleNumberSchema = { type: ["number", "string"] } satisfies JsonSchema;
const flexibleIntegerSchema = { type: ["integer", "number", "string"] } satisfies JsonSchema;
const stringListSchema = {
  type: ["string", "array"],
  items: stringSchema,
} satisfies JsonSchema;
const stringOrStringListSchema = {
  type: ["string", "array"],
  items: stringSchema,
} satisfies JsonSchema;
const jsonObjectSchema = {
  type: "object",
  additionalProperties: true,
} satisfies JsonSchema;
const nullableJsonObjectSchema = {
  type: ["object", "null"],
  additionalProperties: true,
} satisfies JsonSchema;
const taskGraphSchema = {
  type: "array",
  items: jsonObjectSchema,
} satisfies JsonSchema;

function payloadEnvelopeSchema(
  payload: JsonSchema,
  extra: Record<string, JsonSchema> = {},
  required: readonly string[] = ["payload"]
): JsonSchema {
  return {
    type: "object",
    required,
    properties: {
      ...extra,
      payload,
    },
    additionalProperties: false,
  };
}

const discoveryArtifactPayloadSchema = {
  type: "object",
  required: ["artifactType", "payload"],
  properties: {
    artifactType: {
      type: "string",
      enum: [
        "DiscoveryBrief",
        "HypothesisBatch",
        "ProbePlan",
        "ProbeReport",
        "SourceUnderstanding",
        "RoutingDecision",
        "QueryQualityReport",
      ],
    },
    payload: jsonObjectSchema,
    vnextRunId: stringSchema,
    runId: stringSchema,
    interestId: stringSchema,
    candidateId: stringSchema,
    parentArtifactIds: { type: "array", items: stringSchema },
    memoryMode: stringSchema,
    lens: stringSchema,
    policyVersion: stringSchema,
    createdBy: stringSchema,
  },
  additionalProperties: false,
} satisfies JsonSchema;

const discoveryRunPayloadSchema = {
  type: "object",
  required: ["runKind"],
  properties: {
    runKind: {
      type: "string",
      enum: ["brief_compile", "mega_loop", "candidate_acquisition", "probe", "understand_route", "replay", "rollback", "full"],
    },
    triggerKind: { type: "string", enum: ["operator", "mcp", "api", "replay", "rollback", "eval"] },
    request: jsonObjectSchema,
    budget: jsonObjectSchema,
    createdBy: stringSchema,
  },
  additionalProperties: false,
} satisfies JsonSchema;

const discoveryPolicyPayloadSchema = {
  type: "object",
  required: ["policyName", "policyVersion", "policyType", "definition"],
  properties: {
    policyName: stringSchema,
    policyVersion: stringSchema,
    policyType: { type: "string", enum: ["routing", "probe", "mega_loop", "risk", "rollback", "permissions"] },
    definition: jsonObjectSchema,
    createdBy: stringSchema,
  },
  additionalProperties: false,
} satisfies JsonSchema;

const discoveryFeedbackPayloadSchema = {
  type: "object",
  required: ["targetType", "targetId", "feedbackType"],
  properties: {
    targetType: { type: "string", enum: ["artifact", "candidate", "source_inventory", "routing_decision", "policy"] },
    targetId: stringSchema,
    feedbackType: { type: "string", enum: ["approve", "reject", "correct", "rollback", "mark_noise", "mark_useful", "policy_issue"] },
    feedback: jsonObjectSchema,
    createdBy: stringSchema,
  },
  additionalProperties: false,
} satisfies JsonSchema;

export const MCP_DISCOVERY_PAYLOAD_SCHEMAS = {
  runCreate: discoveryRunPayloadSchema,
  artifactCreate: discoveryArtifactPayloadSchema,
  artifactValidate: discoveryArtifactPayloadSchema,
  policyActivate: discoveryPolicyPayloadSchema,
  policyValidate: discoveryPolicyPayloadSchema,
  feedbackSubmit: discoveryFeedbackPayloadSchema,
  replayStart: {
    type: "object",
    required: ["replayKind"],
    properties: {
      replayKind: { type: "string", enum: ["artifact_lineage", "routing_policy", "candidate_acquisition", "full_non_live"] },
      input: jsonObjectSchema,
      dryRun: booleanSchema,
      createdBy: stringSchema,
    },
    additionalProperties: false,
  },
  rollbackPrepare: {
    type: "object",
    required: ["sourceInventoryId", "reason"],
    properties: {
      sourceInventoryId: stringSchema,
      reason: stringSchema,
      prepared: jsonObjectSchema,
      createdBy: stringSchema,
    },
    additionalProperties: false,
  },
  rollbackApply: {
    type: "object",
    required: ["rollbackGroupId", "confirm"],
    properties: {
      rollbackGroupId: stringSchema,
      confirm: booleanSchema,
      appliedBy: stringSchema,
    },
    additionalProperties: false,
  },
} as const satisfies Record<string, JsonSchema>;

export const MCP_DISCOVERY_ARGUMENT_SCHEMAS = {
  runCreate: payloadEnvelopeSchema(discoveryRunPayloadSchema),
  artifactCreate: payloadEnvelopeSchema(discoveryArtifactPayloadSchema),
  artifactValidate: payloadEnvelopeSchema(discoveryArtifactPayloadSchema),
  policyActivate: payloadEnvelopeSchema(discoveryPolicyPayloadSchema),
  policyValidate: payloadEnvelopeSchema(discoveryPolicyPayloadSchema),
  feedbackSubmit: payloadEnvelopeSchema(discoveryFeedbackPayloadSchema),
  replayStart: payloadEnvelopeSchema(MCP_DISCOVERY_PAYLOAD_SCHEMAS.replayStart),
  rollbackPrepare: payloadEnvelopeSchema(MCP_DISCOVERY_PAYLOAD_SCHEMAS.rollbackPrepare),
  rollbackApply: payloadEnvelopeSchema(MCP_DISCOVERY_PAYLOAD_SCHEMAS.rollbackApply),
} as const satisfies Record<string, JsonSchema>;

const sequenceCreatePayloadSchema = {
  type: "object",
  required: ["title", "taskGraph"],
  properties: {
    title: stringSchema,
    taskGraph: taskGraphSchema,
    editorState: nullableJsonObjectSchema,
    description: nullableStringSchema,
    status: { type: "string", enum: ["draft", "active", "archived"] },
    triggerEvent: nullableStringSchema,
    cron: nullableStringSchema,
    maxRuns: { type: ["integer", "null"] },
    tags: stringListSchema,
    createdBy: stringSchema,
  },
  additionalProperties: false,
} satisfies JsonSchema;

const sequenceUpdatePayloadSchema = {
  type: "object",
  properties: {
    title: stringSchema,
    taskGraph: taskGraphSchema,
    editorState: nullableJsonObjectSchema,
    description: nullableStringSchema,
    status: { type: "string", enum: ["draft", "active", "archived"] },
    triggerEvent: nullableStringSchema,
    cron: nullableStringSchema,
    maxRuns: { type: ["integer", "null"] },
    tags: stringListSchema,
    createdBy: nullableStringSchema,
  },
  additionalProperties: false,
} satisfies JsonSchema;

const sequenceManualRunPayloadSchema = {
  type: "object",
  properties: {
    contextJson: jsonObjectSchema,
    triggerMeta: jsonObjectSchema,
    requestedBy: stringSchema,
  },
  additionalProperties: false,
} satisfies JsonSchema;

const sequenceRetryPayloadSchema = {
  type: "object",
  properties: {
    contextOverrides: jsonObjectSchema,
    triggerMeta: jsonObjectSchema,
    requestedBy: stringSchema,
  },
  additionalProperties: false,
} satisfies JsonSchema;

const sequenceCancelPayloadSchema = {
  type: "object",
  properties: {
    reason: nullableStringSchema,
  },
  additionalProperties: false,
} satisfies JsonSchema;

const agentSequenceCreatePayloadSchema = {
  type: "object",
  required: ["title", "taskGraph"],
  properties: {
    title: stringSchema,
    taskGraph: taskGraphSchema,
    description: nullableStringSchema,
    tags: stringListSchema,
    createdBy: stringSchema,
    contextJson: jsonObjectSchema,
    triggerMeta: jsonObjectSchema,
    runNow: booleanSchema,
  },
  additionalProperties: false,
} satisfies JsonSchema;

export const MCP_SEQUENCE_PAYLOAD_SCHEMAS = {
  create: sequenceCreatePayloadSchema,
  update: sequenceUpdatePayloadSchema,
  run: sequenceManualRunPayloadSchema,
  retryRun: sequenceRetryPayloadSchema,
  cancelRun: sequenceCancelPayloadSchema,
  agentRun: agentSequenceCreatePayloadSchema,
} as const satisfies Record<string, JsonSchema>;

export const MCP_SEQUENCE_ARGUMENT_SCHEMAS = {
  create: payloadEnvelopeSchema(sequenceCreatePayloadSchema),
  update: payloadEnvelopeSchema(sequenceUpdatePayloadSchema, {
    sequenceId: stringSchema,
  }, ["sequenceId", "payload"]),
  run: payloadEnvelopeSchema(sequenceManualRunPayloadSchema, {
    sequenceId: stringSchema,
  }, ["sequenceId"]),
  retryRun: payloadEnvelopeSchema(sequenceRetryPayloadSchema, {
    runId: stringSchema,
  }, ["runId"]),
  cancelRun: payloadEnvelopeSchema(sequenceCancelPayloadSchema, {
    runId: stringSchema,
  }, ["runId"]),
  agentRun: payloadEnvelopeSchema(agentSequenceCreatePayloadSchema),
} as const satisfies Record<string, JsonSchema>;

const contentAnalysisPolicyPayloadSchema = {
  type: "object",
  required: ["policyKey", "title", "module"],
  properties: {
    policyKey: stringSchema,
    title: stringSchema,
    description: stringSchema,
    scopeType: {
      type: "string",
      enum: ["global", "source_channel", "system_interest", "sequence", "manual"],
    },
    scopeId: stringSchema,
    module: {
      type: "string",
      enum: [
        "ner",
        "sentiment",
        "category",
        "system_interest_label",
        "content_filter",
        "cluster_summary",
        "clustering",
        "structured_extraction",
      ],
    },
    enabled: booleanSchema,
    mode: { type: "string", enum: ["disabled", "observe", "dry_run", "hold", "enforce"] },
    provider: nullableStringSchema,
    modelKey: nullableStringSchema,
    modelVersion: nullableStringSchema,
    configJson: jsonObjectSchema,
    failurePolicy: { type: "string", enum: ["skip", "hold", "reject", "fail_run"] },
    priority: integerSchema,
    version: integerSchema,
    isActive: booleanSchema,
  },
  additionalProperties: false,
} satisfies JsonSchema;

const contentAnalysisPolicyUpdatePayloadSchema = {
  type: "object",
  properties: {
    title: stringSchema,
    description: nullableStringSchema,
    module: contentAnalysisPolicyPayloadSchema.properties?.module ?? stringSchema,
    enabled: booleanSchema,
    mode: { type: "string", enum: ["disabled", "observe", "dry_run", "hold", "enforce"] },
    provider: stringSchema,
    modelKey: stringSchema,
    modelVersion: stringSchema,
    configJson: jsonObjectSchema,
    failurePolicy: { type: "string", enum: ["skip", "hold", "reject", "fail_run"] },
    isActive: booleanSchema,
    priority: integerSchema,
    confirmEnforce: booleanSchema,
  },
  additionalProperties: false,
} satisfies JsonSchema;

const contentFilterPolicyPayloadSchema = {
  type: "object",
  required: ["policyKey", "title", "policyJson"],
  properties: {
    policyKey: stringSchema,
    title: stringSchema,
    description: nullableStringSchema,
    scopeType: stringSchema,
    scopeId: stringSchema,
    mode: { type: "string", enum: ["disabled", "observe", "dry_run", "hold", "enforce"] },
    combiner: { type: "string", enum: ["all", "any", "priority_first"] },
    policyJson: jsonObjectSchema,
    version: integerSchema,
    isActive: booleanSchema,
    priority: integerSchema,
  },
  additionalProperties: false,
} satisfies JsonSchema;

const contentFilterPolicyUpdatePayloadSchema = {
  type: "object",
  properties: {
    title: stringSchema,
    description: stringSchema,
    mode: { type: "string", enum: ["disabled", "observe", "dry_run", "hold", "enforce"] },
    combiner: { type: "string", enum: ["all", "any", "priority_first"] },
    policyJson: jsonObjectSchema,
    isActive: booleanSchema,
    priority: integerSchema,
    confirmEnforce: booleanSchema,
  },
  additionalProperties: false,
} satisfies JsonSchema;

const contentAnalysisBackfillPayloadSchema = {
  type: "object",
    properties: {
      subjectTypes: {
        type: ["string", "array"],
        items: { type: "string", enum: ["article", "web_resource", "story_cluster"] },
      },
      modules: {
        type: ["string", "array"],
        items: {
          type: "string",
          enum: [
            "ner",
            "sentiment",
            "category",
            "cluster_summary",
            "system_interest_labels",
            "content_filter",
            "structured_extraction",
          ],
        },
      },
      missingOnly: booleanSchema,
      policyKey: stringSchema,
      batchSize: integerSchema,
      maxTextChars: integerSchema,
      requestedByUserId: stringSchema,
      subjectIds: stringListSchema,
    },
    additionalProperties: false,
} satisfies JsonSchema;

export const MCP_CONTENT_ANALYSIS_PAYLOAD_SCHEMAS = {
  backfillRequest: contentAnalysisBackfillPayloadSchema,
  policyCreate: contentAnalysisPolicyPayloadSchema,
  policyUpdate: contentAnalysisPolicyUpdatePayloadSchema,
  filterPolicyCreate: contentFilterPolicyPayloadSchema,
  filterPolicyUpdate: contentFilterPolicyUpdatePayloadSchema,
  filterPolicyPreview: jsonObjectSchema,
} as const satisfies Record<string, JsonSchema>;

export const MCP_CONTENT_ANALYSIS_ARGUMENT_SCHEMAS = {
  backfillRequest: payloadEnvelopeSchema(contentAnalysisBackfillPayloadSchema, {}, []),
  policyCreate: payloadEnvelopeSchema(contentAnalysisPolicyPayloadSchema),
  policyUpdate: payloadEnvelopeSchema(contentAnalysisPolicyUpdatePayloadSchema, {
    policyId: stringSchema,
  }, ["policyId", "payload"]),
  filterPolicyCreate: payloadEnvelopeSchema(contentFilterPolicyPayloadSchema),
  filterPolicyUpdate: payloadEnvelopeSchema(contentFilterPolicyUpdatePayloadSchema, {
    filterPolicyId: stringSchema,
  }, ["filterPolicyId", "payload"]),
  filterPolicyPreview: payloadEnvelopeSchema(jsonObjectSchema, {
    filterPolicyId: stringSchema,
  }, ["filterPolicyId"]),
} as const satisfies Record<string, JsonSchema>;

export const MCP_TEMPLATE_PAYLOAD_SCHEMAS = {
  systemInterestCreate: {
    type: "object",
    required: ["name", "positive_texts"],
    properties: {
      interestTemplateId: stringSchema,
      name: stringSchema,
      description: stringSchema,
      positive_texts: stringOrStringListSchema,
      negative_texts: stringOrStringListSchema,
      must_have_terms: stringOrStringListSchema,
      must_not_have_terms: stringOrStringListSchema,
      places: stringOrStringListSchema,
      languages_allowed: stringOrStringListSchema,
      time_window_hours: flexibleIntegerSchema,
      allowed_content_kinds: stringOrStringListSchema,
      short_tokens_required: stringOrStringListSchema,
      short_tokens_forbidden: stringOrStringListSchema,
      candidate_positive_signals: stringOrStringListSchema,
      candidate_negative_signals: stringOrStringListSchema,
      selection_profile_strictness: { type: "string", enum: ["strict", "balanced", "broad"] },
      selection_profile_unresolved_decision: { type: "string", enum: ["hold", "reject"] },
      selection_profile_llm_review_mode: {
        type: "string",
        enum: ["disabled", "optional_high_value_only", "always"],
      },
      priority: flexibleNumberSchema,
      isActive: booleanSchema,
    },
    additionalProperties: false,
  },
  systemInterestUpdate: {
    type: "object",
    required: ["interestTemplateId", "name", "positive_texts"],
    properties: {
      interestTemplateId: stringSchema,
      name: stringSchema,
      description: stringSchema,
      positive_texts: stringOrStringListSchema,
      negative_texts: stringOrStringListSchema,
      must_have_terms: stringOrStringListSchema,
      must_not_have_terms: stringOrStringListSchema,
      places: stringOrStringListSchema,
      languages_allowed: stringOrStringListSchema,
      time_window_hours: flexibleIntegerSchema,
      allowed_content_kinds: stringOrStringListSchema,
      short_tokens_required: stringOrStringListSchema,
      short_tokens_forbidden: stringOrStringListSchema,
      candidate_positive_signals: stringOrStringListSchema,
      candidate_negative_signals: stringOrStringListSchema,
      selection_profile_strictness: { type: "string", enum: ["strict", "balanced", "broad"] },
      selection_profile_unresolved_decision: { type: "string", enum: ["hold", "reject"] },
      selection_profile_llm_review_mode: {
        type: "string",
        enum: ["disabled", "optional_high_value_only", "always"],
      },
      priority: flexibleNumberSchema,
      isActive: booleanSchema,
    },
    additionalProperties: false,
  },
  llmTemplateCreate: {
    type: "object",
    required: ["name", "templateText"],
    properties: {
      promptTemplateId: stringSchema,
      name: stringSchema,
      scope: { type: "string", enum: ["criteria", "interests", "global"] },
      language: stringSchema,
      templateText: stringSchema,
      isActive: booleanSchema,
    },
    additionalProperties: false,
  },
  llmTemplateUpdate: {
    type: "object",
    required: ["promptTemplateId", "name", "templateText"],
    properties: {
      promptTemplateId: stringSchema,
      name: stringSchema,
      scope: { type: "string", enum: ["criteria", "interests", "global"] },
      language: stringSchema,
      templateText: stringSchema,
      isActive: booleanSchema,
    },
    additionalProperties: false,
  },
} as const satisfies Record<string, JsonSchema>;

export const MCP_TEMPLATE_ARGUMENT_SCHEMAS = {
  systemInterestCreate: payloadEnvelopeSchema(MCP_TEMPLATE_PAYLOAD_SCHEMAS.systemInterestCreate),
  systemInterestUpdate: payloadEnvelopeSchema(MCP_TEMPLATE_PAYLOAD_SCHEMAS.systemInterestUpdate),
  llmTemplateCreate: payloadEnvelopeSchema(MCP_TEMPLATE_PAYLOAD_SCHEMAS.llmTemplateCreate),
  llmTemplateUpdate: payloadEnvelopeSchema(MCP_TEMPLATE_PAYLOAD_SCHEMAS.llmTemplateUpdate),
} as const satisfies Record<string, JsonSchema>;

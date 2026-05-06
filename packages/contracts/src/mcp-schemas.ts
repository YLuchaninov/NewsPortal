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
const providerTypeSchema = {
  type: "string",
  enum: ["rss", "website", "api", "email_imap", "youtube"],
} satisfies JsonSchema;
const providerTypeListSchema = {
  type: ["string", "array"],
  items: providerTypeSchema,
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

const discoveryMissionCreatePayloadSchema = {
  type: "object",
  required: ["title"],
  properties: {
    title: stringSchema,
    description: nullableStringSchema,
    sourceKind: { type: "string", enum: ["interest_template", "manual"] },
    sourceRefId: nullableStringSchema,
    seedTopics: stringListSchema,
    seedLanguages: stringListSchema,
    seedRegions: stringListSchema,
    targetProviderTypes: providerTypeListSchema,
    interestGraph: jsonObjectSchema,
    maxHypotheses: integerSchema,
    maxSources: integerSchema,
    budgetCents: integerSchema,
    priority: integerSchema,
    profileId: nullableStringSchema,
    createdBy: nullableStringSchema,
    confirmLargeRun: booleanSchema,
  },
  additionalProperties: false,
} satisfies JsonSchema;

const discoveryMissionUpdatePayloadSchema = {
  type: "object",
  properties: {
    title: stringSchema,
    description: nullableStringSchema,
    seedTopics: stringListSchema,
    seedLanguages: stringListSchema,
    seedRegions: stringListSchema,
    targetProviderTypes: providerTypeListSchema,
    interestGraph: jsonObjectSchema,
    maxHypotheses: integerSchema,
    maxSources: integerSchema,
    budgetCents: integerSchema,
    priority: integerSchema,
    status: {
      type: "string",
      enum: ["planned", "active", "completed", "paused", "failed", "archived"],
    },
    profileId: nullableStringSchema,
    confirmLargeRun: booleanSchema,
  },
  additionalProperties: false,
} satisfies JsonSchema;

const discoveryRecallMissionCreatePayloadSchema = {
  type: "object",
  required: ["title"],
  properties: {
    title: stringSchema,
    description: nullableStringSchema,
    missionKind: { type: "string", enum: ["manual", "domain_seed", "query_seed"] },
    seedDomains: stringListSchema,
    seedUrls: stringListSchema,
    seedQueries: stringListSchema,
    targetProviderTypes: providerTypeListSchema,
    scopeJson: jsonObjectSchema,
    maxCandidates: integerSchema,
    profileId: nullableStringSchema,
    createdBy: nullableStringSchema,
  },
  additionalProperties: false,
} satisfies JsonSchema;

const discoveryRecallMissionUpdatePayloadSchema = {
  type: "object",
  properties: {
    title: stringSchema,
    description: stringSchema,
    missionKind: { type: "string", enum: ["manual", "domain_seed", "query_seed"] },
    seedDomains: stringListSchema,
    seedUrls: stringListSchema,
    seedQueries: stringListSchema,
    targetProviderTypes: providerTypeListSchema,
    scopeJson: jsonObjectSchema,
    maxCandidates: integerSchema,
    status: { type: "string", enum: ["planned", "active", "completed", "paused", "failed"] },
    profileId: nullableStringSchema,
  },
  additionalProperties: false,
} satisfies JsonSchema;

const discoveryProfileCreatePayloadSchema = {
  type: "object",
  required: ["profileKey", "displayName"],
  properties: {
    profileKey: stringSchema,
    displayName: stringSchema,
    description: nullableStringSchema,
    status: { type: "string", enum: ["draft", "active", "archived"] },
    graphPolicyJson: jsonObjectSchema,
    recallPolicyJson: jsonObjectSchema,
    yieldBenchmarkJson: jsonObjectSchema,
    createdBy: stringSchema,
  },
  additionalProperties: false,
} satisfies JsonSchema;

const discoveryProfileUpdatePayloadSchema = {
  type: "object",
  properties: {
    displayName: stringSchema,
    description: nullableStringSchema,
    status: { type: "string", enum: ["draft", "active", "archived"] },
    graphPolicyJson: jsonObjectSchema,
    recallPolicyJson: jsonObjectSchema,
    yieldBenchmarkJson: jsonObjectSchema,
  },
  additionalProperties: false,
} satisfies JsonSchema;

const discoveryClassCreatePayloadSchema = {
  type: "object",
  required: ["classKey", "displayName"],
  properties: {
    classKey: stringSchema,
    displayName: stringSchema,
    description: nullableStringSchema,
    status: { type: "string", enum: ["draft", "active", "archived"] },
    generationBackend: { type: "string", enum: ["graph_seed_llm", "graph_seed_only"] },
    defaultProviderTypes: providerTypeListSchema,
    promptInstructions: nullableStringSchema,
    seedRulesJson: jsonObjectSchema,
    maxPerMission: integerSchema,
    sortOrder: integerSchema,
    configJson: jsonObjectSchema,
  },
  additionalProperties: false,
} satisfies JsonSchema;

const discoveryClassUpdatePayloadSchema = {
  type: "object",
  properties: {
    displayName: stringSchema,
    description: stringSchema,
    status: { type: "string", enum: ["draft", "active", "archived"] },
    generationBackend: { type: "string", enum: ["graph_seed_llm", "graph_seed_only"] },
    defaultProviderTypes: providerTypeListSchema,
    promptInstructions: stringSchema,
    seedRulesJson: jsonObjectSchema,
    maxPerMission: integerSchema,
    sortOrder: integerSchema,
    configJson: jsonObjectSchema,
  },
  additionalProperties: false,
} satisfies JsonSchema;

const discoveryRecallCandidateCreatePayloadSchema = {
  type: "object",
  required: ["recallMissionId", "url"],
  properties: {
    recallMissionId: stringSchema,
    sourceProfileId: stringSchema,
    url: stringSchema,
    finalUrl: stringSchema,
    title: stringSchema,
    description: stringSchema,
    providerType: providerTypeSchema,
    status: { type: "string", enum: ["pending", "shortlisted", "rejected", "duplicate"] },
    qualitySignalSource: stringSchema,
    rejectionReason: nullableStringSchema,
    createdBy: stringSchema,
  },
  additionalProperties: false,
} satisfies JsonSchema;

const discoveryRecallCandidateUpdatePayloadSchema = {
  type: "object",
  properties: {
    status: { type: "string", enum: ["pending", "shortlisted", "rejected", "duplicate"] },
    reviewedBy: stringSchema,
    rejectionReason: nullableStringSchema,
    qualitySignalSource: stringSchema,
  },
  additionalProperties: false,
} satisfies JsonSchema;

const discoveryRecallCandidatePromotePayloadSchema = {
  type: "object",
  properties: {
    reviewedBy: stringSchema,
    enabled: booleanSchema,
    tags: stringListSchema,
    overrideReason: stringSchema,
  },
  additionalProperties: false,
} satisfies JsonSchema;

const discoveryCandidateReviewPayloadSchema = {
  type: "object",
  required: ["status"],
  properties: {
    status: { type: "string", enum: ["approved", "rejected", "pending"] },
    reviewedBy: stringSchema,
    rejectionReason: nullableStringSchema,
  },
  additionalProperties: false,
} satisfies JsonSchema;

const discoveryFeedbackCreatePayloadSchema = {
  type: "object",
  required: ["feedbackType"],
  properties: {
    missionId: nullableStringSchema,
    candidateId: nullableStringSchema,
    sourceProfileId: nullableStringSchema,
    feedbackType: stringSchema,
    feedbackValue: nullableStringSchema,
    notes: nullableStringSchema,
    createdBy: stringSchema,
  },
  additionalProperties: false,
} satisfies JsonSchema;

export const MCP_DISCOVERY_PAYLOAD_SCHEMAS = {
  profileCreate: discoveryProfileCreatePayloadSchema,
  profileUpdate: discoveryProfileUpdatePayloadSchema,
  missionCreate: discoveryMissionCreatePayloadSchema,
  missionUpdate: discoveryMissionUpdatePayloadSchema,
  missionRun: {
    type: "object",
    properties: {
      requestedBy: stringSchema,
    },
    additionalProperties: false,
  },
  recallMissionCreate: discoveryRecallMissionCreatePayloadSchema,
  recallMissionUpdate: discoveryRecallMissionUpdatePayloadSchema,
  classCreate: discoveryClassCreatePayloadSchema,
  classUpdate: discoveryClassUpdatePayloadSchema,
  recallCandidateCreate: discoveryRecallCandidateCreatePayloadSchema,
  recallCandidateUpdate: discoveryRecallCandidateUpdatePayloadSchema,
  recallCandidatePromote: discoveryRecallCandidatePromotePayloadSchema,
  candidateReview: discoveryCandidateReviewPayloadSchema,
  feedbackCreate: discoveryFeedbackCreatePayloadSchema,
  reEvaluate: {
    type: "object",
    properties: {
      missionId: nullableStringSchema,
    },
    additionalProperties: false,
  },
} as const satisfies Record<string, JsonSchema>;

export const MCP_DISCOVERY_ARGUMENT_SCHEMAS = {
  profileCreate: payloadEnvelopeSchema(discoveryProfileCreatePayloadSchema),
  profileUpdate: payloadEnvelopeSchema(discoveryProfileUpdatePayloadSchema, {
    profileId: stringSchema,
  }, ["profileId", "payload"]),
  missionCreate: payloadEnvelopeSchema(discoveryMissionCreatePayloadSchema),
  missionUpdate: payloadEnvelopeSchema(discoveryMissionUpdatePayloadSchema, {
    missionId: stringSchema,
  }, ["missionId", "payload"]),
  missionRun: payloadEnvelopeSchema(MCP_DISCOVERY_PAYLOAD_SCHEMAS.missionRun, { missionId: stringSchema }, ["missionId"]),
  recallMissionCreate: payloadEnvelopeSchema(discoveryRecallMissionCreatePayloadSchema),
  recallMissionUpdate: payloadEnvelopeSchema(discoveryRecallMissionUpdatePayloadSchema, {
    recallMissionId: stringSchema,
  }, ["recallMissionId", "payload"]),
  classCreate: payloadEnvelopeSchema(discoveryClassCreatePayloadSchema),
  classUpdate: payloadEnvelopeSchema(discoveryClassUpdatePayloadSchema, {
    classKey: stringSchema,
  }, ["classKey", "payload"]),
  recallCandidateCreate: payloadEnvelopeSchema(discoveryRecallCandidateCreatePayloadSchema),
  recallCandidateUpdate: payloadEnvelopeSchema(discoveryRecallCandidateUpdatePayloadSchema, {
    recallCandidateId: stringSchema,
  }, ["recallCandidateId", "payload"]),
  recallCandidatePromote: payloadEnvelopeSchema(discoveryRecallCandidatePromotePayloadSchema, {
    recallCandidateId: stringSchema,
  }, ["recallCandidateId"]),
  candidateReview: payloadEnvelopeSchema(discoveryCandidateReviewPayloadSchema, {
    candidateId: stringSchema,
  }, ["candidateId", "payload"]),
  feedbackCreate: payloadEnvelopeSchema(discoveryFeedbackCreatePayloadSchema),
  reEvaluate: payloadEnvelopeSchema(MCP_DISCOVERY_PAYLOAD_SCHEMAS.reEvaluate, {}, []),
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

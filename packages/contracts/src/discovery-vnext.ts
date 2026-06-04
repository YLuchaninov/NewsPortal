import {
  assertJsonSchema,
  type JsonSchema,
  validateJsonSchema,
  type JsonSchemaValidationIssue,
} from "./schema";

export const DISCOVERY_VNEXT_ARTIFACT_TYPES = [
  "DiscoveryBrief",
  "HypothesisBatch",
  "ProbePlan",
  "ProbeReport",
  "SourceScopeResolution",
  "SourceUnderstanding",
  "RoutingDecision",
  "QueryQualityReport",
] as const;

export type DiscoveryVNextArtifactType = (typeof DISCOVERY_VNEXT_ARTIFACT_TYPES)[number];

export const DISCOVERY_VNEXT_ARTIFACT_STATUSES = [
  "draft",
  "generated",
  "validated",
  "rejected",
  "superseded",
  "applied",
  "expired",
] as const;

export const DISCOVERY_VNEXT_MEMORY_MODES = [
  "blind",
  "thin",
  "gap_only",
  "locale",
  "artifact_lens",
  "adversarial",
  "full_evaluator_only",
] as const;

export const DISCOVERY_VNEXT_SOURCE_SCOPE_TYPES = [
  "domain_root",
  "section",
  "feed",
  "api_endpoint",
  "listing_page",
  "search_endpoint",
  "document_collection",
  "single_item",
  "context_page",
  "blocked_or_unusable",
  "unknown",
] as const;

export const DISCOVERY_VNEXT_ROUTING_DECISIONS = [
  "inventory",
  "inventory_context",
  "inventory_low_priority",
  "cheap_watch",
  "auto_register_probation",
  "manual_review",
  "adapter_backlog",
  "blocked",
  "rejected_structural",
] as const;

export const DISCOVERY_VNEXT_RUN_STEP_KINDS = [
  "brief_compile",
  "llm_gateway",
  "mega_loop",
  "candidate_acquisition",
  "probe",
  "scope_resolution",
  "understand_route",
  "monitoring_handoff",
  "probation_handoff",
  "replay",
  "rollback",
] as const;

export const DISCOVERY_VNEXT_RUN_STEP_STATUSES = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "skipped",
  "cancelled",
] as const;

export const DISCOVERY_VNEXT_QUERY_ATTEMPT_STATUSES = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "skipped",
] as const;

export type DiscoveryVNextRunStepKind = (typeof DISCOVERY_VNEXT_RUN_STEP_KINDS)[number];
export type DiscoveryVNextRunStepStatus = (typeof DISCOVERY_VNEXT_RUN_STEP_STATUSES)[number];
export type DiscoveryVNextQueryAttemptStatus = (typeof DISCOVERY_VNEXT_QUERY_ATTEMPT_STATUSES)[number];

const STRING_SCHEMA = { type: "string" } satisfies JsonSchema;
const NUMBER_SCHEMA = { type: "number", minimum: 0, maximum: 1 } satisfies JsonSchema;
const STRING_LIST_SCHEMA = {
  type: "array",
  items: STRING_SCHEMA,
} satisfies JsonSchema;
const JSON_OBJECT_SCHEMA = {
  type: "object",
  additionalProperties: true,
} satisfies JsonSchema;

export const DISCOVERY_VNEXT_ARTIFACT_ENVELOPE_SCHEMA = {
  type: "object",
  required: ["artifactType", "schemaVersion", "status", "payload"],
  properties: {
    artifactId: STRING_SCHEMA,
    artifactType: { type: "string", enum: DISCOVERY_VNEXT_ARTIFACT_TYPES },
    schemaVersion: { type: "string", enum: ["1.0", "2.0"] },
    runId: { type: ["string", "null"] },
    interestId: { type: ["string", "null"] },
    candidateId: { type: ["string", "null"] },
    parentArtifactIds: STRING_LIST_SCHEMA,
    createdBy: { type: "string", enum: ["system", "harness", "operator", "mcp_client", "api"] },
    creatorModel: { type: ["string", "null"] },
    memoryMode: { type: ["string", "null"], enum: [...DISCOVERY_VNEXT_MEMORY_MODES, null] },
    lens: { type: ["string", "null"] },
    policyVersion: { type: ["string", "null"] },
    status: { type: "string", enum: DISCOVERY_VNEXT_ARTIFACT_STATUSES },
    validation: JSON_OBJECT_SCHEMA,
    payload: JSON_OBJECT_SCHEMA,
  },
  additionalProperties: false,
} as const satisfies JsonSchema;

export const DISCOVERY_BRIEF_PAYLOAD_SCHEMA = {
  type: "object",
  required: ["goal", "desiredSignals", "negativeSignals", "artifactExpectations", "freshnessNeed", "constraints"],
  properties: {
    interestId: { type: ["string", "null"] },
    interestName: STRING_SCHEMA,
    sourceInterestText: STRING_SCHEMA,
    goal: STRING_SCHEMA,
    desiredSignals: {
      type: "array",
      items: {
        type: "object",
        required: ["description", "expectedEvidencePatterns"],
        properties: {
          signalId: STRING_SCHEMA,
          description: STRING_SCHEMA,
          whyItMatters: STRING_SCHEMA,
          directness: { type: "string", enum: ["direct", "indirect", "precursor", "contextual"] },
          expectedEvidencePatterns: STRING_LIST_SCHEMA,
        },
        additionalProperties: true,
      },
    },
    negativeSignals: {
      type: "array",
      items: JSON_OBJECT_SCHEMA,
    },
    artifactExpectations: STRING_LIST_SCHEMA,
    geographies: STRING_LIST_SCHEMA,
    languages: STRING_LIST_SCHEMA,
    freshnessNeed: { type: "string", enum: ["fast", "normal", "slow", "rare", "unknown"] },
    constraints: JSON_OBJECT_SCHEMA,
  },
  additionalProperties: true,
} as const satisfies JsonSchema;

export const HYPOTHESIS_BATCH_PAYLOAD_SCHEMA = {
  type: "object",
  required: ["batchId", "memoryMode", "lens", "hypotheses"],
  properties: {
    batchId: STRING_SCHEMA,
    memoryMode: { type: "string", enum: DISCOVERY_VNEXT_MEMORY_MODES },
    lens: STRING_SCHEMA,
    briefArtifactId: { type: ["string", "null"] },
    hypotheses: {
      type: "array",
      items: {
        type: "object",
        required: ["sourceRoleDescription", "expectedSignalLinks", "queryFamilies"],
        properties: {
          hypothesisId: STRING_SCHEMA,
          description: STRING_SCHEMA,
          sourceRoleDescription: STRING_SCHEMA,
          expectedArtifacts: STRING_LIST_SCHEMA,
          expectedSignalLinks: { type: "array", items: JSON_OBJECT_SCHEMA },
          queryFamilies: { type: "array", items: JSON_OBJECT_SCHEMA },
          riskAssumption: STRING_SCHEMA,
          actionability: STRING_SCHEMA,
        },
        additionalProperties: true,
      },
    },
  },
  additionalProperties: true,
} as const satisfies JsonSchema;

export const PROBE_PLAN_PAYLOAD_SCHEMA = {
  type: "object",
  required: ["candidateUrl", "probeStrategy", "checks", "limits", "disallowedActions"],
  properties: {
    candidateUrl: STRING_SCHEMA,
    candidateKindGuess: STRING_SCHEMA,
    probeStrategy: STRING_SCHEMA,
    checks: STRING_LIST_SCHEMA,
    limits: JSON_OBJECT_SCHEMA,
    allowedEscalations: STRING_LIST_SCHEMA,
    disallowedActions: STRING_LIST_SCHEMA,
    fetchersBoundary: JSON_OBJECT_SCHEMA,
  },
  additionalProperties: true,
} as const satisfies JsonSchema;

export const PROBE_REPORT_PAYLOAD_SCHEMA = {
  type: "object",
  required: ["candidateUrl", "accessPattern", "technicalObservability", "probeCost"],
  properties: {
    candidateUrl: STRING_SCHEMA,
    accessPattern: {
      type: "string",
      enum: ["public", "requires_browser", "requires_auth", "captcha_blocked", "blocked", "unknown"],
    },
    technicalObservability: JSON_OBJECT_SCHEMA,
    probeCost: JSON_OBJECT_SCHEMA,
    observations: { type: "array", items: JSON_OBJECT_SCHEMA },
    fetchersBoundary: { type: "boolean" },
    browserProbeAttempted: { type: "boolean" },
    browserProbeAllowed: { type: "boolean" },
    feedResults: { type: "array", items: JSON_OBJECT_SCHEMA },
    websiteResults: { type: "array", items: JSON_OBJECT_SCHEMA },
    providerFailures: { type: "array", items: JSON_OBJECT_SCHEMA },
    negativeEvidencePolicy: JSON_OBJECT_SCHEMA,
  },
  additionalProperties: true,
} as const satisfies JsonSchema;

export const SOURCE_SCOPE_RESOLUTION_PAYLOAD_SCHEMA = {
  type: "object",
  required: [
    "candidateUrl",
    "canonicalCandidateUrl",
    "originalCandidateUrl",
    "resolvedSourceUrl",
    "sourceScopeType",
    "sourceScopeConfidence",
    "seedItemUrl",
    "monitoringEntryUrls",
    "itemExtractionHints",
    "resolutionEvidence",
    "notMonitoringReason",
    "risk",
    "scopeCandidates",
    "warnings",
  ],
  properties: {
    candidateUrl: STRING_SCHEMA,
    canonicalCandidateUrl: STRING_SCHEMA,
    originalCandidateUrl: STRING_SCHEMA,
    resolvedSourceUrl: STRING_SCHEMA,
    sourceScopeType: { type: "string", enum: DISCOVERY_VNEXT_SOURCE_SCOPE_TYPES },
    sourceScopeConfidence: NUMBER_SCHEMA,
    seedItemUrl: { type: ["string", "null"] },
    monitoringEntryUrls: { type: "array", items: STRING_SCHEMA },
    itemExtractionHints: JSON_OBJECT_SCHEMA,
    resolutionEvidence: STRING_LIST_SCHEMA,
    normalizationEvidence: STRING_LIST_SCHEMA,
    notMonitoringReason: { type: ["string", "null"] },
    risk: JSON_OBJECT_SCHEMA,
    scopeCandidates: { type: "array", items: JSON_OBJECT_SCHEMA },
    warnings: STRING_LIST_SCHEMA,
  },
  additionalProperties: true,
} as const satisfies JsonSchema;

export const SOURCE_UNDERSTANDING_PAYLOAD_SCHEMA = {
  type: "object",
  required: [
    "sourceUrl",
    "sourceRoleDescription",
    "sourceVoice",
    "artifactFreshnessKind",
    "signalProductionMode",
    "canProduceSignals",
    "artifactFit",
    "technicalObservability",
    "evidenceDirectness",
    "sourceRoleConfidence",
    "risk",
    "routingConfidence",
    "yieldIndependent",
    "reasonToKeep",
    "reasonNotToAutoRegister",
  ],
  properties: {
    candidateId: { type: ["string", "null"] },
    sourceUrl: STRING_SCHEMA,
    sourceScopeResolutionArtifactId: { type: ["string", "null"] },
    seedItemUrl: { type: ["string", "null"] },
    sourceScopeType: { type: "string", enum: DISCOVERY_VNEXT_SOURCE_SCOPE_TYPES },
    sourceScopeEvidence: STRING_LIST_SCHEMA,
    sourceRoleDescription: STRING_SCHEMA,
    sourceVoice: {
      type: "string",
      enum: [
        "owner_or_operator",
        "public_authority",
        "seller_or_vendor",
        "aggregator_or_directory",
        "community_or_ugc",
        "third_party_commentary",
        "unknown",
      ],
    },
    artifactProducingBehavior: STRING_SCHEMA,
    artifactFreshnessKind: {
      type: "string",
      enum: [
        "recurring_listing",
        "recurring_feed",
        "official_update",
        "static_service_page",
        "evergreen_article",
        "documentation_or_guide",
        "dataset_or_registry",
        "community_thread",
        "search_or_category_wrapper",
        "profile_or_homepage",
        "unknown",
      ],
    },
    signalProductionMode: {
      type: "string",
      enum: [
        "direct_event_feed",
        "direct_request_or_listing",
        "official_update",
        "precursor_context",
        "source_directory",
        "secondary_context",
        "unlikely",
        "unknown",
      ],
    },
    observedArtifactTypes: STRING_LIST_SCHEMA,
    canProduceSignals: {
      type: "array",
      items: {
        type: "object",
        required: ["signalDescription", "capability", "directness", "evidenceFromProbe"],
        properties: {
          signalId: STRING_SCHEMA,
          signalDescription: STRING_SCHEMA,
          capability: { type: "string", enum: ["high", "medium", "low", "unknown"] },
          capabilityScore: NUMBER_SCHEMA,
          directness: { type: "string", enum: ["direct", "indirect", "precursor", "contextual"] },
          reason: STRING_SCHEMA,
          evidenceFromProbe: STRING_LIST_SCHEMA,
          counterEvidence: STRING_LIST_SCHEMA,
        },
        additionalProperties: true,
      },
    },
    notExpectedToProduce: { type: "array", items: JSON_OBJECT_SCHEMA },
    negativeRoleEvidence: STRING_LIST_SCHEMA,
    artifactFit: NUMBER_SCHEMA,
    technicalObservability: JSON_OBJECT_SCHEMA,
    evidenceDirectness: NUMBER_SCHEMA,
    sourceRoleConfidence: NUMBER_SCHEMA,
    risk: JSON_OBJECT_SCHEMA,
    hardBlockers: STRING_LIST_SCHEMA,
    classificationUncertain: { type: "boolean" },
    potentialHigh: { type: "boolean" },
    adapterRequired: { type: "boolean" },
    routingConfidence: NUMBER_SCHEMA,
    yieldIndependent: { type: "boolean" },
    reasonToKeep: STRING_SCHEMA,
    reasonNotToAutoRegister: STRING_SCHEMA,
    accessPattern: {
      type: "string",
      enum: ["public", "requires_browser", "requires_auth", "captcha_blocked", "blocked", "unknown"],
    },
    suggestedProviderType: {
      type: "string",
      enum: ["rss", "website", "api", "document_portal", "unknown"],
    },
    probeSummary: JSON_OBJECT_SCHEMA,
    sourceScopeResolution: SOURCE_SCOPE_RESOLUTION_PAYLOAD_SCHEMA,
  },
  additionalProperties: true,
} as const satisfies JsonSchema;

export const ROUTING_DECISION_PAYLOAD_SCHEMA = {
  type: "object",
  required: ["decision", "reason", "policyVersion", "scoreComponents", "actions", "manualReviewRequired"],
  properties: {
    candidateId: { type: ["string", "null"] },
    sourceUnderstandingArtifactId: { type: ["string", "null"] },
    sourceScopeResolutionArtifactId: { type: ["string", "null"] },
    resolvedSourceUrl: { type: ["string", "null"] },
    seedItemUrl: { type: ["string", "null"] },
    sourceScopeType: { type: ["string", "null"], enum: [...DISCOVERY_VNEXT_SOURCE_SCOPE_TYPES, null] },
    decision: { type: "string", enum: DISCOVERY_VNEXT_ROUTING_DECISIONS },
    reason: STRING_SCHEMA,
    policyVersion: STRING_SCHEMA,
    scoreComponents: JSON_OBJECT_SCHEMA,
    actions: { type: "array", items: JSON_OBJECT_SCHEMA },
    manualReviewRequired: { type: "boolean" },
    sampleReviewRequired: { type: "boolean" },
    sampleReviewReason: STRING_SCHEMA,
    allowChannelCreation: { type: "boolean" },
    rollbackGroupId: { type: ["string", "null"] },
    adapterNeed: { type: ["string", "null"] },
  },
  additionalProperties: false,
} as const satisfies JsonSchema;

export const QUERY_QUALITY_REPORT_PAYLOAD_SCHEMA = {
  type: "object",
  required: ["query", "queryFamilyIntent", "queryPurpose", "observedResultMix", "quality", "recommendedNextAction"],
  properties: {
    query: STRING_SCHEMA,
    queryFamilyIntent: STRING_SCHEMA,
    queryPurpose: {
      type: "string",
      enum: [
        "find_direct_sources",
        "find_source_directories",
        "find_terminology",
        "find_documents",
        "find_discussions",
        "find_official_owners",
        "find_local_language_forms",
      ],
    },
    observedResultMix: JSON_OBJECT_SCHEMA,
    quality: {
      type: "string",
      enum: [
        "useful_for_source_acquisition",
        "useful_for_item_discovery",
        "useful_for_query_expansion",
        "noisy",
        "exhausted",
      ],
    },
    refinementHints: STRING_LIST_SCHEMA,
    recommendedNextAction: {
      type: "string",
      enum: ["probe_top_candidates", "refine_query", "use_different_lens", "stop_family"],
    },
  },
  additionalProperties: true,
} as const satisfies JsonSchema;

export const DISCOVERY_VNEXT_PAYLOAD_SCHEMAS = {
  DiscoveryBrief: DISCOVERY_BRIEF_PAYLOAD_SCHEMA,
  HypothesisBatch: HYPOTHESIS_BATCH_PAYLOAD_SCHEMA,
  ProbePlan: PROBE_PLAN_PAYLOAD_SCHEMA,
  ProbeReport: PROBE_REPORT_PAYLOAD_SCHEMA,
  SourceScopeResolution: SOURCE_SCOPE_RESOLUTION_PAYLOAD_SCHEMA,
  SourceUnderstanding: SOURCE_UNDERSTANDING_PAYLOAD_SCHEMA,
  RoutingDecision: ROUTING_DECISION_PAYLOAD_SCHEMA,
  QueryQualityReport: QUERY_QUALITY_REPORT_PAYLOAD_SCHEMA,
} as const satisfies Record<DiscoveryVNextArtifactType, JsonSchema>;

export function validateDiscoveryVNextPayload(
  artifactType: DiscoveryVNextArtifactType,
  payload: unknown
): JsonSchemaValidationIssue[] {
  return validateJsonSchema(payload, DISCOVERY_VNEXT_PAYLOAD_SCHEMAS[artifactType]);
}

export function assertDiscoveryVNextPayload(
  artifactType: DiscoveryVNextArtifactType,
  payload: unknown
): void {
  assertJsonSchema(payload, DISCOVERY_VNEXT_PAYLOAD_SCHEMAS[artifactType], {
    boundaryName: `Discovery vNext ${artifactType} payload`,
  });
}

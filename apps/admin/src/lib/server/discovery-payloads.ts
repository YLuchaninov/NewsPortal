const DEFAULT_DISCOVERY_PROVIDER_TYPES = [
  "rss",
  "website",
  "api",
  "email_imap",
  "youtube",
];
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type DiscoveryIntent =
  | "create_profile"
  | "update_profile"
  | "archive_profile"
  | "activate_profile"
  | "delete_profile"
  | "create_mission"
  | "update_mission"
  | "archive_mission"
  | "activate_mission"
  | "delete_mission"
  | "run_mission"
  | "compile_graph"
  | "create_class"
  | "update_class"
  | "archive_class"
  | "activate_class"
  | "delete_class"
  | "create_recall_mission"
  | "update_recall_mission"
  | "acquire_recall_mission"
  | "promote_recall_candidate"
  | "review_candidate"
  | "submit_feedback"
  | "re_evaluate";

export function resolveDiscoveryIntent(payload: Record<string, unknown>): DiscoveryIntent {
  const value = String(payload.intent ?? "").trim();
  if (
    value === "create_profile" ||
    value === "update_profile" ||
    value === "archive_profile" ||
    value === "activate_profile" ||
    value === "delete_profile" ||
    value === "update_mission" ||
    value === "archive_mission" ||
    value === "activate_mission" ||
    value === "delete_mission" ||
    value === "run_mission" ||
    value === "compile_graph" ||
    value === "create_class" ||
    value === "update_class" ||
    value === "archive_class" ||
    value === "activate_class" ||
    value === "delete_class" ||
    value === "create_recall_mission" ||
    value === "update_recall_mission" ||
    value === "acquire_recall_mission" ||
    value === "promote_recall_candidate" ||
    value === "review_candidate" ||
    value === "submit_feedback" ||
    value === "re_evaluate"
  ) {
    return value;
  }
  return "create_mission";
}

export function parseTextList(value: unknown): string[] {
  return String(value ?? "")
    .split("\n")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseOptionalTextList(value: unknown): string[] | undefined {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return undefined;
  }
  return parseTextList(raw);
}

export function parseProviderTypes(value: unknown): string[] {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return [...DEFAULT_DISCOVERY_PROVIDER_TYPES];
  }
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseOptionalProviderTypes(value: unknown): string[] | undefined {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return undefined;
  }
  return parseProviderTypes(raw);
}

function parseProfileProviderTypes(value: unknown): string[] {
  return parseProviderTypes(value).filter((providerType) =>
    ["rss", "website"].includes(providerType)
  );
}

function parseOptionalProfileProviderTypes(value: unknown): string[] | undefined {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return undefined;
  }
  return parseProfileProviderTypes(raw);
}

function parseProfileWebsiteKinds(value: unknown): string[] {
  return parseTextList(value);
}

function parseOptionalProfileWebsiteKinds(value: unknown): string[] | undefined {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return undefined;
  }
  return parseProfileWebsiteKinds(raw);
}

export function parseOptionalNumber(value: unknown): number | undefined {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return undefined;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function buildPolicyDiversityCaps(
  payload: Record<string, unknown>,
  prefix: "graph" | "recall"
): Record<string, number> {
  const caps: Record<string, number> = {};
  const maxPerSourceFamily = parseOptionalNumber(payload[`${prefix}MaxPerSourceFamily`]);
  const maxPerDomain = parseOptionalNumber(payload[`${prefix}MaxPerDomain`]);
  if (maxPerSourceFamily != null && maxPerSourceFamily > 0) {
    caps.maxPerSourceFamily = Math.trunc(maxPerSourceFamily);
  }
  if (maxPerDomain != null && maxPerDomain > 0) {
    caps.maxPerDomain = Math.trunc(maxPerDomain);
  }
  return caps;
}

function parseOptionalJsonRecord(value: unknown): Record<string, unknown> | undefined {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return undefined;
  }
  const parsed = JSON.parse(raw) as unknown;
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>;
  }
  throw new Error("Expected a JSON object.");
}

function buildProfilePolicyPayload(
  payload: Record<string, unknown>,
  lane: "graph" | "recall"
): Record<string, unknown> {
  const prefix = lane === "graph" ? "graph" : "recall";
  const providerTypes =
    parseOptionalProfileProviderTypes(payload[`${prefix}ProviderTypes`]) ??
    ["rss", "website"];
  const policy: Record<string, unknown> = {
    providerTypes,
    supportedWebsiteKinds: parseProfileWebsiteKinds(payload[`${prefix}SupportedWebsiteKinds`]),
    preferredDomains: parseTextList(payload[`${prefix}PreferredDomains`]),
    blockedDomains: parseTextList(payload[`${prefix}BlockedDomains`]),
    positiveKeywords: parseTextList(payload[`${prefix}PositiveKeywords`]),
    negativeKeywords: parseTextList(payload[`${prefix}NegativeKeywords`]),
    preferredTactics: parseTextList(payload[`${prefix}PreferredTactics`]),
    expectedSourceShapes: parseTextList(payload[`${prefix}ExpectedSourceShapes`]),
    allowedSourceFamilies: parseTextList(payload[`${prefix}AllowedSourceFamilies`]),
    disfavoredSourceFamilies: parseTextList(payload[`${prefix}DisfavoredSourceFamilies`]),
    usefulnessHints: parseTextList(payload[`${prefix}UsefulnessHints`]),
    diversityCaps: buildPolicyDiversityCaps(payload, prefix),
    advancedPromptInstructions:
      String(payload[`${prefix}AdvancedPromptInstructions`] ?? "").trim() || null,
  };
  if (lane === "graph") {
    policy.minRssReviewScore = parseOptionalNumber(payload.graphMinRssReviewScore);
    policy.minWebsiteReviewScore = parseOptionalNumber(payload.graphMinWebsiteReviewScore);
  } else {
    policy.minPromotionScore = parseOptionalNumber(payload.recallMinPromotionScore);
  }
  return policy;
}

function buildPartialProfilePolicyPayload(
  payload: Record<string, unknown>,
  lane: "graph" | "recall"
): Record<string, unknown> | undefined {
  if (!hasAnyProfilePolicyField(payload, lane)) {
    return undefined;
  }
  const policy: Record<string, unknown> = {};
  const prefix = lane === "graph" ? "graph" : "recall";
  if (Object.prototype.hasOwnProperty.call(payload, `${prefix}ProviderTypes`)) {
    policy.providerTypes = parseProfileProviderTypes(payload[`${prefix}ProviderTypes`]);
  }
  if (Object.prototype.hasOwnProperty.call(payload, `${prefix}SupportedWebsiteKinds`)) {
    policy.supportedWebsiteKinds = parseOptionalProfileWebsiteKinds(
      payload[`${prefix}SupportedWebsiteKinds`]
    ) ?? [];
  }
  if (Object.prototype.hasOwnProperty.call(payload, `${prefix}PreferredDomains`)) {
    policy.preferredDomains = parseTextList(payload[`${prefix}PreferredDomains`]);
  }
  if (Object.prototype.hasOwnProperty.call(payload, `${prefix}BlockedDomains`)) {
    policy.blockedDomains = parseTextList(payload[`${prefix}BlockedDomains`]);
  }
  if (Object.prototype.hasOwnProperty.call(payload, `${prefix}PositiveKeywords`)) {
    policy.positiveKeywords = parseTextList(payload[`${prefix}PositiveKeywords`]);
  }
  if (Object.prototype.hasOwnProperty.call(payload, `${prefix}NegativeKeywords`)) {
    policy.negativeKeywords = parseTextList(payload[`${prefix}NegativeKeywords`]);
  }
  if (Object.prototype.hasOwnProperty.call(payload, `${prefix}PreferredTactics`)) {
    policy.preferredTactics = parseTextList(payload[`${prefix}PreferredTactics`]);
  }
  if (Object.prototype.hasOwnProperty.call(payload, `${prefix}ExpectedSourceShapes`)) {
    policy.expectedSourceShapes = parseTextList(payload[`${prefix}ExpectedSourceShapes`]);
  }
  if (Object.prototype.hasOwnProperty.call(payload, `${prefix}AllowedSourceFamilies`)) {
    policy.allowedSourceFamilies = parseTextList(payload[`${prefix}AllowedSourceFamilies`]);
  }
  if (Object.prototype.hasOwnProperty.call(payload, `${prefix}DisfavoredSourceFamilies`)) {
    policy.disfavoredSourceFamilies = parseTextList(payload[`${prefix}DisfavoredSourceFamilies`]);
  }
  if (Object.prototype.hasOwnProperty.call(payload, `${prefix}UsefulnessHints`)) {
    policy.usefulnessHints = parseTextList(payload[`${prefix}UsefulnessHints`]);
  }
  if (
    Object.prototype.hasOwnProperty.call(payload, `${prefix}MaxPerSourceFamily`) ||
    Object.prototype.hasOwnProperty.call(payload, `${prefix}MaxPerDomain`)
  ) {
    policy.diversityCaps = buildPolicyDiversityCaps(payload, prefix);
  }
  if (Object.prototype.hasOwnProperty.call(payload, `${prefix}AdvancedPromptInstructions`)) {
    policy.advancedPromptInstructions =
      String(payload[`${prefix}AdvancedPromptInstructions`] ?? "").trim() || null;
  }
  if (lane === "graph") {
    if (Object.prototype.hasOwnProperty.call(payload, "graphMinRssReviewScore")) {
      policy.minRssReviewScore = parseOptionalNumber(payload.graphMinRssReviewScore);
    }
    if (Object.prototype.hasOwnProperty.call(payload, "graphMinWebsiteReviewScore")) {
      policy.minWebsiteReviewScore = parseOptionalNumber(payload.graphMinWebsiteReviewScore);
    }
  } else if (Object.prototype.hasOwnProperty.call(payload, "recallMinPromotionScore")) {
    policy.minPromotionScore = parseOptionalNumber(payload.recallMinPromotionScore);
  }
  return policy;
}

function buildYieldBenchmarkPayload(payload: Record<string, unknown>): Record<string, unknown> {
  return {
    domains: parseTextList(payload.benchmarkDomains),
    titleKeywords: parseTextList(payload.benchmarkTitleKeywords),
    tacticKeywords: parseTextList(payload.benchmarkTacticKeywords),
  };
}

function buildPartialYieldBenchmarkPayload(
  payload: Record<string, unknown>
): Record<string, unknown> | undefined {
  if (!hasAnyYieldBenchmarkField(payload)) {
    return undefined;
  }
  const result: Record<string, unknown> = {};
  if (Object.prototype.hasOwnProperty.call(payload, "benchmarkDomains")) {
    result.domains = parseTextList(payload.benchmarkDomains);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "benchmarkTitleKeywords")) {
    result.titleKeywords = parseTextList(payload.benchmarkTitleKeywords);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "benchmarkTacticKeywords")) {
    result.tacticKeywords = parseTextList(payload.benchmarkTacticKeywords);
  }
  return result;
}

function hasAnyProfilePolicyField(
  payload: Record<string, unknown>,
  lane: "graph" | "recall"
): boolean {
  const fields =
    lane === "graph"
      ? [
          "graphProviderTypes",
          "graphSupportedWebsiteKinds",
          "graphPreferredDomains",
          "graphBlockedDomains",
          "graphPositiveKeywords",
          "graphNegativeKeywords",
          "graphPreferredTactics",
          "graphMinRssReviewScore",
          "graphMinWebsiteReviewScore",
          "graphAdvancedPromptInstructions",
        ]
      : [
          "recallProviderTypes",
          "recallSupportedWebsiteKinds",
          "recallPreferredDomains",
          "recallBlockedDomains",
          "recallPositiveKeywords",
          "recallNegativeKeywords",
          "recallPreferredTactics",
          "recallMinPromotionScore",
          "recallAdvancedPromptInstructions",
        ];
  return fields.some((field) => Object.prototype.hasOwnProperty.call(payload, field));
}

function hasAnyYieldBenchmarkField(payload: Record<string, unknown>): boolean {
  return ["benchmarkDomains", "benchmarkTitleKeywords", "benchmarkTacticKeywords"].some((field) =>
    Object.prototype.hasOwnProperty.call(payload, field)
  );
}

export function normalizeAuditEntityId(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return UUID_PATTERN.test(normalized) ? normalized : null;
}

export function buildDiscoveryMissionCreateApiPayload(
  payload: Record<string, unknown>,
  createdBy: string
): Record<string, unknown> {
  return {
    title: String(payload.title ?? "").trim(),
    description: String(payload.description ?? "").trim() || null,
    sourceKind: String(payload.sourceKind ?? "").trim() || "manual",
    sourceRefId: String(payload.sourceRefId ?? "").trim() || null,
    seedTopics: parseTextList(payload.seedTopics ?? payload.topics),
    seedLanguages: parseTextList(payload.seedLanguages ?? payload.languages),
    seedRegions: parseTextList(payload.seedRegions ?? payload.regions),
    targetProviderTypes: parseProviderTypes(payload.targetProviderTypes),
    interestGraph: parseOptionalJsonRecord(payload.interestGraph),
    maxHypotheses: parseOptionalNumber(payload.maxHypotheses),
    maxSources: parseOptionalNumber(payload.maxSources),
    budgetCents: parseOptionalNumber(payload.budgetCents),
    priority: parseOptionalNumber(payload.priority) ?? 0,
    profileId: String(payload.profileId ?? "").trim() || null,
    createdBy,
  };
}

export function buildDiscoveryMissionUpdateApiPayload(
  payload: Record<string, unknown>
): Record<string, unknown> {
  const hasProfileId = Object.prototype.hasOwnProperty.call(payload, "profileId");
  return {
    title: String(payload.title ?? "").trim() || undefined,
    description: String(payload.description ?? "").trim() || undefined,
    status: String(payload.status ?? "").trim() || undefined,
    priority: parseOptionalNumber(payload.priority),
    budgetCents: parseOptionalNumber(payload.budgetCents),
    maxHypotheses: parseOptionalNumber(payload.maxHypotheses),
    maxSources: parseOptionalNumber(payload.maxSources),
    seedTopics: parseOptionalTextList(payload.seedTopics ?? payload.topics),
    seedLanguages: parseOptionalTextList(payload.seedLanguages ?? payload.languages),
    seedRegions: parseOptionalTextList(payload.seedRegions ?? payload.regions),
    targetProviderTypes: parseOptionalProviderTypes(payload.targetProviderTypes),
    interestGraph: parseOptionalJsonRecord(payload.interestGraph),
    profileId: hasProfileId ? String(payload.profileId ?? "").trim() || null : undefined,
  };
}

export function buildDiscoveryRecallMissionCreateApiPayload(
  payload: Record<string, unknown>,
  createdBy: string
): Record<string, unknown> {
  return {
    title: String(payload.title ?? "").trim(),
    description: String(payload.description ?? "").trim() || null,
    missionKind: String(payload.missionKind ?? "").trim() || "manual",
    seedDomains: parseTextList(payload.seedDomains),
    seedUrls: parseTextList(payload.seedUrls),
    seedQueries: parseTextList(payload.seedQueries),
    targetProviderTypes: parseProviderTypes(payload.targetProviderTypes || "rss,website"),
    scopeJson: parseOptionalJsonRecord(payload.scopeJson) ?? {},
    maxCandidates: parseOptionalNumber(payload.maxCandidates) ?? 50,
    profileId: String(payload.profileId ?? "").trim() || null,
    createdBy,
  };
}

export function buildDiscoveryRecallMissionUpdateApiPayload(
  payload: Record<string, unknown>
): Record<string, unknown> {
  const hasProfileId = Object.prototype.hasOwnProperty.call(payload, "profileId");
  return {
    title: String(payload.title ?? "").trim() || undefined,
    description: String(payload.description ?? "").trim() || undefined,
    missionKind: String(payload.missionKind ?? "").trim() || undefined,
    seedDomains: parseOptionalTextList(payload.seedDomains),
    seedUrls: parseOptionalTextList(payload.seedUrls),
    seedQueries: parseOptionalTextList(payload.seedQueries),
    targetProviderTypes: parseOptionalProviderTypes(payload.targetProviderTypes),
    scopeJson: parseOptionalJsonRecord(payload.scopeJson),
    maxCandidates: parseOptionalNumber(payload.maxCandidates),
    status: String(payload.status ?? "").trim() || undefined,
    profileId: hasProfileId ? String(payload.profileId ?? "").trim() || null : undefined,
  };
}

export function buildDiscoveryProfileCreateApiPayload(
  payload: Record<string, unknown>,
  createdBy: string
): Record<string, unknown> {
  return {
    profileKey: String(payload.profileKey ?? "").trim(),
    displayName: String(payload.displayName ?? "").trim(),
    description: String(payload.description ?? "").trim() || null,
    status: String(payload.status ?? "").trim() || "draft",
    graphPolicyJson: buildProfilePolicyPayload(payload, "graph"),
    recallPolicyJson: buildProfilePolicyPayload(payload, "recall"),
    yieldBenchmarkJson: buildYieldBenchmarkPayload(payload),
    createdBy,
  };
}

export function buildDiscoveryProfileUpdateApiPayload(
  payload: Record<string, unknown>
): Record<string, unknown> {
  return {
    displayName: String(payload.displayName ?? "").trim() || undefined,
    description: String(payload.description ?? "").trim() || undefined,
    status: String(payload.status ?? "").trim() || undefined,
    graphPolicyJson: buildPartialProfilePolicyPayload(payload, "graph"),
    recallPolicyJson: buildPartialProfilePolicyPayload(payload, "recall"),
    yieldBenchmarkJson: buildPartialYieldBenchmarkPayload(payload),
  };
}

export function buildDiscoveryHypothesisClassCreateApiPayload(
  payload: Record<string, unknown>
): Record<string, unknown> {
  return {
    classKey: String(payload.classKey ?? "").trim(),
    displayName: String(payload.displayName ?? "").trim(),
    description: String(payload.description ?? "").trim() || null,
    status: String(payload.status ?? "").trim() || "draft",
    generationBackend: String(payload.generationBackend ?? "").trim() || "graph_seed_llm",
    defaultProviderTypes: parseProviderTypes(payload.defaultProviderTypes),
    promptInstructions: String(payload.promptInstructions ?? "").trim() || null,
    seedRulesJson: parseOptionalJsonRecord(payload.seedRulesJson) ?? {},
    maxPerMission: parseOptionalNumber(payload.maxPerMission) ?? 3,
    sortOrder: parseOptionalNumber(payload.sortOrder) ?? 0,
    configJson: parseOptionalJsonRecord(payload.configJson) ?? {},
  };
}

export function buildDiscoveryHypothesisClassUpdateApiPayload(
  payload: Record<string, unknown>
): Record<string, unknown> {
  const apiPayload: Record<string, unknown> = {
    displayName: String(payload.displayName ?? "").trim() || undefined,
    description: String(payload.description ?? "").trim() || undefined,
    status: String(payload.status ?? "").trim() || undefined,
    generationBackend: String(payload.generationBackend ?? "").trim() || undefined,
    defaultProviderTypes: parseOptionalProviderTypes(payload.defaultProviderTypes),
    promptInstructions: String(payload.promptInstructions ?? "").trim() || undefined,
    maxPerMission: parseOptionalNumber(payload.maxPerMission),
    sortOrder: parseOptionalNumber(payload.sortOrder),
  };
  const seedRulesJson = parseOptionalJsonRecord(payload.seedRulesJson);
  const configJson = parseOptionalJsonRecord(payload.configJson);
  if (seedRulesJson !== undefined) {
    apiPayload.seedRulesJson = seedRulesJson;
  }
  if (configJson !== undefined) {
    apiPayload.configJson = configJson;
  }
  return apiPayload;
}

export function buildDiscoveryCandidateReviewApiPayload(
  payload: Record<string, unknown>,
  reviewedBy: string
): Record<string, unknown> {
  return {
    status: String(payload.status ?? "").trim(),
    reviewedBy,
    rejectionReason: String(payload.rejectionReason ?? "").trim() || null,
  };
}

export function buildDiscoveryFeedbackApiPayload(
  payload: Record<string, unknown>,
  createdBy: string
): Record<string, unknown> {
  return {
    missionId: String(payload.missionId ?? "").trim() || null,
    candidateId: String(payload.candidateId ?? "").trim() || null,
    sourceProfileId: String(payload.sourceProfileId ?? "").trim() || null,
    feedbackType: String(payload.feedbackType ?? "").trim(),
    feedbackValue: String(payload.feedbackValue ?? "").trim() || null,
    notes: String(payload.notes ?? "").trim() || null,
    createdBy,
  };
}

export function buildDiscoveryAuditPayload(
  intent: DiscoveryIntent,
  payload: Record<string, unknown>,
  apiResult: Record<string, unknown> = {}
): Record<string, unknown> {
  if (
    intent === "create_profile" ||
    intent === "update_profile" ||
    intent === "archive_profile" ||
    intent === "activate_profile"
  ) {
    return {
      profileId: String(apiResult.profile_id ?? payload.profileId ?? "").trim() || null,
      profileKey: String(apiResult.profile_key ?? payload.profileKey ?? "").trim() || null,
      displayName:
        String(apiResult.display_name ?? payload.displayName ?? "").trim() || null,
      status:
        intent === "archive_profile"
          ? "archived"
          : intent === "activate_profile"
            ? "active"
            : String(apiResult.status ?? payload.status ?? "").trim() || null,
      version: apiResult.version ?? null,
    };
  }
  if (intent === "delete_profile") {
    return {
      profileId: String(payload.profileId ?? "").trim() || null,
      deleted: apiResult.deleted === true,
    };
  }
  if (intent === "create_mission") {
    return {
      title: String(payload.title ?? "").trim(),
      missionId: apiResult.mission_id ?? null,
      seedTopics: parseTextList(payload.seedTopics ?? payload.topics),
      profileId: String(payload.profileId ?? "").trim() || null,
    };
  }
  if (
    intent === "update_mission" ||
    intent === "archive_mission" ||
    intent === "activate_mission"
  ) {
    return {
      missionId: String(payload.missionId ?? "").trim() || null,
      status:
        intent === "archive_mission"
          ? "archived"
          : intent === "activate_mission"
            ? "planned"
            : String(payload.status ?? "").trim() || null,
      priority: parseOptionalNumber(payload.priority),
      budgetCents: parseOptionalNumber(payload.budgetCents),
      profileId: String(payload.profileId ?? "").trim() || null,
    };
  }
  if (intent === "delete_mission") {
    return {
      missionId: String(payload.missionId ?? "").trim() || null,
      deleted: apiResult.deleted === true,
    };
  }
  if (intent === "run_mission") {
    return {
      missionId: String(payload.missionId ?? "").trim() || null,
      runId: apiResult.run_id ?? null,
    };
  }
  if (intent === "compile_graph") {
    return {
      missionId: String(payload.missionId ?? "").trim() || null,
      interestGraphStatus: apiResult.interest_graph_status ?? null,
      interestGraphVersion: apiResult.interest_graph_version ?? null,
    };
  }
  if (
    intent === "create_class" ||
    intent === "update_class" ||
    intent === "archive_class" ||
    intent === "activate_class"
  ) {
    const resolvedClassKey =
      apiResult.class_key ?? (String(payload.classKey ?? payload.class_key ?? "").trim() || null);
    return {
      classKey: resolvedClassKey,
      displayName: String(payload.displayName ?? "").trim() || null,
      status:
        intent === "archive_class"
          ? "archived"
          : intent === "activate_class"
            ? "active"
            : String(payload.status ?? "").trim() || null,
      generationBackend: String(payload.generationBackend ?? "").trim() || null,
    };
  }
  if (intent === "create_recall_mission" || intent === "update_recall_mission") {
    return {
      recallMissionId:
        String(apiResult.recall_mission_id ?? payload.recallMissionId ?? "").trim() || null,
      title: String(payload.title ?? "").trim() || null,
      missionKind: String(payload.missionKind ?? "").trim() || null,
      status: String(apiResult.status ?? payload.status ?? "").trim() || null,
      profileId: String(payload.profileId ?? "").trim() || null,
      seedDomains: parseTextList(payload.seedDomains),
      seedQueries: parseTextList(payload.seedQueries),
    };
  }
  if (intent === "acquire_recall_mission") {
    return {
      recallMissionId:
        String(apiResult.recall_mission_id ?? payload.recallMissionId ?? "").trim() || null,
      status: String(apiResult.status ?? "").trim() || null,
      acquiredCandidateCount: apiResult.acquired_candidate_count ?? null,
      runId: apiResult.run_id ?? null,
    };
  }
  if (intent === "promote_recall_candidate") {
    return {
      recallCandidateId:
        String(apiResult.recall_candidate_id ?? payload.recallCandidateId ?? "").trim() || null,
      status: String(apiResult.status ?? "").trim() || null,
      registeredChannelId:
        String(apiResult.registered_channel_id ?? payload.registeredChannelId ?? "").trim() ||
        null,
      sourceProfileId:
        String(apiResult.source_profile_id ?? payload.sourceProfileId ?? "").trim() || null,
    };
  }
  if (intent === "delete_class") {
    return {
      classKey: String(payload.classKey ?? payload.class_key ?? "").trim() || null,
      deleted: apiResult.deleted === true,
    };
  }
  if (intent === "submit_feedback") {
    return {
      feedbackEventId: apiResult.feedback_event_id ?? null,
      missionId: String(payload.missionId ?? "").trim() || null,
      candidateId: String(payload.candidateId ?? "").trim() || null,
      sourceProfileId: String(payload.sourceProfileId ?? "").trim() || null,
      feedbackType: String(payload.feedbackType ?? "").trim() || null,
      feedbackValue: String(payload.feedbackValue ?? "").trim() || null,
    };
  }
  if (intent === "re_evaluate") {
    return {
      missionId: String(payload.missionId ?? "").trim() || null,
      reEvaluatedCount: apiResult.discovery_re_evaluated_count ?? null,
      portfolioSnapshotCount: apiResult.discovery_portfolio_snapshot_count ?? null,
    };
  }
  return {
    status: String(payload.status ?? "").trim(),
    rejectionReason: String(payload.rejectionReason ?? "").trim() || null,
    candidateId: String(payload.candidateId ?? "").trim() || null,
  };
}

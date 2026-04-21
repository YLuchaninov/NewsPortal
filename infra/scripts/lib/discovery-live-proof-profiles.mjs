function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function cloneStringArray(value) {
  return asArray(value)
    .map((item) => String(item ?? "").trim())
    .filter(Boolean);
}

function clonePolicy(policy) {
  const diversityCaps = policy?.diversityCaps && typeof policy.diversityCaps === "object"
    ? {
        ...(typeof policy.diversityCaps.maxPerSourceFamily === "number"
          ? { maxPerSourceFamily: policy.diversityCaps.maxPerSourceFamily }
          : {}),
        ...(typeof policy.diversityCaps.maxPerDomain === "number"
          ? { maxPerDomain: policy.diversityCaps.maxPerDomain }
          : {}),
      }
    : {};
  return {
    providerTypes: cloneStringArray(policy?.providerTypes ?? ["rss", "website"]),
    supportedWebsiteKinds: cloneStringArray(policy?.supportedWebsiteKinds),
    preferredDomains: cloneStringArray(policy?.preferredDomains),
    blockedDomains: cloneStringArray(policy?.blockedDomains ?? policy?.negativeDomains),
    positiveKeywords: cloneStringArray(policy?.positiveKeywords),
    negativeKeywords: cloneStringArray(policy?.negativeKeywords),
    preferredTactics: cloneStringArray(policy?.preferredTactics),
    expectedSourceShapes: cloneStringArray(policy?.expectedSourceShapes),
    allowedSourceFamilies: cloneStringArray(policy?.allowedSourceFamilies),
    disfavoredSourceFamilies: cloneStringArray(policy?.disfavoredSourceFamilies),
    usefulnessHints: cloneStringArray(policy?.usefulnessHints),
    diversityCaps,
    minRssReviewScore:
      typeof policy?.minRssReviewScore === "number" ? policy.minRssReviewScore : undefined,
    minWebsiteReviewScore:
      typeof policy?.minWebsiteReviewScore === "number" ? policy.minWebsiteReviewScore : undefined,
    minPromotionScore:
      typeof policy?.minPromotionScore === "number" ? policy.minPromotionScore : undefined,
    advancedPromptInstructions:
      typeof policy?.advancedPromptInstructions === "string"
        ? policy.advancedPromptInstructions
        : null,
  };
}

function cloneBenchmark(benchmark) {
  return {
    domains: cloneStringArray(benchmark?.domains),
    titleKeywords: cloneStringArray(benchmark?.titleKeywords),
    tacticKeywords: cloneStringArray(benchmark?.tacticKeywords),
  };
}

export function getCaseProofProfile(caseDefinition) {
  const fallbackLabel = String(caseDefinition?.label ?? caseDefinition?.key ?? "Discovery Profile");
  const configured = caseDefinition?.proofProfile ?? {};
  return {
    profileKey: String(
      configured.profileKey
        ?? `${String(caseDefinition?.key ?? "discovery_case").trim()}_proof_profile`
    ).trim(),
    displayName: String(configured.displayName ?? `${fallbackLabel} Proof-backed Discovery`).trim(),
    description: String(
      configured.description
        ?? `Reusable proof-backed discovery tuning profile for ${fallbackLabel}.`
    ).trim(),
    status: "active",
  };
}

export function buildDiscoveryProfilePayload(caseDefinition) {
  const profile = getCaseProofProfile(caseDefinition);
  return {
    profileKey: profile.profileKey,
    displayName: profile.displayName,
    description: profile.description,
    status: profile.status,
    graphPolicyJson: clonePolicy(caseDefinition?.graphPolicy),
    recallPolicyJson: clonePolicy(caseDefinition?.recallPolicy),
    yieldBenchmarkJson: cloneBenchmark(caseDefinition?.yieldBenchmark),
  };
}

export function buildProfileBackedGraphMissionPayload(caseDefinition, runLabel, profileId) {
  return {
    title: `${caseDefinition.graphMission.title} ${runLabel}`,
    description: caseDefinition.graphMission.description,
    sourceKind: "manual",
    seedTopics: [...caseDefinition.graphMission.seedTopics],
    seedLanguages: [...caseDefinition.graphMission.seedLanguages],
    seedRegions: [...caseDefinition.graphMission.seedRegions],
    targetProviderTypes: [...caseDefinition.graphMission.targetProviderTypes],
    maxHypotheses: caseDefinition.graphMission.maxHypotheses,
    maxSources: caseDefinition.graphMission.maxSources,
    budgetCents: caseDefinition.graphMission.budgetCents,
    priority: caseDefinition.graphMission.priority,
    profileId: profileId || null,
    createdBy: "infra:test-live-discovery-examples",
  };
}

export function buildProfileBackedRecallMissionPayload(caseDefinition, runLabel, profileId) {
  return {
    title: `${caseDefinition.recallMission.title} ${runLabel}`,
    description: caseDefinition.recallMission.description,
    missionKind: caseDefinition.recallMission.missionKind,
    seedQueries: [...caseDefinition.recallMission.seedQueries],
    targetProviderTypes: [...caseDefinition.recallMission.targetProviderTypes],
    scopeJson: {
      source: "infra:test-live-discovery-examples",
      caseKey: caseDefinition.key,
    },
    maxCandidates: caseDefinition.recallMission.maxCandidates,
    profileId: profileId || null,
    createdBy: "infra:test-live-discovery-examples",
  };
}

export function buildManualReplaySettings(caseDefinition, options = {}) {
  const profile = options.materializedProfile ?? {};
  const mission = options.graphMission ?? {};
  const recallMission = options.recallMission ?? {};
  const proofProfile = getCaseProofProfile(caseDefinition);

  return {
    profile: {
      profileId: profile.profile_id ?? profile.profileId ?? null,
      profileKey: String(
        profile.profile_key ?? profile.profileKey ?? proofProfile.profileKey
      ).trim(),
      displayName: String(
        profile.display_name ?? profile.displayName ?? proofProfile.displayName
      ).trim(),
      status: String(profile.status ?? "active").trim() || "active",
      version:
        Number.isFinite(Number(profile.version))
          ? Number(profile.version)
          : Number(mission.applied_profile_version ?? recallMission.applied_profile_version ?? 1),
    },
    graphPolicy: clonePolicy(caseDefinition?.graphPolicy),
    recallPolicy: clonePolicy(caseDefinition?.recallPolicy),
    yieldBenchmark: cloneBenchmark(caseDefinition?.yieldBenchmark),
    graphMission: {
      title: String(caseDefinition?.graphMission?.title ?? "").trim(),
      description: String(caseDefinition?.graphMission?.description ?? "").trim(),
      seedTopics: cloneStringArray(caseDefinition?.graphMission?.seedTopics),
      seedLanguages: cloneStringArray(caseDefinition?.graphMission?.seedLanguages),
      seedRegions: cloneStringArray(caseDefinition?.graphMission?.seedRegions),
      targetProviderTypes: cloneStringArray(caseDefinition?.graphMission?.targetProviderTypes),
      maxHypotheses: Number(caseDefinition?.graphMission?.maxHypotheses ?? 0),
      maxSources: Number(caseDefinition?.graphMission?.maxSources ?? 0),
      budgetCents: Number(caseDefinition?.graphMission?.budgetCents ?? 0),
      appliedProfileVersion:
        Number.isFinite(Number(mission.applied_profile_version))
          ? Number(mission.applied_profile_version)
          : null,
      appliedPolicy:
        mission.applied_policy_json ?? mission.appliedPolicyJson ?? null,
    },
    recallMission: {
      title: String(caseDefinition?.recallMission?.title ?? "").trim(),
      description: String(caseDefinition?.recallMission?.description ?? "").trim(),
      missionKind: String(caseDefinition?.recallMission?.missionKind ?? "").trim(),
      seedQueries: cloneStringArray(caseDefinition?.recallMission?.seedQueries),
      targetProviderTypes: cloneStringArray(caseDefinition?.recallMission?.targetProviderTypes),
      maxCandidates: Number(caseDefinition?.recallMission?.maxCandidates ?? 0),
      appliedProfileVersion:
        Number.isFinite(Number(recallMission.applied_profile_version))
          ? Number(recallMission.applied_profile_version)
          : null,
      appliedPolicy:
        recallMission.applied_policy_json ?? recallMission.appliedPolicyJson ?? null,
    },
  };
}

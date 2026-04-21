function normalizeText(value) {
  return String(value ?? "").trim();
}

export const NORMALIZED_YIELD_REASON_BUCKETS = [
  "candidate_not_valid",
  "unsupported_provider_type",
  "unsupported_challenge",
  "browser_assisted_residual",
  "below_auto_approval_threshold",
  "below_auto_promotion_threshold",
  "registration_failed",
  "source_onboarded_no_match_yet",
  "candidate_found_not_onboarded",
];

function asNumber(value, fallback = 0) {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value != null && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function parseUrlDomain(value) {
  const input = normalizeText(value);
  if (!input) {
    return "";
  }
  try {
    const url = input.includes("://") ? new URL(input) : new URL(`https://${input}`);
    return String(url.hostname || "").toLowerCase().replace(/^www\./, "");
  } catch {
    return input.toLowerCase().replace(/^www\./, "").replace(/\/.*$/, "");
  }
}

function normalizeKeywordList(values) {
  return asArray(values)
    .map((value) => normalizeText(value).toLowerCase())
    .filter(Boolean);
}

function normalizeDomainList(values) {
  return asArray(values)
    .map((value) => parseUrlDomain(value))
    .filter(Boolean);
}

function matchesKeyword(values, keywords) {
  if (keywords.length === 0) {
    return false;
  }
  return values.some((value) => keywords.some((keyword) => value.includes(keyword)));
}

function matchesDomain(domain, domains) {
  if (!domain || domains.length === 0) {
    return false;
  }
  return domains.some((candidate) => domain === candidate || domain.endsWith(`.${candidate}`));
}

function summarizeCounts(items, keyName, topLimit) {
  const counts = new Map();
  for (const item of items) {
    const key = normalizeText(item);
    if (!key) {
      continue;
    }
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((left, right) => {
      if (right[1] !== left[1]) {
        return right[1] - left[1];
      }
      return left[0].localeCompare(right[0]);
    })
    .slice(0, topLimit)
    .map(([value, count]) => ({ [keyName]: value, count }));
}

export function getCandidateContext(candidate) {
  const evaluation = asObject(candidate.evaluation_json);
  const classification = asObject(evaluation.classification);
  const policyReview = asObject(evaluation.policyReview);
  const providerType = normalizeText(candidate.provider_type).toLowerCase();
  const title = normalizeText(candidate.title);
  const url = normalizeText(candidate.final_url) || normalizeText(candidate.url);
  const domain = parseUrlDomain(url);
  const searchQuery = normalizeText(candidate.search_query);
  const tacticKey = normalizeText(candidate.tactic_key || candidate.quality_signal_source).toLowerCase();
  const classificationKind = normalizeText(classification.kind).toLowerCase();
  const browserAssistedRecommended = Boolean(evaluation.browser_assisted_recommended);
  const challengeKind = normalizeText(evaluation.challenge_kind).toLowerCase();
  const textualFields = [
    title.toLowerCase(),
    url.toLowerCase(),
    domain,
    searchQuery.toLowerCase(),
    tacticKey,
    normalizeText(candidate.description).toLowerCase(),
  ].filter(Boolean);

  return {
    providerType,
    title,
    url,
    domain,
    searchQuery,
    tacticKey,
    classificationKind,
    browserAssistedRecommended,
    challengeKind,
    textualFields,
    evaluation,
    policyReview,
  };
}

function classifyFromRuntimePolicyReview(candidate, context) {
  const policyReview = asObject(context.policyReview);
  const verdict = normalizeText(policyReview.verdict).toLowerCase();
  if (!verdict) {
    return null;
  }
  const reviewScore = asNumber(policyReview.reviewScore, asNumber(policyReview.finalReviewScore, 0));
  const reasonBucket = normalizeText(policyReview.reasonBucket) || null;
  const benchmarkLike = Boolean(asObject(policyReview.matchedSignals).benchmarkLike);
  const responseBase = {
    reviewScore,
    benchmarkLike,
    policySignals: asObject(policyReview.matchedSignals),
    onboardingVerdict: normalizeText(policyReview.onboardingVerdict) || null,
    productivityRisk: normalizeText(policyReview.productivityRisk) || null,
    usefulnessDiagnostic: normalizeText(policyReview.usefulnessDiagnostic) || null,
    stageLossBucket: normalizeText(policyReview.stageLossBucket) || null,
    sourceFamily:
      normalizeText(asObject(policyReview.matchedSignals).sourceFamily)
      || null,
    sourceShape:
      normalizeText(asObject(policyReview.matchedSignals).sourceShape)
      || null,
    context,
  };
  if (verdict === "auto_approve") {
    return { decision: "approvable", ...responseBase };
  }
  if (verdict === "promotable") {
    return { decision: "promotable", ...responseBase };
  }
  if (verdict === "duplicate") {
    return { decision: "duplicate", ...responseBase };
  }
  return {
    decision: "rejected",
    rejectionReason: reasonBucket || "below_auto_approval_threshold",
    ...responseBase,
  };
}

function resolveCandidateLossBucket(candidate) {
  const stageLossBucket = normalizeText(candidate.stageLossBucket);
  if (stageLossBucket) {
    return stageLossBucket;
  }
  const rejectionReason = normalizeText(candidate.rejectionReason);
  if (
    rejectionReason === "browser_assisted_residual"
    || rejectionReason === "unsupported_challenge"
  ) {
    return "candidate_manual_only";
  }
  if (candidate.decision === "rejected") {
    return "candidate_rejected_by_policy";
  }
  return "";
}

export function isBenchmarkLikeCandidate(candidate, caseDefinition) {
  const benchmark = asObject(caseDefinition.yieldBenchmark);
  const context = getCandidateContext(candidate);
  const domains = normalizeDomainList(benchmark.domains);
  const titleKeywords = normalizeKeywordList(benchmark.titleKeywords);
  const tacticKeywords = normalizeKeywordList(benchmark.tacticKeywords);
  return (
    matchesDomain(context.domain, domains)
    || matchesKeyword([context.title.toLowerCase()], titleKeywords)
    || matchesKeyword([context.tacticKey, context.searchQuery.toLowerCase()], tacticKeywords)
  );
}

function buildPolicySignals(caseDefinition, laneType, context) {
  const policy = asObject(caseDefinition[`${laneType}Policy`]);
  const positiveKeywords = normalizeKeywordList(policy.positiveKeywords);
  const negativeKeywords = normalizeKeywordList(policy.negativeKeywords);
  const preferredTactics = normalizeKeywordList(policy.preferredTactics);
  const preferredDomains = normalizeDomainList(policy.preferredDomains);
  const negativeDomains = normalizeDomainList(policy.negativeDomains);
  const benchmarkLike = isBenchmarkLikeCandidate(context, caseDefinition);
  const positiveKeywordMatch = matchesKeyword(context.textualFields, positiveKeywords);
  const negativeKeywordMatch = matchesKeyword(context.textualFields, negativeKeywords);
  const preferredTacticMatch = matchesKeyword(
    [context.tacticKey, context.searchQuery.toLowerCase()],
    preferredTactics
  );
  const preferredDomainMatch = matchesDomain(context.domain, preferredDomains);
  const negativeDomainMatch = matchesDomain(context.domain, negativeDomains);

  return {
    benchmarkLike,
    positiveKeywordMatch,
    negativeKeywordMatch,
    preferredTacticMatch,
    preferredDomainMatch,
    negativeDomainMatch,
  };
}

function resolveSupportedWebsiteKinds(caseDefinition, laneType, defaults) {
  const policy = asObject(caseDefinition[`${laneType}Policy`]);
  const policyKinds = normalizeKeywordList(policy.supportedWebsiteKinds);
  return policyKinds.length > 0
    ? policyKinds
    : normalizeKeywordList(defaults.supportedWebsiteKinds);
}

function classifyResidual(context, defaults) {
  if (
    context.challengeKind
    && asArray(defaults.unsupportedChallengeKinds).includes(context.challengeKind)
  ) {
    return "unsupported_challenge";
  }
  if (context.providerType === "website" && context.browserAssistedRecommended) {
    return "browser_assisted_residual";
  }
  return null;
}

export function scoreGraphCandidate(candidate, caseDefinition, defaults) {
  const context = getCandidateContext(candidate);
  const policy = asObject(caseDefinition.graphPolicy);
  const signals = buildPolicySignals(caseDefinition, "graph", context);
  let score = asNumber(candidate.relevance_score, 0);

  if (context.providerType === "rss") {
    score += asNumber(policy.rssProviderBonus, 0.14);
  }
  if (context.providerType === "website" && context.classificationKind === "editorial") {
    score += asNumber(policy.editorialBonus, 0.12);
  }
  if (
    context.providerType === "website"
    && asArray(defaults.supportedWebsiteKinds).includes(context.classificationKind)
  ) {
    score += asNumber(policy.supportedWebsiteKindBonus, 0.04);
  }
  if (signals.preferredTacticMatch) {
    score += asNumber(policy.preferredTacticBonus, 0.07);
  }
  if (signals.preferredDomainMatch) {
    score += asNumber(policy.preferredDomainBonus, 0.08);
  }
  if (signals.positiveKeywordMatch) {
    score += asNumber(policy.positiveKeywordBonus, 0.05);
  }
  if (signals.benchmarkLike) {
    score += asNumber(policy.benchmarkBonus, 0.08);
  }
  if (signals.negativeDomainMatch) {
    score -= asNumber(policy.negativeDomainPenalty, 0.4);
  }
  if (signals.negativeKeywordMatch) {
    score -= asNumber(policy.negativeKeywordPenalty, 0.25);
  }
  if (context.providerType === "website" && context.browserAssistedRecommended) {
    score -= 0.5;
  }
  if (context.challengeKind) {
    score -= 0.5;
  }

  return {
    reviewScore: score,
    signals,
    context,
  };
}

export function scoreRecallCandidate(candidate, caseDefinition) {
  const context = getCandidateContext(candidate);
  const policy = asObject(caseDefinition.recallPolicy);
  const signals = buildPolicySignals(caseDefinition, "recall", context);
  let score = asNumber(candidate.source_quality_recall_score, 0);

  if (signals.preferredTacticMatch) {
    score += asNumber(policy.preferredTacticBonus, 0.05);
  }
  if (signals.preferredDomainMatch) {
    score += asNumber(policy.preferredDomainBonus, 0.06);
  }
  if (signals.positiveKeywordMatch) {
    score += asNumber(policy.positiveKeywordBonus, 0.05);
  }
  if (signals.benchmarkLike) {
    score += asNumber(policy.benchmarkBonus, 0.06);
  }
  if (signals.negativeDomainMatch) {
    score -= asNumber(policy.negativeDomainPenalty, 0.35);
  }
  if (signals.negativeKeywordMatch) {
    score -= asNumber(policy.negativeKeywordPenalty, 0.2);
  }
  if (context.providerType === "website" && context.browserAssistedRecommended) {
    score -= 0.5;
  }
  if (context.challengeKind) {
    score -= 0.5;
  }

  return {
    reviewScore: score,
    signals,
    context,
  };
}

export function classifyGraphCandidate(candidate, caseDefinition, defaults) {
  const { reviewScore, signals, context } = scoreGraphCandidate(candidate, caseDefinition, defaults);
  const runtimeReview = classifyFromRuntimePolicyReview(candidate, context);
  if (runtimeReview) {
    return runtimeReview;
  }
  const policy = asObject(caseDefinition.graphPolicy);
  const supportedWebsiteKinds = resolveSupportedWebsiteKinds(caseDefinition, "graph", defaults);
  const isValid = candidate.is_valid === true;

  if (!asArray(defaults.supportedProviderTypes).includes(context.providerType)) {
    return {
      decision: "rejected",
      rejectionReason: "unsupported_provider_type",
      reviewScore,
      benchmarkLike: signals.benchmarkLike,
      policySignals: signals,
      context,
    };
  }
  if (!isValid) {
    return {
      decision: "rejected",
      rejectionReason: "candidate_not_valid",
      reviewScore,
      benchmarkLike: signals.benchmarkLike,
      policySignals: signals,
      context,
    };
  }
  const residualReason = classifyResidual(context, defaults);
  if (residualReason) {
    return {
      decision: "rejected",
      rejectionReason: residualReason,
      reviewScore,
      benchmarkLike: signals.benchmarkLike,
      policySignals: signals,
      context,
    };
  }
  if (
    context.providerType === "website"
    && context.classificationKind
    && !supportedWebsiteKinds.includes(context.classificationKind)
  ) {
    return {
      decision: "rejected",
      rejectionReason: "below_auto_approval_threshold",
      reviewScore,
      benchmarkLike: signals.benchmarkLike,
      policySignals: signals,
      context,
    };
  }

  const threshold =
    context.providerType === "rss"
      ? asNumber(policy.minRssReviewScore, asNumber(defaults.minGraphRssRelevanceScore, 0.72))
      : asNumber(policy.minWebsiteReviewScore, asNumber(defaults.minGraphWebsiteRelevanceScore, 0.78));
  const blockedByPolicy = signals.negativeDomainMatch || signals.negativeKeywordMatch;
  const positiveEnough =
    context.providerType === "rss"
      ? !blockedByPolicy && (signals.positiveKeywordMatch || signals.preferredDomainMatch || signals.benchmarkLike || reviewScore >= threshold + 0.08)
      : !blockedByPolicy
        && (signals.positiveKeywordMatch || signals.preferredTacticMatch || signals.preferredDomainMatch || signals.benchmarkLike);

  if (reviewScore >= threshold && positiveEnough) {
    return {
      decision: "approvable",
      reviewScore,
      benchmarkLike: signals.benchmarkLike,
      policySignals: signals,
      context,
    };
  }

  return {
    decision: "rejected",
    rejectionReason: "below_auto_approval_threshold",
    reviewScore,
    benchmarkLike: signals.benchmarkLike,
    policySignals: signals,
    context,
  };
}

export function classifyRecallCandidate(candidate, caseDefinition, defaults) {
  const { reviewScore, signals, context } = scoreRecallCandidate(candidate, caseDefinition);
  const runtimeReview = classifyFromRuntimePolicyReview(candidate, context);
  if (runtimeReview) {
    return runtimeReview;
  }
  const policy = asObject(caseDefinition.recallPolicy);
  const supportedWebsiteKinds = resolveSupportedWebsiteKinds(caseDefinition, "recall", defaults);

  if (!asArray(defaults.supportedProviderTypes).includes(context.providerType)) {
    return {
      decision: "rejected",
      rejectionReason: "unsupported_provider_type",
      reviewScore,
      benchmarkLike: signals.benchmarkLike,
      policySignals: signals,
      context,
    };
  }
  const residualReason = classifyResidual(context, defaults);
  if (residualReason) {
    return {
      decision: "rejected",
      rejectionReason: residualReason,
      reviewScore,
      benchmarkLike: signals.benchmarkLike,
      policySignals: signals,
      context,
    };
  }
  if (
    context.providerType === "website"
    && context.classificationKind
    && !supportedWebsiteKinds.includes(context.classificationKind)
  ) {
    return {
      decision: "rejected",
      rejectionReason: "below_auto_approval_threshold",
      reviewScore,
      benchmarkLike: signals.benchmarkLike,
      policySignals: signals,
      context,
    };
  }

  const threshold = asNumber(
    policy.minPromotionScore,
    asNumber(defaults.minRecallPromotionScore, 0.45)
  );
  const blockedByPolicy = signals.negativeDomainMatch || signals.negativeKeywordMatch;
  const positiveEnough = !blockedByPolicy
    && (signals.positiveKeywordMatch || signals.preferredDomainMatch || signals.preferredTacticMatch || signals.benchmarkLike);

  if (reviewScore >= threshold && positiveEnough) {
    return {
      decision: "promotable",
      reviewScore,
      benchmarkLike: signals.benchmarkLike,
      policySignals: signals,
      context,
    };
  }

  return {
    decision: "rejected",
    rejectionReason: "below_auto_promotion_threshold",
    reviewScore,
    benchmarkLike: signals.benchmarkLike,
    policySignals: signals,
    context,
  };
}

function hasDownstreamEvidence(row) {
  return (
    asArray(row.fetchRuns).length > 0
    || asArray(row.articles).length > 0
    || asArray(row.interestFilterResults).length > 0
    || asNumber(asObject(row.finalSelection).total, 0) > 0
  );
}

function hasFetchRunEvidence(row) {
  return asArray(row.fetchRuns).length > 0;
}

function hasArticleEvidence(row) {
  return asArray(row.articles).length > 0;
}

function hasInterestFilterEvidence(row) {
  return asArray(row.interestFilterResults).length > 0;
}

function hasFinalSelectionEvidence(row) {
  return asNumber(asObject(row.finalSelection).total, 0) > 0;
}

function buildNormalizedReasonBuckets(rejectedCandidates, allCandidates, coverageMatrix) {
  const counts = new Map(
    NORMALIZED_YIELD_REASON_BUCKETS.map((key) => [key, 0])
  );

  for (const candidate of rejectedCandidates) {
    const key = normalizeText(candidate.rejectionReason || "unknown");
    if (counts.has(key)) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  for (const candidate of allCandidates) {
    if (candidate.registrationFailed === true) {
      counts.set("registration_failed", (counts.get("registration_failed") ?? 0) + 1);
    }
  }

  for (const row of coverageMatrix) {
    const key = normalizeText(row.status);
    if (counts.has(key)) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  return Object.fromEntries(counts.entries());
}

function buildStageLossBuckets(allCandidates, downstreamEvidence) {
  const counts = new Map([
    ["candidate_rejected_by_policy", 0],
    ["candidate_manual_only", 0],
    ["candidate_promoted_but_no_useful_articles", 0],
    ["articles_extracted_but_not_selected", 0],
    ["external/runtime_residual", 0],
    ["browser_fallback_residual", 0],
  ]);

  for (const candidate of allCandidates) {
    const bucket = resolveCandidateLossBucket(candidate);
    if (bucket && counts.has(bucket)) {
      counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
    }
  }

  for (const row of downstreamEvidence) {
    const errorText = normalizeText(row.error).toLowerCase();
    if (errorText.includes("browser")) {
      counts.set(
        "browser_fallback_residual",
        (counts.get("browser_fallback_residual") ?? 0) + 1
      );
      continue;
    }
    const hasFetchRuns = hasFetchRunEvidence(row);
    const hasArticles = hasArticleEvidence(row);
    const selectedCount = asNumber(asObject(row.finalSelection).selected, 0);
    const hasAnyFinalSelection = hasFinalSelectionEvidence(row);
    if (!hasFetchRuns && !hasArticles && !hasAnyFinalSelection) {
      counts.set(
        "external/runtime_residual",
        (counts.get("external/runtime_residual") ?? 0) + 1
      );
      continue;
    }
    if (!hasArticles) {
      counts.set(
        "candidate_promoted_but_no_useful_articles",
        (counts.get("candidate_promoted_but_no_useful_articles") ?? 0) + 1
      );
      continue;
    }
    if (selectedCount <= 0) {
      counts.set(
        "articles_extracted_but_not_selected",
        (counts.get("articles_extracted_but_not_selected") ?? 0) + 1
      );
    }
  }

  return Object.fromEntries(counts.entries());
}

function buildProductivityBuckets(downstreamEvidence) {
  const counts = new Map([
    ["source_onboarded_but_no_extracted_resources", 0],
    ["resources_extracted_but_no_stable_articles", 0],
    ["articles_produced_but_zero_selected_outputs", 0],
    ["selected_useful_evidence_present", 0],
  ]);

  for (const row of downstreamEvidence) {
    const hasFetchRuns = hasFetchRunEvidence(row);
    const hasArticles = hasArticleEvidence(row);
    const selectedCount = asNumber(asObject(row.finalSelection).selected, 0);
    const finalTotal = asNumber(asObject(row.finalSelection).total, 0);

    if (!hasFetchRuns && !hasArticles && finalTotal <= 0) {
      counts.set(
        "source_onboarded_but_no_extracted_resources",
        (counts.get("source_onboarded_but_no_extracted_resources") ?? 0) + 1
      );
    } else if (hasFetchRuns && !hasArticles) {
      counts.set(
        "resources_extracted_but_no_stable_articles",
        (counts.get("resources_extracted_but_no_stable_articles") ?? 0) + 1
      );
    } else if (hasArticles && selectedCount <= 0) {
      counts.set(
        "articles_produced_but_zero_selected_outputs",
        (counts.get("articles_produced_but_zero_selected_outputs") ?? 0) + 1
      );
    } else if (selectedCount > 0) {
      counts.set(
        "selected_useful_evidence_present",
        (counts.get("selected_useful_evidence_present") ?? 0) + 1
      );
    }
  }

  return Object.fromEntries(counts.entries());
}

export function buildCaseYieldSummary(caseDefinition, caseRun, defaults) {
  const graphCandidates = asArray(caseRun.graphLane?.candidates);
  const recallCandidates = asArray(caseRun.recallLane?.candidates);
  const allCandidates = [...graphCandidates, ...recallCandidates];
  const onboardedChannelIds = [
    ...new Set(
      allCandidates
        .filter((candidate) => normalizeText(candidate.registeredChannelId))
        .map((candidate) => normalizeText(candidate.registeredChannelId))
    ),
  ];
  const downstreamEvidence = asArray(caseRun.downstreamEvidence);
  const channelsWithDownstreamEvidence = downstreamEvidence.filter(hasDownstreamEvidence);
  const channelsWithFetchRuns = downstreamEvidence.filter(hasFetchRunEvidence);
  const channelsWithArticles = downstreamEvidence.filter(hasArticleEvidence);
  const channelsWithInterestFilterResults = downstreamEvidence.filter(hasInterestFilterEvidence);
  const channelsWithFinalSelectionResults = downstreamEvidence.filter(hasFinalSelectionEvidence);
  const coverageMatrix = asArray(caseRun.coverageMatrix);
  const rejectionCounts = new Map();
  const rejectedCandidates = allCandidates.filter((candidate) => candidate.decision === "rejected");
  for (const candidate of rejectedCandidates) {
    const key = normalizeText(candidate.rejectionReason || "unknown");
    rejectionCounts.set(key, (rejectionCounts.get(key) ?? 0) + 1);
  }
  for (const row of coverageMatrix) {
    const key = normalizeText(row.status);
    if (key === "source_onboarded_no_match_yet" || key === "candidate_found_not_onboarded") {
      rejectionCounts.set(key, (rejectionCounts.get(key) ?? 0) + 1);
    }
  }

  const benchmarkCandidates = allCandidates.filter((candidate) => candidate.benchmarkLike === true);
  const benchmarkRejected = benchmarkCandidates.filter((candidate) => candidate.decision === "rejected");
  const normalizedReasonBuckets = buildNormalizedReasonBuckets(
    rejectedCandidates,
    allCandidates,
    coverageMatrix
  );
  const stageLossBuckets = buildStageLossBuckets(allCandidates, downstreamEvidence);
  const productivityBuckets = buildProductivityBuckets(downstreamEvidence);
  const caseAcceptance = asObject(caseDefinition.yieldAcceptance);
  const minimumChannels = Math.max(
    1,
    Number.parseInt(
      String(
        caseAcceptance.minChannelsWithDownstreamEvidence
        ?? asObject(defaults.yieldAcceptance).minChannelsWithDownstreamEvidence
        ?? 1
      ),
      10
    ) || 1
  );

  return {
    candidatesFound: allCandidates.length,
    candidatesReviewed: allCandidates.length,
    candidatesApprovedOrPromoted: allCandidates.filter(
      (candidate) => candidate.decision === "approved"
        || candidate.decision === "promoted"
        || candidate.decision === "duplicate"
    ).length,
    channelsOnboarded: onboardedChannelIds.length,
    channelsWithDownstreamEvidence: channelsWithDownstreamEvidence.length,
    channelsWithFetchRuns: channelsWithFetchRuns.length,
    channelsWithArticles: channelsWithArticles.length,
    channelsWithInterestFilterResults: channelsWithInterestFilterResults.length,
    channelsWithFinalSelectionResults: channelsWithFinalSelectionResults.length,
    interestsCoveredDownstream: coverageMatrix.filter(
      (row) => normalizeText(row.status) === "covered_downstream"
    ).length,
    minimumChannelsWithDownstreamEvidence: minimumChannels,
    normalizedReasonBuckets,
    stageLossBuckets,
    productivityBuckets,
    weakYieldReasons: Object.fromEntries(
      [...rejectionCounts.entries()].sort((left, right) => left[0].localeCompare(right[0]))
    ),
    topRejectedDomains: summarizeCounts(
      rejectedCandidates.map((candidate) => candidate.domain),
      "domain",
      asNumber(defaults.topRejectedSummaryLimit, 5)
    ),
    topRejectedTactics: summarizeCounts(
      rejectedCandidates.map((candidate) => candidate.tacticKey),
      "tactic",
      asNumber(defaults.topRejectedSummaryLimit, 5)
    ),
    benchmarkLikeCandidatesFound: benchmarkCandidates.length,
    benchmarkLikeCandidatesRejected: benchmarkRejected.length,
    benchmarkLikeRejectedReasons: Object.fromEntries(
      [...benchmarkRejected.reduce((map, candidate) => {
        const key = normalizeText(candidate.rejectionReason || "unknown");
        map.set(key, (map.get(key) ?? 0) + 1);
        return map;
      }, new Map()).entries()].sort((left, right) => left[0].localeCompare(right[0]))
    ),
  };
}

export function classifyCaseRootCause(caseDefinition, caseRun, defaults) {
  const yieldSummary = caseRun?.yieldSummary ?? buildCaseYieldSummary(caseDefinition, caseRun, defaults);
  const minimumChannels = asNumber(yieldSummary.minimumChannelsWithDownstreamEvidence, 1);

  if (yieldSummary.channelsWithDownstreamEvidence >= minimumChannels) {
    return "yield_pass";
  }
  if (yieldSummary.candidatesFound === 0) {
    return "generation_problem";
  }
  if (yieldSummary.benchmarkLikeCandidatesFound === 0) {
    return "quality_problem";
  }
  if (yieldSummary.candidatesApprovedOrPromoted === 0) {
    return "review_policy_problem";
  }
  if (yieldSummary.channelsOnboarded === 0) {
    return "registration_problem";
  }
  if (
    yieldSummary.channelsWithFetchRuns === 0
    && yieldSummary.channelsWithArticles === 0
    && yieldSummary.channelsWithInterestFilterResults === 0
    && yieldSummary.channelsWithFinalSelectionResults === 0
  ) {
    return "downstream_ingest_problem";
  }
  return "downstream_usefulness_problem";
}

export function summarizeAggregateRootCauses(caseRuns) {
  const counts = new Map();
  for (const caseRun of asArray(caseRuns)) {
    const key = normalizeText(caseRun.rootCauseClassification || "unknown");
    if (!key) {
      continue;
    }
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const entries = [...counts.entries()].sort((left, right) => {
    if (right[1] !== left[1]) {
      return right[1] - left[1];
    }
    return left[0].localeCompare(right[0]);
  });
  return {
    counts: Object.fromEntries(entries),
    dominantRootCause: entries[0]?.[0] ?? null,
  };
}

export function determineCaseVerdicts(caseDefinition, caseRun, defaults) {
  const graphCompleted = Boolean(caseRun.graphLane?.mission);
  const recallCompleted = Boolean(caseRun.recallLane?.mission);
  const runtimeVerdict = graphCompleted && recallCompleted ? "pass" : "fail";
  const yieldSummary = buildCaseYieldSummary(caseDefinition, caseRun, defaults);
  const yieldVerdict =
    runtimeVerdict === "fail"
      ? "fail"
      : yieldSummary.channelsWithDownstreamEvidence >= yieldSummary.minimumChannelsWithDownstreamEvidence
        ? "pass"
        : "weak";
  const status =
    runtimeVerdict === "fail"
      ? "failed"
      : yieldVerdict === "pass"
        ? "passed"
        : "completed_with_residuals";
  const rootCauseClassification =
    runtimeVerdict === "fail"
      ? "runtime_problem"
      : classifyCaseRootCause(caseDefinition, { ...caseRun, yieldSummary }, defaults);

  return {
    runtimeVerdict,
    yieldVerdict,
    status,
    yieldSummary,
    rootCauseClassification,
  };
}

export function determineRunVerdicts({ preconditions, preflight, caseRuns }) {
  if (asArray(preconditions).some((item) => item.status !== "passed")) {
    return {
      runtimeVerdict: "fail",
      yieldVerdict: "fail",
      finalVerdict: "precondition_failed",
    };
  }
  if (asArray(preflight).some((item) => item.status !== "passed" && item.status !== "skipped")) {
    return {
      runtimeVerdict: "fail",
      yieldVerdict: "fail",
      finalVerdict: "fail",
    };
  }
  if (asArray(caseRuns).some((item) => item.runtimeVerdict !== "pass")) {
    return {
      runtimeVerdict: "fail",
      yieldVerdict: "fail",
      finalVerdict: "fail",
    };
  }
  const yieldVerdict = asArray(caseRuns).every((item) => item.yieldVerdict === "pass")
    ? "pass"
    : "weak";
  return {
    runtimeVerdict: "pass",
    yieldVerdict,
    finalVerdict: yieldVerdict === "pass" ? "pass" : "yield_weak",
  };
}

function policyDecisionToCalibrationVerdict(plan) {
  if (plan.decision === "approvable" || plan.decision === "promotable") {
    return "approve";
  }
  if (
    plan.rejectionReason === "browser_assisted_residual"
    || plan.rejectionReason === "unsupported_challenge"
  ) {
    return "residual";
  }
  return "reject";
}

export function evaluateCalibration(caseDefinition, defaults) {
  const samples = asArray(caseDefinition.calibrationSamples);
  let matched = 0;
  const details = samples.map((sample) => {
    const candidate = asObject(sample.candidate);
    const lane = normalizeText(sample.lane).toLowerCase();
    const plan = lane === "recall"
      ? classifyRecallCandidate(candidate, caseDefinition, defaults)
      : classifyGraphCandidate(candidate, caseDefinition, defaults);
    const actualVerdict = policyDecisionToCalibrationVerdict(plan);
    const expectedVerdict = normalizeText(sample.expectedVerdict).toLowerCase();
    const agreement = actualVerdict === expectedVerdict;
    if (agreement) {
      matched += 1;
    }
    return {
      label: normalizeText(sample.label) || normalizeText(candidate.title) || "candidate",
      lane: lane || "graph",
      expectedVerdict,
      actualVerdict,
      agreement,
      decision: plan.decision,
      rejectionReason: plan.rejectionReason || null,
    };
  });
  const agreementRatio = samples.length > 0 ? matched / samples.length : 1;
  const minimumAgreement = asNumber(
    asObject(defaults.yieldAcceptance).minCalibrationAgreement,
    0.8
  );

  return {
    total: samples.length,
    matched,
    agreementRatio,
    minimumAgreement,
    passed: agreementRatio >= minimumAgreement,
    details,
  };
}

export function determineMultiRunYieldProof(reports, defaults) {
  const requiredRuns = Math.max(
    1,
    Number.parseInt(String(asObject(defaults.yieldAcceptance).multiRunCount ?? 3), 10) || 3
  );
  const requiredPassingRuns = Math.max(
    1,
    Number.parseInt(String(asObject(defaults.yieldAcceptance).minPassingRuns ?? 2), 10) || 2
  );
  const caseStats = new Map();
  let runtimeFailures = 0;
  const aggregateRootCauses = new Map();

  for (const report of asArray(reports)) {
    if (normalizeText(report.runtimeVerdict) !== "pass") {
      runtimeFailures += 1;
    }
    for (const caseRun of asArray(report.caseRuns)) {
      const key = normalizeText(caseRun.key);
      if (!key) {
        continue;
      }
      const current = caseStats.get(key) ?? {
        key,
        label: normalizeText(caseRun.label) || key,
        passingRuns: 0,
        totalRuns: 0,
        yieldVerdicts: [],
        rootCauseCounts: {},
      };
      current.totalRuns += 1;
      current.yieldVerdicts.push(normalizeText(caseRun.yieldVerdict) || "weak");
      if (normalizeText(caseRun.yieldVerdict) === "pass") {
        current.passingRuns += 1;
      }
      const rootCause = normalizeText(caseRun.rootCauseClassification || "unknown");
      current.rootCauseCounts[rootCause] = (current.rootCauseCounts[rootCause] ?? 0) + 1;
      aggregateRootCauses.set(rootCause, (aggregateRootCauses.get(rootCause) ?? 0) + 1);
      caseStats.set(key, current);
    }
  }

  const perCase = [...caseStats.values()].sort((left, right) => left.label.localeCompare(right.label));
  const runtimeVerdict = runtimeFailures === 0 && asArray(reports).length === requiredRuns ? "pass" : "fail";
  const yieldVerdict = runtimeVerdict === "fail"
    ? "fail"
    : perCase.every((item) => item.passingRuns >= requiredPassingRuns)
      ? "pass"
      : "weak";

  return {
    runtimeVerdict,
    yieldVerdict,
    finalVerdict: runtimeVerdict === "fail" ? "fail" : yieldVerdict === "pass" ? "pass" : "yield_weak",
    requiredRuns,
    requiredPassingRuns,
    perCase,
    aggregateRootCauses: Object.fromEntries(
      [...aggregateRootCauses.entries()].sort((left, right) => {
        if (right[1] !== left[1]) {
          return right[1] - left[1];
        }
        return left[0].localeCompare(right[0]);
      })
    ),
  };
}

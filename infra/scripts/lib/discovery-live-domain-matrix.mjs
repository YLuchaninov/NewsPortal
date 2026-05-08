export const DOMAIN_MATRIX_REPEAT_COUNT = 3;
export const DOMAIN_MATRIX_MIN_PASSING_RUNS = 2;

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value != null && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeDomain(value) {
  const input = normalizeText(value).toLowerCase();
  if (!input) {
    return "";
  }
  try {
    const url = input.includes("://") ? new URL(input) : new URL(`https://${input}`);
    return String(url.hostname || "").toLowerCase().replace(/^www\./, "");
  } catch {
    return input.replace(/^www\./, "").replace(/\/.*$/, "");
  }
}

function domainSlug(domain) {
  return normalizeDomain(domain).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function matchesDomain(value, targetDomain) {
  const domain = normalizeDomain(value);
  const target = normalizeDomain(targetDomain);
  return Boolean(domain && target && (domain === target || domain.endsWith(`.${target}`)));
}

function siteScopeSeed(value, domain) {
  const text = normalizeText(value);
  const target = normalizeDomain(domain);
  if (!text || !target) {
    return text;
  }
  if (text.toLowerCase().startsWith(`site:${target}`)) {
    return text;
  }
  return `site:${target} ${text.replace(/^site:[^\s]+\s*/i, "")}`.trim();
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function cloneStringArray(value) {
  return asArray(value).map((item) => normalizeText(item)).filter(Boolean);
}

function buildDomainGraphClasses(caseDefinition, domain) {
  const slug = domainSlug(domain);
  return asArray(caseDefinition.graphClasses).map((classPayload) => {
    const seedRulesJson = asObject(classPayload.seedRulesJson);
    return {
      ...cloneJson(classPayload),
      classKey: `${normalizeText(classPayload.classKey)}_${slug}`,
      displayName: `${normalizeText(classPayload.displayName)} — ${domain}`,
      description: `${normalizeText(classPayload.description)} Domain-scoped to ${domain}.`.trim(),
      promptInstructions:
        `${normalizeText(classPayload.promptInstructions)} Prefer results from ${domain}.`.trim(),
      seedRulesJson: {
        ...seedRulesJson,
        domainMatrixTarget: domain,
        tactics: cloneStringArray(seedRulesJson.tactics).map((item) => siteScopeSeed(item, domain)),
      },
      configJson: {
        ...asObject(classPayload.configJson),
        domainMatrixTarget: domain,
      },
    };
  });
}

export function getRuntimeDomainMatrixTargets(caseDefinition) {
  return asArray(caseDefinition.domainMatrixTargets)
    .map((target) => ({
      domain: normalizeDomain(target.domain ?? target),
      label: normalizeText(target.label ?? target.domain ?? target),
    }))
    .filter((target) => target.domain);
}

export function buildDomainScopedCase(caseDefinition, target) {
  const domain = normalizeDomain(target.domain ?? target);
  if (!domain) {
    throw new Error(`Domain matrix target is missing for ${normalizeText(caseDefinition?.key) || "case"}.`);
  }
  const slug = domainSlug(domain);
  const targetLabel = normalizeText(target.label) || domain;

  return {
    ...caseDefinition,
    key: `${caseDefinition.key}__domain_${slug}`,
    parentCaseKey: caseDefinition.key,
    parentLabel: caseDefinition.label,
    allowEmptyRecallCandidates: true,
    label: `${caseDefinition.label} — ${targetLabel}`,
    shortLabel: `${caseDefinition.shortLabel} ${domain}`,
    domainMatrixTarget: {
      domain,
      label: targetLabel,
      parentCaseKey: caseDefinition.key,
      parentShortLabel: caseDefinition.shortLabel,
    },
    yieldBenchmark: {
      ...cloneJson(caseDefinition.yieldBenchmark),
      domains: [domain],
    },
    graphMission: {
      ...cloneJson(caseDefinition.graphMission),
      title: `${caseDefinition.graphMission.title} [${domain}]`,
      description: `${caseDefinition.graphMission.description} Domain matrix target: ${domain}.`,
      seedTopics: cloneStringArray(caseDefinition.graphMission.seedTopics).map((item) =>
        siteScopeSeed(item, domain)
      ),
    },
    recallMission: {
      ...cloneJson(caseDefinition.recallMission),
      title: `${caseDefinition.recallMission.title} [${domain}]`,
      description: `${caseDefinition.recallMission.description} Domain matrix target: ${domain}.`,
      seedQueries: cloneStringArray(caseDefinition.recallMission.seedQueries).map((item) =>
        siteScopeSeed(item, domain)
      ),
    },
    graphClasses: buildDomainGraphClasses(caseDefinition, domain),
  };
}

export function buildDomainMatrixCaseRuns(casePacks) {
  return asArray(casePacks).flatMap((caseDefinition) =>
    getRuntimeDomainMatrixTargets(caseDefinition).map((target) => ({
      parentCaseKey: caseDefinition.key,
      parentLabel: caseDefinition.label,
      parentShortLabel: caseDefinition.shortLabel,
      domain: target.domain,
      label: target.label,
      caseDefinition: buildDomainScopedCase(caseDefinition, target),
    }))
  );
}

function hasSuccessfulFetchRun(row) {
  return asArray(row?.fetchRuns).some((run) => {
    const outcome = normalizeText(run.outcomeKind ?? run.outcome_kind).toLowerCase();
    const status = Number(run.httpStatus ?? run.http_status ?? 0);
    const errorText = normalizeText(run.errorText ?? run.error_text);
    return !errorText && (
      outcome === "success"
      || outcome === "new_content"
      || outcome === "no_change"
      || outcome === "duplicate_only"
      || (status >= 200 && status < 400)
    );
  });
}

function hasDownstreamEvidence(row) {
  return (
    asArray(row?.fetchRuns).length > 0
    || asArray(row?.articles).length > 0
    || asArray(row?.interestFilterResults).length > 0
    || Number(asObject(row?.finalSelection).total ?? 0) > 0
    || Number(asObject(row?.systemFeed).total ?? 0) > 0
  );
}

function candidateIsPositiveDecision(candidate) {
  const decision = normalizeText(candidate?.decision).toLowerCase();
  return decision === "approved" || decision === "promoted" || decision === "duplicate";
}

function resolveDomainRootCause(summary) {
  if (summary.runtimeVerdict !== "pass") {
    return "runtime_problem";
  }
  if (summary.targetBenchmarkLikeCandidates <= 0) {
    return "target_domain_generation_problem";
  }
  if (summary.targetApprovedOrPromoted <= 0 && summary.targetBaselineSuccessfulFetches <= 0) {
    return "target_domain_review_policy_problem";
  }
  if (summary.targetRegisteredChannelIds.length > 0 && summary.targetDownstreamEvidence <= 0) {
    return "target_domain_downstream_ingest_problem";
  }
  return "yield_pass";
}

export function summarizeDomainCaseRun(caseRun, target) {
  const domain = normalizeDomain(target.domain ?? target);
  const graphCandidates = [
    ...asArray(caseRun?.graphLane?.endpoints),
    ...asArray(caseRun?.graphLane?.candidates),
  ];
  const recallCandidates = [
    ...asArray(caseRun?.recallLane?.endpoints),
    ...asArray(caseRun?.recallLane?.candidates),
  ];
  const allCandidates = [...graphCandidates, ...recallCandidates];
  const targetCandidates = allCandidates.filter((candidate) => matchesDomain(candidate.domain || candidate.url, domain));
  const targetPositiveCandidates = targetCandidates.filter(candidateIsPositiveDecision);
  const targetRegisteredChannelIds = [
    ...new Set(
      targetPositiveCandidates
        .map((candidate) => normalizeText(candidate.registeredChannelId))
        .filter(Boolean)
    ),
  ];
  const targetBaselineRows = asArray(caseRun?.baselineEvidence).filter((row) =>
    matchesDomain(row.fetchUrl || row.url || row.channelName, domain)
  );
  const targetDiscoveryRows = asArray(caseRun?.discoveryEvidence).filter((row) =>
    targetRegisteredChannelIds.includes(normalizeText(row.channelId))
  );
  const targetDownstreamRows = [...targetBaselineRows, ...targetDiscoveryRows];
  const summary = {
    parentCaseKey: caseRun?.domainMatrixTarget?.parentCaseKey ?? caseRun?.parentCaseKey ?? caseRun?.key,
    caseKey: caseRun?.key,
    label: caseRun?.label,
    domain,
    runtimeVerdict: normalizeText(caseRun?.runtimeVerdict) || "fail",
    baseYieldVerdict: normalizeText(caseRun?.yieldVerdict) || "fail",
    targetCandidatesFound: targetCandidates.length,
    targetBenchmarkLikeCandidates: targetCandidates.filter((candidate) => candidate.benchmarkLike === true).length,
    targetApprovedOrPromoted: targetPositiveCandidates.length,
    targetRegisteredChannelIds,
    targetBaselineSuccessfulFetches: targetBaselineRows.filter(hasSuccessfulFetchRun).length,
    targetDownstreamEvidence: targetDownstreamRows.filter(hasDownstreamEvidence).length,
    rejectedTargetDomains: targetCandidates
      .filter((candidate) => normalizeText(candidate.decision) === "rejected")
      .map((candidate) => ({
        title: candidate.title ?? null,
        url: candidate.url ?? null,
        reason: candidate.rejectionReason ?? null,
      })),
  };
  const targetUsefulSource =
    summary.targetApprovedOrPromoted > 0 || summary.targetBaselineSuccessfulFetches > 0;
  const targetDownstreamSatisfied =
    summary.targetRegisteredChannelIds.length === 0
    || summary.targetDownstreamEvidence > 0
    || summary.targetBaselineSuccessfulFetches > 0;
  const passed =
    summary.runtimeVerdict === "pass"
    && summary.targetBenchmarkLikeCandidates > 0
    && targetUsefulSource
    && targetDownstreamSatisfied;
  return {
    ...summary,
    targetYieldVerdict: passed ? "pass" : "weak",
    rootCauseClassification: passed ? "yield_pass" : resolveDomainRootCause(summary),
  };
}

export function determineDomainMatrixVerdicts(domainRuns, options = {}) {
  const repeatCount = Number.parseInt(String(options.repeatCount ?? DOMAIN_MATRIX_REPEAT_COUNT), 10) || DOMAIN_MATRIX_REPEAT_COUNT;
  const minPassingRuns =
    Number.parseInt(String(options.minPassingRuns ?? DOMAIN_MATRIX_MIN_PASSING_RUNS), 10)
    || DOMAIN_MATRIX_MIN_PASSING_RUNS;
  const groupMap = new Map();
  let runtimeFailures = 0;

  for (const run of asArray(domainRuns)) {
    const summary = run.domainSummary ?? run;
    const key = [
      normalizeText(summary.parentCaseKey || run.parentCaseKey || summary.caseKey),
      normalizeDomain(summary.domain || run.domain),
    ].join("::");
    const current = groupMap.get(key) ?? {
      parentCaseKey: normalizeText(summary.parentCaseKey || run.parentCaseKey || summary.caseKey),
      parentLabel: normalizeText(run.parentLabel || summary.label),
      domain: normalizeDomain(summary.domain || run.domain),
      totalRuns: 0,
      passingRuns: 0,
      runtimeFailures: 0,
      rootCauseCounts: {},
    };
    current.totalRuns += 1;
    if (normalizeText(summary.runtimeVerdict) !== "pass") {
      current.runtimeFailures += 1;
      runtimeFailures += 1;
    }
    if (normalizeText(summary.targetYieldVerdict) === "pass") {
      current.passingRuns += 1;
    }
    const rootCause = normalizeText(summary.rootCauseClassification || "unknown") || "unknown";
    current.rootCauseCounts[rootCause] = (current.rootCauseCounts[rootCause] ?? 0) + 1;
    groupMap.set(key, current);
  }

  const perDomain = [...groupMap.values()].sort((left, right) =>
    `${left.parentCaseKey}:${left.domain}`.localeCompare(`${right.parentCaseKey}:${right.domain}`)
  );
  const runtimeVerdict =
    runtimeFailures === 0 && perDomain.every((item) => item.totalRuns === repeatCount)
      ? "pass"
      : "fail";
  const consistentlyFailingDomains = perDomain.filter((item) => item.passingRuns === 0);
  const yieldVerdict =
    runtimeVerdict === "fail"
      ? "fail"
      : perDomain.every((item) => item.passingRuns >= minPassingRuns)
        && consistentlyFailingDomains.length === 0
        ? "pass"
        : "weak";

  return {
    runtimeVerdict,
    yieldVerdict,
    finalVerdict: runtimeVerdict === "fail" ? "fail" : yieldVerdict === "pass" ? "pass" : "yield_weak",
    repeatCount,
    minPassingRuns,
    perDomain,
    consistentlyFailingDomains,
  };
}

import { randomUUID } from "node:crypto";

export const LIVE_CALIBRATION_REPEAT_COUNTS = {
  calibration: 3,
  acceptance: 3,
  soak: 5,
};

export const LIVE_CALIBRATION_MIN_PASSING_RUNS = {
  calibration: 1,
  acceptance: 2,
  soak: 3,
};

export const LIVE_CALIBRATION_ALLOWED_PROVIDER_IDS = new Set([
  "web_search",
  "ddgs",
  "brave",
  "serper",
  "rss",
  "website",
]);

function withCaseSet(caseSet, casePacks) {
  return casePacks.map((casePack) => ({ caseSet, ...casePack }));
}

export const LIVE_CALIBRATION_CASE_PACKS = withCaseSet("core", [
  {
    key: "bootstrap_rss_atom",
    label: "Bootstrap RSS/Atom",
    flow: "bootstrap",
    runKind: "bootstrap",
    autopilotProfile: "balanced",
    expectedProviderIds: ["web_search", "rss", "website"],
    sourceRoleTargets: {
      technical_change: { min: 1, target: 2 },
      authoritative_anchor: { min: 1, target: 2 },
      source_directory: { min: 1, target: 1 },
    },
    target: {
      title: "Developer technical updates RSS and Atom sources",
      prompt:
        "Find recurring RSS or Atom sources for developer technical changes, engineering blogs, release notes, and official update feeds.",
      seedTopics: [
        "developer technical updates RSS",
        "engineering blog Atom feed",
        "release notes RSS",
      ],
      seedEntities: ["GitHub", "Cloudflare", "InfoQ", "Chromium"],
      seedUrls: [
        "https://github.blog/feed/",
        "https://blog.cloudflare.com/rss/",
        "https://feed.infoq.com/",
        "https://blog.chromium.org/feeds/posts/default",
      ],
      seedDomains: [
        "github.blog",
        "blog.cloudflare.com",
        "infoq.com",
        "blog.chromium.org",
      ],
      seedLanguages: ["en"],
    },
    minimums: {
      endpointCount: 1,
      coverageDelta: 0.01,
    },
  },
  {
    key: "gap_procurement_web",
    label: "Gap-Driven Web Procurement",
    flow: "gap_fill",
    runKind: "gap_fill",
    autopilotProfile: "research",
    expectedProviderIds: ["web_search", "website"],
    sourceRoleTargets: {
      authoritative_anchor: { min: 1, target: 1 },
      procurement_signal: { min: 1, target: 2 },
      source_directory: { min: 1, target: 1 },
    },
    target: {
      title: "Software migration and cloud modernization public procurement",
      prompt:
        "Find public procurement and tender listing sources for software migration, cloud modernization, public tenders, contract awards, and notices.",
      seedTopics: [
        "software migration public procurement tenders",
        "cloud modernization contract awards",
        "public tender notices software",
      ],
      seedEntities: ["SAM.gov", "TED Europa", "Contracts Finder"],
      seedUrls: [
        "https://sam.gov/content/opportunities",
        "https://ted.europa.eu/en/search/result",
        "https://www.find-tender.service.gov.uk/Search",
      ],
      seedDomains: [
        "sam.gov",
        "ted.europa.eu",
        "find-tender.service.gov.uk",
      ],
      seedGeos: ["United States", "Europe", "United Kingdom"],
      seedLanguages: ["en"],
    },
    minimums: {
      reviewableEndpointCount: 1,
      roleAlignedHypothesisCount: 1,
    },
  },
  {
    key: "existing_source_expansion",
    label: "Existing Source Expansion",
    flow: "source_expand",
    runKind: "source_expand",
    autopilotProfile: "balanced",
    expectedProviderIds: ["web_search", "rss", "website"],
    sourceRoleTargets: {
      technical_change: { min: 1, target: 3 },
      source_directory: { min: 1, target: 1 },
    },
    target: {
      title: "GitHub engineering source expansion",
      prompt:
        "Expand an existing GitHub Blog engineering source into sibling RSS, changelog, release-note, and source-directory endpoints.",
      seedTopics: ["GitHub engineering blog releases changelog"],
      seedEntities: ["GitHub"],
      seedLanguages: ["en"],
    },
    seedSource: {
      providerType: "rss",
      sourceRole: "technical_change",
      endpointKind: "rss_feed",
      fetchUrl: "https://github.blog/feed/",
      homepageUrl: "https://github.blog/",
      trustStage: "active",
      coverageContribution: 1.0,
      downstreamWeight: 1.0,
      contractStatus: "active",
    },
    minimums: {
      expansionHypothesisCount: 1,
    },
  },
  {
    key: "replacement_discovery",
    label: "Replacement Discovery",
    flow: "replacement",
    runKind: "replacement",
    autopilotProfile: "balanced",
    expectedProviderIds: ["web_search", "rss", "website"],
    sourceRoleTargets: {
      technical_change: { min: 1, target: 2 },
      industry_niche: { min: 1, target: 2 },
    },
    target: {
      title: "Weak developer technical source replacement",
      prompt:
        "Find replacement recurring sources for stale developer news and technical change feeds.",
      seedTopics: ["developer news RSS technical change replacement"],
      seedEntities: ["InfoQ", "The New Stack", "GitHub"],
      seedLanguages: ["en"],
    },
    seedSource: {
      providerType: "rss",
      sourceRole: "technical_change",
      endpointKind: "rss_feed",
      fetchUrl: "https://stale-source.example.test/feed.xml",
      homepageUrl: "https://stale-source.example.test/",
      trustStage: "degraded",
      coverageContribution: 0.0,
      downstreamWeight: 0.0,
      contractStatus: "degraded",
      isActive: true,
    },
    minimums: {
      replacementHypothesisCount: 1,
      oldSourceStillActive: true,
    },
  },
  {
    key: "source_directory_extraction",
    label: "Source Directory Extraction",
    flow: "source_directory",
    runKind: "bootstrap",
    autopilotProfile: "wide",
    expectedProviderIds: ["web_search", "website"],
    sourceRoleTargets: {
      source_directory: { min: 1, target: 2 },
      technical_change: { min: 1, target: 2 },
    },
    target: {
      title: "Developer technical source directories",
      prompt:
        "Find source directories, resource pages, partner directories, and link lists that point to developer technical update sources.",
      seedTopics: [
        "developer blogs to follow resources",
        "cloud native resources directory",
        "engineering blogs directory",
      ],
      seedLanguages: ["en"],
    },
    minimums: {
      sourceDirectorySignalCount: 1,
    },
  },
  {
    key: "negative_evidence_provider_health",
    label: "Negative Evidence And Provider Health Guards",
    flow: "guards",
    runKind: "manual",
    autopilotProfile: "conservative",
    expectedProviderIds: ["web_search", "serper"],
    sourceRoleTargets: {
      technical_change: { min: 1, target: 1 },
    },
    target: {
      title: "Discovery provider health guard",
      prompt:
        "Exercise discovery provider health and negative-evidence guardrails without social, API, or email providers.",
      seedTopics: ["provider health guard technical updates"],
      seedLanguages: ["en"],
    },
    minimums: {
      negativeEvidenceObserved: true,
      providerHealthObserved: true,
    },
  },
]);

export const EXTENDED_LIVE_CALIBRATION_CASE_PACKS = withCaseSet("extended", [
  {
    key: "security_advisory_bootstrap",
    label: "Security Advisory Bootstrap",
    flow: "security_advisory",
    runKind: "bootstrap",
    autopilotProfile: "research",
    expectedProviderIds: ["web_search", "rss", "website"],
    sourceRoleTargets: {
      security_advisory: { min: 1, target: 3 },
      authoritative_anchor: { min: 1, target: 2 },
      source_directory: { min: 1, target: 1 },
    },
    target: {
      title: "Cybersecurity advisories and vulnerability updates",
      prompt:
        "Find recurring security advisory, vulnerability, CVE, PSIRT, and official cybersecurity update sources.",
      seedTopics: [
        "cybersecurity advisories RSS",
        "vulnerability advisories CVE feed",
        "security bulletin updates",
      ],
      seedEntities: ["CISA", "GitHub Security Advisory", "Google Cloud Security"],
      seedUrls: [
        "https://www.cisa.gov/news-events/cybersecurity-advisories",
        "https://github.com/advisories",
        "https://cloud.google.com/security/advisories",
      ],
      seedDomains: ["cisa.gov", "github.com", "cloud.google.com"],
      seedLanguages: ["en"],
    },
    minimums: {
      reviewableEndpointCount: 1,
      roleAlignedHypothesisCount: 1,
    },
  },
  {
    key: "primary_data_open_data_gap",
    label: "Primary Data And Open Data Gap",
    flow: "primary_data",
    runKind: "gap_fill",
    autopilotProfile: "research",
    expectedProviderIds: ["web_search", "website"],
    sourceRoleTargets: {
      primary_data: { min: 1, target: 3 },
      source_directory: { min: 1, target: 1 },
    },
    target: {
      title: "Government open data and statistical datasets",
      prompt:
        "Find open data catalogs, dataset libraries, statistics portals, and data download sources; API-looking endpoints should remain needs_config.",
      seedTopics: [
        "government open data datasets",
        "public statistics data portal",
        "open data catalog datasets",
      ],
      seedEntities: ["Data.gov", "Data Europa", "Eurostat"],
      seedUrls: [
        "https://catalog.data.gov/dataset",
        "https://data.europa.eu/data/datasets",
        "https://ec.europa.eu/eurostat/web/main/data/database",
      ],
      seedDomains: ["catalog.data.gov", "data.europa.eu", "ec.europa.eu"],
      seedLanguages: ["en"],
    },
    minimums: {
      reviewableEndpointCount: 1,
      roleAlignedHypothesisCount: 1,
    },
  },
  {
    key: "report_research_library_bootstrap",
    label: "Report And Research Library Bootstrap",
    flow: "report_research",
    runKind: "bootstrap",
    autopilotProfile: "research",
    expectedProviderIds: ["web_search", "website"],
    sourceRoleTargets: {
      report_research: { min: 1, target: 3 },
      source_directory: { min: 1, target: 1 },
    },
    target: {
      title: "Research reports and publication libraries",
      prompt:
        "Find recurring report libraries, research publication pages, whitepaper libraries, and source-directory follow-ups.",
      seedTopics: [
        "technology research publications reports",
        "public sector research report library",
        "market research publications",
      ],
      seedEntities: ["NIST", "OECD", "World Bank"],
      seedUrls: [
        "https://www.nist.gov/publications",
        "https://www.oecd.org/en/publications.html",
        "https://www.worldbank.org/en/research",
      ],
      seedDomains: ["nist.gov", "oecd.org", "worldbank.org"],
      seedLanguages: ["en"],
    },
    minimums: {
      reviewableEndpointCount: 1,
      sourceDirectorySignalCount: 1,
    },
  },
  {
    key: "localized_procurement_pl_de",
    label: "Localized PL/DE Procurement",
    flow: "gap_fill",
    runKind: "gap_fill",
    autopilotProfile: "research",
    expectedProviderIds: ["web_search", "website"],
    sourceRoleTargets: {
      procurement_signal: { min: 1, target: 3 },
      localized_media: { min: 1, target: 1 },
    },
    target: {
      title: "Polish and German public procurement software tenders",
      prompt:
        "Find Polish and German procurement, tender, award, Ausschreibung, Vergabe, przetarg, and zamowienia sources for software and cloud migration.",
      seedTopics: [
        "oprogramowanie migracja przetarg zamówienie publiczne",
        "software migration Ausschreibung Vergabe",
        "cloud modernization public procurement Poland Germany",
      ],
      seedEntities: ["eZamowienia", "TED Europa", "service.bund.de"],
      seedUrls: [
        "https://ezamowienia.gov.pl/mp-client/search/list/ocds-148610",
        "https://www.gov.pl/web/cyfryzacja/zamowienia-publiczne",
        "https://ted.europa.eu/en/search/result",
        "https://www.service.bund.de/Content/DE/Ausschreibungen/Suche/Formular.html",
      ],
      seedDomains: ["ezamowienia.gov.pl", "gov.pl", "ted.europa.eu", "service.bund.de"],
      seedGeos: ["Poland", "Germany", "Europe"],
      seedLanguages: ["pl", "de", "en"],
    },
    minimums: {
      reviewableEndpointCount: 1,
      roleAlignedHypothesisCount: 1,
    },
  },
  {
    key: "regulatory_policy_watch",
    label: "Regulatory Policy Watch",
    flow: "regulatory_policy",
    runKind: "bootstrap",
    autopilotProfile: "research",
    expectedProviderIds: ["web_search", "website"],
    sourceRoleTargets: {
      regulatory_policy: { min: 1, target: 3 },
    },
    target: {
      title: "AI and cybersecurity regulatory policy watch",
      prompt:
        "Find regulatory policy, standards, guidance, laws, rules, and official policy-watch sources for AI and cybersecurity.",
      seedTopics: [
        "AI regulatory guidance policy",
        "cybersecurity standards guidance",
        "digital policy regulations laws",
      ],
      seedEntities: ["European Commission", "NIST", "FTC"],
      seedUrls: [
        "https://digital-strategy.ec.europa.eu/en/policies",
        "https://www.nist.gov/standardsgov",
        "https://www.ftc.gov/policy",
      ],
      seedDomains: ["digital-strategy.ec.europa.eu", "nist.gov", "ftc.gov"],
      seedLanguages: ["en"],
    },
    minimums: {
      reviewableEndpointCount: 1,
      roleAlignedHypothesisCount: 1,
    },
  },
  {
    key: "vendor_ecosystem_expansion",
    label: "Vendor Ecosystem Expansion",
    flow: "source_expand",
    runKind: "source_expand",
    autopilotProfile: "balanced",
    expectedProviderIds: ["web_search", "rss", "website"],
    sourceRoleTargets: {
      technical_change: { min: 1, target: 3 },
      security_advisory: { min: 1, target: 2 },
      source_directory: { min: 1, target: 1 },
    },
    target: {
      title: "Kubernetes vendor ecosystem source expansion",
      prompt:
        "Expand an active Kubernetes technical source into docs, releases, security, resources, and ecosystem sibling endpoints without duplicate coverage inflation.",
      seedTopics: ["Kubernetes releases docs security advisories ecosystem resources"],
      seedEntities: ["Kubernetes", "GitHub", "Cloudflare"],
      seedDomains: ["kubernetes.io", "github.blog", "blog.cloudflare.com"],
      seedLanguages: ["en"],
    },
    seedSource: {
      providerType: "rss",
      sourceRole: "technical_change",
      endpointKind: "rss_feed",
      fetchUrl: "https://kubernetes.io/feed.xml",
      homepageUrl: "https://kubernetes.io/",
      trustStage: "active",
      coverageContribution: 1.0,
      downstreamWeight: 1.0,
      contractStatus: "active",
    },
    minimums: {
      expansionHypothesisCount: 1,
    },
  },
]);

export const ALL_LIVE_CALIBRATION_CASE_PACKS = [
  ...LIVE_CALIBRATION_CASE_PACKS,
  ...EXTENDED_LIVE_CALIBRATION_CASE_PACKS,
];

export function liveCalibrationCasePacksForSet(caseSet = "core") {
  if (caseSet === "core") {
    return LIVE_CALIBRATION_CASE_PACKS;
  }
  if (caseSet === "extended") {
    return EXTENDED_LIVE_CALIBRATION_CASE_PACKS;
  }
  if (caseSet === "all") {
    return ALL_LIVE_CALIBRATION_CASE_PACKS;
  }
  throw new Error(`Unsupported live calibration case set ${caseSet}.`);
}

export function normalizeText(value) {
  return String(value ?? "").trim();
}

export function asArray(value) {
  return Array.isArray(value) ? value : [];
}

export function asObject(value) {
  return value != null && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function sqlJson(value) {
  return `'${JSON.stringify(value ?? null).replaceAll("'", "''")}'::jsonb`;
}

export function sqlText(value) {
  return `'${String(value ?? "").replaceAll("'", "''")}'`;
}

export function validateLiveCalibrationCasePack(casePacks) {
  const errors = [];
  const seenKeys = new Set();
  for (const casePack of asArray(casePacks)) {
    const key = normalizeText(casePack.key);
    if (!key) {
      errors.push("case key is required");
    } else if (seenKeys.has(key)) {
      errors.push(`duplicate case key ${key}`);
    }
    seenKeys.add(key);
    const providerIds = asArray(casePack.expectedProviderIds);
    for (const providerId of providerIds) {
      if (!LIVE_CALIBRATION_ALLOWED_PROVIDER_IDS.has(normalizeText(providerId))) {
        errors.push(`${key || "case"} uses out-of-scope provider ${providerId}`);
      }
    }
    if (providerIds.length === 0) {
      errors.push(`${key || "case"} must declare expected provider ids`);
    }
    if (!asObject(casePack.target).prompt) {
      errors.push(`${key || "case"} target.prompt is required`);
    }
  }
  return { passed: errors.length === 0, errors };
}

export function allowedSearchProvidersFromEnv(env = process.env) {
  const requested = normalizeText(env.DISCOVERY_SEARCH_PROVIDERS);
  if (requested) {
    return requested
      .split(",")
      .map((item) => normalizeText(item).toLowerCase())
      .filter(Boolean)
      .filter((provider) => {
        if (provider === "brave") {
          return Boolean(normalizeText(env.DISCOVERY_BRAVE_API_KEY));
        }
        if (provider === "serper") {
          return Boolean(normalizeText(env.DISCOVERY_SERPER_API_KEY));
        }
        return provider === "ddgs";
      });
  }
  return ["ddgs"];
}

export function buildCalibrationComposeEnv(env = process.env) {
  const providers = allowedSearchProvidersFromEnv(env);
  return {
    DISCOVERY_ENABLED: "1",
    DISCOVERY_V3_LIVE_EXECUTION: "1",
    DISCOVERY_SEARCH_PROVIDER: providers[0] ?? "ddgs",
    DISCOVERY_SEARCH_PROVIDERS: providers.join(","),
  };
}

export function caseSourceRoleTargets(casePack) {
  return asObject(casePack.sourceRoleTargets);
}

export function computeCoverageDelta(before, after) {
  return round4(Number(after?.coverage_score ?? after?.coverageScore ?? 0) - Number(before?.coverage_score ?? before?.coverageScore ?? 0));
}

export function summarizeCaseIteration({ casePack, iteration, beforeCoverage, afterCoverage, run, hypotheses, endpoints, contracts, claims, negativeEvidence, providerHealth, llmDecisions, seededSource }) {
  const endpointItems = asArray(endpoints?.items);
  const hypothesisItems = asArray(hypotheses?.items);
  const contractItems = asArray(contracts?.items);
  const negativeItems = asArray(negativeEvidence?.items);
  const providerItems = asArray(providerHealth?.items);
  const llmItems = asArray(llmDecisions?.items);
  const coverageDelta = computeCoverageDelta(beforeCoverage, afterCoverage);
  const reviewableEndpoints = endpointItems.filter((endpoint) =>
    ["manual_review", "review", "promotable"].includes(normalizeText(endpoint.status || endpoint.recommended_action))
  );
  const rssOrAtomEndpoints = endpointItems.filter((endpoint) => {
    const providerType = normalizeText(endpoint.provider_type || endpoint.providerType).toLowerCase();
    const endpointKind = normalizeText(endpoint.endpoint_kind || endpoint.endpointKind).toLowerCase();
    const url = normalizeText(endpoint.endpoint_url || endpoint.endpointUrl).toLowerCase();
    return providerType === "rss" || endpointKind === "rss_feed" || url.includes("atom");
  });
  const sourceDirectorySignals = [
    ...endpointItems.filter((endpoint) => normalizeText(endpoint.endpoint_kind || endpoint.endpointKind) === "source_directory"),
    ...hypothesisItems.filter((hypothesis) => normalizeText(hypothesis.acquisition_tactic || hypothesis.acquisitionTactic).includes("source_directory")),
  ];
  const replacementHypotheses = hypothesisItems.filter((hypothesis) =>
    normalizeText(hypothesis.hypothesis_type || hypothesis.hypothesisType).includes("replacement")
    || normalizeText(hypothesis.source_role || hypothesis.sourceRole) === "replacement_candidate"
  );
  const expansionHypotheses = hypothesisItems.filter((hypothesis) =>
    ["sibling_endpoint", "feed_discovery", "website_collection_discovery", "related_domain_expansion", "source_directory"].some((needle) =>
      normalizeText(hypothesis.hypothesis_type || hypothesis.hypothesisType || hypothesis.acquisition_tactic || hypothesis.acquisitionTactic).includes(needle)
    )
  );
  const providerHealthEvents = providerItems.filter((row) => normalizeText(row.status).toLowerCase() !== "healthy");
  const oldSourceStillActive = seededSource ? seededSource.isActive !== false : true;
  const runStatus = normalizeText(run?.status).toLowerCase();
  const runtimePassed = ["completed", "failed", "cancelled"].includes(runStatus) && runStatus !== "running";
  const flowPassed = determineFlowPass({
    casePack,
    coverageDelta,
    endpointItems,
    reviewableEndpoints,
    rssOrAtomEndpoints,
    hypothesisItems,
    sourceDirectorySignals,
    replacementHypotheses,
    expansionHypotheses,
    negativeItems,
    providerHealthEvents,
    oldSourceStillActive,
  });
  const rootCauses = classifyIterationRootCauses({
    casePack,
    runtimePassed,
    flowPassed,
    coverageDelta,
    endpointItems,
    reviewableEndpoints,
    rssOrAtomEndpoints,
    hypothesisItems,
    negativeItems,
    providerHealthEvents,
    run,
  });
  return {
    caseSet: casePack.caseSet ?? "core",
    caseKey: casePack.key,
    label: casePack.label,
    flow: casePack.flow,
    iteration,
    runId: run?.run_id ?? run?.runId ?? null,
    targetId: run?.target_id ?? run?.targetId ?? null,
    runStatus,
    runtimePassed,
    flowPassed,
    coverageBefore: Number(beforeCoverage?.coverage_score ?? beforeCoverage?.coverageScore ?? 0),
    coverageAfter: Number(afterCoverage?.coverage_score ?? afterCoverage?.coverageScore ?? 0),
    coverageDelta,
    hypothesisCount: hypothesisItems.length,
    roleAlignedHypothesisCount: countRoleAlignedHypotheses(hypothesisItems, caseSourceRoleTargets(casePack)),
    endpointCount: endpointItems.length,
    rssOrAtomEndpointCount: rssOrAtomEndpoints.length,
    reviewableEndpointCount: reviewableEndpoints.length,
    contractCount: contractItems.length,
    claimCount: asArray(claims?.items).length,
    negativeEvidenceCount: negativeItems.length,
    providerHealthEventCount: providerHealthEvents.length,
    llmDecisionCount: llmItems.length,
    sourceDirectorySignalCount: sourceDirectorySignals.length,
    replacementHypothesisCount: replacementHypotheses.length,
    expansionHypothesisCount: expansionHypotheses.length,
    oldSourceStillActive,
    endpointScoreSummary: summarizeScores(endpointItems),
    queryDiversity: summarizeQueryDiversity(hypothesisItems),
    providerVotes: summarizeProviderVotes(endpointItems),
    endpointExplanations: endpointItems.toSorted(compareEndpointForReport).slice(0, 10).map(explainEndpointForReport),
    rootCauses,
  };
}

export function determineFlowPass({ casePack, coverageDelta, endpointItems, reviewableEndpoints, rssOrAtomEndpoints, hypothesisItems, sourceDirectorySignals, replacementHypotheses, expansionHypotheses, negativeItems, providerHealthEvents, oldSourceStillActive }) {
  const minimums = asObject(casePack.minimums);
  if (casePack.flow === "bootstrap") {
    return rssOrAtomEndpoints.length >= Number(minimums.endpointCount ?? 1)
      && coverageDelta >= Number(minimums.coverageDelta ?? 0);
  }
  if (casePack.flow === "gap_fill") {
    return reviewableEndpoints.length >= Number(minimums.reviewableEndpointCount ?? 1)
      && countRoleAlignedHypotheses(hypothesisItems, caseSourceRoleTargets(casePack)) >= Number(minimums.roleAlignedHypothesisCount ?? 1)
      && endpointItems.every((endpoint) => normalizeText(endpoint.recommended_action || endpoint.recommendedAction) !== "auto_promote");
  }
  if (casePack.flow === "security_advisory") {
    return (
      reviewableEndpointsForRoleOrKind(endpointItems, "security_advisory", "security_advisory").length
        + rssOrAtomEndpoints.length
    ) >= Number(minimums.reviewableEndpointCount ?? 1)
      && countRoleAlignedHypotheses(hypothesisItems, caseSourceRoleTargets(casePack)) >= Number(minimums.roleAlignedHypothesisCount ?? 1);
  }
  if (casePack.flow === "primary_data") {
    return reviewableEndpointsForRoleOrKind(endpointItems, "primary_data", "dataset").length >= Number(minimums.reviewableEndpointCount ?? 1)
      && countRoleAlignedHypotheses(hypothesisItems, caseSourceRoleTargets(casePack)) >= Number(minimums.roleAlignedHypothesisCount ?? 1)
      && endpointItems.every((endpoint) => normalizeText(endpoint.recommended_action || endpoint.recommendedAction) !== "auto_promote");
  }
  if (casePack.flow === "report_research") {
    return reviewableEndpointsForRoleOrKind(endpointItems, "report_research", "report_library").length >= Number(minimums.reviewableEndpointCount ?? 1)
      || sourceDirectorySignals.length >= Number(minimums.sourceDirectorySignalCount ?? 1);
  }
  if (casePack.flow === "regulatory_policy") {
    return reviewableEndpointsForRoleOrKind(endpointItems, "regulatory_policy", "regulatory_policy").length >= Number(minimums.reviewableEndpointCount ?? 1)
      && countRoleAlignedHypotheses(hypothesisItems, caseSourceRoleTargets(casePack)) >= Number(minimums.roleAlignedHypothesisCount ?? 1);
  }
  if (casePack.flow === "source_expand") {
    return expansionHypotheses.length >= Number(minimums.expansionHypothesisCount ?? 1)
      || sourceDirectorySignals.length > 0
      || endpointItems.length > 0;
  }
  if (casePack.flow === "replacement") {
    return oldSourceStillActive
      && (replacementHypotheses.length >= Number(minimums.replacementHypothesisCount ?? 1) || endpointItems.length > 0);
  }
  if (casePack.flow === "source_directory") {
    return sourceDirectorySignals.length >= Number(minimums.sourceDirectorySignalCount ?? 1)
      || negativeItems.some((item) => ["probe_failed", "blocked_domain", "no_results"].includes(normalizeText(item.failure_mode || item.failureMode)));
  }
  if (casePack.flow === "guards") {
    return negativeItems.length > 0 && providerHealthEvents.length > 0;
  }
  return endpointItems.length > 0 || coverageDelta > 0;
}

export function determineLiveCalibrationVerdicts(iterations, { mode = "calibration", casePacks = LIVE_CALIBRATION_CASE_PACKS, repeatCount: repeatCountOverride = null } = {}) {
  const repeatCount = repeatCountOverride ?? LIVE_CALIBRATION_REPEAT_COUNTS[mode] ?? LIVE_CALIBRATION_REPEAT_COUNTS.calibration;
  const minPassingRuns = LIVE_CALIBRATION_MIN_PASSING_RUNS[mode] ?? LIVE_CALIBRATION_MIN_PASSING_RUNS.calibration;
  const perCase = casePacks.map((casePack) => {
    const rows = asArray(iterations).filter((item) => item.caseKey === casePack.key);
    const runtimeFailures = rows.filter((item) => item.runtimePassed !== true).length;
    const passingRuns = rows.filter((item) => item.flowPassed === true).length;
    const rootCauseCounts = countValues(rows.flatMap((item) => item.rootCauses));
    return {
      caseSet: casePack.caseSet ?? "core",
      key: casePack.key,
      label: casePack.label,
      flow: casePack.flow,
      passingRuns,
      totalRuns: rows.length,
      runtimeFailures,
      rootCauseCounts,
      verdict: runtimeFailures > 0 ? "runtime_failed" : passingRuns >= minPassingRuns ? "pass" : "weak",
    };
  });
  const runtimeVerdict = perCase.some((item) => item.runtimeFailures > 0 || item.totalRuns < repeatCount) ? "fail" : "pass";
  const qualityVerdict = perCase.every((item) => item.verdict === "pass") ? "pass" : "weak";
  const finalVerdict =
    runtimeVerdict === "fail"
      ? "fail"
      : mode === "calibration"
        ? "pass"
        : qualityVerdict === "pass"
          ? "pass"
          : "yield_weak";
  return {
    mode,
    repeatCount,
    minPassingRuns,
    runtimeVerdict,
    qualityVerdict,
    finalVerdict,
    perCase,
    aggregateRootCauseCounts: countValues(perCase.flatMap((item) =>
      Object.entries(item.rootCauseCounts).flatMap(([key, count]) => Array.from({ length: Number(count) || 0 }, () => key))
    )),
  };
}

export function classifyIterationRootCauses({ casePack, runtimePassed, flowPassed, coverageDelta, endpointItems, reviewableEndpoints, rssOrAtomEndpoints, hypothesisItems, negativeItems, providerHealthEvents, run }) {
  const causes = [];
  if (!runtimePassed) {
    causes.push("runtime_problem");
  }
  if (providerHealthEvents.length > 0) {
    causes.push("provider_health_event");
  }
  if (normalizeText(run?.summary_json?.executionMode || run?.summaryJson?.executionMode).includes("disabled")) {
    causes.push("live_execution_not_enabled");
  }
  if (hypothesisItems.length === 0) {
    causes.push("target_domain_generation_problem");
  }
  if (endpointItems.length === 0 && casePack.flow !== "guards") {
    causes.push("no_results");
  }
  if (casePack.flow === "bootstrap" && rssOrAtomEndpoints.length === 0) {
    causes.push("missing_rss_atom_endpoint");
  }
  if (casePack.flow === "gap_fill" && reviewableEndpoints.length === 0) {
    causes.push("review_policy_problem");
  }
  if (
    ["security_advisory", "primary_data", "report_research", "regulatory_policy"].includes(casePack.flow)
    && reviewableEndpoints.length === 0
  ) {
    causes.push("review_policy_problem");
  }
  if (coverageDelta <= 0 && ["bootstrap", "gap_fill"].includes(casePack.flow)) {
    causes.push("coverage_not_improving");
  }
  if (negativeItems.some((item) => normalizeText(item.failure_mode || item.failureMode) === "probe_failed")) {
    causes.push("probe_failed");
  }
  if (endpointItems.some((endpoint) => normalizeText(endpoint.status) === "duplicate")) {
    causes.push("duplicate_pressure");
  }
  if (endpointItems.some((endpoint) => asArray(endpoint.missingEvidence || endpoint.missing_evidence).length > 0)) {
    causes.push("missing_evidence");
  }
  if (!flowPassed && causes.length === 0) {
    causes.push("low_relevance");
  }
  return [...new Set(causes)];
}

export function buildTuningRecommendations(verdictsOrCounts) {
  const counts = verdictsOrCounts?.aggregateRootCauseCounts ?? verdictsOrCounts ?? {};
  const recommendations = [];
  const add = (failureMode, knob, recommendation, priority = 0.5) => {
    const count = Number(counts[failureMode] ?? 0);
    if (count > 0) {
      recommendations.push({ failureMode, count, knob, recommendation, priority });
    }
  };
  add("no_results", "query_templates", "Broaden direct-source templates and add source-directory variants before increasing provider budget.", 0.75);
  add("low_relevance", "scoring_thresholds", "Inspect rejected endpoint explanations and tune positive/negative role terms through replay eval first.", 0.65);
  add("target_domain_generation_problem", "interest_graph", "Add role-specific entities, localized terms or seed domains to the target graph compiler.", 0.8);
  add("review_policy_problem", "action_policy", "Check website manual-review thresholds and missing-evidence reasons; do not enable website auto-promotion.", 0.7);
  add("probe_failed", "fetcher_probe", "Review fetcher probe failures and provider health before changing hypothesis scoring.", 0.7);
  add("duplicate_pressure", "identity_resolution", "Increase identity dedupe pressure or lower saturated-role novelty before spending more search budget.", 0.6);
  add("missing_evidence", "endpoint_probe", "Improve endpoint samples/missing-evidence extraction before promotion policy changes.", 0.65);
  add("provider_health_event", "provider_health", "Treat provider errors as circuit-breaker events; retry with backoff or switch configured provider.", 0.8);
  add("coverage_not_improving", "coverage_policy", "Prefer missing roles and reduce saturated-role budget in the next live run.", 0.65);
  add("live_execution_not_enabled", "runtime_env", "Ensure worker started with DISCOVERY_V3_LIVE_EXECUTION=1 for live calibration.", 1.0);
  return recommendations.sort((left, right) => right.priority - left.priority || right.count - left.count);
}

export function buildReplayEvalFixture(caseIteration) {
  return {
    targetJson: {
      caseSet: caseIteration.caseSet ?? "core",
      caseKey: caseIteration.caseKey,
      targetId: caseIteration.targetId,
      flow: caseIteration.flow,
    },
    providerFixturesJson: {
      caseSet: caseIteration.caseSet ?? "core",
      endpointScoreSummary: caseIteration.endpointScoreSummary,
      endpointExplanations: asArray(caseIteration.endpointExplanations),
      queryDiversity: caseIteration.queryDiversity,
      providerVotes: caseIteration.providerVotes,
      rootCauses: caseIteration.rootCauses,
    },
    expectedSourcesJson: caseIteration.flowPassed ? [{ caseKey: caseIteration.caseKey, expected: "at_least_one_useful_source" }] : [],
    expectedRejectsJson: caseIteration.rootCauses.map((failureMode) => ({ failureMode })),
    expectedHiddenClaimsJson: [],
  };
}

export function formatLiveCalibrationMarkdown(report) {
  const lines = [
    "# Discovery V3 Live Calibration Evidence",
    "",
    `Run id: \`${report.runId}\``,
    `Case set: \`${report.caseSet ?? "core"}\``,
    `Mode: \`${report.mode}\``,
    `Started at: \`${report.startedAt}\``,
    `Finished at: \`${report.finishedAt ?? "pending"}\``,
    `Runtime verdict: \`${report.verdicts?.runtimeVerdict ?? "unknown"}\``,
    `Quality verdict: \`${report.verdicts?.qualityVerdict ?? "unknown"}\``,
    `Final verdict: \`${report.verdicts?.finalVerdict ?? "unknown"}\``,
    "",
    "## Per-Case Verdicts",
    "",
    "| Case set | Case | Flow | Passing runs | Runtime failures | Root causes |",
    "| --- | --- | --- | ---: | ---: | --- |",
    ...asArray(report.verdicts?.perCase).map((item) =>
      `| ${item.caseSet ?? "core"} | ${item.key} | ${item.flow} | ${item.passingRuns}/${item.totalRuns} | ${item.runtimeFailures} | ${formatCounts(item.rootCauseCounts)} |`
    ),
    "",
    "## Tuning Recommendations",
    "",
    ...(
      asArray(report.tuningRecommendations).length > 0
        ? report.tuningRecommendations.map((item) =>
          `- \`${item.failureMode}\` (${item.count}) -> \`${item.knob}\`: ${item.recommendation}`
        )
        : ["- No tuning recommendations generated."]
    ),
    "",
    "## Iterations",
    "",
  ];
  for (const item of asArray(report.iterations)) {
    lines.push(
      `### ${item.caseKey} · iteration ${item.iteration}`,
      "",
      `- Run: \`${item.runId ?? "n/a"}\``,
      `- Status: \`${item.runStatus}\``,
      `- Flow passed: \`${item.flowPassed}\``,
      `- Coverage delta: \`${item.coverageDelta}\``,
      `- Hypotheses: ${item.hypothesisCount}`,
      `- Endpoints: ${item.endpointCount}`,
      `- Reviewable endpoints: ${item.reviewableEndpointCount}`,
      `- RSS/Atom endpoints: ${item.rssOrAtomEndpointCount}`,
      `- Negative evidence: ${item.negativeEvidenceCount}`,
      `- Provider health events: ${item.providerHealthEventCount}`,
      `- Root causes: ${item.rootCauses.join(", ") || "none"}`,
      ""
    );
    const examples = asArray(item.endpointExplanations).slice(0, 5);
    if (examples.length > 0) {
      lines.push("| Endpoint | Provider | Role | Kind | Action | Why not promoted | Missing evidence |");
      lines.push("| --- | --- | --- | --- | --- | --- | --- |");
      for (const endpoint of examples) {
        lines.push(
          `| ${markdownCell(endpoint.url)} | ${markdownCell(endpoint.providerType)} | ${markdownCell(endpoint.sourceRole)} | ${markdownCell(endpoint.endpointKind)} | ${markdownCell(endpoint.recommendedAction)} | ${markdownCell(asArray(endpoint.whyNotPromoted).join("; ") || "n/a")} | ${markdownCell(asArray(endpoint.missingEvidence).join("; ") || "n/a")} |`
        );
      }
      lines.push("");
    }
  }
  if (report.replayEval) {
    lines.push(
      "## Replay Eval",
      "",
      `- Suite id: \`${report.replayEval.evalSuiteId ?? "n/a"}\``,
      `- Eval run id: \`${report.replayEval.evalRunId ?? "n/a"}\``,
      `- Status: \`${report.replayEval.status ?? "unknown"}\``,
      ""
    );
  }
  if (report.error) {
    lines.push("## Error", "", report.error, "");
  }
  return lines.join("\n");
}

function countRoleAlignedHypotheses(hypotheses, sourceRoleTargets) {
  const roles = new Set(Object.keys(asObject(sourceRoleTargets)));
  if (roles.size === 0) {
    return asArray(hypotheses).length;
  }
  return asArray(hypotheses).filter((hypothesis) =>
    roles.has(normalizeText(hypothesis.source_role || hypothesis.sourceRole))
  ).length;
}

function reviewableEndpointsForRoleOrKind(endpoints, sourceRole, endpointKind) {
  return asArray(endpoints).filter((endpoint) => {
    const action = normalizeText(endpoint.status || endpoint.recommended_action || endpoint.recommendedAction);
    const role = normalizeText(endpoint.source_role || endpoint.sourceRole);
    const kind = normalizeText(endpoint.endpoint_kind || endpoint.endpointKind);
    return ["manual_review", "review", "promotable", "needs_config"].includes(action)
      && (role === sourceRole || kind === endpointKind);
  });
}

function summarizeScores(endpoints) {
  const scores = asArray(endpoints)
    .map((endpoint) => Number(endpoint.total_score ?? endpoint.totalScore ?? 0))
    .filter((score) => Number.isFinite(score));
  if (scores.length === 0) {
    return { count: 0, min: 0, max: 0, avg: 0 };
  }
  return {
    count: scores.length,
    min: round4(Math.min(...scores)),
    max: round4(Math.max(...scores)),
    avg: round4(scores.reduce((sum, score) => sum + score, 0) / scores.length),
  };
}

function summarizeQueryDiversity(hypotheses) {
  const queries = new Set();
  const roles = new Set();
  const providers = new Set();
  for (const hypothesis of asArray(hypotheses)) {
    if (normalizeText(hypothesis.query_text || hypothesis.queryText)) {
      queries.add(normalizeText(hypothesis.query_text || hypothesis.queryText));
    }
    if (normalizeText(hypothesis.source_role || hypothesis.sourceRole)) {
      roles.add(normalizeText(hypothesis.source_role || hypothesis.sourceRole));
    }
    if (normalizeText(hypothesis.provider_id || hypothesis.providerId)) {
      providers.add(normalizeText(hypothesis.provider_id || hypothesis.providerId));
    }
  }
  return {
    queryCount: queries.size,
    roleCount: roles.size,
    providerCount: providers.size,
    roles: [...roles].sort(),
    providers: [...providers].sort(),
  };
}

function summarizeProviderVotes(endpoints) {
  const counts = {};
  for (const endpoint of asArray(endpoints)) {
    const evidence = asObject(endpoint.evidence_json || endpoint.evidenceJson);
    const votes = asObject(evidence.providerVotes || evidence.provider_votes);
    for (const provider of Object.keys(votes)) {
      counts[provider] = (counts[provider] ?? 0) + 1;
    }
  }
  return counts;
}

function explainEndpointForReport(endpoint) {
  const evidence = asObject(endpoint.evidence_json || endpoint.evidenceJson);
  const seedReview = asObject(evidence.seedReview);
  const whyFound = asArray(evidence.whyFound || evidence.why_found);
  const whyNotPromoted = asArray(evidence.whyNotPromoted || evidence.why_not_promoted);
  const missingEvidence = asArray(evidence.missingEvidence || evidence.missing_evidence);
  if (seedReview.reason) {
    whyFound.push(seedReview.reason);
  }
  if (seedReview.promotionPolicy) {
    whyNotPromoted.push(seedReview.promotionPolicy);
  }
  missingEvidence.push(...asArray(seedReview.missingEvidence));
  return {
    endpointId: endpoint.endpoint_id ?? endpoint.endpointId ?? null,
    url: endpoint.endpoint_url ?? endpoint.endpointUrl ?? null,
    providerType: endpoint.provider_type ?? endpoint.providerType ?? null,
    sourceRole: endpoint.source_role ?? endpoint.sourceRole ?? null,
    endpointKind: endpoint.endpoint_kind ?? endpoint.endpointKind ?? null,
    status: endpoint.status ?? null,
    recommendedAction: endpoint.recommended_action ?? endpoint.recommendedAction ?? null,
    totalScore: Number(endpoint.total_score ?? endpoint.totalScore ?? 0),
    whyFound: [...new Set(whyFound)],
    whyNotPromoted: [...new Set(whyNotPromoted)],
    missingEvidence: [...new Set(missingEvidence)],
  };
}

function compareEndpointForReport(left, right) {
  const leftRank = endpointReportRank(left);
  const rightRank = endpointReportRank(right);
  if (leftRank !== rightRank) {
    return leftRank - rightRank;
  }
  return Number(right.total_score ?? right.totalScore ?? 0) - Number(left.total_score ?? left.totalScore ?? 0);
}

function endpointReportRank(endpoint) {
  const action = normalizeText(endpoint.recommended_action || endpoint.recommendedAction);
  const status = normalizeText(endpoint.status);
  const kind = normalizeText(endpoint.endpoint_kind || endpoint.endpointKind);
  if (["review", "manual_promote", "needs_config"].includes(action) || ["manual_review", "needs_config"].includes(status)) {
    return 0;
  }
  if (kind && kind !== "unknown") {
    return 1;
  }
  return 2;
}

function countValues(values) {
  const counts = {};
  for (const value of asArray(values)) {
    const key = normalizeText(value);
    if (key) {
      counts[key] = (counts[key] ?? 0) + 1;
    }
  }
  return counts;
}

function formatCounts(counts) {
  const entries = Object.entries(counts ?? {});
  return entries.length > 0 ? entries.map(([key, count]) => `${key}:${count}`).join(", ") : "none";
}

function markdownCell(value) {
  return normalizeText(value).replaceAll("|", "\\|") || "n/a";
}

function round4(value) {
  return Math.round((Number(value) || 0) * 10000) / 10000;
}

export function newRunId() {
  return randomUUID().slice(0, 8);
}

import { createNewsPortalSdk } from "@newsportal/sdk";

import { resolveDiscoveryOperatorSummary } from "./operator-surfaces";
import { resolveAdminAppPath } from "./browser-flow";
import {
  asArray,
  asFloat,
  asInt,
  asPaged,
  asRecord,
  type DiscoveryRecord as R,
} from "./discovery-view-model";

type RuntimeConfig = {
  apiBaseUrl: string;
  discoveryMonthlyBudgetCents: number;
  discoverySearchProvider: string;
  discoveryLlmModel: string;
};

function parsePositivePage(url: URL, paramName: string): number {
  const requested = Number.parseInt(url.searchParams.get(paramName) ?? "1", 10);
  return Number.isFinite(requested) && requested > 0 ? requested : 1;
}

async function getDiscoveryApiJson(
  runtimeConfig: RuntimeConfig,
  fetchImpl: typeof fetch,
  path: string,
  query: Record<string, string | number | null | undefined> = {}
): Promise<unknown> {
  const target = new URL(path, runtimeConfig.apiBaseUrl);
  for (const [key, value] of Object.entries(query)) {
    if (value == null) continue;
    const normalized = String(value).trim();
    if (!normalized) continue;
    target.searchParams.set(key, normalized);
  }
  const response = await fetchImpl(target, {
    headers: {
      accept: "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(`Discovery API request failed: ${response.status}`);
  }
  return response.json();
}

function resolveSelectedItemId(
  url: URL,
  items: R[],
  paramName: string,
  keyName: string
): string {
  const requested = String(url.searchParams.get(paramName) ?? "").trim();
  const hasRequested = items.some(
    (item) => String(item[keyName] ?? "").trim() === requested
  );
  if (hasRequested) {
    return requested;
  }
  return String(items[0]?.[keyName] ?? "");
}

export function buildDiscoveryPageLinks(input: {
  request: Request;
  url: URL;
  tab: string;
}) {
  const appPath = (target = "/") => resolveAdminAppPath(input.request, target);
  const bffPath = appPath("/bff/admin/discovery");
  const currentPath = `${input.url.pathname}${input.url.search}`;

  function resolvePageHref(paramName: string, nextPage: number): string {
    const target = new URL(input.url);
    target.searchParams.set("tab", input.tab || "dashboard");
    if (nextPage <= 1) {
      target.searchParams.delete(paramName);
    } else {
      target.searchParams.set(paramName, String(nextPage));
    }
    return `${target.pathname}${target.search}`;
  }

  function resolveMissionScopedHref(missionId: string): string {
    return appPath(`/discovery/missions/${encodeURIComponent(missionId)}`);
  }

  function resolveSelectionHref(
    nextTab: string,
    updates: Record<string, string | number | null | undefined>
  ): string {
    const target = new URL(input.url);
    if (nextTab === "dashboard") {
      target.searchParams.delete("tab");
    } else {
      target.searchParams.set("tab", nextTab);
    }
    for (const [key, value] of Object.entries(updates)) {
      const normalized = String(value ?? "").trim();
      if (!normalized) {
        target.searchParams.delete(key);
      } else {
        target.searchParams.set(key, normalized);
      }
    }
    return `${target.pathname}${target.search}`;
  }

  const pagePaths = {
    dashboard: appPath("/"),
    discovery: appPath("/discovery"),
    profiles: appPath("/discovery/profiles"),
    missions: appPath("/discovery/missions"),
    recall: appPath("/discovery/recall"),
    candidates: appPath("/discovery/candidates"),
    sources: appPath("/discovery/sources"),
  };
  const tabs = [
    { key: "dashboard", label: "Overview", href: pagePaths.discovery },
    { key: "profiles", label: "Profiles", href: pagePaths.profiles },
    { key: "missions", label: "Missions", href: pagePaths.missions },
    { key: "recall", label: "Recall", href: pagePaths.recall },
    { key: "candidates", label: "Review queue", href: pagePaths.candidates },
    { key: "sources", label: "Sources", href: pagePaths.sources },
  ];

  return {
    appPath,
    bffPath,
    currentPath,
    pagePaths,
    resolveMissionScopedHref,
    resolvePageHref,
    resolveSelectionHref,
    tabs,
  };
}

export async function buildDiscoveryPageViewModel(input: {
  runtimeConfig: RuntimeConfig;
  url: URL;
  fetchImpl: typeof fetch;
}) {
  const sdk = createNewsPortalSdk({
    baseUrl: input.runtimeConfig.apiBaseUrl,
    fetchImpl: input.fetchImpl,
  });

  const missionPage = parsePositivePage(input.url, "missionPage");
  const profilePage = parsePositivePage(input.url, "profilePage");
  const classPage = parsePositivePage(input.url, "classPage");
  const candidatePage = parsePositivePage(input.url, "candidatePage");
  const hypothesisPage = parsePositivePage(input.url, "hypothesisPage");
  const sourcePage = parsePositivePage(input.url, "sourcePage");
  const feedbackPage = parsePositivePage(input.url, "feedbackPage");
  const recallMissionPage = parsePositivePage(input.url, "recallMissionPage");
  const recallCandidatePage = parsePositivePage(input.url, "recallCandidatePage");

  const summary = asRecord(await sdk.getDiscoverySummary<R>());
  const costs = asRecord(await sdk.getDiscoveryCostSummary<R>());
  const profiles = asPaged(await sdk.listDiscoveryProfiles<R>({ page: profilePage, pageSize: 8 }));
  const missions = asPaged(await sdk.listDiscoveryMissions<R>({ page: missionPage, pageSize: 10 }));
  const classes = asPaged(await sdk.listDiscoveryClasses<R>({ page: classPage, pageSize: 10 }));
  const candidates = asPaged(await sdk.listDiscoveryCandidates<R>({ page: candidatePage, pageSize: 12 }));
  const hypotheses = asPaged(await sdk.listDiscoveryHypotheses<R>({ page: hypothesisPage, pageSize: 12 }));
  const sourceProfiles = asPaged(await sdk.listDiscoverySourceProfiles<R>({ page: sourcePage, pageSize: 12 }));
  const feedback = asPaged(await sdk.listDiscoveryFeedback<R>({ page: feedbackPage, pageSize: 12 }));
  const recallMissions = asPaged(
    await getDiscoveryApiJson(input.runtimeConfig, input.fetchImpl, "/maintenance/discovery/recall-missions", {
      page: recallMissionPage,
      pageSize: 8,
    }).catch(() => ({}))
  );
  const recallCandidates = asPaged(
    await getDiscoveryApiJson(input.runtimeConfig, input.fetchImpl, "/maintenance/discovery/recall-candidates", {
      page: recallCandidatePage,
      pageSize: 10,
    }).catch(() => ({}))
  );

  const missionItems = missions.items.map((item) => asRecord(item));
  const profileItems = profiles.items.map((item) => asRecord(item));
  const classItems = classes.items.map((item) => asRecord(item));
  const candidateItems = candidates.items.map((item) => asRecord(item));
  const hypothesisItems = hypotheses.items.map((item) => asRecord(item));
  const sourceProfileItems = sourceProfiles.items.map((item) => asRecord(item));
  const feedbackItems = feedback.items.map((item) => asRecord(item));
  const recallMissionItems = recallMissions.items.map((item) => asRecord(item));
  const recallCandidateItems = recallCandidates.items.map((item) => asRecord(item));
  const operatorSummary = resolveDiscoveryOperatorSummary(summary);
  const attachableProfiles = profileItems.filter(
    (item) => String(item.status ?? "") === "active"
  );
  const selectedPortfolioMissionIdRaw = String(input.url.searchParams.get("portfolioMissionId") ?? "").trim();
  const selectedMissionId =
    missionItems.find((item) => String(item.mission_id ?? "") === selectedPortfolioMissionIdRaw) != null
      ? selectedPortfolioMissionIdRaw
      : String(missionItems[0]?.mission_id ?? "");
  const selectedMissionWorkspaceId = resolveSelectedItemId(
    input.url,
    missionItems,
    "selectedMissionId",
    "mission_id"
  );
  const selectedMissionWorkspace =
    missionItems.find(
      (item) => String(item.mission_id ?? "") === selectedMissionWorkspaceId
    ) ?? null;
  const selectedCandidateId = resolveSelectedItemId(
    input.url,
    candidateItems,
    "selectedCandidateId",
    "candidate_id"
  );
  const selectedCandidate =
    candidateItems.find(
      (item) => String(item.candidate_id ?? "") === selectedCandidateId
    ) ?? null;
  const selectedSourceProfileId = resolveSelectedItemId(
    input.url,
    sourceProfileItems,
    "selectedSourceProfileId",
    "source_profile_id"
  );
  const selectedSourceProfile =
    sourceProfileItems.find(
      (item) => String(item.source_profile_id ?? "") === selectedSourceProfileId
    ) ?? null;
  const portfolioResult = selectedMissionId
    ? asRecord(await sdk.getDiscoveryMissionPortfolio<R>(selectedMissionId).catch(() => ({})))
    : {};
  const portfolioSnapshot = asRecord(portfolioResult.snapshot);
  const sourceScores = selectedMissionId
    ? asPaged(
        await sdk.listDiscoverySourceInterestScores<R>({
          missionId: selectedMissionId,
          page: 1,
          pageSize: 20,
        })
      )
    : asPaged({});
  const sourceScoreItems = sourceScores.items.map((item) => asRecord(item));
  const sourceScoreByProfileId = new Map<string, R>(
    sourceScoreItems
      .map((item) => [String(item.source_profile_id ?? ""), item] as const)
      .filter(([key]) => key.length > 0)
  );
  const rankedSources = asArray(portfolioSnapshot.ranked_sources);
  const portfolioGaps = asArray(portfolioSnapshot.gaps_json);
  const portfolioSummary = asRecord(portfolioSnapshot.summary_json);
  const costItems = asArray(costs.items);

  const monthlyBudgetCents = asInt(
    summary.monthlyBudgetCents ?? costs.monthlyBudgetCents ?? input.runtimeConfig.discoveryMonthlyBudgetCents,
    0
  );
  const remainingMonthlyBudgetCents = asInt(
    summary.remainingMonthlyBudgetCents ?? costs.remainingMonthlyBudgetCents,
    0
  );
  const monthToDateCostUsd = asFloat(summary.monthToDateCostUsd ?? costs.monthToDateCostUsd, 0);
  const totalCostUsd = asFloat(costs.totalCostUsd ?? summary.total_cost_usd, 0);
  const monthlyQuotaReached = summary.monthlyQuotaReached === true || costs.monthlyQuotaReached === true;
  const activeSearchProvider = String(summary.searchProvider ?? input.runtimeConfig.discoverySearchProvider);
  const activeLlmModel = String(summary.llmModel ?? input.runtimeConfig.discoveryLlmModel);

  return {
    activeLlmModel,
    activeSearchProvider,
    attachableProfiles,
    candidateItems,
    candidatePage,
    candidates,
    classItems,
    classPage,
    classes,
    costItems,
    costs,
    feedback,
    feedbackItems,
    feedbackPage,
    hypothesisItems,
    hypothesisPage,
    hypotheses,
    missionItems,
    missionPage,
    missions,
    monthToDateCostUsd,
    monthlyBudgetCents,
    monthlyQuotaReached,
    operatorSummary,
    portfolioGaps,
    portfolioResult,
    portfolioSnapshot,
    portfolioSummary,
    profileItems,
    profilePage,
    profiles,
    rankedSources,
    recallCandidateItems,
    recallCandidatePage,
    recallCandidates,
    recallMissionItems,
    recallMissionPage,
    recallMissions,
    remainingMonthlyBudgetCents,
    selectedCandidate,
    selectedCandidateId,
    selectedMissionId,
    selectedMissionWorkspace,
    selectedMissionWorkspaceId,
    selectedSourceProfile,
    selectedSourceProfileId,
    sourcePage,
    sourceProfileItems,
    sourceProfiles,
    sourceScoreByProfileId,
    sourceScoreItems,
    sourceScores,
    summary,
    totalCostUsd,
  };
}

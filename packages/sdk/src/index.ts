import type { WebContentListQuery } from "../../contracts/src/content.ts";
import type { PaginatedResponse, PaginationQuery } from "../../contracts/src/pagination.ts";

export interface NewsPortalSdkOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
}

type QueryValue = string | number | boolean | null | undefined;
type ChannelListQuery = PaginationQuery & { providerType?: string };
type FetchRunsQuery = PaginationQuery & { channelId?: string };
type SequenceListQuery = PaginationQuery;
type WebResourceListQuery = PaginationQuery & {
  channelId?: string;
  extractionState?: string;
  projection?: string;
  resourceKind?: string;
};
type DiscoveryClassListQuery = PaginationQuery & { status?: string };
type DiscoveryProfileListQuery = PaginationQuery & { status?: string };
type DiscoveryMissionListQuery = PaginationQuery & { status?: string };
type DiscoveryRecallMissionListQuery = PaginationQuery & {
  status?: string;
  missionKind?: string;
};
type DiscoveryCandidateListQuery = PaginationQuery & {
  missionId?: string;
  status?: string;
  providerType?: string;
};
type DiscoveryRecallCandidateListQuery = PaginationQuery & {
  recallMissionId?: string;
  status?: string;
  providerType?: string;
  canonicalDomain?: string;
};
type DiscoveryHypothesisListQuery = PaginationQuery & {
  missionId?: string;
  status?: string;
};
type DiscoverySourceProfileListQuery = PaginationQuery & {
  minTrustScore?: number;
  sourceType?: string;
};
type DiscoverySourceInterestScoreListQuery = PaginationQuery & {
  missionId?: string;
  channelId?: string;
  minScore?: number;
};
type DiscoveryFeedbackListQuery = PaginationQuery & { missionId?: string };

function buildPath(path: string, query?: Record<string, QueryValue>): string {
  if (!query) {
    return path;
  }

  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value == null) {
      continue;
    }
    search.set(key, String(value));
  }

  const serialized = search.toString();
  return serialized ? `${path}?${serialized}` : path;
}

export function createNewsPortalSdk(options: NewsPortalSdkOptions) {
  const baseFetch = options.fetchImpl ?? fetch;
  const baseUrl = options.baseUrl.replace(/\/$/, "");

  async function requestJson<T>(
    method: string,
    path: string,
    init?: {
      body?: unknown;
      query?: Record<string, QueryValue>;
    }
  ): Promise<T> {
    const response = await baseFetch(`${baseUrl}${buildPath(path, init?.query)}`, {
      method,
      headers: init?.body === undefined ? undefined : { "content-type": "application/json" },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    });
    if (!response.ok) {
      throw new Error(`Request failed with ${response.status} ${response.statusText}.`);
    }
    return (await response.json()) as T;
  }

  async function getJson<T>(path: string, query?: Record<string, QueryValue>): Promise<T> {
    return requestJson<T>("GET", path, { query });
  }

  async function postJson<T>(
    path: string,
    body?: unknown,
    query?: Record<string, QueryValue>
  ): Promise<T> {
    return requestJson<T>("POST", path, { body, query });
  }

  async function patchJson<T>(
    path: string,
    body?: unknown,
    query?: Record<string, QueryValue>
  ): Promise<T> {
    return requestJson<T>("PATCH", path, { body, query });
  }

  async function deleteJson<T>(
    path: string,
    body?: unknown,
    query?: Record<string, QueryValue>
  ): Promise<T> {
    return requestJson<T>("DELETE", path, { body, query });
  }

  async function getPaginated<T>(
    path: string,
    params?: Record<string, QueryValue>
  ): Promise<PaginatedResponse<T>> {
    return getJson<PaginatedResponse<T>>(path, params);
  }

  return {
    listSystemSelectedContentItems: <T>(params?: WebContentListQuery) =>
      getPaginated<T>("/collections/system-selected", {
        page: params?.page,
        pageSize: params?.pageSize,
        sort: params?.sort,
        q: params?.q?.trim() || undefined,
      }),
    listContentItemsPage: <T>(params?: PaginationQuery) =>
      getPaginated<T>("/content-items", {
        page: params?.page,
        pageSize: params?.pageSize,
      }),
    getContentItem: <T>(contentItemId: string) =>
      getJson<T>(`/content-items/${encodeURIComponent(contentItemId)}`),
    getContentItemExplain: <T>(contentItemId: string) =>
      getJson<T>(`/content-items/${encodeURIComponent(contentItemId)}/explain`),
    retryContentItemEnrichment: <T>(contentItemId: string, payload?: unknown) =>
      postJson<T>(
        `/maintenance/content-items/${encodeURIComponent(contentItemId)}/enrichment/retry`,
        payload ?? {}
      ),
    listSystemInterestsPage: <T>(params?: PaginationQuery) =>
      getPaginated<T>("/system-interests", {
        page: params?.page,
        pageSize: params?.pageSize,
      }),
    getSystemInterest: <T>(interestTemplateId: string) =>
      getJson<T>(`/system-interests/${interestTemplateId}`),
    listArticles: <T>() => getJson<T>("/maintenance/articles"),
    listArticlesPage: <T>(params?: PaginationQuery) =>
      getPaginated<T>("/maintenance/articles", {
        page: params?.page,
        pageSize: params?.pageSize,
      }),
    getArticle: <T>(docId: string) => getJson<T>(`/maintenance/articles/${docId}`),
    getArticleExplain: <T>(docId: string) => getJson<T>(`/maintenance/articles/${docId}/explain`),
    retryArticleEnrichment: <T>(docId: string, payload?: unknown) =>
      postJson<T>(`/maintenance/articles/${docId}/enrichment/retry`, payload ?? {}),
    getDashboardSummary: <T>() => getJson<T>("/dashboard/summary"),
    listChannels: <T>() => getJson<T>("/channels"),
    listChannelsPage: <T>(params?: ChannelListQuery) =>
      getPaginated<T>("/channels", {
        page: params?.page,
        pageSize: params?.pageSize,
        providerType: params?.providerType,
      }),
    getChannel: <T>(channelId: string) => getJson<T>(`/channels/${channelId}`),
    listSequencesPage: <T>(params?: SequenceListQuery) =>
      getPaginated<T>("/maintenance/sequences", {
        page: params?.page,
        pageSize: params?.pageSize,
      }),
    getSequence: <T>(sequenceId: string) =>
      getJson<T>(`/maintenance/sequences/${encodeURIComponent(sequenceId)}`),
    createSequence: <T>(payload: unknown) =>
      postJson<T>("/maintenance/sequences", payload),
    updateSequence: <T>(sequenceId: string, payload: unknown) =>
      patchJson<T>(`/maintenance/sequences/${encodeURIComponent(sequenceId)}`, payload),
    archiveSequence: <T>(sequenceId: string) =>
      deleteJson<T>(`/maintenance/sequences/${encodeURIComponent(sequenceId)}`),
    listSequencePlugins: <T>() => getJson<T>("/maintenance/sequence-plugins"),
    requestSequenceRun: <T>(sequenceId: string, payload?: unknown) =>
      postJson<T>(
        `/maintenance/sequences/${encodeURIComponent(sequenceId)}/runs`,
        payload ?? {}
      ),
    getSequenceRun: <T>(runId: string) =>
      getJson<T>(`/maintenance/sequence-runs/${encodeURIComponent(runId)}`),
    getSequenceRunTaskRuns: <T>(runId: string) =>
      getJson<T>(`/maintenance/sequence-runs/${encodeURIComponent(runId)}/task-runs`),
    cancelSequenceRun: <T>(runId: string, payload?: unknown) =>
      postJson<T>(
        `/maintenance/sequence-runs/${encodeURIComponent(runId)}/cancel`,
        payload ?? {}
      ),
    listOutboxEvents: <T>(limit?: number) =>
      getJson<T>("/maintenance/outbox", {
        limit,
      }),
    listWebResourcesPage: <T>(params?: WebResourceListQuery) =>
      getPaginated<T>("/maintenance/web-resources", {
        page: params?.page,
        pageSize: params?.pageSize,
        channelId: params?.channelId,
        extractionState: params?.extractionState,
        projection: params?.projection,
        resourceKind: params?.resourceKind,
      }),
    getWebResource: <T>(resourceId: string) =>
      getJson<T>(`/maintenance/web-resources/${encodeURIComponent(resourceId)}`),
    listClusters: <T>() => getJson<T>("/clusters"),
    listClustersPage: <T>(params?: PaginationQuery) =>
      getPaginated<T>("/clusters", {
        page: params?.page,
        pageSize: params?.pageSize,
      }),
    listLlmTemplates: <T>() => getJson<T>("/templates/llm"),
    listLlmTemplatesPage: <T>(params?: PaginationQuery) =>
      getPaginated<T>("/templates/llm", {
        page: params?.page,
        pageSize: params?.pageSize,
      }),
    getLlmTemplate: <T>(promptTemplateId: string) =>
      getJson<T>(`/templates/llm/${promptTemplateId}`),
    listFetchRuns: <T>(channelId?: string) =>
      getJson<T>("/maintenance/fetch-runs", {
        channel_id: channelId,
      }),
    listFetchRunsPage: <T>(params?: FetchRunsQuery) =>
      getPaginated<T>("/maintenance/fetch-runs", {
        page: params?.page,
        pageSize: params?.pageSize,
        channel_id: params?.channelId,
      }),
    listLlmReviews: <T>() => getJson<T>("/maintenance/llm-reviews"),
    listLlmReviewsPage: <T>(params?: PaginationQuery) =>
      getPaginated<T>("/maintenance/llm-reviews", {
        page: params?.page,
        pageSize: params?.pageSize,
      }),
    getDiscoverySummary: <T>() => getJson<T>("/maintenance/discovery/summary"),
    listDiscoveryProfiles: <T>(params?: DiscoveryProfileListQuery) =>
      getPaginated<T>("/maintenance/discovery/profiles", {
        status: params?.status,
        page: params?.page,
        pageSize: params?.pageSize,
      }),
    createDiscoveryProfile: <T>(payload: unknown) =>
      postJson<T>("/maintenance/discovery/profiles", payload),
    getDiscoveryProfile: <T>(profileId: string) =>
      getJson<T>(`/maintenance/discovery/profiles/${profileId}`),
    updateDiscoveryProfile: <T>(profileId: string, payload: unknown) =>
      patchJson<T>(`/maintenance/discovery/profiles/${profileId}`, payload),
    deleteDiscoveryProfile: <T>(profileId: string) =>
      deleteJson<T>(`/maintenance/discovery/profiles/${profileId}`),
    listDiscoveryClasses: <T>(params?: DiscoveryClassListQuery) =>
      getPaginated<T>("/maintenance/discovery/classes", {
        status: params?.status,
        page: params?.page,
        pageSize: params?.pageSize,
      }),
    createDiscoveryClass: <T>(payload: unknown) =>
      postJson<T>("/maintenance/discovery/classes", payload),
    getDiscoveryClass: <T>(classKey: string) =>
      getJson<T>(`/maintenance/discovery/classes/${classKey}`),
    updateDiscoveryClass: <T>(classKey: string, payload: unknown) =>
      patchJson<T>(`/maintenance/discovery/classes/${classKey}`, payload),
    listDiscoveryMissions: <T>(params?: DiscoveryMissionListQuery) =>
      getPaginated<T>("/maintenance/discovery/missions", {
        status: params?.status,
        page: params?.page,
        pageSize: params?.pageSize,
      }),
    createDiscoveryMission: <T>(payload: unknown) =>
      postJson<T>("/maintenance/discovery/missions", payload),
    getDiscoveryMission: <T>(missionId: string) =>
      getJson<T>(`/maintenance/discovery/missions/${missionId}`),
    updateDiscoveryMission: <T>(missionId: string, payload: unknown) =>
      patchJson<T>(`/maintenance/discovery/missions/${missionId}`, payload),
    listDiscoveryRecallMissions: <T>(params?: DiscoveryRecallMissionListQuery) =>
      getPaginated<T>("/maintenance/discovery/recall-missions", {
        status: params?.status,
        missionKind: params?.missionKind,
        page: params?.page,
        pageSize: params?.pageSize,
      }),
    createDiscoveryRecallMission: <T>(payload: unknown) =>
      postJson<T>("/maintenance/discovery/recall-missions", payload),
    getDiscoveryRecallMission: <T>(recallMissionId: string) =>
      getJson<T>(`/maintenance/discovery/recall-missions/${recallMissionId}`),
    updateDiscoveryRecallMission: <T>(recallMissionId: string, payload: unknown) =>
      patchJson<T>(`/maintenance/discovery/recall-missions/${recallMissionId}`, payload),
    requestDiscoveryRecallMissionAcquire: <T>(recallMissionId: string) =>
      postJson<T>(`/maintenance/discovery/recall-missions/${recallMissionId}/acquire`, {}),
    compileDiscoveryMissionGraph: <T>(missionId: string, payload?: unknown) =>
      postJson<T>(`/maintenance/discovery/missions/${missionId}/compile-graph`, payload ?? {}),
    runDiscoveryMission: <T>(missionId: string, payload?: unknown) =>
      postJson<T>(`/maintenance/discovery/missions/${missionId}/run`, payload ?? {}),
    listDiscoveryCandidates: <T>(params?: DiscoveryCandidateListQuery) =>
      getPaginated<T>("/maintenance/discovery/candidates", {
        missionId: params?.missionId,
        status: params?.status,
        providerType: params?.providerType,
        page: params?.page,
        pageSize: params?.pageSize,
      }),
    getDiscoveryCandidate: <T>(candidateId: string) =>
      getJson<T>(`/maintenance/discovery/candidates/${candidateId}`),
    updateDiscoveryCandidate: <T>(candidateId: string, payload: unknown) =>
      patchJson<T>(`/maintenance/discovery/candidates/${candidateId}`, payload),
    listDiscoveryRecallCandidates: <T>(params?: DiscoveryRecallCandidateListQuery) =>
      getPaginated<T>("/maintenance/discovery/recall-candidates", {
        recallMissionId: params?.recallMissionId,
        status: params?.status,
        providerType: params?.providerType,
        canonicalDomain: params?.canonicalDomain,
        page: params?.page,
        pageSize: params?.pageSize,
      }),
    createDiscoveryRecallCandidate: <T>(payload: unknown) =>
      postJson<T>("/maintenance/discovery/recall-candidates", payload),
    getDiscoveryRecallCandidate: <T>(recallCandidateId: string) =>
      getJson<T>(`/maintenance/discovery/recall-candidates/${recallCandidateId}`),
    updateDiscoveryRecallCandidate: <T>(recallCandidateId: string, payload: unknown) =>
      patchJson<T>(`/maintenance/discovery/recall-candidates/${recallCandidateId}`, payload),
    promoteDiscoveryRecallCandidate: <T>(recallCandidateId: string, payload?: unknown) =>
      postJson<T>(
        `/maintenance/discovery/recall-candidates/${recallCandidateId}/promote`,
        payload ?? {}
      ),
    listDiscoveryHypotheses: <T>(params?: DiscoveryHypothesisListQuery) =>
      getPaginated<T>("/maintenance/discovery/hypotheses", {
        missionId: params?.missionId,
        status: params?.status,
        page: params?.page,
        pageSize: params?.pageSize,
      }),
    getDiscoveryHypothesis: <T>(hypothesisId: string) =>
      getJson<T>(`/maintenance/discovery/hypotheses/${hypothesisId}`),
    listDiscoverySourceProfiles: <T>(params?: DiscoverySourceProfileListQuery) =>
      getPaginated<T>("/maintenance/discovery/source-profiles", {
        minTrustScore: params?.minTrustScore,
        sourceType: params?.sourceType,
        page: params?.page,
        pageSize: params?.pageSize,
      }),
    getDiscoverySourceProfile: <T>(sourceProfileId: string) =>
      getJson<T>(`/maintenance/discovery/source-profiles/${sourceProfileId}`),
    listDiscoverySourceInterestScores: <T>(params?: DiscoverySourceInterestScoreListQuery) =>
      getPaginated<T>("/maintenance/discovery/source-interest-scores", {
        missionId: params?.missionId,
        channelId: params?.channelId,
        minScore: params?.minScore,
        page: params?.page,
        pageSize: params?.pageSize,
      }),
    getDiscoverySourceInterestScore: <T>(scoreId: string) =>
      getJson<T>(`/maintenance/discovery/source-interest-scores/${scoreId}`),
    getDiscoveryMissionPortfolio: <T>(missionId: string) =>
      getJson<T>(`/maintenance/discovery/missions/${missionId}/portfolio`),
    listDiscoveryFeedback: <T>(params?: DiscoveryFeedbackListQuery) =>
      getPaginated<T>("/maintenance/discovery/feedback", {
        missionId: params?.missionId,
        page: params?.page,
        pageSize: params?.pageSize,
      }),
    createDiscoveryFeedback: <T>(payload: unknown) =>
      postJson<T>("/maintenance/discovery/feedback", payload),
    reEvaluateDiscoverySources: <T>(payload?: unknown) =>
      postJson<T>("/maintenance/discovery/re-evaluate", payload ?? {}),
    getDiscoveryCostSummary: <T>() =>
      getJson<T>("/maintenance/discovery/costs/summary"),
    getLlmUsageSummary: <T>() => getJson<T>("/maintenance/llm-usage-summary"),
    getLlmBudgetSummary: <T>() => getJson<T>("/maintenance/llm-budget-summary"),
    listReindexJobs: <T>() => getJson<T>("/maintenance/reindex-jobs"),
    listReindexJobsPage: <T>(params?: PaginationQuery) =>
      getPaginated<T>("/maintenance/reindex-jobs", {
        page: params?.page,
        pageSize: params?.pageSize,
      }),
    listNotifications: <T>(userId: string) => getJson<T>(`/users/${userId}/notifications`),
    listNotificationsPage: <T>(userId: string, params?: PaginationQuery) =>
      getPaginated<T>(`/users/${userId}/notifications`, {
        page: params?.page,
        pageSize: params?.pageSize,
      }),
    listMatches: <T>(userId: string) => getJson<T>(`/users/${userId}/matches`),
    listMatchesPage: <T>(userId: string, params?: WebContentListQuery) =>
      getPaginated<T>(`/users/${userId}/matches`, {
        page: params?.page,
        pageSize: params?.pageSize,
        sort: params?.sort,
        q: params?.q?.trim() || undefined,
      }),
    listInterests: <T>(userId: string) => getJson<T>(`/users/${userId}/interests`),
    listInterestsPage: <T>(userId: string, params?: PaginationQuery) =>
      getPaginated<T>(`/users/${userId}/interests`, {
        page: params?.page,
        pageSize: params?.pageSize,
      }),
  };
}

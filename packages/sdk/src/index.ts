import type { PaginatedResponse, PaginationQuery } from "../../contracts/src/pagination.ts";

export interface NewsPortalSdkOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
}

type QueryValue = string | number | boolean | null | undefined;
type ChannelListQuery = PaginationQuery & { providerType?: string };
type FetchRunsQuery = PaginationQuery & { channelId?: string };

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

  async function getJson<T>(path: string, query?: Record<string, QueryValue>): Promise<T> {
    const response = await baseFetch(`${baseUrl}${buildPath(path, query)}`);
    if (!response.ok) {
      throw new Error(`Request failed with ${response.status} ${response.statusText}.`);
    }
    return (await response.json()) as T;
  }

  async function getPaginated<T>(
    path: string,
    params?: Record<string, QueryValue>
  ): Promise<PaginatedResponse<T>> {
    return getJson<PaginatedResponse<T>>(path, params);
  }

  return {
    listArticles: <T>() => getJson<T>("/articles"),
    listArticlesPage: <T>(params?: PaginationQuery) =>
      getPaginated<T>("/articles", {
        page: params?.page,
        pageSize: params?.pageSize,
      }),
    listFeedArticles: <T>(params?: PaginationQuery) =>
      getPaginated<T>("/feed", {
        page: params?.page,
        pageSize: params?.pageSize,
      }),
    getArticle: <T>(docId: string) => getJson<T>(`/articles/${docId}`),
    getArticleExplain: <T>(docId: string) => getJson<T>(`/articles/${docId}/explain`),
    getDashboardSummary: <T>() => getJson<T>("/dashboard/summary"),
    listChannels: <T>() => getJson<T>("/channels"),
    listChannelsPage: <T>(params?: ChannelListQuery) =>
      getPaginated<T>("/channels", {
        page: params?.page,
        pageSize: params?.pageSize,
        providerType: params?.providerType,
      }),
    getChannel: <T>(channelId: string) => getJson<T>(`/channels/${channelId}`),
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
    listInterestTemplates: <T>() => getJson<T>("/templates/interests"),
    listInterestTemplatesPage: <T>(params?: PaginationQuery) =>
      getPaginated<T>("/templates/interests", {
        page: params?.page,
        pageSize: params?.pageSize,
      }),
    getInterestTemplate: <T>(interestTemplateId: string) =>
      getJson<T>(`/templates/interests/${interestTemplateId}`),
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
    getLlmUsageSummary: <T>() => getJson<T>("/maintenance/llm-usage-summary"),
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
    listInterests: <T>(userId: string) => getJson<T>(`/users/${userId}/interests`),
    listInterestsPage: <T>(userId: string, params?: PaginationQuery) =>
      getPaginated<T>(`/users/${userId}/interests`, {
        page: params?.page,
        pageSize: params?.pageSize,
      }),
  };
}

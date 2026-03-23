export interface NewsPortalSdkOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
}

export function createNewsPortalSdk(options: NewsPortalSdkOptions) {
  const baseFetch = options.fetchImpl ?? fetch;
  const baseUrl = options.baseUrl.replace(/\/$/, "");

  async function getJson<T>(path: string): Promise<T> {
    const response = await baseFetch(`${baseUrl}${path}`);
    if (!response.ok) {
      throw new Error(`Request failed with ${response.status} ${response.statusText}.`);
    }
    return (await response.json()) as T;
  }

  return {
    listArticles: <T>() => getJson<T>("/articles"),
    getArticle: <T>(docId: string) => getJson<T>(`/articles/${docId}`),
    getArticleExplain: <T>(docId: string) => getJson<T>(`/articles/${docId}/explain`),
    getDashboardSummary: <T>() => getJson<T>("/dashboard/summary"),
    listChannels: <T>() => getJson<T>("/channels"),
    listClusters: <T>() => getJson<T>("/clusters"),
    listLlmTemplates: <T>() => getJson<T>("/templates/llm"),
    listInterestTemplates: <T>() => getJson<T>("/templates/interests"),
    listFetchRuns: <T>(channelId?: string) =>
      getJson<T>(
        channelId
          ? `/maintenance/fetch-runs?channel_id=${encodeURIComponent(channelId)}`
          : "/maintenance/fetch-runs"
      ),
    listLlmReviews: <T>() => getJson<T>("/maintenance/llm-reviews"),
    getLlmUsageSummary: <T>() => getJson<T>("/maintenance/llm-usage-summary"),
    listReindexJobs: <T>() => getJson<T>("/maintenance/reindex-jobs"),
    listNotifications: <T>(userId: string) => getJson<T>(`/users/${userId}/notifications`),
    listInterests: <T>(userId: string) => getJson<T>(`/users/${userId}/interests`)
  };
}

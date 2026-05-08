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
type ArticleResidualListQuery = PaginationQuery & {
  downstreamLossBucket?: string;
  selectionBlockerStage?: string;
  selectionBlockerReason?: string;
  selectionMode?: string;
  verificationState?: string;
  processingState?: string;
  observationState?: string;
  duplicateKind?: string;
  q?: string;
};
type WebResourceListQuery = PaginationQuery & {
  channelId?: string;
  extractionState?: string;
  projection?: string;
  resourceKind?: string;
  entityType?: string;
  entityText?: string;
  entityNormalizedKey?: string;
  labelType?: string;
  labelKey?: string;
  contentFilterPassed?: boolean;
  contentFilterDecision?: string;
};
type ContentAnalysisListQuery = PaginationQuery & {
  subjectType?: string;
  subjectId?: string;
  analysisType?: string;
  status?: string;
};
type ContentAnalysisPolicyListQuery = PaginationQuery & {
  module?: string;
};
type ContentEntityListQuery = PaginationQuery & {
  subjectType?: string;
  subjectId?: string;
  entityType?: string;
  entityText?: string;
  normalizedKey?: string;
};
type ContentLabelListQuery = PaginationQuery & {
  subjectType?: string;
  subjectId?: string;
  labelType?: string;
  labelKey?: string;
  decision?: string;
};
type ContentFilterResultListQuery = PaginationQuery & {
  subjectType?: string;
  subjectId?: string;
  policyKey?: string;
  decision?: string;
  passed?: boolean;
};
type DiscoveryV3ListQuery = PaginationQuery & {
  status?: string;
  targetId?: string;
};

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

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function formatApiErrorDetail(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        const record = asRecord(entry);
        if (!record) {
          return String(entry);
        }
        const location = Array.isArray(record.loc) ? record.loc.join(".") : "";
        const message = typeof record.msg === "string" ? record.msg : JSON.stringify(record);
        return location ? `${location}: ${message}` : message;
      })
      .join("; ");
  }
  const record = asRecord(value);
  return record ? JSON.stringify(record) : String(value ?? "");
}

async function buildRequestError(response: Response): Promise<Error> {
  const bodyText = await response.text().catch(() => "");
  let detail = "";
  if (bodyText.trim()) {
    try {
      const payload = JSON.parse(bodyText) as unknown;
      const record = asRecord(payload);
      detail = formatApiErrorDetail(record?.detail ?? record?.error ?? payload);
    } catch {
      detail = bodyText.trim();
    }
  }
  const suffix = detail ? ` ${detail}` : "";
  return new Error(`Request failed with ${response.status} ${response.statusText}.${suffix}`);
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
      throw await buildRequestError(response);
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
    listContentItemsPage: <T>(params?: WebContentListQuery) =>
      getPaginated<T>("/content-items", {
        page: params?.page,
        pageSize: params?.pageSize,
        sort: params?.sort,
        q: params?.q?.trim() || undefined,
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
    listArticleResidualsPage: <T>(params?: ArticleResidualListQuery) =>
      getPaginated<T>("/maintenance/articles/residuals", {
        page: params?.page,
        pageSize: params?.pageSize,
        downstreamLossBucket: params?.downstreamLossBucket,
        selectionBlockerStage: params?.selectionBlockerStage,
        selectionBlockerReason: params?.selectionBlockerReason,
        selectionMode: params?.selectionMode,
        verificationState: params?.verificationState,
        processingState: params?.processingState,
        observationState: params?.observationState,
        duplicateKind: params?.duplicateKind,
        q: params?.q?.trim() || undefined,
      }),
    getArticleResidualSummary: <T>(params?: Omit<ArticleResidualListQuery, "page" | "pageSize">) =>
      getJson<T>("/maintenance/articles/residuals/summary", {
        downstreamLossBucket: params?.downstreamLossBucket,
        selectionBlockerStage: params?.selectionBlockerStage,
        selectionBlockerReason: params?.selectionBlockerReason,
        selectionMode: params?.selectionMode,
        verificationState: params?.verificationState,
        processingState: params?.processingState,
        observationState: params?.observationState,
        duplicateKind: params?.duplicateKind,
        q: params?.q?.trim() || undefined,
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
    retrySequenceRun: <T>(runId: string, payload?: unknown) =>
      postJson<T>(
        `/maintenance/sequence-runs/${encodeURIComponent(runId)}/retry`,
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
        entityType: params?.entityType,
        entityText: params?.entityText,
        entityNormalizedKey: params?.entityNormalizedKey,
        labelType: params?.labelType,
        labelKey: params?.labelKey,
        contentFilterPassed: params?.contentFilterPassed,
        contentFilterDecision: params?.contentFilterDecision,
      }),
    getWebResource: <T>(resourceId: string) =>
      getJson<T>(`/maintenance/web-resources/${encodeURIComponent(resourceId)}`),
    listContentAnalysisResultsPage: <T>(params?: ContentAnalysisListQuery) =>
      getPaginated<T>("/maintenance/content-analysis", {
        page: params?.page,
        pageSize: params?.pageSize,
        subjectType: params?.subjectType,
        subjectId: params?.subjectId,
        analysisType: params?.analysisType,
        status: params?.status,
      }),
    getContentAnalysisResult: <T>(analysisId: string) =>
      getJson<T>(`/maintenance/content-analysis/${encodeURIComponent(analysisId)}`),
    requestContentAnalysisBackfill: <T>(payload?: unknown) =>
      postJson<T>("/maintenance/content-analysis/backfill", payload ?? {}),
    listContentAnalysisPoliciesPage: <T>(params?: ContentAnalysisPolicyListQuery) =>
      getPaginated<T>("/maintenance/content-analysis-policies", {
        page: params?.page,
        pageSize: params?.pageSize,
        module: params?.module,
      }),
    getContentAnalysisPolicy: <T>(policyId: string) =>
      getJson<T>(`/maintenance/content-analysis-policies/${encodeURIComponent(policyId)}`),
    createContentAnalysisPolicy: <T>(payload: unknown) =>
      postJson<T>("/maintenance/content-analysis-policies", payload),
    updateContentAnalysisPolicy: <T>(policyId: string, payload: unknown) =>
      patchJson<T>(
        `/maintenance/content-analysis-policies/${encodeURIComponent(policyId)}`,
        payload
      ),
    listContentEntitiesPage: <T>(params?: ContentEntityListQuery) =>
      getPaginated<T>("/maintenance/content-entities", {
        page: params?.page,
        pageSize: params?.pageSize,
        subjectType: params?.subjectType,
        subjectId: params?.subjectId,
        entityType: params?.entityType,
        entityText: params?.entityText,
        normalizedKey: params?.normalizedKey,
      }),
    listContentLabelsPage: <T>(params?: ContentLabelListQuery) =>
      getPaginated<T>("/maintenance/content-labels", {
        page: params?.page,
        pageSize: params?.pageSize,
        subjectType: params?.subjectType,
        subjectId: params?.subjectId,
        labelType: params?.labelType,
        labelKey: params?.labelKey,
        decision: params?.decision,
      }),
    listContentFilterPoliciesPage: <T>(params?: PaginationQuery) =>
      getPaginated<T>("/maintenance/content-filter-policies", {
        page: params?.page,
        pageSize: params?.pageSize,
      }),
    getContentFilterPolicy: <T>(filterPolicyId: string) =>
      getJson<T>(`/maintenance/content-filter-policies/${encodeURIComponent(filterPolicyId)}`),
    createContentFilterPolicy: <T>(payload: unknown) =>
      postJson<T>("/maintenance/content-filter-policies", payload),
    updateContentFilterPolicy: <T>(filterPolicyId: string, payload: unknown) =>
      patchJson<T>(
        `/maintenance/content-filter-policies/${encodeURIComponent(filterPolicyId)}`,
        payload
      ),
    previewContentFilterPolicy: <T>(filterPolicyId: string, payload?: unknown) =>
      postJson<T>(
        `/maintenance/content-filter-policies/${encodeURIComponent(filterPolicyId)}/preview`,
        payload ?? {}
      ),
    listContentFilterResultsPage: <T>(params?: ContentFilterResultListQuery) =>
      getPaginated<T>("/maintenance/content-filter-results", {
        page: params?.page,
        pageSize: params?.pageSize,
        subjectType: params?.subjectType,
        subjectId: params?.subjectId,
        policyKey: params?.policyKey,
        decision: params?.decision,
        passed: params?.passed,
      }),
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
    listDiscoveryAutopilotProfiles: <T>() =>
      getJson<T>("/maintenance/discovery/autopilot-profiles"),
    simplifyDiscoveryConfig: <T>(payload: unknown) =>
      postJson<T>("/maintenance/discovery/config/simplify", payload),
    listDiscoveryTargets: <T>(params?: DiscoveryV3ListQuery) =>
      getPaginated<T>("/maintenance/discovery/targets", {
        status: params?.status,
        page: params?.page,
        pageSize: params?.pageSize,
      }),
    createDiscoveryTarget: <T>(payload: unknown) =>
      postJson<T>("/maintenance/discovery/targets", payload),
    createSimpleDiscoveryTarget: <T>(payload: unknown) =>
      postJson<T>("/maintenance/discovery/targets/create-simple", payload),
    getDiscoveryTarget: <T>(targetId: string) =>
      getJson<T>(`/maintenance/discovery/targets/${targetId}`),
    updateDiscoveryTarget: <T>(targetId: string, payload: unknown) =>
      patchJson<T>(`/maintenance/discovery/targets/${targetId}`, payload),
    getDiscoveryTargetCoverage: <T>(targetId: string) =>
      getJson<T>(`/maintenance/discovery/targets/${targetId}/coverage`),
    explainDiscoveryTargetCoverage: <T>(targetId: string) =>
      getJson<T>(`/maintenance/discovery/targets/${targetId}/coverage/explain`),
    refreshDiscoveryTargetCoverage: <T>(targetId: string) =>
      postJson<T>(`/maintenance/discovery/targets/${targetId}/refresh-coverage`, {}),
    createDiscoveryRun: <T>(payload: unknown) =>
      postJson<T>("/maintenance/discovery/runs", payload),
    listDiscoveryRuns: <T>(params?: DiscoveryV3ListQuery) =>
      getPaginated<T>("/maintenance/discovery/runs", {
        status: params?.status,
        targetId: params?.targetId,
        page: params?.page,
        pageSize: params?.pageSize,
      }),
    getDiscoveryRun: <T>(runId: string) =>
      getJson<T>(`/maintenance/discovery/runs/${runId}`),
    diagnoseDiscoveryRun: <T>(runId: string) =>
      postJson<T>(`/maintenance/discovery/runs/${runId}/diagnose`, {}),
    cancelDiscoveryRun: <T>(runId: string) =>
      postJson<T>(`/maintenance/discovery/runs/${runId}/cancel`, {}),
    listDiscoveryEndpoints: <T>(params?: DiscoveryV3ListQuery) =>
      getPaginated<T>("/maintenance/discovery/endpoints", {
        status: params?.status,
        targetId: params?.targetId,
        page: params?.page,
        pageSize: params?.pageSize,
      }),
    getDiscoveryEndpoint: <T>(endpointId: string) =>
      getJson<T>(`/maintenance/discovery/endpoints/${endpointId}`),
    explainDiscoveryEndpoint: <T>(endpointId: string) =>
      getJson<T>(`/maintenance/discovery/endpoints/${endpointId}/explain`),
    listDiscoveryHypotheses: <T>(params?: DiscoveryV3ListQuery) =>
      getPaginated<T>("/maintenance/discovery/hypotheses", {
        status: params?.status,
        targetId: params?.targetId,
        page: params?.page,
        pageSize: params?.pageSize,
      }),
    getDiscoveryHypothesis: <T>(hypothesisId: string) =>
      getJson<T>(`/maintenance/discovery/hypotheses/${hypothesisId}`),
    listDiscoveryDomains: <T>(params?: DiscoveryV3ListQuery) =>
      getPaginated<T>("/maintenance/discovery/domains", {
        targetId: params?.targetId,
        page: params?.page,
        pageSize: params?.pageSize,
      }),
    getDiscoveryDomain: <T>(domainId: string) =>
      getJson<T>(`/maintenance/discovery/domains/${domainId}`),
    listDiscoveryActions: <T>(params?: DiscoveryV3ListQuery) =>
      getPaginated<T>("/maintenance/discovery/actions", {
        status: params?.status,
        targetId: params?.targetId,
        page: params?.page,
        pageSize: params?.pageSize,
      }),
    getDiscoveryAction: <T>(actionId: string) =>
      getJson<T>(`/maintenance/discovery/actions/${actionId}`),
    promoteDiscoveryEndpoint: <T>(endpointId: string, payload?: unknown) =>
      postJson<T>(`/maintenance/discovery/endpoints/${endpointId}/promote`, payload ?? {}),
    rejectDiscoveryEndpoint: <T>(endpointId: string, payload?: unknown) =>
      postJson<T>(`/maintenance/discovery/endpoints/${endpointId}/reject`, payload ?? {}),
    expandDiscoveryEndpoint: <T>(endpointId: string, payload?: unknown) =>
      postJson<T>(`/maintenance/discovery/endpoints/${endpointId}/expand`, payload ?? {}),
    markDiscoveryEndpointDuplicate: <T>(endpointId: string, payload?: unknown) =>
      postJson<T>(`/maintenance/discovery/endpoints/${endpointId}/mark-duplicate`, payload ?? {}),
    listDiscoveryContracts: <T>(params?: DiscoveryV3ListQuery) =>
      getPaginated<T>("/maintenance/discovery/contracts", {
        status: params?.status,
        targetId: params?.targetId,
        page: params?.page,
        pageSize: params?.pageSize,
      }),
    getDiscoveryContract: <T>(contractId: string) =>
      getJson<T>(`/maintenance/discovery/contracts/${contractId}`),
    evaluateDiscoveryContract: <T>(contractId: string, payload?: unknown) =>
      postJson<T>(`/maintenance/discovery/contracts/${contractId}/evaluate`, payload ?? {}),
    listDiscoveryClaims: <T>(params?: DiscoveryV3ListQuery) =>
      getPaginated<T>("/maintenance/discovery/claims", {
        status: params?.status,
        targetId: params?.targetId,
        page: params?.page,
        pageSize: params?.pageSize,
      }),
    getDiscoveryClaim: <T>(claimId: string) =>
      getJson<T>(`/maintenance/discovery/claims/${claimId}`),
    listDiscoveryNegativeEvidence: <T>(params?: DiscoveryV3ListQuery) =>
      getPaginated<T>("/maintenance/discovery/negative-evidence", {
        status: params?.status,
        targetId: params?.targetId,
        page: params?.page,
        pageSize: params?.pageSize,
      }),
    getDiscoveryNegativeEvidence: <T>(negativeEvidenceId: string) =>
      getJson<T>(`/maintenance/discovery/negative-evidence/${negativeEvidenceId}`),
    clearDiscoveryNegativeEvidenceCooldown: <T>(negativeEvidenceId: string) =>
      postJson<T>(
        `/maintenance/discovery/negative-evidence/${negativeEvidenceId}/clear-cooldown`,
        {}
      ),
    listDiscoveryProviderHealth: <T>(params?: DiscoveryV3ListQuery) =>
      getPaginated<T>("/maintenance/discovery/provider-health", {
        page: params?.page,
        pageSize: params?.pageSize,
      }),
    getDiscoveryProviderHealth: <T>(providerId: string) =>
      getJson<T>(`/maintenance/discovery/provider-health/${providerId}`),
    repairDiscoveryProvider: <T>(providerId: string, payload?: unknown) =>
      postJson<T>(`/maintenance/discovery/providers/${providerId}/repair`, payload ?? {}),
    listDiscoveryIdentities: <T>(params?: DiscoveryV3ListQuery) =>
      getPaginated<T>("/maintenance/discovery/identities", {
        page: params?.page,
        pageSize: params?.pageSize,
      }),
    getDiscoveryIdentity: <T>(identityId: string) =>
      getJson<T>(`/maintenance/discovery/identities/${identityId}`),
    listDiscoveryEvalRuns: <T>(params?: DiscoveryV3ListQuery) =>
      getPaginated<T>("/maintenance/discovery/eval-runs", {
        targetId: params?.targetId,
        page: params?.page,
        pageSize: params?.pageSize,
      }),
    getDiscoveryEvalRun: <T>(evalRunId: string) =>
      getJson<T>(`/maintenance/discovery/eval-runs/${evalRunId}`),
    listDiscoveryEvalSuites: <T>(params?: DiscoveryV3ListQuery) =>
      getPaginated<T>("/maintenance/discovery/eval-suites", {
        page: params?.page,
        pageSize: params?.pageSize,
      }),
    getDiscoveryEvalSuite: <T>(evalSuiteId: string) =>
      getJson<T>(`/maintenance/discovery/eval-suites/${evalSuiteId}`),
    runDiscoveryEvalSuite: <T>(evalSuiteId: string, payload?: unknown) =>
      postJson<T>(`/maintenance/discovery/eval-suites/${evalSuiteId}/run`, payload ?? {}),
    listDiscoveryLlmDecisions: <T>(params?: DiscoveryV3ListQuery) =>
      getPaginated<T>("/maintenance/discovery/llm-decisions", {
        status: params?.status,
        targetId: params?.targetId,
        page: params?.page,
        pageSize: params?.pageSize,
      }),
    getDiscoveryLlmDecision: <T>(decisionId: string) =>
      getJson<T>(`/maintenance/discovery/llm-decisions/${decisionId}`),
    expandExistingDiscoverySource: <T>(channelId: string, payload: unknown) =>
      postJson<T>(`/maintenance/discovery/sources/${channelId}/expand`, payload),
    replaceDiscoverySourceCandidates: <T>(channelId: string, payload: unknown) =>
      postJson<T>(`/maintenance/discovery/sources/${channelId}/replace-candidates`, payload),
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

import type { Pool } from "pg";
import { randomUUID } from "node:crypto";

import type { ApiAdapterAccessKind, ApiAdapterKey, ApiAdapterResearchMode } from "@newsportal/contracts";

export const SOURCE_ROLE_KEYS = [
  "rss_web",
  "project_marketplace",
  "ats_job_board",
  "remote_job_board",
  "community_search",
  "forum_support",
  "procurement",
  "closed_professional_network",
  "indirect_aggregator",
] as const;

export type SourceRoleKey = (typeof SOURCE_ROLE_KEYS)[number];

export interface SourceRolePlanInput {
  objective?: string;
  rareSignal?: boolean;
  includeResearchOnly?: boolean;
}

export interface AdapterResearchInput {
  objective?: string;
  sourceRoles?: string[];
  platforms?: string[];
  includeResearchOnly?: boolean;
  maxCandidates?: number;
  requestedBy?: string;
}

export interface IndirectTargetInput {
  objective?: string;
  platforms?: string[];
  queryTerms?: string[];
  maxQueries?: number;
  requestedBy?: string;
}

export interface IndirectTargetChannelPlanInput {
  searchProvider?:
    | "ddgs_search"
    | "searxng_search"
    | "brave_search"
    | "tavily_search"
    | "exa_search"
    | "serpapi_google_news_research";
  baseUrl?: string;
  endpointIds?: string[];
  maxChannels?: number;
  locale?: string;
  timeRange?: string;
  includeHighRisk?: boolean;
}

export interface AdapterResearchCandidate {
  platform: string;
  sourceRole: SourceRoleKey;
  providerType: "api" | "rss" | "website" | "search";
  adapterKey: ApiAdapterKey | null;
  researchMode: ApiAdapterResearchMode;
  accessKind: ApiAdapterAccessKind;
  endpointUrl: string;
  homepageUrl: string;
  title: string;
  description: string;
  docsUrls: string[];
  githubEvidence: string[];
  tosRisk: "low" | "medium" | "high" | "unknown";
  requiresProductionReplacement: boolean;
  defaultPollingAllowed: boolean;
  notes: string[];
}

export interface SourceRoleCoverageRow {
  sourceRole: SourceRoleKey | "unknown";
  channels: number;
  activeChannels: number;
  apiChannels: number;
  rssChannels: number;
  websiteChannels: number;
  adapterChannels: number;
  researchOnlyChannels: number;
  candidateEndpoints: number;
  detectOnlyEndpoints: number;
  adapterRequiredEndpoints: number;
  accessRequiredEndpoints: number;
  workingChannels: number;
  brokenChannels: number;
  examples: Array<Record<string, unknown>>;
}

const SOURCE_ROLE_DEFINITIONS: Record<SourceRoleKey, { title: string; reason: string }> = {
  rss_web: {
    title: "RSS and website feeds",
    reason: "baseline open-web acquisition for news, blogs, procurement pages, and public updates",
  },
  project_marketplace: {
    title: "Project marketplaces",
    reason: "direct buyer/project listings and budget/scope evidence often live outside RSS feeds",
  },
  ats_job_board: {
    title: "ATS job boards",
    reason: "capacity-gap and implementation-team signals usually require job-board APIs, not generic feeds",
  },
  remote_job_board: {
    title: "Remote job boards",
    reason: "remote contract/freelance roles can expose external capacity and project-staffing signals",
  },
  community_search: {
    title: "Community search",
    reason: "hidden rare signals often appear as questions, asks, and discussion threads",
  },
  forum_support: {
    title: "Forum and support communities",
    reason: "integration, migration, no-code ceiling, and platform-pain signals are usually support/forum items",
  },
  procurement: {
    title: "Procurement and awards",
    reason: "formal demand, RFI/RFP, awards, and subcontract opportunity are authoritative direct signals",
  },
  closed_professional_network: {
    title: "Closed professional networks",
    reason: "some high-signal platforms require access and should be explicit gaps, not fake RSS rows",
  },
  indirect_aggregator: {
    title: "Indirect aggregators",
    reason: "search/news/site-query feeds can observe closed or API-gapped platforms without pretending to be direct coverage",
  },
};

const ADAPTER_RESEARCH_CATALOG: AdapterResearchCandidate[] = [
  {
    platform: "Hacker News Algolia",
    sourceRole: "community_search",
    providerType: "api",
    adapterKey: "hn_algolia_search",
    researchMode: "production",
    accessKind: "official_free",
    endpointUrl: "https://hn.algolia.com/api/v1/search_by_date?query=",
    homepageUrl: "https://hn.algolia.com/api",
    title: "HN Algolia Search API",
    description: "Public Hacker News search API suitable for Ask HN, hiring, paid-help, and product-pain queries.",
    docsUrls: ["https://hn.algolia.com/api"],
    githubEvidence: [],
    tosRisk: "low",
    requiresProductionReplacement: false,
    defaultPollingAllowed: true,
    notes: ["Use query-specific API channels; selection remains article-level and source-independent."],
  },
  {
    platform: "GitHub Issues",
    sourceRole: "community_search",
    providerType: "api",
    adapterKey: "github_issues_search",
    researchMode: "production",
    accessKind: "official_free",
    endpointUrl: "https://api.github.com/search/issues?q=",
    homepageUrl: "https://docs.github.com/rest/search/search",
    title: "GitHub Issues Search API",
    description: "Official public search API for issues/discussions-like implementation blockers, paid feature asks, bounties, and migration pain.",
    docsUrls: ["https://docs.github.com/rest/search/search"],
    githubEvidence: ["https://docs.github.com/rest/search/search"],
    tosRisk: "low",
    requiresProductionReplacement: false,
    defaultPollingAllowed: true,
    notes: ["Unauthenticated access is rate-limited; use optional operator-provided auth for higher production volume."],
  },
  {
    platform: "Stack Exchange",
    sourceRole: "community_search",
    providerType: "api",
    adapterKey: "stack_exchange_search",
    researchMode: "production",
    accessKind: "official_free",
    endpointUrl: "https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=creation&site=stackoverflow&q=",
    homepageUrl: "https://api.stackexchange.com/",
    title: "Stack Exchange API Search",
    description: "Official API for technical questions, including bounties and implementation blockers.",
    docsUrls: ["https://api.stackexchange.com/docs"],
    githubEvidence: [],
    tosRisk: "low",
    requiresProductionReplacement: false,
    defaultPollingAllowed: true,
    notes: ["Avoid representing Stack Exchange as RSS when API polling is available."],
  },
  {
    platform: "Greenhouse",
    sourceRole: "ats_job_board",
    providerType: "api",
    adapterKey: "greenhouse_job_board",
    researchMode: "production",
    accessKind: "official_free",
    endpointUrl: "https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs",
    homepageUrl: "https://developer.greenhouse.io/job-board.html",
    title: "Greenhouse Job Board API",
    description: "Official public board API for company-level hiring/capacity-gap channels.",
    docsUrls: ["https://developer.greenhouse.io/job-board.html"],
    githubEvidence: [],
    tosRisk: "low",
    requiresProductionReplacement: false,
    defaultPollingAllowed: true,
    notes: ["Requires company board token discovery/configuration before onboarding."],
  },
  {
    platform: "Lever",
    sourceRole: "ats_job_board",
    providerType: "api",
    adapterKey: "lever_postings",
    researchMode: "production",
    accessKind: "official_free",
    endpointUrl: "https://api.lever.co/v0/postings/{company}?mode=json",
    homepageUrl: "https://github.com/lever/postings-api",
    title: "Lever Postings API",
    description: "Public JSON postings endpoint for company hiring/capacity-gap channels.",
    docsUrls: ["https://github.com/lever/postings-api"],
    githubEvidence: ["https://github.com/lever/postings-api"],
    tosRisk: "low",
    requiresProductionReplacement: false,
    defaultPollingAllowed: true,
    notes: ["Requires company slug discovery/configuration before onboarding."],
  },
  {
    platform: "Ashby",
    sourceRole: "ats_job_board",
    providerType: "api",
    adapterKey: "ashby_job_postings",
    researchMode: "production",
    accessKind: "official_free",
    endpointUrl: "https://api.ashbyhq.com/posting-api/job-board/{organization}",
    homepageUrl: "https://developers.ashbyhq.com/docs/public-job-posting-api",
    title: "Ashby Public Job Posting API",
    description: "Official public job-board API for company hiring/capacity-gap channels.",
    docsUrls: ["https://developers.ashbyhq.com/docs/public-job-posting-api"],
    githubEvidence: [],
    tosRisk: "low",
    requiresProductionReplacement: false,
    defaultPollingAllowed: true,
    notes: ["Requires organization slug discovery/configuration before onboarding."],
  },
  {
    platform: "Remotive",
    sourceRole: "remote_job_board",
    providerType: "api",
    adapterKey: "remotive_jobs",
    researchMode: "production",
    accessKind: "official_free",
    endpointUrl: "https://remotive.com/api/remote-jobs",
    homepageUrl: "https://github.com/remotive-com/remote-jobs-api",
    title: "Remotive Remote Jobs API",
    description: "Free remote-jobs API for contract/freelance/capacity signals.",
    docsUrls: ["https://github.com/remotive-com/remote-jobs-api"],
    githubEvidence: ["https://github.com/remotive-com/remote-jobs-api"],
    tosRisk: "low",
    requiresProductionReplacement: false,
    defaultPollingAllowed: true,
    notes: ["Use query/category filters when possible to limit noise."],
  },
  {
    platform: "RemoteOK",
    sourceRole: "remote_job_board",
    providerType: "api",
    adapterKey: "remoteok_jobs",
    researchMode: "production",
    accessKind: "official_free",
    endpointUrl: "https://remoteok.com/api",
    homepageUrl: "https://remoteok.com/api",
    title: "RemoteOK API",
    description: "Public remote-job API that can expose contract and implementation capacity signals.",
    docsUrls: ["https://remoteok.com/api"],
    githubEvidence: [],
    tosRisk: "medium",
    requiresProductionReplacement: false,
    defaultPollingAllowed: true,
    notes: ["Poll politely; source noise is expected and should be filtered downstream."],
  },
  {
    platform: "We Work Remotely",
    sourceRole: "remote_job_board",
    providerType: "rss",
    adapterKey: "weworkremotely_rss",
    researchMode: "production",
    accessKind: "official_free",
    endpointUrl: "https://weworkremotely.com/remote-job-rss-feed",
    homepageUrl: "https://weworkremotely.com/remote-job-rss-feed",
    title: "We Work Remotely RSS",
    description: "Official RSS feed for remote roles; should be onboarded as RSS when possible.",
    docsUrls: ["https://weworkremotely.com/remote-job-rss-feed"],
    githubEvidence: [],
    tosRisk: "low",
    requiresProductionReplacement: false,
    defaultPollingAllowed: true,
    notes: ["Prefer providerType=rss; adapterKey exists only to keep role coverage explicit."],
  },
  {
    platform: "PeoplePerHour",
    sourceRole: "project_marketplace",
    providerType: "api",
    adapterKey: "peopleperhour_public_projects_research",
    researchMode: "research_only",
    accessKind: "github_unofficial_public",
    endpointUrl: "https://www.peopleperhour.com/freelance-jobs",
    homepageUrl: "https://www.peopleperhour.com/freelance-jobs",
    title: "PeoplePerHour public project search research",
    description: "Research-only unauthenticated public-page extraction for project listing proof.",
    docsUrls: [],
    githubEvidence: [],
    tosRisk: "high",
    requiresProductionReplacement: true,
    defaultPollingAllowed: true,
    notes: ["Use only in research mode; production needs provider approval or a certified access path."],
  },
  {
    platform: "Freelancer",
    sourceRole: "project_marketplace",
    providerType: "api",
    adapterKey: "freelancer_public_projects_research",
    researchMode: "research_only",
    accessKind: "github_unofficial_public",
    endpointUrl: "https://www.freelancer.com/jobs/",
    homepageUrl: "https://www.freelancer.com/jobs/",
    title: "Freelancer public project search research",
    description: "Research-only unauthenticated public-page extraction for project listing proof.",
    docsUrls: [],
    githubEvidence: [],
    tosRisk: "high",
    requiresProductionReplacement: true,
    defaultPollingAllowed: true,
    notes: ["Use only in research mode and bounded polling."],
  },
  {
    platform: "Upwork",
    sourceRole: "closed_professional_network",
    providerType: "search",
    adapterKey: "upwork_public_signal_research",
    researchMode: "research_only",
    accessKind: "github_unofficial_restricted",
    endpointUrl: "https://www.upwork.com/nx/search/jobs/",
    homepageUrl: "https://www.upwork.com/",
    title: "Upwork public signal research",
    description: "Access is often restricted; default product path should use indirect aggregators or explicit access approval.",
    docsUrls: ["https://support.upwork.com/hc/en-us/articles/43342677368467-Use-bots-and-other-automation-properly"],
    githubEvidence: [],
    tosRisk: "high",
    requiresProductionReplacement: true,
    defaultPollingAllowed: false,
    notes: ["Do not default-poll if login, cookies, CAPTCHA, or proxy is required."],
  },
  {
    platform: "LinkedIn",
    sourceRole: "closed_professional_network",
    providerType: "search",
    adapterKey: "linkedin_public_signal_research",
    researchMode: "research_only",
    accessKind: "closed_access",
    endpointUrl: "https://www.linkedin.com/jobs/",
    homepageUrl: "https://www.linkedin.com/",
    title: "LinkedIn public signal research",
    description: "Official API access is partner-scoped; default product path should use indirect aggregators or explicit access approval.",
    docsUrls: ["https://learn.microsoft.com/en-us/linkedin/talent/job-postings/api/overview"],
    githubEvidence: [],
    tosRisk: "high",
    requiresProductionReplacement: true,
    defaultPollingAllowed: false,
    notes: ["Record as access_required unless an approved public unauthenticated path is configured."],
  },
];

function uniqueStrings(values: unknown): string[] {
  if (!Array.isArray(values)) {
    return [];
  }
  return [...new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean))];
}

function requestedRoles(input: Pick<AdapterResearchInput, "sourceRoles">): Set<string> | null {
  const roles = uniqueStrings(input.sourceRoles);
  return roles.length > 0 ? new Set(roles) : null;
}

function requestedPlatforms(input: Pick<AdapterResearchInput, "platforms">): Set<string> | null {
  const platforms = uniqueStrings(input.platforms).map((platform) => platform.toLowerCase());
  return platforms.length > 0 ? new Set(platforms) : null;
}

function clampLimit(value: unknown, fallback: number, max: number): number {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(max, Math.trunc(parsed))) : fallback;
}

function matchesCatalog(candidate: AdapterResearchCandidate, input: AdapterResearchInput): boolean {
  const roles = requestedRoles(input);
  if (roles && !roles.has(candidate.sourceRole)) {
    return false;
  }
  const platforms = requestedPlatforms(input);
  if (platforms && !platforms.has(candidate.platform.toLowerCase())) {
    return false;
  }
  if (input.includeResearchOnly === false && candidate.researchMode === "research_only") {
    return false;
  }
  return true;
}

function normalizeUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    url.hash = "";
    return url.toString();
  } catch {
    return rawUrl.trim().toLowerCase();
  }
}

function domainFromUrl(rawUrl: string): string | null {
  try {
    return new URL(rawUrl).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function planSourceRoles(input: SourceRolePlanInput = {}) {
  const objective = String(input.objective ?? "").trim();
  const rareSignal = input.rareSignal ?? /rare|hidden|marketplace|community|forum|support|hiring|capacity|procurement/i.test(objective);
  const roles = SOURCE_ROLE_KEYS.map((sourceRole) => ({
    sourceRole,
    ...SOURCE_ROLE_DEFINITIONS[sourceRole],
    priority:
      rareSignal && ["project_marketplace", "community_search", "forum_support", "indirect_aggregator"].includes(sourceRole)
        ? "high"
        : "normal",
    directSelectionInfluence: false,
  }));
  return {
    objective: objective || null,
    rareSignal,
    roles,
    guidance: [
      "Many RSS/website channels do not prove thematic coverage when marketplace, ATS, community, or closed-network roles are absent.",
      "Source role and adapter status are acquisition diagnostics only; they cannot select, rank, escalate, or publish content.",
      "API/social/ATS/project-marketplace sources should be explicit adapter/access gaps instead of disguised RSS/website rows.",
    ],
    nextReadBack: ["discovery.source_roles.coverage", "discovery.adapter_research.plan"],
  };
}

export function planAdapterResearch(input: AdapterResearchInput = {}) {
  const limit = clampLimit(input.maxCandidates, 50, 100);
  const candidates = ADAPTER_RESEARCH_CATALOG.filter((candidate) => matchesCatalog(candidate, input)).slice(0, limit);
  return {
    objective: String(input.objective ?? "").trim() || null,
    generatedAt: new Date().toISOString(),
    candidates,
    classificationCounts: candidates.reduce<Record<string, number>>((acc, candidate) => {
      acc[candidate.accessKind] = (acc[candidate.accessKind] ?? 0) + 1;
      return acc;
    }, {}),
    guidance: [
      "Start official_free/public API adapters before research-only public-page extraction.",
      "Research-only candidates must carry requiresProductionReplacement=true and tosRisk metadata.",
      "Closed/restricted platforms should create access_required or indirect aggregator candidates, not broken polling loops.",
    ],
  };
}

export function planIndirectTargets(input: IndirectTargetInput = {}) {
  const platforms = uniqueStrings(input.platforms);
  const queryTerms = uniqueStrings(input.queryTerms);
  const fallbackPlatforms = ["upwork.com", "linkedin.com", "peopleperhour.com", "freelancer.com", "guru.com"];
  const fallbackTerms = ["looking for provider", "project budget", "vendor selection", "request for proposal", "implementation help"];
  const maxQueries = clampLimit(input.maxQueries, 25, 100);
  const queries: Array<Record<string, unknown>> = [];
  for (const platform of (platforms.length ? platforms : fallbackPlatforms)) {
    for (const term of (queryTerms.length ? queryTerms : fallbackTerms)) {
      queries.push({
        sourceRole: "indirect_aggregator",
        providerType: "search",
        platform,
        query: `site:${platform} ${term}`,
        signalMode: "hidden",
        directCoverage: false,
      });
      if (queries.length >= maxQueries) {
        break;
      }
    }
    if (queries.length >= maxQueries) {
      break;
    }
  }
  return {
    objective: String(input.objective ?? "").trim() || null,
    generatedAt: new Date().toISOString(),
    queries,
    guidance: [
      "Indirect aggregators observe public traces of closed/API-gapped platforms but do not count as direct source coverage.",
      "Aggregator hits must still provide item-level buyer/project evidence before selection.",
    ],
  };
}

export async function getSourceRoleCoverageWithPool(pool: Pool, input: { includeExamples?: boolean } = {}) {
  const result = await pool.query<{
    source_role: string | null;
    provider_type: string;
    adapter_key: string | null;
    research_mode: string | null;
    is_active: boolean;
    last_error_message: string | null;
    last_success_at: Date | null;
    channel_id: string;
    name: string;
    fetch_url: string | null;
  }>(
    `
      select
        coalesce(
          config_json #>> '{api,sourceRole}',
          config_json #>> '{adapter,sourceRole}',
          config_json #>> '{discovery,sourceRole}',
          config_json #>> '{sourceRole}'
        ) as source_role,
        provider_type,
        coalesce(config_json #>> '{api,adapterKey}', config_json #>> '{adapter,adapterKey}', config_json #>> '{adapterKey}') as adapter_key,
        coalesce(config_json #>> '{api,researchMode}', config_json #>> '{adapter,researchMode}', config_json #>> '{researchMode}') as research_mode,
        is_active,
        last_error_message,
        last_success_at,
        channel_id::text,
        name,
        fetch_url
      from source_channels
    `
  );
  const endpointResult = await pool.query<{
    source_role: string;
    candidate_endpoints: number;
    detect_only_endpoints: number;
    adapter_required: number;
    access_required: number;
  }>(
    `
      select
        source_role,
        count(*)::int as candidate_endpoints,
        count(*) filter (where status = 'detect_only' or signal_mode = 'hidden')::int as detect_only_endpoints,
        count(*) filter (
          where evidence_json -> 'adapterResearch' ->> 'accessKind' in ('closed_access', 'github_unofficial_restricted', 'unsupported')
             or recommended_action = 'needs_config'
        )::int as adapter_required,
        count(*) filter (
          where evidence_json -> 'adapterResearch' ->> 'defaultPollingAllowed' = 'false'
             or evidence_json -> 'adapterResearch' ->> 'accessKind' in ('closed_access', 'github_unofficial_restricted')
        )::int as access_required
      from discovery_source_endpoints
      group by source_role
    `
  );
  const rows = new Map<string, SourceRoleCoverageRow>();
  for (const sourceRole of [...SOURCE_ROLE_KEYS, "unknown"] as const) {
    rows.set(sourceRole, {
      sourceRole,
      channels: 0,
      activeChannels: 0,
      apiChannels: 0,
      rssChannels: 0,
      websiteChannels: 0,
      adapterChannels: 0,
      researchOnlyChannels: 0,
      candidateEndpoints: 0,
      detectOnlyEndpoints: 0,
      adapterRequiredEndpoints: 0,
      accessRequiredEndpoints: 0,
      workingChannels: 0,
      brokenChannels: 0,
      examples: [],
    });
  }
  for (const row of result.rows) {
    const rawRole = (row.source_role ?? "").trim();
    const role = (SOURCE_ROLE_KEYS as readonly string[]).includes(rawRole) ? rawRole : "unknown";
    const target = rows.get(role) ?? rows.get("unknown")!;
    target.channels += 1;
    target.activeChannels += row.is_active ? 1 : 0;
    target.apiChannels += row.provider_type === "api" ? 1 : 0;
    target.rssChannels += row.provider_type === "rss" ? 1 : 0;
    target.websiteChannels += row.provider_type === "website" ? 1 : 0;
    target.adapterChannels += row.adapter_key ? 1 : 0;
    target.researchOnlyChannels += row.research_mode === "research_only" ? 1 : 0;
    target.workingChannels += row.last_success_at ? 1 : 0;
    target.brokenChannels += row.last_error_message ? 1 : 0;
    if (input.includeExamples && target.examples.length < 5) {
      target.examples.push({
        channelId: row.channel_id,
        name: row.name,
        providerType: row.provider_type,
        adapterKey: row.adapter_key,
        researchMode: row.research_mode,
        fetchUrl: row.fetch_url,
      });
    }
  }
  for (const row of endpointResult.rows) {
    const role = (SOURCE_ROLE_KEYS as readonly string[]).includes(row.source_role) ? row.source_role : "unknown";
    const target = rows.get(role) ?? rows.get("unknown")!;
    target.candidateEndpoints += Number(row.candidate_endpoints ?? 0);
    target.detectOnlyEndpoints += Number(row.detect_only_endpoints ?? 0);
    target.adapterRequiredEndpoints += Number(row.adapter_required ?? 0);
    target.accessRequiredEndpoints += Number(row.access_required ?? 0);
  }
  const coverage = [...rows.values()];
  return {
    generatedAt: new Date().toISOString(),
    roles: coverage,
    missingRoles: coverage
      .filter((row) => row.sourceRole !== "unknown" && row.channels === 0 && row.candidateEndpoints === 0)
      .map((row) => row.sourceRole),
    risks: [
      ...(coverage.find((row) => row.sourceRole === "rss_web")?.channels ?? 0) > 0 &&
      coverage.some((row) => row.sourceRole !== "rss_web" && row.sourceRole !== "unknown" && row.channels === 0)
        ? ["rssOverExpansionRisk"]
        : [],
      ...coverage.some((row) => row.adapterRequiredEndpoints > 0) ? ["adapterCandidateBacklog"] : [],
      ...coverage.some((row) => row.sourceRole === "indirect_aggregator" && row.channels === 0 && row.candidateEndpoints === 0)
        ? ["indirectAggregatorGap"]
        : [],
      ...coverage.some((row) => row.sourceRole === "indirect_aggregator" && row.channels === 0 && row.candidateEndpoints > 0)
        ? ["indirectAggregatorPendingExecution"]
        : [],
    ],
    nextReadBack: ["discovery.adapter_research.plan", "operator.report.verify reportKind=source_role_coverage"],
  };
}

export async function startAdapterResearchWithPool(pool: Pool, input: AdapterResearchInput = {}) {
  const plan = planAdapterResearch(input);
  const created: Array<Record<string, unknown>> = [];
  const now = new Date().toISOString();
  for (const candidate of plan.candidates) {
    const endpointId = randomUUID();
    const endpointUrl = normalizeUrl(candidate.endpointUrl);
    const providerType = candidate.providerType;
    const result = await pool.query(
      `
        insert into discovery_source_endpoints (
          endpoint_id, provider_id, provider_type, canonical_domain, homepage_url, endpoint_url,
          normalized_endpoint_url, endpoint_kind, source_role, signal_mode, title, description,
          evidence_json, why_found_json, missing_evidence_json, next_best_action,
          interest_fit_score, evidence_score, quality_score, extraction_ready_score,
          coverage_gap_score, compliance_score, total_score, status, recommended_action,
          reviewed_by, updated_at
        )
        select
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10, $11, $12,
          $13::jsonb, $14::jsonb, $15::jsonb, $16,
          $17, $18, $19, $20,
          $21, $22, $23, $24, $25,
          $26, $27::timestamptz
        where not exists (
          select 1
          from discovery_source_endpoints
          where target_id is null
            and normalized_endpoint_url = $7
        )
        returning endpoint_id
      `,
      [
        endpointId,
        candidate.platform.toLowerCase().replace(/[^a-z0-9]+/gu, "_").replace(/^_|_$/gu, ""),
        providerType,
        domainFromUrl(candidate.endpointUrl),
        candidate.homepageUrl,
        candidate.endpointUrl,
        endpointUrl,
        candidate.providerType === "rss" ? "feed" : "adapter_candidate",
        candidate.sourceRole,
        candidate.sourceRole === "community_search" || candidate.sourceRole === "closed_professional_network" ? "hidden" : "mixed",
        candidate.title,
        candidate.description,
        JSON.stringify({ adapterResearch: candidate, generatedAt: now }),
        JSON.stringify([{ reason: "adapter_research_preflight", objective: input.objective ?? null }]),
        JSON.stringify(candidate.defaultPollingAllowed ? [] : ["access_required_or_production_replacement_required"]),
        candidate.defaultPollingAllowed ? "configure_api_channel" : "use_indirect_aggregator_or_explicit_access",
        candidate.defaultPollingAllowed ? 0.65 : 0.45,
        candidate.defaultPollingAllowed ? 0.6 : 0.25,
        candidate.tosRisk === "low" ? 0.7 : 0.4,
        candidate.defaultPollingAllowed ? 0.75 : 0.2,
        0.8,
        candidate.tosRisk === "low" ? 0.8 : 0.25,
        candidate.defaultPollingAllowed ? 0.68 : 0.42,
        candidate.defaultPollingAllowed ? "needs_config" : "monitor_only",
        candidate.defaultPollingAllowed ? "needs_config" : "monitor",
        input.requestedBy ?? "mcp-adapter-research",
        now,
      ]
    );
    if (result.rows[0]) {
      created.push({ endpointId, platform: candidate.platform, sourceRole: candidate.sourceRole, adapterKey: candidate.adapterKey });
    }
  }
  return {
    generatedAt: now,
    requestedBy: input.requestedBy ?? null,
    createdCount: created.length,
    created,
    plan,
    note: "Adapter research creates discovery endpoint evidence only; it does not create channels or select content.",
  };
}

export async function listAdapterResearchWithPool(pool: Pool, input: { page?: number; pageSize?: number } = {}) {
  const pageSize = clampLimit(input.pageSize, 25, 100);
  const page = clampLimit(input.page, 1, 10_000);
  const offset = (page - 1) * pageSize;
  const result = await pool.query(
    `
      select endpoint_id::text, provider_id, provider_type, source_role, endpoint_url, title, status,
             recommended_action, evidence_json, created_at, updated_at,
             count(*) over()::int as total_count
      from discovery_source_endpoints
      where evidence_json ? 'adapterResearch'
      order by updated_at desc
      limit $1 offset $2
    `,
    [pageSize, offset]
  );
  return {
    page,
    pageSize,
    total: Number(result.rows[0]?.total_count ?? 0),
    items: result.rows.map((row) => ({
      endpointId: row.endpoint_id,
      providerId: row.provider_id,
      providerType: row.provider_type,
      sourceRole: row.source_role,
      endpointUrl: row.endpoint_url,
      title: row.title,
      status: row.status,
      recommendedAction: row.recommended_action,
      adapterResearch: row.evidence_json?.adapterResearch ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
  };
}

export async function explainAdapterResearchWithPool(pool: Pool, input: { endpointId: string }) {
  const result = await pool.query(
    `
      select endpoint_id::text, provider_type, source_role, endpoint_url, title, status,
             recommended_action, evidence_json, missing_evidence_json, why_found_json
      from discovery_source_endpoints
      where endpoint_id = $1 and evidence_json ? 'adapterResearch'
    `,
    [input.endpointId]
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error(`Adapter research endpoint ${input.endpointId} was not found.`);
  }
  return {
    endpointId: row.endpoint_id,
    title: row.title,
    providerType: row.provider_type,
    sourceRole: row.source_role,
    endpointUrl: row.endpoint_url,
    status: row.status,
    recommendedAction: row.recommended_action,
    adapterResearch: row.evidence_json?.adapterResearch ?? null,
    missingEvidence: row.missing_evidence_json ?? [],
    whyFound: row.why_found_json ?? [],
    selectionInfluence: "none",
    nextReadBack: ["discovery.source_roles.coverage", "channels.bulk_onboard.plan"],
  };
}

export async function startIndirectTargetsWithPool(pool: Pool, input: IndirectTargetInput = {}) {
  const plan = planIndirectTargets(input);
  const now = new Date().toISOString();
  const created: Array<Record<string, unknown>> = [];
  for (const query of plan.queries) {
    const endpointId = randomUUID();
    const platform = String(query.platform ?? "search");
    const endpointUrl = `search://${encodeURIComponent(String(query.query ?? ""))}`;
    const result = await pool.query(
      `
        insert into discovery_source_endpoints (
          endpoint_id, provider_id, provider_type, canonical_domain, homepage_url, endpoint_url,
          normalized_endpoint_url, endpoint_kind, source_role, signal_mode, title, description,
          evidence_json, why_found_json, next_best_action, interest_fit_score, evidence_score,
          quality_score, extraction_ready_score, coverage_gap_score, compliance_score, total_score,
          status, recommended_action, reviewed_by, updated_at
        )
        select
          $1, 'indirect_aggregator', 'search', $2, null, $3,
          $4, 'indirect_query', 'indirect_aggregator', 'hidden', $5, $6,
          $7::jsonb, $8::jsonb, 'run_bounded_search_or_news_query', 0.55, 0.4,
          0.45, 0.35, 0.75, 0.65, 0.52,
          'detect_only', 'detect_only', $9, $10::timestamptz
        where not exists (
          select 1
          from discovery_source_endpoints
          where target_id is null
            and normalized_endpoint_url = $4
        )
        returning endpoint_id
      `,
      [
        endpointId,
        platform,
        endpointUrl,
        endpointUrl,
        `Indirect aggregator query for ${platform}`,
        String(query.query ?? ""),
        JSON.stringify({ indirectAggregator: query, generatedAt: now }),
        JSON.stringify([{ reason: "closed_or_adapter_gapped_source_role", objective: input.objective ?? null }]),
        input.requestedBy ?? "mcp-indirect-targets",
        now,
      ]
    );
    if (result.rows[0]) {
      created.push({ endpointId, ...query });
    }
  }
  return {
    generatedAt: now,
    createdCount: created.length,
    created,
    plan,
    note: "Indirect target start creates detect-only discovery endpoint evidence; it does not create channels or select content.",
  };
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/u, "");
}

function buildSearchAdapterRow(input: {
  provider: NonNullable<IndirectTargetChannelPlanInput["searchProvider"]>;
  baseUrl: string | null;
  query: string;
  platform: string | null;
  locale: string | null;
  timeRange: string | null;
  maxResults: number;
}): { row: Record<string, unknown> | null; blocker: string | null; risk: string } {
  const encodedQuery = encodeURIComponent(input.query);
  const commonAdapter = {
    sourceRole: "indirect_aggregator",
    contentKind: "api_payload",
    query: input.query,
    platform: input.platform,
    searchQuery: {
      query: input.query,
      platform: input.platform,
      siteFilter: input.platform,
      locale: input.locale,
      timeRange: input.timeRange,
      maxResults: input.maxResults,
      searchProvider: input.provider,
      directCoverage: false,
    },
  };

  if (input.provider === "searxng_search") {
    if (!input.baseUrl) {
      return { row: null, blocker: "searxng_base_url_required", risk: "low" };
    }
    const url = new URL(`${trimTrailingSlash(input.baseUrl)}/search`);
    url.searchParams.set("q", input.query);
    url.searchParams.set("format", "json");
    if (input.locale) {
      url.searchParams.set("language", input.locale);
    }
    if (input.timeRange) {
      url.searchParams.set("time_range", input.timeRange);
    }
    return {
      blocker: null,
      risk: "low",
      row: {
        providerType: "api",
        name: `Indirect search: ${input.query.slice(0, 90)}`,
        fetchUrl: url.toString(),
        maxItemsPerPoll: input.maxResults,
        adapter: {
          ...commonAdapter,
          adapterKey: "searxng_search",
          researchMode: "production",
          accessKind: "official_free",
          tosRisk: "low",
          requiresProductionReplacement: false,
        },
      },
    };
  }

  if (input.provider === "ddgs_search") {
    const url = new URL(`${trimTrailingSlash(input.baseUrl || "http://api:8000")}/maintenance/discovery/search/ddgs`);
    url.searchParams.set("q", input.query);
    url.searchParams.set("count", String(input.maxResults));
    url.searchParams.set("resultType", "text");
    if (input.timeRange) {
      url.searchParams.set("timeRange", input.timeRange);
    }
    return {
      blocker: null,
      risk: "medium",
      row: {
        providerType: "api",
        name: `Indirect DDGS search: ${input.query.slice(0, 84)}`,
        fetchUrl: url.toString(),
        maxItemsPerPoll: input.maxResults,
        adapter: {
          ...commonAdapter,
          adapterKey: "ddgs_search",
          researchMode: "research_only",
          accessKind: "github_unofficial_public",
          tosRisk: "medium",
          requiresProductionReplacement: true,
        },
      },
    };
  }

  if (input.provider === "brave_search") {
    return {
      blocker: "authorization_header_required",
      risk: "low",
      row: {
        providerType: "api",
        name: `Indirect Brave search: ${input.query.slice(0, 84)}`,
        fetchUrl: `https://api.search.brave.com/res/v1/web/search?q=${encodedQuery}&count=${Math.min(input.maxResults, 20)}`,
        maxItemsPerPoll: input.maxResults,
        adapter: {
          ...commonAdapter,
          adapterKey: "brave_search",
          researchMode: "production",
          accessKind: "official_free_key",
          tosRisk: "low",
          requiresProductionReplacement: false,
        },
      },
    };
  }

  if (input.provider === "tavily_search" || input.provider === "exa_search") {
    const isTavily = input.provider === "tavily_search";
    return {
      blocker: "authorization_header_required",
      risk: "low",
      row: {
        providerType: "api",
        name: `Indirect ${isTavily ? "Tavily" : "Exa"} search: ${input.query.slice(0, 82)}`,
        fetchUrl: isTavily ? "https://api.tavily.com/search" : "https://api.exa.ai/search",
        requestMethod: "POST",
        requestBodyJson: isTavily
          ? { query: input.query, max_results: input.maxResults, search_depth: "basic" }
          : { query: input.query, numResults: input.maxResults, contents: { text: true, highlights: true } },
        maxItemsPerPoll: input.maxResults,
        adapter: {
          ...commonAdapter,
          adapterKey: input.provider,
          researchMode: "production",
          accessKind: "official_free_key",
          tosRisk: "low",
          requiresProductionReplacement: false,
        },
      },
    };
  }

  return {
    blocker: "research_only_high_tos_risk",
    risk: "high",
    row: {
      providerType: "api",
      name: `Indirect SerpAPI news search: ${input.query.slice(0, 76)}`,
      fetchUrl: `https://serpapi.com/search?engine=google_news&q=${encodedQuery}`,
      maxItemsPerPoll: input.maxResults,
      adapter: {
        ...commonAdapter,
        adapterKey: "serpapi_google_news_research",
        researchMode: "research_only",
        accessKind: "official_paid",
        tosRisk: "high",
        requiresProductionReplacement: true,
      },
    },
  };
}

export async function planIndirectTargetChannelsWithPool(
  pool: Pool,
  input: IndirectTargetChannelPlanInput = {}
) {
  const provider = input.searchProvider ?? "ddgs_search";
  const maxChannels = clampLimit(input.maxChannels, 20, 100);
  const maxResults = 10;
  const endpointIds = uniqueStrings(input.endpointIds);
  const params: unknown[] = [maxChannels];
  const endpointFilter = endpointIds.length
    ? `and endpoint_id::text = any($2::text[])`
    : "";
  if (endpointIds.length) {
    params.push(endpointIds);
  }
  const result = await pool.query(
    `
      select endpoint_id::text, endpoint_url, title, description, evidence_json, updated_at
      from discovery_source_endpoints
      where source_role = 'indirect_aggregator'
        and evidence_json ? 'indirectAggregator'
        ${endpointFilter}
      order by updated_at desc
      limit $1
    `,
    params
  );

  const items = result.rows.map((row) => {
    const indirect = row.evidence_json?.indirectAggregator ?? {};
    const query = String(indirect.query ?? row.description ?? "").trim();
    const platform = String(indirect.platform ?? "").trim() || null;
    const planned = buildSearchAdapterRow({
      provider,
      baseUrl: input.baseUrl ? trimTrailingSlash(input.baseUrl) : null,
      query,
      platform,
      locale: input.locale ?? null,
      timeRange: input.timeRange ?? null,
      maxResults,
    });
    const blockedByRisk = planned.risk === "high" && !input.includeHighRisk;
    return {
      endpointId: row.endpoint_id,
      sourceRole: "indirect_aggregator",
      providerType: "api",
      searchProvider: provider,
      query,
      platform,
      status: !planned.row || planned.blocker || blockedByRisk ? "needs_config" : "ready_for_bulk_onboard",
      blocker: blockedByRisk ? "high_tos_risk_requires_explicit_includeHighRisk" : planned.blocker,
      risk: planned.risk,
      bulkOnboardRow: blockedByRisk ? null : planned.row,
      selectionInfluence: "none",
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    searchProvider: provider,
    total: items.length,
    readyCount: items.filter((item) => item.status === "ready_for_bulk_onboard").length,
    needsConfigCount: items.filter((item) => item.status === "needs_config").length,
    items,
    bulkOnboardRows: items
      .filter((item) => item.status === "ready_for_bulk_onboard" && item.bulkOnboardRow)
      .map((item) => item.bulkOnboardRow),
    guidance: [
      "This planner is read-only; create channels through channels.bulk_onboard.plan/apply/verify.",
      "Search/indirect channels create acquisition evidence only and cannot select content by provider metadata.",
      "DDGS uses the internal API bridge in research_only mode. SearXNG requires a configured baseUrl. Brave/Tavily/Exa require explicit Authorization configuration.",
    ],
  };
}

import type { Pool } from "pg";
import {
  buildCoverageFirstAutoplan,
  buildCoverageFirstIterationRecommendation,
  getSourceFamilyCoverageWithPool,
  getSourceRoleCoverageWithPool,
  listAdapterResearchWithPool,
  listChannelBottlenecksWithPool,
  summarizeChannelBottlenecksWithPool,
} from "@newsportal/control-plane";

import { readOptionalInteger, readOptionalString } from "./protocol";
import type { McpToolContext } from "./tools/shared";

export const OPERATING_DOMAIN_VALUES = [
  "channels",
  "website_pipeline",
  "selection",
  "content_analysis",
  "llm_budget",
  "discovery",
  "sequences",
  "cleanup",
] as const;

export type OperatingDomain = (typeof OPERATING_DOMAIN_VALUES)[number];

export const OPERATING_REPORT_KINDS = [
  "system_health",
  "channel_health",
  "source_bottleneck",
  "funnel_calibration",
  "selection_precision",
  "selection_hold_quality",
  "source_role_coverage",
  "source_family_balance",
  "adapter_research",
  "indirect_search_execution",
  "marketplace_extraction_quality",
  "website_pipeline",
  "selection_tuning",
  "content_analysis",
  "llm_budget",
  "sequence_run",
  "discovery_yield",
] as const;

export const OPERATIONAL_RESOURCE_URIS = [
  "newsportal://ops/health",
  "newsportal://ops/issues",
  "newsportal://ops/tuning-backlog",
  "newsportal://ops/recent-changes",
] as const;

type IssueSeverity = "info" | "warning" | "critical";

interface OperatingDomainGuide {
  domain: OperatingDomain;
  title: string;
  lifecycle: readonly string[];
  keyMetrics: readonly string[];
  normalStates: readonly string[];
  commonSymptoms: readonly string[];
  commonCauses: readonly string[];
  tuningLevers: readonly string[];
  readBackChecks: readonly string[];
}

export const OPERATING_DOMAIN_REGISTRY: Readonly<Record<OperatingDomain, OperatingDomainGuide>> = {
  channels: {
    domain: "channels",
    title: "Source Channels",
    lifecycle: ["configured", "scheduled", "fetched", "persisted", "verified", "tuned"],
    keyMetrics: ["active channel count", "fetch outcomes", "new articles/resources", "last success/error"],
    normalStates: [
      "Active RSS/API/email channels usually produce articles directly.",
      "Website channels may produce resource-only rows before downstream projection/selection succeeds.",
    ],
    commonSymptoms: ["fetch failures", "duplicate-heavy fetches", "active channel with no recent runs"],
    commonCauses: ["bad URL", "provider rate limit", "site blocks crawler", "poll interval too aggressive"],
    tuningLevers: ["fetchUrl/homepageUrl", "pollIntervalSeconds", "provider-specific config", "active flag"],
    readBackChecks: ["channels.read", "fetch_runs.list", "web_resources.list"],
  },
  website_pipeline: {
    domain: "website_pipeline",
    title: "Website Resource Pipeline",
    lifecycle: ["fetch", "resource extraction", "enrichment", "common-pipeline projection", "final selection"],
    keyMetrics: ["web resource count", "extraction state", "projection state", "projected article decision"],
    normalStates: [
      "resource_only is valid for listings/documents that should stay in resources.",
      "projected_to_common_pipeline plus final_decision=rejected means acquisition worked and downstream selection rejected it.",
    ],
    commonSymptoms: [
      "resources exist but no selected articles",
      "many explicitly_rejected_before_pipeline rows",
      "projected articles all rejected",
    ],
    commonCauses: [
      "resource kind is listing/document",
      "content filter or selection profile rejects the article",
      "website discovery settings are too broad",
      "browser fallback is needed for heavy JS sites",
    ],
    tuningLevers: ["website discovery settings", "content filter policy", "system interests", "selection profile"],
    readBackChecks: ["web_resources.list", "articles.explain", "content_filter_results.list"],
  },
  selection: {
    domain: "selection",
    title: "Final Selection",
    lifecycle: ["article observation", "interest/filter evaluation", "LLM review when configured", "final decision"],
    keyMetrics: ["selected/rejected/gray_zone counts", "residual buckets", "verification state"],
    normalStates: [
      "final_decision=rejected can be correct automation behavior.",
      "gray_zone/hold is expected when profile policy says uncertain items need operator review.",
    ],
    commonSymptoms: ["useful article rejected", "LLM approved but item held", "too many gray_zone rows"],
    commonCauses: [
      "profile hold policy",
      "weak verification",
      "negative signal match",
      "content filter policy in hold/enforce mode",
    ],
    tuningLevers: ["system interest definition", "LLM template", "content filter policy", "selection profile strictness"],
    readBackChecks: ["articles.residuals.summary", "articles.explain", "content_items.explain"],
  },
  content_analysis: {
    domain: "content_analysis",
    title: "Content Analysis and Gating",
    lifecycle: ["policy", "analysis result", "labels/entities", "filter result", "selection consumption"],
    keyMetrics: ["analysis status", "filter decisions", "policy mode", "failure policy"],
    normalStates: [
      "observe and dry_run policies record evidence without blocking content.",
      "hold/enforce policies can intentionally stop or hold content.",
    ],
    commonSymptoms: ["failed analysis", "unexpected hold/reject", "missing labels/entities"],
    commonCauses: ["disabled policy", "unsupported provider/model", "policy mode changed", "rule too broad"],
    tuningLevers: ["policy mode", "policy config", "failure policy", "content filter rules"],
    readBackChecks: ["content_analysis.list", "content_filter_results.list", "content_filter_policies.read"],
  },
  llm_budget: {
    domain: "llm_budget",
    title: "LLM Budget",
    lifecycle: ["budget configured", "review requested", "review logged", "cost summarized", "escalation tuned"],
    keyMetrics: ["budget remaining", "review count", "estimated cost", "review outcomes"],
    normalStates: [
      "Cheap hold can be correct when escalation is disabled or signal is weak.",
      "Low review count may be normal if deterministic filters decide most items.",
    ],
    commonSymptoms: ["reviews stopped", "too many expensive reviews", "gray_zone held after review"],
    commonCauses: ["budget exhausted", "review mode always", "weak verification", "template too broad"],
    tuningLevers: ["LLM review mode", "review thresholds", "template scope", "budget ceiling"],
    readBackChecks: ["llm_budget.summary", "articles.explain", "operator.report.verify"],
  },
  discovery: {
    domain: "discovery",
    title: "Discovery",
    lifecycle: ["target", "coverage", "hypotheses", "evidence", "endpoint/claim review", "contract probation", "coverage refresh"],
    keyMetrics: ["active targets/runs", "coverage gaps", "endpoint actions", "contract health", "claim confidence", "provider health"],
    normalStates: [
      "Newly promoted direct sources count only as probation coverage until the Source Evidence Contract passes.",
      "Hidden/social signals remain claims or monitor-only evidence until independent support and control comparison justify direct-source follow-up.",
      "Provider errors should update provider health/circuit breakers rather than being interpreted as bad hypotheses.",
    ],
    commonSymptoms: ["coverage stuck", "too many rejected endpoints", "contract probation failures", "hidden signal noise", "provider degraded"],
    commonCauses: ["query diversity collapsed", "negative evidence cooldown ignored", "source identity duplicates", "provider auth/rate limits", "missing control comparison"],
    tuningLevers: ["coverage policy", "diversity budget", "provider capability card", "Source Evidence Contract", "replay eval thresholds"],
    readBackChecks: ["discovery.summary.get", "discovery.targets.list", "discovery.endpoints.list", "discovery.contracts.list", "operator.report.verify"],
  },
  sequences: {
    domain: "sequences",
    title: "Sequences",
    lifecycle: ["definition", "run", "task runs", "completed/failed/cancelled", "retry/archive"],
    keyMetrics: ["run status", "failed task count", "retry lineage", "protected system sequence count"],
    normalStates: [
      "Migration-owned default/adaptive sequences are system objects.",
      "Retries should reference failed run evidence, not replace diagnosis.",
    ],
    commonSymptoms: ["pending/stuck run", "failed run", "manual run denied for system reindex"],
    commonCauses: ["missing event context", "task plugin failure", "queue worker unavailable", "invalid run payload"],
    tuningLevers: ["task graph", "trigger event", "retry policy", "maintenance request tool"],
    readBackChecks: ["sequences.read", "sequences.runs.read", "sequences.run_task_runs.list"],
  },
  cleanup: {
    domain: "cleanup",
    title: "Cleanup",
    lifecycle: ["inventory", "classify protected/user/test artifacts", "archive", "delete/revoke", "verify"],
    keyMetrics: ["active artifacts", "protected system objects", "active MCP tokens"],
    normalStates: [
      "Audit/protected objects should remain after cleanup.",
      "MCP token lifecycle requires scoped MCP token tools or admin UI, not REST bypass.",
    ],
    commonSymptoms: ["agent tries direct REST/SQL", "system sequences archived", "tokens not revocable through current scope"],
    commonCauses: ["missing tool scope", "no read-only inventory", "client guessed schema or ownership"],
    tuningLevers: ["cleanup prompt", "destructive confirmation", "token scopes", "archive before delete policy"],
    readBackChecks: ["admin.summary.get", "admin.mcp_tokens.list", "operator.report.verify"],
  },
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => readOptionalString(entry))
    .filter((entry): entry is string => Boolean(entry));
}

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .replace(/\s+/gu, " ")
    .trim()
    .toLowerCase();
}

function compactStringList(value: unknown): string[] {
  return readStringArray(value).map((entry) => entry.trim()).filter(Boolean);
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function readPageWindow(args: Record<string, unknown>, defaultPageSize = 25) {
  const page = Math.max(readOptionalInteger(args.page) ?? 1, 1);
  const pageSize = Math.min(
    Math.max(readOptionalInteger(args.pageSize) ?? defaultPageSize, 1),
    100
  );
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function holdQualityWhere(args: Record<string, unknown>) {
  const clauses = [
    `
      fsr.final_decision = 'gray_zone'
      and (
        coalesce(fsr.explain_json ->> 'selectionReason', '') in (
          'candidate_signal_hold',
          'semantic_hold',
          'candidate_signal_gray_zone'
        )
        or coalesce(fsr.explain_json ->> 'downstreamLossBucket', '') in (
          'gray_zone_hold',
          'context_candidate_not_selected',
          'buyer_intent_hold',
          'project_intent_hold',
          'llm_review_pending'
        )
      )
    `,
  ];
  const params: unknown[] = [];
  const candidateSignalTier = readOptionalString(args.candidateSignalTier);
  const verificationState = readOptionalString(args.verificationState);
  const downstreamLossBucket = readOptionalString(args.downstreamLossBucket);
  const q = readOptionalString(args.q);
  const docIds = readStringArray(args.docIds);
  if (candidateSignalTier) {
    params.push(candidateSignalTier);
    clauses.push(
      `coalesce(fsr.explain_json ->> 'candidateSignalTier', fsr.explain_json #>> '{semanticSignalSummary,candidateSignalTier}', 'unknown') = $${params.length}`
    );
  }
  if (verificationState) {
    params.push(verificationState);
    clauses.push(`coalesce(fsr.verification_state, '') = $${params.length}`);
  }
  if (downstreamLossBucket) {
    params.push(downstreamLossBucket);
    clauses.push(`coalesce(fsr.explain_json ->> 'downstreamLossBucket', '') = $${params.length}`);
  }
  if (q) {
    params.push(`%${q}%`);
    clauses.push(`(a.title ilike $${params.length} or coalesce(a.url, '') ilike $${params.length})`);
  }
  if (docIds.length > 0) {
    params.push(docIds);
    clauses.push(`fsr.doc_id::text = any($${params.length}::text[])`);
  }
  return { whereSql: clauses.map((clause) => `(${clause})`).join(" and "), params };
}

function holdQualitySelectSql() {
  return `
    select
      fsr.doc_id::text as "docId",
      a.title,
      a.url,
      a.published_at as "publishedAt",
      a.channel_id::text as "channelId",
      sc.name as "channelName",
      sc.provider_type as "providerType",
      fsr.final_decision as "finalDecision",
      fsr.is_selected as "isSelected",
      fsr.verification_state as "verificationState",
      coalesce(fsr.explain_json ->> 'selectionReason', '') as "selectionReason",
      coalesce(fsr.explain_json ->> 'downstreamLossBucket', '') as "downstreamLossBucket",
      coalesce(fsr.explain_json ->> 'selectionBlockerReason', '') as "selectionBlockerReason",
      coalesce(fsr.explain_json ->> 'holdReason', '') as "holdReason",
      coalesce(fsr.explain_json ->> 'candidateSignalTier', fsr.explain_json #>> '{semanticSignalSummary,candidateSignalTier}', 'unknown') as "candidateSignalTier",
      coalesce((fsr.explain_json ->> 'candidateSignalUpliftCount')::int, 0) as "candidateSignalUpliftCount",
      coalesce((fsr.explain_json #>> '{semanticSignalSummary,llmReviewPending}')::int, 0) as "llmReviewPendingCount",
      coalesce((fsr.explain_json #>> '{semanticSignalSummary,hold}')::int, 0) as "holdCount",
      fsr.explain_json as "finalSelectionExplain",
      (
        select jsonb_agg(
          jsonb_build_object(
            'criterionId', ifr.criterion_id::text,
            'semanticDecision', ifr.semantic_decision,
            'candidateSignals', ifr.explain_json -> 'candidateSignals',
            'llmReviewAllowed', coalesce((ifr.explain_json -> 'selectionProfile' ->> 'llmReviewAllowed')::boolean, false),
            'runtimeReviewState', ifr.explain_json -> 'runtimeReviewState',
            'filterReasons', ifr.explain_json -> 'filterReasons'
          )
          order by ifr.created_at desc
        )
        from interest_filter_results ifr
        where ifr.doc_id = fsr.doc_id
          and ifr.filter_scope = 'system_criterion'
          and (
            ifr.semantic_decision = 'gray_zone'
            or ifr.explain_json ? 'candidateSignals'
          )
      ) as "holdEvidence"
    from final_selection_results fsr
    join articles a on a.doc_id = fsr.doc_id
    left join source_channels sc on sc.channel_id = a.channel_id
  `;
}

export async function buildArticleHoldQualitySummary(
  { pool }: McpToolContext,
  args: Record<string, unknown>
) {
  const { whereSql, params } = holdQualityWhere(args);
  const [total, byTier, byBucket, byVerification, pendingLlm] = await Promise.all([
    countQuery(
      pool,
      `
        select count(*)::int as count
        from final_selection_results fsr
        join articles a on a.doc_id = fsr.doc_id
        where ${whereSql}
      `,
      params
    ),
    countQuery(
      pool,
      `
        select
          coalesce(fsr.explain_json ->> 'candidateSignalTier', fsr.explain_json #>> '{semanticSignalSummary,candidateSignalTier}', 'unknown') as tier,
          count(*)::int as count
        from final_selection_results fsr
        join articles a on a.doc_id = fsr.doc_id
        where ${whereSql}
        group by tier
        order by count desc, tier asc
      `,
      params
    ),
    countQuery(
      pool,
      `
        select coalesce(fsr.explain_json ->> 'downstreamLossBucket', 'unknown') as bucket,
               count(*)::int as count
        from final_selection_results fsr
        join articles a on a.doc_id = fsr.doc_id
        where ${whereSql}
        group by bucket
        order by count desc, bucket asc
      `,
      params
    ),
    countQuery(
      pool,
      `
        select coalesce(fsr.verification_state, 'unknown') as "verificationState",
               count(*)::int as count
        from final_selection_results fsr
        join articles a on a.doc_id = fsr.doc_id
        where ${whereSql}
        group by fsr.verification_state
        order by count desc, "verificationState" asc
      `,
      params
    ),
    countQuery(
      pool,
      `
        select count(*)::int as count
        from final_selection_results fsr
        join articles a on a.doc_id = fsr.doc_id
        where ${whereSql}
          and coalesce((fsr.explain_json #>> '{semanticSignalSummary,llmReviewPending}')::int, 0) > 0
      `,
      params
    ),
  ]);
  return {
    generatedAt: new Date().toISOString(),
    totalHolds: Number(total[0]?.count ?? 0),
    byCandidateSignalTier: byTier,
    byDownstreamLossBucket: byBucket,
    byVerificationState: byVerification,
    llmReviewPending: Number(pendingLlm[0]?.count ?? 0),
    interpretation: [
      "context candidates are diagnostics and should not be treated as selected evidence",
      "buyer_intent/project_intent holds are the preferred bounded replay pool",
      "source health and source priors are intentionally absent from selection eligibility",
    ],
  };
}

export async function listArticleHoldQuality(
  { pool }: McpToolContext,
  args: Record<string, unknown>
) {
  const { whereSql, params } = holdQualityWhere(args);
  const { page, pageSize, offset } = readPageWindow(args, 25);
  const items = await countQuery(
    pool,
    `
      ${holdQualitySelectSql()}
      where ${whereSql}
      order by
        case coalesce(fsr.explain_json ->> 'candidateSignalTier', fsr.explain_json #>> '{semanticSignalSummary,candidateSignalTier}', 'unknown')
          when 'project_intent' then 1
          when 'buyer_intent' then 2
          when 'context' then 3
          else 4
        end,
        fsr.updated_at desc
      limit $${params.length + 1}
      offset $${params.length + 2}
    `,
    [...params, pageSize, offset]
  );
  const total = await countQuery(
    pool,
    `
      select count(*)::int as count
      from final_selection_results fsr
      join articles a on a.doc_id = fsr.doc_id
      where ${whereSql}
    `,
    params
  );
  return {
    page,
    pageSize,
    total: Number(total[0]?.count ?? 0),
    items,
  };
}

export async function explainArticleHoldQuality(
  { pool }: McpToolContext,
  args: Record<string, unknown>
) {
  const docId = readOptionalString(args.docId) ?? readOptionalString(args.id);
  if (!docId) {
    throw new Error("docId is required.");
  }
  const result = await countQuery(
    pool,
    `
      ${holdQualitySelectSql()}
      where fsr.doc_id::text = $1
      limit 1
    `,
    [docId]
  );
  const row = result[0] ?? null;
  return {
    generatedAt: new Date().toISOString(),
    docId,
    hold: row,
    explanation: row
      ? [
          "whyNotSelected is derived from final_selection_results.explain_json and interest_filter_results candidateSignals",
          "candidateSignalTier=context is diagnostic only; prefer buyer_intent/project_intent for bounded replay",
        ]
      : ["No hold-quality row found for this docId."],
  };
}

const PROJECT_INTENT_MARKERS = [
  "request for proposal",
  "request for quote",
  "rfp",
  "rfq",
  "tender",
  "bid",
  "procurement",
  "proposal",
  "quote",
  "looking for",
  "need help",
  "seeking",
  "wanted",
  "vendor selection",
  "implementation partner",
  "migration partner",
];

const DELIVERY_OBJECT_MARKERS = [
  "implementation",
  "migration",
  "integration",
  "replacement",
  "custom app",
  "portal",
  "platform",
  "software",
  "website",
  "crm",
  "erp",
  "api",
  "automation",
  "dashboard",
  "developer",
  "contractor",
];

const COMMITMENT_MARKERS = [
  "budget",
  "fixed price",
  "deadline",
  "due date",
  "submission",
  "contact",
  "contract",
  "award",
  "posted",
  "open for proposals",
  "proposals",
  "bids",
  "scope",
];

const SELECTION_NOISE_MARKERS = [
  "how to ",
  "guide to ",
  "what is ",
  "why ",
  "top ",
  "best ",
  "directory",
  "profile",
  "case study",
  "award winner",
  "thought leadership",
  "guest post",
  "browse jobs",
  "search results",
  "tag/",
  "filters=tag",
];

function rowText(row: Record<string, unknown>): string {
  return normalizeText(
    [
      row.title,
      row.lead,
      row.url,
    ].join(" ")
  );
}

function selectionEvidenceGroups(row: Record<string, unknown>) {
  const text = rowText(row);
  const projectMarkers = PROJECT_INTENT_MARKERS.filter((marker) => text.includes(marker));
  const deliveryMarkers = DELIVERY_OBJECT_MARKERS.filter((marker) => text.includes(marker));
  const commitmentMarkers = COMMITMENT_MARKERS.filter((marker) => text.includes(marker));
  const noiseMarkers = SELECTION_NOISE_MARKERS.filter((marker) => text.includes(marker));
  const filterReasonCounts = isRecord(row.finalSelectionExplain)
    && isRecord(row.finalSelectionExplain.semanticSignalSummary)
    && isRecord(row.finalSelectionExplain.semanticSignalSummary.filterReasonCounts)
    ? row.finalSelectionExplain.semanticSignalSummary.filterReasonCounts
    : {};
  const filterReasons = Object.keys(filterReasonCounts).filter((key) => Number(filterReasonCounts[key]) > 0);
  const selectionReason = String(row.selectionReason ?? "");
  const totalFilterCount = Number(row.totalFilterCount ?? 0);
  const matchedFilterCount = Number(row.matchedFilterCount ?? 0);
  const candidateSignalTier = String(row.candidateSignalTier ?? "");
  const professionalNetworkNoise =
    /linkedin\.[^/\s]+\/(pulse|in|jobs)\b/u.test(text)
    || (/linkedin\.[^/\s]+\/posts\b/u.test(text) && /\b(job|hiring|salary|apply now)\b/u.test(text));
  const hasProjectIntent = projectMarkers.length > 0;
  const hasDeliveryObject = deliveryMarkers.length > 0;
  const hasCommitment = commitmentMarkers.length > 0;
  const hasItemLevelEvidence = hasProjectIntent && hasDeliveryObject;
  const stalePassThrough =
    selectionReason === "pass_through" || (totalFilterCount === 0 && matchedFilterCount === 0);
  const documentShapeVeto = filterReasons.some((reason) =>
    [
      "directory_listicle_noise",
      "jobs_only_post_noise",
      "professional_network_post_noise",
      "repo_internal_change_noise",
      "wrapper_directory_noise",
    ].includes(reason)
  );
  const wrapperNoise =
    documentShapeVeto
    || professionalNetworkNoise
    || (noiseMarkers.length > 0 && !hasItemLevelEvidence);
  return {
    projectMarkers,
    deliveryMarkers,
    commitmentMarkers,
    noiseMarkers,
    filterReasons,
    professionalNetworkNoise,
    stalePassThrough,
    wrapperNoise,
    candidateSignalTier,
    hasItemLevelEvidence,
    hasStrongEvidence: hasItemLevelEvidence && hasCommitment,
  };
}

function classifySelectionPrecisionRow(row: Record<string, unknown>) {
  const groups = selectionEvidenceGroups(row);
  const whySelected = String(row.selectionReason ?? "unknown");
  if (groups.stalePassThrough || groups.wrapperNoise) {
    return {
      outcome: "noise",
      whySelected,
      vetoMissed: groups.stalePassThrough ? "stale_pass_through" : "negative_veto_missed",
      evidence: groups,
    };
  }
  if (groups.hasStrongEvidence) {
    return {
      outcome: "strong_project_signal",
      whySelected,
      vetoMissed: null,
      evidence: groups,
    };
  }
  if (groups.hasItemLevelEvidence) {
    return {
      outcome: "probable_signal",
      whySelected,
      vetoMissed: null,
      evidence: groups,
    };
  }
  return {
    outcome: "context_only",
    whySelected,
    vetoMissed: "selected_without_item_level_buyer_project_evidence",
    evidence: groups,
  };
}

function selectionPrecisionSelectSql() {
  return `
    select
      fsr.doc_id::text as "docId",
      a.title,
      a.lead,
      a.url,
      a.published_at as "publishedAt",
      a.channel_id::text as "channelId",
      sc.name as "channelName",
      sc.provider_type as "providerType",
      fsr.final_decision as "finalDecision",
      fsr.is_selected as "isSelected",
      fsr.verification_state as "verificationState",
      fsr.total_filter_count as "totalFilterCount",
      fsr.matched_filter_count as "matchedFilterCount",
      fsr.no_match_filter_count as "noMatchFilterCount",
      fsr.gray_zone_filter_count as "grayZoneFilterCount",
      fsr.technical_filtered_out_count as "technicalFilteredOutCount",
      coalesce(fsr.explain_json ->> 'selectionReason', '') as "selectionReason",
      coalesce(fsr.explain_json ->> 'downstreamLossBucket', '') as "downstreamLossBucket",
      coalesce(fsr.explain_json ->> 'candidateSignalTier', fsr.explain_json #>> '{semanticSignalSummary,candidateSignalTier}', '') as "candidateSignalTier",
      fsr.explain_json as "finalSelectionExplain",
      (
        select jsonb_agg(
          jsonb_build_object(
            'criterionId', ifr.criterion_id::text,
            'semanticDecision', ifr.semantic_decision,
            'technicalFilterState', ifr.technical_filter_state,
            'filterReasons', ifr.explain_json -> 'filterReasons',
            'candidateSignals', ifr.explain_json -> 'candidateSignals',
            'runtimeReviewState', ifr.explain_json -> 'runtimeReviewState',
            'score', ifr.semantic_score
          )
          order by ifr.created_at desc
        )
        from interest_filter_results ifr
        where ifr.doc_id = fsr.doc_id
          and ifr.filter_scope = 'system_criterion'
      ) as "selectionEvidence"
    from final_selection_results fsr
    join articles a on a.doc_id = fsr.doc_id
    left join source_channels sc on sc.channel_id = a.channel_id
  `;
}

export async function buildSelectionPrecisionAudit(
  { pool }: McpToolContext,
  args: Record<string, unknown> = {}
) {
  const docIds = readStringArray(args.docIds);
  const pageSize = Math.min(Math.max(readOptionalInteger(args.pageSize) ?? 100, 1), 200);
  const includeSamples = args.includeSamples !== false;
  const params: unknown[] = [];
  const clauses = ["fsr.is_selected = true", "fsr.final_decision = 'selected'"];
  if (docIds.length > 0) {
    params.push(docIds);
    clauses.push(`fsr.doc_id::text = any($${params.length}::text[])`);
  }
  const rows = await countQuery(
    pool,
    `
      ${selectionPrecisionSelectSql()}
      where ${clauses.join(" and ")}
      order by fsr.updated_at desc
      limit $${params.length + 1}
    `,
    [...params, pageSize]
  );
  const classified = rows.map((row) => ({
    ...row,
    precision: classifySelectionPrecisionRow(row),
  }));
  const buckets = classified.reduce<Record<string, number>>((acc, row) => {
    const outcome = String((row.precision as Record<string, unknown>).outcome ?? "unknown");
    acc[outcome] = (acc[outcome] ?? 0) + 1;
    return acc;
  }, {});
  const highQualityCount =
    (buckets.strong_project_signal ?? 0) + (buckets.probable_signal ?? 0);
  const weakSelectedCount = (buckets.context_only ?? 0) + (buckets.noise ?? 0);
  const staleRows = await countQuery(
    pool,
    `
      select
        count(*) filter (
          where fsr.total_filter_count = 0
            and (
              fsr.is_selected = true
              or fsr.final_decision = 'selected'
              or fsr.compat_system_feed_decision = 'pass_through'
            )
            and not exists (
              select 1
              from interest_filter_results ifr
              where ifr.doc_id = fsr.doc_id
                and ifr.filter_scope = 'system_criterion'
            )
        )::int as "stalePassThroughCount",
        count(*) filter (
          where not exists (
            select 1
            from interest_filter_results ifr
            where ifr.doc_id = fsr.doc_id
              and ifr.filter_scope = 'system_criterion'
          )
        )::int as "missingInterestFilterResults"
      from final_selection_results fsr
    `
  );
  const weakSamples = classified
    .filter((row) => ["context_only", "noise"].includes(String((row.precision as Record<string, unknown>).outcome)))
    .slice(0, 20);
  return {
    generatedAt: new Date().toISOString(),
    readOnly: true,
    inspectedSelectedCount: rows.length,
    highQualityCount,
    weakSelectedCount,
    buckets: {
      strong_project_signal: buckets.strong_project_signal ?? 0,
      probable_signal: buckets.probable_signal ?? 0,
      context_only: buckets.context_only ?? 0,
      noise: buckets.noise ?? 0,
    },
    staleSelection: staleRows[0] ?? {},
    interpretation: [
      "selected is the only web truth; this audit does not create a second public/private selected split",
      "context_only/noise selected rows are precision defects to fix through system interests, LLM templates, candidate-signal groups, and bounded replay",
      "source role, source health, source prior, adapter risk, and search provider metadata are intentionally absent from selection eligibility",
    ],
    samples: includeSamples
      ? {
          weakSelected: weakSamples,
          highQuality: classified
            .filter((row) => ["strong_project_signal", "probable_signal"].includes(String((row.precision as Record<string, unknown>).outcome)))
            .slice(0, 20),
        }
      : {},
    recommendedMcpActions: [
      {
        tool: "operator.tuning.recommend",
        reason: "Choose increase_precision when context_only/noise selected rows repeat.",
        arguments: { domain: "selection", objective: "increase_precision", includeSamples: true },
      },
      {
        tool: "system_interests.update",
        reason:
          "Tune active interests/templates so negative/veto cues beat broad semantic similarity and context-only cues stay diagnostic.",
      },
      {
        tool: "maintenance.reindex.request",
        reason: "Replay weak selected docIds in bounded chunks after MCP/admin config changes.",
        arguments: {
          payload: {
            indexName: "interest_centroids",
            jobKind: "backfill",
            options: {
              docIds: weakSamples.map((row) => row.docId),
              includeEnrichment: false,
              forceEnrichment: false,
              reason: "selection-precision-cleanup",
            },
          },
        },
      },
    ],
    nextReadBack: [
      "operator.report.verify reportKind=selection",
      "articles.holds.summary",
      "articles.residuals.summary",
      "maintenance.reindex_jobs.list",
      "content_items.list",
    ],
  };
}

function hasAnyText(text: string, needles: readonly string[]): boolean {
  const normalized = normalizeText(text);
  return needles.some((needle) => normalized.includes(normalizeText(needle)));
}

function buildReferenceFunnelSpec(args: Record<string, unknown>) {
  const objective = readOptionalString(args.objective) ?? "calibrated rare-signal funnel";
  const referenceEvidenceKind = readOptionalString(args.referenceEvidenceKind) ?? "reference_text";
  const referenceBundleKey = normalizeText(args.referenceBundleKey);
  const referenceText = [
    readOptionalString(args.referenceText) ?? "",
    referenceBundleKey,
  ].join(" ");
  const reference = normalizeText(referenceText);
  const rareSignal = hasAnyText(reference, [
    "rare",
    "hidden",
    "crumb",
    "low-yield",
    "buyer-side",
    "procurement",
    "marketplace project",
  ]);
  const contentKinds = uniqueStrings([
    "editorial",
    "listing",
    ...(hasAnyText(reference, ["procurement", "tender", "contract notice", "document"]) ? ["document"] : []),
    ...(hasAnyText(reference, ["api_payload", "api-like", "api payload"]) ? ["api_payload"] : []),
    ...(hasAnyText(reference, ["data_file", "dataset", "csv"]) ? ["data_file"] : []),
  ]);
  const guardrails = [
    {
      key: "direct_request_over_wrapper",
      requiredWhenReferenceMentions: ["marketplace", "wrapper", "project card"],
      phraseHints: ["wrapper", "marketplace", "direct buyer", "primary signal"],
    },
    {
      key: "seller_authored_rejection",
      requiredWhenReferenceMentions: ["seller", "agency", "vendor landing", "profile"],
      phraseHints: ["seller", "self-promotion", "agency page", "profile"],
    },
    {
      key: "formal_notice_without_exact_keyword",
      requiredWhenReferenceMentions: ["tender", "procurement", "contract notice"],
      phraseHints: ["formal", "tender", "contract notice", "procurement", "exact words"],
    },
    {
      key: "bland_title_body_evidence",
      requiredWhenReferenceMentions: ["bland", "competition", "contract notice"],
      phraseHints: ["bland", "title", "body", "procurement details"],
    },
  ].filter((guardrail) =>
    guardrail.requiredWhenReferenceMentions.some((hint) => reference.includes(normalizeText(hint)))
  );
  return {
    objective,
    referenceEvidenceKind,
    referenceBundleKey: readOptionalString(args.referenceBundleKey) ?? null,
    actorModel: rareSignal
      ? "Treat the reference as evidence for a rare-signal funnel: broad acquisition, strict independent content selection, and explicit near-miss rejection."
      : "Treat the reference as calibration evidence for a source-to-selection funnel.",
    hardGatePolicy: {
      mustHaveTermsBaseline: "empty_unless_marker_is_mandatory",
      timeWindowBaseline: "empty_or_null_for_initial_recall",
      broadHardGatesAreRisky: true,
    },
    allowedContentKinds: contentKinds,
    signalFamilies: [
      "direct buyer ask or project request",
      "formal procurement, tender, RFP/RFQ, award, or implementation notice",
      "delivery pressure with concrete implementation, migration, integration, or takeover object",
      "context signal that creates a follow-up hypothesis but is not enough for final selection alone",
    ],
    nearMissNegativeFamilies: [
      "seller-authored marketing, profile, ranking, case study, or award",
      "portal shell, navigation, index, category, or search page without a concrete item",
      "internal hiring or recruiter content",
      "generic topic commentary without an active sourcing event",
    ],
    sourceRoleMatrix: [
      "direct-intent source",
      "context source",
      "community or hidden-signal source",
      "directory or replacement source",
      "adapter-required source",
    ],
    promptGuardrails: guardrails,
    adapterPolicy:
      "API-like, ATS, marketplace, repository, or authenticated sources require adapter/mapping status and must not be disguised as RSS/website.",
    proofGates: [
      "operator.funnel.audit before writes",
      "system_interests.read and llm_templates.read after config changes",
      "maintenance.reindex.request bounded docIds chunks for existing content",
      "operator.report.verify reportKind=funnel_calibration and reportKind=selection after replay",
      "content_items.list for web-visible selected content",
    ],
  };
}

function classifyInterestFamily(row: Record<string, unknown>): string {
  const text = normalizeText(`${row.name ?? ""} ${row.description ?? ""}`);
  if (/procurement|rfp|rfq|tender|contract|award|bid/u.test(text)) return "procurement";
  if (/fund|startup|scaleup|series|seed/u.test(text)) return "funding";
  if (/hiring|capacity|staff|contractor|freelance/u.test(text)) return "capacity";
  if (/migration|integration|implementation|replacement|takeover|legacy/u.test(text)) {
    return "implementation";
  }
  if (/security|compliance|audit|deadline|cve|eol/u.test(text)) return "compliance";
  if (/smb|sme|small business|mid.market|local|chamber|association/u.test(text)) return "smb";
  return "other";
}

function summarizeDrift(
  spec: ReturnType<typeof buildReferenceFunnelSpec>,
  live: {
    interests: Record<string, unknown>[];
    llmTemplates: Record<string, unknown>[];
    discoveryRows: Record<string, unknown>[];
    adapterRows: Record<string, unknown>[];
  }
) {
  const hardGateDrift = live.interests
    .filter((row) => {
      const mustHave = compactStringList(row.mustHaveTerms);
      const shortRequired = compactStringList(row.shortTokensRequired);
      const timeWindow = row.timeWindowHours;
      return mustHave.length > 0 || shortRequired.length > 0 || timeWindow != null;
    })
    .map((row) => ({
      interestTemplateId: row.interestTemplateId,
      name: row.name,
      mustHaveTerms: compactStringList(row.mustHaveTerms),
      shortTokensRequired: compactStringList(row.shortTokensRequired),
      timeWindowHours: row.timeWindowHours,
      risk: "Rare-signal recall-first baselines should avoid broad hard gates until replay proves they are safe.",
    }));

  const expectedKinds = spec.allowedContentKinds;
  const contentKindDrift = live.interests
    .filter((row) => {
      const actual = compactStringList(row.allowedContentKinds);
      return expectedKinds.length > 0 && !expectedKinds.every((kind) => actual.includes(kind));
    })
    .map((row) => ({
      interestTemplateId: row.interestTemplateId,
      name: row.name,
      allowedContentKinds: compactStringList(row.allowedContentKinds),
      missingContentKinds: expectedKinds.filter(
        (kind) => !compactStringList(row.allowedContentKinds).includes(kind)
      ),
    }));

  const promptGuardrailDrift = spec.promptGuardrails
    .map((guardrail) => {
      const missingTemplates = live.llmTemplates
        .filter((row) => row.isActive !== false)
        .filter((row) => !hasAnyText(String(row.templateText ?? ""), guardrail.phraseHints))
        .map((row) => ({
          promptTemplateId: row.promptTemplateId,
          name: row.name,
          scope: row.scope,
        }));
      return {
        guardrail: guardrail.key,
        phraseHints: guardrail.phraseHints,
        missingTemplateCount: missingTemplates.length,
        missingTemplates,
      };
    })
    .filter((row) => row.missingTemplateCount > 0);

  const familyGroups = new Map<string, Record<string, unknown>[]>();
  for (const row of live.interests) {
    const family = classifyInterestFamily(row);
    familyGroups.set(family, [...(familyGroups.get(family) ?? []), row]);
  }
  const duplicateInterestRisk = [...familyGroups.entries()]
    .filter(([, rows]) => rows.length > 3)
    .map(([family, rows]) => ({
      family,
      activeCount: rows.length,
      samples: rows.slice(0, 8).map((row) => ({ interestTemplateId: row.interestTemplateId, name: row.name })),
      risk: "Many active interests in one signal family can split evidence and make calibration harder; consolidate only after retained-test evidence is no longer needed.",
    }));

  const sourceRoleGap = live.discoveryRows.filter((row) => Number(row.missingRoleCount ?? 0) > 0);
  const adapterRequiredGap = live.adapterRows;

  return {
    hardGateDrift,
    contentKindDrift,
    promptGuardrailDrift,
    duplicateInterestRisk,
    sourceRoleGap,
    adapterRequiredGap,
  };
}

function buildFunnelRecommendedActions(
  drift: ReturnType<typeof summarizeDrift>,
  domainPrefix: string | null
) {
  const actions: Array<Record<string, unknown>> = [];
  if (drift.hardGateDrift.length > 0 || drift.contentKindDrift.length > 0) {
    actions.push({
      tool: "system_interests.update",
      reason:
        "Align active calibrated interests with the portable rare-signal funnel policy: broad acquisition, minimal hard gates, explicit negative cues, and enough content kinds for formal evidence.",
      scope: domainPrefix ? { domainPrefix } : "review affected interests from operator.funnel.audit findings",
      payloadGuidance: {
        must_have_terms: [],
        time_window_hours: null,
        allowed_content_kinds: "preserve current valid kinds and add missing evidence kinds only where the signal family needs them",
      },
    });
  }
  if (drift.promptGuardrailDrift.length > 0) {
    actions.push({
      tool: "llm_templates.update",
      reason:
        "Add missing LLM guardrails from the portable reference spec without changing source-prior or source-health selection independence.",
      payloadGuidance: {
        guardrails:
          "direct request beats wrapper noise; seller-authored pages reject; formal notices can be valid without exact keywords; bland titles can pass when body has concrete evidence",
      },
    });
  }
  if (drift.adapterRequiredGap.length > 0) {
    actions.push({
      tool: "channels.alternatives.plan",
      reason:
        "Adapter-required/API-like candidates should be repaired or mapped through alternatives/adapters, not forced into RSS/website onboarding.",
    });
  }
  actions.push(
    {
      tool: "articles.residuals.list",
      reason: "Choose bounded gray/hold docId chunks only after calibration drift is understood.",
      arguments: { selectionMode: "hold", pageSize: 100 },
    },
    {
      tool: "maintenance.reindex.request",
      reason:
        "After MCP/admin config changes, replay existing content in bounded docId chunks and verify every chunk.",
      arguments: {
        payload: {
          indexName: "interest_centroids",
          jobKind: "backfill",
          options: {
            docIds: ["<bounded-doc-id-list>"],
            batchSize: 100,
            includeEnrichment: false,
            forceEnrichment: false,
            reason: "funnel-calibration-bounded-replay",
          },
        },
      },
    },
    {
      tool: "operator.report.verify",
      arguments: { reportKind: "funnel_calibration", entityIds: {}, includeSamples: true },
      reason: "Verify DB-backed calibration state after each bounded change.",
    }
  );
  return actions;
}

async function readFunnelLiveState(
  pool: Pool,
  options: { domainPrefix: string | null; includeDiscovery: boolean; includeSamples: boolean }
) {
  const domainLike = options.domainPrefix ? `%${options.domainPrefix}%` : null;
  const interestResult = await pool.query<Record<string, unknown>>(
    `
      select
        it.interest_template_id::text as "interestTemplateId",
        it.name,
        it.description,
        it.must_have_terms as "mustHaveTerms",
        it.must_not_have_terms as "mustNotHaveTerms",
        it.short_tokens_required as "shortTokensRequired",
        it.allowed_content_kinds as "allowedContentKinds",
        it.time_window_hours as "timeWindowHours",
        it.places,
        it.languages_allowed as "languagesAllowed",
        sp.definition_json as "definitionJson",
        sp.policy_json as "policyJson",
        it.is_active as "isActive",
        it.updated_at as "updatedAt"
      from interest_templates it
      left join selection_profiles sp on sp.source_interest_template_id = it.interest_template_id
      where it.is_active = true
        and ($1::text is null or it.name ilike $1::text or it.description ilike $1::text)
      order by it.updated_at desc, it.name asc
      limit 250
    `,
    [domainLike]
  );
  const llmResult = await pool.query<Record<string, unknown>>(
    `
      select
        prompt_template_id::text as "promptTemplateId",
        name,
        scope,
        language,
        template_text as "templateText",
        is_active as "isActive",
        updated_at as "updatedAt"
      from llm_prompt_templates
      where is_active = true
        and ($1::text is null or name ilike $1::text or template_text ilike $1::text)
      order by updated_at desc, scope asc, name asc
      limit 100
    `,
    [domainLike]
  );
  const compileRows = await pool.query<Record<string, unknown>>(
    `
      select
        count(*)::int as "activeInterests",
        count(c.criterion_id)::int as "activeInterestsWithCriterion",
        count(*) filter (
          where c.enabled = true
            and c.compiled = true
            and c.compile_status = 'compiled'
            and cc.compile_status = 'compiled'
        )::int as "compiledActiveCriteria",
        count(*) filter (
          where sp.status = 'active'
        )::int as "activeSelectionProfiles"
      from interest_templates it
      left join criteria c on c.source_interest_template_id = it.interest_template_id
      left join criteria_compiled cc on cc.criterion_id = c.criterion_id
      left join selection_profiles sp on sp.source_interest_template_id = it.interest_template_id
      where it.is_active = true
        and ($1::text is null or it.name ilike $1::text or it.description ilike $1::text)
    `,
    [domainLike]
  );
  const selectionRows = await pool.query<Record<string, unknown>>(
    `
      select final_decision as "finalDecision", count(*)::int as count
      from final_selection_results
      group by final_decision
      order by final_decision
    `
  );
  const webVisibleRows = await pool.query<Record<string, unknown>>(
    `
      select
        count(*) filter (where eligible_for_feed = true)::int as "webVisibleEligible",
        count(*) filter (where decision = 'eligible')::int as "eligibleRows",
        count(*) filter (where decision = 'pending_llm')::int as "pendingLlmRows",
        count(*)::int as "systemFeedRows"
      from system_feed_results
    `
  );
  const staleRows = await pool.query<Record<string, unknown>>(
    `
      select
        count(*) filter (
          where fsr.total_filter_count = 0
            and (
              fsr.is_selected = true
              or fsr.final_decision = 'selected'
              or fsr.compat_system_feed_decision = 'pass_through'
            )
            and not exists (
              select 1
              from interest_filter_results ifr
              where ifr.doc_id = fsr.doc_id
                and ifr.filter_scope = 'system_criterion'
            )
        )::int as "stalePassThroughCount",
        count(*) filter (
          where not exists (
            select 1
            from interest_filter_results ifr
            where ifr.doc_id = fsr.doc_id
              and ifr.filter_scope = 'system_criterion'
          )
        )::int as "missingInterestFilterResults"
      from final_selection_results fsr
    `
  );
  const residualRows = await pool.query<Record<string, unknown>>(
    `
      select
        verification_state as "verificationState",
        final_decision as "finalDecision",
        count(*)::int as count
      from final_selection_results
      group by verification_state, final_decision
      order by final_decision, verification_state
    `
  );
  const discoveryRows = options.includeDiscovery
    ? await pool.query<Record<string, unknown>>(
        `
          select
            target_id::text as "targetId",
            source_count as "sourceCount",
            strong_source_count as "strongSourceCount",
            missing_role_count as "missingRoleCount",
            coverage_score as "coverageScore",
            created_at as "createdAt"
          from discovery_coverage_snapshots
          order by created_at desc
          limit 25
        `
      )
    : { rows: [] };
  const adapterRows = options.includeDiscovery
    ? await pool.query<Record<string, unknown>>(
        `
          select
            provider_type as "providerType",
            endpoint_kind as "endpointKind",
            recommended_action as "recommendedAction",
            status,
            count(*)::int as count
          from discovery_source_endpoints
          where recommended_action in ('needs_config', 'monitor_only')
             or provider_type not in ('rss', 'website', 'api', 'email_imap')
          group by provider_type, endpoint_kind, recommended_action, status
          order by provider_type, endpoint_kind, recommended_action, status
          limit 50
        `
      )
    : { rows: [] };

  return {
    domainPrefix: options.domainPrefix,
    interests: interestResult.rows,
    llmTemplates: llmResult.rows,
    compileStatus: compileRows.rows[0] ?? {},
    selectionCounts: selectionRows.rows,
    webVisibility: webVisibleRows.rows[0] ?? {},
    staleSelection: staleRows.rows[0] ?? {},
    residualCounts: residualRows.rows,
    discoveryRows: discoveryRows.rows,
    adapterRows: adapterRows.rows,
    samples: options.includeSamples
      ? {
          interests: interestResult.rows.slice(0, 12).map((row) => ({
            interestTemplateId: row.interestTemplateId,
            name: row.name,
            mustHaveTerms: row.mustHaveTerms,
            timeWindowHours: row.timeWindowHours,
            allowedContentKinds: row.allowedContentKinds,
          })),
          llmTemplates: llmResult.rows.slice(0, 8).map((row) => ({
            promptTemplateId: row.promptTemplateId,
            name: row.name,
            scope: row.scope,
          })),
        }
      : {},
  };
}

export async function buildFunnelAudit(
  context: McpToolContext,
  args: Record<string, unknown>
) {
  const objective = readOptionalString(args.objective) ?? "funnel calibration";
  const domainPrefix = readOptionalString(args.domainPrefix) ?? null;
  const includeDiscovery = args.includeDiscovery !== false;
  const includeSamples = args.includeSamples === true;
  const portableFunnelSpec = buildReferenceFunnelSpec({ ...args, objective });
  const live = await readFunnelLiveState(context.pool, {
    domainPrefix,
    includeDiscovery,
    includeSamples,
  });
  const drift = summarizeDrift(portableFunnelSpec, {
    interests: live.interests,
    llmTemplates: live.llmTemplates,
    discoveryRows: live.discoveryRows,
    adapterRows: live.adapterRows,
  });
  const findings = [
    {
      findingType: "hardGateDrift",
      severity: drift.hardGateDrift.length > 0 ? "warning" : "info",
      count: drift.hardGateDrift.length,
      evidence: includeSamples ? drift.hardGateDrift.slice(0, 20) : drift.hardGateDrift.slice(0, 5),
      interpretation:
        "Rare-signal funnels usually lose recall when broad must-have terms, short-token requirements, or time windows are used as early hard gates.",
    },
    {
      findingType: "contentKindDrift",
      severity: drift.contentKindDrift.length > 0 ? "warning" : "info",
      count: drift.contentKindDrift.length,
      evidence: includeSamples ? drift.contentKindDrift.slice(0, 20) : drift.contentKindDrift.slice(0, 5),
      interpretation:
        "Formal evidence may arrive as listings, documents, data files, or API payloads; content-kind gaps can hide acquisition success before selection.",
    },
    {
      findingType: "promptGuardrailDrift",
      severity: drift.promptGuardrailDrift.length > 0 ? "warning" : "info",
      count: drift.promptGuardrailDrift.length,
      evidence: drift.promptGuardrailDrift,
      interpretation:
        "LLM review should reject wrapper/seller/navigation noise while preserving direct buyer requests and concrete formal notices.",
    },
    {
      findingType: "duplicateInterestRisk",
      severity: drift.duplicateInterestRisk.length > 0 ? "info" : "info",
      count: drift.duplicateInterestRisk.length,
      evidence: drift.duplicateInterestRisk,
      interpretation:
        "Duplicate signal-family interests may be intentional retained-test evidence, but calibration should know when evidence is split across many active copies.",
    },
    {
      findingType: "sourceRoleGap",
      severity: drift.sourceRoleGap.length > 0 ? "warning" : "info",
      count: drift.sourceRoleGap.length,
      evidence: includeSamples ? drift.sourceRoleGap.slice(0, 10) : [],
      interpretation:
        "Discovery coverage gaps should be handled by source expansion/repair, not by loosening final content selection.",
    },
    {
      findingType: "adapterRequiredGap",
      severity: drift.adapterRequiredGap.length > 0 ? "warning" : "info",
      count: drift.adapterRequiredGap.length,
      evidence: drift.adapterRequiredGap,
      interpretation:
        "API-like or adapter-required candidates need adapters/mapping or alternatives; they should not be forced into fake RSS/website rows.",
    },
  ];
  return {
    generatedAt: new Date().toISOString(),
    objective,
    readOnly: true,
    mutationPolicy:
      "This audit never writes configuration, starts discovery, onboards channels, or queues replay. Apply recommendations only through explicit MCP/admin writes.",
    portableFunnelSpec,
    liveStateSummary: {
      domainPrefix,
      interests: live.interests.length,
      llmTemplates: live.llmTemplates.length,
      compileStatus: live.compileStatus,
      selectionCounts: live.selectionCounts,
      webVisibility: live.webVisibility,
      staleSelection: live.staleSelection,
      residualCounts: live.residualCounts,
      discoveryCoverageRows: live.discoveryRows.length,
      adapterRequiredRows: live.adapterRows.length,
      samples: live.samples,
    },
    findings,
    drift,
    recommendedMcpActions: buildFunnelRecommendedActions(drift, domainPrefix),
    riskNotes: [
      "Reference evidence is calibration input, not canonical runtime truth.",
      "Domain vocabulary must remain in MCP/admin configuration and tests, not hardcoded selection/discovery runtime logic.",
      "Source health and source priors remain independent from article selection, ranking, escalation, web visibility, and counts.",
      "If async workers are running, repeat report verification after bounded replay or fetch cycles complete.",
    ],
    nextReadBack: [
      "operator.report.verify reportKind=funnel_calibration",
      "system_interests.compile_status.list",
      "templates.duplicates.audit",
      "articles.residuals.summary",
      "content_items.list",
    ],
  };
}

export async function buildFunnelAutoplan(context: McpToolContext, args: Record<string, unknown>) {
  const includeExamples = args.includeSamples === true;
  const coverage = await getSourceFamilyCoverageWithPool(context.pool, { includeExamples });
  return {
    generatedAt: new Date().toISOString(),
    readOnly: true,
    mutationPolicy:
      "This plan does not mutate sources, discovery targets, templates, interests, replay jobs, or channel activation state. Apply bounded follow-through through explicit MCP tools only.",
    ...buildCoverageFirstAutoplan({
      objective: readOptionalString(args.objective) ?? undefined,
      maxNewChannels: readOptionalInteger(args.maxNewChannels) ?? undefined,
      coverage,
    }),
    currentSourceFamilyCoverage: coverage,
    recommendedMcpActions: [
      { tool: "discovery.source_families.coverage", arguments: { includeExamples } },
      { tool: "operator.report.verify", arguments: { reportKind: "source_family_balance", entityIds: {}, includeSamples: includeExamples } },
      { tool: "discovery.source_roles.plan", arguments: { objective: readOptionalString(args.objective) ?? "coverage-first rare-signal funnel", rareSignal: true } },
      { tool: "operator.selection.precision_audit", arguments: { includeSamples: includeExamples } },
    ],
    nextReadBack: [
      "discovery.source_families.coverage",
      "operator.report.verify reportKind=source_family_balance",
      "operator.funnel.iteration.recommend",
      "operator.report.verify reportKind=selection",
    ],
  };
}

export async function buildFunnelIterationRecommendation(
  context: McpToolContext,
  args: Record<string, unknown>
) {
  const includeExamples = args.includeSamples === true;
  const coverage = await getSourceFamilyCoverageWithPool(context.pool, { includeExamples });
  return {
    generatedAt: new Date().toISOString(),
    readOnly: true,
    mutationPolicy:
      "Recommendations never disable working noisy/low-yield semantic sources. Use explicit operator action and reason for any deactivation.",
    ...buildCoverageFirstIterationRecommendation({
      objective: readOptionalString(args.objective) ?? undefined,
      coverage,
    }),
    currentSourceFamilyCoverage: coverage,
  };
}

function readDomains(value: unknown): OperatingDomain[] {
  const requested = readStringArray(value).filter((entry): entry is OperatingDomain =>
    (OPERATING_DOMAIN_VALUES as readonly string[]).includes(entry)
  );
  return requested.length > 0 ? requested : [...OPERATING_DOMAIN_VALUES];
}

function readSinceHours(value: unknown, fallback = 24): number {
  const parsed = readOptionalInteger(value);
  if (parsed == null) {
    return fallback;
  }
  return Math.min(Math.max(parsed, 1), 24 * 30);
}

function readEntityIds(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function compactRows(rows: unknown[], includeSamples: boolean, limit = 8): unknown[] {
  return includeSamples ? rows.slice(0, limit) : [];
}

function issue(
  severity: IssueSeverity,
  domain: OperatingDomain,
  title: string,
  evidence: Record<string, unknown>,
  nextSteps: string[]
) {
  return {
    severity,
    domain,
    title,
    evidence,
    nextSteps,
  };
}

async function allSettledRecord<T extends Record<string, Promise<unknown>>>(
  entries: T
): Promise<Record<keyof T, unknown>> {
  const resolved = await Promise.allSettled(Object.values(entries));
  const result: Record<string, unknown> = {};
  Object.keys(entries).forEach((key, index) => {
    const item = resolved[index];
    result[key] =
      item?.status === "fulfilled"
        ? item.value
        : {
            unavailable: true,
            error: item?.reason instanceof Error ? item.reason.message : "request failed",
          };
  });
  return result as Record<keyof T, unknown>;
}

async function countQuery(pool: Pool, sql: string, params: unknown[] = []) {
  const result = await pool.query(sql, params);
  return result.rows;
}

export function getOperatingModelGuide() {
  return {
    model: "observe -> diagnose -> recommend -> guarded change -> verify effect -> monitor",
    domains: OPERATING_DOMAIN_REGISTRY,
    operatingRules: [
      "Operational tools are read-only unless their normal MCP tool name already advertises a write scope.",
      "Diagnosis must state source-of-truth evidence and stale-data warnings.",
      "Tuning recommendations can include suggestedToolCalls, but they never execute them.",
      "After writes, clients should read the affected entity plus newsportal://ops/health and newsportal://ops/issues.",
    ],
    fallbackForLimitedClients: {
      notifications:
        "If resources/subscribe is not supported, mutation responses include nextReadBack resources/tools.",
      elicitation:
        "If client-side elicitation is unavailable, operator.tuning.recommend returns tuningChoices and asks the client to choose an objective before writing.",
    },
  };
}

export function getDiagnosticsGuide(domain: string) {
  const guide = OPERATING_DOMAIN_REGISTRY[domain as OperatingDomain];
  return guide
    ? {
        domain,
        guide,
        diagnosticFlow: [
          "Start with operator.system.health scoped to this domain.",
          "Use operator.issue.explain for the concrete symptom.",
          "Inspect the suggested samples with domain list/read/explain tools.",
          "Call operator.tuning.recommend only after the repeated evidence pattern is clear.",
        ],
      }
    : {
        domain,
        knownDomains: OPERATING_DOMAIN_VALUES,
        error: "Unknown operating domain.",
      };
}

export function getTuningGuide(domain: string) {
  const guide = OPERATING_DOMAIN_REGISTRY[domain as OperatingDomain];
  return guide
    ? {
        domain,
        tuningLevers: guide.tuningLevers,
        readBackChecks: guide.readBackChecks,
        safeTuningRules: [
          "Choose one objective per tuning session.",
          "Prefer narrow configuration changes over broad rewrites.",
          "Do not use downstream diagnostics as automatic approval; use them as operator evidence.",
          "Verify effect with operator.effect.verify after applying guarded writes.",
        ],
        objectives: [
          "increase_recall",
          "increase_precision",
          "reduce_cost",
          "debug_source",
          "stabilize_discovery",
        ],
      }
    : {
        domain,
        knownDomains: OPERATING_DOMAIN_VALUES,
        error: "Unknown operating domain.",
      };
}

export async function buildSystemHealth(
  { sdk, pool }: McpToolContext,
  args: Record<string, unknown> = {}
) {
  const domains = readDomains(args.domains);
  const sinceHours = readSinceHours(args.sinceHours, 24);
  const includeSamples = args.includeSamples === true;

  const [
    channels,
    fetchRuns,
    webResources,
    selection,
    selectionStalePassThrough,
    contentAnalysis,
    contentFilters,
    discovery,
    sequences,
    cleanup,
    mcpErrors,
    apiSummaries,
  ] = await Promise.all([
    countQuery(
      pool,
      `
        select provider_type as "providerType", is_active as "isActive", count(*)::int as count
        from source_channels
        group by provider_type, is_active
        order by provider_type, is_active desc
      `
    ),
    countQuery(
      pool,
      `
        select outcome_kind as "outcomeKind", provider_type as "providerType", count(*)::int as count
        from channel_fetch_runs
        where started_at >= now() - ($1::int * interval '1 hour')
        group by outcome_kind, provider_type
        order by provider_type, outcome_kind
      `,
      [sinceHours]
    ),
    countQuery(
      pool,
      `
        select wr.extraction_state as "extractionState",
               wr.projection_state as "projectionState",
               coalesce(fsr.final_decision, 'not_projected') as "finalDecision",
               count(*)::int as count
        from web_resources wr
        left join final_selection_results fsr on fsr.doc_id = wr.projected_article_id
        where wr.updated_at >= now() - ($1::int * interval '1 hour')
        group by wr.extraction_state, wr.projection_state, coalesce(fsr.final_decision, 'not_projected')
        order by wr.extraction_state, wr.projection_state, coalesce(fsr.final_decision, 'not_projected')
      `,
      [sinceHours]
    ),
    countQuery(
      pool,
      `
        select final_decision as "finalDecision", verification_state as "verificationState", count(*)::int as count
        from final_selection_results
        where updated_at >= now() - ($1::int * interval '1 hour')
        group by final_decision, verification_state
        order by final_decision, verification_state
      `,
      [sinceHours]
    ),
    countQuery(
      pool,
      `
        select count(*)::int as "stalePassThroughCount"
        from final_selection_results fsr
        where fsr.updated_at >= now() - ($1::int * interval '1 hour')
          and fsr.total_filter_count = 0
          and (
            fsr.is_selected = true
            or fsr.final_decision = 'selected'
            or fsr.compat_system_feed_decision = 'pass_through'
          )
          and not exists (
            select 1
            from interest_filter_results ifr
            where ifr.doc_id = fsr.doc_id
              and ifr.filter_scope = 'system_criterion'
          )
      `,
      [sinceHours]
    ),
    countQuery(
      pool,
      `
        select analysis_type as "analysisType", status, count(*)::int as count
        from content_analysis_results
        where updated_at >= now() - ($1::int * interval '1 hour')
        group by analysis_type, status
        order by analysis_type, status
      `,
      [sinceHours]
    ),
    countQuery(
      pool,
      `
        select decision, passed, mode, count(*)::int as count
        from content_filter_results
        where updated_at >= now() - ($1::int * interval '1 hour')
        group by decision, passed, mode
        order by decision, mode
      `,
      [sinceHours]
    ),
    countQuery(
      pool,
      `
          select kind, status, count(*)::int as count
        from (
          select 'target' as kind, status from discovery_targets
          union all
          select 'run' as kind, status from discovery_runs
          union all
          select 'endpoint' as kind, status from discovery_source_endpoints
          union all
          select 'contract' as kind, status from discovery_source_contracts
          union all
          select 'claim' as kind, status from discovery_claims
        ) state
        group by kind, status
        order by kind, status
      `
    ),
    countQuery(
      pool,
      `
        select status, trigger_type as "triggerType", count(*)::int as count
        from sequence_runs
        where created_at >= now() - ($1::int * interval '1 hour')
        group by status, trigger_type
        order by status, trigger_type
      `,
      [sinceHours]
    ),
    countQuery(
      pool,
      `
        select
          (select count(*)::int from source_channels where is_active = true) as "activeChannels",
          (select count(*)::int from sequences where created_by like 'migration:%' and status in ('draft', 'active')) as "protectedActiveSequences",
          (select count(*)::int from mcp_access_tokens where status = 'active' and (expires_at is null or expires_at > now())) as "activeMcpTokens"
      `
    ),
    countQuery(
      pool,
      `
        select count(*)::int as "errorCount",
               count(*) filter (where error_text ilike '%422%' or error_text ilike '%Unprocessable Entity%')::int as "backend422LikeErrors"
        from mcp_request_log
        where success = false
          and created_at >= now() - ($1::int * interval '1 hour')
      `,
      [sinceHours]
    ),
    allSettledRecord({
      dashboardSummary: sdk.getDashboardSummary<Record<string, unknown>>(),
      discoverySummary: sdk.getDiscoverySummary<Record<string, unknown>>(),
      llmBudgetSummary: sdk.getLlmBudgetSummary<Record<string, unknown>>(),
      residualSummary: sdk.getArticleResidualSummary<Record<string, unknown>>(),
    }),
  ]);

  const issues = buildIssuesFromHealth({
    channels,
    fetchRuns,
    webResources,
    selection,
    selectionStalePassThrough: selectionStalePassThrough[0] ?? {},
    contentAnalysis,
    contentFilters,
    discovery,
    sequences,
    cleanup: cleanup[0] ?? {},
    mcpErrors: mcpErrors[0] ?? {},
  });

  const samples = includeSamples
    ? await collectHealthSamples(pool, sinceHours)
    : {};

  return {
    generatedAt: new Date().toISOString(),
    sinceHours,
    domains,
    sourceOfTruth: [
      "PostgreSQL source_channels/channel_fetch_runs/web_resources/final_selection_results/content_analysis_results/content_filter_results/discovery*/sequence_runs/mcp_request_log",
      "API-backed dashboard/discovery/LLM budget/article residual summaries",
    ],
    health: {
      channels,
      fetchRuns,
      webResources,
      selection,
      selectionStalePassThrough: selectionStalePassThrough[0] ?? {},
      contentAnalysis,
      contentFilters,
      discovery,
      sequences,
      cleanup: cleanup[0] ?? {},
      mcpErrors: mcpErrors[0] ?? {},
      apiSummaries,
    },
    issues: issues.filter((entry) => domains.includes(entry.domain)),
    samples,
    nextReadBack: [
      "newsportal://ops/health",
      "newsportal://ops/issues",
      "operator.report.verify",
    ],
  };
}

function buildIssuesFromHealth(input: Record<string, unknown>) {
  const fetchRows = Array.isArray(input.fetchRuns) ? input.fetchRuns as Record<string, unknown>[] : [];
  const webRows = Array.isArray(input.webResources) ? input.webResources as Record<string, unknown>[] : [];
  const selectionRows = Array.isArray(input.selection) ? input.selection as Record<string, unknown>[] : [];
  const selectionStalePassThrough = isRecord(input.selectionStalePassThrough)
    ? input.selectionStalePassThrough
    : {};
  const analysisRows =
    Array.isArray(input.contentAnalysis) ? input.contentAnalysis as Record<string, unknown>[] : [];
  const filterRows =
    Array.isArray(input.contentFilters) ? input.contentFilters as Record<string, unknown>[] : [];
  const sequenceRows = Array.isArray(input.sequences) ? input.sequences as Record<string, unknown>[] : [];
  const discoveryRows = Array.isArray(input.discovery) ? input.discovery as Record<string, unknown>[] : [];
  const cleanup = isRecord(input.cleanup) ? input.cleanup : {};
  const mcpErrors = isRecord(input.mcpErrors) ? input.mcpErrors : {};
  const issues = [];

  const failedFetches = fetchRows
    .filter((row) => ["hard_failure", "transient_failure", "rate_limited"].includes(String(row.outcomeKind)))
    .reduce((sum, row) => sum + Number(row.count ?? 0), 0);
  if (failedFetches > 0) {
    issues.push(
      issue("warning", "channels", "Recent fetch failures or rate limits exist.", { failedFetches }, [
        "Inspect fetch_runs.list for affected channels.",
        "Check provider URL, auth/rate limits, and poll interval before tuning downstream selection.",
      ])
    );
  }

  const projectedRejected = webRows
    .filter((row) => row.projectionState === "projected_to_common_pipeline" && row.finalDecision === "rejected")
    .reduce((sum, row) => sum + Number(row.count ?? 0), 0);
  if (projectedRejected > 0) {
    issues.push(
      issue(
        "info",
        "website_pipeline",
        "Website resources projected into the common pipeline but were rejected downstream.",
        { projectedRejected },
        [
          "Treat this as selection/filter evidence, not channel creation failure.",
          "Inspect articles.explain and content_filter_results.list for projected article IDs.",
        ]
      )
    );
  }

  const grayZone = selectionRows
    .filter((row) => row.finalDecision === "gray_zone")
    .reduce((sum, row) => sum + Number(row.count ?? 0), 0);
  const stalePassThroughCount = Number(selectionStalePassThrough.stalePassThroughCount ?? 0);
  if (stalePassThroughCount > 0) {
    issues.push(
      issue(
        "warning",
        "selection",
        "Stale selected/pass_through rows lack system-criterion interest_filter_results.",
        { stalePassThroughCount },
        [
          "Likely cause: selection backfill needed after interest/template/criteria changes.",
          "Queue maintenance.reindex.request with payload.indexName=interest_centroids and payload.jobKind=backfill.",
          "After completion, verify with maintenance.reindex_jobs.list and operator.report.verify reportKind=selection.",
        ]
      )
    );
  }
  if (grayZone > 0) {
    issues.push(
      issue("info", "selection", "Gray-zone selections are being held by policy.", { grayZone }, [
        "Use articles.residuals.summary and articles.explain before changing review policy.",
        "Tune one interest/template/profile at a time if this is too conservative.",
      ])
    );
  }

  const failedAnalysis = analysisRows
    .filter((row) => row.status === "failed")
    .reduce((sum, row) => sum + Number(row.count ?? 0), 0);
  const blockingFilters = filterRows
    .filter((row) => row.passed === false || ["reject", "hold", "needs_review"].includes(String(row.decision)))
    .reduce((sum, row) => sum + Number(row.count ?? 0), 0);
  if (failedAnalysis > 0 || blockingFilters > 0) {
    issues.push(
      issue("warning", "content_analysis", "Content analysis/filtering has failed or blocking decisions.", {
        failedAnalysis,
        blockingFilters,
      }, [
        "Read content_analysis.list and content_filter_results.list by subject/channel.",
        "Check policy mode before loosening selection interests.",
      ])
    );
  }

  const failedRuns = sequenceRows
    .filter((row) => row.status === "failed")
    .reduce((sum, row) => sum + Number(row.count ?? 0), 0);
  if (failedRuns > 0) {
    issues.push(
      issue("warning", "sequences", "Recent sequence runs failed.", { failedRuns }, [
        "Read sequences.runs.read and sequences.run_task_runs.list for failed run IDs.",
        "Retry only after the failed task and context are understood.",
      ])
    );
  }

  const weakDiscovery = discoveryRows
    .filter((row) => row.kind === "endpoint" && ["rejected", "duplicate"].includes(String(row.status)))
    .reduce((sum, row) => sum + Number(row.count ?? 0), 0);
  if (weakDiscovery > 0) {
    issues.push(
      issue("info", "discovery", "Discovery has rejected or duplicate endpoints.", { weakDiscovery }, [
        "Review rejected reasons before changing target coverage policy or thresholds.",
        "Rejected endpoints may be correct for captcha/login/unsupported kind, duplicate identity, or missing-contract cases.",
      ])
    );
  }

  if (Number(cleanup.activeChannels ?? 0) === 0) {
    issues.push(
      issue("info", "cleanup", "System currently has zero active channels.", cleanup, [
        "This is expected only after intentional cleanup.",
        "Before product testing, create channels or run an example setup.",
      ])
    );
  }

  if (Number(mcpErrors.backend422LikeErrors ?? 0) > 0) {
    issues.push(
      issue("critical", "cleanup", "Recent MCP requests still produced backend 422-like errors.", mcpErrors, [
        "Add or tighten MCP boundary validation for the failing tool.",
        "Regression proof should assert MCP -32602 instead of backend 422.",
      ])
    );
  }

  return issues;
}

async function collectHealthSamples(pool: Pool, sinceHours: number) {
  const [
    failedFetchRuns,
    rejectedWebsiteResources,
    grayZoneSelections,
    stalePassThroughSelections,
    failedSequences,
    mcpErrors,
  ] =
    await Promise.all([
      countQuery(
        pool,
        `
          select fetch_run_id::text as "fetchRunId", channel_id::text as "channelId",
                 provider_type as "providerType", outcome_kind as "outcomeKind",
                 error_text as "errorText", started_at as "startedAt"
          from channel_fetch_runs
          where started_at >= now() - ($1::int * interval '1 hour')
            and outcome_kind in ('hard_failure', 'transient_failure', 'rate_limited')
          order by started_at desc
          limit 8
        `,
        [sinceHours]
      ),
      countQuery(
        pool,
        `
          select wr.resource_id::text as "resourceId", wr.channel_id::text as "channelId",
                 wr.title, wr.url, wr.projection_state as "projectionState",
                 wr.projected_article_id::text as "projectedArticleId",
                 fsr.final_decision as "finalDecision"
          from web_resources wr
          join final_selection_results fsr on fsr.doc_id = wr.projected_article_id
          where wr.updated_at >= now() - ($1::int * interval '1 hour')
            and fsr.final_decision = 'rejected'
          order by wr.updated_at desc
          limit 8
        `,
        [sinceHours]
      ),
      countQuery(
        pool,
        `
          select doc_id::text as "docId", verification_state as "verificationState",
                 matched_filter_count as "matchedFilterCount",
                 gray_zone_filter_count as "grayZoneFilterCount",
                 updated_at as "updatedAt"
          from final_selection_results
          where updated_at >= now() - ($1::int * interval '1 hour')
            and final_decision = 'gray_zone'
          order by updated_at desc
          limit 8
        `,
        [sinceHours]
      ),
      countQuery(
        pool,
        `
          select fsr.doc_id::text as "docId",
                 fsr.final_decision as "finalDecision",
                 fsr.compat_system_feed_decision as "compatSystemFeedDecision",
                 fsr.total_filter_count as "totalFilterCount",
                 fsr.updated_at as "updatedAt"
          from final_selection_results fsr
          where fsr.updated_at >= now() - ($1::int * interval '1 hour')
            and fsr.total_filter_count = 0
            and (
              fsr.is_selected = true
              or fsr.final_decision = 'selected'
              or fsr.compat_system_feed_decision = 'pass_through'
            )
            and not exists (
              select 1
              from interest_filter_results ifr
              where ifr.doc_id = fsr.doc_id
                and ifr.filter_scope = 'system_criterion'
            )
          order by fsr.updated_at desc
          limit 8
        `,
        [sinceHours]
      ),
      countQuery(
        pool,
        `
          select run_id::text as "runId", sequence_id::text as "sequenceId",
                 status, trigger_type as "triggerType", created_at as "updatedAt"
          from sequence_runs
          where created_at >= now() - ($1::int * interval '1 hour')
            and status = 'failed'
          order by created_at desc
          limit 8
        `,
        [sinceHours]
      ),
      countQuery(
        pool,
        `
          select request_log_id::text as "requestLogId", request_method as "requestMethod",
                 tool_name as "toolName", error_text as "errorText", created_at as "createdAt"
          from mcp_request_log
          where success = false
            and created_at >= now() - ($1::int * interval '1 hour')
          order by created_at desc
          limit 8
        `,
        [sinceHours]
      ),
    ]);
  return {
    failedFetchRuns,
    rejectedWebsiteResources,
    grayZoneSelections,
    stalePassThroughSelections,
    failedSequences,
    mcpErrors,
  };
}

export async function explainOperatorIssue(context: McpToolContext, args: Record<string, unknown>) {
  const symptom = readOptionalString(args.symptom) ?? "general operational issue";
  const domain = (readOptionalString(args.domain) ?? inferDomainFromSymptom(symptom)) as OperatingDomain;
  const sinceHours = readSinceHours(args.sinceHours, 24);
  const includeSamples = args.includeSamples === true;
  const entityIds = readEntityIds(args.entityIds);
  const guide = OPERATING_DOMAIN_REGISTRY[domain];
  const health = await buildSystemHealth(context, {
    domains: [domain],
    sinceHours,
    includeSamples,
  });
  const selectionStalePassThrough =
    isRecord(health.health) && isRecord(health.health.selectionStalePassThrough)
      ? health.health.selectionStalePassThrough
      : {};
  const stalePassThroughCount = Number(selectionStalePassThrough.stalePassThroughCount ?? 0);
  const likelyCauses =
    domain === "selection" && stalePassThroughCount > 0 && guide
      ? [
          "selection backfill needed: selected/pass_through rows exist with total_filter_count=0 and no system_criterion interest_filter_results",
          ...guide.commonCauses,
        ]
      : guide?.commonCauses;

  return {
    generatedAt: new Date().toISOString(),
    symptom,
    domain,
    sourceOfTruth: health.sourceOfTruth,
    diagnosis: guide
      ? {
          lifecycle: guide.lifecycle,
          likelyCauses,
          normalStatesToCheck: guide.normalStates,
          readBackChecks: guide.readBackChecks,
        }
      : {
          unknownDomain: domain,
          knownDomains: OPERATING_DOMAIN_VALUES,
        },
    evidence: {
      entityIds,
      health: health.health,
      issues: health.issues,
      samples: compactRows(Object.values(health.samples ?? {}), includeSamples),
    },
    staleDataWarnings: [
      `Evidence is scoped to the last ${sinceHours} hours unless entityIds force a narrower read.`,
      "If async workers are still running, repeat the same read after the run finishes.",
      ...(domain === "selection" && stalePassThroughCount > 0
        ? [
            "Selection backfill is likely needed before trusting selected/pass_through counts after interest/template/criteria changes.",
          ]
        : []),
    ],
    nextSteps:
      domain === "selection" && stalePassThroughCount > 0
        ? [
            "maintenance.reindex.request payload={indexName: interest_centroids, jobKind: backfill}",
            "maintenance.reindex_jobs.list until completed/failed",
            "operator.report.verify reportKind=selection after completion",
          ]
        : guide?.readBackChecks ?? ["operator.system.health"],
  };
}

function inferDomainFromSymptom(symptom: string): OperatingDomain {
  const normalized = symptom.toLowerCase();
  if (normalized.includes("website") || normalized.includes("resource") || normalized.includes("project")) {
    return "website_pipeline";
  }
  if (normalized.includes("llm") || normalized.includes("budget") || normalized.includes("gray")) {
    return "llm_budget";
  }
  if (normalized.includes("discover") || normalized.includes("candidate") || normalized.includes("recall")) {
    return "discovery";
  }
  if (normalized.includes("sequence") || normalized.includes("run")) {
    return "sequences";
  }
  if (normalized.includes("filter") || normalized.includes("analysis") || normalized.includes("label")) {
    return "content_analysis";
  }
  if (normalized.includes("cleanup") || normalized.includes("token")) {
    return "cleanup";
  }
  if (normalized.includes("channel") || normalized.includes("fetch")) {
    return "channels";
  }
  return "selection";
}

export async function recommendOperatorTuning(
  context: McpToolContext,
  args: Record<string, unknown>
) {
  const domain = (readOptionalString(args.domain) ?? "selection") as OperatingDomain;
  const objective = readOptionalString(args.objective) ?? "increase_precision";
  const residualBucket = readOptionalString(args.residualBucket);
  const sinceHours = readSinceHours(args.sinceHours, 24);
  const entityIds = readEntityIds(args.entityIds);
  const guide = OPERATING_DOMAIN_REGISTRY[domain];
  const issueExplanation = await explainOperatorIssue(context, {
    symptom: residualBucket ?? objective,
    domain,
    entityIds,
    sinceHours,
    includeSamples: args.includeSamples === true,
  });

  const recommendations = buildTuningRecommendations(domain, objective, residualBucket);
  return {
    generatedAt: new Date().toISOString(),
    domain,
    objective,
    residualBucket,
    diagnosis: issueExplanation.diagnosis,
    evidence: issueExplanation.evidence,
    tuningChoices: [
      "increase_recall",
      "increase_precision",
      "reduce_cost",
      "debug_source",
      "stabilize_discovery",
    ],
    recommendedChanges: recommendations.recommendedChanges,
    riskLevel: recommendations.riskLevel,
    expectedEffect: recommendations.expectedEffect,
    verificationPlan: [
      ...(guide?.readBackChecks ?? []),
      "operator.effect.verify",
      "newsportal://ops/health",
      "newsportal://ops/issues",
    ],
    suggestedToolCalls: recommendations.suggestedToolCalls,
    mutationPolicy:
      "This tool is advisory and read-only. Apply changes only through the suggested guarded MCP write tools after an operator chooses the objective.",
  };
}

function buildTuningRecommendations(
  domain: OperatingDomain,
  objective: string,
  residualBucket: string | null
) {
  const base = {
    riskLevel: "medium",
    expectedEffect: "Bounded configuration change with measurable read-back evidence.",
    recommendedChanges: [] as Array<Record<string, unknown>>,
    suggestedToolCalls: [] as Array<Record<string, unknown>>,
  };
  if (domain === "website_pipeline" || objective === "debug_source") {
    base.riskLevel = "low";
    base.expectedEffect =
      "Clarify whether the issue is source acquisition, resource projection, or downstream selection before changing policy.";
    base.recommendedChanges.push({
      target: "website channel/resource settings",
      action: "Inspect fetch runs and resources first; tune website discovery settings only for repeated extraction/projection failures.",
      reason: residualBucket ?? "website resources need source-of-truth diagnosis",
    });
    base.suggestedToolCalls.push(
      { toolName: "fetch_runs.list", argumentsTemplate: { channelId: "<channelId>" } },
      { toolName: "web_resources.list", argumentsTemplate: { channelId: "<channelId>", projection: "all" } }
    );
    return base;
  }
  if (domain === "llm_budget" || objective === "reduce_cost") {
    base.riskLevel = "medium";
    base.expectedEffect = "Reduce unnecessary LLM escalation while preserving deterministic selection evidence.";
    base.recommendedChanges.push({
      target: "LLM review/template policy",
      action: "Narrow review mode or template scope for repeated low-value gray-zone items.",
      reason: residualBucket ?? "cost or hold pressure",
    });
    base.suggestedToolCalls.push(
      { toolName: "llm_budget.summary", argumentsTemplate: {} },
      { toolName: "llm_templates.update", argumentsTemplate: { promptTemplateId: "<templateId>", payload: {} } }
    );
    return base;
  }
  if (domain === "discovery" || objective === "stabilize_discovery") {
    base.riskLevel = "medium";
    base.expectedEffect = "Improve coverage and endpoint quality without forcing weak promotions or noisy hidden signals.";
    base.recommendedChanges.push({
      target: "discovery coverage/provider/contract policy",
      action: "Inspect gaps, endpoints, contracts, negative evidence and provider health before changing thresholds; prove threshold changes through replay eval.",
      reason: residualBucket ?? "discovery yield needs tuning",
    });
    base.suggestedToolCalls.push(
      { toolName: "discovery.endpoints.list", argumentsTemplate: { status: "rejected" } },
      { toolName: "discovery.negative_evidence.list", argumentsTemplate: {} },
      { toolName: "discovery.eval_runs.list", argumentsTemplate: {} }
    );
    return base;
  }
  if (domain === "content_analysis") {
    base.riskLevel = "medium";
    base.expectedEffect = "Move only the policy/rule causing repeated hold/reject evidence.";
    base.recommendedChanges.push({
      target: "content analysis/filter policy",
      action: "Inspect failed or blocking filter results, then adjust one policy version.",
      reason: residualBucket ?? "content gating evidence",
    });
    base.suggestedToolCalls.push(
      { toolName: "content_filter_results.list", argumentsTemplate: { decision: "hold" } },
      { toolName: "content_filter_policies.update", argumentsTemplate: { filterPolicyId: "<policyId>", payload: {} } }
    );
    return base;
  }
  if (domain === "selection" && objective === "increase_recall" && residualBucket === "gray_zone_hold") {
    base.riskLevel = "medium";
    base.expectedEffect =
      "Re-evaluate held candidate-signal items in bounded chunks without loosening source health or web visibility rules.";
    base.recommendedChanges.push({
      target: "selection replay and candidate-signal hold policy",
      action:
        "Read hold-quality tiers, choose only buyer_intent/project_intent docId chunks of 25, queue maintenance.reindex.request jobKind=backfill with payload.options.docIds, then verify selection/hold-quality/report/effect before tuning interests.",
      reason:
        "gray_zone_hold can be caused by candidate-signal recovery plus strict hold policy; prove replay effects before changing criteria.",
    });
    base.suggestedToolCalls.push(
      { toolName: "articles.holds.summary", argumentsTemplate: {} },
      {
        toolName: "articles.holds.list",
        argumentsTemplate: { candidateSignalTier: "project_intent", pageSize: 25 },
      },
      { toolName: "articles.residuals.summary", argumentsTemplate: { downstreamLossBucket: "gray_zone_hold" } },
      {
        toolName: "articles.residuals.list",
        argumentsTemplate: { selectionMode: "hold", downstreamLossBucket: "project_intent_hold", pageSize: 25 },
      },
      {
        toolName: "maintenance.reindex.request",
        argumentsTemplate: {
          payload: {
            indexName: "interest_centroids",
            jobKind: "backfill",
            options: {
              docIds: ["<bounded-doc-id-list>"],
              batchSize: 25,
              includeEnrichment: false,
              forceEnrichment: false,
              reason: "selection-gray-zone-hold-bounded-replay",
              parentReindexJobId: "<failed-or-parent-reindex-job-id>",
            },
          },
        },
      },
      { toolName: "maintenance.reindex_jobs.list", argumentsTemplate: { pageSize: 10 } },
      { toolName: "operator.report.verify", argumentsTemplate: { reportKind: "selection", entityIds: {} } },
      {
        toolName: "operator.report.verify",
        argumentsTemplate: { reportKind: "selection_hold_quality", entityIds: {}, includeSamples: true },
      },
      {
        toolName: "operator.effect.verify",
        argumentsTemplate: {
          domain: "selection",
          changeRef: "selection-gray-zone-hold-bounded-replay",
          baselineWindowHours: 24,
          comparisonWindowHours: 6,
        },
      }
    );
    return base;
  }
  if (objective === "increase_recall") {
    base.expectedEffect = "Let more borderline items reach review/selection while monitoring false positives.";
    base.recommendedChanges.push({
      target: "system interest/profile",
      action: "Broaden positive signals or lower strictness for a repeated under-selection pattern.",
      reason: residualBucket ?? "recall objective",
    });
  } else {
    base.expectedEffect = "Reject or hold more weak matches while monitoring missed valuable items.";
    base.recommendedChanges.push({
      target: "system interest/profile/filter",
      action: "Add negative signals or tighten policy for a repeated noisy pattern.",
      reason: residualBucket ?? "precision objective",
    });
  }
  base.suggestedToolCalls.push(
    { toolName: "articles.residuals.summary", argumentsTemplate: { downstreamLossBucket: residualBucket ?? undefined } },
    { toolName: "system_interests.update", argumentsTemplate: { interestTemplateId: "<interestId>", payload: {} } }
  );
  return base;
}

export async function verifyOperatorEffect(
  { pool }: McpToolContext,
  args: Record<string, unknown>
) {
  const domain = (readOptionalString(args.domain) ?? "selection") as OperatingDomain;
  const baselineWindowHours = readSinceHours(args.baselineWindowHours, 24);
  const comparisonWindowHours = readSinceHours(args.comparisonWindowHours, 24);
  const changeRef = readOptionalString(args.changeRef) ?? "unspecified change";
  const includeSamples = args.includeSamples === true;

  const query = effectQueryForDomain(domain);
  const [baseline, comparison] = await Promise.all([
    countQuery(pool, query.sql, [baselineWindowHours + comparisonWindowHours, comparisonWindowHours]),
    countQuery(pool, query.sql, [comparisonWindowHours, 0]),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    domain,
    changeRef,
    windows: {
      baseline: `${baselineWindowHours}h before the most recent ${comparisonWindowHours}h`,
      comparison: `last ${comparisonWindowHours}h`,
    },
    metric: query.metric,
    baseline,
    comparison,
    interpretation: [
      "This is a deterministic before/after read-back, not causal proof by itself.",
      "If workers or fetchers are still processing, repeat after async state settles.",
    ],
    samples: includeSamples ? { baseline, comparison } : {},
  };
}

function effectQueryForDomain(domain: OperatingDomain) {
  if (domain === "channels") {
    return {
      metric: "channel_fetch_runs by outcome/provider",
      sql: `
        select outcome_kind as "outcomeKind", provider_type as "providerType", count(*)::int as count
        from channel_fetch_runs
        where started_at >= now() - ($1::int * interval '1 hour')
          and started_at < now() - ($2::int * interval '1 hour')
        group by outcome_kind, provider_type
        order by provider_type, outcome_kind
      `,
    };
  }
  if (domain === "website_pipeline") {
    return {
      metric: "web_resources by projection/final decision",
      sql: `
        select wr.projection_state as "projectionState",
               coalesce(fsr.final_decision, 'not_projected') as "finalDecision",
               count(*)::int as count
        from web_resources wr
        left join final_selection_results fsr on fsr.doc_id = wr.projected_article_id
        where wr.updated_at >= now() - ($1::int * interval '1 hour')
          and wr.updated_at < now() - ($2::int * interval '1 hour')
        group by wr.projection_state, coalesce(fsr.final_decision, 'not_projected')
        order by wr.projection_state, coalesce(fsr.final_decision, 'not_projected')
      `,
    };
  }
  if (domain === "content_analysis") {
    return {
      metric: "content filter decisions",
      sql: `
        select decision, passed, mode, count(*)::int as count
        from content_filter_results
        where created_at >= now() - ($1::int * interval '1 hour')
          and created_at < now() - ($2::int * interval '1 hour')
        group by decision, passed, mode
        order by decision, mode
      `,
    };
  }
  if (domain === "discovery") {
    return {
      metric: "discovery endpoint statuses",
      sql: `
        select provider_type as "providerType", status, recommended_action as "recommendedAction", count(*)::int as count
        from discovery_source_endpoints
        where created_at >= now() - ($1::int * interval '1 hour')
          and created_at < now() - ($2::int * interval '1 hour')
        group by provider_type, status, recommended_action
        order by provider_type, status, recommended_action
      `,
    };
  }
  if (domain === "sequences") {
    return {
      metric: "sequence run statuses",
      sql: `
        select status, trigger_type as "triggerType", count(*)::int as count
        from sequence_runs
        where updated_at >= now() - ($1::int * interval '1 hour')
          and updated_at < now() - ($2::int * interval '1 hour')
        group by status, trigger_type
        order by status, trigger_type
      `,
    };
  }
  return {
    metric: "final selection decisions",
    sql: `
      select final_decision as "finalDecision", verification_state as "verificationState", count(*)::int as count
      from final_selection_results
      where updated_at >= now() - ($1::int * interval '1 hour')
        and updated_at < now() - ($2::int * interval '1 hour')
      group by final_decision, verification_state
      order by final_decision, verification_state
    `,
  };
}

export async function buildOperationalReportVerification(
  context: McpToolContext,
  reportKind: string,
  entityIds: Record<string, unknown>,
  includeSamples: boolean
) {
  const domainByKind: Record<string, OperatingDomain> = {
    system_health: "selection",
    channel_health: "channels",
    source_bottleneck: "channels",
    source_role_coverage: "discovery",
    source_family_balance: "discovery",
    adapter_research: "discovery",
    indirect_search_execution: "discovery",
    marketplace_extraction_quality: "discovery",
    funnel_calibration: "selection",
    selection_precision: "selection",
    website_pipeline: "website_pipeline",
    selection_tuning: "selection",
    selection_hold_quality: "selection",
    content_analysis: "content_analysis",
    llm_budget: "llm_budget",
    sequence_run: "sequences",
    discovery_yield: "discovery",
  };
  const domain = domainByKind[reportKind] ?? "selection";
  if (reportKind === "funnel_calibration") {
    const domainPrefix = readOptionalString(entityIds.domainPrefix) ?? null;
    const audit = await buildFunnelAudit(context, {
      objective: "funnel calibration report verification",
      referenceEvidenceKind: "portable_funnel_guidance",
      referenceText:
        "rare-signal funnel with buyer-side asks, formal procurement notices, wrapper-noise guardrails, empty must_have_terms baseline, null time window baseline, allowed content kinds including editorial listing document data_file api_payload, and adapter-required source policy",
      domainPrefix,
      includeDiscovery: true,
      includeSamples,
    });
    const liveStateSummary = audit.liveStateSummary as Record<string, unknown>;
    const drift = audit.drift as Record<string, unknown>;
    return {
      reportKind,
      verifiedAt: new Date().toISOString(),
      entityIds,
      domain,
      counts: {
        interests: liveStateSummary.interests,
        llmTemplates: liveStateSummary.llmTemplates,
        compileStatus: liveStateSummary.compileStatus,
        selectionCounts: liveStateSummary.selectionCounts,
        webVisibility: liveStateSummary.webVisibility,
        staleSelection: liveStateSummary.staleSelection,
        hardGateDrift: Array.isArray(drift.hardGateDrift) ? drift.hardGateDrift.length : 0,
        contentKindDrift: Array.isArray(drift.contentKindDrift)
          ? drift.contentKindDrift.length
          : 0,
        promptGuardrailDrift: Array.isArray(drift.promptGuardrailDrift)
          ? drift.promptGuardrailDrift.length
          : 0,
        duplicateInterestRisk: Array.isArray(drift.duplicateInterestRisk)
          ? drift.duplicateInterestRisk.length
          : 0,
        sourceRoleGap: Array.isArray(drift.sourceRoleGap) ? drift.sourceRoleGap.length : 0,
        adapterRequiredGap: Array.isArray(drift.adapterRequiredGap)
          ? drift.adapterRequiredGap.length
          : 0,
      },
      findings: audit.findings,
      warnings: (audit.findings as Array<Record<string, unknown>>).filter(
        (finding) => finding.severity === "warning"
      ),
      staleReportNotes: [
        "This verification is read-only and DB-backed.",
        "Reference bundles are calibration evidence, not runtime truth.",
        "Use MCP/admin config writes plus bounded maintenance.reindex.request chunks for any follow-through.",
      ],
      nextReadBack: [
        "operator.funnel.audit",
        "operator.report.verify reportKind=selection",
        "maintenance.reindex_jobs.list",
        "content_items.list",
      ],
    };
  }
  if (reportKind === "selection" || reportKind === "selection_precision") {
    const docIds = readStringArray(entityIds.docIds);
    const audit = await buildSelectionPrecisionAudit(context, {
      docIds,
      pageSize: includeSamples ? 100 : 50,
      includeSamples,
    });
    return {
      reportKind,
      verifiedAt: new Date().toISOString(),
      entityIds,
      domain,
      counts: {
        inspectedSelectedCount: audit.inspectedSelectedCount,
        highQualityCount: audit.highQualityCount,
        weakSelectedCount: audit.weakSelectedCount,
        buckets: audit.buckets,
        staleSelection: audit.staleSelection,
      },
      samples: includeSamples ? audit.samples : {},
      warnings: [
        ...(audit.weakSelectedCount > 0
          ? [
              issue(
                "warning",
                "selection",
                "Selected rows include context-only or noise candidates.",
                {
                  weakSelectedCount: audit.weakSelectedCount,
                  buckets: audit.buckets,
                },
                [
                  "Fix selected precision through MCP/admin system interests, LLM templates, candidateSignals and bounded replay.",
                  "Do not add a separate public selected gate; selected itself must become web-safe.",
                ],
              ),
            ]
          : []),
      ],
      staleReportNotes: [
        "This verification is read-only and DB-backed.",
        "selected remains the only web truth; this report does not create internal/public selected divergence.",
        "Source health, source role, source prior, adapter risk, and search provider metadata are acquisition diagnostics only.",
      ],
      nextReadBack: audit.nextReadBack,
    };
  }
  if (reportKind === "source_bottleneck") {
    const channelIds = readStringArray(entityIds.channelIds);
    const summary = await summarizeChannelBottlenecksWithPool(context.pool, { channelIds });
    const list = await listChannelBottlenecksWithPool(context.pool, {
      channelIds,
      pageSize: includeSamples ? 25 : 5,
    });
    return {
      reportKind,
      verifiedAt: new Date().toISOString(),
      entityIds,
      domain,
      counts: summary,
      samples: includeSamples ? list.items : [],
      warnings: [
        ...(summary.technicalBottlenecks > 0
          ? [
              issue(
                "warning",
                "channels",
                "Source bottlenecks include technical repair lanes.",
                {
                  technicalBottlenecks: summary.technicalBottlenecks,
                  byFailureBucket: summary.byFailureBucket,
                  byRepairLane: summary.byRepairLane,
                },
                [
                  "Use channels.bottlenecks.list/explain before changing discovery or selection filters.",
                  "Low yield alone is not a fetch failure; repair transport/provider-shape bottlenecks separately.",
                ],
              ),
            ]
          : []),
      ],
      staleReportNotes: [
        "This verification is read-only and DB-backed.",
        "Source health does not select, rank, escalate, or publish content by itself.",
        "Repeat after async fetchers/discovery jobs finish if the report covers in-flight work.",
      ],
      nextReadBack: [
        "channels.bottlenecks.summary",
        "channels.bottlenecks.list",
        "channels.bottlenecks.explain",
        "channels.alternatives.plan",
      ],
    };
  }
  if (reportKind === "selection_hold_quality") {
    const docIds = readStringArray(entityIds.docIds);
    const args = docIds.length > 0 ? { docIds, pageSize: includeSamples ? 25 : 5 } : {};
    const summary = await buildArticleHoldQualitySummary(context, args);
    const list = await listArticleHoldQuality(context, {
      ...args,
      pageSize: includeSamples ? 25 : 5,
    });
    return {
      reportKind,
      verifiedAt: new Date().toISOString(),
      entityIds,
      domain,
      counts: summary,
      samples: includeSamples ? list.items : [],
      warnings: [
        ...(summary.totalHolds > 0
          ? [
              issue(
                "warning",
                "selection",
                "Selection holds remain and should be split by candidate-signal tier before replay.",
                {
                  byCandidateSignalTier: summary.byCandidateSignalTier,
                  byDownstreamLossBucket: summary.byDownstreamLossBucket,
                },
                [
                  "Replay project_intent/buyer_intent holds first in chunks of 25.",
                  "Treat context-only holds as diagnostics, not useful selected evidence.",
                ],
              ),
            ]
          : []),
      ],
      staleReportNotes: [
        "This verification is read-only and DB-backed.",
        "Source priors/source health are intentionally not selection evidence.",
        "Use maintenance.reindex.request only with bounded docIds after inspecting hold quality.",
      ],
      nextReadBack: [
        "articles.holds.summary",
        "articles.holds.list",
        "articles.holds.explain",
        "maintenance.reindex_jobs.list",
        "operator.effect.verify",
      ],
    };
  }
  if (reportKind === "source_role_coverage") {
    const coverage = await getSourceRoleCoverageWithPool(context.pool, { includeExamples: includeSamples });
    return {
      reportKind,
      verifiedAt: new Date().toISOString(),
      entityIds,
      domain,
      counts: {
        missingRoles: coverage.missingRoles,
        risks: coverage.risks,
        roles: coverage.roles.map((row) => ({
          sourceRole: row.sourceRole,
          channels: row.channels,
          activeChannels: row.activeChannels,
          adapterChannels: row.adapterChannels,
          researchOnlyChannels: row.researchOnlyChannels,
          candidateEndpoints: row.candidateEndpoints,
          detectOnlyEndpoints: row.detectOnlyEndpoints,
          adapterRequiredEndpoints: row.adapterRequiredEndpoints,
          accessRequiredEndpoints: row.accessRequiredEndpoints,
        })),
      },
      samples: includeSamples ? coverage.roles.flatMap((row) => row.examples) : [],
      warnings: [
        ...(coverage.missingRoles.length > 0
          ? [
              issue(
                "warning",
                "discovery",
                "Thematic source-role coverage has missing roles.",
                { missingRoles: coverage.missingRoles, risks: coverage.risks },
                [
                  "Use discovery.source_roles.plan/coverage before adding more RSS channels.",
                  "Use discovery.adapter_research.plan/start for missing API/marketplace/community roles.",
                ],
              ),
            ]
          : []),
      ],
      staleReportNotes: [
        "This verification is read-only and DB-backed.",
        "Source role coverage is acquisition diagnostics only and cannot select, rank, escalate, or publish content.",
      ],
      nextReadBack: [
        "discovery.source_roles.coverage",
        "discovery.adapter_research.plan",
        "operator.report.verify reportKind=adapter_research",
      ],
    };
  }
  if (reportKind === "source_family_balance") {
    const coverage = await getSourceFamilyCoverageWithPool(context.pool, { includeExamples: includeSamples });
    return {
      reportKind,
      verifiedAt: new Date().toISOString(),
      entityIds,
      domain,
      counts: {
        missingFamilies: coverage.missingFamilies,
        lifecycleCounts: coverage.lifecycleCounts,
        retainedWorkingNoisyChannels: coverage.retainedWorkingNoisyChannels,
        retainedWorkingLowYieldChannels: coverage.retainedWorkingLowYieldChannels,
        negativeControlUsefulChannels: coverage.negativeControlUsefulChannels,
        technicalRepairChannels: coverage.technicalRepairChannels,
        operatorDisabledChannels: coverage.operatorDisabledChannels,
        risks: coverage.risks,
        families: coverage.families.map((row) => ({
          sourceFamily: row.sourceFamily,
          channels: row.channels,
          activeChannels: row.activeChannels,
          workingChannels: row.workingChannels,
          workingNoisySemanticMatch: row.workingNoisySemanticMatch,
          workingLowYield: row.workingLowYield,
          negativeControlUseful: row.negativeControlUseful,
          technicalBottlenecks: row.technicalBottlenecks,
          adapterRequired: row.adapterRequired,
          accessRequired: row.accessRequired,
          selectedRows: row.selectedRows,
          grayRows: row.grayRows,
          rejectedRows: row.rejectedRows,
        })),
      },
      samples: includeSamples ? coverage.families.flatMap((row) => row.examples) : [],
      warnings: [
        ...(coverage.missingFamilies.length > 0
          ? [
              issue(
                "warning",
                "discovery",
                "Coverage-first source-family balance has missing families.",
                { missingFamilies: coverage.missingFamilies, risks: coverage.risks },
                [
                  "Use operator.funnel.autoplan before adding broad channels.",
                  "Use bounded source-family additions instead of optimizing only for current yield.",
                ],
              ),
            ]
          : []),
        ...(coverage.technicalRepairChannels > 0
          ? [
              issue(
                "warning",
                "channels",
                "Some source-family inventory belongs in technical repair/access lanes.",
                { technicalRepairChannels: coverage.technicalRepairChannels },
                ["Repair transport/provider-shape/access blockers without disabling working noisy semantic sources."],
              ),
            ]
          : []),
      ],
      staleReportNotes: [
        "This verification is read-only and DB-backed.",
        "Working noisy, low-yield, and negative-control useful channels are retained acquisition inventory unless an operator explicitly disables them.",
        "Source family, lifecycle label, source health, source prior, and adapter risk cannot select, rank, escalate, or publish content.",
      ],
      autoDisablePolicy: coverage.autoDisablePolicy,
      recommendations: coverage.recommendations,
      nextReadBack: coverage.nextReadBack,
    };
  }
  if (reportKind === "adapter_research") {
    const research = await listAdapterResearchWithPool(context.pool, {
      pageSize: includeSamples ? 50 : 10,
    });
    const accessCounts = research.items.reduce<Record<string, number>>((acc, item) => {
      const accessKind = String(
        ((item.adapterResearch as Record<string, unknown> | null)?.accessKind ?? "unknown")
      );
      acc[accessKind] = (acc[accessKind] ?? 0) + 1;
      return acc;
    }, {});
    return {
      reportKind,
      verifiedAt: new Date().toISOString(),
      entityIds,
      domain,
      counts: {
        total: research.total,
        accessCounts,
        pageSize: research.pageSize,
      },
      samples: includeSamples ? research.items : [],
      warnings: [
        ...((accessCounts.closed_access ?? 0) > 0 || (accessCounts.github_unofficial_restricted ?? 0) > 0
          ? [
              issue(
                "warning",
                "discovery",
                "Adapter research includes access-restricted source roles.",
                { accessCounts },
                [
                  "Use indirect aggregator targets or explicit operator-approved access for restricted platforms.",
                  "Do not disguise API/social/ATS/project-marketplace sources as RSS or website rows.",
                ],
              ),
            ]
          : []),
      ],
      staleReportNotes: [
        "This verification is read-only and DB-backed.",
        "Adapter research rows do not create channels or selected content until separately onboarded/fetched/filtered.",
      ],
      nextReadBack: [
        "discovery.adapter_research.list",
        "discovery.source_roles.coverage",
        "channels.bulk_onboard.plan",
      ],
    };
  }
  if (reportKind === "indirect_search_execution") {
    const endpointCounts = await context.pool.query(`
      select
        count(*) filter (where source_role = 'indirect_aggregator')::int as indirect_endpoints,
        count(*) filter (where source_role = 'indirect_aggregator' and (status = 'detect_only' or signal_mode = 'hidden'))::int as detect_only_endpoints
      from discovery_source_endpoints
    `);
    const channelCounts = await context.pool.query(`
      select
        coalesce(config_json #>> '{api,adapterKey}', config_json #>> '{adapter,adapterKey}', config_json #>> '{adapterKey}') as adapter_key,
        coalesce(config_json #>> '{api,sourceRole}', config_json #>> '{adapter,sourceRole}', config_json #>> '{sourceRole}') as source_role,
        count(*)::int as channels,
        count(*) filter (where is_active)::int as active_channels
      from source_channels
      where coalesce(config_json #>> '{api,adapterKey}', config_json #>> '{adapter,adapterKey}', config_json #>> '{adapterKey}')
        in ('ddgs_search', 'searxng_search', 'brave_search', 'tavily_search', 'exa_search', 'serpapi_google_news_research')
      group by 1, 2
      order by channels desc
    `);
    const articleCounts = await context.pool.query(`
      select
        coalesce(a.raw_payload_json ->> 'adapterKey', 'unknown') as adapter_key,
        count(*)::int as articles,
        count(*) filter (where fsr.final_decision = 'selected')::int as selected,
        count(*) filter (where fsr.final_decision = 'gray_zone')::int as held,
        count(*) filter (where fsr.final_decision = 'rejected')::int as rejected
      from articles a
      left join final_selection_results fsr on fsr.doc_id = a.doc_id
      where a.raw_payload_json ->> 'adapterKey'
        in ('ddgs_search', 'searxng_search', 'brave_search', 'tavily_search', 'exa_search', 'serpapi_google_news_research')
      group by 1
      order by articles desc
    `);
    const detectOnlyEndpoints = Number(endpointCounts.rows[0]?.detect_only_endpoints ?? 0);
    return {
      reportKind,
      verifiedAt: new Date().toISOString(),
      entityIds,
      domain,
      counts: {
        indirectEndpoints: Number(endpointCounts.rows[0]?.indirect_endpoints ?? 0),
        detectOnlyEndpoints,
        channels: channelCounts.rows,
        articles: articleCounts.rows,
      },
      warnings: [
        ...(detectOnlyEndpoints > 0 && channelCounts.rows.length === 0
          ? [
              issue(
                "warning",
                "discovery",
                "Indirect aggregator evidence exists but no executable search channels are active.",
                { detectOnlyEndpoints },
                ["Use discovery.indirect_targets.channels.plan, then channels.bulk_onboard.plan/apply/verify."]
              ),
            ]
          : []),
      ],
      nextReadBack: [
        "discovery.indirect_targets.channels.plan",
        "channels.bulk_onboard.plan",
        "fetch_runs.list",
        "articles.residuals.summary",
        "articles.holds.summary",
      ],
      staleReportNotes: [
        "This verification is read-only and DB-backed.",
        "Indirect search execution is acquisition-only and cannot influence selection by provider metadata.",
      ],
    };
  }
  if (reportKind === "marketplace_extraction_quality") {
    const quality = await context.pool.query(`
      select
        coalesce(a.raw_payload_json ->> 'adapterKey', 'unknown') as adapter_key,
        count(*)::int as articles,
        count(*) filter (where (a.raw_payload_json ->> 'extractionKind') = 'project_detail')::int as project_detail_articles,
        count(*) filter (where nullif(a.raw_payload_json ->> 'projectDetailConfidence', '')::float >= 0.55)::int as confident_project_details,
        count(*) filter (where (a.raw_payload_json ->> 'detailFetchAttempted')::boolean is true)::int as detail_fetch_attempted,
        count(*) filter (where fsr.final_decision = 'selected')::int as selected,
        count(*) filter (where fsr.final_decision = 'gray_zone')::int as held,
        count(*) filter (where fsr.final_decision = 'rejected')::int as rejected
      from articles a
      left join final_selection_results fsr on fsr.doc_id = a.doc_id
      where a.raw_payload_json ->> 'adapterKey'
        in ('peopleperhour_public_projects_research', 'freelancer_public_projects_research', 'guru_public_projects_research', 'malt_public_projects_research', 'contra_public_search_research', 'upwork_public_signal_research', 'linkedin_public_signal_research', 'discourse_search')
      group by 1
      order by articles desc
    `);
    return {
      reportKind,
      verifiedAt: new Date().toISOString(),
      entityIds,
      domain,
      counts: {
        byAdapter: quality.rows,
      },
      warnings: [
        ...(quality.rows.some(
          (row: Record<string, unknown>) =>
            Number(row.articles ?? 0) > 0 && Number(row.project_detail_articles ?? 0) === 0
        )
          ? [
              issue(
                "warning",
                "discovery",
                "Marketplace/forum acquisition produced items but no project-detail evidence.",
                { byAdapter: quality.rows },
                ["Inspect adapter HTML extraction and reject category/navigation wrappers before tuning selection."]
              ),
            ]
          : []),
      ],
      nextReadBack: ["articles.residuals.list", "articles.holds.list", "channels.bottlenecks.list"],
      staleReportNotes: [
        "This verification is read-only and DB-backed.",
        "Project-detail confidence is extraction evidence only and cannot select content by itself.",
      ],
    };
  }
  const health = await buildSystemHealth(context, {
    domains: reportKind === "system_health" ? OPERATING_DOMAIN_VALUES : [domain],
    includeSamples,
  });
  return {
    reportKind,
    verifiedAt: new Date().toISOString(),
    entityIds,
    domain,
    counts: health.health,
    warnings: health.issues,
    staleReportNotes: [
      "This verification is read-only and DB/API-backed.",
      "Repeat after async workers finish if the report covers an in-flight run.",
    ],
    nextReadBack: [
      "operator.system.health",
      "operator.issue.explain",
      "operator.effect.verify",
    ],
  };
}

export async function buildOpsIssuesResource(context: McpToolContext) {
  const health = await buildSystemHealth(context, { sinceHours: 24, includeSamples: true });
  return {
    generatedAt: health.generatedAt,
    issues: health.issues,
    sampleEvidence: health.samples,
    nextSteps: [
      "Use operator.issue.explain for the most relevant issue.",
      "Use operator.tuning.recommend only after repeated evidence is visible.",
    ],
  };
}

export async function buildOpsTuningBacklogResource(context: McpToolContext) {
  const health = await buildSystemHealth(context, { sinceHours: 24, includeSamples: false });
  return {
    generatedAt: health.generatedAt,
    candidates: health.issues.map((entry: Record<string, unknown>) => ({
      domain: entry.domain,
      symptom: entry.title,
      severity: entry.severity,
      recommendedTool: "operator.tuning.recommend",
      objectiveChoices: [
        "increase_recall",
        "increase_precision",
        "reduce_cost",
        "debug_source",
        "stabilize_discovery",
      ],
    })),
    mutationPolicy: "Backlog entries are advisory. They never apply settings by themselves.",
  };
}

export async function buildOpsRecentChangesResource({ pool }: McpToolContext) {
  const rows = await countQuery(
    pool,
    `
      select request_log_id::text as "requestLogId", request_method as "requestMethod",
             tool_name as "toolName", resource_uri as "resourceUri", prompt_name as "promptName",
             success, error_text as "errorText", created_at as "createdAt"
      from mcp_request_log
      where created_at >= now() - interval '24 hours'
      order by created_at desc
      limit 50
    `
  );
  return {
    generatedAt: new Date().toISOString(),
    sourceOfTruth: "mcp_request_log",
    recentMcpRequests: rows,
    note:
      "This is MCP-visible recent activity, not a full audit-log replacement for every admin/API path.",
  };
}

export function affectedOperationalResourcesForTool(toolName: string): string[] {
  if (toolName.startsWith("operator.") || toolName.endsWith(".list") || toolName.endsWith(".read")) {
    return [];
  }
  return [...OPERATIONAL_RESOURCE_URIS, "newsportal://admin/summary"];
}

export function nextReadBackForTool(toolName: string): Record<string, unknown> {
  if (toolName === "discovery.runs.start") {
    return {
      nextReadBack: {
        resources: [...OPERATIONAL_RESOURCE_URIS, "newsportal://admin/summary"],
        tools: [
          {
            name: "operator.report.verify",
            arguments: {
              reportKind: "discovery_run",
              entityIds: { targetIds: ["<targetId>"], runIds: ["<runId-from-response>"] },
              includeSamples: true,
            },
            verify:
              "Treat discovery.runs.start as asynchronous discovery. Poll until the run is completed or failed; inspect coverage, hypotheses, endpoints, contracts, claims, negative evidence and provider health before reporting outcomes.",
          },
          {
            name: "discovery.endpoints.list",
            arguments: { page: 1, pageSize: 20 },
            verify:
              "Use endpoints plus why-found/why-not-promoted/missing-evidence fields as review evidence; rejected or low-score endpoints are not a successful source discovery outcome.",
          },
        ],
        note:
          "Discovery runs are asynchronous and may execute child search/probe/provider work. Do not report completed discovery from the mutation response alone. New sources remain probation until contract evaluation proves stable yield.",
      },
    };
  }
  if (toolName === "maintenance.reindex.request") {
    return {
      nextReadBack: {
        resources: [...OPERATIONAL_RESOURCE_URIS, "newsportal://admin/summary"],
        tools: [
          {
            name: "maintenance.reindex_jobs.list",
            arguments: { page: 1, pageSize: 20 },
            verify: "Wait until the target job reaches completed or failed; inspect status, job_kind, index_name, and options_json.",
          },
          {
            name: "operator.report.verify",
            arguments: { reportKind: "selection", entityIds: {}, includeSamples: true },
            verify: "Run after the backfill job completes when reporting selected/pass_through or current-interest selection state.",
          },
        ],
        note:
          "Do not report reindex success from the mutation response alone; wait for completed/failed job evidence.",
      },
    };
  }
  if (toolName === "content_analysis.backfill.request") {
    return {
      nextReadBack: {
        resources: [...OPERATIONAL_RESOURCE_URIS, "newsportal://admin/summary"],
        tools: [
          {
            name: "maintenance.reindex_jobs.list",
            arguments: { page: 1, pageSize: 20 },
            verify: "Confirm the content_analysis job reaches completed or failed.",
          },
          {
            name: "operator.report.verify",
            arguments: { reportKind: "content_analysis", entityIds: {}, includeSamples: true },
            verify: "Use content-analysis report verification for labels/filter evidence, not final selection replay.",
          },
        ],
        note:
          "Content-analysis backfill does not recompute article.match_criteria, interest_filter_results, or final_selection_results.",
      },
    };
  }
  if (toolName === "channels.set_active") {
    return {
      nextReadBack: {
        resources: [...OPERATIONAL_RESOURCE_URIS, "newsportal://admin/summary"],
        tools: [
          {
            name: "channels.read",
            arguments: { channelId: "<channelId-from-response>" },
            verify: "Confirm isActive reflects the requested operational state.",
          },
          {
            name: "operator.report.verify",
            arguments: {
              reportKind: "channel_health",
              entityIds: { channelIds: ["<channelId-from-response>"] },
              includeSamples: true,
            },
            verify:
              "Use channel health verification to separate activation state from fetch-run history.",
          },
        ],
        note:
          "channels.set_active only toggles activation state. Historical fetch failures remain visible in recent run history.",
      },
    };
  }
  const resources = affectedOperationalResourcesForTool(toolName);
  if (resources.length === 0) {
    return {};
  }
  return {
    nextReadBack: {
      resources,
      tools: ["operator.system.health", "operator.report.verify"],
      note:
        "Use these read-back surfaces when the MCP client does not support resources/subscribe notifications.",
    },
  };
}

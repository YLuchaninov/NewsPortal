import type { Pool } from "pg";

import type { AdminChannelProviderType } from "../../../apps/admin/src/lib/channel-providers";
import {
  buildProviderShapeValidation,
  classifyChannelProviderShape,
  type ChannelProviderShapeClassification,
} from "./channel-bulk-onboarding";

export interface ChannelAlternativeInput {
  channelId: string | null;
  name: string | null;
  providerType: string | null;
  fetchUrl: string;
  lastResultKind?: string | null;
  lastErrorMessage?: string | null;
  consecutiveFailures?: number | null;
}

export interface ChannelAlternativeCandidate {
  sourceChannelId: string | null;
  sourceName: string | null;
  sourceProviderType: string | null;
  sourceUrl: string;
  providerType: AdminChannelProviderType | "adapter_required";
  fetchUrl: string | null;
  status: "candidate" | "needs_probe" | "api_mapping_required" | "adapter_required";
  strategy:
    | "feed_probe"
    | "direct_feed_validation"
    | "html_alternate"
    | "http_link_header"
    | "robots_sitemap"
    | "sitemap_index"
    | "sitemap_url"
    | "cms_platform_hint"
    | "same_site_link"
    | "well_known_feed_path"
    | "provider_shape"
    | "same_source_website"
    | "website_fallback"
    | "adapter_required";
  confidence: number;
  reason: string;
  validation: ReturnType<typeof buildProviderShapeValidation>;
  feedProbeEvidence?: Record<string, unknown>;
}

export interface ChannelAlternativesPlanOptions {
  channelIds?: string[];
  urls?: string[];
  failureKinds?: string[];
  includeFeedProbe?: boolean;
  maxCandidates?: number;
  fetchersInternalBaseUrl?: string;
  fetchImpl?: typeof fetch;
}

export interface ChannelAlternativesPlan {
  generatedAt: string;
  summary: {
    inputs: number;
    candidates: number;
    feedCandidates: number;
    apiMappingRequired: number;
    adapterRequired: number;
  };
  inputs: ChannelAlternativeInput[];
  candidates: ChannelAlternativeCandidate[];
  warnings: string[];
  nextActions: Array<Record<string, unknown>>;
}

const WELL_KNOWN_FEED_PATHS = ["/feed.xml", "/rss.xml", "/atom.xml", "/feed", "/rss"];

function normalizeString(value: unknown): string {
  return String(value ?? "").trim();
}

function uniqueStrings(values: unknown[] | undefined): string[] {
  return Array.from(
    new Set((values ?? []).map((value) => normalizeString(value)).filter(Boolean))
  );
}

function readMaxCandidates(value: number | undefined): number {
  if (!Number.isFinite(value)) {
    return 20;
  }
  return Math.max(1, Math.min(100, Math.trunc(value ?? 20)));
}

function baseFetchersUrl(raw: string | undefined): string {
  return normalizeString(raw || process.env.FETCHERS_INTERNAL_BASE_URL || "http://fetchers:4100").replace(/\/+$/, "");
}

function resolveWellKnownFeedUrl(rawUrl: string, path: string): string | null {
  try {
    const url = new URL(rawUrl);
    return `${url.origin}${path}`;
  } catch {
    return null;
  }
}

function isSameUrl(left: string | null, right: string | null): boolean {
  if (!left || !right) {
    return false;
  }
  try {
    const leftUrl = new URL(left);
    const rightUrl = new URL(right);
    leftUrl.hash = "";
    rightUrl.hash = "";
    return leftUrl.toString() === rightUrl.toString();
  } catch {
    return left === right;
  }
}

async function readChannelInputs(
  pool: Pool,
  channelIds: string[],
  failureKinds: string[],
): Promise<ChannelAlternativeInput[]> {
  if (channelIds.length === 0 && failureKinds.length === 0) {
    return [];
  }
  const result = await pool.query(
    `
      select sc.channel_id::text as "channelId",
             sc.name,
             sc.provider_type as "providerType",
             sc.fetch_url as "fetchUrl",
             latest.outcome_kind as "lastResultKind",
             latest.error_text as "lastErrorMessage",
             coalesce(runtime.consecutive_failures, 0)::int as "consecutiveFailures"
      from source_channels sc
      left join source_channel_runtime_state runtime on runtime.channel_id = sc.channel_id
      left join lateral (
        select cfr.outcome_kind, cfr.error_text
        from channel_fetch_runs cfr
        where cfr.channel_id = sc.channel_id
        order by cfr.started_at desc
        limit 1
      ) latest on true
      where
        (
          cardinality($1::text[]) > 0
          and sc.channel_id::text = any($1::text[])
        )
        or (
          cardinality($1::text[]) = 0
          and cardinality($2::text[]) > 0
          and latest.outcome_kind = any($2::text[])
        )
      order by sc.updated_at desc
      limit 50
    `,
    [channelIds, failureKinds],
  );
  return result.rows.map((row) => ({
    channelId: normalizeString(row.channelId) || null,
    name: normalizeString(row.name) || null,
    providerType: normalizeString(row.providerType) || null,
    fetchUrl: normalizeString(row.fetchUrl),
    lastResultKind: normalizeString(row.lastResultKind) || null,
    lastErrorMessage: normalizeString(row.lastErrorMessage) || null,
    consecutiveFailures: Number(row.consecutiveFailures ?? 0),
  })).filter((row) => row.fetchUrl);
}

async function probeFeedAlternatives(
  urls: string[],
  options: Pick<ChannelAlternativesPlanOptions, "fetchersInternalBaseUrl" | "fetchImpl">,
): Promise<{
  byUrl: Map<string, Record<string, unknown>>;
  candidatesByInputUrl: Map<string, Record<string, unknown>[]>;
  warnings: string[];
}> {
  const byUrl = new Map<string, Record<string, unknown>>();
  const candidatesByInputUrl = new Map<string, Record<string, unknown>[]>();
  const uniqueUrls = uniqueStrings(urls).slice(0, 10);
  if (uniqueUrls.length === 0) {
    return { byUrl, candidatesByInputUrl, warnings: [] };
  }
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    return { byUrl, candidatesByInputUrl, warnings: ["Fetchers feed probe is unavailable in this runtime."] };
  }
  try {
    const response = await fetchImpl(`${baseFetchersUrl(options.fetchersInternalBaseUrl)}/internal/discovery/feeds/alternatives`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({ urls: uniqueUrls, sampleCount: 3, maxCandidatesPerUrl: 30 }),
    });
    const payload = (await response.json()) as {
      alternative_plans?: unknown;
      probed_feeds?: unknown;
    };
    const plans = Array.isArray(payload.alternative_plans) ? payload.alternative_plans : [];
    for (const plan of plans) {
      if (!plan || typeof plan !== "object" || Array.isArray(plan)) {
        continue;
      }
      const record = plan as Record<string, unknown>;
      const sourceUrl = normalizeString(record.url);
      const candidates = Array.isArray(record.candidates) ? record.candidates : [];
      candidatesByInputUrl.set(
        sourceUrl,
        candidates.filter(
          (candidate): candidate is Record<string, unknown> =>
            Boolean(candidate) && typeof candidate === "object" && !Array.isArray(candidate),
        ),
      );
      for (const candidate of candidatesByInputUrl.get(sourceUrl) ?? []) {
        const evidence = candidate.feed_probe_evidence;
        if (evidence && typeof evidence === "object" && !Array.isArray(evidence)) {
          byUrl.set(sourceUrl, evidence as Record<string, unknown>);
        }
      }
    }
    const rows = Array.isArray(payload.probed_feeds) ? payload.probed_feeds : [];
    for (const row of rows) {
      if (!row || typeof row !== "object" || Array.isArray(row)) {
        continue;
      }
      const record = row as Record<string, unknown>;
      const sourceUrl = normalizeString(record.url);
      if (sourceUrl) {
        byUrl.set(sourceUrl, record);
      }
    }
    if (!response.ok) {
      return {
        byUrl,
        candidatesByInputUrl,
        warnings: [`Fetchers feed alternatives returned HTTP ${response.status}.`],
      };
    }
  } catch (error) {
    return {
      byUrl,
      candidatesByInputUrl,
      warnings: [error instanceof Error ? error.message : "Fetchers feed alternatives failed."],
    };
  }
  return { byUrl, candidatesByInputUrl, warnings: [] };
}

function pushCandidate(
  candidates: ChannelAlternativeCandidate[],
  candidate: ChannelAlternativeCandidate,
): void {
  const exists = candidates.some(
    (item) =>
      item.providerType === candidate.providerType &&
      isSameUrl(item.fetchUrl, candidate.fetchUrl) &&
      isSameUrl(item.sourceUrl, candidate.sourceUrl)
  );
  if (!exists) {
    candidates.push(candidate);
  }
}

function buildCandidateBase(
  input: ChannelAlternativeInput,
  providerType: AdminChannelProviderType | "adapter_required",
  fetchUrl: string | null,
  payload: Record<string, unknown> = {},
): Pick<
  ChannelAlternativeCandidate,
  "sourceChannelId" | "sourceName" | "sourceProviderType" | "sourceUrl" | "providerType" | "fetchUrl" | "validation"
> {
  const validation = buildProviderShapeValidation(
    providerType === "adapter_required" ? input.providerType : providerType,
    fetchUrl,
    payload,
  );
  return {
    sourceChannelId: input.channelId,
    sourceName: input.name,
    sourceProviderType: input.providerType,
    sourceUrl: input.fetchUrl,
    providerType,
    fetchUrl,
    validation,
  };
}

function addShapeCandidates(
  input: ChannelAlternativeInput,
  classification: ChannelProviderShapeClassification,
  candidates: ChannelAlternativeCandidate[],
): void {
  if (classification === "api_like") {
    pushCandidate(candidates, {
      ...buildCandidateBase(input, "api", input.fetchUrl),
      status: "api_mapping_required",
      strategy: "provider_shape",
      confidence: 0.8,
      reason: "URL looks like a structured API endpoint; configure API field mappings before onboarding.",
    });
    return;
  }
  if (classification === "website_page" && input.providerType === "rss") {
    pushCandidate(candidates, {
      ...buildCandidateBase(input, "website", input.fetchUrl),
      status: "candidate",
      strategy: "same_source_website",
      confidence: 0.65,
      reason: "Existing RSS channel points at a website page/root; website ingestion is the safe same-source alternative.",
    });
  }
}

function addWellKnownFeedCandidates(
  input: ChannelAlternativeInput,
  candidates: ChannelAlternativeCandidate[],
): void {
  const classification = classifyChannelProviderShape(input.providerType, input.fetchUrl);
  if (classification === "feed_like" || classification === "semantic_query_feed" || classification === "api_like") {
    return;
  }
  for (const path of WELL_KNOWN_FEED_PATHS) {
    const fetchUrl = resolveWellKnownFeedUrl(input.fetchUrl, path);
    if (!fetchUrl) {
      continue;
    }
    pushCandidate(candidates, {
      ...buildCandidateBase(input, "rss", fetchUrl),
      status: "needs_probe",
      strategy: "well_known_feed_path",
      confidence: 0.4,
      reason: `Candidate well-known feed path ${path}; validate with channels.bulk_onboard.plan or feed probe before applying.`,
    });
  }
}

function addFeedProbeCandidate(
  input: ChannelAlternativeInput,
  probe: Record<string, unknown> | undefined,
  candidates: ChannelAlternativeCandidate[],
): void {
  if (!probe || probe.is_valid_rss !== true) {
    return;
  }
  const feedUrl = normalizeString(probe.feed_url ?? probe.final_url);
  if (!feedUrl) {
    return;
  }
  pushCandidate(candidates, {
    ...buildCandidateBase(input, "rss", feedUrl),
    status: "candidate",
    strategy: "feed_probe",
    confidence: 0.92,
    reason: "Fetchers feed probe found and validated a feed URL from the source URL or its HTML alternates.",
    feedProbeEvidence: probe,
  });
}

function addDeepFeedAlternativeCandidates(
  input: ChannelAlternativeInput,
  rows: Record<string, unknown>[] | undefined,
  candidates: ChannelAlternativeCandidate[],
): void {
  for (const row of rows ?? []) {
    const rawProviderType = normalizeString(row.provider_type);
    const providerType =
      rawProviderType === "adapter_required" ? "adapter_required" : (rawProviderType as AdminChannelProviderType);
    if (!["rss", "website", "api", "email_imap", "adapter_required"].includes(providerType)) {
      continue;
    }
    const fetchUrl = normalizeString(row.fetch_url) || null;
    const status = normalizeString(row.status) as ChannelAlternativeCandidate["status"];
    const strategy = normalizeString(row.strategy) as ChannelAlternativeCandidate["strategy"];
    const feedProbeEvidence =
      row.feed_probe_evidence && typeof row.feed_probe_evidence === "object" && !Array.isArray(row.feed_probe_evidence)
        ? (row.feed_probe_evidence as Record<string, unknown>)
        : undefined;
    pushCandidate(candidates, {
      ...buildCandidateBase(input, providerType, fetchUrl, feedProbeEvidence ? { feedProbeEvidence } : {}),
      status: ["candidate", "needs_probe", "api_mapping_required", "adapter_required"].includes(status)
        ? status
        : "needs_probe",
      strategy:
        [
          "feed_probe",
          "direct_feed_validation",
          "html_alternate",
          "http_link_header",
          "robots_sitemap",
          "sitemap_index",
          "sitemap_url",
          "cms_platform_hint",
          "same_site_link",
          "well_known_feed_path",
          "provider_shape",
          "same_source_website",
          "website_fallback",
          "adapter_required",
        ].includes(strategy)
          ? strategy
          : "well_known_feed_path",
      confidence: Number.isFinite(Number(row.confidence)) ? Number(row.confidence) : 0.4,
      reason: normalizeString(row.reason) || "Alternative candidate from fetchers deep source repair planning.",
      ...(feedProbeEvidence ? { feedProbeEvidence } : {}),
    });
  }
}

export async function planChannelAlternativesWithPool(
  pool: Pool,
  options: ChannelAlternativesPlanOptions = {},
): Promise<ChannelAlternativesPlan> {
  const channelIds = uniqueStrings(options.channelIds);
  const urls = uniqueStrings(options.urls);
  const failureKinds = uniqueStrings(options.failureKinds);
  const includeFeedProbe = options.includeFeedProbe !== false;
  const maxCandidates = readMaxCandidates(options.maxCandidates);
  const warnings: string[] = [];
  const channelInputs = await readChannelInputs(pool, channelIds, failureKinds);
  const explicitInputs: ChannelAlternativeInput[] = urls.map((url) => ({
    channelId: null,
    name: null,
    providerType: null,
    fetchUrl: url,
  }));
  const inputs = [...channelInputs, ...explicitInputs];
  if (channelIds.length > 0 && channelInputs.length !== channelIds.length) {
    warnings.push("Some requested channelIds were not found.");
  }

  const probe = includeFeedProbe
    ? await probeFeedAlternatives(inputs.map((input) => input.fetchUrl), options)
    : {
        byUrl: new Map<string, Record<string, unknown>>(),
        candidatesByInputUrl: new Map<string, Record<string, unknown>[]>(),
        warnings: [],
      };
  warnings.push(...probe.warnings.map((warning) => `feed_probe: ${warning}`));

  const candidates: ChannelAlternativeCandidate[] = [];
  for (const input of inputs) {
    const classification = classifyChannelProviderShape(input.providerType, input.fetchUrl);
    addDeepFeedAlternativeCandidates(input, probe.candidatesByInputUrl.get(input.fetchUrl), candidates);
    addFeedProbeCandidate(input, probe.byUrl.get(input.fetchUrl), candidates);
    addShapeCandidates(input, classification, candidates);
    addWellKnownFeedCandidates(input, candidates);
  }

  const limitedCandidates = candidates.slice(0, maxCandidates);
  return {
    generatedAt: new Date().toISOString(),
    summary: {
      inputs: inputs.length,
      candidates: limitedCandidates.length,
      feedCandidates: limitedCandidates.filter((item) => item.providerType === "rss").length,
      apiMappingRequired: limitedCandidates.filter((item) => item.status === "api_mapping_required").length,
      adapterRequired: limitedCandidates.filter((item) => item.status === "adapter_required").length,
    },
    inputs,
    candidates: limitedCandidates,
    warnings,
    nextActions: [
      {
        toolName: "channels.bulk_onboard.plan",
        note: "Review candidate rows through bulk onboarding before applying any alternative source.",
      },
      {
        toolName: "channels.alternatives.start",
        note: "For existing channelIds, start a bounded discovery replacement run if feed candidates are insufficient.",
      },
    ],
  };
}

import { listMcpAccessTokens, summarizeMcpAccessTokens } from "@signalops/control-plane";

import {
  buildOpsIssuesResource,
  buildOpsRecentChangesResource,
  buildOpsTuningBacklogResource,
  buildSystemHealth,
} from "../operating-intelligence";
import type { McpResourceDefinition } from "./types";

export const operationalStatusResources: readonly McpResourceDefinition[] = [
  {
    uri: "signalops://ops/health",
    name: "ops.health",
    title: "Operational Health",
    description: "Current DB/API-backed operational health for ongoing SignalOps operation.",
    mimeType: "application/json",
    read: async (context) => buildSystemHealth(context, { sinceHours: 24 }),
  },
  {
    uri: "signalops://ops/issues",
    name: "ops.issues",
    title: "Operational Issues",
    description: "Current operational issues and evidence samples derived from MCP-readable state.",
    mimeType: "application/json",
    read: async (context) => buildOpsIssuesResource(context),
  },
  {
    uri: "signalops://ops/tuning-backlog",
    name: "ops.tuning.backlog",
    title: "Tuning Backlog",
    description: "Read-only backlog of likely tuning opportunities based on current operational evidence.",
    mimeType: "application/json",
    read: async (context) => buildOpsTuningBacklogResource(context),
  },
  {
    uri: "signalops://ops/recent-changes",
    name: "ops.recent.changes",
    title: "Recent MCP Changes",
    description: "Recent MCP-visible requests to help operators understand what changed before diagnosing effects.",
    mimeType: "application/json",
    read: async (context) => buildOpsRecentChangesResource(context),
  },
];

export const operatorDataResources: readonly McpResourceDefinition[] = [
  {
    uri: "signalops://admin/summary",
    name: "admin.summary",
    description: "Current SignalOps operator summary plus MCP token counts.",
    mimeType: "application/json",
    read: async ({ sdk, pool }) => {
      const [dashboardSummary, tokens] = await Promise.all([
        sdk.getDashboardSummary<Record<string, unknown>>(),
        listMcpAccessTokens(pool),
      ]);
      return {
        dashboardSummary,
        mcpTokens: summarizeMcpAccessTokens(tokens),
      };
    },
  },
  {
    uri: "signalops://llm/budget-summary",
    name: "llm.budget.summary",
    description: "Current LLM budget summary from the maintenance surface.",
    mimeType: "application/json",
    read: async ({ sdk }) => sdk.getLlmBudgetSummary<Record<string, unknown>>(),
  },
  {
    uri: "signalops://discovery/runs",
    name: "discovery.runs",
    description: "First page of Discovery vNext runs.",
    mimeType: "application/json",
    read: async ({ sdk }) =>
      sdk.listDiscoveryVNextRecords<Record<string, unknown>>("runs", { page: 1, pageSize: 20 }),
  },
  {
    uri: "signalops://discovery/artifacts",
    name: "discovery.artifacts",
    description: "First page of Discovery vNext artifacts.",
    mimeType: "application/json",
    read: async ({ sdk }) =>
      sdk.listDiscoveryVNextRecords<Record<string, unknown>>("artifacts", { page: 1, pageSize: 20 }),
  },
  {
    uri: "signalops://discovery/candidates",
    name: "discovery.candidates",
    description: "First page of Discovery vNext candidates.",
    mimeType: "application/json",
    read: async ({ sdk }) =>
      sdk.listDiscoveryVNextRecords<Record<string, unknown>>("candidates", { page: 1, pageSize: 20 }),
  },
  {
    uri: "signalops://discovery/source-inventory",
    name: "discovery.source_inventory",
    description: "First page of Discovery vNext source inventory.",
    mimeType: "application/json",
    read: async ({ sdk }) =>
      sdk.listDiscoveryVNextRecords<Record<string, unknown>>("source-inventory", { page: 1, pageSize: 20 }),
  },
  {
    uri: "signalops://discovery/policies",
    name: "discovery.policies",
    description: "First page of Discovery vNext policies.",
    mimeType: "application/json",
    read: async ({ sdk }) =>
      sdk.listDiscoveryVNextRecords<Record<string, unknown>>("policies", { page: 1, pageSize: 20 }),
  },
  {
    uri: "signalops://discovery/adapter-backlog",
    name: "discovery.adapter_backlog",
    description: "First page of Discovery vNext adapter backlog.",
    mimeType: "application/json",
    read: async ({ sdk }) =>
      sdk.listDiscoveryVNextRecords<Record<string, unknown>>("adapter-backlog", { page: 1, pageSize: 20 }),
  },
  {
    uri: "signalops://discovery/feedback",
    name: "discovery.feedback",
    description: "First page of Discovery vNext feedback events.",
    mimeType: "application/json",
    read: async ({ sdk }) =>
      sdk.listDiscoveryVNextRecords<Record<string, unknown>>("feedback", { page: 1, pageSize: 20 }),
  },
  {
    uri: "signalops://discovery/replay-runs",
    name: "discovery.replay_runs",
    description: "First page of Discovery vNext replay runs.",
    mimeType: "application/json",
    read: async ({ sdk }) =>
      sdk.listDiscoveryVNextRecords<Record<string, unknown>>("replay-runs", { page: 1, pageSize: 20 }),
  },
  {
    uri: "signalops://discovery/rollback-groups",
    name: "discovery.rollback_groups",
    description: "First page of Discovery vNext rollback groups.",
    mimeType: "application/json",
    read: async ({ sdk }) =>
      sdk.listDiscoveryVNextRecords<Record<string, unknown>>("rollback-groups", { page: 1, pageSize: 20 }),
  },
  {
    uri: "signalops://discovery/eval-runs",
    name: "discovery.eval_runs",
    description: "First page of Discovery vNext eval run metadata.",
    mimeType: "application/json",
    read: async ({ sdk }) =>
      sdk.listDiscoveryVNextRecords<Record<string, unknown>>("eval-runs", { page: 1, pageSize: 20 }),
  },
  {
    uri: "signalops://system-interests",
    name: "system.interests",
    description: "First page of current system interests.",
    mimeType: "application/json",
    read: async ({ sdk }) =>
      sdk.listSystemInterestsPage<Record<string, unknown>>({
        page: 1,
        pageSize: 20,
      }),
  },
  {
    uri: "signalops://templates/llm",
    name: "llm.templates",
    description: "First page of current LLM templates.",
    mimeType: "application/json",
    read: async ({ sdk }) =>
      sdk.listLlmTemplatesPage<Record<string, unknown>>({
        page: 1,
        pageSize: 20,
      }),
  },
  {
    uri: "signalops://channels",
    name: "channels",
    description: "First page of source channels.",
    mimeType: "application/json",
    read: async ({ sdk }) =>
      sdk.listChannelsPage<Record<string, unknown>>({
        page: 1,
        pageSize: 20,
      }),
  },
  {
    uri: "signalops://sequences",
    name: "sequences",
    description: "First page of sequences from the maintenance API.",
    mimeType: "application/json",
    read: async ({ sdk }) =>
      sdk.listSequencesPage<Record<string, unknown>>({
        page: 1,
        pageSize: 20,
      }),
  },
  {
    uri: "signalops://web-resources",
    name: "web.resources",
    description: "First page of web resources.",
    mimeType: "application/json",
    read: async ({ sdk }) =>
      sdk.listWebResourcesPage<Record<string, unknown>>({
        page: 1,
        pageSize: 20,
      }),
  },
  {
    uri: "signalops://fetch-runs",
    name: "fetch.runs",
    description: "Current fetch runs summary list.",
    mimeType: "application/json",
    read: async ({ sdk }) => sdk.listFetchRuns<Record<string, unknown>>(),
  },
  {
    uri: "signalops://signal-candidates/residuals-summary",
    name: "signal_candidates.residuals.summary",
    description: "Aggregate signal_candidate residual buckets for diagnostics and tuning sessions.",
    mimeType: "application/json",
    read: async ({ sdk }) => sdk.getSignalCandidateResidualSummary<Record<string, unknown>>(),
  },
];

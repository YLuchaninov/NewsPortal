import type { McpToolContext } from "../tools/shared";
import { OPERATIONAL_RESOURCE_URIS } from "./model";
import { buildSystemHealth } from "./guidance";

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
  const result = await pool.query<Record<string, unknown>>(`
    select request_log_id::text as "requestLogId", request_method as "requestMethod",
           tool_name as "toolName", resource_uri as "resourceUri", prompt_name as "promptName",
           success, error_text as "errorText", created_at as "createdAt"
    from mcp_request_log
    where created_at >= now() - interval '24 hours'
    order by created_at desc
    limit 50
  `);
  return {
    generatedAt: new Date().toISOString(),
    sourceOfTruth: "mcp_request_log",
    recentMcpRequests: result.rows,
    note:
      "This is MCP-visible recent activity, not a full audit-log replacement for every admin/API path.",
  };
}

export function affectedOperationalResourcesForTool(toolName: string): string[] {
  if (toolName.startsWith("operator.") || toolName.endsWith(".list") || toolName.endsWith(".read")) {
    return [];
  }
  return [...OPERATIONAL_RESOURCE_URIS, "signalops://admin/summary"];
}

export function nextReadBackForTool(toolName: string): Record<string, unknown> {
  if (toolName === "discovery.runs.create") {
    return {
      nextReadBack: {
        resources: [...OPERATIONAL_RESOURCE_URIS, "signalops://admin/summary"],
        tools: [
          {
            name: "operator.report.verify",
            arguments: {
              reportKind: "discovery_run",
              entityIds: { runIds: ["<vnextRunId-from-response>"] },
              includeSamples: true,
            },
            verify:
              "Treat discovery.runs.create as asynchronous discovery. Poll until the run is completed or failed; inspect artifacts, candidates, source inventory, policy, replay, and rollback state before reporting outcomes.",
          },
          {
            name: "discovery.artifacts.list",
            arguments: { page: 1, pageSize: 20 },
            verify:
              "Use ProbeReport, SourceUnderstanding, RoutingDecision, and validation fields as review evidence; rejected artifacts are not successful source discovery outcomes.",
          },
        ],
        note:
          "Discovery vNext runs are asynchronous and may execute child search/probe/provider work. Do not report completed discovery from the mutation response alone. New sources enter probation only through source inventory and source_channels/outbox handoff.",
      },
    };
  }
  if (toolName === "maintenance.reindex.request") {
    return {
      nextReadBack: {
        resources: [...OPERATIONAL_RESOURCE_URIS, "signalops://admin/summary"],
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
        resources: [...OPERATIONAL_RESOURCE_URIS, "signalops://admin/summary"],
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
          "Content-analysis backfill does not recompute signal_candidate.match_criteria, interest_filter_results, or final_selection_results.",
      },
    };
  }
  if (toolName === "channels.set_active") {
    return {
      nextReadBack: {
        resources: [...OPERATIONAL_RESOURCE_URIS, "signalops://admin/summary"],
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
  if (toolName === "channels.sync.request") {
    return {
      nextReadBack: {
        resources: [...OPERATIONAL_RESOURCE_URIS, "signalops://admin/summary"],
        tools: [
          {
            name: "channels.read",
            arguments: { channelId: "<channelId-from-response>" },
            verify:
              "Confirm the channel still has the expected provider config and inspect runtime next_due_at/readiness.",
          },
          {
            name: "fetch_runs.list",
            arguments: { channelId: "<channelId-from-response>", page: 1, pageSize: 5 },
            verify:
              "Poll recent fetch runs after the worker handles the request; completed or failed runs are the refetch proof.",
          },
          {
            name: "outbox.events.list",
            arguments: {
              eventType: "source.channel.sync.requested",
              aggregateType: "source_channel",
              aggregateId: "<channelId-from-response>",
              limit: 10,
            },
            verify:
              "Confirm the operator refetch request was enqueued as source.channel.sync.requested for this channel.",
          },
        ],
        note:
          "channels.sync.request is an operator refetch request. Do not report new content until fetch run read-back proves the worker processed it.",
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

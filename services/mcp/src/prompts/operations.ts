import { readOptionalString, readRequiredString } from "../protocol";
import type { McpPromptDefinition } from "./types";

export const diagnosticPrompts: readonly McpPromptDefinition[] = [
  {
    name: "diagnose.mcp_error",
    description: "Diagnose an MCP client/tool error and choose the next safe read or schema correction.",
    arguments: [
      { name: "error", description: "The exact MCP or Streamable HTTP error text.", required: true },
      { name: "objective", description: "What the operator was trying to accomplish." },
    ],
    render: (args) => {
      const error = readRequiredString(args.error, "error");
      const objective = readOptionalString(args.objective) ?? "complete the operator task safely";
      return {
        description: "MCP error diagnosis guide",
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text:
                `Diagnose this SignalOps MCP error while trying to ${objective}: "${error}". ` +
                `First classify whether it is transport, authentication/scope, input schema, backend validation, or business-state related. ` +
                `Use MCP read tools before shell/raw SQL, inspect tool inputSchema/outputSchema, and propose the smallest safe correction. ` +
                `For cleanup/token lifecycle issues, use admin.mcp_tokens.list/revoke/delete_revoked when the token has the needed scopes. Do not bypass MCP with direct admin REST calls and do not guess mcp_access_tokens columns.`,
            },
          },
        ],
      };
    },
  },
];

export const operationsReviewPrompts: readonly McpPromptDefinition[] = [
  {
    name: "operations.daily_review",
    description: "Run a daily read-only operational review of SignalOps after setup.",
    arguments: [
      { name: "focus", description: "Optional focus such as channels, selection, discovery, or LLM budget." },
    ],
    render: (args) => {
      const focus = readOptionalString(args.focus) ?? "all operating domains";
      return {
        description: "Daily operating review",
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text:
                `Review SignalOps operational health for ${focus}. ` +
                `Read signalops://guide/operating-model, signalops://ops/health, signalops://ops/issues, and signalops://ops/tuning-backlog. ` +
                `Use operator.system.health for DB/API-backed counts. Report only verified state, separate normal low-yield states from failures, and recommend no mutations unless evidence points to a bounded tuning follow-up.`,
            },
          },
        ],
      };
    },
  },
  {
    name: "operations.issue_triage",
    description: "Triage a concrete production/operator symptom through read-only MCP diagnostics.",
    arguments: [
      { name: "symptom", description: "The concrete symptom or confusing report.", required: true },
      { name: "domain", description: "Optional operating domain such as website_pipeline, selection, or discovery." },
    ],
    render: (args) => {
      const symptom = readRequiredString(args.symptom, "symptom");
      const domain = readOptionalString(args.domain) ?? "infer from the symptom";
      return {
        description: "Operational issue triage",
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text:
                `Triage SignalOps symptom "${symptom}" with domain "${domain}". ` +
                `Call operator.issue.explain with includeSamples=true, then inspect the listed source-of-truth rows using domain read/explain tools. ` +
                `Classify whether this is normal policy behavior, stale async state, source acquisition failure, downstream selection/gating, budget pressure, or schema/client misuse. Do not mutate settings during triage.`,
            },
          },
        ],
      };
    },
  },
];

export const sequenceDraftPrompts: readonly McpPromptDefinition[] = [
  {
    name: "sequence.draft",
    description: "Draft a sequence definition for the automation control plane.",
    arguments: [
      { name: "objective", description: "Operational outcome.", required: true },
    ],
    render: (args) => {
      const objective = readRequiredString(args.objective, "objective");
      return {
        description: "Sequence drafting guide",
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Draft a bounded SignalOps sequence for objective "${objective}". Return a taskGraph outline, trigger recommendation, and safe operator notes before creating the sequence through MCP.`,
            },
          },
        ],
      };
    },
  },
];

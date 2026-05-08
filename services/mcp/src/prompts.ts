import { JsonRpcError, readOptionalString, readRequiredString } from "./protocol";
import { buildPromptTitle } from "./context";

export interface McpPromptDefinition {
  name: string;
  description: string;
  arguments: Array<{
    name: string;
    description: string;
    required?: boolean;
  }>;
  render: (args: Record<string, unknown>) => {
    description: string;
    messages: Array<{
      role: "user";
      content: {
        type: "text";
        text: string;
      };
    }>;
  };
}

export const MCP_PROMPTS: readonly McpPromptDefinition[] = [
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
                `Diagnose this NewsPortal MCP error while trying to ${objective}: "${error}". ` +
                `First classify whether it is transport, authentication/scope, input schema, backend validation, or business-state related. ` +
                `Use MCP read tools before shell/raw SQL, inspect tool inputSchema/outputSchema, and propose the smallest safe correction. ` +
                `For cleanup/token lifecycle issues, use admin.mcp_tokens.list/revoke/delete_revoked when the token has the needed scopes. Do not bypass MCP with direct admin REST calls and do not guess mcp_access_tokens columns.`,
            },
          },
        ],
      };
    },
  },
  {
    name: "operator.session.start",
    description: "Starter guidance for understanding and safely using the NewsPortal MCP server.",
    arguments: [
      { name: "objective", description: "What the operator or agent wants to accomplish.", required: true },
      { name: "domain", description: "Primary MCP domain such as discovery, sequences, templates, channels, or system interests." },
    ],
    render: (args) => {
      const objective = readRequiredString(args.objective, "objective");
      const domain = readOptionalString(args.domain) ?? "the relevant operator domain";
      return {
        description: "NewsPortal MCP operator orientation",
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text:
                `You are starting a NewsPortal MCP operator session for objective "${objective}" in ${domain}. ` +
                `First orient yourself with the guide resources newsportal://guide/server-overview and newsportal://guide/operator-playbooks, then read the current operator state through newsportal://admin/summary and the relevant domain list/read tools. ` +
                `Prefer bounded read-before-write workflow, use drafting prompts before complex writes, require explicit confirmation for destructive actions, and always verify resulting state after mutations.`,
            },
          },
        ],
      };
    },
  },
  {
    name: "sequences.session.plan",
    description: "Starter guidance for safe sequence creation, execution, and recovery work through MCP.",
    arguments: [
      { name: "objective", description: "What the sequence session is trying to accomplish.", required: true },
    ],
    render: (args) => {
      const objective = readRequiredString(args.objective, "objective");
      return {
        description: "Sequence session planning guide",
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text:
                `Plan a NewsPortal MCP sequence session for objective "${objective}". ` +
                `Read newsportal://guide/scenarios/sequences, newsportal://admin/summary, and newsportal://sequences first. ` +
                `If the sequence shape is non-trivial, draft it with sequence.draft before writes. ` +
                `After create/update/run actions, read sequence and run state back before deciding to cancel, retry, or archive.`,
            },
          },
        ],
      };
    },
  },
  {
    name: "discovery.session.plan",
    description: "Starter guidance for safe discovery and source-onboarding work through MCP.",
    arguments: [
      { name: "objective", description: "What discovery outcome is being pursued.", required: true },
    ],
    render: (args) => {
      const objective = readRequiredString(args.objective, "objective");
      return {
        description: "Discovery session planning guide",
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text:
                `Plan a NewsPortal MCP discovery v3 session for objective "${objective}". ` +
                `Read newsportal://guide/scenarios/discovery and newsportal://discovery/summary first, then inspect the relevant targets, coverage, runs, endpoints, contracts, claims, provider health, negative evidence, and eval runs. ` +
                `Unless the operator explicitly asks for manual approval, make the plan guarded-automation-first: create or update a target, refresh coverage, start a bounded run, and rely on evidence contracts, provider capability policy, and replay-evaluated thresholds where evidence is sufficient. ` +
                `Use discovery.constructive_skeptic.review, discovery.verification_skeptic.review, discovery.contract.review, or discovery.claim.review when hypothesis boundaries, hidden-signal claims, provider choices, or probation evidence need tightening. ` +
                `Promote only endpoints with valid evidence and source contracts, keep new sources in probation until the contract passes, and verify promoted channels after mutation. Manual review is a fallback for missing policy/evidence or ambiguity, not the default plan.`,
            },
          },
        ],
      };
    },
  },
  {
    name: "discovery.constructive_skeptic.review",
    description: "Review Explorer hypotheses with bounded constructive skepticism.",
    arguments: [
      { name: "target", description: "Target or hypothesis pack under review.", required: true },
    ],
    render: (args) => {
      const target = readRequiredString(args.target, "target");
      return {
        description: "Constructive Skeptic review",
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text:
                `Review this discovery hypothesis pack as Constructive Skeptic: ${target}. ` +
                `Return concrete critiques, repair patches, bounded missing-angle ideas, negative controls, provider warnings, and direct-vs-hidden corrections. ` +
                `Do not create an unlimited alternate plan. Hidden signals require claims and control comparison; provider failures are provider-health events, not hypothesis failures.`,
            },
          },
        ],
      };
    },
  },
  {
    name: "discovery.verification_skeptic.review",
    description: "Perform the short post-repair Verification Skeptic pass.",
    arguments: [
      { name: "target", description: "Repaired hypothesis pack under verification.", required: true },
    ],
    render: (args) => {
      const target = readRequiredString(args.target, "target");
      return {
        description: "Verification Skeptic review",
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text:
                `Verify this repaired discovery hypothesis pack: ${target}. ` +
                `Confirm whether major risks were fixed, list only blocking residual issues, add at most three critical ideas, and route persistent disagreement to manual_review.`,
            },
          },
        ],
      };
    },
  },
  {
    name: "discovery.contract.review",
    description: "Review a Source Evidence Contract or probation source.",
    arguments: [
      { name: "contract", description: "Contract/probation evidence to review.", required: true },
    ],
    render: (args) => {
      const contract = readRequiredString(args.contract, "contract");
      return {
        description: "Source Evidence Contract review",
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text:
                `Review this Source Evidence Contract and probation evidence: ${contract}. ` +
                `Identify expected yield, noise, duplicate, freshness and extraction gaps; recommend active, degraded, replacement_needed or manual review.`,
            },
          },
        ],
      };
    },
  },
  {
    name: "discovery.claim.review",
    description: "Review a hidden-signal claim and control comparison.",
    arguments: [
      { name: "claim", description: "Claim/evidence/control-comparison payload.", required: true },
    ],
    render: (args) => {
      const claim = readRequiredString(args.claim, "claim");
      return {
        description: "Hidden claim review",
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text:
                `Review this hidden-signal claim: ${claim}. ` +
                `Check support, contradiction, independent sources, unique authors, spam/campaign risk and control specificity. ` +
                `Do not allow strong follow-up if claim/control support is insufficient.`,
            },
          },
        ],
      };
    },
  },
  {
    name: "discovery.failure.repair",
    description: "Diagnose weak discovery runs and propose allowed repair recipes.",
    arguments: [
      { name: "run", description: "Run metrics/failure evidence to diagnose.", required: true },
    ],
    render: (args) => {
      const run = readRequiredString(args.run, "run");
      return {
        description: "Discovery failure repair",
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text:
                `Diagnose this resilient discovery run: ${run}. ` +
                `Use observed metrics only. Separate provider health failures from hypothesis failures. Recommend repair recipes such as broaden_queries, reduce_noise, switch_provider, expand_source_directory or replace_weak_source.`,
            },
          },
        ],
      };
    },
  },
  {
    name: "system_interests.session.plan",
    description: "Starter guidance for system-interest maintenance through MCP.",
    arguments: [
      { name: "topic", description: "Topic or signal family being maintained.", required: true },
    ],
    render: (args) => {
      const topic = readRequiredString(args.topic, "topic");
      return {
        description: "System-interest session planning guide",
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text:
                `Plan a NewsPortal MCP system-interest session for topic "${topic}". ` +
                `Read newsportal://guide/scenarios/system-interests and newsportal://system-interests first to avoid overlap. ` +
                `Use system_interest.create to draft bounded signals before writes, prefer archive before delete when history matters, and always verify the resulting lifecycle state after mutation.`,
            },
          },
        ],
      };
    },
  },
  {
    name: "llm_templates.session.plan",
    description: "Starter guidance for LLM template maintenance through MCP.",
    arguments: [
      { name: "templateIntent", description: "What behavior the template should support or change.", required: true },
    ],
    render: (args) => {
      const templateIntent = readRequiredString(args.templateIntent, "templateIntent");
      return {
        description: "LLM template session planning guide",
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text:
                `Plan a NewsPortal MCP LLM template session for intent "${templateIntent}". ` +
                `Read newsportal://guide/scenarios/llm-templates and newsportal://templates/llm first, keep the change bounded to one template and one behavior goal, prefer archive before delete when lineage matters, and verify the updated template through read surfaces after mutation.`,
            },
          },
        ],
      };
    },
  },
  {
    name: "channels.session.plan",
    description: "Starter guidance for channel onboarding and maintenance through MCP.",
    arguments: [
      { name: "source", description: "Channel or source being created or corrected.", required: true },
    ],
    render: (args) => {
      const source = readRequiredString(args.source, "source");
      return {
        description: "Channel session planning guide",
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text:
                `Plan a NewsPortal MCP channel session for source "${source}". ` +
                `Read newsportal://guide/scenarios/channels and newsportal://channels first to detect overlap or duplication. ` +
                `If the channel originated from discovery, preserve the candidate evidence before manual edits. ` +
                `Use delete only with explicit confirmation and verify catalog state after create/update/delete actions.`,
            },
          },
        ],
      };
    },
  },
  {
    name: "observability.session.plan",
    description: "Starter guidance for read-only diagnosis and evidence gathering through MCP.",
    arguments: [
      { name: "question", description: "Operational question the session should answer.", required: true },
    ],
    render: (args) => {
      const question = readRequiredString(args.question, "question");
      return {
        description: "Observability session planning guide",
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text:
                `Plan a NewsPortal MCP observability session for question "${question}". ` +
                `Read newsportal://guide/scenarios/observability and newsportal://admin/summary first, then narrow to the relevant read surfaces such as fetch runs, web resources, sequence runs, discovery summary, or LLM budget. ` +
                `Keep the session read-only until the needed evidence is gathered and only then switch to a domain-specific write scenario if a change is truly needed.`,
            },
          },
        ],
      };
    },
  },
  {
    name: "operations.daily_review",
    description: "Run a daily read-only operational review of NewsPortal after setup.",
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
                `Review NewsPortal operational health for ${focus}. ` +
                `Read newsportal://guide/operating-model, newsportal://ops/health, newsportal://ops/issues, and newsportal://ops/tuning-backlog. ` +
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
                `Triage NewsPortal symptom "${symptom}" with domain "${domain}". ` +
                `Call operator.issue.explain with includeSamples=true, then inspect the listed source-of-truth rows using domain read/explain tools. ` +
                `Classify whether this is normal policy behavior, stale async state, source acquisition failure, downstream selection/gating, budget pressure, or schema/client misuse. Do not mutate settings during triage.`,
            },
          },
        ],
      };
    },
  },
  {
    name: "selection.tuning.plan",
    description: "Plan a safe selection fine-tuning session from residual/article evidence.",
    arguments: [
      { name: "objective", description: "increase_recall or increase_precision.", required: true },
      { name: "residualBucket", description: "Observed residual/downstream-loss bucket." },
    ],
    render: (args) => {
      const objective = readRequiredString(args.objective, "objective");
      const residualBucket = readOptionalString(args.residualBucket) ?? "dominant residual bucket";
      return {
        description: "Selection tuning plan",
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text:
                `Prepare a read-first selection tuning plan for objective "${objective}" and residual pattern "${residualBucket}". ` +
                `Read newsportal://guide/tuning/selection, articles.residuals.summary, representative articles.explain rows, and operator.tuning.recommend. ` +
                `Return suggested guarded MCP writes only as proposals, then require operator.effect.verify after any applied change.`,
            },
          },
        ],
      };
    },
  },
  {
    name: "channel.health.review",
    description: "Review channel fetch health and source onboarding state.",
    arguments: [
      { name: "channelId", description: "Optional channel id to focus on." },
    ],
    render: (args) => {
      const channelId = readOptionalString(args.channelId) ?? "all relevant channels";
      return {
        description: "Channel health review",
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text:
                `Review NewsPortal channel health for ${channelId}. ` +
                `Read newsportal://guide/diagnostics/channels, operator.system.health scoped to channels, channels.read/list, and fetch_runs.list. ` +
                `Separate source fetch failures from downstream selection outcomes before recommending changes.`,
            },
          },
        ],
      };
    },
  },
  {
    name: "website.pipeline.review",
    description: "Explain website resources, projection, and downstream article selection outcomes.",
    arguments: [
      { name: "channelId", description: "Optional website channel id to focus on." },
    ],
    render: (args) => {
      const channelId = readOptionalString(args.channelId) ?? "the website channel";
      return {
        description: "Website pipeline review",
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text:
                `Review website pipeline behavior for ${channelId}. ` +
                `Read newsportal://guide/diagnostics/website_pipeline, web_resources.list with projection=all, fetch_runs.list, and operator.issue.explain if resources are projected but rejected. ` +
                `Explain resource_only, projected_to_common_pipeline, and final_selection rejected as separate states.`,
            },
          },
        ],
      };
    },
  },
  {
    name: "llm_budget.review",
    description: "Review LLM budget pressure, review behavior, and gray-zone/hold outcomes.",
    arguments: [
      { name: "question", description: "Specific budget or review question." },
    ],
    render: (args) => {
      const question = readOptionalString(args.question) ?? "current LLM budget and review pressure";
      return {
        description: "LLM budget review",
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text:
                `Review ${question}. ` +
                `Read newsportal://guide/diagnostics/llm_budget, llm_budget.summary, operator.system.health scoped to llm_budget and selection, and article explains for representative gray-zone holds. ` +
                `Recommend cost tuning only through operator.tuning.recommend; do not edit templates or interests from one example alone.`,
            },
          },
        ],
      };
    },
  },
  {
    name: "discovery.yield.review",
    description: "Review discovery v3 target/run yield and endpoint promotion readiness.",
    arguments: [
      { name: "targetId", description: "Optional discovery target id." },
      { name: "runId", description: "Optional discovery run id." },
    ],
    render: (args) => {
      const targetId = readOptionalString(args.targetId) ?? "any relevant discovery target";
      const runId = readOptionalString(args.runId) ?? "any relevant discovery run";
      return {
        description: "Discovery yield review",
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text:
                `Review discovery yield for target ${targetId} and run ${runId}. ` +
                `Read newsportal://guide/diagnostics/discovery, discovery.summary.get, coverage, hypotheses, endpoints, contracts, claims, negative evidence, provider health, and operator.report.verify with reportKind=discovery_run or discovery_yield. ` +
                `Explain rejected endpoints by probe evidence, source contracts, provider health, negative evidence, and missing evidence. Never force promotion without valid evidence; if a source is promoted, it starts in probation and does not count as strong coverage until the contract passes.`,
            },
          },
        ],
      };
    },
  },
  {
    name: "system_interest.create",
    description: "Draft a bounded system-interest payload before calling MCP write tools.",
    arguments: [
      { name: "topic", description: "Core monitoring topic.", required: true },
      { name: "audience", description: "Who the signal is for." },
    ],
    render: (args) => {
      const topic = readRequiredString(args.topic, "topic");
      const audience = readOptionalString(args.audience) ?? "operators";
      return {
        description: "System interest drafting guide",
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Draft a NewsPortal system interest for topic "${topic}" aimed at ${audience}. Return a concise interest payload with positive signals, negative signals, places, languages, allowed content kinds, and a priority recommendation.`,
            },
          },
        ],
      };
    },
  },
  {
    name: "system_interest.polish",
    description: "Turn article residual evidence into a bounded system-interest tuning recommendation.",
    arguments: [
      { name: "interestName", description: "Interest or topic being tuned.", required: true },
      { name: "residualPattern", description: "Observed blocker bucket or repeated evidence pattern.", required: true },
    ],
    render: (args) => {
      const interestName = readRequiredString(args.interestName, "interestName");
      const residualPattern = readRequiredString(args.residualPattern, "residualPattern");
      return {
        description: "System-interest tuning guide",
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text:
                `Use newsportal://guide/scenarios/article-diagnostics and the current article/content diagnostics to tune the system interest "${interestName}". ` +
                `The repeated residual pattern is "${residualPattern}". ` +
                `Return a bounded recommendation covering: what evidence suggests the current scope is too narrow or too broad, which positive/negative signals should change, what should stay unchanged, and what follow-up read-after-write checks an operator should perform. Do not auto-write changes.`,
            },
          },
        ],
      };
    },
  },
  {
    name: "llm_template.tune",
    description: "Turn article residual evidence into a bounded LLM template tuning recommendation.",
    arguments: [
      { name: "templateName", description: "Template being tuned.", required: true },
      { name: "residualPattern", description: "Observed blocker bucket or repeated evidence pattern.", required: true },
    ],
    render: (args) => {
      const templateName = readRequiredString(args.templateName, "templateName");
      const residualPattern = readRequiredString(args.residualPattern, "residualPattern");
      return {
        description: "LLM template tuning guide",
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text:
                `Use newsportal://guide/scenarios/article-diagnostics and current article/content residual evidence to tune the LLM template "${templateName}". ` +
                `The repeated residual pattern is "${residualPattern}". ` +
                `Return a bounded recommendation describing which prompt instructions, output expectations, or review thresholds should change, which parts should remain stable, and how to verify the change through NewsPortal MCP after an operator applies it. Do not auto-write changes.`,
            },
          },
        ],
      };
    },
  },
  {
    name: "discovery.coverage.tune",
    description: "Turn article residual evidence into a bounded discovery target/coverage tuning recommendation.",
    arguments: [
      { name: "targetTitle", description: "Discovery target being tuned.", required: true },
      { name: "residualPattern", description: "Observed blocker bucket or repeated evidence pattern.", required: true },
    ],
    render: (args) => {
      const targetTitle = readRequiredString(args.targetTitle, "targetTitle");
      const residualPattern = readRequiredString(args.residualPattern, "residualPattern");
      return {
        description: "Discovery coverage tuning guide",
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text:
                `Use newsportal://guide/scenarios/article-diagnostics and the relevant discovery target, coverage, contract, claim, endpoint, and negative-evidence reads to tune discovery target "${targetTitle}" from downstream evidence. ` +
                `The repeated residual pattern is "${residualPattern}". ` +
                `Return a bounded recommendation covering target graph scope, source-role targets, provider/source constraints, hidden-signal claim requirements, contract thresholds, and what replay eval or follow-up checks should confirm the change. Preserve the invariant that downstream diagnostics inform operators but do not become direct auto-approval inputs. Do not auto-write changes.`,
            },
          },
        ],
      };
    },
  },
  {
    name: "discovery.target.review",
    description: "Review a discovery v3 target before refresh/run/expand.",
    arguments: [
      { name: "targetTitle", description: "Discovery target title.", required: true },
      { name: "goal", description: "Why the target exists." },
    ],
    render: (args) => {
      const targetTitle = readRequiredString(args.targetTitle, "targetTitle");
      const goal = readOptionalString(args.goal) ?? "find net-new high-signal sources";
      return {
        description: "Discovery target review guide",
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Review discovery target "${targetTitle}" for NewsPortal. Check whether the target goal "${goal}" is bounded, whether source-role coverage policy, direct/hidden signal split, provider capabilities, diversity budget, kill switches and contract/probation thresholds are proportional, and what should be adjusted before refresh-coverage, expand-gap or run. If hidden signals are involved, require claims plus control comparison before strong follow-up.`,
            },
          },
        ],
      };
    },
  },
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
              text: `Draft a bounded NewsPortal sequence for objective "${objective}". Return a taskGraph outline, trigger recommendation, and safe operator notes before creating the sequence through MCP.`,
            },
          },
        ],
      };
    },
  },
  {
    name: "cleanup.guidance",
    description: "Prompt for safe MCP cleanup planning after experiments or tests.",
    arguments: [
      { name: "scope", description: "What should be cleaned up.", required: true },
    ],
    render: (args) => {
      const scope = readRequiredString(args.scope, "scope");
      return {
        description: "Cleanup guidance",
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text:
                `Prepare a safe cleanup checklist for NewsPortal MCP work covering "${scope}". ` +
                `Separate reversible actions, destructive actions that require confirmation, and artifacts that should remain for audit or acceptance proof. ` +
                `Use MCP read tools before shell or raw SQL. For MCP token lifecycle, use admin.mcp_tokens.list/revoke/delete_revoked if scopes allow it; otherwise report the missing scope and do not call admin REST directly. ` +
                `Do not guess mcp_access_tokens columns such as id, name, is_active, or is_revoked because those are not schema columns. Leave migration-owned default/adaptive/system sequences unchanged.`,
            },
          },
        ],
      };
    },
  },
] as const;

export function listMcpPrompts() {
  return MCP_PROMPTS.map((prompt) => ({
    name: prompt.name,
    title: buildPromptTitle(prompt.name),
    description: prompt.description,
    arguments: prompt.arguments,
  }));
}

export function resolveMcpPrompt(name: string): McpPromptDefinition {
  const normalized = readRequiredString(name, "name");
  const prompt = MCP_PROMPTS.find((entry) => entry.name === normalized);
  if (!prompt) {
    throw new JsonRpcError(-32602, `Unknown MCP prompt "${normalized}".`, {
      statusCode: 404,
    });
  }
  return prompt;
}

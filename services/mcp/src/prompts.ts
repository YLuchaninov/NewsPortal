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
  {
    name: "operator.session.start",
    description: "Starter guidance for understanding and safely using the SignalOps MCP server.",
    arguments: [
      { name: "objective", description: "What the operator or agent wants to accomplish.", required: true },
      { name: "domain", description: "Primary MCP domain such as discovery, sequences, templates, channels, or system interests." },
    ],
    render: (args) => {
      const objective = readRequiredString(args.objective, "objective");
      const domain = readOptionalString(args.domain) ?? "the relevant operator domain";
      return {
        description: "SignalOps MCP operator orientation",
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text:
                `You are starting a SignalOps MCP operator session for objective "${objective}" in ${domain}. ` +
                `First orient yourself with the guide resources signalops://guide/server-overview and signalops://guide/operator-playbooks, then read the current operator state through signalops://admin/summary and the relevant domain list/read tools. ` +
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
                `Plan a SignalOps MCP sequence session for objective "${objective}". ` +
                `Read signalops://guide/scenarios/sequences, signalops://admin/summary, and signalops://sequences first. ` +
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
                `Plan a SignalOps MCP Discovery vNext session for objective "${objective}". ` +
                `Read signalops://guide/scenarios/discovery, signalops://discovery/runs, signalops://discovery/artifacts, signalops://discovery/candidates, signalops://discovery/source-inventory, signalops://discovery/policies, and signalops://discovery/eval-runs first. ` +
                `If the operator references a manual/example bundle that worked before, run a funnel-calibration pass first: compare current system interests, LLM templates, channels, bottlenecks, residuals, vNext artifacts, source inventory, and policy state against the bundle's signal families, source capability classes, negative cues, and review policy, then produce a portable funnel spec before starting broad source expansion. ` +
                `Unless the operator explicitly asks for manual approval, make the plan guarded-automation-first: create a vNext run, compile a DiscoveryBrief, run bounded mega-loop/candidate/probe steps, and rely on SourceUnderstanding, RoutingDecision, active policy, and replay proof where evidence is sufficient. ` +
                `Use discovery.artifact.review, discovery.source_understanding.review, or discovery.policy.tune when hypothesis boundaries, provider choices, routing evidence, or policy fit need tightening. ` +
                `Register probation only through vNext routing and source_channels/outbox handoff. Missing policy or invalid evidence fails closed.`,
            },
          },
        ],
      };
    },
  },
  {
    name: "operator.funnel.calibrate",
    description: "Compare a prior working manual/reference bundle with current MCP state before discovery or template tuning.",
    arguments: [
      { name: "objective", description: "The funnel or product outcome being calibrated.", required: true },
      { name: "referenceEvidence", description: "Manual/example bundle, JSON asset, admin settings, or observed working configuration.", required: true },
      { name: "currentGap", description: "Observed current failure pattern, such as low selected yield, noisy sources, or missing source capability classes." },
    ],
    render: (args) => {
      const objective = readRequiredString(args.objective, "objective");
      const referenceEvidence = readRequiredString(args.referenceEvidence, "referenceEvidence");
      const currentGap = readOptionalString(args.currentGap) ?? "current funnel quality or yield gap";
      return {
        description: "Funnel calibration guide",
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text:
                `Calibrate a SignalOps product funnel for objective "${objective}" using reference evidence "${referenceEvidence}" and current gap "${currentGap}". ` +
                `Read signalops://guide/scenarios/funnel-calibration and call operator.funnel.audit plus operator.funnel.autoplan first when available, then inspect system_interests.list/read, system_interests.compile_status.list, templates.duplicates.audit, llm_templates.list/read, channels.bottlenecks.summary/list, signal_candidates.residuals.summary, content_items.list, discovery.runs.list, discovery.artifacts.list, discovery.source_inventory.list, discovery.policies.list, and operator.report.verify before proposing writes. ` +
                `Extract reusable patterns from the reference into a portable funnel spec: objective, actor/buyer model, signal families, source capability mix, positive cues, near-miss negative cues, allowed content kinds, strictness/review policy, LLM review scope, provider/adapter requirements, observation budget, and expected read-back proof. ` +
                `Separate recommendations by layer: source acquisition breadth, source-family balance, source technical health/repair, candidate or gray-zone recovery, final selected-content precision, and reporting/proof. Retain working noisy, low-yield, and negative-control useful channels unless the operator explicitly disables them; recommend labeling, measurement, cadence changes, or repair instead of auto-disabling semantically plausible working sources. ` +
                `If the operator asks only to improve the system or generalize the approach, return rules, prompts, and product-flow recommendations without mutating domain configuration. If the operator asks to run a domain product test, then return a bounded MCP-only mutation plan: which interests/templates/channels and Discovery vNext artifacts or policies should be updated or created, which source classes need adapters rather than fake RSS/website rows, what reindex/backfill is needed, and how to verify precision and web-visible selected counts. ` +
                `Do not put domain-specific vocabulary into code; domain tuning belongs in MCP/admin configuration and replayable evidence.`,
            },
          },
        ],
      };
    },
  },
  {
    name: "discovery.live_gap_hunting.plan",
    description: "Plan a domain-neutral live Discovery vNext gap-hunting run that uses MCP-only operator actions.",
    arguments: [
      { name: "objective", description: "The live proof objective.", required: true },
      { name: "scenarioPacks", description: "Comma-separated or prose list of scenario packs to include." },
      { name: "budget", description: "The intended bounded live budget or timebox." },
    ],
    render: (args) => {
      const objective = readRequiredString(args.objective, "objective");
      const scenarioPacks =
        readOptionalString(args.scenarioPacks) ??
        "public_procurement, security_advisories, policy_regulatory, research_grants, software_changelogs";
      const budget = readOptionalString(args.budget) ?? "bounded explicit live budget";
      return {
        description: "Discovery vNext live MCP gap-hunting guide",
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text:
                `Plan a SignalOps Discovery vNext live MCP gap-hunting run for objective "${objective}". ` +
                `Use scenario packs ${scenarioPacks} with ${budget}. ` +
                `Read signalops://guide/scenarios/discovery-live-gap-hunting, signalops://guide/scenarios/discovery, signalops://guide/scenarios/funnel-calibration and signalops://guide/operating-model first. ` +
                `Use only MCP tools for product actions: create/read system interests, inspect recommendations, execute live discovery runs, poll diagnostics, apply probation handoff only when routing recommends it, submit feedback, replay persisted inputs, and verify reports. ` +
                `Classify any failure as missing_mcp_surface, schema_gap, runtime_gap, diagnostic_gap, policy_gap, or provider_gap, then fix interface/runtime gaps before treating the proof as complete. ` +
                `Keep live evidence for manual inspection unless the operator explicitly requests cleanup.`,
            },
          },
        ],
      };
    },
  },
  {
    name: "discovery.source_understanding.review",
    description: "Review SourceUnderstanding, RoutingDecision, or probation source evidence.",
    arguments: [
      { name: "contract", description: "SourceUnderstanding, RoutingDecision, or probation evidence to review.", required: true },
    ],
    render: (args) => {
      const contract = readRequiredString(args.contract, "contract");
      return {
        description: "SourceUnderstanding review",
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text:
                `Review this Discovery vNext source evidence: ${contract}. ` +
                `Identify probe, observability, duplicate, freshness, extraction, risk, and policy gaps; recommend auto_register, cheap_watch, inventory_only, manual_review, adapter_backlog, or blocked. Historical yield is telemetry only.`,
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
                `Plan a SignalOps MCP system-interest session for topic "${topic}". ` +
                `Read signalops://guide/scenarios/system-interests and signalops://system-interests first to avoid overlap. ` +
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
                `Plan a SignalOps MCP LLM template session for intent "${templateIntent}". ` +
                `Read signalops://guide/scenarios/llm-templates and signalops://templates/llm first, keep the change bounded to one template and one behavior goal, prefer archive before delete when lineage matters, and verify the updated template through read surfaces after mutation.`,
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
                `Plan a SignalOps MCP channel session for source "${source}". ` +
                `Read signalops://guide/scenarios/channels and signalops://channels first to detect overlap or duplication. ` +
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
                `Plan a SignalOps MCP observability session for question "${question}". ` +
                `Read signalops://guide/scenarios/observability and signalops://admin/summary first, then narrow to the relevant read surfaces such as fetch runs, web resources, sequence runs, discovery summary, or LLM budget. ` +
                `Keep the session read-only until the needed evidence is gathered and only then switch to a domain-specific write scenario if a change is truly needed.`,
            },
          },
        ],
      };
    },
  },
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
  {
    name: "selection.tuning.plan",
    description: "Plan a safe selection fine-tuning session from residual/signal_candidate evidence.",
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
                `Read signalops://guide/tuning/selection, signal_candidates.residuals.summary, representative signal_candidates.explain rows, and operator.tuning.recommend. ` +
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
                `Review SignalOps channel health for ${channelId}. ` +
                `Read signalops://guide/diagnostics/channels, operator.system.health scoped to channels, channels.read/list, and fetch_runs.list. ` +
                `Separate source fetch failures from downstream selection outcomes before recommending changes.`,
            },
          },
        ],
      };
    },
  },
  {
    name: "website.pipeline.review",
    description: "Explain website resources, projection, and downstream signal_candidate selection outcomes.",
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
                `Read signalops://guide/diagnostics/website_pipeline, web_resources.list with projection=all, fetch_runs.list, and operator.issue.explain if resources are projected but rejected. ` +
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
                `Read signalops://guide/diagnostics/llm_budget, llm_budget.summary, operator.system.health scoped to llm_budget and selection, and signal_candidate explains for representative gray-zone holds. ` +
                `Recommend cost tuning only through operator.tuning.recommend; do not edit templates or interests from one example alone.`,
            },
          },
        ],
      };
    },
  },
  {
    name: "discovery.yield.review",
    description: "Review Discovery vNext run, artifact, source inventory, and routing quality.",
    arguments: [
      { name: "runId", description: "Optional Discovery vNext run id." },
      { name: "sourceInventoryId", description: "Optional source inventory id." },
    ],
    render: (args) => {
      const runId = readOptionalString(args.runId) ?? "any relevant Discovery vNext run";
      const sourceInventoryId = readOptionalString(args.sourceInventoryId) ?? "any relevant source inventory record";
      return {
        description: "Discovery vNext review",
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text:
                `Review Discovery vNext quality for run ${runId} and source inventory ${sourceInventoryId}. ` +
                `Read signalops://guide/diagnostics/discovery, discovery.runs.list, discovery.artifacts.list, discovery.candidates.list, discovery.source_inventory.list, discovery.policies.list, discovery.replay_runs.list, and discovery.rollback_groups.list. ` +
                `Explain routing by SourceUnderstanding, ProbeReport, RoutingDecision, active policy version, risk, observability, and adapter backlog state. Treat historical yield as telemetry only; never use it as a keep/drop reason.`,
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
              text:
                `Draft a SignalOps system interest for topic "${topic}" aimed at ${audience}. ` +
                `Return a concise interest payload with positive prototypes, near-miss negative prototypes, must-not terms, candidate uplift positive/negative cue groups, allowed content kinds, places, languages, strictness/review-policy recommendation, and priority. ` +
                `For rare-signal funnels, keep must-have terms and time windows empty unless a marker is truly mandatory; prefer negative cues and LLM review to preserve recall while filtering near-miss noise.`,
            },
          },
        ],
      };
    },
  },
  {
    name: "system_interest.polish",
    description: "Turn signal_candidate residual evidence into a bounded system-interest tuning recommendation.",
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
                `Use signalops://guide/scenarios/signal_candidate-diagnostics and the current signal_candidate/content diagnostics to tune the system interest "${interestName}". ` +
                `The repeated residual pattern is "${residualPattern}". ` +
                `Return a bounded recommendation covering: what evidence suggests the current scope is too narrow or too broad, which positive/negative signals and candidate cue groups should change, whether short-form buyer/project evidence should recover items into gray/LLM/hold despite weak semantic similarity, whether hard gates such as must-have terms or time windows would harm recall for rare signals, what should stay unchanged, and what follow-up read-after-write checks an operator should perform. Do not auto-write changes.`,
            },
          },
        ],
      };
    },
  },
  {
    name: "llm_template.tune",
    description: "Turn signal_candidate residual evidence into a bounded LLM template tuning recommendation.",
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
                `Use signalops://guide/scenarios/signal_candidate-diagnostics and current signal_candidate/content residual evidence to tune the LLM template "${templateName}". ` +
                `The repeated residual pattern is "${residualPattern}". ` +
                `Return a bounded recommendation describing which prompt instructions, output expectations, or review thresholds should change, which reference-bundle guardrails should be preserved, which parts should remain stable, and how to verify the change through SignalOps MCP after an operator applies it. Do not auto-write changes.`,
            },
          },
        ],
      };
    },
  },
  {
    name: "discovery.policy.tune",
    description: "Turn signal_candidate residual evidence into a bounded Discovery vNext policy/artifact tuning recommendation.",
    arguments: [
      { name: "targetTitle", description: "Discovery vNext run, artifact, or policy being tuned.", required: true },
      { name: "residualPattern", description: "Observed blocker bucket or repeated evidence pattern.", required: true },
    ],
    render: (args) => {
      const targetTitle = readRequiredString(args.targetTitle, "targetTitle");
      const residualPattern = readRequiredString(args.residualPattern, "residualPattern");
      return {
        description: "Discovery vNext tuning guide",
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text:
                `Use signalops://guide/scenarios/signal_candidate-diagnostics and the relevant Discovery vNext run, artifact, candidate, source inventory, policy, replay, and rollback reads to tune "${targetTitle}" from downstream evidence. ` +
                `The repeated residual pattern is "${residualPattern}". ` +
                `Return a bounded recommendation covering brief constraints, mega-loop budget, probe policy, source understanding evidence, routing policy, adapter backlog criteria, and what replay eval or follow-up checks should confirm the change. Preserve the invariant that downstream diagnostics inform operators but do not become direct auto-approval inputs. Do not auto-write changes.`,
            },
          },
        ],
      };
    },
  },
  {
    name: "discovery.artifact.review",
    description: "Review a Discovery vNext artifact or run before route/register/replay.",
    arguments: [
      { name: "targetTitle", description: "Discovery vNext artifact, run, or policy label.", required: true },
      { name: "goal", description: "Why the artifact or run exists." },
    ],
    render: (args) => {
      const targetTitle = readRequiredString(args.targetTitle, "targetTitle");
      const goal = readOptionalString(args.goal) ?? "find net-new high-signal sources";
      return {
        description: "Discovery vNext artifact review guide",
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Review Discovery vNext item "${targetTitle}" for SignalOps. Check whether the goal "${goal}" is bounded, whether DiscoveryBrief constraints, source capability expectations, provider capabilities, diversity budget, active policies, risk gates, and probation handoff criteria are proportional, and what should be adjusted before route, register, replay, or rollback.`,
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
              text: `Draft a bounded SignalOps sequence for objective "${objective}". Return a taskGraph outline, trigger recommendation, and safe operator notes before creating the sequence through MCP.`,
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
                `Prepare a safe cleanup checklist for SignalOps MCP work covering "${scope}". ` +
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

import { readOptionalString, readRequiredString } from "../protocol";
import type { McpPromptDefinition } from "./types";

export const openingSessionPrompts: readonly McpPromptDefinition[] = [
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
                `First call operator.flow.route with the objective/domain/symptoms, or produce an equivalent route block, before recommending mutations, writes, or final claims. ` +
                `Then orient yourself with signalops://guide/playbooks/flow-routing, signalops://guide/server-overview and signalops://guide/operator-playbooks, and read current operator state through signalops://admin/summary plus relevant domain list/read tools. ` +
                `Report the route block fields flowMode, changeIntent/cleanupIntent/tuningLayer when relevant, mustRead, mustDoNext, doNotDoYet, blockedUntil and proofRequired before proposing changes. ` +
                `Choose and report a flowMode from operator.flow.route or signalops://guide/playbooks/operator-flow-modes before recommending mutations: diagnostic, planned_change, expert_override, source_onboarding, scenario_pack_rollout, or cleanup. ` +
                `For updates, tuning, or cleanup, also choose advisory changeIntent, cleanupIntent, tuningLayer, and updateRisk from signalops://guide/playbooks/change-intents; mutation responses are not verified effect. ` +
                `For 0 selected, 0 LLM reviews, Discovery quality_gap, source onboarding, or config writes, follow signalops://guide/playbooks/strict-next-steps before proposing mutations or final claims. ` +
                `Strict is a default safety rail for clients, not a ban on expert operator action; expert override requires an operatorOverrideReason and still cannot skip final read-back/report verification. ` +
                `For 0 selected signals or semantic_rejected/no_system_match, read signalops://guide/scenarios/selection-calibration and signalops://guide/reference/selection-evidence-semantics before broadening interests, templates, sources, or LLM settings. For invalid RSS/source failures, use channels.bottlenecks.* and channels.alternatives.plan before creating alternatives. ` +
                `For hidden, mixed or unknown selection work, read signalops://guide/reference/hidden-signal-evidence-lanes, classify signalVisibility, keep hard gates empty by default for hidden lanes, and require mandatory-marker proof before must_have_terms. ` +
                `When interpreting selection dashboards or reports, remember filter rows are not distinct candidates; use filterReasonBreakdown and channels.bottlenecks.summary/list read-back before reporting current source counts or active failures. ` +
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
                `Call operator.flow.route first when the session involves quality_gap, source repair, source onboarding, planned changes, expert override, or final reporting; report the returned route block before proposing writes. ` +
                `Read signalops://guide/playbooks/flow-routing, signalops://guide/playbooks/operator-flow-modes, signalops://guide/playbooks/change-intents and signalops://guide/playbooks/strict-next-steps first when the session involves quality_gap, source repair, source onboarding, planned changes, expert override, or final reporting. ` +
                `Read signalops://guide/scenarios/discovery, signalops://discovery/runs, signalops://discovery/artifacts, signalops://discovery/candidates, signalops://discovery/source-inventory, signalops://discovery/policies, and signalops://discovery/eval-runs first. ` +
                `Treat passed_with_quality_gap as partial proof only; report candidate count, distinct persisted candidates, probe coverage, warnings, routing decisions, and handoff counts. discovery.brief.preview is diagnostic only and is not a bypass for persisted DiscoveryBrief validation or domain_contamination. ` +
                `If the operator references a manual/example bundle that worked before, run a funnel-calibration pass first: compare current system interests, LLM templates, channels, bottlenecks, residuals, vNext artifacts, source inventory, and policy state against the bundle's signal families, source capability classes, negative cues, and review policy, then produce a portable funnel spec before starting broad source expansion. ` +
                `Unless the operator explicitly asks for manual approval, make the plan guarded-automation-first: create a vNext run, compile a DiscoveryBrief, run bounded mega-loop/candidate/probe steps, and rely on SourceUnderstanding, RoutingDecision, active policy, and replay proof where evidence is sufficient. ` +
                `Before live execution, check runtime credentials/provider readiness; runtime_credentials_missing means preflight/not_applicable for live-provider proof and should not be treated as a maxRunCostCents or budget-tuning problem. ` +
                `Use discovery.artifact.review, discovery.source_understanding.review, or discovery.policy.tune when hypothesis boundaries, provider choices, routing evidence, or policy fit need tightening. ` +
                `Register probation only through vNext routing and source_channels/outbox handoff. Missing policy or invalid evidence fails closed.`,
            },
          },
        ],
      };
    },
  },
];

export const maintenanceSessionPrompts: readonly McpPromptDefinition[] = [
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
                `Call operator.flow.route first and report the route block before recommending mutations. Read signalops://guide/playbooks/flow-routing, signalops://guide/playbooks/operator-flow-modes, signalops://guide/playbooks/change-intents, signalops://guide/scenarios/system-interests and signalops://system-interests first to avoid overlap. Use planned_change with changeIntent=config_update or policy_update for normal improvements, diagnostic only for current failure evidence, and expert_override only with operatorOverrideReason plus final read-back/report verification. ` +
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
                `Call operator.flow.route first and report the route block before recommending source writes. Read signalops://guide/playbooks/flow-routing, signalops://guide/playbooks/operator-flow-modes, signalops://guide/playbooks/change-intents, signalops://guide/scenarios/channels and signalops://channels first to detect overlap or duplication. Use source_onboarding with changeIntent=source_tuning for source additions or repair, planned_change with changeIntent=cadence_update for cadence/provider tuning, and cleanup with cleanupIntent for intentional deactivation/archive. ` +
                `If the channel originated from discovery, preserve the candidate evidence before manual edits. ` +
                `For malformed, auth-blocked, not acceptable, HTML-instead-of-feed, or gone RSS failures, run channels.bottlenecks.summary/list and channels.alternatives.plan; review website_fallback candidates as needs_probe only, then use channels.bulk_onboard.plan/apply/verify for any chosen website fallback. ` +
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
];

import { readOptionalString, readRequiredString } from "../protocol";
import type { McpPromptDefinition } from "./types";

export const discoveryPlanningPrompts: readonly McpPromptDefinition[] = [
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
                `Call operator.flow.route first and report the route block, then read signalops://guide/scenarios/funnel-calibration and call operator.funnel.audit plus operator.funnel.autoplan first when available. Inspect system_interests.list/read, system_interests.compile_status.list, templates.duplicates.audit, llm_templates.list/read, channels.bottlenecks.summary/list, signal_candidates.residuals.summary, content_items.list, discovery.runs.list, discovery.artifacts.list, discovery.source_inventory.list, discovery.policies.list, and operator.report.verify before proposing writes. ` +
                `Choose flowMode explicitly: planned_change for deliberate improvements, scenario_pack_rollout for domain configuration packs, source_onboarding for source-family changes, and diagnostic only when current read-back proves a failure state. ` +
                `Choose changeIntent and tuningLayer explicitly: selection_tuning for selected/recall/precision, source_tuning for acquisition/source-family changes, llm_tuning with tuningLayer=llm_provider for provider/model/budget work, and cleanupIntent when the request is cleanup. ` +
                `Extract reusable patterns from the reference into a portable funnel spec: objective, actor/buyer model, signal families, source capability mix, positive cues, near-miss negative cues, allowed content kinds, strictness/review policy, LLM review scope, provider/adapter requirements, observation budget, and expected read-back proof. ` +
                `Separate recommendations by layer: source acquisition breadth, source-family balance, source technical health/repair, candidate or gray-zone recovery, final selected-content precision, and reporting/proof. Retain working noisy, low-yield, and negative-control useful channels unless the operator explicitly disables them; recommend labeling, measurement, cadence changes, or repair instead of auto-disabling semantically plausible working sources. ` +
                `Do not infer current active source count or active failures from reference evidence; read channels.bottlenecks.summary/list and separate current state from historical/transient failures. ` +
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
];

export const discoveryReviewPrompts: readonly McpPromptDefinition[] = [
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
];

export const discoveryTuningPrompts: readonly McpPromptDefinition[] = [
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
];

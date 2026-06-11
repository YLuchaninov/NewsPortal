import { MCP_SERVER_INSTRUCTIONS } from "../context";
import { getOperatingModelGuide } from "../operating-intelligence";
import type { McpResourceDefinition } from "./types";

export const operatingModelGuideResources: readonly McpResourceDefinition[] = [
  {
    uri: "signalops://guide/operating-model",
    name: "guide.operating.model",
    title: "Operating Model",
    description: "End-to-end operating model for returning after setup, diagnosing problems, tuning settings, and verifying effects.",
    mimeType: "application/json",
    read: async () => getOperatingModelGuide(),
  },
];

export const serverGuideResources: readonly McpResourceDefinition[] = [
  {
    uri: "signalops://guide/server-overview",
    name: "guide.server.overview",
    description: "Operator-facing overview of what the SignalOps MCP server is for and how to start.",
    mimeType: "application/json",
    read: async () => ({
      purpose:
        "SignalOps MCP is a bounded remote operator control plane for admin/maintenance work over sequences, discovery, system interests, LLM templates, channels, and read-only observability.",
      startHere: [
        "Read signalops://admin/summary first to understand current operator state.",
        "Use list/read tools before write tools so mutations are grounded in current server truth.",
        "Use prompts to draft payloads or cleanup plans before mutating operator-owned entities.",
        "After any write, read the affected entity back through MCP to confirm the resulting state.",
      ],
      toolFamilies: {
        read: [
          "admin.summary.get",
          "admin.mcp_tokens.list",
          "signal_candidates.list/read/explain",
          "content_items.list/read/explain",
          "signal_candidates.residuals.list/summary",
          "system_interests.list/read",
          "llm_templates.list/read",
          "channels.list/read",
          "discovery.*read",
          "sequences.*read",
          "web_resources.*",
          "fetch_runs.*",
          "llm_budget.summary",
          "operator.system.health",
          "operator.issue.explain",
          "operator.tuning.recommend",
          "operator.effect.verify",
          "operator.report.verify",
        ],
        write: [
          "admin.mcp_tokens.revoke",
          "admin.mcp_tokens.delete_revoked",
          "system_interests.*",
          "llm_templates.*",
          "channels.*",
          "discovery.*",
          "sequences.*",
        ],
      },
      guidance: [
        "Prefer bounded changes over broad multi-entity edits.",
        "PostgreSQL owns business truth; Redis, BullMQ, queues, indexes and cache are transport or derived state.",
        "Sequence-managed outbox events route through q.sequence only; old per-stage queues are not MCP operator recovery paths.",
        "final_selection_results is the primary selection truth, and web_resources are first-class website/resource truth rather than hidden RSS or signal_candidate substitutes.",
        "Discovery vNext is the operator-facing discovery truth.",
        "This MCP resource set is the operator truth for MCP sessions; product docs and AIDP must express the same invariants for their audiences.",
        "Treat prompts and resources as guidance/context only; they do not grant authority on their own.",
        "Destructive tools require both write.destructive scope and confirm=true.",
        "MCP is a control-plane transport, not a second source of truth; do not reason as if it bypasses runtime owners.",
        "For old/historical signal_candidate replay or current-interest selection recalculation, route to maintenance.reindex.request with jobKind=backfill rather than content_analysis.backfill.request.",
        "Use operator.report.verify before final human-facing reports for cleanup, onboarding, discovery-run, and selection claims.",
        "For ongoing operations after setup, use operator.system.health and signalops://ops/* resources before fine-tuning.",
      ],
    }),
  },
  {
    uri: "signalops://guide/client-contract",
    name: "guide.client.contract",
    title: "MCP Client Contract",
    description: "Critical client guidance that should be used even when a client only exposes tools.",
    mimeType: "application/json",
    read: async () => ({
      initializeInstructions: MCP_SERVER_INSTRUCTIONS,
      criticalRules: [
        "Prefer MCP read tools over shell/raw SQL for normal operator state.",
        "Use admin.mcp_tokens.list, admin.mcp_tokens.revoke, and admin.mcp_tokens.delete_revoked for token lifecycle. Do not bypass MCP by calling the admin REST token endpoint directly.",
        "Never revoke the current MCP token through the active MCP session; use a different admin.tokens token or the admin UI.",
        "Use canonical tool schemas. Unknown aliases should be treated as invalid instead of guessed.",
        "Write payloads must be JSON objects with no nested payload.payload envelope; MCP rejects malformed writes before backend/API calls.",
        "Before final reports, use operator.report.verify so counts/statuses come from DB-backed state rather than inferred tool-call intent.",
        "Intent routing: старые статьи / прогнать заново / перепроверить по интересам / selected шумит / after Example C, templates, or criteria changes maps to maintenance.reindex.request payload.jobKind=backfill.",
        "Content-analysis backfill is not a selection replay; it does not recompute signal_candidate.match_criteria, interest_filter_results, or final_selection_results.",
        "For ongoing system work, follow observe -> diagnose -> recommend -> guarded change -> verify effect -> monitor.",
        "Before recommending mutations, choose and report flowMode from signalops://guide/playbooks/operator-flow-modes. Use diagnostic for current failures, planned_change for deliberate improvements, expert_override only with operatorOverrideReason, source_onboarding for source additions/repair, scenario_pack_rollout for config packs, and cleanup for artifact cleanup.",
        "For system updates, config updates, tuning and cleanup, also report advisory changeIntent, cleanupIntent, tuningLayer and updateRisk from signalops://guide/playbooks/change-intents.",
        "Strict diagnostic sequencing is a default MCP client safety rail, not a ban on expert operator action; expert override cannot skip final MCP read-back or operator.report.verify.",
        "Mutation responses are not verified effect. Source acquisition proof is not selection proof.",
        "For 0 selected signals, follow signalops://guide/scenarios/selection-calibration: classify the failing layer, inspect representative explains, calibrate one interest/candidate, read back, replay bounded docIds, and verify.",
        "For hidden or operational signals, do not recommend positive-term expansion as the primary recovery path. Use candidateSignals, policy evidence, near-miss negatives, representative explains, bounded docIds replay, and operator.report.verify.",
        "Selection evidence semantics matter: must_have_terms is an any-of hard lexical text constraint; short_tokens_required is an extracted short-token requirement; positive_texts are semantic prototypes, not keyword recovery; criteriaMatches/interestMatches counters are not selected-signal proof.",
        "Gray-zone collapse is not automatically improvement. Compare reindex freshness, residual distributions, rejected samples, selected quality, and hold quality before reporting better precision.",
        "Do not start zero-selected diagnosis with mass strictness=broad, mass interest edits, LLM template rewrites, or adding RSS/channel volume before residual evidence proves the layer.",
        "llmReviewMode=always does not bypass semantic_rejected/no_system_match; LLM review can run only for candidates that reach a reviewable path.",
        "RSS/channel volume is acquisition evidence, not selection proof. API/portal/search sources need adapter/config handling instead of fake RSS/website rows.",
        "Live Discovery without runtime credentials/provider readiness is preflight/not_applicable or runtime_credentials_missing, not a budget tuning task.",
        "Destructive cleanup needs both explicit confirmation in tool arguments and the required token scopes.",
        "Migration-created default/adaptive/system sequences are protected system objects and must stay unchanged during cleanup.",
        "Verify final state with list/read tools after each mutation.",
      ],
      clientCompatibility: {
        toolOnlyClients:
          "If resources/prompts are not available, rely on initialize.instructions, tool descriptions, inputSchema, outputSchema, and annotations.",
        resourceAwareClients:
          "Read signalops://guide/server-overview, signalops://guide/operating-model, and the relevant signalops://guide/scenarios/* or diagnostics/tuning resource before complex work.",
        promptAwareClients:
          "Use operator.session.start or a domain-specific *.session.plan prompt before multi-step operator changes.",
      },
      cleanupFlow: [
        "Read admin.summary.get and the relevant entity lists.",
        "Read admin.mcp_tokens.list for token inventory.",
        "Use admin.mcp_tokens.revoke for extra tokens when the current token has admin.tokens and write.destructive scopes; otherwise report that token cleanup requires a scoped token or admin UI, not direct REST bypass.",
        "Archive reversible artifacts first when lineage matters.",
        "Leave migration-owned default/adaptive/system sequences unchanged.",
        "Delete only intentionally disposable artifacts with confirm=true.",
        "Read final state and report counts plus any intentionally retained audit artifacts.",
        "Call operator.report.verify with reportKind=cleanup before the final cleanup answer.",
      ],
    }),
  },
];

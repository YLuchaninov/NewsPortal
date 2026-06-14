import { readOptionalString, readRequiredString } from "../protocol";
import type { McpPromptDefinition } from "./types";

export const llmBudgetPrompts: readonly McpPromptDefinition[] = [
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
                `Call operator.flow.route first with symptoms such as zero_llm_reviews or model_update when relevant, and report the route block before recommending LLM changes. ` +
                `Read signalops://guide/playbooks/flow-routing, signalops://guide/playbooks/change-intents, signalops://guide/diagnostics/llm_budget, llm_budget.summary, operator.system.health scoped to llm_budget and selection, and signal_candidate explains for representative gray-zone holds. ` +
                `Use changeIntent=llm_tuning and tuningLayer=llm_provider for provider/model/budget readiness work; keep selection path diagnosis separate. ` +
                `Explain no_pending_gray_zone, hard-filter collapse, and semantic rejection before LLM before calling the provider broken; distinguish llm_review_disabled, budget_exhausted, worker_not_running, provider_credentials_missing, provider_endpoint_error/provider_404, and no reviewable candidate path. ` +
                `Recommend cost tuning only through operator.tuning.recommend; do not edit templates or interests from one example alone.`,
            },
          },
        ],
      };
    },
  },
];

export const templateTuningPrompts: readonly McpPromptDefinition[] = [
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
];

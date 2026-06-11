import { readOptionalString } from "../protocol";
import type { McpPromptDefinition } from "./types";

export const channelReviewPrompts: readonly McpPromptDefinition[] = [
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
                `For invalid RSS failures, also run channels.bottlenecks.summary/list and channels.alternatives.plan; website_fallback candidates are needs_probe source-repair options that must go through channels.bulk_onboard.plan/apply/verify, not blind auto-creation. Separate source fetch failures from downstream selection outcomes before recommending changes.`,
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
];

import { readRequiredString } from "../protocol";
import type { McpPromptDefinition } from "./types";

export const cleanupPrompts: readonly McpPromptDefinition[] = [
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
];

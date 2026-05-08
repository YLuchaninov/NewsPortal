import type { McpToolDefinition } from "../shared";

// Discovery v1/v2 write tools were retired by the resilient discovery v3 cutover.
// v3 tools live in ./v3-tools and are the only discovery tools exported.
export const DISCOVERY_WRITE_TOOLS: readonly McpToolDefinition[] = [] as const;

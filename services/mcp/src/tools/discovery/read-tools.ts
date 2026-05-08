import type { McpToolDefinition } from "../shared";

// Discovery v1/v2 read tools were retired by the resilient discovery v3 cutover.
// Keep this tombstone module only so old source imports fail closed during the
// approval-gated cleanup window.
export const DISCOVERY_READ_TOOLS: readonly McpToolDefinition[] = [] as const;

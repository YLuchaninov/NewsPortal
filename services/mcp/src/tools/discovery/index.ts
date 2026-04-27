import type { McpToolDefinition } from "../shared";
import { DISCOVERY_READ_MCP_TOOLS } from "./read-tools";
import { DISCOVERY_WRITE_MCP_TOOLS } from "./write-tools";

export const DISCOVERY_MCP_TOOLS: readonly McpToolDefinition[] = [
  ...DISCOVERY_READ_MCP_TOOLS,
  ...DISCOVERY_WRITE_MCP_TOOLS,
] as const;

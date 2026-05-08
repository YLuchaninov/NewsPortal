import type { McpToolDefinition } from "../shared";
import {
  DISCOVERY_V3_READ_MCP_TOOLS,
  DISCOVERY_V3_WRITE_MCP_TOOLS,
} from "./v3-tools";

export const DISCOVERY_MCP_TOOLS: readonly McpToolDefinition[] = [
  ...DISCOVERY_V3_READ_MCP_TOOLS,
  ...DISCOVERY_V3_WRITE_MCP_TOOLS,
] as const;

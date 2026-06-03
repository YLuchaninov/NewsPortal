import type { McpToolDefinition } from "../shared";
import {
  DISCOVERY_VNEXT_ALIAS_MCP_TOOLS,
  DISCOVERY_VNEXT_READ_MCP_TOOLS,
  DISCOVERY_VNEXT_WRITE_MCP_TOOLS,
} from "./vnext-tools";

export const DISCOVERY_MCP_TOOLS: readonly McpToolDefinition[] = [
  ...DISCOVERY_VNEXT_READ_MCP_TOOLS,
  ...DISCOVERY_VNEXT_WRITE_MCP_TOOLS,
  ...DISCOVERY_VNEXT_ALIAS_MCP_TOOLS,
] as const;

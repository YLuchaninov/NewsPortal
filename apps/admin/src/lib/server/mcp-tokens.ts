import {
  MCP_SCOPE_OPTIONS,
  listMcpAccessTokens,
  type McpAccessTokenRecord,
  type McpScope,
} from "@newsportal/control-plane";

import { getPool } from "./db";

export interface McpTokenWorkspaceData {
  tokens: McpAccessTokenRecord[];
  scopeOptions: readonly McpScope[];
}

export async function loadMcpTokenWorkspaceData(): Promise<McpTokenWorkspaceData> {
  return {
    tokens: await listMcpAccessTokens(getPool()),
    scopeOptions: MCP_SCOPE_OPTIONS,
  };
}

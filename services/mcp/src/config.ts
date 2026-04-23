import { readRuntimeConfig } from "@newsportal/config";

export interface McpServiceConfig {
  mcpPort: number;
  apiBaseUrl: string;
  publicApiBaseUrl: string;
  databaseUrl: string;
}

function buildDatabaseUrl(env: Record<string, string | undefined>): string {
  if (env.DATABASE_URL) {
    return env.DATABASE_URL;
  }

  const user = env.POSTGRES_USER ?? "newsportal";
  const password = env.POSTGRES_PASSWORD ?? "newsportal";
  const host = env.POSTGRES_HOST ?? "127.0.0.1";
  const port =
    env.POSTGRES_PORT ??
    (host === "127.0.0.1" || host === "localhost" ? "55432" : "5432");
  const database = env.POSTGRES_DB ?? "newsportal";
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
}

export function loadMcpServiceConfig(
  env: Record<string, string | undefined> = process.env
): McpServiceConfig {
  const runtimeConfig = readRuntimeConfig(env, {
    defaultAppBaseUrl: "http://127.0.0.1:4300/",
    defaultApiBaseUrl: "http://127.0.0.1:8000",
  });

  return {
    mcpPort: Number.parseInt(env.MCP_PORT ?? "4300", 10) || 4300,
    apiBaseUrl: runtimeConfig.apiBaseUrl,
    publicApiBaseUrl: runtimeConfig.publicApiBaseUrl,
    databaseUrl: buildDatabaseUrl(env),
  };
}

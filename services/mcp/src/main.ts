import Fastify from "fastify";

import {
  recordMcpRequestLog,
  touchMcpAccessTokenUsage,
  type McpAccessTokenRecord,
} from "@newsportal/control-plane";
import { createNewsPortalSdk } from "@newsportal/sdk";

import { authenticateMcpRequest } from "./auth";
import { loadMcpServiceConfig } from "./config";
import { checkPostgres, createPgPool } from "./db";
import {
  buildJsonRpcError,
  buildJsonRpcSuccess,
  buildToolResult,
  parseJsonRpcRequest,
  toJsonRpcError,
} from "./protocol";
import { listMcpPrompts, resolveMcpPrompt } from "./prompts";
import { listMcpResources, resolveMcpResource } from "./resources";
import { executeMcpTool, listMcpTools } from "./tools";

const config = loadMcpServiceConfig(process.env);
const pool = createPgPool(config);
const sdk = createNewsPortalSdk({
  baseUrl: config.apiBaseUrl,
});
const app = Fastify({
  logger: true,
});

function buildServerInfo() {
  return {
    name: "newsportal-mcp",
    version: "0.1.0",
    transport: "http-jsonrpc",
  };
}

async function recordRequestOutcome(input: {
  token: McpAccessTokenRecord | null;
  requestMethod: string;
  toolName?: string | null;
  resourceUri?: string | null;
  promptName?: string | null;
  success: boolean;
  errorText?: string | null;
  requestJson?: Record<string, unknown>;
  responseJson?: Record<string, unknown>;
}): Promise<void> {
  await recordMcpRequestLog(pool, {
    tokenId: input.token?.tokenId ?? null,
    requestMethod: input.requestMethod,
    toolName: input.toolName ?? null,
    resourceUri: input.resourceUri ?? null,
    promptName: input.promptName ?? null,
    success: input.success,
    errorText: input.errorText ?? null,
    requestJson: input.requestJson,
    responseJson: input.responseJson,
  });
}

async function touchTokenUsage(
  token: McpAccessTokenRecord | null,
  ipAddress: string,
  userAgent: string | null
): Promise<void> {
  if (!token) {
    return;
  }
  await touchMcpAccessTokenUsage(pool, {
    tokenId: token.tokenId,
    ipAddress,
    userAgent,
  });
}

app.get("/health", async () => {
  await checkPostgres(pool);
  return {
    service: "mcp",
    status: "ok",
  };
});

app.get("/mcp", async (request, reply) => {
  let token: McpAccessTokenRecord | null = null;
  try {
    token = await authenticateMcpRequest(pool, request);
    await touchTokenUsage(token, request.ip, String(request.headers["user-agent"] ?? "").trim() || null);
    return {
      serverInfo: buildServerInfo(),
      methods: [
        "initialize",
        "tools/list",
        "tools/call",
        "resources/list",
        "resources/read",
        "prompts/list",
        "prompts/get",
      ],
      tools: listMcpTools().length,
      resources: listMcpResources().length,
      prompts: listMcpPrompts().length,
    };
  } catch (error) {
    const rpcError = toJsonRpcError(error);
    await recordRequestOutcome({
      token,
      requestMethod: "http.get",
      success: false,
      errorText: rpcError.message,
      requestJson: {},
      responseJson: {
        code: rpcError.code,
      },
    });
    reply.code(rpcError.statusCode);
    return {
      error: rpcError.message,
    };
  }
});

app.post("/mcp", async (request, reply) => {
  let token: McpAccessTokenRecord | null = null;
  let requestMethod = "unknown";
  let toolName: string | null = null;
  let resourceUri: string | null = null;
  let promptName: string | null = null;
  let rpcId: string | number | null = null;
  let requestJson: Record<string, unknown> = {};

  try {
    token = await authenticateMcpRequest(pool, request);
    const rpcRequest = parseJsonRpcRequest(request.body);
    requestMethod = rpcRequest.method;
    rpcId = rpcRequest.id;
    requestJson = {
      params: rpcRequest.params,
    };

    let result: unknown;
    if (rpcRequest.method === "initialize") {
      result = {
        protocolVersion: "2026-04-23",
        serverInfo: buildServerInfo(),
        capabilities: {
          tools: { listChanged: false },
          resources: { listChanged: false },
          prompts: { listChanged: false },
        },
      };
    } else if (rpcRequest.method === "tools/list") {
      result = {
        tools: listMcpTools(),
      };
    } else if (rpcRequest.method === "tools/call") {
      toolName =
        rpcRequest.params.name != null ? String(rpcRequest.params.name).trim() : null;
      result = buildToolResult(
        await executeMcpTool(
          {
            sdk,
            pool,
            token,
          },
          String(rpcRequest.params.name ?? ""),
          rpcRequest.params.arguments != null &&
            typeof rpcRequest.params.arguments === "object" &&
            !Array.isArray(rpcRequest.params.arguments)
            ? (rpcRequest.params.arguments as Record<string, unknown>)
            : {}
        )
      );
    } else if (rpcRequest.method === "resources/list") {
      result = {
        resources: listMcpResources(),
      };
    } else if (rpcRequest.method === "resources/read") {
      resourceUri = String(rpcRequest.params.uri ?? "").trim();
      const resource = resolveMcpResource(resourceUri);
      const payload = await resource.read({
        sdk,
        pool,
        token,
      });
      result = {
        contents: [
          {
            uri: resource.uri,
            mimeType: resource.mimeType,
            text: JSON.stringify(payload, null, 2),
          },
        ],
      };
    } else if (rpcRequest.method === "prompts/list") {
      result = {
        prompts: listMcpPrompts(),
      };
    } else if (rpcRequest.method === "prompts/get") {
      promptName = String(rpcRequest.params.name ?? "").trim();
      const prompt = resolveMcpPrompt(promptName);
      result = prompt.render(
        rpcRequest.params.arguments != null &&
          typeof rpcRequest.params.arguments === "object" &&
          !Array.isArray(rpcRequest.params.arguments)
          ? (rpcRequest.params.arguments as Record<string, unknown>)
          : {}
      );
    } else {
      throw new Error(`Unknown MCP method "${rpcRequest.method}".`);
    }

    await touchTokenUsage(
      token,
      request.ip,
      String(request.headers["user-agent"] ?? "").trim() || null
    );
    await recordRequestOutcome({
      token,
      requestMethod,
      toolName,
      resourceUri,
      promptName,
      success: true,
      requestJson,
      responseJson:
        result != null && typeof result === "object" && !Array.isArray(result)
          ? (result as Record<string, unknown>)
          : { ok: true },
    });

    return buildJsonRpcSuccess(rpcId, result);
  } catch (error) {
    const rpcError = toJsonRpcError(error);
    await recordRequestOutcome({
      token,
      requestMethod,
      toolName,
      resourceUri,
      promptName,
      success: false,
      errorText: rpcError.message,
      requestJson,
      responseJson: {
        code: rpcError.code,
      },
    });
    reply.code(rpcError.statusCode);
    return buildJsonRpcError(rpcId, rpcError);
  }
});

async function shutdown(signal: string): Promise<void> {
  app.log.info({ signal }, "Shutting down MCP service.");
  await app.close();
  await pool.end();
  process.exit(0);
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

async function main(): Promise<void> {
  await checkPostgres(pool);
  await app.listen({
    host: "0.0.0.0",
    port: config.mcpPort,
  });
}

void main().catch(async (error) => {
  app.log.error({ error }, "MCP startup failed.");
  await pool.end();
  process.exit(1);
});

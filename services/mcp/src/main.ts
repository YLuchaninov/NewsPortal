import { randomUUID } from "node:crypto";

import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";

import {
  recordMcpRequestLog,
  touchMcpAccessTokenUsage,
  type McpAccessTokenRecord,
} from "@newsportal/control-plane";
import { createNewsPortalSdk } from "@newsportal/sdk";

import { authenticateMcpRequest } from "./auth";
import { loadMcpServiceConfig } from "./config";
import { MCP_SERVER_INSTRUCTIONS } from "./context";
import { checkPostgres, createPgPool } from "./db";
import {
  buildJsonRpcError,
  buildJsonRpcSuccess,
  buildToolResult,
  parseJsonRpcRequest,
  readOptionalArgumentsObject,
  toJsonRpcError,
} from "./protocol";
import { listMcpPrompts, resolveMcpPrompt } from "./prompts";
import { listMcpResources, resolveMcpResource } from "./resources";
import { executeMcpTool, listMcpTools } from "./tools";
import { affectedOperationalResourcesForTool } from "./operating-intelligence";

const config = loadMcpServiceConfig(process.env);
const pool = createPgPool(config);
const sdk = createNewsPortalSdk({
  baseUrl: config.apiBaseUrl,
});
const app = Fastify({
  logger: true,
});

const MCP_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"] as const;
const DEFAULT_MCP_PROTOCOL_VERSION = MCP_PROTOCOL_VERSIONS[0];

interface SseSession {
  token: McpAccessTokenRecord;
  reply: FastifyReply;
  heartbeat: ReturnType<typeof setInterval>;
  subscribedResources: Set<string>;
}

const sseSessions = new Map<string, SseSession>();

function buildServerInfo() {
  return {
    name: "newsportal-mcp",
    version: "0.1.0",
    transport: "http-jsonrpc+streamable-http+sse",
  };
}

function headerIncludes(value: unknown, expected: string): boolean {
  const normalized = expected.toLowerCase();
  if (Array.isArray(value)) {
    return value.some((item) => String(item).toLowerCase().includes(normalized));
  }
  return String(value ?? "").toLowerCase().includes(normalized);
}

function acceptsEventStream(request: FastifyRequest): boolean {
  return headerIncludes(request.headers.accept, "text/event-stream");
}

function resolveProtocolVersion(params: Record<string, unknown>): string {
  const requested = String(params.protocolVersion ?? "").trim();
  return MCP_PROTOCOL_VERSIONS.includes(requested as (typeof MCP_PROTOCOL_VERSIONS)[number])
    ? requested
    : DEFAULT_MCP_PROTOCOL_VERSION;
}

function writeSseEvent(reply: FastifyReply, event: string, data: string): void {
  reply.raw.write(`event: ${event}\n`);
  for (const line of data.split(/\r?\n/)) {
    reply.raw.write(`data: ${line}\n`);
  }
  reply.raw.write("\n");
}

function writeSseJsonMessage(reply: FastifyReply, payload: unknown): void {
  writeSseEvent(reply, "message", JSON.stringify(payload));
}

function notifyAffectedResources(uris: readonly string[]): void {
  for (const uri of uris) {
    for (const session of sseSessions.values()) {
      if (!session.subscribedResources.has(uri)) {
        continue;
      }
      writeSseJsonMessage(session.reply, {
        jsonrpc: "2.0",
        method: "notifications/resources/updated",
        params: { uri },
      });
    }
  }
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

async function processMcpRpcRequest(input: {
  token: McpAccessTokenRecord;
  body: unknown;
  session?: SseSession;
}): Promise<{
  rpcId: string | number | null;
  response: ReturnType<typeof buildJsonRpcSuccess> | ReturnType<typeof buildJsonRpcError> | null;
  statusCode: number;
}> {
  let requestMethod = "unknown";
  let toolName: string | null = null;
  let resourceUri: string | null = null;
  let promptName: string | null = null;
  let rpcId: string | number | null = null;
  let requestJson: Record<string, unknown> = {};
  const payload =
    input.body != null && typeof input.body === "object" && !Array.isArray(input.body)
      ? (input.body as Record<string, unknown>)
      : {};
  const isNotification = !Object.hasOwn(payload, "id");

  try {
    const rpcRequest = parseJsonRpcRequest(input.body);
    requestMethod = rpcRequest.method;
    rpcId = rpcRequest.id;
    requestJson = {
      params: rpcRequest.params,
    };

    let result: unknown;
    if (rpcRequest.method === "initialize") {
      result = {
        protocolVersion: resolveProtocolVersion(rpcRequest.params),
        serverInfo: buildServerInfo(),
        instructions: MCP_SERVER_INSTRUCTIONS,
        capabilities: {
          tools: { listChanged: false },
          resources: { listChanged: false, subscribe: true },
          prompts: { listChanged: false },
        },
      };
    } else if (rpcRequest.method === "notifications/initialized") {
      result = null;
    } else if (rpcRequest.method === "tools/list") {
      result = {
        tools: listMcpTools(),
      };
    } else if (rpcRequest.method === "tools/call") {
      toolName =
        rpcRequest.params.name != null ? String(rpcRequest.params.name).trim() : null;
      const toolResult = await executeMcpTool(
        {
          sdk,
          pool,
          token: input.token,
        },
        String(rpcRequest.params.name ?? ""),
        readOptionalArgumentsObject(rpcRequest.params.arguments)
      );
      notifyAffectedResources(affectedOperationalResourcesForTool(toolName ?? ""));
      result = buildToolResult(toolResult);
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
        token: input.token,
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
    } else if (rpcRequest.method === "resources/subscribe") {
      resourceUri = String(rpcRequest.params.uri ?? "").trim();
      resolveMcpResource(resourceUri);
      input.session?.subscribedResources.add(resourceUri);
      result = {
        subscribed: Boolean(input.session),
        uri: resourceUri,
      };
    } else if (rpcRequest.method === "resources/unsubscribe") {
      resourceUri = String(rpcRequest.params.uri ?? "").trim();
      resolveMcpResource(resourceUri);
      input.session?.subscribedResources.delete(resourceUri);
      result = {
        unsubscribed: Boolean(input.session),
        uri: resourceUri,
      };
    } else if (rpcRequest.method === "prompts/list") {
      result = {
        prompts: listMcpPrompts(),
      };
    } else if (rpcRequest.method === "prompts/get") {
      promptName = String(rpcRequest.params.name ?? "").trim();
      const prompt = resolveMcpPrompt(promptName);
      result = prompt.render(readOptionalArgumentsObject(rpcRequest.params.arguments));
    } else {
      throw new Error(`Unknown MCP method "${rpcRequest.method}".`);
    }

    await recordRequestOutcome({
      token: input.token,
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

    return {
      rpcId,
      response: isNotification || rpcRequest.method === "notifications/initialized"
        ? null
        : buildJsonRpcSuccess(rpcId, result),
      statusCode: isNotification || rpcRequest.method === "notifications/initialized" ? 202 : 200,
    };
  } catch (error) {
    const rpcError = toJsonRpcError(error);
    await recordRequestOutcome({
      token: input.token,
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
    return {
      rpcId,
      response: buildJsonRpcError(rpcId, rpcError),
      statusCode: rpcError.statusCode,
    };
  }
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
    if (acceptsEventStream(request)) {
      const sessionId = randomUUID();
      const messageEndpoint = `/mcp/messages?sessionId=${encodeURIComponent(sessionId)}`;
      reply.hijack();
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      });
      const heartbeat = setInterval(() => {
        reply.raw.write(": keepalive\n\n");
      }, 15000);
      sseSessions.set(sessionId, {
        token,
        reply,
        heartbeat,
        subscribedResources: new Set<string>(),
      });
      writeSseEvent(reply, "endpoint", messageEndpoint);
      request.raw.on("close", () => {
        clearInterval(heartbeat);
        sseSessions.delete(sessionId);
      });
      return;
    }
    return {
      serverInfo: buildServerInfo(),
      methods: [
        "initialize",
        "tools/list",
        "tools/call",
        "resources/list",
        "resources/read",
        "resources/subscribe",
        "resources/unsubscribe",
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
  try {
    const token = await authenticateMcpRequest(pool, request);
    const { response, statusCode } = await processMcpRpcRequest({
      token,
      body: request.body,
    });
    await touchTokenUsage(
      token,
      request.ip,
      String(request.headers["user-agent"] ?? "").trim() || null
    );
    if (response == null) {
      reply.code(statusCode);
      return null;
    }
    reply.code(statusCode);
    return response;
  } catch (error) {
    const rpcError = toJsonRpcError(error);
    reply.code(rpcError.statusCode);
    return buildJsonRpcError(null, rpcError);
  }
});

app.post("/mcp/messages", async (request, reply) => {
  const sessionId = String((request.query as Record<string, unknown>).sessionId ?? "").trim();
  const session = sseSessions.get(sessionId);
  if (!session) {
    reply.code(404);
    return {
      error: "Unknown or closed MCP SSE session.",
    };
  }

  const { response } = await processMcpRpcRequest({
    token: session.token,
    body: request.body,
    session,
  });
  await touchTokenUsage(
    session.token,
    request.ip,
    String(request.headers["user-agent"] ?? "").trim() || null
  );
  if (response != null) {
    writeSseJsonMessage(session.reply, response);
  }
  reply.code(202);
  return null;
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

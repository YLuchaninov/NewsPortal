import {
  resolveMcpAccessTokenBySecret,
  type McpAccessTokenRecord,
} from "@newsportal/control-plane";
import type { FastifyRequest } from "fastify";
import type { Pool } from "pg";

import { JsonRpcError } from "./protocol";

export async function authenticateMcpRequest(
  pool: Pool,
  request: FastifyRequest
): Promise<McpAccessTokenRecord> {
  const header = String(request.headers.authorization ?? "").trim();
  if (!header.toLowerCase().startsWith("bearer ")) {
    throw new JsonRpcError(-32001, "Bearer token is required.", {
      statusCode: 401,
    });
  }

  const tokenValue = header.slice("bearer ".length).trim();
  if (!tokenValue) {
    throw new JsonRpcError(-32001, "Bearer token is required.", {
      statusCode: 401,
    });
  }

  const token = await resolveMcpAccessTokenBySecret(pool, tokenValue);
  if (!token) {
    throw new JsonRpcError(-32001, "MCP token was not recognized.", {
      statusCode: 401,
    });
  }

  if (token.status !== "active") {
    throw new JsonRpcError(-32003, "MCP token has been revoked.", {
      statusCode: 403,
    });
  }

  if (token.expiresAt && Date.parse(token.expiresAt) <= Date.now()) {
    throw new JsonRpcError(-32002, "MCP token has expired.", {
      statusCode: 401,
    });
  }

  return token;
}

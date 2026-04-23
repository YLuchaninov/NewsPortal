export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string | number | null;
  method: string;
  params: Record<string, unknown>;
}

export class JsonRpcError extends Error {
  readonly code: number;
  readonly statusCode: number;
  readonly data: Record<string, unknown> | null;

  constructor(
    code: number,
    message: string,
    options: {
      statusCode?: number;
      data?: Record<string, unknown> | null;
    } = {}
  ) {
    super(message);
    this.code = code;
    this.statusCode = options.statusCode ?? 400;
    this.data = options.data ?? null;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function parseJsonRpcRequest(body: unknown): JsonRpcRequest {
  const payload = asRecord(body);
  const method = String(payload.method ?? "").trim();
  if (!method) {
    throw new JsonRpcError(-32600, "JSON-RPC request must include a method.", {
      statusCode: 400,
    });
  }

  const jsonrpc = String(payload.jsonrpc ?? "2.0").trim();
  if (jsonrpc !== "2.0") {
    throw new JsonRpcError(-32600, "JSON-RPC requests must declare jsonrpc=2.0.", {
      statusCode: 400,
    });
  }

  const rawId = payload.id;
  const id =
    typeof rawId === "string" || typeof rawId === "number" || rawId === null ? rawId : null;
  const rawParams = payload.params;
  const params =
    rawParams == null
      ? {}
      : rawParams != null && typeof rawParams === "object" && !Array.isArray(rawParams)
        ? (rawParams as Record<string, unknown>)
        : (() => {
            throw new JsonRpcError(-32602, "JSON-RPC params must be an object.", {
              statusCode: 400,
            });
          })();

  return {
    jsonrpc: "2.0",
    id,
    method,
    params,
  };
}

export function buildJsonRpcSuccess(id: string | number | null, result: unknown) {
  return {
    jsonrpc: "2.0" as const,
    id,
    result,
  };
}

export function buildJsonRpcError(id: string | number | null, error: JsonRpcError) {
  return {
    jsonrpc: "2.0" as const,
    id,
    error: {
      code: error.code,
      message: error.message,
      ...(error.data ? { data: error.data } : {}),
    },
  };
}

export function toJsonRpcError(error: unknown): JsonRpcError {
  if (error instanceof JsonRpcError) {
    return error;
  }
  if (error instanceof Error) {
    return new JsonRpcError(-32000, error.message, {
      statusCode: 400,
    });
  }
  return new JsonRpcError(-32000, "MCP request failed.", {
    statusCode: 500,
  });
}

export function asArguments(value: unknown): Record<string, unknown> {
  return asRecord(value);
}

export function readRequiredString(
  value: unknown,
  fieldName: string
): string {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    throw new JsonRpcError(-32602, `${fieldName} is required.`, {
      statusCode: 400,
    });
  }
  return normalized;
}

export function readOptionalString(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : null;
}

export function readOptionalInteger(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }
  const parsed =
    typeof value === "number" ? Math.trunc(value) : Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) {
    throw new JsonRpcError(-32602, "Expected an integer value.", {
      statusCode: 400,
    });
  }
  return parsed;
}

export function readBooleanFlag(value: unknown, fieldName: string): boolean {
  if (value === true || String(value ?? "").trim().toLowerCase() === "true") {
    return true;
  }
  if (value === false || String(value ?? "").trim().toLowerCase() === "false") {
    return false;
  }
  throw new JsonRpcError(-32602, `${fieldName} must be true or false.`, {
    statusCode: 400,
  });
}

export function buildToolResult(payload: unknown) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(payload, null, 2),
      },
    ],
    structuredContent: payload,
  };
}

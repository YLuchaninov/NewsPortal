import assert from "node:assert/strict";
import test from "node:test";

import {
  buildHttpDiagnostics,
  extractHttpDiagnostics,
  extractMcpDiagnostics,
  parseJsonPayload,
} from "../../../infra/scripts/lib/mcp-http-testkit.mjs";

test("MCP live HTTP diagnostics preserve useful metadata for non-JSON HTML responses", () => {
  const response = {
    status: 502,
    statusText: "Bad Gateway",
    headers: {
      "content-type": "text/html; charset=utf-8",
      server: "nginx/1.27.0",
    },
    text: `<!doctype html><html><body><h1>502 Bad Gateway</h1><p>upstream timeout while waiting for provider</p></body></html>`,
  };

  assert.throws(
    () =>
      parseJsonPayload(response.text, response, {
        url: "http://127.0.0.1:8080/mcp",
        method: "POST",
      }),
    (error) => {
      const diagnostics = extractHttpDiagnostics(error);
      assert.ok(diagnostics);
      assert.equal(diagnostics?.requestUrl, "http://127.0.0.1:8080/mcp");
      assert.equal(diagnostics?.requestMethod, "POST");
      assert.equal(diagnostics?.status, 502);
      assert.equal(diagnostics?.contentType, "text/html; charset=utf-8");
      assert.equal(diagnostics?.bodyKind, "html");
      assert.equal(diagnostics?.server, "nginx/1.27.0");
      assert.equal(diagnostics?.sourceHint, "newsportal-gateway-upstream-html");
      assert.match(String(diagnostics?.bodyPreview), /502 Bad Gateway/i);
      return true;
    }
  );
});

test("MCP live HTTP diagnostics classify local HTML without gateway signals as boundary HTML", () => {
  const diagnostics = buildHttpDiagnostics(
    {
      url: "http://127.0.0.1:8080/mcp",
      method: "POST",
    },
    {
      status: 500,
      statusText: "Internal Server Error",
      headers: {
        "content-type": "text/html",
      },
      text: "<html><body><h1>Internal Server Error</h1><p>Unexpected template rendering path</p></body></html>",
    }
  );

  assert.equal(diagnostics.bodyKind, "html");
  assert.equal(diagnostics.sourceHint, "newsportal-boundary-html");
  assert.match(String(diagnostics.bodyPreview), /Internal Server Error/i);
});

test("MCP live diagnostics can serialize JSON-RPC tool errors for artifacts", () => {
  const error = new Error("MCP tool discovery.recall_candidates.promote failed.");
  error.mcpDiagnostics = {
    rpcMethod: "tools/call",
    toolName: "discovery.recall_candidates.promote",
    errorCode: -32000,
    errorMessage: "Request failed with 422 Unprocessable Entity.",
    errorData: {
      statusCode: 422,
      detail: ["provider_type must be rss or website"],
    },
    requestArgs: {
      recallCandidateId: "candidate-1",
    },
    response: {
      error: {
        code: -32000,
      },
    },
  };

  const diagnostics = extractMcpDiagnostics(error);
  assert.ok(diagnostics);
  assert.equal(diagnostics?.toolName, "discovery.recall_candidates.promote");
  assert.equal(diagnostics?.errorCode, -32000);
  assert.equal(diagnostics?.errorData?.statusCode, 422);
  assert.deepEqual(diagnostics?.requestArgs, {
    recallCandidateId: "candidate-1",
  });
});

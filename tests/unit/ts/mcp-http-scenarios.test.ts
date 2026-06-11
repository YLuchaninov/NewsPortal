import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMcpScenarioApiUrl,
  readSourceInventoryScopeStatus,
} from "../../../infra/scripts/lib/mcp-http-scenarios.mjs";

test("MCP HTTP scenarios read source inventory scope status from snake_case API rows", () => {
  assert.equal(
    readSourceInventoryScopeStatus({
      sourceInventory: {
        scope_confirmation_json: {
          scopeStatus: "confirmed",
        },
      },
    }),
    "confirmed"
  );
});

test("MCP HTTP scenarios read source inventory scope status from camelCase API rows", () => {
  assert.equal(
    readSourceInventoryScopeStatus({
      sourceInventory: {
        scopeConfirmationJson: {
          scopeStatus: "confirmed",
        },
      },
    }),
    "confirmed"
  );
});

test("MCP HTTP scenarios read source inventory scope status from JSON-encoded API rows", () => {
  assert.equal(
    readSourceInventoryScopeStatus({
      sourceInventory: {
        scope_confirmation_json: JSON.stringify({
          scopeStatus: "confirmed",
        }),
      },
    }),
    "confirmed"
  );
});

test("MCP HTTP scenarios post maintenance API actions through nginx API surface", () => {
  assert.equal(
    buildMcpScenarioApiUrl("/maintenance/discovery/source-inventory/action"),
    "http://127.0.0.1:8080/api/maintenance/discovery/source-inventory/action"
  );
});

test("MCP HTTP scenarios do not accept unrelated confirmation shapes", () => {
  assert.equal(
    readSourceInventoryScopeStatus({
      sourceInventory: {
        scopeStatus: "confirmed",
      },
    }),
    ""
  );
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  ADMIN_BFF_ACTION_PAYLOAD_SCHEMAS,
  ADMIN_CHANNEL_PROVIDER_TYPES,
  SOURCE_PROVIDER_CONFIG_SCHEMAS,
  WEB_BFF_ACTION_PAYLOAD_SCHEMAS,
  assertSourceProviderConfig,
  assertWebBffActionPayload,
  assertAdminChannelPayload,
  assertJsonSchema,
  validateSourceProviderConfig,
  validateWebBffActionPayload,
  validateAdminChannelPayload,
  validateJsonSchema,
} from "../../../packages/contracts/src/schema.ts";
import { ADMIN_ACTION_TOKEN_TARGETS } from "../../../apps/admin/src/lib/server/admin-action.ts";
import { MCP_TOOLS } from "../../../services/mcp/src/tools.ts";

test("shared JSON schema validator rejects unknown fields and invalid primitive types", () => {
  const schema = {
    type: "object",
    required: ["name"],
    properties: {
      name: { type: "string" },
      page: { type: "number" },
    },
    additionalProperties: false,
  } as const;

  assert.deepEqual(validateJsonSchema({ name: "Latest", page: 2 }, schema), []);

  const issues = validateJsonSchema({ name: "Latest", page: "2", extra: true }, schema);
  assert.equal(issues[0]?.code, "invalid_type");
  assert.equal(issues[1]?.code, "unknown_property");
  assert.throws(
    () =>
      assertJsonSchema({ page: 2 }, schema, {
        boundaryName: "test boundary",
      }),
    /test boundary failed schema validation: name is required/i
  );
});

test("admin channel schema registry gates control-plane channel payload shape", () => {
  assertAdminChannelPayload({
    providerType: "api",
    name: "Example API",
    fetchUrl: "https://example.test/api/signal-candidates",
    requestMethod: "POST",
    requestHeaders: {
      accept: "application/json",
    },
    pagination: {
      mode: "cursor",
    },
    itemsPath: "items",
    maxItemsPerPoll: "25",
    enrichmentEnabled: true,
  });

  assertAdminChannelPayload({
    name: "Example RSS",
    fetchUrl: "https://example.test/feed.xml",
    preferContentEncoded: "true",
  });

  const unsupported = validateAdminChannelPayload({
    providerType: "youtube",
    name: "Video source",
  });
  assert.equal(unsupported[0]?.code, "invalid_enum");

  const extra = validateAdminChannelPayload({
    providerType: "website",
    name: "Site",
    fetchUrl: "https://example.test",
    unreviewedOperatorKnob: true,
  });
  assert.equal(extra[0]?.code, "unknown_property");
});

test("source provider config registry covers all active provider types", () => {
  assert.deepEqual(
    Object.keys(SOURCE_PROVIDER_CONFIG_SCHEMAS).sort(),
    [...ADMIN_CHANNEL_PROVIDER_TYPES].sort(),
  );

  assertSourceProviderConfig("rss", {
    name: "Example RSS",
    fetchUrl: "https://example.test/feed.xml",
    maxItemsPerPoll: "25",
  });

  const issues = validateSourceProviderConfig("email_imap", {
    providerType: "email_imap",
    name: "Inbox",
    host: "imap.example.test",
    username: "reader",
    unsafeOperatorKnob: true,
  });
  assert.equal(issues[0]?.code, "unknown_property");
});

test("web BFF action schema registry rejects unsupported payload fields", () => {
  assertWebBffActionPayload("content-state", {
    contentItemId: "doc-1",
    action: "save",
  });

  const invalidAction = validateWebBffActionPayload("story-follow", {
    contentItemId: "doc-1",
    action: "pin",
  });
  assert.equal(invalidAction[0]?.code, "invalid_enum");

  assert.throws(
    () =>
      assertWebBffActionPayload("preferences", {
        themePreference: "system",
        surprise: true,
      }),
    /not allowed/i,
  );
});

test("admin BFF schema registry covers signed admin action scopes", () => {
  assert.deepEqual(
    Object.keys(ADMIN_BFF_ACTION_PAYLOAD_SCHEMAS).sort(),
    [...new Set(ADMIN_ACTION_TOKEN_TARGETS.map((target) => target.scope))].sort(),
  );
});

test("MCP write tools declare input and output schemas", () => {
  const writeTools = MCP_TOOLS.filter((tool) => tool.requiredScope !== "read");
  assert.ok(writeTools.length > 0);
  for (const tool of writeTools) {
    assert.equal(Boolean(tool.inputSchema), true, `${tool.name} must declare inputSchema`);
    assert.equal(Boolean(tool.outputSchema), true, `${tool.name} must declare outputSchema`);
  }
});

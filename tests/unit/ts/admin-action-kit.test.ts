import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";

import {
  ADMIN_ACTION_TOKEN_TARGETS,
  adminActionError,
  adminActionSuccess,
  buildAdminActionToken,
  buildAdminActionTokenSet,
  insertAdminAuditLog,
  prepareAdminAction,
  readAdminActionTokenForScope,
  readRequiredAdminText,
  requireAdminIntent,
  validateAdminActionToken,
  validateAdminActionCsrfMetadata,
  type AdminActionSession,
} from "../../../apps/admin/src/lib/server/admin-action.ts";
import { submitAdminForm } from "../../../apps/admin/src/components/admin-form-submit.ts";
import {
  listFilesRecursive,
  withAppSecret,
} from "./support/action-kit-harness.ts";

const adminSession: AdminActionSession = {
  userId: "admin-user-1",
  roles: ["admin"],
  identity: {
    subject: "firebase-admin",
    provider: "firebase_email_link",
    email: "admin@example.test",
    isAnonymous: false,
  },
};

const repoRoot = process.cwd();

test("prepareAdminAction denies JSON writes before reading payload", async () => {
  let payloadRead = false;
  const result = await prepareAdminAction(
    new Request("http://127.0.0.1:4322/bff/admin/reindex", {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({ redirectTo: "/reindex" }),
    }),
    {
      fallbackRedirectPath: "/reindex",
      resolveSession: async () => null,
      payloadReader: async () => {
        payloadRead = true;
        return {};
      },
    },
  );

  assert.equal(result.ok, false);
  assert.equal(payloadRead, false);
  if (!result.ok) {
    assert.equal(result.response.status, 403);
    assert.deepEqual(await result.response.json(), { error: "Forbidden." });
  }
});

test("prepareAdminAction can keep route-specific denied JSON contracts", async () => {
  const result = await prepareAdminAction(
    new Request("http://127.0.0.1:4322/bff/admin/channels/bulk/preflight", {
      method: "POST",
      headers: {
        accept: "application/json",
        referer: "/admin/channels/import",
      },
      body: JSON.stringify({ channelsPayload: "[]" }),
    }),
    {
      fallbackRedirectPath: "/channels/import",
      resolveSession: async () => null,
      authJson: (request, redirectTo) => ({
        error: "Please sign in as an admin to continue.",
        redirectTo: new URL(`/admin/sign-in?next=${encodeURIComponent(redirectTo)}`, request.url)
          .pathname,
        setCookie: "np_admin_session=;",
      }),
      payloadReader: async () => {
        throw new Error("payload should not be read before auth");
      },
    },
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.response.status, 403);
    assert.deepEqual(await result.response.json(), {
      error: "Please sign in as an admin to continue.",
      redirectTo: "/admin/sign-in",
      setCookie: "np_admin_session=;",
    });
  }
});

test("prepareAdminAction redirects browser writes to sign-in safely", async () => {
  const result = await prepareAdminAction(
    new Request("http://127.0.0.1:8080/admin/bff/admin/reindex", {
      method: "POST",
      headers: {
        accept: "text/html",
        referer: "/admin/reindex?page=2",
      },
    }),
    {
      fallbackRedirectPath: "/reindex",
      resolveSession: async () => null,
    },
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.response.status, 303);
    assert.match(result.response.headers.get("location") ?? "", /\/admin\/sign-in\?next=/);
    assert.match(result.response.headers.get("set-cookie") ?? "", /np_admin_session=;/);
  }
});

test("prepareAdminAction rejects cross-site browser metadata before auth or payload reads", async () => {
  let sessionResolved = false;
  let payloadRead = false;
  const result = await prepareAdminAction(
    new Request("http://127.0.0.1:4322/bff/admin/reindex", {
      method: "POST",
      headers: {
        accept: "application/json",
        origin: "https://evil.example",
        "sec-fetch-site": "cross-site",
        "content-type": "application/json",
      },
      body: JSON.stringify({ redirectTo: "/reindex" }),
    }),
    {
      fallbackRedirectPath: "/reindex",
      resolveSession: async () => {
        sessionResolved = true;
        return adminSession;
      },
      payloadReader: async () => {
        payloadRead = true;
        return {};
      },
    },
  );

  assert.equal(result.ok, false);
  assert.equal(sessionResolved, false);
  assert.equal(payloadRead, false);
  if (!result.ok) {
    assert.equal(result.response.status, 403);
    assert.deepEqual(await result.response.json(), {
      error: "Rejected cross-site admin action.",
    });
  }
});

test("validateAdminActionCsrfMetadata accepts same-origin and forwarded admin origins", () => {
  assert.equal(
    validateAdminActionCsrfMetadata(
      new Request("http://127.0.0.1:4322/bff/admin/reindex", {
        method: "POST",
        headers: {
          origin: "http://127.0.0.1:4322",
          referer: "http://127.0.0.1:4322/reindex",
          "sec-fetch-site": "same-origin",
        },
      }),
    ),
    true,
  );

  assert.equal(
    validateAdminActionCsrfMetadata(
      new Request("http://admin:4322/admin/bff/admin/reindex", {
        method: "POST",
        headers: {
          origin: "http://127.0.0.1:8080",
          referer: "http://127.0.0.1:8080/admin/reindex",
          "x-forwarded-host": "127.0.0.1:8080",
          "x-forwarded-proto": "http",
          "sec-fetch-site": "same-site",
        },
      }),
    ),
    true,
  );
});

test("validateAdminActionCsrfMetadata rejects mismatched origins and absolute referers", () => {
  assert.equal(
    validateAdminActionCsrfMetadata(
      new Request("http://127.0.0.1:4322/bff/admin/reindex", {
        method: "POST",
        headers: {
          origin: "http://127.0.0.1:4321",
        },
      }),
    ),
    false,
  );

  assert.equal(
    validateAdminActionCsrfMetadata(
      new Request("http://127.0.0.1:4322/bff/admin/reindex", {
        method: "POST",
        headers: {
          referer: "https://evil.example/admin/reindex",
        },
      }),
    ),
    false,
  );
});

test("prepareAdminAction resolves payload redirect after admin auth", async () => {
  const result = await prepareAdminAction(
    new Request("http://127.0.0.1:8080/admin/bff/admin/moderation", {
      method: "POST",
      headers: {
        accept: "application/json",
      },
    }),
    {
      fallbackRedirectPath: "/signal-candidates",
      resolveSession: async () => adminSession,
      payloadReader: async () => ({
        redirectTo: "https://evil.example/admin/signal-candidates?page=3",
      }),
    },
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.context.redirectTo, "/admin/signal-candidates?page=3");
    assert.equal(result.context.session.userId, "admin-user-1");
  }
});

test("admin action tokens validate user, path, scope, signature and expiry", () => {
  withAppSecret("unit-action-secret", () => {
    const request = new Request("http://127.0.0.1:4322/bff/admin/mcp-tokens", {
      method: "POST",
    });
    const token = buildAdminActionToken({
      request,
      session: adminSession,
      targetPath: "/admin/bff/admin/mcp-tokens",
      scope: "mcp-tokens",
      nowMs: 1_000,
      ttlMs: 60_000,
    });

    assert.equal(
      validateAdminActionToken(token, request, adminSession, { scope: "mcp-tokens" }, 2_000),
      true,
    );
    assert.equal(
      validateAdminActionToken(
        token,
        request,
        { ...adminSession, userId: "other-admin" },
        { scope: "mcp-tokens" },
        2_000,
      ),
      false,
    );
    assert.equal(
      validateAdminActionToken(
        token,
        new Request("http://127.0.0.1:4322/bff/admin/reindex", { method: "POST" }),
        adminSession,
        { scope: "mcp-tokens" },
        2_000,
      ),
      false,
    );
    assert.equal(
      validateAdminActionToken(token, request, adminSession, { scope: "reindex" }, 2_000),
      false,
    );
    assert.equal(
      validateAdminActionToken(token, request, adminSession, { scope: "mcp-tokens" }, 70_000),
      false,
    );
    assert.equal(
      validateAdminActionToken(`${token.slice(0, -1)}x`, request, adminSession, { scope: "mcp-tokens" }, 2_000),
      false,
    );
  });
});

test("prepareAdminAction enforces required admin action tokens before handler work", async () => {
  await withAppSecret("unit-action-secret", async () => {
    const request = new Request("http://127.0.0.1:4322/bff/admin/mcp-tokens", {
      method: "POST",
      headers: {
        accept: "application/json",
      },
    });
    const token = buildAdminActionToken({
      request,
      session: adminSession,
      targetPath: "/bff/admin/mcp-tokens",
      scope: "mcp-tokens",
      nowMs: Date.now(),
    });

    const accepted = await prepareAdminAction(request, {
      fallbackRedirectPath: "/automation/mcp",
      actionToken: { scope: "mcp-tokens" },
      resolveSession: async () => adminSession,
      payloadReader: async () => ({
        adminActionToken: token,
      }),
    });
    assert.equal(accepted.ok, true);
    if (accepted.ok) {
      assert.deepEqual(accepted.context.payload, {});
    }

    const missing = await prepareAdminAction(request, {
      fallbackRedirectPath: "/automation/mcp",
      actionToken: { scope: "mcp-tokens" },
      resolveSession: async () => adminSession,
      payloadReader: async () => ({}),
    });
    assert.equal(missing.ok, false);
    if (!missing.ok) {
      assert.equal(missing.response.status, 403);
      assert.deepEqual(await missing.response.json(), {
        error: "Invalid or expired admin action token.",
      });
    }
  });
});

test("admin action tokens accept admin-prefixed reindex form targets", () => {
  withAppSecret("unit-action-secret", () => {
    const request = new Request("http://127.0.0.1:8080/admin/bff/admin/reindex", {
      method: "POST",
    });
    const token = buildAdminActionToken({
      request,
      session: adminSession,
      targetPath: "/admin/bff/admin/reindex",
      scope: "reindex",
      nowMs: 1_000,
      ttlMs: 60_000,
    });

    assert.equal(
      validateAdminActionToken(token, request, adminSession, { scope: "reindex" }, 2_000),
      true,
    );
  });
});

test("admin action tokens allow declared route-family prefixes", () => {
  withAppSecret("unit-action-secret", () => {
    const tokenRequest = new Request("http://127.0.0.1:4322/bff/admin/user-interests", {
      method: "POST",
    });
    const dynamicRequest = new Request(
      "http://127.0.0.1:4322/bff/admin/user-interests/11111111-1111-4111-8111-111111111111",
      {
        method: "POST",
      },
    );
    const token = buildAdminActionToken({
      request: tokenRequest,
      session: adminSession,
      targetPath: "/bff/admin/user-interests",
      scope: "user-interests",
      nowMs: 2_000,
    });

    assert.equal(
      validateAdminActionToken(token, dynamicRequest, adminSession, { scope: "user-interests" }, 2_000),
      true,
    );
    assert.equal(
      validateAdminActionToken(token, dynamicRequest, adminSession, { scope: "templates" }, 2_000),
      false,
    );
  });
});

test("admin action token sets expose scoped payload and header tokens", () => {
  withAppSecret("unit-action-secret", () => {
    const request = new Request("http://127.0.0.1:4322/bff/admin/channels", {
      method: "POST",
    });
    const tokens = buildAdminActionTokenSet({
      request,
      session: adminSession,
      actions: [
        { scope: "channels", targetPath: "/bff/admin/channels" },
        { scope: "templates", targetPath: "/bff/admin/templates" },
      ],
      nowMs: 1_000,
      ttlMs: 60_000,
    });

    assert.deepEqual(Object.keys(tokens).sort(), ["channels", "templates"]);
    assert.equal(
      validateAdminActionToken(tokens.channels, request, adminSession, { scope: "channels" }, 2_000),
      true,
    );
    assert.equal(
      readAdminActionTokenForScope({ adminActionTokens: tokens }, request, "channels"),
      tokens.channels,
    );
    assert.equal(
      readAdminActionTokenForScope(
        {},
        new Request("http://127.0.0.1:4322/bff/admin/channels", {
          headers: {
            "x-admin-action-token-channels": tokens.channels,
          },
        }),
        "channels",
      ),
      tokens.channels,
    );
  });
});

test("submitAdminForm dispatches submit before native submit fallback", () => {
  const calls: string[] = [];
  const form = {
    requestSubmit: undefined,
    dispatchEvent(event: Event) {
      calls.push(`${event.type}:${event.bubbles}:${event.cancelable}`);
      return true;
    },
    submit() {
      calls.push("native-submit");
    },
  };

  submitAdminForm(form as unknown as HTMLFormElement);

  assert.deepEqual(calls, ["submit:true:true", "native-submit"]);
});

test("submitAdminForm honors cancelled submit fallback", () => {
  const calls: string[] = [];
  const form = {
    requestSubmit: undefined,
    dispatchEvent(event: Event) {
      calls.push(`${event.type}:${event.bubbles}:${event.cancelable}`);
      return false;
    },
    submit() {
      calls.push("native-submit");
    },
  };

  submitAdminForm(form as unknown as HTMLFormElement);

  assert.deepEqual(calls, ["submit:true:true"]);
});

test("mutating admin BFF POST routes declare signed action-token scopes", () => {
  const routeRoot = join(repoRoot, "apps/admin/src/pages/bff/admin");
  const expectedScopesByRoute = new Map<string, string>([
    ["signal-candidates/enrichment-retry.ts", "signal_candidates.enrichment-retry"],
    ["automation.ts", "automation"],
    ["channels.ts", "channels"],
    ["channels/bulk.ts", "channels.bulk"],
    ["channels/bulk/preflight.ts", "channels.bulk.preflight"],
    ["channels/schedule.ts", "channels.schedule"],
    ["content-analysis.ts", "content-analysis"],
    ["content-analysis-policies.ts", "content-analysis-policies"],
    ["content-filter-policies.ts", "content-filter-policies"],
    ["discovery.ts", "discovery"],
    ["ingress-adapters.ts", "ingress-adapters"],
    ["mcp-tokens.ts", "mcp-tokens"],
    ["moderation.ts", "moderation"],
    ["reindex.ts", "reindex"],
    ["templates.ts", "templates"],
    ["user-interests.ts", "user-interests"],
    ["user-interests/[interestId].ts", "user-interests"],
  ]);
  const readOnlyOrSharedRoutes = new Set(["live-updates.ts", "channels/bulk/shared.ts"]);

  const declaredTargetScopes = new Set(ADMIN_ACTION_TOKEN_TARGETS.map((target) => target.scope));
  const routeFiles = listFilesRecursive(routeRoot)
    .filter((file) => file.endsWith(".ts"))
    .map((file) => relative(routeRoot, file));

  for (const routeFile of routeFiles) {
    const source = readFileSync(join(routeRoot, routeFile), "utf8");
    if (!source.includes("export const POST")) {
      continue;
    }
    if (readOnlyOrSharedRoutes.has(routeFile)) {
      assert.equal(
        source.includes("prepareAdminAction("),
        false,
        `${routeFile} is allowlisted and must not silently become a mutating admin action route`,
      );
      continue;
    }

    const expectedScope = expectedScopesByRoute.get(routeFile);
    assert.ok(expectedScope, `${routeFile} must declare an expected action-token scope in the invariant test`);
    assert.ok(declaredTargetScopes.has(expectedScope), `${expectedScope} must be part of ADMIN_ACTION_TOKEN_TARGETS`);
    assert.match(
      source,
      new RegExp(`actionToken:\\s*\\{\\s*scope:\\s*"${expectedScope.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"\\s*\\}`),
      `${routeFile} must require signed admin action token scope ${expectedScope}`,
    );
  }

  assert.deepEqual(
    [...expectedScopesByRoute.values()].filter((scope, index, scopes) => scopes.indexOf(scope) === index).sort(),
    [...declaredTargetScopes].sort(),
  );
});

test("adminActionError and adminActionSuccess keep browser and JSON behavior explicit", async () => {
  const jsonAction = await prepareAdminAction(
    new Request("http://127.0.0.1:4322/bff/admin/reindex", {
      method: "POST",
      headers: { accept: "application/json" },
    }),
    {
      fallbackRedirectPath: "/reindex",
      resolveSession: async () => adminSession,
      payloadReader: async () => ({}),
    },
  );
  assert.equal(jsonAction.ok, true);
  if (jsonAction.ok) {
    const response = adminActionError(jsonAction.context, {
      section: "reindex",
      message: "Nope.",
      status: 422,
    });
    assert.equal(response.status, 422);
    assert.deepEqual(await response.json(), { error: "Nope." });
  }

  const browserAction = await prepareAdminAction(
    new Request("http://127.0.0.1:8080/admin/bff/admin/reindex", {
      method: "POST",
      headers: { accept: "text/html" },
    }),
    {
      fallbackRedirectPath: "/reindex",
      resolveSession: async () => adminSession,
      payloadReader: async () => ({}),
    },
  );
  assert.equal(browserAction.ok, true);
  if (browserAction.ok) {
    const response = adminActionSuccess(browserAction.context, {
      section: "reindex",
      message: "Queued.",
      json: { ok: true },
    });
    assert.equal(response.status, 303);
    assert.match(response.headers.get("location") ?? "", /flash_status=success/);
    assert.match(response.headers.get("location") ?? "", /#reindex$/);
  }
});

test("admin action payload helpers validate intents and required text", () => {
  assert.equal(requireAdminIntent({ intent: "issue" }, ["issue", "revoke"], "issue"), "issue");
  assert.equal(requireAdminIntent({}, ["issue", "revoke"], "issue"), "issue");
  assert.throws(
    () => requireAdminIntent({ intent: "delete_all" }, ["issue", "revoke"], "issue"),
    /Invalid admin action intent/,
  );
  assert.equal(readRequiredAdminText({ tokenId: " token-1 " }, "tokenId"), "token-1");
  assert.throws(
    () => readRequiredAdminText({ tokenId: " " }, "tokenId", "Token required."),
    /Token required/,
  );
});

test("insertAdminAuditLog writes the canonical audit row shape", async () => {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  await insertAdminAuditLog(
    {
      query: async (sql: string, params: unknown[]) => {
        calls.push({ sql, params });
        return { rows: [] };
      },
    },
    {
      actorUserId: "admin-user-1",
      actionType: "unit_action",
      entityType: "unit",
      entityId: "entity-1",
      payloadJson: { ok: true },
    },
  );

  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /insert into audit_log/);
  assert.deepEqual(calls[0].params, [
    "admin-user-1",
    "unit_action",
    "unit",
    "entity-1",
    JSON.stringify({ ok: true }),
  ]);
});

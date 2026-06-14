import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";

import {
  buildWebActionToken,
  buildWebActionTokenSet,
  prepareWebAction,
  readWebActionTokenForScope,
  validateWebActionToken,
  validateWebActionCsrfMetadata,
  WEB_ACTION_TOKEN_TARGETS,
  type WebActionSession,
} from "../../../runtime/node/apps/web/src/lib/server/web-action.ts";
import {
  listFilesRecursive,
  withAppSecret,
} from "./support/action-kit-harness.ts";

const repoRoot = process.cwd();

const webSession: WebActionSession = {
  userId: "web-user-1",
  roles: [],
  identity: {
    subject: "firebase-web-user",
    provider: "firebase_anonymous",
    email: null,
    isAnonymous: true,
  },
};

test("prepareWebAction denies cross-site browser metadata before session or payload reads", async () => {
  let sessionResolved = false;
  let payloadRead = false;
  const result = await prepareWebAction(
    new Request("http://127.0.0.1:4321/bff/content-state", {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        origin: "https://evil.example",
        "sec-fetch-site": "cross-site",
      },
      body: JSON.stringify({ contentItemId: "doc-1", action: "save" }),
    }),
    {
      resolveSession: async () => {
        sessionResolved = true;
        return webSession;
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
    assert.deepEqual(await result.response.json(), { error: "Forbidden." });
  }
});

test("prepareWebAction keeps bootstrap-style actions sessionless but guarded", async () => {
  let sessionResolved = false;
  let payloadRead = false;
  const accepted = await prepareWebAction(
    new Request("http://127.0.0.1:4321/bff/auth/bootstrap", {
      method: "POST",
      headers: {
        accept: "application/json",
        origin: "http://127.0.0.1:4321",
        "sec-fetch-site": "same-origin",
      },
    }),
    {
      requireSession: false,
      readPayload: false,
      resolveSession: async () => {
        sessionResolved = true;
        return webSession;
      },
      payloadReader: async () => {
        payloadRead = true;
        return {};
      },
    },
  );

  assert.equal(accepted.ok, true);
  assert.equal(sessionResolved, false);
  assert.equal(payloadRead, false);
  if (accepted.ok) {
    assert.equal(accepted.context.session, null);
    assert.deepEqual(accepted.context.payload, {});
  }

  const rejected = await prepareWebAction(
    new Request("http://127.0.0.1:4321/bff/auth/bootstrap", {
      method: "POST",
      headers: {
        accept: "application/json",
        origin: "https://evil.example",
      },
    }),
    {
      requireSession: false,
      readPayload: false,
    },
  );
  assert.equal(rejected.ok, false);
  if (!rejected.ok) {
    assert.equal(rejected.response.status, 403);
  }
});

test("validateWebActionCsrfMetadata accepts same-origin and forwarded public origins", () => {
  assert.equal(
    validateWebActionCsrfMetadata(
      new Request("http://127.0.0.1:4321/bff/content-state", {
        method: "POST",
        headers: {
          origin: "http://127.0.0.1:4321",
          referer: "http://127.0.0.1:4321/content/doc-1",
          "sec-fetch-site": "same-origin",
        },
      }),
    ),
    true,
  );

  assert.equal(
    validateWebActionCsrfMetadata(
      new Request("http://web:4321/bff/content-state", {
        method: "POST",
        headers: {
          origin: "http://127.0.0.1:8080",
          referer: "http://127.0.0.1:8080/content/doc-1",
          "x-forwarded-host": "127.0.0.1:8080",
          "x-forwarded-proto": "http",
          "sec-fetch-site": "same-site",
        },
      }),
    ),
    true,
  );
});

test("validateWebActionCsrfMetadata rejects mismatched origins and absolute referers", () => {
  assert.equal(
    validateWebActionCsrfMetadata(
      new Request("http://127.0.0.1:4321/bff/content-state", {
        method: "POST",
        headers: {
          origin: "http://127.0.0.1:4322",
        },
      }),
    ),
    false,
  );

  assert.equal(
    validateWebActionCsrfMetadata(
      new Request("http://127.0.0.1:4321/bff/content-state", {
        method: "POST",
        headers: {
          referer: "https://evil.example/content/doc-1",
        },
      }),
    ),
    false,
  );
});

test("web action tokens validate user, path, scope, signature and expiry", () => {
  withAppSecret("unit-web-action-secret", () => {
    const request = new Request("http://127.0.0.1:4321/bff/reactions", {
      method: "POST",
    });
    const token = buildWebActionToken({
      request,
      session: webSession,
      targetPath: "/bff/reactions",
      scope: "reactions",
      nowMs: 1_000,
      ttlMs: 60_000,
    });

    assert.equal(
      validateWebActionToken(token, request, webSession, { scope: "reactions" }, 2_000),
      true,
    );
    assert.equal(
      validateWebActionToken(
        token,
        request,
        { ...webSession, userId: "other-web-user" },
        { scope: "reactions" },
        2_000,
      ),
      false,
    );
    assert.equal(
      validateWebActionToken(
        token,
        new Request("http://127.0.0.1:4321/bff/preferences", { method: "POST" }),
        webSession,
        { scope: "reactions" },
        2_000,
      ),
      false,
    );
    assert.equal(
      validateWebActionToken(token, request, webSession, { scope: "preferences" }, 2_000),
      false,
    );
    assert.equal(
      validateWebActionToken(token, request, webSession, { scope: "reactions" }, 70_000),
      false,
    );
    assert.equal(
      validateWebActionToken(`${token.slice(0, -1)}x`, request, webSession, { scope: "reactions" }, 2_000),
      false,
    );
  });
});

test("prepareWebAction enforces required web action tokens before schema validation", async () => {
  await withAppSecret("unit-web-action-secret", async () => {
    const request = new Request("http://127.0.0.1:4321/bff/reactions", {
      method: "POST",
      headers: {
        accept: "application/json",
      },
    });
    const token = buildWebActionToken({
      request,
      session: webSession,
      targetPath: "/bff/reactions",
      scope: "reactions",
      nowMs: Date.now(),
    });

    const accepted = await prepareWebAction(request, {
      actionToken: { scope: "reactions" },
      payloadSchema: {
        type: "object",
        required: ["docId", "reactionType"],
        properties: {
          docId: { type: "string" },
          reactionType: { type: "string" },
        },
        additionalProperties: false,
      },
      resolveSession: async () => webSession,
      payloadReader: async () => ({
        docId: "doc-1",
        reactionType: "like",
        webActionToken: token,
      }),
    });
    assert.equal(accepted.ok, true);
    if (accepted.ok) {
      assert.deepEqual(accepted.context.payload, {
        docId: "doc-1",
        reactionType: "like",
      });
    }

    const missing = await prepareWebAction(request, {
      actionToken: { scope: "reactions" },
      resolveSession: async () => webSession,
      payloadReader: async () => ({
        docId: "doc-1",
        reactionType: "like",
      }),
    });
    assert.equal(missing.ok, false);
    if (!missing.ok) {
      assert.equal(missing.response.status, 403);
      assert.deepEqual(await missing.response.json(), {
        error: "Invalid or expired web action token.",
      });
    }
  });
});

test("web action token sets expose scoped payload and header tokens", () => {
  withAppSecret("unit-web-action-secret", () => {
    const request = new Request("http://127.0.0.1:4321/bff/preferences", {
      method: "POST",
    });
    const tokens = buildWebActionTokenSet({
      request,
      session: webSession,
      actions: [
        { scope: "preferences", targetPath: "/bff/preferences" },
        { scope: "story-follow", targetPath: "/bff/story-follow" },
      ],
      nowMs: 1_000,
      ttlMs: 60_000,
    });

    assert.deepEqual(Object.keys(tokens).sort(), ["preferences", "story-follow"]);
    assert.equal(
      validateWebActionToken(tokens.preferences, request, webSession, { scope: "preferences" }, 2_000),
      true,
    );
    assert.equal(
      readWebActionTokenForScope({ webActionTokens: tokens }, request, "preferences"),
      tokens.preferences,
    );
    assert.equal(
      readWebActionTokenForScope(
        {},
        new Request("http://127.0.0.1:4321/bff/preferences", {
          headers: {
            "x-web-action-token-preferences": tokens.preferences,
          },
        }),
        "preferences",
      ),
      tokens.preferences,
    );
  });
});

test("web action tokens allow declared route-family prefixes", () => {
  withAppSecret("unit-web-action-secret", () => {
    const tokenRequest = new Request("http://127.0.0.1:4321/bff/interests", {
      method: "POST",
    });
    const dynamicRequest = new Request(
      "http://127.0.0.1:4321/bff/interests/11111111-1111-4111-8111-111111111111",
      {
        method: "POST",
      },
    );
    const token = buildWebActionToken({
      request: tokenRequest,
      session: webSession,
      targetPath: "/bff/interests",
      scope: "interests.update",
      nowMs: 2_000,
    });

    assert.equal(
      validateWebActionToken(token, dynamicRequest, webSession, { scope: "interests.update" }, 2_000),
      true,
    );
    assert.equal(
      validateWebActionToken(token, tokenRequest, webSession, { scope: "interests.update" }, 2_000),
      false,
    );
  });
});

test("mutating web BFF POST routes use the shared web action kit", () => {
  const routeRoot = join(repoRoot, "runtime/node/apps/web/src/pages/bff");
  const expectedPostRoutes = new Set([
    "auth/bootstrap.ts",
    "auth/google.ts",
    "auth/logout.ts",
    "content-state.ts",
    "digest-settings.ts",
    "feedback.ts",
    "interests.ts",
    "interests/[interestId].ts",
    "notification-channels.ts",
    "preferences.ts",
    "reactions.ts",
    "saved-digest.ts",
    "story-follow.ts",
  ]);
  const routeFiles = listFilesRecursive(routeRoot)
    .filter((file) => file.endsWith(".ts"))
    .map((file) => relative(routeRoot, file));

  for (const routeFile of routeFiles) {
    const source = readFileSync(join(routeRoot, routeFile), "utf8");
    if (!source.includes("export const POST")) {
      continue;
    }

    assert.ok(expectedPostRoutes.has(routeFile), `${routeFile} must be classified in the web BFF invariant`);
    assert.match(source, /prepareWebAction\(/, `${routeFile} must use the shared web action kit`);
    assert.match(
      source,
      /payloadSchema:\s*WEB_BFF_ACTION_PAYLOAD_SCHEMAS|assertJsonSchema\(/,
      `${routeFile} must validate a declared web BFF action payload schema`,
    );

    if (routeFile === "auth/bootstrap.ts" || routeFile === "auth/google.ts" || routeFile === "auth/logout.ts") {
      assert.match(source, /requireSession:\s*false/, `${routeFile} must document sessionless action-kit use`);
    } else {
      const expectedScope = WEB_ACTION_TOKEN_TARGETS.find((target) => {
        const targetFile = `${target.targetPath.replace(/^\/bff\//, "")}.ts`;
        return targetFile === routeFile || (target.scope === "interests.update" && routeFile === "interests/[interestId].ts");
      })?.scope;
      assert.ok(expectedScope, `${routeFile} must have a declared web action-token scope`);
      assert.match(
        source,
        new RegExp(`actionToken:\\s*\\{\\s*scope:\\s*"${expectedScope.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"\\s*\\}`),
        `${routeFile} must require its scoped web action token`,
      );
    }
  }

  assert.deepEqual(
    routeFiles.filter((routeFile) => {
      const source = readFileSync(join(routeRoot, routeFile), "utf8");
      return source.includes("export const POST");
    }).sort(),
    [...expectedPostRoutes].sort(),
  );
});

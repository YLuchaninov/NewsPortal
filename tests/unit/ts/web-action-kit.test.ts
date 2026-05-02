import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";

import {
  prepareWebAction,
  validateWebActionCsrfMetadata,
  type WebActionSession,
} from "../../../apps/web/src/lib/server/web-action.ts";

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

function listFilesRecursive(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(dir, entry.name);
    return entry.isDirectory() ? listFilesRecursive(fullPath) : [fullPath];
  });
}

test("mutating web BFF POST routes use the shared web action kit", () => {
  const routeRoot = join(repoRoot, "apps/web/src/pages/bff");
  const expectedPostRoutes = new Set([
    "auth/bootstrap.ts",
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

    if (routeFile === "auth/bootstrap.ts" || routeFile === "auth/logout.ts") {
      assert.match(source, /requireSession:\s*false/, `${routeFile} must document sessionless action-kit use`);
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

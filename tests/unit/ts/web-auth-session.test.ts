import assert from "node:assert/strict";
import test from "node:test";

import {
  bootstrapWebFirebaseSession,
  buildWebAuthCookies
} from "../../../apps/web/src/lib/server/auth.ts";

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  });
}

test("bootstrapWebFirebaseSession reuses the stored refresh token before creating a new anonymous user", async () => {
  const previousFetch = globalThis.fetch;
  const previousApiKey = process.env.FIREBASE_WEB_API_KEY;
  const calls: Array<{ url: string; body: string }> = [];

  process.env.FIREBASE_WEB_API_KEY = "test-api-key";
  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    const body = typeof init?.body === "string" ? init.body : "";
    calls.push({ url, body });

    if (url.startsWith("https://securetoken.googleapis.com/v1/token?key=test-api-key")) {
      assert.match(body, /grant_type=refresh_token/);
      assert.match(body, /refresh_token=remember-me-token/);
      return jsonResponse({
        id_token: "restored-id-token",
        refresh_token: "rotated-refresh-token"
      });
    }

    if (url.startsWith("https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=test-api-key")) {
      assert.equal(JSON.parse(body).idToken, "restored-id-token");
      return jsonResponse({
        users: [{ localId: "restored-user" }]
      });
    }

    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  try {
    const result = await bootstrapWebFirebaseSession(
      new Request("http://127.0.0.1:4321/bff/auth/bootstrap", {
        headers: {
          cookie: "np_web_refresh=remember-me-token"
        }
      })
    );

    assert.equal(result.reusedExisting, true);
    assert.equal(result.idToken, "restored-id-token");
    assert.equal(result.refreshToken, "rotated-refresh-token");
    assert.equal(result.identity.subject, "restored-user");
    assert.equal(result.identity.provider, "firebase_anonymous");
    assert.equal(
      calls.some(({ url }) => url.includes("accounts:signUp")),
      false
    );
  } finally {
    globalThis.fetch = previousFetch;
    if (previousApiKey == null) {
      delete process.env.FIREBASE_WEB_API_KEY;
    } else {
      process.env.FIREBASE_WEB_API_KEY = previousApiKey;
    }
  }
});

test("bootstrapWebFirebaseSession falls back to a new anonymous session when the stored refresh token is stale", async () => {
  const previousFetch = globalThis.fetch;
  const previousApiKey = process.env.FIREBASE_WEB_API_KEY;
  const calls: string[] = [];

  process.env.FIREBASE_WEB_API_KEY = "test-api-key";
  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    calls.push(url);

    if (url.startsWith("https://securetoken.googleapis.com/v1/token?key=test-api-key")) {
      return jsonResponse(
        {
          error: {
            message: "INVALID_REFRESH_TOKEN"
          }
        },
        400
      );
    }

    if (url.startsWith("https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=test-api-key")) {
      assert.equal(init?.method, "POST");
      return jsonResponse({
        idToken: "fresh-id-token",
        refreshToken: "fresh-refresh-token",
        localId: "fresh-user"
      });
    }

    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  try {
    const result = await bootstrapWebFirebaseSession(
      new Request("http://127.0.0.1:4321/bff/auth/bootstrap", {
        headers: {
          cookie: "np_web_refresh=stale-token"
        }
      })
    );

    assert.equal(result.reusedExisting, false);
    assert.equal(result.idToken, "fresh-id-token");
    assert.equal(result.refreshToken, "fresh-refresh-token");
    assert.equal(result.identity.subject, "fresh-user");
    assert.equal(
      calls.some((url) => url.includes("accounts:signUp")),
      true
    );
  } finally {
    globalThis.fetch = previousFetch;
    if (previousApiKey == null) {
      delete process.env.FIREBASE_WEB_API_KEY;
    } else {
      process.env.FIREBASE_WEB_API_KEY = previousApiKey;
    }
  }
});

test("buildWebAuthCookies emits both session and refresh cookies", () => {
  const cookies = buildWebAuthCookies({
    idToken: "id-token",
    refreshToken: "refresh-token"
  });

  assert.equal(cookies.length, 2);
  assert.match(cookies[0], /^np_web_session=id-token;/);
  assert.match(cookies[1], /^np_web_refresh=refresh-token;/);
  assert.equal(cookies.every((cookie) => cookie.includes("HttpOnly")), true);
});

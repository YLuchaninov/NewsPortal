import assert from "node:assert/strict";
import test from "node:test";

import {
  bootstrapWebFirebaseSession,
  buildWebAuthCookies,
  isAuthorizedGoogleIdentity,
  signInWebWithGoogleCredential,
} from "../../../apps/web/src/lib/server/auth.ts";

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function restoreEnv(previous: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(previous)) {
    if (value == null) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

test("signInWebWithGoogleCredential exchanges a Google credential for an authorized Firebase web session", async () => {
  const previousFetch = globalThis.fetch;
  const previousEnv = {
    FIREBASE_WEB_API_KEY: process.env.FIREBASE_WEB_API_KEY,
    SIGNALOPS_WEB_GOOGLE_ALLOWED_DOMAIN: process.env.SIGNALOPS_WEB_GOOGLE_ALLOWED_DOMAIN,
  };
  const calls: Array<{ url: string; body: string }> = [];

  process.env.FIREBASE_WEB_API_KEY = "test-api-key";
  process.env.SIGNALOPS_WEB_GOOGLE_ALLOWED_DOMAIN = "example.com";
  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    const body = typeof init?.body === "string" ? init.body : "";
    calls.push({ url, body });

    if (url.startsWith("https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=test-api-key")) {
      const payload = JSON.parse(body) as Record<string, string>;
      assert.equal(payload.returnSecureToken, true);
      assert.match(String(payload.postBody), /providerId=google\.com/);
      assert.match(String(payload.postBody), /id_token=google-credential/);
      return jsonResponse({
        idToken: "firebase-id-token",
        refreshToken: "firebase-refresh-token",
      });
    }

    if (url.startsWith("https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=test-api-key")) {
      assert.equal(JSON.parse(body).idToken, "firebase-id-token");
      return jsonResponse({
        users: [{
          localId: "google-user",
          email: "Person@Example.com",
          emailVerified: true,
          providerUserInfo: [{ providerId: "google.com" }],
        }],
      });
    }

    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  try {
    const result = await signInWebWithGoogleCredential("google-credential");

    assert.equal(result.idToken, "firebase-id-token");
    assert.equal(result.refreshToken, "firebase-refresh-token");
    assert.equal(result.identity.subject, "google-user");
    assert.equal(result.identity.provider, "firebase_google");
    assert.equal(result.identity.email, "Person@Example.com");
    assert.equal(result.identity.isAnonymous, false);
    assert.equal(calls.length, 2);
  } finally {
    globalThis.fetch = previousFetch;
    restoreEnv(previousEnv);
  }
});

test("signInWebWithGoogleCredential rejects non-Google or unverified identities", async () => {
  const previousFetch = globalThis.fetch;
  const previousEnv = {
    FIREBASE_WEB_API_KEY: process.env.FIREBASE_WEB_API_KEY,
  };

  process.env.FIREBASE_WEB_API_KEY = "test-api-key";
  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    if (url.includes("accounts:signInWithIdp")) {
      return jsonResponse({
        idToken: "firebase-id-token",
        refreshToken: "firebase-refresh-token",
      });
    }
    if (url.includes("accounts:lookup")) {
      const requestToken = JSON.parse(String(init?.body ?? "{}")).idToken;
      const unverified = requestToken === "firebase-id-token";
      return jsonResponse({
        users: [{
          localId: "password-user",
          email: unverified ? "person@example.com" : "",
          emailVerified: false,
          providerUserInfo: [{ providerId: "password" }],
        }],
      });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  try {
    await assert.rejects(
      () => signInWebWithGoogleCredential("google-credential"),
      /Google email must be verified|Only authorized Google accounts/
    );
  } finally {
    globalThis.fetch = previousFetch;
    restoreEnv(previousEnv);
  }
});

test("isAuthorizedGoogleIdentity enforces one exact allowed domain", () => {
  const previousEnv = {
    SIGNALOPS_WEB_GOOGLE_ALLOWED_DOMAIN: process.env.SIGNALOPS_WEB_GOOGLE_ALLOWED_DOMAIN,
  };

  try {
    process.env.SIGNALOPS_WEB_GOOGLE_ALLOWED_DOMAIN = "Example.com";
    assert.equal(
      isAuthorizedGoogleIdentity({
        subject: "sub-1",
        provider: "firebase_google",
        email: "a@example.com",
        isAnonymous: false,
      }),
      true
    );
    assert.equal(
      isAuthorizedGoogleIdentity({
        subject: "sub-2",
        provider: "firebase_google",
        email: "a@sub.example.com",
        isAnonymous: false,
      }),
      false
    );
    assert.equal(
      isAuthorizedGoogleIdentity({
        subject: "sub-3",
        provider: "firebase_anonymous",
        email: "a@example.com",
        isAnonymous: true,
      }),
      false
    );
  } finally {
    restoreEnv(previousEnv);
  }
});

test("bootstrapWebFirebaseSession is disabled by default and only mints proof-only Google sessions when explicitly enabled", async () => {
  const previousEnv = {
    APP_SECRET: process.env.APP_SECRET,
    SIGNALOPS_WEB_TEST_AUTH_ENABLED: process.env.SIGNALOPS_WEB_TEST_AUTH_ENABLED,
    SIGNALOPS_WEB_TEST_AUTH_EMAIL: process.env.SIGNALOPS_WEB_TEST_AUTH_EMAIL,
    SIGNALOPS_WEB_GOOGLE_ALLOWED_DOMAIN: process.env.SIGNALOPS_WEB_GOOGLE_ALLOWED_DOMAIN,
  };

  try {
    delete process.env.SIGNALOPS_WEB_TEST_AUTH_ENABLED;
    await assert.rejects(
      () => bootstrapWebFirebaseSession(new Request("http://127.0.0.1:4321/bff/auth/bootstrap")),
      /Google sign-in is required/
    );

    process.env.APP_SECRET = "test-secret";
    process.env.SIGNALOPS_WEB_TEST_AUTH_ENABLED = "true";
    process.env.SIGNALOPS_WEB_TEST_AUTH_EMAIL = "web-user@example.com";
    process.env.SIGNALOPS_WEB_GOOGLE_ALLOWED_DOMAIN = "example.com";
    const session = await bootstrapWebFirebaseSession(
      new Request("http://127.0.0.1:4321/bff/auth/bootstrap")
    );

    assert.equal(session.identity.provider, "firebase_google");
    assert.equal(session.identity.email, "web-user@example.com");
    assert.equal(session.identity.isAnonymous, false);
    assert.equal(session.idToken.startsWith("test-google."), true);
  } finally {
    restoreEnv(previousEnv);
  }
});

test("buildWebAuthCookies emits both session and refresh cookies", () => {
  const cookies = buildWebAuthCookies({
    idToken: "id-token",
    refreshToken: "refresh-token",
  });

  assert.equal(cookies.length, 2);
  assert.match(cookies[0], /^np_web_session=id-token;/);
  assert.match(cookies[1], /^np_web_refresh=refresh-token;/);
  assert.equal(cookies.every((cookie) => cookie.includes("HttpOnly")), true);
});

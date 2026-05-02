import assert from "node:assert/strict";
import test from "node:test";

import {
  readCookieSecurePolicy,
  shouldMarkCookieSecure,
} from "../../../packages/config/src/index.ts";
import {
  buildAdminSessionCookie,
  buildExpiredAdminSessionCookie,
} from "../../../apps/admin/src/lib/server/auth.ts";
import {
  buildExpiredSessionCookie,
  buildWebAuthCookies,
} from "../../../apps/web/src/lib/server/auth.ts";

function withCookieSecurePolicy<T>(
  value: string | undefined,
  callback: () => T,
): T {
  const previous = process.env.NEWSPORTAL_COOKIE_SECURE_POLICY;
  if (value == null) {
    delete process.env.NEWSPORTAL_COOKIE_SECURE_POLICY;
  } else {
    process.env.NEWSPORTAL_COOKIE_SECURE_POLICY = value;
  }

  try {
    return callback();
  } finally {
    if (previous == null) {
      delete process.env.NEWSPORTAL_COOKIE_SECURE_POLICY;
    } else {
      process.env.NEWSPORTAL_COOKIE_SECURE_POLICY = previous;
    }
  }
}

test("cookie secure policy normalizes invalid env values to auto", () => {
  assert.equal(readCookieSecurePolicy({ NEWSPORTAL_COOKIE_SECURE_POLICY: "always" }), "always");
  assert.equal(readCookieSecurePolicy({ NEWSPORTAL_COOKIE_SECURE_POLICY: "never" }), "never");
  assert.equal(readCookieSecurePolicy({ NEWSPORTAL_COOKIE_SECURE_POLICY: "AUTO" }), "auto");
  assert.equal(readCookieSecurePolicy({ NEWSPORTAL_COOKIE_SECURE_POLICY: "surprise" }), "auto");
});

test("cookie secure policy follows request scheme and forwarded proto in auto mode", () => {
  assert.equal(
    shouldMarkCookieSecure({
      env: { NEWSPORTAL_COOKIE_SECURE_POLICY: "auto" },
      request: new Request("https://admin.example.test/bff/auth/sign-in"),
    }),
    true,
  );
  assert.equal(
    shouldMarkCookieSecure({
      env: { NEWSPORTAL_COOKIE_SECURE_POLICY: "auto" },
      request: new Request("http://admin.internal/bff/auth/sign-in", {
        headers: {
          "x-forwarded-proto": "https",
        },
      }),
    }),
    true,
  );
  assert.equal(
    shouldMarkCookieSecure({
      env: { NEWSPORTAL_COOKIE_SECURE_POLICY: "auto" },
      request: new Request("http://127.0.0.1:4322/bff/auth/sign-in"),
    }),
    false,
  );
});

test("web and admin auth cookies add Secure only when policy requires it", () => {
  withCookieSecurePolicy(undefined, () => {
    const localWebCookies = buildWebAuthCookies(
      {
        idToken: "id-token",
        refreshToken: "refresh-token",
      },
      {
        request: new Request("http://127.0.0.1:4321/bff/auth/bootstrap"),
      },
    );
    assert.equal(localWebCookies.every((cookie) => cookie.includes("; Secure")), false);

    const proxiedAdminCookie = buildAdminSessionCookie("admin-token", {
      request: new Request("http://admin:4322/bff/auth/sign-in", {
        headers: {
          "x-forwarded-proto": "https",
        },
      }),
    });
    assert.match(proxiedAdminCookie, /; Secure$/);
  });

  withCookieSecurePolicy("always", () => {
    assert.match(
      buildExpiredSessionCookie({
        request: new Request("http://127.0.0.1:4321/bff/auth/logout"),
      }),
      /; Secure$/,
    );
  });

  withCookieSecurePolicy("never", () => {
    assert.doesNotMatch(
      buildExpiredAdminSessionCookie({
        request: new Request("https://admin.example.test/bff/auth/logout"),
      }),
      /; Secure$/,
    );
  });
});

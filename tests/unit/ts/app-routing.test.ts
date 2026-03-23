import assert from "node:assert/strict";
import test from "node:test";

import { resolveAppHref } from "../../../packages/config/src/index.ts";
import { buildFlashRedirect as buildAdminFlashRedirect } from "../../../apps/admin/src/lib/server/browser-flow.ts";
import { buildFlashRedirect as buildWebFlashRedirect } from "../../../apps/web/src/lib/server/browser-flow.ts";

function withAppBaseUrl(appBaseUrl: string, run: () => void) {
  const previousValue = process.env.NEWSPORTAL_APP_BASE_URL;
  process.env.NEWSPORTAL_APP_BASE_URL = appBaseUrl;
  try {
    run();
  } finally {
    if (previousValue == null) {
      delete process.env.NEWSPORTAL_APP_BASE_URL;
    } else {
      process.env.NEWSPORTAL_APP_BASE_URL = previousValue;
    }
  }
}

test("resolveAppHref preserves root and admin base paths", () => {
  assert.equal(
    resolveAppHref("http://127.0.0.1:4321/", "/bff/auth/bootstrap"),
    "/bff/auth/bootstrap"
  );
  assert.equal(
    resolveAppHref("https://newsportal.local/admin/", "/bff/auth/sign-in"),
    "/admin/bff/auth/sign-in"
  );
});

test("web flash redirects fall back to configured app origin when request URL degrades to localhost", () => {
  withAppBaseUrl("http://127.0.0.1:4321/", () => {
    const response = buildWebFlashRedirect(new Request("http://localhost/bff/auth/logout"), {
      section: "auth",
      status: "success",
      message: "Signed out."
    });

    assert.equal(response.status, 303);
    assert.equal(
      response.headers.get("location"),
      "http://127.0.0.1:4321/?flash_status=success&flash_message=Signed+out.#auth"
    );
  });
});

test("admin flash redirects preserve nginx-style /admin base path from the current request", () => {
  withAppBaseUrl("http://127.0.0.1:4322/", () => {
    const response = buildAdminFlashRedirect(
      new Request("http://127.0.0.1:8080/admin/bff/auth/sign-in"),
      {
        section: "auth",
        status: "success",
        message: "Signed in."
      }
    );

    assert.equal(response.status, 303);
    assert.equal(
      response.headers.get("location"),
      "http://127.0.0.1:8080/admin/?flash_status=success&flash_message=Signed+in.#auth"
    );
  });
});

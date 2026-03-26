import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAdminUserInterestContextFields,
  formatCsvListValue,
  formatLineListValue,
  resolveAdminUserInterestCompileState,
  resolveAdminUserInterestSearchState,
} from "../../../apps/admin/src/lib/server/user-interest-admin-page.ts";

test("resolveAdminUserInterestSearchState preserves raw inputs and normalized lookup priority", () => {
  const state = resolveAdminUserInterestSearchState(
    new URLSearchParams({
      email: "Reader@Example.com",
      userId: "  user-123  ",
    })
  );

  assert.deepEqual(state, {
    rawUserId: "user-123",
    rawEmail: "Reader@Example.com",
    lookup: {
      userId: "user-123",
    },
  });
});

test("buildAdminUserInterestContextFields keeps target-user context for BFF writes", () => {
  assert.deepEqual(
    buildAdminUserInterestContextFields(
      {
        userId: "user-1",
        email: "reader@example.com",
        status: "active",
        isAnonymous: false,
      },
      "/user-interests?userId=user-1"
    ),
    [
      { name: "userId", value: "user-1" },
      { name: "redirectTo", value: "/user-interests?userId=user-1" },
    ]
  );
});

test("list formatting helpers keep admin textareas and csv fields stable", () => {
  assert.equal(formatLineListValue(["AI Act", " Brussels "]), "AI Act\nBrussels");
  assert.equal(formatCsvListValue(["en", " uk "]), "en, uk");
  assert.equal(formatLineListValue(null), "");
  assert.equal(formatCsvListValue(undefined), "");
});

test("resolveAdminUserInterestCompileState surfaces compiled and failed states with operator detail", () => {
  const compiled = resolveAdminUserInterestCompileState({
    compile_status: "compiled",
    compiled_at: "2026-03-25T12:34:00Z",
  });
  assert.equal(compiled.label, "Compiled");
  assert.equal(compiled.tone, "success");
  assert.match(String(compiled.detail), /Mar|12:34|25/);

  assert.deepEqual(
    resolveAdminUserInterestCompileState({
      compile_status: "failed",
      error_text: "Embedding model unavailable",
    }),
    {
      label: "Failed",
      tone: "error",
      detail: "Embedding model unavailable",
    }
  );
});

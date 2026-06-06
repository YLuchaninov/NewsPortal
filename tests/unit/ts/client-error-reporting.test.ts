import assert from "node:assert/strict";
import test from "node:test";

import {
  ClientActionError,
  createClientActionError,
  reportClientError,
} from "../../../packages/ui/src/lib/client-errors.ts";

test("reportClientError shows friendly toast text and logs technical details", () => {
  const toastCalls: Array<{ message: string; duration?: number }> = [];
  const consoleCalls: unknown[][] = [];
  const error = new ClientActionError("Friendly failure.", {
    technicalError: "OPERATION_NOT_ALLOWED : The identity provider configuration is not found.",
    errorCode: "firebase_provider_not_enabled",
    status: 403,
  });

  const message = reportClientError(error, {
    context: "Google sign-in",
    toastError: (toastMessage, options) => {
      toastCalls.push({ message: toastMessage, duration: options?.duration });
    },
    consoleError: (...args) => consoleCalls.push(args),
  });

  assert.equal(message, "Friendly failure.");
  assert.deepEqual(toastCalls, [{ message: "Friendly failure.", duration: 7000 }]);
  assert.equal(consoleCalls.length, 1);
  assert.equal(consoleCalls[0]?.[0], "[SignalOps client error]");
  assert.deepEqual(consoleCalls[0]?.[1], {
    context: "Google sign-in",
    userMessage: "Friendly failure.",
    errorCode: "firebase_provider_not_enabled",
    status: 403,
    technicalError: "OPERATION_NOT_ALLOWED : The identity provider configuration is not found.",
    serverPayload: null,
  });
});

test("createClientActionError keeps technical payload out of the user message", () => {
  const error = createClientActionError(
    {
      error: "Google sign-in is not enabled in Firebase Authentication.",
      technicalError: "OPERATION_NOT_ALLOWED : The identity provider configuration is not found.",
      errorCode: "firebase_provider_not_enabled",
    },
    {
      fallbackMessage: "Google sign-in failed.",
      status: 403,
    }
  );

  assert.equal(error.userMessage, "Google sign-in is not enabled in Firebase Authentication.");
  assert.equal(error.message, "Google sign-in is not enabled in Firebase Authentication.");
  assert.equal(error.technicalError, "OPERATION_NOT_ALLOWED : The identity provider configuration is not found.");
  assert.equal(error.errorCode, "firebase_provider_not_enabled");
  assert.equal(error.status, 403);
});

test("reportClientError handles unknown values with a friendly fallback", () => {
  const toastMessages: string[] = [];
  const consoleCalls: unknown[][] = [];

  const message = reportClientError({ raw: "unknown" }, {
    context: "Unknown action",
    fallbackMessage: "Unable to finish the action.",
    toastError: (toastMessage) => toastMessages.push(toastMessage),
    consoleError: (...args) => consoleCalls.push(args),
  });

  assert.equal(message, "Unable to finish the action.");
  assert.deepEqual(toastMessages, ["Unable to finish the action."]);
  assert.equal(consoleCalls.length, 1);
});

test("reportClientError allows overriding toast duration", () => {
  const toastCalls: Array<{ message: string; duration?: number }> = [];

  reportClientError(new Error("Technical detail."), {
    fallbackMessage: "Friendly failure.",
    toastDurationMs: 3000,
    toastError: (toastMessage, options) => {
      toastCalls.push({ message: toastMessage, duration: options?.duration });
    },
    consoleError: () => undefined,
  });

  assert.deepEqual(toastCalls, [{ message: "Friendly failure.", duration: 3000 }]);
});

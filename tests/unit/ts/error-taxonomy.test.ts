import assert from "node:assert/strict";
import test from "node:test";

import {
  classifySignalOpsErrorCode,
  createSignalOpsErrorDiagnostic,
  SIGNALOPS_ERROR_CODES,
} from "../../../runtime/node/packages/contracts/src/index.ts";

test("error taxonomy classifies known and unknown error codes", () => {
  assert.deepEqual(classifySignalOpsErrorCode(SIGNALOPS_ERROR_CODES.acquisitionUrlBlocked), {
    domain: "acquisition_url",
    severity: "warning",
    retry_hint: "after_operator_fix",
  });
  assert.deepEqual(classifySignalOpsErrorCode("unknown.code"), {
    domain: "unknown",
    severity: "error",
    retry_hint: "none",
  });
});

test("error taxonomy creates stable diagnostics with optional message", () => {
  assert.deepEqual(createSignalOpsErrorDiagnostic({
    code: SIGNALOPS_ERROR_CODES.providerFetchFailed,
    message: "upstream timed out",
  }), {
    code: "provider_fetch.failed",
    domain: "provider_fetch",
    severity: "warning",
    retry_hint: "retry",
    message: "upstream timed out",
  });
});

import assert from "node:assert/strict";
import test from "node:test";

import { publicApiUrl } from "../../../infra/scripts/lib/compose-proof-testkit.mjs";

test("compose proof public API URLs go through nginx /api", () => {
  assert.equal(
    publicApiUrl("/collections/system-selected?page=1&pageSize=100"),
    "http://127.0.0.1:8080/api/collections/system-selected?page=1&pageSize=100"
  );
  assert.equal(
    publicApiUrl("maintenance/signal-candidates/doc-1"),
    "http://127.0.0.1:8080/api/maintenance/signal-candidates/doc-1"
  );
});

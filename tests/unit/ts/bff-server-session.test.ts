import assert from "node:assert/strict";
import test from "node:test";

import {
  buildBffSessionResponse,
  jsonBffSessionResponse,
} from "../../../runtime/node/packages/bff-server/src/index.ts";

test("shared BFF session response keeps web and admin JSON shape stable", async () => {
  const session = {
    userId: "user-1",
    roles: ["admin"],
  };

  assert.deepEqual(buildBffSessionResponse(session), { session });
  assert.deepEqual(buildBffSessionResponse(null), { session: null });

  const response = jsonBffSessionResponse(session);
  assert.equal(response.headers.get("content-type")?.includes("application/json"), true);
  assert.deepEqual(await response.json(), { session });
});

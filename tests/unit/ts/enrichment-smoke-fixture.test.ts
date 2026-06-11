import assert from "node:assert/strict";
import test from "node:test";

import { containerReachableFixtureUrl } from "../../../infra/scripts/fetchers/enrichment-smoke-fixture";

test("containerReachableFixtureUrl rewrites host loopback fixture URLs for compose services", () => {
  assert.equal(
    containerReachableFixtureUrl("http://127.0.0.1:49152"),
    "http://host.docker.internal:49152"
  );
  assert.equal(
    containerReachableFixtureUrl("http://127.0.0.1:49152/signal-candidates/short.html"),
    "http://host.docker.internal:49152/signal-candidates/short.html"
  );
  assert.equal(
    containerReachableFixtureUrl("http://localhost:49152/media/short.jpg"),
    "http://host.docker.internal:49152/media/short.jpg"
  );
});

test("containerReachableFixtureUrl preserves already container-reachable URLs", () => {
  assert.equal(
    containerReachableFixtureUrl("http://host.docker.internal:49152/feed.xml"),
    "http://host.docker.internal:49152/feed.xml"
  );
});

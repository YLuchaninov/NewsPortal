import assert from "node:assert/strict";
import test from "node:test";

import { parseApiChannelConfig } from "../../../packages/contracts/src/source.ts";

test("parseApiChannelConfig preserves default single-page GET behavior", () => {
  const config = parseApiChannelConfig({});

  assert.equal(config.requestMethod, "GET");
  assert.deepEqual(config.requestHeaders, {});
  assert.equal(config.requestBodyJson, null);
  assert.deepEqual(config.pagination, {
    mode: "none",
    nextUrlPath: "next",
    pageParam: "page",
    pageStart: 1,
    maxPagesPerPoll: 1,
  });
});

test("parseApiChannelConfig accepts bounded POST and pagination options", () => {
  const config = parseApiChannelConfig({
    requestMethod: "post",
    requestHeaders: {
      "X-Api-Version": "2026-05-01",
    },
    requestBodyJson: {
      query: "energy",
      flags: ["fresh"],
    },
    pagination: {
      mode: "next_url",
      nextUrlPath: "paging.next",
      maxPagesPerPoll: 25,
    },
  });

  assert.equal(config.requestMethod, "POST");
  assert.deepEqual(config.requestHeaders, {
    "x-api-version": "2026-05-01",
  });
  assert.deepEqual(config.requestBodyJson, {
    query: "energy",
    flags: ["fresh"],
  });
  assert.deepEqual(config.pagination, {
    mode: "next_url",
    nextUrlPath: "paging.next",
    pageParam: "page",
    pageStart: 1,
    maxPagesPerPoll: 10,
  });
});

test("parseApiChannelConfig rejects unsafe header ownership", () => {
  assert.throws(
    () =>
      parseApiChannelConfig({
        requestHeaders: {
          Authorization: "Bearer hidden",
        },
      }),
    /managed by NewsPortal/,
  );
});

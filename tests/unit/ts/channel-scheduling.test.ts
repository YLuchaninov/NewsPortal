import assert from "node:assert/strict";
import test from "node:test";

import { parseChannelSchedulePatchInput } from "../../../runtime/node/apps/admin/src/lib/server/channel-scheduling.ts";

test("parseChannelSchedulePatchInput accepts provider-wide schedule patches", () => {
  const patch = parseChannelSchedulePatchInput({
    providerType: "api",
    pollIntervalSeconds: "900",
    adaptiveEnabled: "false",
    maxPollIntervalSeconds: "86400"
  });

  assert.deepEqual(patch, {
    channelIds: [],
    providerType: "api",
    pollIntervalSeconds: 900,
    adaptiveEnabled: false,
    maxPollIntervalSeconds: 86400
  });
});

test("parseChannelSchedulePatchInput accepts csv channel ids and clamps max interval to base", () => {
  const patch = parseChannelSchedulePatchInput({
    channelIdsCsv: "a, b, c",
    pollIntervalSeconds: "3600",
    maxPollIntervalSeconds: "600"
  });

  assert.deepEqual(patch, {
    channelIds: ["a", "b", "c"],
    providerType: null,
    pollIntervalSeconds: 3600,
    adaptiveEnabled: true,
    maxPollIntervalSeconds: 3600
  });
});

test("parseChannelSchedulePatchInput requires either providerType or channel ids", () => {
  assert.throws(
    () =>
      parseChannelSchedulePatchInput({
        pollIntervalSeconds: "300"
      }),
    /requires channelIds or providerType/
  );
});

test("parseChannelSchedulePatchInput rejects future-hidden providers", () => {
  assert.throws(
    () =>
      parseChannelSchedulePatchInput({
        providerType: "youtube",
        pollIntervalSeconds: "300"
      }),
    /Unsupported providerType "youtube"/
  );
});

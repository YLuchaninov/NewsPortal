import assert from "node:assert/strict";
import test from "node:test";

import {
  LIVE_UPDATES_FAST_POLL_MS,
  LIVE_UPDATES_IDLE_POLL_MS,
  buildLiveRevision,
  diffLiveUpdates,
  resolveLiveUpdateDelay,
  resolveSurfaceUpdateMessage,
  serializeLiveUpdatesResponse,
  type LiveUpdatesSnapshot,
} from "../../../apps/web/src/lib/live-updates.ts";

function createSnapshot(): LiveUpdatesSnapshot {
  return {
    fetchedAt: "2026-03-26T12:00:00Z",
    feed: {
      total: 4,
      revision: "feed-v1",
    },
    interests: {
      total: 2,
      queuedCount: 0,
      failedCount: 0,
      revision: "interests-v1",
    },
    matches: {
      total: 1,
      revision: "matches-v1",
    },
    notifications: {
      total: 3,
      revision: "notifications-v1",
    },
    settings: {
      channelCount: 1,
      preferencesRevision: "prefs-v1",
      channelsRevision: "channels-v1",
    },
    repairJobs: [],
  };
}

test("buildLiveRevision keeps stable ordered parts", () => {
  assert.equal(
    buildLiveRevision(["feed", 4, "doc-1", "2026-03-26T12:00:00Z"]),
    "feed|4|doc-1|2026-03-26T12:00:00Z"
  );
});

test("diffLiveUpdates stays quiet on the first snapshot and detects later changes", () => {
  const previous = createSnapshot();
  const next = createSnapshot();
  next.feed.revision = "feed-v2";
  next.settings.channelsRevision = "channels-v2";
  next.repairJobs = [
    {
      reindexJobId: "job-1",
      status: "running",
      interestId: "interest-1",
      processedArticles: 4,
      totalArticles: 10,
      finishedAt: null,
      errorText: null,
    },
  ];

  assert.deepEqual(diffLiveUpdates(null, previous), {
    feed: false,
    interests: false,
    matches: false,
    notifications: false,
    settings: false,
    repairJobs: false,
  });

  assert.deepEqual(diffLiveUpdates(previous, next), {
    feed: true,
    interests: false,
    matches: false,
    notifications: false,
    settings: true,
    repairJobs: true,
  });
});

test("resolveLiveUpdateDelay switches between idle, fast, hidden, and backoff polling", () => {
  const idleSnapshot = createSnapshot();
  const busySnapshot = createSnapshot();
  busySnapshot.interests.queuedCount = 1;

  assert.equal(
    resolveLiveUpdateDelay({
      hidden: false,
      snapshot: idleSnapshot,
      consecutiveFailures: 0,
    }),
    LIVE_UPDATES_IDLE_POLL_MS
  );

  assert.equal(
    resolveLiveUpdateDelay({
      hidden: false,
      snapshot: busySnapshot,
      consecutiveFailures: 0,
    }),
    LIVE_UPDATES_FAST_POLL_MS
  );

  assert.equal(
    resolveLiveUpdateDelay({
      hidden: true,
      snapshot: busySnapshot,
      consecutiveFailures: 0,
    }),
    null
  );

  assert.equal(
    resolveLiveUpdateDelay({
      hidden: false,
      snapshot: busySnapshot,
      consecutiveFailures: 2,
    }),
    LIVE_UPDATES_FAST_POLL_MS * 3
  );
});

test("resolveSurfaceUpdateMessage keeps product copy aligned with the planned surfaces", () => {
  assert.equal(
    resolveSurfaceUpdateMessage("feed"),
    "New system-selected articles available"
  );
  assert.equal(
    resolveSurfaceUpdateMessage("matches"),
    "New personal matches available"
  );
  assert.equal(
    resolveSurfaceUpdateMessage("notifications"),
    "New notification history available"
  );
});

test("serializeLiveUpdatesResponse preserves session and no-session shapes", () => {
  const snapshot = createSnapshot();

  assert.deepEqual(serializeLiveUpdatesResponse(null), {
    sessionActive: false,
    snapshot: null,
  });

  assert.deepEqual(serializeLiveUpdatesResponse(snapshot), {
    sessionActive: true,
    snapshot,
  });
});

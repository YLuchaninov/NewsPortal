import assert from "node:assert/strict";
import test from "node:test";

import {
  buildUserContentStateView,
  resolveStoryUpdated,
} from "../../../apps/web/src/lib/server/user-content-state.ts";

test("buildUserContentStateView keeps unread items non-new after mark unread semantics", () => {
  const state = buildUserContentStateView(
    {
      content_item_id: "editorial:1",
      first_seen_at: "2026-04-04T09:00:00Z",
      last_seen_at: null,
      saved_state: "none",
      saved_at: null,
      archived_at: null,
    },
    null
  );

  assert.equal(state.is_new, false);
  assert.equal(state.is_seen, false);
  assert.equal(state.saved_state, "none");
});

test("buildUserContentStateView marks followed stories as updated when newer cluster content exists", () => {
  const state = buildUserContentStateView(
    {
      content_item_id: "editorial:1",
      first_seen_at: "2026-04-04T09:00:00Z",
      last_seen_at: "2026-04-04T09:00:00Z",
      saved_state: "saved",
      saved_at: "2026-04-04T09:10:00Z",
      archived_at: null,
    },
    {
      origin_id: "1",
      event_cluster_id: "cluster-1",
      latest_content_at: "2026-04-05T09:00:00Z",
      is_following_story: true,
      followed_last_seen_at: "2026-04-04T10:00:00Z",
    }
  );

  assert.equal(state.story_followable, true);
  assert.equal(state.is_following_story, true);
  assert.equal(state.story_updated_since_seen, true);
  assert.equal(state.saved_state, "saved");
});

test("resolveStoryUpdated returns false when followed story has no newer content", () => {
  assert.equal(resolveStoryUpdated("2026-04-04T09:00:00Z", "2026-04-04T09:00:00Z"), false);
  assert.equal(resolveStoryUpdated("2026-04-04T09:00:00Z", "2026-04-05T09:00:00Z"), false);
  assert.equal(resolveStoryUpdated(null, "2026-04-05T09:00:00Z"), false);
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  buildUserContentStateView,
  getSingleUserContentState,
  listSavedContentItemRefs,
  resolveStoryUpdated,
  setContentItemSavedState,
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

test("getSingleUserContentState falls back to family state for editorial duplicates", async () => {
  const pool = {
    async query(sql: string, params?: unknown[]) {
      if (sql.includes("where user_id = $1") && sql.includes("content_item_id = any($2::text[])")) {
        return { rows: [] };
      }
      if (sql.includes("with requested_editorial as")) {
        return {
          rows: [
            {
              requested_content_item_id: "editorial:primary",
              content_item_id: "editorial:duplicate",
              first_seen_at: "2026-04-14T09:00:00Z",
              last_seen_at: "2026-04-14T09:05:00Z",
              saved_state: "saved",
              saved_at: "2026-04-14T09:10:00Z",
              archived_at: null,
            },
          ],
        };
      }
      if (sql.includes("latest.latest_content_at::text as latest_content_at")) {
        return {
          rows: [
            {
              origin_id: "primary",
              event_cluster_id: "cluster-1",
              latest_content_at: "2026-04-14T10:00:00Z",
              is_following_story: false,
              followed_last_seen_at: null,
            },
          ],
        };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };

  const state = await getSingleUserContentState(pool as any, "user-1", "editorial:primary");

  assert.equal(state.saved_state, "saved");
  assert.equal(state.saved_at, "2026-04-14T09:10:00Z");
  assert.equal(state.is_seen, true);
  assert.equal(state.story_followable, true);
});

test("setContentItemSavedState writes editorial state to the current family representative", async () => {
  const calls: Array<{ sql: string; params: unknown[] | undefined }> = [];
  const pool = {
    async query(sql: string, params?: unknown[]) {
      calls.push({ sql, params });
      if (sql.includes("with requested_editorial as")) {
        return {
          rows: [
            {
              requested_content_item_id: "editorial:duplicate",
              content_item_id: "editorial:primary",
            },
          ],
        };
      }
      if (sql.includes("insert into user_content_state")) {
        return { rows: [] };
      }
      if (sql.includes("where user_id = $1") && sql.includes("content_item_id = any($2::text[])")) {
        return {
          rows: [
            {
              content_item_id: "editorial:primary",
              first_seen_at: null,
              last_seen_at: null,
              saved_state: "saved",
              saved_at: "2026-04-14T09:10:00Z",
              archived_at: null,
            },
          ],
        };
      }
      if (sql.includes("with requested_editorial as")) {
        return { rows: [] };
      }
      if (sql.includes("latest.latest_content_at::text as latest_content_at")) {
        return {
          rows: [
            {
              origin_id: "primary",
              event_cluster_id: "cluster-1",
              latest_content_at: "2026-04-14T10:00:00Z",
              is_following_story: false,
              followed_last_seen_at: null,
            },
          ],
        };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };

  const state = await setContentItemSavedState(
    pool as any,
    "user-1",
    "editorial:duplicate",
    "saved"
  );

  const insertCall = calls.find((call) => call.sql.includes("insert into user_content_state"));
  assert.ok(insertCall);
  assert.deepEqual(insertCall?.params, ["user-1", "editorial:primary", "saved"]);
  assert.equal(state.saved_state, "saved");
});

test("listSavedContentItemRefs collapses historical editorial duplicates to the family representative", async () => {
  const pool = {
    async query(sql: string, params?: unknown[]) {
      if (sql.includes("saved_state = 'saved'")) {
        assert.deepEqual(params, ["user-1"]);
        return {
          rows: [
            { content_item_id: "editorial:duplicate-a", saved_at: "2026-04-14T11:00:00Z" },
            { content_item_id: "resource:3", saved_at: "2026-04-14T10:00:00Z" },
            { content_item_id: "editorial:duplicate-b", saved_at: "2026-04-14T09:00:00Z" },
          ],
        };
      }
      if (sql.includes("with requested_editorial as")) {
        return {
          rows: [
            {
              requested_content_item_id: "editorial:duplicate-a",
              content_item_id: "editorial:primary",
            },
            {
              requested_content_item_id: "editorial:duplicate-b",
              content_item_id: "editorial:primary",
            },
          ],
        };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };

  const response = await listSavedContentItemRefs(pool as any, "user-1", 1, 20);

  assert.equal(response.total, 2);
  assert.deepEqual(response.items, [
    { contentItemId: "editorial:primary", savedAt: "2026-04-14T11:00:00Z" },
    { contentItemId: "resource:3", savedAt: "2026-04-14T10:00:00Z" },
  ]);
});

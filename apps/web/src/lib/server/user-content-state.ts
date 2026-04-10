import type {
  ContentItemPreview,
  PaginatedResponse,
  UserContentSavedState,
  UserContentStateView,
} from "@newsportal/contracts";
import type { Pool } from "pg";

const DEFAULT_PAGE = 1;

interface UserContentStateRow {
  content_item_id: string;
  first_seen_at: string | null;
  last_seen_at: string | null;
  saved_state: UserContentSavedState | null;
  saved_at: string | null;
  archived_at: string | null;
}

interface EditorialFollowRow {
  origin_id: string;
  event_cluster_id: string | null;
  latest_content_at: string | null;
  is_following_story: boolean;
  followed_last_seen_at: string | null;
}

interface SavedContentItemRefRow {
  content_item_id: string;
  saved_at: string | null;
}

interface FollowedStoryRefRow {
  event_cluster_id: string;
  content_item_id: string;
  followed_at: string;
  last_seen_at: string | null;
  latest_content_at: string | null;
}

export interface SavedContentItemRef {
  contentItemId: string;
  savedAt: string | null;
}

export interface FollowedStoryRef {
  eventClusterId: string;
  contentItemId: string;
  followedAt: string;
  lastSeenAt: string | null;
  latestContentAt: string | null;
}

export const DEFAULT_USER_CONTENT_STATE: UserContentStateView = {
  is_new: true,
  is_seen: false,
  first_seen_at: null,
  seen_at: null,
  saved_state: "none",
  saved_at: null,
  archived_at: null,
  event_cluster_id: null,
  story_followable: false,
  is_following_story: false,
  story_updated_since_seen: false,
};

function parseContentItemId(
  contentItemId: string
): { originType: "editorial" | "resource" | null; originId: string | null } {
  const [originType, ...rest] = String(contentItemId ?? "").split(":");
  const originId = rest.join(":").trim();
  if (!originId || (originType !== "editorial" && originType !== "resource")) {
    return { originType: null, originId: null };
  }
  return {
    originType,
    originId,
  };
}

export function resolveStoryUpdated(
  latestContentAt: string | null,
  lastSeenAt: string | null
): boolean {
  if (!latestContentAt) {
    return false;
  }
  if (!lastSeenAt) {
    return true;
  }
  return new Date(latestContentAt).getTime() > new Date(lastSeenAt).getTime();
}

export function buildUserContentStateView(
  stateRow: UserContentStateRow | null | undefined,
  editorialRow: EditorialFollowRow | null | undefined
): UserContentStateView {
  const firstSeenAt = stateRow?.first_seen_at ?? null;
  const seenAt = stateRow?.last_seen_at ?? null;
  const savedState = stateRow?.saved_state ?? "none";
  const followedLastSeenAt = editorialRow?.followed_last_seen_at ?? null;
  const isFollowingStory = Boolean(editorialRow?.is_following_story);

  return {
    is_new: !firstSeenAt,
    is_seen: !!seenAt,
    first_seen_at: firstSeenAt,
    seen_at: seenAt,
    saved_state: savedState,
    saved_at: stateRow?.saved_at ?? null,
    archived_at: stateRow?.archived_at ?? null,
    event_cluster_id: editorialRow?.event_cluster_id ?? null,
    story_followable: !!editorialRow?.event_cluster_id,
    is_following_story: isFollowingStory,
    story_updated_since_seen:
      isFollowingStory &&
      resolveStoryUpdated(editorialRow?.latest_content_at ?? null, followedLastSeenAt),
  };
}

async function fetchStateRows(
  pool: Pool,
  userId: string,
  contentItemIds: string[]
): Promise<UserContentStateRow[]> {
  if (contentItemIds.length === 0) {
    return [];
  }

  const result = await pool.query<UserContentStateRow>(
    `
      select
        content_item_id,
        first_seen_at::text as first_seen_at,
        last_seen_at::text as last_seen_at,
        saved_state,
        saved_at::text as saved_at,
        archived_at::text as archived_at
      from user_content_state
      where user_id = $1
        and content_item_id = any($2::text[])
    `,
    [userId, contentItemIds]
  );
  return result.rows;
}

async function fetchEditorialRows(
  pool: Pool,
  userId: string,
  editorialOriginIds: string[]
): Promise<EditorialFollowRow[]> {
  if (editorialOriginIds.length === 0) {
    return [];
  }

  const result = await pool.query<EditorialFollowRow>(
    `
      select
        a.doc_id::text as origin_id,
        a.event_cluster_id::text as event_cluster_id,
        latest.latest_content_at::text as latest_content_at,
        (uf.event_cluster_id is not null) as is_following_story,
        uf.last_seen_at::text as followed_last_seen_at
        from articles a
        left join user_followed_event_clusters uf
          on uf.user_id = $1
       and uf.event_cluster_id = a.event_cluster_id
      left join lateral (
        select max(coalesce(a2.published_at, a2.ingested_at)) as latest_content_at
        from articles a2
        left join final_selection_results fsr on fsr.doc_id = a2.doc_id
        left join system_feed_results sfr on sfr.doc_id = a2.doc_id
        where a2.event_cluster_id = a.event_cluster_id
          and a2.visibility_state = 'visible'
          and coalesce(fsr.is_selected, coalesce(sfr.eligible_for_feed, false)) = true
      ) latest on true
      where a.doc_id = any($2::uuid[])
    `,
    [userId, editorialOriginIds]
  );
  return result.rows;
}

async function fetchSingleEditorialRow(
  pool: Pool,
  userId: string,
  contentItemId: string
): Promise<EditorialFollowRow | null> {
  const parsed = parseContentItemId(contentItemId);
  if (parsed.originType !== "editorial" || !parsed.originId) {
    return null;
  }

  const rows = await fetchEditorialRows(pool, userId, [parsed.originId]);
  return rows[0] ?? null;
}

async function fetchSingleStateRow(
  pool: Pool,
  userId: string,
  contentItemId: string
): Promise<UserContentStateRow | null> {
  const rows = await fetchStateRows(pool, userId, [contentItemId]);
  return rows[0] ?? null;
}

export async function getUserContentStateMap(
  pool: Pool,
  userId: string,
  items: ContentItemPreview[]
): Promise<Map<string, UserContentStateView>> {
  const contentItemIds = items
    .map((item) => String(item.content_item_id ?? "").trim())
    .filter(Boolean);
  const editorialOriginIds = items
    .filter((item) => item.origin_type === "editorial")
    .map((item) => String(item.origin_id ?? "").trim())
    .filter(Boolean);

  const [stateRows, editorialRows] = await Promise.all([
    fetchStateRows(pool, userId, contentItemIds),
    fetchEditorialRows(pool, userId, editorialOriginIds),
  ]);

  const stateMap = new Map(stateRows.map((row) => [row.content_item_id, row]));
  const editorialMap = new Map(editorialRows.map((row) => [row.origin_id, row]));

  return new Map(
    items.map((item) => {
      const contentItemId = String(item.content_item_id ?? "").trim();
      const editorialRow =
        item.origin_type === "editorial"
          ? editorialMap.get(String(item.origin_id ?? "").trim())
          : null;
      return [
        contentItemId,
        buildUserContentStateView(stateMap.get(contentItemId) ?? null, editorialRow ?? null),
      ];
    })
  );
}

export async function getSingleUserContentState(
  pool: Pool,
  userId: string,
  contentItemId: string
): Promise<UserContentStateView> {
  const [stateRow, editorialRow] = await Promise.all([
    fetchSingleStateRow(pool, userId, contentItemId),
    fetchSingleEditorialRow(pool, userId, contentItemId),
  ]);
  return buildUserContentStateView(stateRow, editorialRow);
}

async function resolveEditorialClusterId(
  pool: Pool,
  contentItemId: string
): Promise<string | null> {
  const parsed = parseContentItemId(contentItemId);
  if (parsed.originType !== "editorial" || !parsed.originId) {
    return null;
  }

  const result = await pool.query<{ event_cluster_id: string | null }>(
    `
      select event_cluster_id::text as event_cluster_id
      from articles
      where doc_id = $1::uuid
      limit 1
    `,
    [parsed.originId]
  );
  return result.rows[0]?.event_cluster_id ?? null;
}

export async function markContentItemSeen(
  pool: Pool,
  userId: string,
  contentItemId: string
): Promise<UserContentStateView> {
  const clusterId = await resolveEditorialClusterId(pool, contentItemId);
  await pool.query(
    `
      insert into user_content_state (
        user_id,
        content_item_id,
        first_seen_at,
        last_seen_at
      )
      values ($1, $2, now(), now())
      on conflict (user_id, content_item_id) do update
      set
        first_seen_at = coalesce(user_content_state.first_seen_at, excluded.first_seen_at),
        last_seen_at = excluded.last_seen_at,
        updated_at = now()
    `,
    [userId, contentItemId]
  );

  if (clusterId) {
    await pool.query(
      `
        update user_followed_event_clusters
        set
          last_seen_at = now(),
          updated_at = now()
        where user_id = $1
          and event_cluster_id = $2::uuid
      `,
      [userId, clusterId]
    );
  }

  return getSingleUserContentState(pool, userId, contentItemId);
}

export async function markContentItemUnread(
  pool: Pool,
  userId: string,
  contentItemId: string
): Promise<UserContentStateView> {
  await pool.query(
    `
      insert into user_content_state (
        user_id,
        content_item_id,
        first_seen_at,
        last_seen_at
      )
      values ($1, $2, now(), null)
      on conflict (user_id, content_item_id) do update
      set
        first_seen_at = coalesce(user_content_state.first_seen_at, excluded.first_seen_at),
        last_seen_at = null,
        updated_at = now()
    `,
    [userId, contentItemId]
  );

  return getSingleUserContentState(pool, userId, contentItemId);
}

export async function setContentItemSavedState(
  pool: Pool,
  userId: string,
  contentItemId: string,
  savedState: UserContentSavedState
): Promise<UserContentStateView> {
  if (!["none", "saved", "archived"].includes(savedState)) {
    throw new Error(`Unsupported saved state "${savedState}".`);
  }

  await pool.query(
    `
      insert into user_content_state (
        user_id,
        content_item_id,
        saved_state,
        saved_at,
        archived_at
      )
      values (
        $1,
        $2,
        $3,
        case when $3 = 'saved' then now() when $3 = 'archived' then now() else null end,
        case when $3 = 'archived' then now() else null end
      )
      on conflict (user_id, content_item_id) do update
      set
        saved_state = excluded.saved_state,
        saved_at = case
          when excluded.saved_state = 'saved' then now()
          when excluded.saved_state = 'archived' then coalesce(user_content_state.saved_at, now())
          else null
        end,
        archived_at = case
          when excluded.saved_state = 'archived' then now()
          else null
        end,
        updated_at = now()
    `,
    [userId, contentItemId, savedState]
  );

  return getSingleUserContentState(pool, userId, contentItemId);
}

export async function setStoryFollowState(
  pool: Pool,
  userId: string,
  contentItemId: string,
  follow: boolean
): Promise<UserContentStateView> {
  const clusterId = await resolveEditorialClusterId(pool, contentItemId);
  if (!clusterId) {
    throw new Error("This content item does not belong to a followable story.");
  }

  if (follow) {
    await pool.query(
      `
        insert into user_followed_event_clusters (
          user_id,
          event_cluster_id,
          followed_at,
          last_seen_at
        )
        values ($1, $2::uuid, now(), now())
        on conflict (user_id, event_cluster_id) do update
        set
          followed_at = now(),
          last_seen_at = coalesce(user_followed_event_clusters.last_seen_at, now()),
          updated_at = now()
      `,
      [userId, clusterId]
    );
  } else {
    await pool.query(
      `
        delete from user_followed_event_clusters
        where user_id = $1
          and event_cluster_id = $2::uuid
      `,
      [userId, clusterId]
    );
  }

  return getSingleUserContentState(pool, userId, contentItemId);
}

function buildPaginatedResponse<T>(
  items: T[],
  page: number,
  pageSize: number,
  total: number
): PaginatedResponse<T> {
  const safePageSize = Math.max(1, pageSize);
  const totalPages = Math.max(1, Math.ceil(total / safePageSize));
  const safePage = Math.min(Math.max(page, DEFAULT_PAGE), totalPages);
  return {
    items,
    page: safePage,
    pageSize: safePageSize,
    total,
    totalPages,
    hasPrev: safePage > DEFAULT_PAGE,
    hasNext: safePage < totalPages,
  };
}

export async function listSavedContentItemRefs(
  pool: Pool,
  userId: string,
  page: number,
  pageSize: number
): Promise<PaginatedResponse<SavedContentItemRef>> {
  const safePageSize = Math.max(1, pageSize);
  const safePage = Math.max(DEFAULT_PAGE, page);
  const offset = (safePage - 1) * safePageSize;

  const [totalResult, itemsResult] = await Promise.all([
    pool.query<{ total: number }>(
      `
        select count(*)::int as total
        from user_content_state
        where user_id = $1
          and saved_state = 'saved'
      `,
      [userId]
    ),
    pool.query<SavedContentItemRefRow>(
      `
        select
          content_item_id,
          saved_at::text as saved_at
        from user_content_state
        where user_id = $1
          and saved_state = 'saved'
        order by saved_at desc nulls last, updated_at desc, content_item_id
        limit $2
        offset $3
      `,
      [userId, safePageSize, offset]
    ),
  ]);

  return buildPaginatedResponse(
    itemsResult.rows.map((row) => ({
      contentItemId: row.content_item_id,
      savedAt: row.saved_at,
    })),
    safePage,
    safePageSize,
    totalResult.rows[0]?.total ?? 0
  );
}

export async function listFollowedStoryRefs(
  pool: Pool,
  userId: string,
  page: number,
  pageSize: number
): Promise<PaginatedResponse<FollowedStoryRef>> {
  const safePageSize = Math.max(1, pageSize);
  const safePage = Math.max(DEFAULT_PAGE, page);
  const offset = (safePage - 1) * safePageSize;

  const [totalResult, itemsResult] = await Promise.all([
    pool.query<{ total: number }>(
      `
        select count(*)::int as total
        from user_followed_event_clusters
        where user_id = $1
      `,
      [userId]
    ),
    pool.query<FollowedStoryRefRow>(
      `
        with ranked_cluster_items as (
          select
            uf.event_cluster_id::text as event_cluster_id,
            'editorial:' || a.doc_id::text as content_item_id,
            uf.followed_at::text as followed_at,
            uf.last_seen_at::text as last_seen_at,
            max(coalesce(a.published_at, a.ingested_at)) over (
              partition by uf.event_cluster_id
            )::text as latest_content_at,
            row_number() over (
              partition by uf.event_cluster_id
              order by
                a.published_at desc nulls last,
                a.ingested_at desc,
                a.doc_id
            ) as row_number
          from user_followed_event_clusters uf
          join articles a on a.event_cluster_id = uf.event_cluster_id
          left join final_selection_results fsr on fsr.doc_id = a.doc_id
          left join system_feed_results sfr on sfr.doc_id = a.doc_id
          where uf.user_id = $1
            and a.visibility_state = 'visible'
            and coalesce(fsr.is_selected, coalesce(sfr.eligible_for_feed, false)) = true
        )
        select
          event_cluster_id,
          content_item_id,
          followed_at,
          last_seen_at,
          latest_content_at
        from ranked_cluster_items
        where row_number = 1
        order by latest_content_at desc nulls last, content_item_id
        limit $2
        offset $3
      `,
      [userId, safePageSize, offset]
    ),
  ]);

  return buildPaginatedResponse(
    itemsResult.rows.map((row) => ({
      eventClusterId: row.event_cluster_id,
      contentItemId: row.content_item_id,
      followedAt: row.followed_at,
      lastSeenAt: row.last_seen_at,
      latestContentAt: row.latest_content_at,
    })),
    safePage,
    safePageSize,
    totalResult.rows[0]?.total ?? 0
  );
}

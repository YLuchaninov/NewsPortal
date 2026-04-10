import type { Pool } from "pg";

export type SourceChannelDeleteMode = "delete" | "archive";

export interface DeleteOrArchiveSourceChannelResult {
  mode: SourceChannelDeleteMode;
  storedItemCount: number;
  providerType: string;
}

function resolveSourceChannelDeleteMode(storedItemCount: number): SourceChannelDeleteMode {
  return storedItemCount > 0 ? "archive" : "delete";
}

export async function deleteOrArchiveSourceChannel(
  pool: Pool,
  channelId: string
): Promise<DeleteOrArchiveSourceChannelResult> {
  const client = await pool.connect();

  try {
    await client.query("begin");

    const channelLookup = await client.query<{
      stored_item_count: number;
      provider_type: string;
    }>(
      `
        select
          sc.provider_type,
          (
            coalesce(
              (
                select count(*)::int
                from articles a
                where a.channel_id = sc.channel_id
              ),
              0
            )
            +
            coalesce(
              (
                select count(*)::int
                from web_resources wr
                where wr.channel_id = sc.channel_id
                  and wr.projected_article_id is null
              ),
              0
            )
          )::int as stored_item_count
        from source_channels sc
        where sc.channel_id = $1
        limit 1
      `,
      [channelId]
    );

    const channel = channelLookup.rows[0];
    if (!channel) {
      throw new Error(`Channel ${channelId} was not found.`);
    }

    const mode = resolveSourceChannelDeleteMode(channel.stored_item_count);
    if (mode === "archive") {
      await client.query(
        `
          update source_channels
          set
            is_active = false,
            updated_at = now()
          where channel_id = $1
        `,
        [channelId]
      );
      await client.query(
        `
          update source_channel_runtime_state
          set
            next_due_at = null,
            adaptive_reason = 'archived_from_admin',
            updated_at = now()
          where channel_id = $1
        `,
        [channelId]
      );
    } else {
      const deleted = await client.query(
        `
          delete from source_channels
          where channel_id = $1
          returning channel_id
        `,
        [channelId]
      );
      if (deleted.rowCount !== 1) {
        throw new Error(`Channel ${channelId} was not found.`);
      }
    }

    await client.query("commit");

    return {
      mode,
      storedItemCount: channel.stored_item_count,
      providerType: channel.provider_type
    };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

import type { Pool, PoolClient } from "pg";

import type {
  CrawlPolicyCacheRow,
  WebsiteCachedTextResponseState,
  WebsiteConditionalRequestState
} from "./web-ingestion-types";

type QueryExecutor = Pick<Pool | PoolClient, "query">;

export class CrawlPolicyCacheRepository {
  constructor(private readonly pool: Pool) {}

  async loadRow(domain: string, executor: QueryExecutor = this.pool): Promise<CrawlPolicyCacheRow | null> {
    const result = await executor.query<CrawlPolicyCacheRow>(
      `
        select
          domain,
          robots_txt_url,
          robots_txt_body,
          sitemap_urls,
          feed_urls,
          llms_txt_url,
          llms_txt_body,
          request_validators_json,
          response_cache_json,
          fetched_at::text,
          expires_at::text,
          fetch_error,
          http_status
        from crawl_policy_cache
        where domain = $1
        limit 1
      `,
      [domain]
    );
    return result.rows[0] ?? null;
  }

  async refreshRowWithDomainLock(
    domain: string,
    isFresh: (row: CrawlPolicyCacheRow) => boolean,
    refresh: (previousRow: CrawlPolicyCacheRow | null) => Promise<CrawlPolicyCacheRow>
  ): Promise<CrawlPolicyCacheRow> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("select pg_advisory_xact_lock(hashtext($1))", [domain]);

      const insideTransaction = await this.loadRow(domain, client);
      if (insideTransaction && isFresh(insideTransaction)) {
        await client.query("commit");
        return insideTransaction;
      }

      const row = await refresh(insideTransaction);
      await this.upsertRow(client, row);
      await client.query("commit");
      return row;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async persistConditionalState(
    rawUrl: string,
    state: {
      requestValidators: Record<string, WebsiteConditionalRequestState>;
      responseCache: Record<string, WebsiteCachedTextResponseState>;
    }
  ): Promise<void> {
    const domain = new URL(rawUrl).hostname.toLowerCase();
    await this.pool.query(
      `
        update crawl_policy_cache
        set
          request_validators_json = $2::jsonb,
          response_cache_json = $3::jsonb
        where domain = $1
      `,
      [domain, JSON.stringify(state.requestValidators), JSON.stringify(state.responseCache)]
    );
  }

  private async upsertRow(client: PoolClient, row: CrawlPolicyCacheRow): Promise<void> {
    await client.query(
      `
        insert into crawl_policy_cache (
          domain,
          robots_txt_url,
          robots_txt_body,
          sitemap_urls,
          feed_urls,
          llms_txt_url,
          llms_txt_body,
          request_validators_json,
          response_cache_json,
          fetched_at,
          expires_at,
          fetch_error,
          http_status
        )
        values ($1, $2, $3, $4::text[], $5::text[], $6, $7, $8::jsonb, $9::jsonb, $10, $11, $12, $13)
        on conflict (domain)
        do update
        set
          robots_txt_url = excluded.robots_txt_url,
          robots_txt_body = excluded.robots_txt_body,
          sitemap_urls = excluded.sitemap_urls,
          feed_urls = excluded.feed_urls,
          llms_txt_url = excluded.llms_txt_url,
          llms_txt_body = excluded.llms_txt_body,
          request_validators_json = excluded.request_validators_json,
          response_cache_json = excluded.response_cache_json,
          fetched_at = excluded.fetched_at,
          expires_at = excluded.expires_at,
          fetch_error = excluded.fetch_error,
          http_status = excluded.http_status
      `,
      [
        row.domain,
        row.robots_txt_url,
        row.robots_txt_body,
        row.sitemap_urls,
        row.feed_urls,
        row.llms_txt_url,
        row.llms_txt_body,
        JSON.stringify(row.request_validators_json ?? {}),
        JSON.stringify(row.response_cache_json ?? {}),
        row.fetched_at,
        row.expires_at,
        row.fetch_error,
        row.http_status
      ]
    );
  }
}

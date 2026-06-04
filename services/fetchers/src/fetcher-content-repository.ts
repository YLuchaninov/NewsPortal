import { randomUUID } from "node:crypto";

import {
  ARTICLE_INGEST_REQUESTED_EVENT,
  RESOURCE_INGEST_REQUESTED_EVENT
} from "@signalops/contracts";
import type { Pool, PoolClient } from "pg";

import { upsertArticleObservation } from "./document-observations";
import {
  classifyDuplicatePreflightInputs,
  type PersistArticleInput,
  type PersistResourceInput
} from "./fetcher-persistence-types";

function uniqueNonEmpty(values: Iterable<string>): string[] {
  return [...new Set([...values].map((value) => value.trim()).filter(Boolean))];
}

export class FetcherContentRepository {
  constructor(private readonly pool: Pool) {}

  async persistArticlesWithPreflight(
    channelId: string,
    inputs: readonly PersistArticleInput[]
  ): Promise<{ ingestedCount: number; duplicateCount: number }> {
    const { pendingInputs, duplicateCount: preflightDuplicateCount } =
      await this.filterDuplicatePreflightInputs(channelId, inputs);
    let ingestedCount = 0;
    let duplicateCount = preflightDuplicateCount;

    for (const input of pendingInputs) {
      const persisted = await this.persistArticle(input);
      if (persisted) {
        ingestedCount += 1;
      } else {
        duplicateCount += 1;
      }
    }

    return {
      ingestedCount,
      duplicateCount
    };
  }

  async persistWebsiteResourcesWithPreflight(
    channelId: string,
    inputs: readonly PersistResourceInput[]
  ): Promise<{ ingestedCount: number; duplicateCount: number }> {
    const { pendingInputs, duplicateCount: preflightDuplicateCount } =
      await this.filterDuplicateWebsiteResourceInputs(channelId, inputs);
    let ingestedCount = 0;
    let duplicateCount = preflightDuplicateCount;

    for (const input of pendingInputs) {
      const persisted = await this.persistWebsiteResource(input);
      if (persisted) {
        ingestedCount += 1;
      } else {
        duplicateCount += 1;
      }
    }

    return {
      ingestedCount,
      duplicateCount
    };
  }

  private async filterDuplicatePreflightInputs<T extends PersistArticleInput>(
    channelId: string,
    inputs: readonly T[]
  ): Promise<{ pendingInputs: T[]; duplicateCount: number }> {
    if (inputs.length === 0) {
      return {
        pendingInputs: [],
        duplicateCount: 0
      };
    }

    const knownExternalArticleIds = uniqueNonEmpty(inputs.map((input) => input.externalArticleId));
    const knownUrls = uniqueNonEmpty(inputs.map((input) => input.url));

    const [externalRefResult, articleUrlResult] = await Promise.all([
      knownExternalArticleIds.length > 0
        ? this.pool.query<{ externalArticleId: string }>(
            `
              select external_article_id as "externalArticleId"
              from article_external_refs
              where
                channel_id = $1
                and external_article_id = any($2::text[])
            `,
            [channelId, knownExternalArticleIds]
          )
        : Promise.resolve({ rows: [] } as { rows: Array<{ externalArticleId: string }> }),
      knownUrls.length > 0
        ? this.pool.query<{ url: string }>(
            `
              select url
              from articles
              where
                channel_id = $1
                and url = any($2::text[])
            `,
            [channelId, knownUrls]
          )
        : Promise.resolve({ rows: [] } as { rows: Array<{ url: string }> })
    ]);

    const decisions = classifyDuplicatePreflightInputs(
      inputs,
      new Set(externalRefResult.rows.map((row) => row.externalArticleId)),
      new Set(articleUrlResult.rows.map((row) => row.url))
    );

    return {
      pendingInputs: decisions
        .filter((decision) => decision.shouldPersist)
        .map((decision) => decision.input),
      duplicateCount: decisions.filter((decision) => !decision.shouldPersist).length
    };
  }

  private async filterDuplicateWebsiteResourceInputs<T extends PersistResourceInput>(
    channelId: string,
    inputs: readonly T[]
  ): Promise<{ pendingInputs: T[]; duplicateCount: number }> {
    if (inputs.length === 0) {
      return {
        pendingInputs: [],
        duplicateCount: 0
      };
    }

    const knownExternalResourceIds = uniqueNonEmpty(inputs.map((input) => input.externalArticleId));
    const knownUrls = uniqueNonEmpty(inputs.map((input) => input.url));

    const [externalRefResult, resourceUrlResult] = await Promise.all([
      knownExternalResourceIds.length > 0
        ? this.pool.query<{ externalResourceId: string }>(
            `
              select external_resource_id as "externalResourceId"
              from web_resources
              where
                channel_id = $1
                and external_resource_id = any($2::text[])
            `,
            [channelId, knownExternalResourceIds]
          )
        : Promise.resolve({ rows: [] } as { rows: Array<{ externalResourceId: string }> }),
      knownUrls.length > 0
        ? this.pool.query<{ normalizedUrl: string }>(
            `
              select normalized_url as "normalizedUrl"
              from web_resources
              where
                channel_id = $1
                and normalized_url = any($2::text[])
            `,
            [channelId, knownUrls]
          )
        : Promise.resolve({ rows: [] } as { rows: Array<{ normalizedUrl: string }> })
    ]);

    const decisions = classifyDuplicatePreflightInputs(
      inputs,
      new Set(externalRefResult.rows.map((row) => row.externalResourceId)),
      new Set(resourceUrlResult.rows.map((row) => row.normalizedUrl))
    );

    return {
      pendingInputs: decisions
        .filter((decision) => decision.shouldPersist)
        .map((decision) => decision.input),
      duplicateCount: decisions.filter((decision) => !decision.shouldPersist).length
    };
  }

  private async persistArticle(input: PersistArticleInput): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const insertResult = await client.query<{ docId: string }>(
        `
          insert into articles (
            channel_id,
            source_article_id,
            url,
            content_kind,
            content_format,
            published_at,
            title,
            lead,
            body,
            lang,
            lang_confidence,
            raw_payload_json
          )
          values (
            $1,
            $2,
            $3,
            'editorial',
            'article',
            $4,
            $5,
            $6,
            $7,
            $8,
            $9,
            $10::jsonb
          )
          on conflict do nothing
          returning doc_id::text as "docId"
        `,
        [
          input.channel.channelId,
          input.externalArticleId,
          input.url,
          input.publishedAt,
          input.title,
          input.lead,
          input.body,
          input.lang,
          input.confidence,
          JSON.stringify(input.rawPayload)
        ]
      );
      const insertedArticle = insertResult.rows[0];
      if (!insertedArticle) {
        await client.query("rollback");
        return false;
      }

      await client.query(
        `
          insert into article_external_refs (
            external_ref_id,
            channel_id,
            external_article_id,
            doc_id
          )
          values ($1, $2, $3, $4)
          on conflict (channel_id, external_article_id) do nothing
        `,
        [randomUUID(), input.channel.channelId, input.externalArticleId, insertedArticle.docId]
      );
      await upsertArticleObservation(client, insertedArticle.docId);
      await this.insertOutboxEvent(client, ARTICLE_INGEST_REQUESTED_EVENT, "article", insertedArticle.docId, {
        docId: insertedArticle.docId,
        version: 1
      });
      await client.query("commit");
      return true;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  private async persistWebsiteResource(input: PersistResourceInput): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");

      const existing = await client.query<{
        resourceId: string;
        freshnessMarkerValue: string | null;
        discoverySource: string;
      }>(
        `
          select
            resource_id::text as "resourceId",
            freshness_marker_value as "freshnessMarkerValue",
            discovery_source as "discoverySource"
          from web_resources
          where channel_id = $1 and normalized_url = $2
          limit 1
        `,
        [input.channel.channelId, input.url]
      );
      const existingRow = existing.rows[0];
      if (existingRow) {
        const freshnessChanged =
          (existingRow.freshnessMarkerValue ?? "") !== (input.freshnessMarkerValue ?? "") ||
          existingRow.discoverySource !== input.discoverySource;
        if (!freshnessChanged) {
          await client.query("rollback");
          return false;
        }

        await client.query(
          `
            update web_resources
            set
              title = $3,
              summary = $4,
              resource_kind = $5,
              discovery_source = $6,
              freshness_marker_type = $7,
              freshness_marker_value = $8,
              published_at = $9,
              modified_at = $10,
              classification_json = $11::jsonb,
              raw_payload_json = $12::jsonb,
              extraction_state = 'pending',
              extraction_error = null,
              projection_state = 'pending',
              projection_error = null,
              projected_article_id = null,
              updated_at = now()
            where resource_id = $1 and channel_id = $2
          `,
          [
            existingRow.resourceId,
            input.channel.channelId,
            input.title,
            input.summary,
            input.resourceKind,
            input.discoverySource,
            input.freshnessMarkerType,
            input.freshnessMarkerValue,
            input.publishedAt,
            input.modifiedAt,
            JSON.stringify(input.classificationJson),
            JSON.stringify(input.rawPayload)
          ]
        );
        await this.insertOutboxEvent(client, RESOURCE_INGEST_REQUESTED_EVENT, "resource", existingRow.resourceId, {
          resourceId: existingRow.resourceId,
          version: 1
        });
        await client.query("commit");
        return true;
      }

      const insertResult = await client.query<{ resourceId: string }>(
        `
          insert into web_resources (
            channel_id,
            external_resource_id,
            url,
            normalized_url,
            resource_kind,
            discovery_source,
            freshness_marker_type,
            freshness_marker_value,
            published_at,
            modified_at,
            title,
            summary,
            classification_json,
            raw_payload_json,
            projection_state,
            projection_error
          )
          values (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8,
            $9,
            $10,
            $11,
            $12,
            $13::jsonb,
            $14::jsonb,
            'pending',
            null
          )
          on conflict do nothing
          returning resource_id::text as "resourceId"
        `,
        [
          input.channel.channelId,
          input.externalArticleId,
          input.url,
          input.url,
          input.resourceKind,
          input.discoverySource,
          input.freshnessMarkerType,
          input.freshnessMarkerValue,
          input.publishedAt,
          input.modifiedAt,
          input.title,
          input.summary,
          JSON.stringify(input.classificationJson),
          JSON.stringify(input.rawPayload)
        ]
      );
      const insertedResource = insertResult.rows[0];
      if (!insertedResource) {
        await client.query("rollback");
        return false;
      }

      await this.insertOutboxEvent(client, RESOURCE_INGEST_REQUESTED_EVENT, "resource", insertedResource.resourceId, {
        resourceId: insertedResource.resourceId,
        version: 1
      });
      await client.query("commit");
      return true;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  private async insertOutboxEvent(
    client: PoolClient,
    eventType: string,
    aggregateType: string,
    aggregateId: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    await client.query(
      `
        insert into outbox_events (
          event_id,
          event_type,
          aggregate_type,
          aggregate_id,
          payload_json
        )
        values ($1, $2, $3, $4, $5::jsonb)
      `,
      [randomUUID(), eventType, aggregateType, aggregateId, JSON.stringify(payload)]
    );
  }
}

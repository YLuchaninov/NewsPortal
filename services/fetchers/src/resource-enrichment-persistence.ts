import { randomUUID } from "node:crypto";

import { ARTICLE_INGEST_REQUESTED_EVENT, type ResourceKind } from "@signalops/contracts";
import type { Pool, PoolClient } from "pg";

import type { FetchersConfig } from "./config";
import { upsertArticleObservation } from "./document-observations";
import { resolveProjectionDecision } from "./resource-enrichment-projection";
import {
  asArray,
  asRecord,
  computeContentHash,
} from "./resource-enrichment-extraction";

type ExtractionState = "pending" | "skipped" | "enriched" | "failed";

export interface WebResourceRow {
  resourceId: string;
  channelId: string;
  externalResourceId: string | null;
  url: string;
  normalizedUrl: string;
  finalUrl: string | null;
  resourceKind: string;
  title: string;
  summary: string;
  body: string | null;
  bodyHtml: string | null;
  lang: string | null;
  langConfidence: number | null;
  publishedAt: string | null;
  modifiedAt: string | null;
  classificationJson: Record<string, unknown>;
  attributesJson: Record<string, unknown>;
  documentsJson: unknown[];
  mediaJson: unknown[];
  childResourcesJson: unknown[];
  linksOutJson: unknown[];
  rawPayloadJson: Record<string, unknown>;
  extractionState: string;
  extractionError: string | null;
  projectedArticleId: string | null;
  channelName: string;
  userAgent: string;
  requestTimeoutMs: number;
  minEditorialBodyLength: number;
}

export interface ExtractionPersistShape {
  status: Exclude<ExtractionState, "pending">;
  resourceKind: ResourceKind;
  finalUrl: string;
  title: string;
  summary: string;
  body: string | null;
  bodyHtml: string | null;
  lang: string | null;
  langConfidence: number | null;
  publishedAt: string | null;
  modifiedAt: string | null;
  classificationJson: Record<string, unknown>;
  attributesJson: Record<string, unknown>;
  documentsJson: unknown[];
  mediaJson: unknown[];
  childResourcesJson: unknown[];
  linksOutJson: unknown[];
  contentHash: string | null;
  errorText: string | null;
  projectedDocId: string | null;
}

export interface ResourceEnrichmentPersistResult {
  status: "skipped" | "enriched" | "failed";
  resource_id: string;
  resource_kind: ResourceKind;
  extraction_state: Exclude<ExtractionState, "pending">;
  projected_doc_id: string | null;
  documents_count: number;
  media_count: number;
  error?: string | null;
}

function resolveResourceKind(rawKind: string): ResourceKind {
  return (["editorial", "listing", "entity", "document", "data_file", "api_payload", "unknown"] as const).includes(
    rawKind as ResourceKind
  )
    ? (rawKind as ResourceKind)
    : "unknown";
}

export function buildPersistedExtraction(resource: WebResourceRow): ExtractionPersistShape {
  return {
    status:
      resource.extractionState === "failed"
        ? "failed"
        : resource.extractionState === "skipped"
          ? "skipped"
          : "enriched",
    resourceKind: resolveResourceKind(resource.resourceKind),
    finalUrl: resource.finalUrl ?? resource.url,
    title: resource.title,
    summary: resource.summary,
    body: resource.body,
    bodyHtml: resource.bodyHtml,
    lang: resource.lang,
    langConfidence: resource.langConfidence,
    publishedAt: resource.publishedAt,
    modifiedAt: resource.modifiedAt,
    classificationJson: resource.classificationJson,
    attributesJson: resource.attributesJson,
    documentsJson: asArray(resource.documentsJson),
    mediaJson: asArray(resource.mediaJson),
    childResourcesJson: asArray(resource.childResourcesJson),
    linksOutJson: asArray(resource.linksOutJson),
    contentHash: resource.body ? computeContentHash(resource.body) : null,
    errorText: resource.extractionError,
    projectedDocId: resource.projectedArticleId,
  };
}

export class ResourceEnrichmentRepository {
  constructor(
    private readonly pool: Pool,
    private readonly config: Pick<FetchersConfig, "defaultUserAgent" | "defaultRequestTimeoutMs">,
  ) {}

  async loadResource(resourceId: string): Promise<WebResourceRow | null> {
    const result = await this.pool.query<WebResourceRow>(
      `
        select
          wr.resource_id::text as "resourceId",
          wr.channel_id::text as "channelId",
          wr.external_resource_id as "externalResourceId",
          wr.url,
          wr.normalized_url as "normalizedUrl",
          wr.final_url as "finalUrl",
          wr.resource_kind as "resourceKind",
          wr.title,
          wr.summary,
          wr.body,
          wr.body_html as "bodyHtml",
          wr.lang,
          wr.lang_confidence as "langConfidence",
          wr.published_at::text as "publishedAt",
          wr.modified_at::text as "modifiedAt",
          wr.classification_json as "classificationJson",
          wr.attributes_json as "attributesJson",
          wr.documents_json as "documentsJson",
          wr.media_json as "mediaJson",
          wr.child_resources_json as "childResourcesJson",
          wr.links_out_json as "linksOutJson",
          wr.raw_payload_json as "rawPayloadJson",
          wr.extraction_state as "extractionState",
          wr.extraction_error as "extractionError",
          wr.projected_article_id::text as "projectedArticleId",
          sc.name as "channelName",
          coalesce(sc.config_json ->> 'userAgent', $2) as "userAgent",
          coalesce((sc.config_json ->> 'requestTimeoutMs')::int, $3) as "requestTimeoutMs",
          coalesce((sc.config_json #>> '{extraction,minEditorialBodyLength}')::int, 500) as "minEditorialBodyLength"
        from web_resources wr
        join source_channels sc on sc.channel_id = wr.channel_id
        where wr.resource_id = $1
        limit 1
      `,
      [resourceId, this.config.defaultUserAgent, this.config.defaultRequestTimeoutMs],
    );

    return result.rows[0] ?? null;
  }

  async persistExtraction(
    resource: WebResourceRow,
    extraction: ExtractionPersistShape,
  ): Promise<ResourceEnrichmentPersistResult> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      let projectedDocId = extraction.projectedDocId;
      const projectionDecision = resolveProjectionDecision(extraction);
      if (projectionDecision.shouldProject) {
        projectedDocId = await this.ensureProjectedArticle(
          client,
          resource,
          extraction,
          projectionDecision.body,
        );
      }
      const projectionState =
        projectionDecision.shouldProject && projectedDocId
          ? "projected_to_common_pipeline"
          : projectionDecision.shouldProject
          ? "explicitly_rejected_before_pipeline"
          : projectionDecision.projectionState;
      const projectionError =
        projectionDecision.shouldProject && projectedDocId
          ? null
          : projectionDecision.shouldProject
          ? "projection_insert_failed"
          : projectionDecision.projectionError;

      await client.query(
        `
          update web_resources
          set
            final_url = $2,
            resource_kind = $3,
            title = $4,
            summary = $5,
            body = $6,
            body_html = $7,
            lang = $8,
            lang_confidence = $9,
            published_at = $10,
            modified_at = $11,
            classification_json = $12::jsonb,
            attributes_json = $13::jsonb,
            documents_json = $14::jsonb,
            media_json = $15::jsonb,
            child_resources_json = $16::jsonb,
            links_out_json = $17::jsonb,
            content_hash = $18,
            extraction_state = $19,
            extraction_error = $20,
            projected_article_id = $21,
            projection_state = $22,
            projection_error = $23,
            enriched_at = case when $19 = 'enriched' then now() else enriched_at end,
            updated_at = now()
          where resource_id = $1
        `,
        [
          resource.resourceId,
          extraction.finalUrl,
          extraction.resourceKind,
          extraction.title,
          extraction.summary,
          extraction.body,
          extraction.bodyHtml,
          extraction.lang,
          extraction.langConfidence,
          extraction.publishedAt,
          extraction.modifiedAt,
          JSON.stringify(extraction.classificationJson),
          JSON.stringify(extraction.attributesJson),
          JSON.stringify(extraction.documentsJson),
          JSON.stringify(extraction.mediaJson),
          JSON.stringify(extraction.childResourcesJson),
          JSON.stringify(extraction.linksOutJson),
          extraction.contentHash,
          extraction.status,
          extraction.errorText,
          projectedDocId,
          projectionState,
          projectionError,
        ],
      );

      await client.query("commit");
      return {
        status: extraction.status === "failed" ? "failed" : extraction.status,
        resource_id: resource.resourceId,
        resource_kind: extraction.resourceKind,
        extraction_state: extraction.status,
        projected_doc_id: projectedDocId,
        documents_count: extraction.documentsJson.length,
        media_count: extraction.mediaJson.length,
        error: extraction.errorText ?? projectionError,
      };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  private async ensureProjectedArticle(
    client: PoolClient,
    resource: WebResourceRow,
    extraction: ExtractionPersistShape,
    projectedBody: string,
  ): Promise<string | null> {
    const sourceArticleId = resource.externalResourceId ?? resource.normalizedUrl;
    const publishedAt = extraction.publishedAt ?? resource.publishedAt ?? new Date().toISOString();
    const articlePayload = JSON.stringify({
      fetcher: "resource_projection",
      websiteAcquisition: {
        resourceId: resource.resourceId,
        normalizedUrl: resource.normalizedUrl,
        finalUrl: extraction.finalUrl,
        discoverySource:
          asRecord(resource.rawPayloadJson.discovery).discoverySource ??
          resource.rawPayloadJson.discoverySource ??
          null,
        resourceKind: extraction.resourceKind,
      },
      resource: {
        resourceId: resource.resourceId,
        normalizedUrl: resource.normalizedUrl,
        resourceKind: extraction.resourceKind,
      },
    });
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
          $4,
          'article',
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11::jsonb
        )
        on conflict do nothing
        returning doc_id::text as "docId"
      `,
      [
        resource.channelId,
        sourceArticleId,
        extraction.finalUrl,
        extraction.resourceKind,
        publishedAt,
        extraction.title,
        extraction.summary,
        projectedBody,
        extraction.lang,
        extraction.langConfidence,
        articlePayload,
      ],
    );
    let docId = insertResult.rows[0]?.docId ?? null;
    if (!docId) {
      const existing = await client.query<{ docId: string }>(
        `
          update articles
          set
            content_kind = $4,
            published_at = $5,
            title = $6,
            lead = $7,
            body = $8,
            lang = $9,
            lang_confidence = $10,
            raw_payload_json = raw_payload_json || $11::jsonb,
            updated_at = now()
          where channel_id = $1
            and (
              source_article_id = $2
              or url = $3
            )
          returning doc_id::text as "docId"
        `,
        [
          resource.channelId,
          sourceArticleId,
          extraction.finalUrl,
          extraction.resourceKind,
          publishedAt,
          extraction.title,
          extraction.summary,
          projectedBody,
          extraction.lang,
          extraction.langConfidence,
          articlePayload,
        ],
      );
      docId = existing.rows[0]?.docId ?? null;
    }
    if (!docId) {
      const existing = await client.query<{ docId: string }>(
        `
          select doc_id::text as "docId"
          from articles
          where channel_id = $1
            and (
              source_article_id = $2
              or url = $3
            )
          limit 1
        `,
        [resource.channelId, sourceArticleId, extraction.finalUrl],
      );
      docId = existing.rows[0]?.docId ?? null;
    }
    if (!docId) {
      return null;
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
      [randomUUID(), resource.channelId, sourceArticleId, docId],
    );

    if (!resource.projectedArticleId) {
      await upsertArticleObservation(client, docId);
      await client.query(
        `
          insert into outbox_events (
            event_id,
            event_type,
            aggregate_type,
            aggregate_id,
            payload_json
          )
          values ($1, $2, 'article', $3, $4::jsonb)
          on conflict do nothing
        `,
        [
          randomUUID(),
          ARTICLE_INGEST_REQUESTED_EVENT,
          docId,
          JSON.stringify({
            docId,
            version: 1,
          }),
        ],
      );
    }

    return docId;
  }
}

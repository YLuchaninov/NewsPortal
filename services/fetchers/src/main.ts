import Fastify from "fastify";

import { loadFetchersConfig } from "./config";
import { checkPostgres, createPgPool } from "./db";
import { ArticleEnrichmentService } from "./enrichment";
import { ResourceEnrichmentService } from "./resource-enrichment";
import { RssFetcherService } from "./fetchers";
import { probeWebsitesForDiscovery } from "./web-ingestion";

const config = loadFetchersConfig();
const pool = createPgPool(config);
const service = new RssFetcherService(pool, config);
const app = Fastify({
  logger: true
});
const enrichmentService = new ArticleEnrichmentService(pool, config, app.log);
const resourceEnrichmentService = new ResourceEnrichmentService(pool, config, app.log);

let pollInterval: NodeJS.Timeout | undefined;

app.get("/health", async () => {
  await checkPostgres(pool);
  return service.createHealthResponse();
});

app.post<{ Params: { docId: string }; Body: { force?: boolean } }>(
  "/internal/enrichment/articles/:docId",
  async (request, reply) => {
    try {
      const result = await enrichmentService.enrichArticle(request.params.docId, request.body ?? {});
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Article enrichment failed.";
      app.log.error({ error, docId: request.params.docId }, "Fetchers enrichment route failed.");
      if (/was not found/.test(message)) {
        reply.code(404);
      } else {
        reply.code(400);
      }
      return {
        status: "failed",
        doc_id: request.params.docId,
        enrichment_state: "failed",
        body_replaced: false,
        media_asset_count: 0,
        error: message,
      };
    }
  }
);

app.post<{ Params: { resourceId: string }; Body: { force?: boolean } }>(
  "/internal/enrichment/resources/:resourceId",
  async (request, reply) => {
    try {
      const result = await resourceEnrichmentService.enrichResource(
        request.params.resourceId,
        request.body ?? {}
      );
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Resource enrichment failed.";
      app.log.error({ error, resourceId: request.params.resourceId }, "Fetchers resource enrichment route failed.");
      if (/was not found/.test(message)) {
        reply.code(404);
      } else {
        reply.code(400);
      }
      return {
        status: "failed",
        resource_id: request.params.resourceId,
        resource_kind: "unknown",
        extraction_state: "failed",
        projected_doc_id: null,
        documents_count: 0,
        media_count: 0,
        error: message,
      };
    }
  }
);

app.post<{ Body: { urls?: unknown; sampleCount?: unknown } }>(
  "/internal/discovery/websites/probe",
  async (request, reply) => {
    const rawUrls = Array.isArray(request.body?.urls) ? request.body?.urls : [];
    const urls = rawUrls
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim())
      .filter(Boolean);
    const sampleCount =
      typeof request.body?.sampleCount === "number" && Number.isFinite(request.body.sampleCount)
        ? Math.max(1, Math.min(10, Math.round(request.body.sampleCount)))
        : 5;
    if (urls.length === 0) {
      reply.code(400);
      return {
        probed_websites: [],
        error: "Discovery website probe requires at least one URL.",
      };
    }

    try {
      return await probeWebsitesForDiscovery({
        pool,
        urls,
        sampleCount,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Discovery website probe failed.";
      app.log.error({ error, urls }, "Fetchers discovery website probe route failed.");
      reply.code(400);
      return {
        probed_websites: [],
        error: message,
      };
    }
  }
);

async function shutdown(signal: string): Promise<void> {
  if (pollInterval) {
    clearInterval(pollInterval);
  }

  app.log.info({ signal }, "Shutting down fetchers.");
  await app.close();
  await pool.end();
  process.exit(0);
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

async function main(): Promise<void> {
  await checkPostgres(pool);
  try {
    await service.pollOnce();
  } catch (error) {
    app.log.error({ error }, "Initial fetchers poll failed.");
  }

  pollInterval = setInterval(() => {
    void service.pollOnce().catch((error) => {
      app.log.error({ error }, "Fetchers poll failed.");
    });
  }, config.fetchersPollIntervalMs);

  await app.listen({
    host: "0.0.0.0",
    port: config.fetchersPort
  });
}

void main().catch(async (error) => {
  app.log.error({ error }, "Fetchers startup failed.");
  await pool.end();
  process.exit(1);
});

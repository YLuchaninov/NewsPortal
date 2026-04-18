import { loadFetchersConfig } from "../config";
import { createPgPool } from "../db";
import { ResourceEnrichmentService } from "../resource-enrichment";

interface ReplayCandidateRow {
  resourceId: string;
  resourceKind: string;
}

interface CliOptions {
  dryRun: boolean;
  force: boolean;
  limit: number | null;
  channelId: string | null;
  resourceId: string | null;
}

function readFlag(name: string): boolean {
  return process.argv.slice(2).includes(name);
}

function readOption(name: string): string | null {
  const prefix = `${name}=`;
  const raw = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  if (!raw) {
    return null;
  }
  const value = raw.slice(prefix.length).trim();
  return value.length > 0 ? value : null;
}

function parseOptions(): CliOptions {
  const limitValue = readOption("--limit");
  let parsedLimit: number | null = null;
  if (limitValue != null) {
    parsedLimit = Number.parseInt(limitValue, 10);
  }
  if (parsedLimit != null && (!Number.isFinite(parsedLimit) || parsedLimit <= 0)) {
    throw new Error("--limit must be a positive integer when provided.");
  }

  return {
    dryRun: readFlag("--dry-run"),
    force: readFlag("--force"),
    limit: parsedLimit,
    channelId: readOption("--channel-id"),
    resourceId: readOption("--resource-id"),
  };
}

async function listReplayCandidates(
  pool: ReturnType<typeof createPgPool>,
  options: CliOptions,
): Promise<ReplayCandidateRow[]> {
  const filters = [
    "wr.projected_article_id is null",
    "wr.extraction_state = 'enriched'",
    "wr.projection_state = 'explicitly_rejected_before_pipeline'",
    "wr.projection_error = 'legacy_resource_only_without_common_handoff'",
  ];
  const params: unknown[] = [];

  if (options.channelId) {
    params.push(options.channelId);
    filters.push(`wr.channel_id = $${params.length}`);
  }

  if (options.resourceId) {
    params.push(options.resourceId);
    filters.push(`wr.resource_id = $${params.length}`);
  }

  let sql = `
    select
      wr.resource_id::text as "resourceId",
      wr.resource_kind as "resourceKind"
    from web_resources wr
    where ${filters.join("\n      and ")}
    order by wr.discovered_at asc, wr.resource_id
  `;

  if (options.limit != null) {
    params.push(options.limit);
    sql = `${sql}\n    limit $${params.length}`;
  }

  const result = await pool.query<ReplayCandidateRow>(sql, params);
  return result.rows;
}

async function main(): Promise<void> {
  const options = parseOptions();
  const config = loadFetchersConfig();
  const pool = createPgPool(config);
  const service = new ResourceEnrichmentService(pool, config, {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  });

  try {
    const candidates = await listReplayCandidates(pool, options);

    if (options.dryRun) {
      console.log(
        JSON.stringify(
          {
            mode: "dry_run",
            candidateCount: candidates.length,
            candidates: candidates.slice(0, 20),
          },
          null,
          2,
        ),
      );
      return;
    }

    let projectedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    const errors: Array<{ resourceId: string; error: string | null | undefined }> = [];

    for (const [index, candidate] of candidates.entries()) {
      const result = await service.replayStoredProjection(candidate.resourceId, {
        force: options.force,
      });

      if (result.projected_doc_id) {
        projectedCount += 1;
      } else if (result.status === "failed") {
        failedCount += 1;
      } else {
        skippedCount += 1;
      }

      if (result.error) {
        errors.push({
          resourceId: candidate.resourceId,
          error: result.error,
        });
      }

      if ((index + 1) % 25 === 0 || index === candidates.length - 1) {
        console.log(
          `[replay-website-projections] processed ${index + 1}/${candidates.length} candidates`,
        );
      }
    }

    console.log(
      JSON.stringify(
        {
          mode: "apply",
          candidateCount: candidates.length,
          projectedCount,
          skippedCount,
          failedCount,
          errors: errors.slice(0, 20),
        },
        null,
        2,
      ),
    );
  } finally {
    await pool.end();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

import {
  OUTSOURCE_EXAMPLE_C_BUNDLE,
  OUTSOURCE_EXAMPLE_C_PARITY,
} from "./lib/outsource-example-c.bundle.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..", "..");
const READY_STATUS = "ready";
const NEEDS_BROWSER_FALLBACK_STATUS = "needs_browser_fallback";
const REJECTED_OPEN_WEB_STATUS = "rejected_open_web";
const CRITERION_COMPILE_REQUESTED_EVENT = "criterion.compile.requested";
const REINDEX_REQUESTED_EVENT = "reindex.requested";
const RESOURCE_INGEST_REQUESTED_EVENT = "resource.ingest.requested";
const ARTICLE_INGEST_REQUESTED_EVENT = "article.ingest.requested";
const REQUIRED_EMPTY_TABLES = [
  "source_channels",
  "interest_templates",
  "criteria",
  "selection_profiles",
  "llm_prompt_templates",
  "web_resources",
  "articles",
  "sequence_runs",
];
const EXPECTED_READY_SITE_COUNT = 26;
const EXPECTED_BROWSER_FALLBACK_SITE_COUNT = 3;
const EXPECTED_SKIPPED_SITE_COUNT = 1;
const EXPECTED_IMPORTED_SITE_COUNT =
  EXPECTED_READY_SITE_COUNT + EXPECTED_BROWSER_FALLBACK_SITE_COUNT;

let runtimeDependenciesPromise;

function log(message) {
  console.log(`[live-website-outsourcing] ${message}`);
}

async function loadRuntimeDependencies() {
  if (!runtimeDependenciesPromise) {
    runtimeDependenciesPromise = (async () => {
      const [
        adminTemplatesModule,
        dbModule,
        outboxModule,
        websiteChannelsModule,
      ] = await Promise.all([
        tsImport("../../apps/admin/src/lib/server/admin-templates.ts", import.meta.url),
        tsImport("../../apps/admin/src/lib/server/db.ts", import.meta.url),
        tsImport("../../apps/admin/src/lib/server/outbox.ts", import.meta.url),
        tsImport("../../apps/admin/src/lib/server/website-channels.ts", import.meta.url),
      ]);

      return {
        saveInterestTemplate: adminTemplatesModule.saveInterestTemplate,
        saveLlmTemplate: adminTemplatesModule.saveLlmTemplate,
        syncInterestTemplateCriterion: adminTemplatesModule.syncInterestTemplateCriterion,
        syncInterestTemplateSelectionProfile:
          adminTemplatesModule.syncInterestTemplateSelectionProfile,
        getPool: dbModule.getPool,
        insertOutboxEvent: outboxModule.insertOutboxEvent,
        upsertWebsiteChannels: websiteChannelsModule.upsertWebsiteChannels,
      };
    })();
  }

  return runtimeDependenciesPromise;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });

  if (result.status !== 0 && !options.allowFailure) {
    if (options.capture) {
      if (result.stdout) {
        process.stdout.write(result.stdout);
      }
      if (result.stderr) {
        process.stderr.write(result.stderr);
      }
    }
    throw new Error(
      `Command failed (${command} ${args.join(" ")}): exit code ${result.status ?? "unknown"}`
    );
  }

  return {
    status: result.status ?? 0,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

async function readEnvFile(relativePath) {
  const content = await readFile(path.join(repoRoot, relativePath), "utf8");
  return Object.fromEntries(
    content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const separatorIndex = line.indexOf("=");
        if (separatorIndex < 0) {
          return [line, ""];
        }
        return [line.slice(0, separatorIndex), line.slice(separatorIndex + 1)];
      })
  );
}

function applyEnv(env) {
  for (const [key, value] of Object.entries(env)) {
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function buildDatabaseUrl(env) {
  if (env.DATABASE_URL) {
    return env.DATABASE_URL;
  }

  const user = env.POSTGRES_USER ?? "newsportal";
  const password = env.POSTGRES_PASSWORD ?? "newsportal";
  const host = env.POSTGRES_HOST ?? "127.0.0.1";
  const port =
    env.POSTGRES_PORT ??
    (host === "127.0.0.1" || host === "localhost" ? "55432" : "5432");
  const database = env.POSTGRES_DB ?? "newsportal";

  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
}

function verifyHealth() {
  const requiredContainers = [
    "docker-postgres-1",
    "docker-redis-1",
    "docker-relay-1",
    "docker-fetchers-1",
    "docker-worker-1",
    "docker-api-1",
    "docker-web-1",
    "docker-admin-1",
    "docker-nginx-1",
  ];
  const result = runCommand(
    "docker",
    ["ps", "--format", "{{.Names}}\t{{.Status}}"],
    { capture: true }
  );
  const rows = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, ...statusParts] = line.split("\t");
      return {
        name,
        status: statusParts.join("\t"),
      };
    });
  const statusByName = new Map(rows.map((row) => [row.name, row.status]));
  const missing = requiredContainers.filter((name) => !statusByName.has(name));
  if (missing.length > 0) {
    throw new Error(`Missing required compose containers: ${missing.join(", ")}`);
  }
  const unhealthy = requiredContainers.filter((name) => {
    const status = String(statusByName.get(name) ?? "");
    return !status.startsWith("Up");
  });
  if (unhealthy.length > 0) {
    throw new Error(
      `Required compose containers are not healthy/up: ${unhealthy.map((name) => `${name}=${statusByName.get(name)}`).join(", ")}`
    );
  }

  return {
    containers: requiredContainers.map((name) => ({
      name,
      status: statusByName.get(name),
    })),
  };
}

async function queryCount(pool, tableName) {
  const result = await pool.query(
    `select count(*)::int as count from ${tableName}`
  );
  return Number(result.rows[0]?.count ?? 0);
}

async function readEmptyTableCounts(pool) {
  const counts = {};
  for (const tableName of REQUIRED_EMPTY_TABLES) {
    counts[tableName] = await queryCount(pool, tableName);
  }
  return counts;
}

function assertEmptyCounts(counts) {
  const nonEmpty = Object.entries(counts).filter(([, count]) => Number(count) !== 0);
  if (nonEmpty.length > 0) {
    throw new Error(
      `Expected an empty DB baseline for this stage, but found existing rows in: ${nonEmpty.map(([tableName, count]) => `${tableName}=${count}`).join(", ")}`
    );
  }
}

async function loadJson(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  return JSON.parse(await readFile(absolutePath, "utf8"));
}

function assertTemplateParity(bundle) {
  const llmTemplates = Array.isArray(bundle.llm_templates) ? bundle.llm_templates : [];
  const interestTemplates = Array.isArray(bundle.interest_templates) ? bundle.interest_templates : [];

  if (llmTemplates.length !== OUTSOURCE_EXAMPLE_C_PARITY.llmTemplateKeys.length) {
    throw new Error(
      `Expected ${OUTSOURCE_EXAMPLE_C_PARITY.llmTemplateKeys.length} outsourcing LLM templates, found ${llmTemplates.length}.`
    );
  }

  if (interestTemplates.length !== OUTSOURCE_EXAMPLE_C_PARITY.interestTemplateNames.length) {
    throw new Error(
      `Expected ${OUTSOURCE_EXAMPLE_C_PARITY.interestTemplateNames.length} outsourcing interest templates, found ${interestTemplates.length}.`
    );
  }

  const llmKeys = new Set(
    llmTemplates.map((template) => `${String(template.scope ?? "").trim()}::${String(template.template_name ?? template.name ?? "").trim()}`)
  );
  for (const key of OUTSOURCE_EXAMPLE_C_PARITY.llmTemplateKeys) {
    if (!llmKeys.has(key)) {
      throw new Error(`Outsourcing Example C fixture is missing LLM template ${key}.`);
    }
  }

  const interestNames = new Set(
    interestTemplates.map((template) => String(template.name ?? "").trim())
  );
  for (const name of OUTSOURCE_EXAMPLE_C_PARITY.interestTemplateNames) {
    if (!interestNames.has(name)) {
      throw new Error(`Outsourcing Example C fixture is missing interest template "${name}".`);
    }
  }

  return {
    llmTemplateCount: llmTemplates.length,
    interestTemplateCount: interestTemplates.length,
  };
}

function normalizeSignalGroups(groups) {
  if (!Array.isArray(groups)) {
    return [];
  }

  return groups
    .map((group) => {
      const name = String(group?.name ?? "").trim();
      const cues = Array.isArray(group?.cues)
        ? group.cues.map((cue) => String(cue ?? "").trim()).filter(Boolean)
        : [];
      if (!name || cues.length === 0) {
        return null;
      }
      return { name, cues };
    })
    .filter((group) => group !== null);
}

function buildInterestTemplateInput(template, interestTemplateId) {
  const policy = template.selection_profile_policy ?? {};
  return {
    interestTemplateId,
    name: String(template.name ?? "").trim(),
    description: String(template.description ?? "").trim(),
    positiveTexts: Array.isArray(template.positive_prototypes)
      ? template.positive_prototypes.map((value) => String(value ?? "").trim()).filter(Boolean)
      : [],
    negativeTexts: Array.isArray(template.negative_prototypes)
      ? template.negative_prototypes.map((value) => String(value ?? "").trim()).filter(Boolean)
      : [],
    mustHaveTerms: Array.isArray(template.must_have_terms)
      ? template.must_have_terms.map((value) => String(value ?? "").trim()).filter(Boolean)
      : [],
    mustNotHaveTerms: Array.isArray(template.must_not_have_terms)
      ? template.must_not_have_terms.map((value) => String(value ?? "").trim()).filter(Boolean)
      : [],
    places: Array.isArray(template.places)
      ? template.places.map((value) => String(value ?? "").trim()).filter(Boolean)
      : [],
    languagesAllowed: Array.isArray(template.languages_allowed)
      ? template.languages_allowed.map((value) => String(value ?? "").trim()).filter(Boolean)
      : [],
    timeWindowHours:
      typeof template.time_window_hours === "number" && Number.isInteger(template.time_window_hours)
        ? template.time_window_hours
        : null,
    allowedContentKinds: Array.isArray(template.allowed_content_kinds)
      ? template.allowed_content_kinds.map((value) => String(value ?? "").trim()).filter(Boolean)
      : [],
    shortTokensRequired: Array.isArray(template.short_tokens_required)
      ? template.short_tokens_required.map((value) => String(value ?? "").trim()).filter(Boolean)
      : [],
    shortTokensForbidden: Array.isArray(template.short_tokens_forbidden)
      ? template.short_tokens_forbidden.map((value) => String(value ?? "").trim()).filter(Boolean)
      : [],
    candidatePositiveSignals: normalizeSignalGroups(template.candidate_positive_signals),
    candidateNegativeSignals: normalizeSignalGroups(template.candidate_negative_signals),
    selectionProfileStrictness: String(policy.strictness ?? "balanced"),
    selectionProfileUnresolvedDecision: String(policy.unresolved_decision ?? "hold"),
    selectionProfileLlmReviewMode: String(policy.llm_review_mode ?? "always"),
    priority: Number(template.priority ?? 1),
    isActive: true,
  };
}

function validateWebsiteCandidateSet(candidates) {
  const importedSites = [];
  const skippedSites = [];
  const unexpectedSites = [];

  for (const site of candidates) {
    const status = String(site.validationStatus ?? "").trim();
    if (status === READY_STATUS || status === NEEDS_BROWSER_FALLBACK_STATUS) {
      importedSites.push(site);
      continue;
    }
    if (status === REJECTED_OPEN_WEB_STATUS) {
      skippedSites.push(site);
      continue;
    }
    unexpectedSites.push({
      id: site.id ?? null,
      siteName: site.siteName ?? null,
      validationStatus: status || null,
    });
  }

  const readyCount = importedSites.filter(
    (site) => String(site.validationStatus ?? "").trim() === READY_STATUS
  ).length;
  const browserFallbackCount = importedSites.filter(
    (site) => String(site.validationStatus ?? "").trim() === NEEDS_BROWSER_FALLBACK_STATUS
  ).length;

  if (unexpectedSites.length > 0) {
    throw new Error(
      `Found unexpected website candidate statuses: ${unexpectedSites
        .map((site) => `${site.id ?? "unknown"}=${site.validationStatus ?? "missing"}`)
        .join(", ")}`
    );
  }
  if (readyCount !== EXPECTED_READY_SITE_COUNT) {
    throw new Error(`Expected ${EXPECTED_READY_SITE_COUNT} ready website sources, found ${readyCount}.`);
  }
  if (browserFallbackCount !== EXPECTED_BROWSER_FALLBACK_SITE_COUNT) {
    throw new Error(
      `Expected ${EXPECTED_BROWSER_FALLBACK_SITE_COUNT} browser-fallback website sources, found ${browserFallbackCount}.`
    );
  }
  if (skippedSites.length !== EXPECTED_SKIPPED_SITE_COUNT) {
    throw new Error(
      `Expected ${EXPECTED_SKIPPED_SITE_COUNT} skipped rejected-open-web website source, found ${skippedSites.length}.`
    );
  }
  if (importedSites.length !== EXPECTED_IMPORTED_SITE_COUNT) {
    throw new Error(
      `Expected ${EXPECTED_IMPORTED_SITE_COUNT} imported open-web website sources, found ${importedSites.length}.`
    );
  }

  return {
    importedSites,
    skippedSites: skippedSites.map((site) => ({
      siteId: site.id,
      siteName: site.siteName,
      validationStatus: site.validationStatus,
      validationConfidence: site.validationConfidence ?? null,
      classification: {
        category: "skipped_rejected_open_web",
        reason:
          String(site.validationNotes ?? "").trim() ||
          "The source was explicitly excluded because it is not an open-web target for this bounded run.",
      },
    })),
    counts: {
      ready: readyCount,
      needsBrowserFallback: browserFallbackCount,
      skippedRejectedOpenWeb: skippedSites.length,
      imported: importedSites.length,
      totalCandidates: candidates.length,
    },
  };
}

async function upsertTemplates(pool, bundle, runtimeDependencies) {
  const {
    saveInterestTemplate,
    saveLlmTemplate,
    syncInterestTemplateCriterion,
    syncInterestTemplateSelectionProfile,
    insertOutboxEvent,
  } = runtimeDependencies;
  const client = await pool.connect();
  const llmResults = [];
  const interestResults = [];

  try {
    await client.query("begin");

    const existingLlm = await client.query(
      `
        select
          prompt_template_id::text as prompt_template_id,
          name,
          scope
        from llm_prompt_templates
      `
    );
    const llmIdByKey = new Map(
      existingLlm.rows.map((row) => [`${row.scope}::${row.name}`, row.prompt_template_id])
    );

    for (const template of bundle.llm_templates) {
      const name = String(template.template_name ?? template.name ?? "").trim();
      const scope = String(template.scope ?? "").trim();
      const key = `${scope}::${name}`;
      const result = await saveLlmTemplate(client, {
        promptTemplateId: llmIdByKey.get(key),
        name,
        scope,
        language: null,
        templateText: String(template.prompt_template ?? template.template_text ?? "").trim(),
        isActive: true,
      });
      llmResults.push({
        name,
        scope,
        promptTemplateId: result.promptTemplateId,
        created: result.created,
      });
    }

    const existingInterest = await client.query(
      `
        select
          interest_template_id::text as interest_template_id,
          name
        from interest_templates
      `
    );
    const interestIdByName = new Map(
      existingInterest.rows.map((row) => [row.name, row.interest_template_id])
    );

    for (const template of bundle.interest_templates) {
      const input = buildInterestTemplateInput(
        template,
        interestIdByName.get(String(template.name ?? "").trim())
      );
      const templateResult = await saveInterestTemplate(client, input);
      const criterionSync = await syncInterestTemplateCriterion(
        client,
        templateResult.interestTemplateId
      );
      const selectionProfileSync = await syncInterestTemplateSelectionProfile(
        client,
        templateResult.interestTemplateId,
        input
      );

      if (criterionSync.compileRequested) {
        await insertOutboxEvent(client, {
          eventType: CRITERION_COMPILE_REQUESTED_EVENT,
          aggregateType: "criterion",
          aggregateId: criterionSync.criterionId,
          payload: {
            criterionId: criterionSync.criterionId,
            version: criterionSync.version,
          },
        });
      }

      interestResults.push({
        name: input.name,
        interestTemplateId: templateResult.interestTemplateId,
        created: templateResult.created,
        criterionId: criterionSync.criterionId,
        criterionVersion: criterionSync.version,
        compileRequested: criterionSync.compileRequested,
        selectionProfileId: selectionProfileSync.selectionProfileId,
        selectionProfileVersion: selectionProfileSync.version,
      });
    }

    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }

  return {
    llmResults,
    interestResults,
  };
}

async function waitForCondition(label, fn, options = {}) {
  const timeoutMs = options.timeoutMs ?? 180000;
  const pollIntervalMs = options.pollIntervalMs ?? 1000;
  const startedAt = Date.now();
  let lastSnapshot = null;

  while (Date.now() - startedAt <= timeoutMs) {
    const snapshot = await fn();
    lastSnapshot = snapshot;
    if (snapshot?.ok) {
      return snapshot;
    }
    await sleep(pollIntervalMs);
  }

  throw new Error(
    `Timed out waiting for ${label}.${lastSnapshot?.message ? ` Last state: ${lastSnapshot.message}` : ""}`
  );
}

async function waitForCriteriaCompiled(pool, expectedCount) {
  return waitForCondition(
    "criteria compile completion",
    async () => {
      const result = await pool.query(
        `
          select
            count(*)::int as total,
            count(*) filter (where compile_status = 'compiled')::int as compiled
          from criteria_compiled
        `
      );
      const row = result.rows[0] ?? { total: 0, compiled: 0 };
      const total = Number(row.total ?? 0);
      const compiled = Number(row.compiled ?? 0);
      return {
        ok: total >= expectedCount && compiled >= expectedCount,
        message: `criteria_compiled total=${total} compiled=${compiled}`,
        total,
        compiled,
      };
    },
    { timeoutMs: 300000, pollIntervalMs: 2000 }
  );
}

async function queueReindex(pool, runtimeDependencies) {
  const { insertOutboxEvent } = runtimeDependencies;
  const client = await pool.connect();
  const reindexJobId = randomUUID();

  try {
    await client.query("begin");
    await client.query(
      `
        insert into reindex_jobs (
          reindex_job_id,
          index_name,
          job_kind,
          options_json,
          requested_by_user_id,
          status
        )
        values ($1, $2, $3, $4::jsonb, null, 'queued')
      `,
      [reindexJobId, "interest_centroids", "rebuild", JSON.stringify({})]
    );
    await insertOutboxEvent(client, {
      eventType: REINDEX_REQUESTED_EVENT,
      aggregateType: "reindex_job",
      aggregateId: reindexJobId,
      payload: {
        reindexJobId,
        indexName: "interest_centroids",
        jobKind: "rebuild",
        version: 1,
      },
    });
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }

  return reindexJobId;
}

async function waitForReindexCompleted(pool, reindexJobId) {
  return waitForCondition(
    "reindex completion",
    async () => {
      const result = await pool.query(
        `
          select
            status,
            error_text,
            started_at::text as started_at,
            finished_at::text as finished_at
          from reindex_jobs
          where reindex_job_id = $1
        `,
        [reindexJobId]
      );
      const row = result.rows[0];
      if (!row) {
        return {
          ok: false,
          message: `reindex job ${reindexJobId} not found`,
        };
      }
      if (String(row.status ?? "") === "failed") {
        throw new Error(
          `Reindex job ${reindexJobId} failed: ${String(row.error_text ?? "unknown error")}`
        );
      }
      return {
        ok: String(row.status ?? "") === "completed",
        message: `status=${row.status ?? "unknown"}`,
        status: row.status,
        startedAt: row.started_at,
        finishedAt: row.finished_at,
      };
    },
    { timeoutMs: 300000, pollIntervalMs: 2000 }
  );
}

function buildWebsiteChannelInput(site, channelId) {
  const config = site.recommendedConfig ?? {};
  return {
    channelId,
    providerType: "website",
    name: String(config.name ?? site.siteName ?? "").trim(),
    fetchUrl: String(config.websiteEntryUrl ?? "").trim(),
    language: String(config.language ?? "en").trim() || "en",
    isActive: config.active !== false,
    pollIntervalSeconds: Number(config.pollIntervalSeconds ?? 900),
    adaptiveEnabled: config.adaptive !== false,
    maxPollIntervalSeconds: Number(config.maxPollIntervalSeconds ?? 14400),
    requestTimeoutMs: Number(config.requestTimeoutMs ?? 10000),
    totalPollTimeoutMs: Number(config.totalPollTimeoutMs ?? 60000),
    userAgent: String(config.userAgent ?? "NewsPortalFetchers/0.1 (+https://newsportal.local)").trim(),
    maxResourcesPerPoll: Number(config.maxResourcesPerPoll ?? 20),
    crawlDelayMs: Number(config.crawlDelayMs ?? 1000),
    sitemapDiscoveryEnabled: config.sitemapDiscoveryEnabled !== false,
    feedDiscoveryEnabled: config.feedDiscoveryEnabled === true,
    collectionDiscoveryEnabled: config.collectionDiscoveryEnabled !== false,
    downloadDiscoveryEnabled: config.downloadDiscoveryEnabled !== false,
    browserFallbackEnabled: config.browserFallbackEnabled === true,
    collectionSeedUrls: Array.isArray(config.collectionSeedUrls)
      ? config.collectionSeedUrls.map((value) => String(value ?? "").trim()).filter(Boolean)
      : [],
    allowedUrlPatterns: Array.isArray(config.allowedUrlPatterns)
      ? config.allowedUrlPatterns.map((value) => String(value ?? "").trim()).filter(Boolean)
      : [],
    blockedUrlPatterns: Array.isArray(config.blockedUrlPatterns)
      ? config.blockedUrlPatterns.map((value) => String(value ?? "").trim()).filter(Boolean)
      : [],
    curated: {
      preferCollectionDiscovery: config.curatedPreferCollectionDiscovery === true,
      preferBrowserFallback: config.curatedPreferBrowserFallback === true,
      editorialUrlPatterns: Array.isArray(config.curatedEditorialUrlPatterns)
        ? config.curatedEditorialUrlPatterns.map((value) => String(value ?? "").trim()).filter(Boolean)
        : [],
      listingUrlPatterns: Array.isArray(config.curatedListingUrlPatterns)
        ? config.curatedListingUrlPatterns.map((value) => String(value ?? "").trim()).filter(Boolean)
        : [],
      entityUrlPatterns: Array.isArray(config.curatedEntityUrlPatterns)
        ? config.curatedEntityUrlPatterns.map((value) => String(value ?? "").trim()).filter(Boolean)
        : [],
      documentUrlPatterns: Array.isArray(config.curatedDocumentUrlPatterns)
        ? config.curatedDocumentUrlPatterns.map((value) => String(value ?? "").trim()).filter(Boolean)
        : [],
      dataFileUrlPatterns: Array.isArray(config.curatedDataFileUrlPatterns)
        ? config.curatedDataFileUrlPatterns.map((value) => String(value ?? "").trim()).filter(Boolean)
        : [],
    },
    authorizationHeaderUpdate: {
      mode: "disabled",
      authorizationHeader: null,
    },
  };
}

async function upsertWebsiteSources(pool, importedSites, runtimeDependencies) {
  const { upsertWebsiteChannels } = runtimeDependencies;
  const existing = await pool.query(
    `
      select
        channel_id::text as channel_id,
        fetch_url
      from source_channels
      where
        provider_type = 'website'
        and fetch_url = any($1::text[])
    `,
    [importedSites.map((site) => String(site.recommendedConfig?.websiteEntryUrl ?? "").trim())]
  );
  const channelIdByFetchUrl = new Map(
    existing.rows.map((row) => [String(row.fetch_url ?? "").trim(), row.channel_id])
  );

  const inputs = importedSites.map((site) =>
    buildWebsiteChannelInput(
      site,
      channelIdByFetchUrl.get(String(site.recommendedConfig?.websiteEntryUrl ?? "").trim())
    )
  );
  const upsertResult = await upsertWebsiteChannels(pool, inputs);
  const channelRows = await pool.query(
    `
      select
        channel_id::text as channel_id,
        name,
        fetch_url,
        language,
        is_active,
        poll_interval_seconds,
        config_json
      from source_channels
      where
        provider_type = 'website'
        and fetch_url = any($1::text[])
      order by name
    `,
    [inputs.map((input) => input.fetchUrl)]
  );

  const channels = channelRows.rows.map((row) => {
    const config = row.config_json ?? {};
    return {
      channelId: row.channel_id,
      name: row.name,
      fetchUrl: row.fetch_url,
      language: row.language,
      isActive: row.is_active === true,
      pollIntervalSeconds: Number(row.poll_interval_seconds ?? 0),
      config,
    };
  });

  if (channels.length !== importedSites.length) {
    throw new Error(
      `Expected ${importedSites.length} website channels after import, found ${channels.length}.`
    );
  }

  const configMismatches = [];
  const siteByFetchUrl = new Map(
    importedSites.map((site) => [String(site.recommendedConfig?.websiteEntryUrl ?? "").trim(), site])
  );

  for (const channel of channels) {
    const site = siteByFetchUrl.get(channel.fetchUrl);
    const config = channel.config;
    if (!site) {
      configMismatches.push(`Unexpected imported channel ${channel.fetchUrl}`);
      continue;
    }
    const expected = site.recommendedConfig ?? {};
    const comparisons = [
      ["poll_interval_seconds", channel.pollIntervalSeconds, Number(expected.pollIntervalSeconds ?? 900)],
      ["maxResourcesPerPoll", Number(config.maxResourcesPerPoll ?? 0), Number(expected.maxResourcesPerPoll ?? 20)],
      ["requestTimeoutMs", Number(config.requestTimeoutMs ?? 0), Number(expected.requestTimeoutMs ?? 10000)],
      ["totalPollTimeoutMs", Number(config.totalPollTimeoutMs ?? 0), Number(expected.totalPollTimeoutMs ?? 60000)],
      ["crawlDelayMs", Number(config.crawlDelayMs ?? 0), Number(expected.crawlDelayMs ?? 1000)],
      ["browserFallbackEnabled", Boolean(config.browserFallbackEnabled), expected.browserFallbackEnabled === true],
    ];
    for (const [label, actual, expectedValue] of comparisons) {
      if (actual !== expectedValue) {
        configMismatches.push(`${channel.name}: ${label} expected ${expectedValue} got ${actual}`);
      }
    }
  }

  if (configMismatches.length > 0) {
    throw new Error(`Website import config validation failed: ${configMismatches.join("; ")}`);
  }

  return {
    upsertResult,
    channels,
  };
}

function pollChannelInFetchersContainer(channelId) {
  return runCommand(
    "docker",
    [
      "exec",
      "docker-fetchers-1",
      "sh",
      "-lc",
      `cd /workspace && pnpm --filter @newsportal/fetchers run:once ${channelId}`,
    ],
    {
      capture: true,
      allowFailure: true,
    }
  );
}

async function pollImportedChannels(channels) {
  const pollResults = [];
  for (const channel of channels) {
    log(`Polling ${channel.name}`);
    const result = pollChannelInFetchersContainer(channel.channelId);
    pollResults.push({
      channelId: channel.channelId,
      name: channel.name,
      status: result.status,
      stdout: result.stdout.trim(),
      stderr: result.stderr.trim(),
    });
  }
  return pollResults;
}

async function readSettleSnapshot(pool, channelIds) {
  const channelIdArray = channelIds;
  const fetchRunsResult = await pool.query(
    `
      select count(*)::int as count
      from channel_fetch_runs
      where channel_id::text = any($1::text[])
    `,
    [channelIdArray]
  );
  const resourcesResult = await pool.query(
    `
      select
        count(*)::int as total,
        count(*) filter (where extraction_state = 'pending')::int as pending,
        array_remove(array_agg(resource_id::text), null) as resource_ids
      from web_resources
      where channel_id::text = any($1::text[])
    `,
    [channelIdArray]
  );
  const articlesResult = await pool.query(
    `
      select
        count(*)::int as total,
        count(*) filter (
          where processing_state is null
            or processing_state not in ('deduped', 'embedded', 'clustered', 'matched', 'notified')
        )::int as pending,
        array_remove(array_agg(doc_id::text), null) as article_ids
      from articles
      where channel_id::text = any($1::text[])
    `,
    [channelIdArray]
  );

  const resourceIds = Array.isArray(resourcesResult.rows[0]?.resource_ids)
    ? resourcesResult.rows[0].resource_ids
    : [];
  const articleIds = Array.isArray(articlesResult.rows[0]?.article_ids)
    ? articlesResult.rows[0].article_ids
    : [];
  const aggregateIds = [...resourceIds, ...articleIds];

  let unpublishedOutboxCount = 0;
  let openSequenceCount = 0;
  if (aggregateIds.length > 0) {
    const [outboxResult, sequenceResult] = await Promise.all([
      pool.query(
        `
          select count(*)::int as count
          from outbox_events
          where
            event_type = any($1::text[])
            and aggregate_id::text = any($2::text[])
            and status <> 'published'
        `,
        [[RESOURCE_INGEST_REQUESTED_EVENT, ARTICLE_INGEST_REQUESTED_EVENT], aggregateIds]
      ),
      pool.query(
        `
          select count(*)::int as count
          from sequence_runs
          where
            (
              context_json ->> 'resource_id' = any($1::text[])
              or context_json ->> 'doc_id' = any($2::text[])
            )
            and status not in ('completed', 'failed', 'cancelled', 'canceled')
        `,
        [resourceIds.length > 0 ? resourceIds : ["__none__"], articleIds.length > 0 ? articleIds : ["__none__"]]
      ),
    ]);
    unpublishedOutboxCount = Number(outboxResult.rows[0]?.count ?? 0);
    openSequenceCount = Number(sequenceResult.rows[0]?.count ?? 0);
  }

  return {
    fetchRunCount: Number(fetchRunsResult.rows[0]?.count ?? 0),
    resourceCount: Number(resourcesResult.rows[0]?.total ?? 0),
    pendingResourceCount: Number(resourcesResult.rows[0]?.pending ?? 0),
    articleCount: Number(articlesResult.rows[0]?.total ?? 0),
    pendingArticleCount: Number(articlesResult.rows[0]?.pending ?? 0),
    unpublishedOutboxCount,
    openSequenceCount,
  };
}

async function waitForDownstreamSettle(pool, channels) {
  const channelIds = channels.map((channel) => channel.channelId);
  return waitForCondition(
    "website downstream settle",
    async () => {
      const snapshot = await readSettleSnapshot(pool, channelIds);
      const ok =
        snapshot.fetchRunCount >= channelIds.length &&
        snapshot.pendingResourceCount === 0 &&
        snapshot.pendingArticleCount === 0 &&
        snapshot.unpublishedOutboxCount === 0 &&
        snapshot.openSequenceCount === 0;
      return {
        ok,
        message:
          `fetchRuns=${snapshot.fetchRunCount}/${channelIds.length} ` +
          `resources=${snapshot.resourceCount} pendingResources=${snapshot.pendingResourceCount} ` +
          `articles=${snapshot.articleCount} pendingArticles=${snapshot.pendingArticleCount} ` +
          `unpublishedOutbox=${snapshot.unpublishedOutboxCount} openSequences=${snapshot.openSequenceCount}`,
        snapshot,
      };
    },
    { timeoutMs: 600000, pollIntervalMs: 3000 }
  );
}

function normalizeErrorText(value) {
  return String(value ?? "").trim();
}

function isImplementationIssueText(text) {
  const normalized = normalizeErrorText(text).toLowerCase();
  if (!normalized) {
    return false;
  }
  return [
    "econnrefused",
    "localhost",
    "127.0.0.1",
    "relation ",
    "column ",
    "syntax error",
    "cannot read properties",
    "typeerror",
    "referenceerror",
    "failed to update",
    "not found or is not active",
  ].some((needle) => normalized.includes(needle));
}

async function readPerSiteEvidence(pool, readySites) {
  const evidence = [];
  const representativeMatches = [];

  for (const site of readySites) {
    const fetchUrl = String(site.recommendedConfig?.websiteEntryUrl ?? "").trim();
    const channelResult = await pool.query(
      `
        select
          channel_id::text as channel_id,
          name,
          fetch_url
        from source_channels
        where provider_type = 'website' and fetch_url = $1
        limit 1
      `,
      [fetchUrl]
    );
    const channel = channelResult.rows[0] ?? null;

    const fetchRunResult = channel
      ? await pool.query(
          `
            select
              outcome_kind,
              http_status,
              error_text,
              fetched_item_count,
              new_article_count,
              duplicate_suppressed_count,
              provider_metrics_json
            from channel_fetch_runs
            where channel_id = $1
            order by started_at desc
            limit 1
          `,
          [channel.channel_id]
        )
      : { rows: [] };
    const fetchRun = fetchRunResult.rows[0] ?? null;

    const resourceCountsResult = channel
      ? await pool.query(
          `
            select
              resource_kind,
              extraction_state,
              count(*)::int as count
            from web_resources
            where channel_id = $1
            group by resource_kind, extraction_state
            order by resource_kind, extraction_state
          `,
          [channel.channel_id]
        )
      : { rows: [] };
    const resourceRowsResult = channel
      ? await pool.query(
          `
            select
              resource_id::text as resource_id,
              resource_kind,
              extraction_state,
              projected_article_id::text as projected_article_id,
              url,
              title,
              extraction_error
            from web_resources
            where channel_id = $1
            order by created_at desc
          `,
          [channel.channel_id]
        )
      : { rows: [] };
    const articleRowsResult = channel
      ? await pool.query(
          `
            select
              doc_id::text as doc_id,
              url,
              title,
              processing_state
            from articles
            where channel_id = $1
            order by created_at desc
          `,
          [channel.channel_id]
        )
      : { rows: [] };
    const criterionMatchesResult = channel
      ? await pool.query(
          `
            select
              ifr.filter_scope,
              ifr.semantic_decision,
              ifr.compat_decision,
              c.description as criterion_name,
              a.title,
              a.url
            from interest_filter_results ifr
            join articles a on a.doc_id = ifr.doc_id
            left join criteria c on c.criterion_id = ifr.criterion_id
            where
              a.channel_id = $1
              and ifr.filter_scope = 'criterion'
            order by ifr.created_at desc
            limit 12
          `,
          [channel.channel_id]
        )
      : { rows: [] };
    const finalSelectionResult = channel
      ? await pool.query(
          `
            select
              count(*)::int as total,
              count(*) filter (where is_selected = true)::int as selected
            from final_selection_results fsr
            join articles a on a.doc_id = fsr.doc_id
            where a.channel_id = $1
          `,
          [channel.channel_id]
        )
      : { rows: [{ total: 0, selected: 0 }] };
    const systemFeedResult = channel
      ? await pool.query(
          `
            select
              count(*)::int as total,
              count(*) filter (where eligible_for_feed = true)::int as eligible
            from system_feed_results sfr
            join articles a on a.doc_id = sfr.doc_id
            where a.channel_id = $1
          `,
          [channel.channel_id]
        )
      : { rows: [{ total: 0, eligible: 0 }] };

    const resourceCountsByKind = {};
    const extractionCounts = {};
    for (const row of resourceCountsResult.rows) {
      const resourceKind = String(row.resource_kind ?? "unknown");
      const extractionState = String(row.extraction_state ?? "pending");
      resourceCountsByKind[resourceKind] = (resourceCountsByKind[resourceKind] ?? 0) + Number(row.count ?? 0);
      extractionCounts[extractionState] = (extractionCounts[extractionState] ?? 0) + Number(row.count ?? 0);
    }

    const articleRows = articleRowsResult.rows.map((row) => ({
      docId: row.doc_id,
      title: row.title,
      url: row.url,
      processingState: row.processing_state,
    }));
    const criterionMatches = criterionMatchesResult.rows.map((row) => ({
      semanticDecision: row.semantic_decision,
      compatDecision: row.compat_decision,
      criterionName: row.criterion_name,
      title: row.title,
      url: row.url,
    }));
    if (criterionMatches.length > 0) {
      representativeMatches.push(
        ...criterionMatches.map((match) => ({
          siteId: site.id,
          siteName: site.siteName,
          ...match,
        }))
      );
    }

    const resourceCount = resourceRowsResult.rows.length;
    const articleCount = articleRows.length;
    const latestErrorText = normalizeErrorText(fetchRun?.error_text);
    const failedResourceErrors = resourceRowsResult.rows
      .map((row) => normalizeErrorText(row.extraction_error))
      .filter(Boolean);

    const selectedCount = Number(finalSelectionResult.rows[0]?.selected ?? 0);
    let classification;
    if (!channel || !fetchRun) {
      classification = {
        category: "implementation_issue",
        reason: "No persisted website channel or fetch run was found after import/poll.",
      };
    } else if (resourceCount === 0) {
      classification = {
        category:
          isImplementationIssueText(latestErrorText)
            ? "implementation_issue"
            : String(site.validationStatus ?? "").trim() === NEEDS_BROWSER_FALLBACK_STATUS
              ? "browser_fallback_residual"
              : "external/runtime_residual",
        reason:
          latestErrorText ||
          "The channel produced no persisted web resources during the bounded live run.",
      };
    } else if (
      failedResourceErrors.length > 0 &&
      failedResourceErrors.length === resourceCount &&
      articleCount === 0
    ) {
      const combinedError = failedResourceErrors.join(" | ");
      classification = {
        category:
          isImplementationIssueText(combinedError)
            ? "implementation_issue"
            : String(site.validationStatus ?? "").trim() === NEEDS_BROWSER_FALLBACK_STATUS
              ? "browser_fallback_residual"
              : "external/runtime_residual",
        reason: combinedError,
      };
    } else if (
      articleCount === 0 &&
      String(site.projectionExpectation ?? "") === "resource_only_is_normal"
    ) {
      classification = {
        category: "resource_only_expected",
        reason: "Resource-only outcome is normal for this source profile and was observed live.",
      };
    } else if (articleCount > 0 && selectedCount > 0) {
      classification = {
        category: "projected_and_selected",
        reason: "Website resources projected into articles and at least one downstream final-selection row was selected.",
      };
    } else if (articleCount > 0) {
      classification = {
        category: "projected_but_not_selected",
        reason: "Website resources projected into articles and downstream filtering ran, but no final-selection row was selected.",
      };
    } else {
      classification = {
        category:
          String(site.validationStatus ?? "").trim() === NEEDS_BROWSER_FALLBACK_STATUS
            ? "browser_fallback_residual"
            : "external/runtime_residual",
        reason:
          "Website resources were observed without a durable implementation issue signal, but the downstream outcome did not match the expected projected/resource-only success shapes.",
      };
    }

    evidence.push({
      siteId: site.id,
      siteName: site.siteName,
      group: site.group,
      profile: site.profile,
      validationStatus: site.validationStatus,
      validationConfidence: site.validationConfidence,
      expectedResourceKinds: Array.isArray(site.expectedResourceKinds)
        ? site.expectedResourceKinds
        : [],
      projectionExpectation: site.projectionExpectation ?? null,
      channelId: channel?.channel_id ?? null,
      channelName: channel?.name ?? null,
      fetchUrl,
      latestFetchRun: fetchRun
        ? {
            outcomeKind: fetchRun.outcome_kind,
            httpStatus: fetchRun.http_status,
            errorText: fetchRun.error_text,
            fetchedItemCount: fetchRun.fetched_item_count,
            newArticleCount: fetchRun.new_article_count,
            duplicateSuppressedCount: fetchRun.duplicate_suppressed_count,
            providerMetricsJson: fetchRun.provider_metrics_json,
          }
        : null,
      resourceCount,
      resourceCountsByKind,
      extractionCounts,
      projectedArticleCount: resourceRowsResult.rows.filter((row) => row.projected_article_id).length,
      articleCount,
      articleStates: articleRows.reduce((acc, row) => {
        const key = String(row.processingState ?? "unknown");
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
      }, {}),
      finalSelection: {
        total: Number(finalSelectionResult.rows[0]?.total ?? 0),
        selected: selectedCount,
      },
      systemFeed: {
        total: Number(systemFeedResult.rows[0]?.total ?? 0),
        eligible: Number(systemFeedResult.rows[0]?.eligible ?? 0),
      },
      criterionMatches,
      sampleResources: resourceRowsResult.rows.slice(0, 5).map((row) => ({
        resourceId: row.resource_id,
        resourceKind: row.resource_kind,
        extractionState: row.extraction_state,
        projectedArticleId: row.projected_article_id,
        url: row.url,
        title: row.title,
      })),
      sampleArticles: articleRows.slice(0, 5),
      classification,
    });
  }

  return {
    perSiteEvidence: evidence,
    representativeMatches: representativeMatches.slice(0, 20),
  };
}

function buildAggregateSummary(perSiteEvidence) {
  const categories = {};
  let totalResources = 0;
  let totalArticles = 0;
  let totalSelected = 0;
  let totalEligible = 0;

  for (const site of perSiteEvidence) {
    categories[site.classification.category] =
      (categories[site.classification.category] ?? 0) + 1;
    totalResources += Number(site.resourceCount ?? 0);
    totalArticles += Number(site.articleCount ?? 0);
    totalSelected += Number(site.finalSelection?.selected ?? 0);
    totalEligible += Number(site.systemFeed?.eligible ?? 0);
  }

  return {
    classificationCounts: categories,
    totalResources,
    totalArticles,
    totalSelected,
    totalEligible,
  };
}

function buildRunAggregateSummary(perSiteEvidence, skippedSites) {
  const aggregate = buildAggregateSummary(perSiteEvidence);
  for (const site of skippedSites) {
    const category = String(site.classification?.category ?? "skipped_rejected_open_web");
    aggregate.classificationCounts[category] =
      (aggregate.classificationCounts[category] ?? 0) + 1;
  }
  return aggregate;
}

function formatEvidenceMarkdown(summary) {
  const lines = [];
  lines.push("# Live Website Outsourcing Evidence");
  lines.push("");
  lines.push(`- Run ID: \`${summary.runId}\``);
  lines.push(`- Imported open-web sites: \`${summary.importedChannelCount}\``);
  lines.push(`- Ready sites: \`${summary.websiteCandidates.counts.ready}\``);
  lines.push(`- Browser-fallback sites: \`${summary.websiteCandidates.counts.needsBrowserFallback}\``);
  lines.push(`- Skipped rejected-open-web sites: \`${summary.websiteCandidates.counts.skippedRejectedOpenWeb}\``);
  lines.push(`- Total web resources: \`${summary.aggregate.totalResources}\``);
  lines.push(`- Total projected articles: \`${summary.aggregate.totalArticles}\``);
  lines.push(`- Total selected final-selection rows: \`${summary.aggregate.totalSelected}\``);
  lines.push(`- Total eligible compatibility feed rows: \`${summary.aggregate.totalEligible}\``);
  lines.push("");
  lines.push("## Classification");
  lines.push("");
  for (const [category, count] of Object.entries(summary.aggregate.classificationCounts)) {
    lines.push(`- ${category}: ${count}`);
  }
  if (summary.skippedSources.length > 0) {
    lines.push("");
    lines.push("## Skipped Sources");
    lines.push("");
    for (const site of summary.skippedSources) {
      lines.push(`- ${site.siteName}: ${site.classification.reason}`);
    }
  }
  lines.push("");
  lines.push("## Per-site Summary");
  lines.push("");
  for (const site of summary.perSiteEvidence) {
    lines.push(`### ${site.siteName}`);
    lines.push("");
    lines.push(`- Classification: \`${site.classification.category}\``);
    lines.push(`- Reason: ${site.classification.reason}`);
    lines.push(`- Fetch outcome: \`${site.latestFetchRun?.outcomeKind ?? "none"}\``);
    lines.push(`- Resources: \`${site.resourceCount}\``);
    lines.push(`- Projected articles: \`${site.articleCount}\``);
    lines.push(`- Final selection selected: \`${site.finalSelection.selected}\``);
    lines.push(`- System feed eligible: \`${site.systemFeed.eligible}\``);
    if (site.criterionMatches.length > 0) {
      lines.push(`- Representative criterion match: ${site.criterionMatches[0].criterionName ?? "unknown criterion"} — ${site.criterionMatches[0].title ?? "untitled"}`);
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

async function writeEvidenceFiles(summary) {
  const basePath = `/tmp/newsportal-live-website-outsourcing-${summary.runId}`;
  const jsonPath = `${basePath}.json`;
  const mdPath = `${basePath}.md`;
  await writeFile(jsonPath, JSON.stringify(summary, null, 2), "utf8");
  await writeFile(mdPath, formatEvidenceMarkdown(summary), "utf8");
  return { jsonPath, mdPath };
}

async function main() {
  const runId = new Date().toISOString().replace(/[:.]/g, "").replace("T", "T").replace("Z", "Z");
  const env = await readEnvFile(".env.dev");
  applyEnv(env);

  log("Verifying local health and empty DB baseline");
  const health = verifyHealth();
  process.env.DATABASE_URL = buildDatabaseUrl(env);
  const runtimeDependencies = await loadRuntimeDependencies();
  const pool = runtimeDependencies.getPool();

  try {
    const emptyCounts = await readEmptyTableCounts(pool);
    assertEmptyCounts(emptyCounts);

    log("Loading outsourcing bundle and website source list");
    const outsourcingBundle = OUTSOURCE_EXAMPLE_C_BUNDLE;
    const templateParity = assertTemplateParity(outsourcingBundle);
    const websiteCandidates = await loadJson("docs/data_scripts/web.json");
    const candidateSet = validateWebsiteCandidateSet(websiteCandidates);

    log("Importing LLM templates and system-interest templates");
    const templateResults = await upsertTemplates(pool, outsourcingBundle, runtimeDependencies);

    log("Waiting for criterion compile completion");
    const criterionCompile = await waitForCriteriaCompiled(
      pool,
      OUTSOURCE_EXAMPLE_C_PARITY.interestTemplateNames.length
    );

    log("Queueing interest_centroids rebuild");
    const reindexJobId = await queueReindex(pool, runtimeDependencies);
    const reindexStatus = await waitForReindexCompleted(pool, reindexJobId);

    log("Importing open-web website channels");
    const websiteImport = await upsertWebsiteSources(
      pool,
      candidateSet.importedSites,
      runtimeDependencies
    );

    log("Triggering first poll for each imported website channel");
    const pollResults = await pollImportedChannels(websiteImport.channels);

    log("Waiting for downstream settle");
    const settleState = await waitForDownstreamSettle(pool, websiteImport.channels);

    log("Collecting per-site evidence");
    const evidence = await readPerSiteEvidence(pool, candidateSet.importedSites);
    const aggregate = buildRunAggregateSummary(
      evidence.perSiteEvidence,
      candidateSet.skippedSites
    );
    const summary = {
      runId,
      health,
      emptyBaselineCounts: emptyCounts,
      websiteCandidates: candidateSet,
      templateParity,
      criterionCompile,
      reindex: {
        reindexJobId,
        ...reindexStatus,
      },
      importedChannelCount: websiteImport.channels.length,
      templateImport: templateResults,
      channelImport: {
        createdChannelIds: websiteImport.upsertResult.createdChannelIds,
        updatedChannelIds: websiteImport.upsertResult.updatedChannelIds,
        channels: websiteImport.channels,
      },
      pollResults,
      settleState,
      aggregate,
      skippedSources: candidateSet.skippedSites,
      perSiteEvidence: evidence.perSiteEvidence,
      representativeMatches: evidence.representativeMatches,
    };
    const evidencePaths = await writeEvidenceFiles(summary);

    log(`Evidence JSON: ${evidencePaths.jsonPath}`);
    log(`Evidence Markdown: ${evidencePaths.mdPath}`);
    log(
      `Classification summary: ${Object.entries(aggregate.classificationCounts)
        .map(([category, count]) => `${category}=${count}`)
        .join(", ")}`
    );

    const implementationIssues = aggregate.classificationCounts.implementation_issue ?? 0;
    if (implementationIssues > 0) {
      throw new Error(
        `The live run completed with ${implementationIssues} implementation_issue classification(s). Evidence: ${evidencePaths.jsonPath}`
      );
    }
  } finally {
    await pool.end();
  }
}

void main().catch((error) => {
  console.error(`[live-website-outsourcing] ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  process.exit(1);
});

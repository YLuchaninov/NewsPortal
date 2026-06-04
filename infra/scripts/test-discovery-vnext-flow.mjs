import { randomUUID } from "node:crypto";
import { rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import {
  apiBaseUrl,
  composeArgs,
  createLogger,
  getJson,
  postJson,
  runCommand,
  runCompose,
  runComposeCapture,
  waitFor,
  waitForHttpHealth,
  ensureComposeStack,
} from "./lib/mcp-http-testkit.mjs";

const PRIVATE_HOST_ALLOWLIST_ENV = "FETCHERS_ACQUISITION_PRIVATE_HOST_ALLOWLIST";

function parseArgs(argv) {
  return {
    skipBuild: argv.includes("--skip-build"),
    liveSmoke: argv.includes("--live-smoke"),
  };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function jsonLiteral(value) {
  return `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
}

function sqlLiteral(value) {
  return `'${String(value ?? "").replaceAll("'", "''")}'`;
}

function psql(sql, { allowFailure = false } = {}) {
  return runCommand(
    "docker",
    [
      ...composeArgs,
      "exec",
      "-T",
      "postgres",
      "psql",
      "-U",
      "signalops",
      "-d",
      "signalops",
      "-v",
      "ON_ERROR_STOP=1",
      "-q",
      "-tA",
      "-c",
      sql,
    ],
    { capture: true, allowFailure }
  );
}

function queryJson(sql) {
  const { stdout } = psql(
    `select coalesce(jsonb_agg(to_jsonb(rows)), '[]'::jsonb) from (${sql}) rows`
  );
  return JSON.parse(stdout.trim() || "[]");
}

function queryScalar(sql) {
  return (
    psql(sql)
      .stdout.split(/\r?\n/u)
      .map((line) => line.trim())
      .find((line) => line && !/^(insert|update|delete)\s+\d+/iu.test(line)) ?? ""
  );
}

function rows(payload) {
  return Array.isArray(payload?.items) ? payload.items : [];
}

async function waitForFetchersHealth() {
  await waitFor(
    "fetchers health",
    async () =>
      runComposeCapture(
        "exec",
        "-T",
        "fetchers",
        "wget",
        "-qO-",
        "http://127.0.0.1:4100/health"
      ).stdout.trim(),
    Boolean,
    { timeoutMs: 180000, intervalMs: 2000 }
  );
}

function buildFixtureServerScript() {
  return `
import { createServer } from "node:http";
import { writeFileSync } from "node:fs";

const namespace = process.argv[process.argv.length - 2];
const statePath = process.argv[process.argv.length - 1];
const state = { pid: null, port: null, requests: [] };

function persistState() {
  writeFileSync(statePath, JSON.stringify(state));
}

const server = createServer((request, response) => {
  const host = request.headers.host || "127.0.0.1";
  const baseUrl = \`http://\${host}\`;
  state.requests.push({ url: request.url, method: request.method, at: new Date().toISOString() });
  persistState();

  if (request.url === "/feed.xml") {
    response.writeHead(200, { "content-type": "application/rss+xml; charset=utf-8" });
    response.end(\`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Discovery vNext fixture \${namespace}</title>
    <link>\${baseUrl}/</link>
    <description>Deterministic discovery fixture.</description>
    <item>
      <guid>fixture-\${namespace}-1</guid>
      <title>Fixture update \${namespace}</title>
      <link>\${baseUrl}/signal_candidate-1</link>
      <description>Public observable update for deterministic discovery flow.</description>
      <pubDate>Fri, 29 May 2026 10:00:00 GMT</pubDate>
    </item>
    <item>
      <guid>fixture-\${namespace}-2</guid>
      <title>Fixture second update \${namespace}</title>
      <link>\${baseUrl}/signal_candidate-2</link>
      <description>Second public observable update for rediscovery proof.</description>
      <pubDate>Fri, 29 May 2026 11:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>\`);
    return;
  }

  if (request.url === "/sitemap.xml") {
    response.writeHead(200, { "content-type": "application/xml; charset=utf-8" });
    response.end(\`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>\${baseUrl}/signal_candidate-1</loc><lastmod>2026-05-29</lastmod></url>
  <url><loc>\${baseUrl}/signal_candidate-2</loc><lastmod>2026-05-29</lastmod></url>
</urlset>\`);
    return;
  }

  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(\`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Discovery vNext fixture \${namespace}</title>
    <link rel="alternate" type="application/rss+xml" href="\${baseUrl}/feed.xml">
  </head>
  <body>
    <main>
      <h1>Discovery vNext fixture \${namespace}</h1>
      <a href="\${baseUrl}/signal_candidate-1">Fixture signal_candidate one</a>
      <a href="\${baseUrl}/signal_candidate-2">Fixture signal_candidate two</a>
    </main>
  </body>
</html>\`);
});

server.listen(0, "127.0.0.1", () => {
  state.pid = process.pid;
  state.port = server.address().port;
  persistState();
});
`;
}

async function startFixtureServer(namespace) {
  const statePath = `/tmp/signalops-discovery-vnext-flow-${namespace}.json`;
  const remoteScriptPath = `/tmp/signalops-discovery-vnext-flow-${namespace}.mjs`;
  const localScriptPath = path.join("/tmp", `signalops-discovery-vnext-flow-${namespace}.mjs`);

  await writeFile(localScriptPath, buildFixtureServerScript(), "utf8");
  try {
    runCompose("cp", localScriptPath, `fetchers:${remoteScriptPath}`);
  } finally {
    await rm(localScriptPath, { force: true });
  }

  runCompose("exec", "-T", "-d", "fetchers", "node", remoteScriptPath, namespace, statePath);
  const readState = async () =>
    JSON.parse(runComposeCapture("exec", "-T", "fetchers", "cat", statePath).stdout);
  const state = await waitFor(
    "Discovery vNext fixture readiness",
    readState,
    (payload) => Number.isInteger(payload?.pid) && Number.isInteger(payload?.port) && payload.port > 0,
    { timeoutMs: 60000, intervalMs: 500 }
  );

  return {
    port: state.port,
    readState,
    close: async () => {
      try {
        runCompose(
          "exec",
          "-T",
          "fetchers",
          "node",
          "--input-type=module",
          "-e",
          "process.kill(Number(process.argv[1]), 'SIGTERM')",
          String(state.pid)
        );
      } catch {
        // best effort cleanup for detached fixture processes
      }
      try {
        runCompose("exec", "-T", "--user", "root", "fetchers", "rm", "-f", statePath, remoteScriptPath);
      } catch {
        // best effort cleanup for copied fixture assets
      }
    },
  };
}

async function apiPost(pathname, payload, options = {}) {
  return await postJson(`${apiBaseUrl}${pathname}`, payload, {
    timeoutMs: 60000,
    ...options,
  });
}

async function apiGet(pathname, options = {}) {
  return await getJson(`${apiBaseUrl}${pathname}`, {
    timeoutMs: 60000,
    ...options,
  });
}

async function cleanupNamespace({ actor, namespace, fixtureUrl, report }) {
  try {
    const cleanupSql = `
delete from discovery_rollback_actions
where rollback_group_id in (
  select rollback_group_id from discovery_rollback_groups
  where created_by = ${sqlLiteral(actor)}
     or source_inventory_id in (
       select source_inventory_id
       from source_inventory
       where source_identity_key like ${sqlLiteral(`${namespace}%`)}
          or canonical_url = ${sqlLiteral(fixtureUrl)}
     )
);

delete from discovery_rollback_groups
where created_by = ${sqlLiteral(actor)}
   or source_inventory_id in (
     select source_inventory_id
     from source_inventory
     where source_identity_key like ${sqlLiteral(`${namespace}%`)}
        or canonical_url = ${sqlLiteral(fixtureUrl)}
   );

delete from adapter_backlog
where source_inventory_id in (
  select source_inventory_id
  from source_inventory
  where source_identity_key like ${sqlLiteral(`${namespace}%`)}
     or canonical_url = ${sqlLiteral(fixtureUrl)}
);

delete from source_inventory
where source_identity_key like ${sqlLiteral(`${namespace}%`)}
   or canonical_url = ${sqlLiteral(fixtureUrl)};

delete from outbox_events
where aggregate_id in (
  select channel_id
  from source_channels
  where fetch_url = ${sqlLiteral(fixtureUrl)}
     or homepage_url = ${sqlLiteral(fixtureUrl)}
     or config_json->>'createdBy' = ${sqlLiteral(actor)}
     or config_json->>'discoveryFlowNamespace' = ${sqlLiteral(namespace)}
)
   or payload_json::text like ${sqlLiteral(`%${namespace}%`)};

delete from inbox_processed_events
where event_id in (
  select event_id
  from outbox_events
  where aggregate_type = 'signal_candidate'
    and aggregate_id in (
      select doc_id
      from signal_candidates
      where channel_id in (
        select channel_id
        from source_channels
        where fetch_url = ${sqlLiteral(fixtureUrl)}
           or homepage_url = ${sqlLiteral(fixtureUrl)}
           or config_json->>'createdBy' = ${sqlLiteral(actor)}
           or config_json->>'discoveryFlowNamespace' = ${sqlLiteral(namespace)}
      )
    )
);

delete from outbox_events
where aggregate_type = 'signal_candidate'
  and aggregate_id in (
    select doc_id
    from signal_candidates
    where channel_id in (
      select channel_id
      from source_channels
      where fetch_url = ${sqlLiteral(fixtureUrl)}
         or homepage_url = ${sqlLiteral(fixtureUrl)}
         or config_json->>'createdBy' = ${sqlLiteral(actor)}
         or config_json->>'discoveryFlowNamespace' = ${sqlLiteral(namespace)}
    )
  );

delete from signal_candidates
where channel_id in (
  select channel_id
  from source_channels
  where fetch_url = ${sqlLiteral(fixtureUrl)}
     or homepage_url = ${sqlLiteral(fixtureUrl)}
     or config_json->>'createdBy' = ${sqlLiteral(actor)}
     or config_json->>'discoveryFlowNamespace' = ${sqlLiteral(namespace)}
);

delete from source_channels
where fetch_url = ${sqlLiteral(fixtureUrl)}
   or homepage_url = ${sqlLiteral(fixtureUrl)}
   or config_json->>'createdBy' = ${sqlLiteral(actor)}
   or config_json->>'discoveryFlowNamespace' = ${sqlLiteral(namespace)};

delete from discovery_feedback_events
where created_by = ${sqlLiteral(actor)}
   or feedback_json::text like ${sqlLiteral(`%${namespace}%`)};

delete from discovery_replay_runs
where created_by = ${sqlLiteral(actor)}
   or vnext_run_id in (
     select vnext_run_id
     from discovery_vnext_runs
     where created_by = ${sqlLiteral(actor)}
        or request_json::text like ${sqlLiteral(`%${namespace}%`)}
   );

delete from discovery_llm_gateway_events
where created_by = ${sqlLiteral(actor)}
   or vnext_run_id in (
     select vnext_run_id
     from discovery_vnext_runs
     where created_by = ${sqlLiteral(actor)}
        or request_json::text like ${sqlLiteral(`%${namespace}%`)}
   );

delete from discovery_query_attempts
where created_by = ${sqlLiteral(actor)}
   or vnext_run_id in (
     select vnext_run_id
     from discovery_vnext_runs
     where created_by = ${sqlLiteral(actor)}
        or request_json::text like ${sqlLiteral(`%${namespace}%`)}
   );

delete from discovery_artifacts
where created_by = ${sqlLiteral(actor)}
   or vnext_run_id in (
     select vnext_run_id
     from discovery_vnext_runs
     where created_by = ${sqlLiteral(actor)}
        or request_json::text like ${sqlLiteral(`%${namespace}%`)}
   );

delete from discovery_candidates
where vnext_run_id in (
     select vnext_run_id
     from discovery_vnext_runs
     where created_by = ${sqlLiteral(actor)}
        or request_json::text like ${sqlLiteral(`%${namespace}%`)}
   )
   or canonical_url = ${sqlLiteral(fixtureUrl)};

delete from discovery_vnext_runs
where created_by = ${sqlLiteral(actor)}
   or request_json::text like ${sqlLiteral(`%${namespace}%`)};
`;
    psql(cleanupSql);
    report.cleanup = { status: "succeeded" };
  } catch (error) {
    report.cleanup = { status: "failed", error: error instanceof Error ? error.message : String(error) };
  }
}

function assertStaticDenylist() {
  const denylist = [
    "discovery_v3",
    "DiscoveryV3",
    "DISCOVERY_V3",
    "discovery.v3",
    "discovery_targets",
    "discovery_source_endpoints",
    "source_priors",
  ];
  const allowlist = [
    /^database\/migrations\/00\d+_/u,
  ];
  const matches = [];
  for (const term of denylist) {
    const result = runCommand("rg", ["-n", "--fixed-strings", term, "."], {
      capture: true,
      allowFailure: true,
    });
    for (const line of result.stdout.split(/\r?\n/u).filter(Boolean)) {
      const file = line.split(":")[0]?.replace(/^\.\//u, "") ?? "";
      if (file === "infra/scripts/test-discovery-vnext-flow.mjs") {
        continue;
      }
      if (allowlist.some((pattern) => pattern.test(file))) {
        continue;
      }
      matches.push(line);
    }
  }
  assert(matches.length === 0, `Retired Discovery v3 terms found outside allowlist:\n${matches.join("\n")}`);
}

async function runDeterministicFlow({ skipBuild }) {
  const log = createLogger("discovery-vnext-flow");
  const runUuid = randomUUID();
  const namespace = `dvf-${runUuid.slice(0, 12)}`;
  const interestId = runUuid;
  const actor = `discovery-vnext-flow:${namespace}`;
  const report = {
    namespace,
    actor,
    startedAt: new Date().toISOString(),
    steps: [],
  };
  let fixture = null;
  let fixtureUrl = "";
  let runId;
  let candidateId;
  let sourceInventoryId;
  let rollbackGroupId;
  let channelId;

  if (!String(process.env[PRIVATE_HOST_ALLOWLIST_ENV] ?? "").trim()) {
    process.env[PRIVATE_HOST_ALLOWLIST_ENV] = "127.0.0.1";
  }

  try {
    log("Ensuring compose stack and fetchers private-host fixture allowlist.");
    await ensureComposeStack(log, { rebuild: !skipBuild });
    runCompose("up", "-d", "--force-recreate", "fetchers");
    await Promise.all([
      waitForHttpHealth("api", `${apiBaseUrl}/health`),
      waitForFetchersHealth(),
    ]);

    fixture = await startFixtureServer(namespace);
    fixtureUrl = `http://127.0.0.1:${fixture.port}/feed.xml`;
    report.fixtureUrl = fixtureUrl;
    log(`Fixture server is running inside fetchers at ${fixtureUrl}.`);

    await cleanupNamespace({ actor, namespace, fixtureUrl, report });

    assertStaticDenylist();
    report.steps.push("static-denylist");

    const policies = await apiGet("/maintenance/discovery/policies?page=1&pageSize=50");
    const activePolicyNames = new Set(
      rows(policies.json).filter((row) => row.status === "active").map((row) => row.policy_name)
    );
    for (const name of ["discovery-runtime", "discovery-routing", "discovery-probe", "discovery-mega-loop"]) {
      assert(activePolicyNames.has(name), `Missing active policy ${name}.`);
    }
    report.steps.push("active-policies");

    await apiPost(
      "/maintenance/discovery/runs/start",
      {
        runKind: "candidate_acquisition",
        triggerKind: "api",
        request: {
          interest: {
            interestId,
            name: "Discovery vNext deterministic live fail-closed",
            description: "Exercise live provider fail-closed behavior.",
          },
          searchProvider: "stub",
        },
        budget: { maxRunCostCents: 0 },
        liveProviderExecution: true,
        createdBy: actor,
      },
      { expectStatus: 503 }
    );
    report.steps.push("live-fail-closed");

    const runStart = await apiPost("/maintenance/discovery/runs/start", {
      runKind: "full",
      triggerKind: "api",
      request: {
        interest: {
          interestId,
          name: "Discovery vNext deterministic policy updates",
          description: "Track public observable policy and regulatory update feeds.",
          languages: ["en"],
          geographies: ["US"],
        },
        searchProvider: "stub",
        maxBatches: 2,
      },
      budget: { maxRunCostCents: 1, maxQueryAttempts: 4 },
      liveProviderExecution: false,
      createdBy: actor,
    });
    runId = String(runStart.json?.run?.vnext_run_id ?? "");
    assert(runId, "runs/start must return a vNext run id.");
    const fullRunSteps = Array.isArray(runStart.json?.result?.steps) ? runStart.json.result.steps : [];
    assert(
      JSON.stringify(fullRunSteps.slice(0, 3)) ===
        JSON.stringify(["brief_compile", "mega_loop", "candidate_acquisition"]),
      "Full non-live run must start with the initial bounded pipeline steps."
    );
    assert(
      ["probe", "understand_route"].every((step) => fullRunSteps.includes(step)),
      `Full non-live run must continue through probe and understand/route steps: ${JSON.stringify(fullRunSteps)}`
    );
    const runSteps = queryJson(
      `select step_kind, status from discovery_run_steps where vnext_run_id = ${sqlLiteral(runId)} order by created_at`
    );
    assert(
      runSteps
        .map((row) => row.step_kind)
        .slice(0, 3)
        .join(",") === "brief_compile,mega_loop,candidate_acquisition",
      `Unexpected initial run step order: ${JSON.stringify(runSteps)}`
    );
    const runArtifacts = queryJson(
      `select artifact_id::text, artifact_type, status, payload_json from discovery_artifacts where vnext_run_id = ${sqlLiteral(runId)} order by created_at`
    );
    assert(runArtifacts.some((row) => row.artifact_type === "DiscoveryBrief"), "DiscoveryBrief artifact missing.");
    assert(runArtifacts.some((row) => row.artifact_type === "HypothesisBatch"), "HypothesisBatch artifacts missing.");
    const runQueryAttempts = queryJson(
      `select query_attempt_id::text, status, provider, live_provider_execution, cost_cents from discovery_query_attempts where vnext_run_id = ${sqlLiteral(runId)} order by created_at`
    );
    assert(runQueryAttempts.length > 0, "Candidate acquisition must persist query attempts.");
    assert(
      runQueryAttempts.every((row) => row.live_provider_execution === false && Number(row.cost_cents) === 0),
      "Non-live candidate acquisition must not use live providers or cost."
    );
    report.steps.push("full-non-live-run");

    const briefArtifact = runArtifacts.find((row) => row.artifact_type === "DiscoveryBrief");
    const hypothesisArtifact = runArtifacts.find((row) => row.artifact_type === "HypothesisBatch");
    assert(briefArtifact?.artifact_id, "Need persisted DiscoveryBrief artifact for replay.");
    assert(hypothesisArtifact?.artifact_id, "Need persisted HypothesisBatch artifact for candidate creation.");

    const createCandidates = async () =>
      await apiPost("/maintenance/discovery/candidates", {
        results: [
          {
            url: fixtureUrl,
            title: "Deterministic Discovery vNext fixture feed",
            snippet: "A deterministic RSS fixture with observable public updates.",
            candidateKindGuess: "rss",
          },
        ],
        hypothesisId: `${namespace}:hypothesis:fixture`,
        hypothesisArtifactId: hypothesisArtifact.artifact_id,
        queryAttemptId: String(runQueryAttempts[0]?.query_attempt_id ?? ""),
        query: "deterministic discovery fixture feed",
        queryFamilyIntent: "official_update_feed",
        runId,
        interestId,
        createdBy: actor,
      });
    const firstCandidateCreate = await createCandidates();
    const secondCandidateCreate = await createCandidates();
    const candidate = secondCandidateCreate.json?.candidates?.[0] ?? firstCandidateCreate.json?.candidates?.[0];
    candidateId = String(candidate?.candidate_id ?? "");
    assert(candidateId, "Candidate creation must persist a candidate id.");
    assert(Number(candidate?.rediscovery_count ?? 0) >= 2, "Duplicate candidate must increment rediscovery_count.");
    assert(
      firstCandidateCreate.json?.queryQualityReportArtifact?.artifact_type === "QueryQualityReport",
      "Candidate creation must persist a QueryQualityReport artifact."
    );
    report.steps.push("candidate-dedupe");

    const probePlan = await apiPost("/maintenance/discovery/probe/plan/preview", {
      candidateUrl: fixtureUrl,
      candidateKindGuess: "rss",
    });
    const probePlanPayload = probePlan.json?.payload ?? probePlan.json;
    assert(
      Number(probePlanPayload?.limits?.maxBrowserRequests ?? -1) === 0,
      "Probe policy must keep browser probing disabled for deterministic flow."
    );
    const probeExecution = await apiPost("/maintenance/discovery/probe/execute", {
      probePlan: probePlanPayload,
      runId,
      interestId,
      candidateId,
      createdBy: actor,
    });
    const probeReport = probeExecution.json?.probeReportArtifact?.payload_json;
    assert(probeReport, "Probe execution must persist a ProbeReport artifact.");
    assert(
      String(JSON.stringify(probeReport)).includes("valid") || String(JSON.stringify(probeReport)).includes("sample"),
      "ProbeReport must include fetchers-owned RSS evidence."
    );
    const fixtureState = await fixture.readState();
    assert(
      fixtureState.requests.some((request) => request.url === "/feed.xml"),
      "Fetchers probe must call the deterministic RSS fixture."
    );
    report.steps.push("probe-fetchers-boundary");

    const scopeResolution = await apiPost("/maintenance/discovery/scope/resolve-apply", {
      discoveryBrief: briefArtifact.payload_json,
      probeReport,
      candidate: {
        candidateId,
        canonicalUrl: fixtureUrl,
        canonicalDomain: "127.0.0.1",
        candidateKindGuess: "rss",
      },
      runId,
      interestId,
      candidateId,
      parentArtifactIds: [String(probeExecution.json?.probeReportArtifact?.artifact_id ?? "")].filter(Boolean),
      createdBy: actor,
    });
    const sourceScopeResolution = scopeResolution.json?.sourceScopeResolutionArtifact?.payload_json;
    assert(sourceScopeResolution?.sourceScopeType === "feed", "Scope resolution must classify valid RSS fixture as feed.");
    report.steps.push("scope-resolution");

    const understand = await apiPost("/maintenance/discovery/understand/preview", {
      discoveryBrief: briefArtifact.payload_json,
      probeReport,
      sourceScopeResolution,
      candidate: {
        candidateId,
        canonicalUrl: fixtureUrl,
        canonicalDomain: "127.0.0.1",
        candidateKindGuess: "rss",
      },
    });
    const sourceUnderstanding =
      understand.json?.payload ??
      understand.json?.sourceUnderstanding?.payload ??
      understand.json?.sourceUnderstanding ??
      understand.json;
    assert(sourceUnderstanding?.yieldIndependent === true, "SourceUnderstanding must be yield-independent.");

    const routing = await apiPost("/maintenance/discovery/routing-decisions/apply", {
      sourceUnderstanding,
      canonicalUrl: sourceScopeResolution.resolvedSourceUrl ?? fixtureUrl,
      canonicalDomain: "127.0.0.1",
      sourceIdentityKey: `rss|127.0.0.1|${sourceScopeResolution.resolvedSourceUrl ?? fixtureUrl}`,
      providerType: "rss",
      accessPattern: "public",
      runId,
      interestId,
      candidateId,
      createdBy: actor,
    });
    const routingDecision = routing.json?.routingDecisionArtifact?.payload_json;
    assert(
      routingDecision?.decision === "auto_register_probation",
      `Expected auto_register_probation, got ${routingDecision?.decision ?? "missing"}.`
    );
    sourceInventoryId = String(routing.json?.sourceInventory?.source_inventory_id ?? "");
    rollbackGroupId = String(routing.json?.rollback?.rollbackGroup?.rollback_group_id ?? "");
    assert(sourceInventoryId, "Routing must persist source inventory.");
    assert(rollbackGroupId, "Routing must prepare a rollback group for probation-capable decisions.");
    assert(
      routing.json?.monitoringState?.monitoring_mode === "probation",
      "Routing must write probation monitoring state."
    );
    assert(routing.json?.sourceObservation?.observation_id, "Routing must write a source observation.");
    report.steps.push("understand-route-monitoring");

    const notificationCountBefore = Number(
      queryScalar("select count(*)::int from notification_log").trim() || "0"
    );
    const handoff = await apiPost("/maintenance/discovery/probation/handoff", {
      sourceUnderstanding,
      routingDecision,
      sourceInventoryId,
      providerType: "rss",
      createdBy: actor,
      dryRun: false,
    });
    assert(handoff.json?.status === "applied", "Probation handoff must register through source registrar.");
    channelId = String(handoff.json?.registrarResults?.[0]?.channel_id ?? "");
    assert(channelId, "Probation handoff must return a channel id.");
    const channelRows = queryJson(
      `select channel_id::text, is_active, config_json from source_channels where channel_id = ${sqlLiteral(channelId)}`
    );
    assert(channelRows[0]?.config_json?.discovery?.version === "vnext-1", "Registered channel must be vNext-owned.");
    const syncEvents = queryJson(
      `select event_type, aggregate_id::text, payload_json from outbox_events where aggregate_id = ${sqlLiteral(channelId)} order by created_at`
    );
    assert(
      syncEvents.some((event) => event.event_type === "source.channel.sync.requested"),
      "Probation handoff must emit source.channel.sync.requested."
    );
    const notificationCountAfter = Number(
      queryScalar("select count(*)::int from notification_log").trim() || "0"
    );
    assert(notificationCountBefore === notificationCountAfter, "Probation handoff must not create retro notifications.");
    const postHandoffRollback = await apiPost("/maintenance/discovery/rollback/prepare", {
      sourceInventoryId,
      reason: "Rollback prepared after probation handoff registered a channel.",
      createdBy: actor,
    });
    rollbackGroupId = String(postHandoffRollback.json?.rollbackGroup?.rollback_group_id ?? "");
    assert(rollbackGroupId, "Rollback prepare after handoff must return a rollback group.");
    report.steps.push("probation-handoff");

    for (const replay of [
      {
        replayKind: "artifact_lineage",
        input: { artifactId: briefArtifact.artifact_id },
      },
      {
        replayKind: "routing_policy",
        input: { sourceUnderstanding, providerType: "rss", accessPattern: "public" },
      },
      {
        replayKind: "candidate_acquisition",
        input: {
          interestId,
          hypothesisId: `${namespace}:replay:hypothesis`,
          query: "deterministic discovery replay",
          queryFamilyIntent: "official_update_feed",
          results: [{ url: fixtureUrl, title: "Replay fixture feed", candidateKindGuess: "rss" }],
        },
      },
      {
        replayKind: "full_non_live",
        input: {
          request: {
            interest: {
              interestId,
              name: "Discovery vNext replay",
              description: "Replay deterministic discovery flow without providers.",
            },
            searchProvider: "stub",
            maxBatches: 1,
          },
        },
      },
    ]) {
      const replayResult = await apiPost("/maintenance/discovery/replay", {
        ...replay,
        dryRun: true,
        createdBy: actor,
      });
      assert(replayResult.json?.replay?.status === "succeeded", `${replay.replayKind} replay must succeed.`);
      assert(
        replayResult.json?.replay?.output_json?.liveProviderExecution === false,
        `${replay.replayKind} replay must remain non-live.`
      );
    }
    const liveQueryAttempts = queryJson(
      `select query_attempt_id::text from discovery_query_attempts where created_by = ${sqlLiteral(actor)} and live_provider_execution = true`
    );
    assert(liveQueryAttempts.length === 0, "Replay and deterministic flow must not create live query attempts.");
    report.steps.push("replay-non-live");

    const llm = await apiPost("/maintenance/discovery/llm-gateway", {
      task: "discovery_compile_interest_graph",
      payload: { namespace, goal: "Audit deterministic LLM gateway logging." },
      prompt: "Return a deterministic Discovery vNext audit note.",
      budget: { maxRunCostCents: 1 },
      liveProviderExecution: false,
      runId,
      artifactId: briefArtifact.artifact_id,
      createdBy: actor,
    });
    assert(llm.json?.event?.status === "succeeded", "Non-live LLM gateway must succeed with durable log.");
    await apiPost(
      "/maintenance/discovery/llm-gateway",
      {
        task: "discovery_compile_interest_graph",
        payload: { namespace },
        budget: { maxRunCostCents: 0 },
        liveProviderExecution: true,
        createdBy: actor,
      },
      { expectStatus: 503 }
    );
    const llmEvents = queryJson(
      `select task, status, live_provider_execution, cost_cents, deterministic_fallback from discovery_llm_gateway_events where created_by = ${sqlLiteral(actor)} order by created_at`
    );
    assert(llmEvents.length >= 1, "LLM gateway event must be persisted.");
    assert(llmEvents.some((event) => event.live_provider_execution === false), "LLM gateway log must mark non-live execution.");
    report.steps.push("llm-gateway");

    const nonVnextChannelId = queryScalar(
      `insert into source_channels (provider_type, name, fetch_url, homepage_url, config_json)
       values ('rss', ${sqlLiteral(`Non-vNext rollback guard ${namespace}`)}, ${sqlLiteral(`https://${namespace}.example.test/feed.xml`)}, ${sqlLiteral(`https://${namespace}.example.test/`)}, ${jsonLiteral({ discoveryFlowNamespace: namespace })})
       returning channel_id::text`
    );
    const nonVnextInventoryId = queryScalar(
      `insert into source_inventory (canonical_domain, canonical_url, source_identity_key, current_state, current_provider_type, registered_channel_id, tags)
       values (${sqlLiteral(`${namespace}.example.test`)}, ${sqlLiteral(`https://${namespace}.example.test/feed.xml`)}, ${sqlLiteral(`${namespace}:non-vnext`)}, 'probation_channel', 'rss', ${sqlLiteral(nonVnextChannelId)}, array['discovery-vnext'])
       returning source_inventory_id::text`
    );
    const nonVnextPrepare = await apiPost("/maintenance/discovery/rollback/prepare", {
      sourceInventoryId: nonVnextInventoryId,
      reason: "Verify rollback refuses non-vNext-owned channels.",
      createdBy: actor,
    });
    await apiPost(
      "/maintenance/discovery/rollback/apply",
      {
        rollbackGroupId: nonVnextPrepare.json?.rollbackGroup?.rollback_group_id,
        appliedBy: actor,
        confirm: true,
      },
      { expectStatus: 409 }
    );

    await apiPost("/maintenance/discovery/rollback/apply", {
      rollbackGroupId: rollbackGroupId,
      appliedBy: actor,
      confirm: true,
    });
    const rolledBackInventory = queryJson(
      `select current_state, registered_channel_id from source_inventory where source_inventory_id = ${sqlLiteral(sourceInventoryId)}`
    );
    assert(rolledBackInventory[0]?.current_state === "inventory", "Rollback must restore inventory state.");
    assert(rolledBackInventory[0]?.registered_channel_id == null, "Rollback must clear registered channel id.");
    const rolledBackChannel = queryJson(
      `select is_active from source_channels where channel_id = ${sqlLiteral(channelId)}`
    );
    assert(rolledBackChannel[0]?.is_active === false, "Rollback must pause the vNext-owned channel.");
    const rollbackSyncEvents = queryJson(
      `select event_type, payload_json from outbox_events where aggregate_id = ${sqlLiteral(channelId)} order by created_at`
    );
    assert(
      rollbackSyncEvents.filter((event) => event.event_type === "source.channel.sync.requested").length >= 2,
      "Rollback must emit a follow-up source.channel.sync.requested event."
    );
    report.steps.push("rollback");

    const diagnostics = await apiPost(`/maintenance/discovery/runs/${runId}/diagnose`, {});
    assert(
      Array.isArray(diagnostics.json?.runSteps) && diagnostics.json.runSteps.length >= 3,
      "Run diagnostics must expose persisted run steps."
    );
    const readSurfaces = await Promise.all([
      apiGet("/maintenance/discovery/run-steps?page=1&pageSize=5"),
      apiGet("/maintenance/discovery/query-attempts?page=1&pageSize=5"),
      apiGet("/maintenance/discovery/llm-gateway-events?page=1&pageSize=5"),
      apiGet("/maintenance/discovery/monitoring-state?page=1&pageSize=5"),
      apiGet("/maintenance/discovery/source-observations?page=1&pageSize=5"),
    ]);
    assert(readSurfaces.every((response) => Array.isArray(response.json?.items)), "All diagnostic list surfaces must respond.");
    report.steps.push("diagnostic-surfaces");

    report.status = "succeeded";
    report.completedAt = new Date().toISOString();
    const reportPath = path.join("/tmp", `signalops-discovery-vnext-flow-${namespace}.json`);
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    log(`Discovery vNext deterministic flow passed. Report: ${reportPath}`);
  } catch (error) {
    report.status = "failed";
    report.error = error instanceof Error ? error.message : String(error);
    report.completedAt = new Date().toISOString();
    const reportPath = path.join("/tmp", `signalops-discovery-vnext-flow-${namespace}.json`);
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    throw error;
  } finally {
    if (fixture) {
      await fixture.close();
    }
    if (fixtureUrl) {
      await cleanupNamespace({ actor, namespace, fixtureUrl, report });
    }
  }
}

async function runLiveSmoke({ skipBuild }) {
  const log = createLogger("discovery-vnext-live-smoke");
  const enabled = String(process.env.DISCOVERY_ENABLED ?? "").trim() === "1";
  const hasBudget = Number(process.env.DISCOVERY_LIVE_SMOKE_MAX_RUN_COST_CENTS ?? 0) > 0;
  const hasCredential =
    Boolean(String(process.env.DISCOVERY_BRAVE_API_KEY ?? "").trim()) ||
    Boolean(String(process.env.DISCOVERY_SERPER_API_KEY ?? "").trim()) ||
    Boolean(String(process.env.GEMINI_API_KEY ?? process.env.DISCOVERY_GEMINI_API_KEY ?? "").trim());
  if (!enabled || !hasBudget || !hasCredential) {
    log("Skipped: requires DISCOVERY_ENABLED=1, credentials, and DISCOVERY_LIVE_SMOKE_MAX_RUN_COST_CENTS > 0.");
    return;
  }

  await ensureComposeStack(log, { rebuild: !skipBuild });
  const actor = `discovery-vnext-live-smoke:${randomUUID()}`;
  const smoke = await apiPost("/maintenance/discovery/runs/start", {
    runKind: "candidate_acquisition",
    triggerKind: "api",
    request: {
      interest: {
        interestId: randomUUID(),
        name: "Discovery vNext live smoke",
        description: "One bounded live provider smoke query.",
      },
      maxBatches: 1,
    },
    budget: { maxRunCostCents: Number(process.env.DISCOVERY_LIVE_SMOKE_MAX_RUN_COST_CENTS) },
    liveProviderExecution: true,
    createdBy: actor,
  });
  assert(smoke.json?.run?.status === "succeeded", "Live smoke run must succeed when explicitly enabled.");
}

const args = parseArgs(process.argv.slice(2));
if (args.liveSmoke) {
  await runLiveSmoke(args);
} else {
  await runDeterministicFlow(args);
}

import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import process from "node:process";

import {
  LIVE_CALIBRATION_REPEAT_COUNTS,
  buildCalibrationComposeEnv,
  buildReplayEvalFixture,
  caseSourceRoleTargets,
  determineLiveCalibrationVerdicts,
  formatLiveCalibrationMarkdown,
  newRunId,
  normalizeText,
  asArray,
  sqlJson,
  sqlText,
  summarizeCaseIteration,
  validateLiveCalibrationCasePack,
  buildTuningRecommendations,
  liveCalibrationCasePacksForSet,
} from "./lib/discovery-live-calibration.mjs";
import {
  apiBaseUrl,
  getJson,
  postJson,
  queryPostgresWithoutCommandTags,
  readEnvFile,
  runCommand,
  sendRequest,
  waitForCondition,
  waitForHttpHealth,
} from "./lib/compose-proof-testkit.mjs";

const TERMINAL_RUN_STATUSES = new Set(["completed", "failed", "cancelled"]);
const TERMINAL_SEQUENCE_STATUSES = new Set(["completed", "succeeded", "failed", "cancelled"]);

function log(message) {
  console.log(`[live-discovery-calibration] ${message}`);
}

function parseArgs(argv) {
  const options = { mode: "calibration", caseSet: "core", cases: null, repeat: null };
  for (const arg of argv) {
    if (arg.startsWith("--mode=")) {
      options.mode = arg.slice("--mode=".length);
    } else if (arg.startsWith("--case-set=")) {
      options.caseSet = arg.slice("--case-set=".length);
    } else if (arg.startsWith("--cases=")) {
      options.cases = arg.slice("--cases=".length).split(",").map((item) => item.trim()).filter(Boolean);
    } else if (arg.startsWith("--repeat=")) {
      const repeat = Number(arg.slice("--repeat=".length));
      if (!Number.isInteger(repeat) || repeat <= 0 || repeat > 10) {
        throw new Error(`Unsupported repeat count ${arg.slice("--repeat=".length)}.`);
      }
      options.repeat = repeat;
    }
  }
  if (!["calibration", "acceptance", "soak"].includes(options.mode)) {
    throw new Error(`Unsupported calibration mode ${options.mode}.`);
  }
  if (!["core", "extended", "all"].includes(options.caseSet)) {
    throw new Error(`Unsupported calibration case set ${options.caseSet}.`);
  }
  return options;
}

function selectCases(caseKeys, caseSet = "core") {
  const casePacks = liveCalibrationCasePacksForSet(caseSet);
  if (!caseKeys || caseKeys.length === 0) {
    return casePacks;
  }
  const wanted = new Set(caseKeys);
  const selected = casePacks.filter((casePack) => wanted.has(casePack.key));
  if (selected.length !== wanted.size) {
    const found = new Set(selected.map((casePack) => casePack.key));
    const missing = [...wanted].filter((key) => !found.has(key));
    throw new Error(`Unknown live calibration case(s): ${missing.join(", ")}.`);
  }
  return selected;
}

async function ensureLiveComposeStack(env) {
  log("Starting compose stack with bounded v3 live discovery enabled.");
  runCommand("pnpm", ["dev:mvp:internal"], { env });
  await Promise.all([
    waitForHttpHealth("api", `${apiBaseUrl}/health`, { timeoutMs: 180000 }),
    waitForHttpHealth("admin", "http://127.0.0.1:4322/api/health", { timeoutMs: 180000 }),
    waitForHttpHealth("nginx", "http://127.0.0.1:8080/health", { timeoutMs: 180000 }),
  ]);
}

async function checkApiSurfaces() {
  const v3Paths = [
    "/maintenance/discovery/targets",
    "/maintenance/discovery/runs",
    "/maintenance/discovery/endpoints",
    "/maintenance/discovery/contracts",
    "/maintenance/discovery/claims",
    "/maintenance/discovery/negative-evidence",
    "/maintenance/discovery/provider-health",
    "/maintenance/discovery/llm-decisions",
  ];
  const retiredPaths = [
    "/maintenance/discovery/missions",
    "/maintenance/discovery/candidates",
    "/maintenance/discovery/recall-candidates",
  ];
  const checks = [];
  for (const path of v3Paths) {
    const response = await getJson(`${apiBaseUrl}${path}`, { expectStatus: 200, timeoutMs: 15000 });
    checks.push({ path, status: "passed", httpStatus: response.status });
  }
  for (const path of retiredPaths) {
    const response = await sendRequest(`${apiBaseUrl}${path}`, {
      headers: { Accept: "application/json" },
      timeoutMs: 15000,
    });
    checks.push({
      path,
      status: [404, 405].includes(response.status) ? "passed" : "failed",
      httpStatus: response.status,
    });
  }
  return checks;
}

async function createTarget(casePack, runId, iteration) {
  const targetPayload = {
    ...casePack.target,
    title: casePack.target.title,
    prompt: casePack.target.prompt,
    description: [
      normalizeText(casePack.target.description),
      `Live calibration run ${runId}, iteration ${iteration}.`,
    ].filter(Boolean).join(" "),
    autopilotProfile: casePack.autopilotProfile,
    createdBy: "live-calibration",
  };
  const created = await postJson(
    `${apiBaseUrl}/maintenance/discovery/targets/create-simple`,
    targetPayload,
    { expectStatus: 201, timeoutMs: 30000 }
  );
  const target = created.json;
  const graph = {
    ...(target.graph_json ?? target.graphJson ?? {}),
    sourceRoleTargets: caseSourceRoleTargets(casePack),
  };
  const patched = await patchJson(
    `${apiBaseUrl}/maintenance/discovery/targets/${target.target_id ?? target.targetId}`,
    {
      graphJson: graph,
      policyJson: {
        ...(target.policy_json ?? target.policyJson ?? {}),
        liveCalibration: true,
        liveCalibrationCaseSet: casePack.caseSet ?? "core",
        websiteAutoPromotion: false,
        socialDefaultAction: "monitor_only",
      },
    }
  );
  return patched;
}

async function patchJson(url, payload) {
  const body = JSON.stringify(payload);
  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body,
  });
  const text = await response.text();
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`PATCH ${url} returned ${response.status}: ${text.slice(0, 400)}`);
  }
  return JSON.parse(text);
}

async function createDiscoveryRun(casePack, targetId, seededSource) {
  const boundedRunPayload = {
    targetId,
    requestedBy: "live-calibration",
    maxDepth: casePack.flow === "guards" ? 1 : 2,
    maxHypotheses: casePack.flow === "guards" ? 20 : 60,
    maxSearchResults: 12,
    maxDomains: 80,
    maxEndpoints: 120,
    maxSocialItems: 0,
  };
  if (casePack.flow === "source_expand" && seededSource?.channelId) {
    const response = await postJson(
      `${apiBaseUrl}/maintenance/discovery/sources/${seededSource.channelId}/expand`,
      boundedRunPayload,
      { expectStatus: 200, timeoutMs: 20000 }
    );
    return response.json;
  }
  if (casePack.flow === "replacement" && seededSource?.channelId) {
    const response = await postJson(
      `${apiBaseUrl}/maintenance/discovery/sources/${seededSource.channelId}/replace-candidates`,
      boundedRunPayload,
      { expectStatus: 200, timeoutMs: 20000 }
    );
    return response.json;
  }
  const response = await postJson(
    `${apiBaseUrl}/maintenance/discovery/runs`,
    {
      targetId,
      runKind: casePack.runKind,
      triggerKind: "api",
      maxDepth: boundedRunPayload.maxDepth,
      maxHypotheses: boundedRunPayload.maxHypotheses,
      maxSearchResults: boundedRunPayload.maxSearchResults,
      maxDomains: boundedRunPayload.maxDomains,
      maxEndpoints: boundedRunPayload.maxEndpoints,
      maxSocialItems: boundedRunPayload.maxSocialItems,
      createdBy: "live-calibration",
    },
    { expectStatus: 201, timeoutMs: 20000 }
  );
  return response.json;
}

async function refreshCoverage(targetId) {
  const response = await postJson(
    `${apiBaseUrl}/maintenance/discovery/targets/${targetId}/refresh-coverage`,
    {},
    { expectStatus: 200, timeoutMs: 20000 }
  );
  return response.json;
}

async function runDiscoveryThroughSequence(casePack, discoveryRunId, runId, iteration) {
  const response = await postJson(
    `${apiBaseUrl}/maintenance/agent/sequences`,
    {
      title: `Discovery live calibration ${casePack.key} ${runId} i${iteration}`,
      description: "Run-scoped bounded Discovery V3 live calibration sequence.",
      taskGraph: [
        {
          key: `discovery_v3_run_${casePack.key}_${iteration}`,
          module: "discovery.v3.run",
          options: { runId: discoveryRunId },
          timeoutMs: 300000,
          retry: { attempts: 1, delayMs: 1000 },
        },
      ],
      tags: ["discovery", "live-calibration", casePack.key],
      contextJson: {},
      triggerMeta: {
        source: "discovery_live_calibration",
        caseKey: casePack.key,
        caseSet: casePack.caseSet ?? "core",
        calibrationRunId: runId,
      },
      runNow: true,
      createdBy: "live-calibration",
    },
    { expectStatus: 201, timeoutMs: 20000 }
  );
  const sequenceRunId = response.json?.run?.run_id ?? response.json?.run?.runId;
  if (!sequenceRunId) {
    throw new Error(`Sequence did not return a run id for discovery run ${discoveryRunId}.`);
  }
  await waitForCondition(
    `discovery run ${discoveryRunId}`,
    async () => {
      const run = await getJson(`${apiBaseUrl}/maintenance/discovery/runs/${discoveryRunId}`, { timeoutMs: 15000 });
      const status = normalizeText(run.json.status).toLowerCase();
      return {
        ok: TERMINAL_RUN_STATUSES.has(status),
        message: `${discoveryRunId}:${status}`,
        run: run.json,
      };
    },
    { timeoutMs: 300000, pollIntervalMs: 2500 }
  );
  const sequenceSnapshot = await waitForCondition(
    `sequence run ${sequenceRunId}`,
    async () => {
      const run = await getJson(`${apiBaseUrl}/maintenance/sequence-runs/${sequenceRunId}`, { timeoutMs: 15000 });
      const status = normalizeText(run.json.status).toLowerCase();
      return {
        ok: TERMINAL_SEQUENCE_STATUSES.has(status),
        message: `${sequenceRunId}:${status}`,
        run: run.json,
      };
    },
    { timeoutMs: 300000, pollIntervalMs: 2500 }
  );
  return { sequenceRunId, sequenceRun: sequenceSnapshot.run };
}

async function listKind(kind, targetId, extra = "") {
  const separator = extra ? `&${extra}` : "";
  const pageSize = 200;
  const first = await getJson(
    `${apiBaseUrl}/maintenance/discovery/${kind}?targetId=${encodeURIComponent(targetId)}&pageSize=${pageSize}${separator}`,
    { expectStatus: 200, timeoutMs: 20000 }
  );
  const firstJson = first.json;
  const items = [...asArray(firstJson?.items)];
  const total = Number(firstJson?.total ?? items.length);
  for (let page = 2; items.length < total && page <= 10; page += 1) {
    const response = await getJson(
      `${apiBaseUrl}/maintenance/discovery/${kind}?targetId=${encodeURIComponent(targetId)}&pageSize=${pageSize}&page=${page}${separator}`,
      { expectStatus: 200, timeoutMs: 20000 }
    );
    items.push(...asArray(response.json?.items));
  }
  return { ...firstJson, items, total };
}

async function readCaseState(targetId, runId) {
  const [
    target,
    run,
    coverage,
    hypotheses,
    endpoints,
    contracts,
    claims,
    negativeEvidence,
    providerHealth,
    llmDecisions,
  ] = await Promise.all([
    getJson(`${apiBaseUrl}/maintenance/discovery/targets/${targetId}`, { expectStatus: 200 }),
    getJson(`${apiBaseUrl}/maintenance/discovery/runs/${runId}`, { expectStatus: 200 }),
    getJson(`${apiBaseUrl}/maintenance/discovery/targets/${targetId}/coverage`, { expectStatus: 200 }),
    listKind("hypotheses", targetId),
    listKind("endpoints", targetId),
    listKind("contracts", targetId),
    listKind("claims", targetId),
    listKind("negative-evidence", targetId),
    getJson(`${apiBaseUrl}/maintenance/discovery/provider-health?pageSize=200`, { expectStatus: 200 }),
    listKind("llm-decisions", targetId),
  ]);
  return {
    target: target.json,
    run: run.json,
    coverage: coverage.json,
    hypotheses,
    endpoints,
    contracts,
    claims,
    negativeEvidence,
    providerHealth: providerHealth.json,
    llmDecisions,
  };
}

async function seedSourceForCase(env, casePack, targetId, runId, iteration) {
  if (!casePack.seedSource) {
    return null;
  }
  const source = casePack.seedSource;
  const channelId = randomUUID();
  const config = {
    discoveredBy: "discovery_live_calibration",
    discovery: {
      targetId,
      sourceRole: source.sourceRole,
      signalMode: "direct",
      endpointKind: source.endpointKind,
      trustStage: source.trustStage,
      coverageContribution: source.coverageContribution,
      downstreamWeight: source.downstreamWeight,
      evidenceContract: {
        contractVersion: "1.0",
        expectedDataShape: source.sourceRole,
      },
    },
    tags: ["discovery", "live-calibration", casePack.key],
  };
  const contract = {
    contractVersion: "1.0",
    targetId,
    sourceRole: source.sourceRole,
    signalMode: "direct",
    expectedDataShape: source.sourceRole,
    minimumUsefulItemsPerWindow: 1,
    windowDays: 30,
    maxNoiseRate: 0.55,
    maxDuplicateRate: 0.6,
  };
  queryPostgresWithoutCommandTags(
    env,
    `
      insert into source_channels (
        channel_id, provider_type, name, fetch_url, homepage_url, config_json,
        is_active, poll_interval_seconds, last_success_at, created_at, updated_at
      )
      values (
        '${channelId}'::uuid,
        ${sqlText(source.providerType)},
        ${sqlText(`Live calibration ${casePack.key} ${runId} i${iteration}`)},
        ${sqlText(source.fetchUrl)},
        ${sqlText(source.homepageUrl)},
        ${sqlJson(config)},
        ${source.isActive === false ? "false" : "true"},
        300,
        ${source.trustStage === "degraded" ? "now() - interval '90 days'" : "now()"},
        now(),
        now()
      );

      insert into source_channel_runtime_state (
        channel_id, adaptive_enabled, effective_poll_interval_seconds,
        max_poll_interval_seconds, next_due_at, adaptive_reason, updated_at
      )
      values ('${channelId}'::uuid, true, 300, 28800, now(), 'discovery_live_calibration', now());

      insert into discovery_source_contracts (
        target_id, source_channel_id, source_role, signal_mode, provider_type,
        endpoint_kind, expected_data_shape, contract_json, status,
        health_score, contract_fit_score, useful_yield_score, noise_score,
        freshness_score, coverage_contribution, downstream_weight, failure_reason
      )
      values (
        '${targetId}'::uuid,
        '${channelId}'::uuid,
        ${sqlText(source.sourceRole)},
        'direct',
        ${sqlText(source.providerType)},
        ${sqlText(source.endpointKind)},
        ${sqlText(source.sourceRole)},
        ${sqlJson(contract)},
        ${sqlText(source.contractStatus)},
        ${source.trustStage === "degraded" ? "0.1" : "0.9"},
        ${source.trustStage === "degraded" ? "0.2" : "0.9"},
        ${source.trustStage === "degraded" ? "0" : "0.8"},
        ${source.trustStage === "degraded" ? "0.8" : "0.1"},
        ${source.trustStage === "degraded" ? "0.1" : "0.9"},
        ${Number(source.coverageContribution)},
        ${Number(source.downstreamWeight)},
        ${source.trustStage === "degraded" ? "'live_calibration_degraded_seed'" : "null"}
      );
    `
  );
  return { channelId, isActive: source.isActive !== false };
}

async function seedGuardRows(env, casePack, targetId, runId) {
  if (casePack.flow !== "guards") {
    return null;
  }
  const negativeEvidenceId = randomUUID();
  queryPostgresWithoutCommandTags(
    env,
    `
      insert into discovery_negative_evidence (
        negative_evidence_id, target_id, evidence_kind, provider_id, query_text,
        source_role, signal_mode, failure_mode, severity, details_json, cooldown_until
      )
      values (
        '${negativeEvidenceId}'::uuid,
        '${targetId}'::uuid,
        'search_result',
        'web_search',
        ${sqlText(`provider health guard technical updates ${runId}`)},
        'technical_change',
        'direct',
        'no_results',
        0.6,
        ${sqlJson({ seededBy: "live_calibration", runId })},
        now() + interval '2 hours'
      );

      insert into discovery_provider_health (
        provider_id, status, success_rate, error_rate, rate_limit_score,
        auth_health_score, latency_score, last_error_at, last_error_kind,
        cooldown_until, metrics_json, updated_at
      )
      values (
        'web_search',
        'degraded',
        0.4,
        0.6,
        1,
        1,
        0.8,
        now(),
        'live_calibration_guard',
        now() + interval '10 minutes',
        ${sqlJson({ seededBy: "live_calibration", runId })},
        now()
      )
      on conflict (provider_id) do update
      set status = excluded.status,
          success_rate = excluded.success_rate,
          error_rate = excluded.error_rate,
          last_error_at = excluded.last_error_at,
          last_error_kind = excluded.last_error_kind,
          cooldown_until = excluded.cooldown_until,
          metrics_json = excluded.metrics_json,
          updated_at = now();
    `
  );
  return { negativeEvidenceId, providerId: "web_search" };
}

function restoreGuardProviderHealth(env) {
  queryPostgresWithoutCommandTags(
    env,
    `
      update discovery_provider_health
      set status = 'healthy',
          success_rate = 1,
          error_rate = 0,
          cooldown_until = null,
          metrics_json = coalesce(metrics_json, '{}'::jsonb) || '{"restoredBy":"live_calibration"}'::jsonb,
          updated_at = now()
      where provider_id = 'web_search'
        and metrics_json ->> 'seededBy' = 'live_calibration';
    `
  );
}

async function runCaseIteration({ env, casePack, reportRunId, iteration }) {
  log(`Running ${casePack.key} iteration ${iteration}.`);
  const target = await createTarget(casePack, reportRunId, iteration);
  const targetId = target.target_id ?? target.targetId;
  const seededSource = await seedSourceForCase(env, casePack, targetId, reportRunId, iteration);
  await seedGuardRows(env, casePack, targetId, reportRunId);
  const beforeCoverage = await refreshCoverage(targetId);
  const discoveryRun = await createDiscoveryRun(casePack, targetId, seededSource);
  const discoveryRunId = discoveryRun.run_id ?? discoveryRun.runId;
  const sequence = await runDiscoveryThroughSequence(casePack, discoveryRunId, reportRunId, iteration);
  const summary = await readSettledCaseSummary({
    casePack,
    iteration,
    beforeCoverage,
    targetId,
    discoveryRunId,
    seededSource,
  });
  return {
    ...summary,
    sequenceRunId: sequence.sequenceRunId,
    sequenceRunStatus: sequence.sequenceRun?.status ?? null,
    replayFixture: buildReplayEvalFixture(summary),
  };
}

async function readSettledCaseSummary({
  casePack,
  iteration,
  beforeCoverage,
  targetId,
  discoveryRunId,
  seededSource,
}) {
  let lastSummary = null;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const state = await readCaseState(targetId, discoveryRunId);
    lastSummary = summarizeCaseIteration({
      casePack,
      iteration,
      beforeCoverage,
      afterCoverage: state.coverage,
      run: state.run,
      hypotheses: state.hypotheses,
      endpoints: state.endpoints,
      contracts: state.contracts,
      claims: state.claims,
      negativeEvidence: state.negativeEvidence,
      providerHealth: state.providerHealth,
      llmDecisions: state.llmDecisions,
      seededSource,
    });
    if (lastSummary.flowPassed || attempt === 4) {
      return lastSummary;
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  return lastSummary;
}

async function writeReplayEval(env, report) {
  const evalSuiteId = randomUUID();
  queryPostgresWithoutCommandTags(
    env,
    `
      insert into discovery_eval_suites (eval_suite_id, name, description, status)
      values (
        '${evalSuiteId}'::uuid,
        ${sqlText(`Discovery live calibration ${report.runId}`)},
        ${sqlText(`Replay fixtures captured from ${report.mode} live calibration.`)},
        'active'
      );
    `
  );
  for (const iteration of report.iterations) {
    const fixture = iteration.replayFixture ?? buildReplayEvalFixture(iteration);
    queryPostgresWithoutCommandTags(
      env,
      `
        insert into discovery_eval_cases (
          eval_suite_id, target_json, provider_fixtures_json,
          expected_sources_json, expected_rejects_json, expected_hidden_claims_json
        )
        values (
          '${evalSuiteId}'::uuid,
          ${sqlJson(fixture.targetJson)},
          ${sqlJson(fixture.providerFixturesJson)},
          ${sqlJson(fixture.expectedSourcesJson)},
          ${sqlJson(fixture.expectedRejectsJson)},
          ${sqlJson(fixture.expectedHiddenClaimsJson)}
        );
      `
    );
  }
  const run = await postJson(
    `${apiBaseUrl}/maintenance/discovery/eval-suites/${evalSuiteId}/run`,
    {
      configJson: {
        source: "live_calibration",
        reportRunId: report.runId,
        mode: report.mode,
        caseSet: report.caseSet ?? "core",
      },
      requestedBy: "live-calibration",
    },
    { expectStatus: 200, timeoutMs: 30000 }
  );
  return {
    evalSuiteId,
    evalRunId: run.json?.eval_run_id ?? run.json?.evalRunId ?? null,
    status: run.json?.metrics_json?.status ?? run.json?.metricsJson?.status ?? "completed",
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const runId = newRunId();
  const startedAt = new Date().toISOString();
  const jsonPath = `/tmp/discovery-live-calibration-${runId}.json`;
  const mdPath = `/tmp/discovery-live-calibration-${runId}.md`;
  const casePacks = selectCases(options.cases, options.caseSet);
  const repeatCount = options.repeat ?? LIVE_CALIBRATION_REPEAT_COUNTS[options.mode];
  const report = {
    kind: "discovery-v3-live-calibration",
    runId,
    mode: options.mode,
    caseSet: options.caseSet,
    startedAt,
    finishedAt: null,
    caseKeys: casePacks.map((casePack) => casePack.key),
    repeatCount,
    preflight: [],
    composeEnv: {},
    iterations: [],
    verdicts: null,
    tuningRecommendations: [],
    replayEval: null,
    error: null,
  };

  const env = { ...(await readEnvFile(".env.dev")), ...process.env, ...buildCalibrationComposeEnv(process.env) };
  report.composeEnv = {
    DISCOVERY_ENABLED: env.DISCOVERY_ENABLED,
    DISCOVERY_V3_LIVE_EXECUTION: env.DISCOVERY_V3_LIVE_EXECUTION,
    DISCOVERY_SEARCH_PROVIDER: env.DISCOVERY_SEARCH_PROVIDER,
    DISCOVERY_SEARCH_PROVIDERS: env.DISCOVERY_SEARCH_PROVIDERS,
  };
  try {
    const validation = validateLiveCalibrationCasePack(casePacks);
    if (!validation.passed) {
      throw new Error(`Invalid live calibration cases: ${validation.errors.join("; ")}`);
    }
    await ensureLiveComposeStack(env);
    report.preflight = await checkApiSurfaces();
    const preflightFailed = report.preflight.some((item) => item.status !== "passed");
    if (preflightFailed) {
      throw new Error("Discovery API preflight failed.");
    }

    for (let iteration = 1; iteration <= repeatCount; iteration += 1) {
      for (const casePack of casePacks) {
        const item = await runCaseIteration({ env, casePack, reportRunId: runId, iteration });
        report.iterations.push(item);
      }
    }
    report.verdicts = determineLiveCalibrationVerdicts(report.iterations, {
      mode: options.mode,
      casePacks,
      repeatCount,
    });
    report.tuningRecommendations = buildTuningRecommendations(report.verdicts);
    report.replayEval = await writeReplayEval(env, report);
  } catch (error) {
    report.error = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    try {
      restoreGuardProviderHealth(env);
    } catch (error) {
      report.providerHealthCleanupError = error instanceof Error ? error.message : String(error);
    }
    report.finishedAt = new Date().toISOString();
    await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    await writeFile(mdPath, `${formatLiveCalibrationMarkdown(report)}\n`, "utf8");
    log(`Wrote JSON evidence to ${jsonPath}`);
    log(`Wrote Markdown evidence to ${mdPath}`);
  }

  if (report.verdicts?.finalVerdict !== "pass") {
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  });
}

export {
  checkApiSurfaces,
  createDiscoveryRun,
  createTarget,
  parseArgs,
  selectCases,
};

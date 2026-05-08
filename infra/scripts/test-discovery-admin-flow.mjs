import { randomUUID } from "node:crypto";

import {
  assertHtmlContains,
  deleteFirebasePasswordUser,
  ensureFirebasePasswordUser,
  fetchJson,
  postForm,
  postJson,
  queryPostgresWithoutCommandTags as queryPostgres,
  readAllowlistEntries,
  readEnvFile,
  requireConfigured,
  runCompose,
  selectAdminEmail,
  sendRequest,
  sqlLiteral,
  waitForHttpHealth,
} from "./lib/compose-proof-testkit.mjs";

const STACK_SERVICES = [
  "postgres",
  "redis",
  "mailpit",
  "migrate",
  "relay",
  "fetchers",
  "worker",
  "api",
  "web",
  "admin",
  "nginx",
];

function log(message) {
  console.log(`[discovery-admin] ${message}`);
}

async function ensureComposeStack() {
  log("Ensuring compose stack is available for discovery-admin acceptance.");
  runCompose("up", "--build", "-d", ...STACK_SERVICES);
  await Promise.all([
    waitForHttpHealth("api", "http://127.0.0.1:8000/health"),
    waitForHttpHealth("admin", "http://127.0.0.1:4322/api/health"),
    waitForHttpHealth("nginx", "http://127.0.0.1:8080/health"),
  ]);
}

function expectId(value, label) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    throw new Error(`${label} did not return an id.`);
  }
  return normalized;
}

async function assertStatus(url, expected, { cookie } = {}) {
  const response = await sendRequest(url, {
    headers: {
      Accept: "text/html",
      ...(cookie ? { Cookie: cookie } : {}),
    },
  });
  if (response.status !== expected) {
    throw new Error(`Expected ${url} to return ${expected}, got ${response.status}.`);
  }
}

function seedV3GuardRows(env, { runId, targetId }) {
  const endpointUrl = `https://v3-${runId}.example.test/feed.xml`;
  const targetTitle = `V3 acceptance target ${runId}`;
  const claimTitle = `Operators need resilient discovery ${runId}`;
  const evalSuiteName = `Discovery replay suite ${runId}`;
  const queryText = `"resilient discovery" ${runId}`;

  const endpointId = queryPostgres(
    env,
    `
    insert into discovery_source_endpoints (
      target_id,
      provider_id,
      provider_type,
      canonical_domain,
      homepage_url,
      endpoint_url,
      normalized_endpoint_url,
      endpoint_kind,
      source_role,
      signal_mode,
      title,
      description,
      evidence_json,
      samples_json,
      extraction_config_json,
      why_found_json,
      why_not_promoted_json,
      missing_evidence_json,
      next_best_action,
      interest_fit_score,
      evidence_score,
      quality_score,
      yield_score,
      freshness_score,
      novelty_score,
      extraction_ready_score,
      coverage_gap_score,
      compliance_score,
      adversarial_confidence_score,
      total_score,
      status,
      recommended_action
    )
    values (
      ${sqlLiteral(targetId)}::uuid,
      'rss',
      'rss',
      ${sqlLiteral(`v3-${runId}.example.test`)},
      ${sqlLiteral(`https://v3-${runId}.example.test`)},
      ${sqlLiteral(endpointUrl)},
      ${sqlLiteral(endpointUrl)},
      'rss_feed',
      'technical_change',
      'direct',
      ${sqlLiteral(`V3 RSS endpoint ${runId}`)},
      'Admin acceptance endpoint',
      '{"rss":{"isValid":true,"sampleEntryCount":4,"recentEntryCount":3,"hasDates":true}}'::jsonb,
      '[{"title":"Resilient discovery release note"}]'::jsonb,
      '{"expectedDataShape":"technical_update"}'::jsonb,
      '["matches missing technical_change role","valid RSS probe evidence"]'::jsonb,
      '["manual review required before operator promotion"]'::jsonb,
      '["probation contract must pass before strong coverage"]'::jsonb,
      'promote_endpoint',
      0.82,
      0.84,
      0.76,
      0.70,
      0.74,
      1.00,
      0.92,
      0.86,
      0.98,
      0.75,
      0.84,
      'manual_review',
      'manual_promote'
    )
    returning endpoint_id::text
    `
  );

  const negativeEvidenceId = queryPostgres(
    env,
    `
    insert into discovery_negative_evidence (
      target_id,
      evidence_kind,
      provider_id,
      query_text,
      source_role,
      signal_mode,
      failure_mode,
      severity,
      details_json,
      cooldown_until
    )
    values (
      ${sqlLiteral(targetId)}::uuid,
      'search_result',
      'web_search',
      ${sqlLiteral(queryText)},
      'industry_niche',
      'direct',
      'seo_noise',
      0.70,
      '{"why":"acceptance cooldown proof"}'::jsonb,
      now() + interval '1 hour'
    )
    returning negative_evidence_id::text
    `
  );

  queryPostgres(
    env,
    `
    insert into discovery_claims (
      target_id,
      claim_type,
      signal_mode,
      title,
      normalized_claim,
      summary,
      support_evidence_count,
      independent_source_count,
      unique_author_count,
      control_query_text,
      control_signal_rate,
      target_signal_rate,
      specificity_score,
      confidence_score,
      risk_score,
      novelty_score,
      status
    )
    values (
      ${sqlLiteral(targetId)}::uuid,
      'need',
      'hidden',
      ${sqlLiteral(claimTitle)},
      ${sqlLiteral(`operators need resilient discovery ${runId}`)},
      'Claim-backed hidden-signal acceptance row with control comparison.',
      12,
      4,
      8,
      '"generic discovery need"',
      0.20,
      0.58,
      2.90,
      0.78,
      0.18,
      0.66,
      'confirmed'
    )
    `
  );

  queryPostgres(
    env,
    `
    insert into discovery_provider_health (
      provider_id,
      status,
      success_rate,
      error_rate,
      rate_limit_score,
      auth_health_score,
      latency_score,
      last_error_at,
      last_error_kind,
      cooldown_until,
      metrics_json
    )
    values (
      'web_search',
      'auth_failed',
      0.30,
      0.70,
      1.00,
      0.00,
      0.75,
      now(),
      'auth_failed',
      now() + interval '1 hour',
      '{"acceptance":true}'::jsonb
    )
    on conflict (provider_id) do update set
      status = excluded.status,
      success_rate = excluded.success_rate,
      error_rate = excluded.error_rate,
      auth_health_score = excluded.auth_health_score,
      last_error_at = excluded.last_error_at,
      last_error_kind = excluded.last_error_kind,
      cooldown_until = excluded.cooldown_until,
      metrics_json = excluded.metrics_json,
      updated_at = now()
    `
  );

  const evalSuiteId = queryPostgres(
    env,
    `
    with suite as (
      insert into discovery_eval_suites (name, description, status)
      values (
        ${sqlLiteral(evalSuiteName)},
        'Admin acceptance replay suite',
        'active'
      )
      returning eval_suite_id
    ),
    case_row as (
      insert into discovery_eval_cases (
        eval_suite_id,
        target_json,
        provider_fixtures_json,
        expected_sources_json,
        expected_rejects_json,
        expected_hidden_claims_json
      )
      select
        eval_suite_id,
        ${sqlLiteral(JSON.stringify({ title: targetTitle }))}::jsonb,
        ${sqlLiteral(JSON.stringify({
          sources: [{ normalized_endpoint_url: endpointUrl }],
          rejects: [{ normalized_endpoint_url: `https://junk-${runId}.example.test` }],
          hiddenClaims: [{ normalized_claim: `operators need resilient discovery ${runId}` }],
          cost: 0.04,
        }))}::jsonb,
        ${sqlLiteral(JSON.stringify([{ normalized_endpoint_url: endpointUrl }]))}::jsonb,
        ${sqlLiteral(JSON.stringify([{ normalized_endpoint_url: `https://junk-${runId}.example.test` }]))}::jsonb,
        ${sqlLiteral(JSON.stringify([{ normalized_claim: `operators need resilient discovery ${runId}` }]))}::jsonb
      from suite
      returning eval_suite_id
    )
    select eval_suite_id::text from case_row
    `
  );

  return { endpointId, evalSuiteId, negativeEvidenceId };
}

async function main() {
  const env = await readEnvFile(".env.dev");
  const firebaseApiKey = requireConfigured(env, "FIREBASE_WEB_API_KEY", {
    proofName: "discovery admin acceptance",
  });
  const allowlistEntries = readAllowlistEntries(env);
  const runId = randomUUID().slice(0, 8);
  const adminEmail = selectAdminEmail(allowlistEntries, runId, {
    prefix: "discovery-admin",
  });
  const adminPassword = `NewsPortal!${runId}`;
  const adminBaseUrl = "http://127.0.0.1:4322";
  const apiBaseUrl = "http://127.0.0.1:8000";

  let adminCreated = false;

  try {
    await ensureComposeStack();
    await ensureFirebasePasswordUser(firebaseApiKey, adminEmail, adminPassword);
    adminCreated = true;

    log("Signing in through the admin app.");
    const signIn = await postForm(`${adminBaseUrl}/bff/auth/sign-in`, {
      email: adminEmail,
      password: adminPassword,
      next: "/discovery",
    });
    const adminCookie = signIn.cookie;
    if (!adminCookie) {
      throw new Error("Discovery admin sign-in did not return a session cookie.");
    }
    const sessionPayload = await fetchJson(`${adminBaseUrl}/bff/session`, { cookie: adminCookie });
    if (!sessionPayload?.session?.roles?.includes?.("admin")) {
      throw new Error("Discovery admin sign-in did not create an admin session.");
    }

    log("Creating a v3 discovery target through the API surface.");
    const target = await postJson(`${apiBaseUrl}/maintenance/discovery/targets`, {
      originKind: "manual_prompt",
      title: `V3 acceptance target ${runId}`,
      description: "Admin acceptance target for resilient discovery cutover.",
      seedTopics: ["resilient discovery", "source contracts"],
      seedEntities: ["NewsPortal"],
      seedGeos: ["EU"],
      seedLanguages: ["en"],
      graphJson: {
        coreTopic: "resilient discovery",
        sourceRoleTargets: {
          technical_change: { min: 1, target: 2 },
          social_pain_signal: { min: 1, target: 2 },
        },
      },
      createdBy: "discovery-admin-compose",
    });
    const targetId = expectId(target.json?.target_id, "Discovery target creation");

    const createdRun = await postJson(`${apiBaseUrl}/maintenance/discovery/runs`, {
      targetId,
      runKind: "manual",
      triggerKind: "api",
      maxDepth: 1,
      maxHypotheses: 4,
      maxSearchResults: 4,
      maxDomains: 4,
      maxEndpoints: 4,
      createdBy: "discovery-admin-compose",
    });
    expectId(createdRun.json?.run_id, "Discovery run creation");

    await postJson(`${apiBaseUrl}/maintenance/discovery/targets/${targetId}/refresh-coverage`, {});

    log("Seeding v3 endpoint, claim, negative evidence, provider health and eval rows.");
    const { endpointId, evalSuiteId, negativeEvidenceId } = seedV3GuardRows(env, {
      runId,
      targetId,
    });

    log("Exercising v3 guard actions.");
    await postJson(
      `${apiBaseUrl}/maintenance/discovery/endpoints/${encodeURIComponent(endpointId)}/promote`,
      {
        reviewedBy: "discovery-admin-compose",
        reason: "acceptance promotion proof",
        tags: ["acceptance", "discovery-v3"],
      }
    );
    const contractId = expectId(
      queryPostgres(
        env,
        `
        select contract_id::text
        from discovery_source_contracts
        where endpoint_id = ${sqlLiteral(endpointId)}::uuid
        order by created_at desc
        limit 1
        `
      ),
      "Endpoint promotion contract lookup"
    );

    const evaluated = await postJson(
      `${apiBaseUrl}/maintenance/discovery/contracts/${encodeURIComponent(contractId)}/evaluate`,
      {
        evaluatedBy: "discovery-admin-compose",
        metrics: {
          successful_fetch_count: 3,
          useful_item_count: 4,
          duplicate_rate: 0.10,
          topic_fit_score: 0.78,
          extraction_success_rate: 0.92,
          recent_item_count: 3,
          last_success_age_days: 1,
        },
      }
    );
    if (String(evaluated.json?.status ?? "") !== "active") {
      throw new Error("Contract evaluation did not promote the source contract to active.");
    }

    await postJson(
      `${apiBaseUrl}/maintenance/discovery/negative-evidence/${encodeURIComponent(negativeEvidenceId)}/clear-cooldown`,
      {}
    );

    await postJson(`${apiBaseUrl}/maintenance/discovery/providers/web_search/repair`, {
      repairKind: "repair_provider_auth",
      requestedBy: "discovery-admin-compose",
      reason: "acceptance circuit-breaker repair proof",
    });

    const evalRun = await postJson(
      `${apiBaseUrl}/maintenance/discovery/eval-suites/${encodeURIComponent(evalSuiteId)}/run`,
      {
        requestedBy: "discovery-admin-compose",
        configJson: { acceptance: true },
      }
    );
    expectId(evalRun.json?.eval_run_id, "Eval suite run");

    log("Verifying v3 API read surfaces.");
    for (const path of [
      "/maintenance/discovery/targets",
      "/maintenance/discovery/runs",
      "/maintenance/discovery/endpoints",
      "/maintenance/discovery/contracts",
      "/maintenance/discovery/claims",
      "/maintenance/discovery/negative-evidence",
      "/maintenance/discovery/provider-health",
      "/maintenance/discovery/eval-suites",
      "/maintenance/discovery/eval-runs",
    ]) {
      await fetchJson(`${apiBaseUrl}${path}`);
    }

    for (const legacyPath of [
      "/maintenance/discovery/missions",
      "/maintenance/discovery/candidates",
      "/maintenance/discovery/recall-candidates",
      "/maintenance/discovery/source-profiles",
    ]) {
      const response = await sendRequest(`${apiBaseUrl}${legacyPath}`, {
        headers: { Accept: "application/json" },
      });
      if (response.status !== 404 && response.status !== 405) {
        throw new Error(`Legacy discovery API path ${legacyPath} is still reachable (${response.status}).`);
      }
    }

    log("Verifying the v3 admin workspace.");
    await assertHtmlContains(
      `${adminBaseUrl}/discovery`,
      [
        "Resilient Discovery",
        "Coverage-driven source acquisition",
        `V3 acceptance target ${runId}`,
        `https://v3-${runId}.example.test/feed.xml`,
        "Why found",
        "Why not promoted",
        "Missing evidence",
        "Source Evidence Contracts",
        "technical_change",
        "Hidden Claims",
        `Operators need resilient discovery ${runId}`,
        "Negative Evidence",
        `resilient discovery&quot; ${runId}`,
        "Provider Health",
        "web_search",
        "Replay Eval Suites",
        `Discovery replay suite ${runId}`,
      ],
      { cookie: adminCookie }
    );

    for (const oldPath of [
      "/discovery/missions",
      "/discovery/candidates",
      "/discovery/recall",
      "/discovery/profiles",
      "/discovery/sources",
    ]) {
      await assertStatus(`${adminBaseUrl}${oldPath}`, 404, { cookie: adminCookie });
    }

    log("Discovery admin v3 acceptance passed.");
  } finally {
    if (adminCreated) {
      await deleteFirebasePasswordUser(firebaseApiKey, adminEmail).catch(() => undefined);
    }
  }
}

await main();

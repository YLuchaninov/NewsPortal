import http from "node:http";
import https from "node:https";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { readFile } from "node:fs/promises";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..", "..");
const composeArgs = [
  "compose",
  "--env-file",
  ".env.dev",
  "-f",
  "infra/docker/compose.yml",
  "-f",
  "infra/docker/compose.dev.yml",
];
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

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });

  if (result.status !== 0) {
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
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function runCompose(...args) {
  runCommand("docker", [...composeArgs, ...args]);
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
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

function requireConfigured(env, key) {
  const value = String(process.env[key] ?? env[key] ?? "").trim();
  if (!value || value === "replace-me") {
    throw new Error(`.env.dev must set ${key} before discovery admin acceptance can run.`);
  }
  return value;
}

function readAllowlistEntries(env) {
  return String(env.ADMIN_ALLOWLIST_EMAILS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

function buildAdminAliasEmail(email, runId) {
  const atIndex = email.lastIndexOf("@");
  if (atIndex <= 0 || atIndex === email.length - 1) {
    return email;
  }
  return `${email.slice(0, atIndex)}+discovery-admin-${runId}${email.slice(atIndex)}`;
}

function selectAdminEmail(allowlistEntries, runId) {
  const domainEntry = allowlistEntries.find((entry) => entry.startsWith("@"));
  if (domainEntry) {
    return `discovery-admin-${runId}${domainEntry}`;
  }

  const explicitEmail = allowlistEntries[0];
  if (!explicitEmail) {
    throw new Error("ADMIN_ALLOWLIST_EMAILS must include at least one email or @domain entry.");
  }
  return buildAdminAliasEmail(explicitEmail, runId);
}

function extractCookie(setCookies) {
  const cookie = Array.isArray(setCookies) ? setCookies[0] : setCookies;
  if (!cookie) {
    throw new Error("Expected Set-Cookie header but none was returned.");
  }
  return cookie.split(";")[0];
}

function parseJsonResponse(text, responseMeta) {
  const json = text ? JSON.parse(text) : null;
  if (responseMeta.status < 200 || responseMeta.status >= 300) {
    const message =
      typeof json?.error === "string"
        ? json.error
        : typeof json?.detail === "string"
          ? json.detail
          : Array.isArray(json?.detail)
            ? json.detail.join("; ")
            : `HTTP ${responseMeta.status} ${responseMeta.statusText}`;
    throw new Error(message);
  }
  return json;
}

async function sendRequest(url, { method = "GET", headers = {}, body = "", timeoutMs = 10000 } = {}) {
  const target = new URL(url);
  const client = target.protocol === "https:" ? https : http;

  return new Promise((resolve, reject) => {
    const request = client.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || (target.protocol === "https:" ? 443 : 80),
        path: `${target.pathname}${target.search}`,
        method,
        headers: {
          Connection: "close",
          ...headers,
        },
      },
      (response) => {
        let text = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          text += chunk;
        });
        response.on("end", () => {
          resolve({
            status: response.statusCode ?? 0,
            statusText: response.statusMessage ?? "",
            headers: response.headers,
            text,
          });
        });
      }
    );

    request.on("error", reject);
    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error(`Timed out waiting for ${url}.`));
    });
    if (body) {
      request.write(body);
    }
    request.end();
  });
}

async function postForm(url, payload, { cookie } = {}) {
  const target = new URL(url);
  const body = new URLSearchParams(
    Object.entries(payload).map(([key, value]) => [key, String(value)])
  ).toString();
  const response = await sendRequest(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Origin: target.origin,
      Referer: `${target.origin}/`,
      ...(cookie ? { Cookie: cookie } : {}),
      "Content-Type": "application/x-www-form-urlencoded",
      "Content-Length": Buffer.byteLength(body).toString(),
    },
    body,
    timeoutMs: 15000,
  });

  return {
    cookie: response.headers["set-cookie"] ? extractCookie(response.headers["set-cookie"]) : null,
    json: parseJsonResponse(response.text, response),
  };
}

async function postJson(url, payload, { cookie } = {}) {
  const target = new URL(url);
  const body = JSON.stringify(payload);
  const response = await sendRequest(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Origin: target.origin,
      Referer: `${target.origin}/`,
      ...(cookie ? { Cookie: cookie } : {}),
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body).toString(),
    },
    body,
    timeoutMs: 15000,
  });
  return parseJsonResponse(response.text, response);
}

async function fetchJson(url, { cookie, timeoutMs } = {}) {
  const response = await sendRequest(url, {
    headers: cookie ? { Cookie: cookie } : {},
    timeoutMs,
  });
  return parseJsonResponse(response.text, response);
}

async function assertHtmlContains(url, snippets, { cookie } = {}) {
  const response = await sendRequest(url, {
    headers: cookie ? { Cookie: cookie } : {},
    timeoutMs: 15000,
  });
  if (response.status !== 200) {
    throw new Error(`Expected ${url} to respond with 200, got ${response.status}.`);
  }
  for (const snippet of snippets) {
    if (!response.text.includes(snippet)) {
      throw new Error(`Expected HTML from ${url} to include ${snippet}.`);
    }
  }
}

async function waitFor(label, producer, predicate, { timeoutMs = 60000, intervalMs = 1500 } = {}) {
  const startedAt = Date.now();
  let lastError = null;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const value = await producer();
      if (predicate(value)) {
        return value;
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  const reason = lastError instanceof Error ? ` Last error: ${lastError.message}` : "";
  throw new Error(`Timed out waiting for ${label}.${reason}`);
}

async function waitForHttpHealth(label, url) {
  await waitFor(
    `${label} health`,
    async () => {
      const response = await sendRequest(url);
      if (response.status !== 200) {
        throw new Error(`${label} responded with ${response.status}.`);
      }
      return true;
    },
    Boolean
  );
}

async function ensureComposeStack() {
  log("Ensuring compose stack is available for discovery-admin acceptance.");
  runCompose("up", "-d", ...STACK_SERVICES);
  await Promise.all([
    waitForHttpHealth("api", "http://127.0.0.1:8000/health"),
    waitForHttpHealth("admin", "http://127.0.0.1:4322/api/health"),
    waitForHttpHealth("nginx", "http://127.0.0.1:8080/health"),
  ]);
}

function queryPostgres(env, sql) {
  const result = runCommand(
    "docker",
    [
      ...composeArgs,
      "exec",
      "-T",
      "postgres",
      "psql",
      "-U",
      env.POSTGRES_USER || "newsportal",
      "-d",
      env.POSTGRES_DB || "newsportal",
      "-At",
      "-F",
      "|",
      "-c",
      sql,
    ],
    {
      capture: true,
    }
  );
  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^(INSERT|UPDATE|DELETE) \d+( \d+)?$/u.test(line))
    .join("\n")
    .trim();
}

async function ensureFirebasePasswordUser(apiKey, email, password) {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        password,
        returnSecureToken: true,
      }),
    }
  );

  const payload = await response.json();
  if (!response.ok) {
    const errorMessage = String(payload?.error?.message ?? "unknown");
    if (errorMessage !== "EMAIL_EXISTS") {
      throw new Error(`Firebase admin bootstrap failed: ${errorMessage}`);
    }
  }
}

async function signInFirebasePasswordUser(apiKey, email, password) {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        password,
        returnSecureToken: true,
      }),
    }
  );

  const payload = await response.json();
  if (!response.ok) {
    const errorMessage = String(payload?.error?.message ?? "unknown");
    if (
      errorMessage === "EMAIL_NOT_FOUND" ||
      errorMessage === "INVALID_LOGIN_CREDENTIALS" ||
      errorMessage === "INVALID_PASSWORD"
    ) {
      return null;
    }
    throw new Error(`Firebase admin sign-in failed: ${errorMessage}`);
  }

  return payload;
}

async function deleteFirebasePasswordUser(apiKey, email, password) {
  const session = await signInFirebasePasswordUser(apiKey, email, password);
  if (!session?.idToken) {
    return false;
  }

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        idToken: session.idToken,
      }),
    }
  );

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const errorMessage = String(payload?.error?.message ?? "unknown");
    throw new Error(`Firebase admin cleanup failed: ${errorMessage}`);
  }

  return true;
}

async function main() {
  const env = await readEnvFile(".env.dev");
  const firebaseApiKey = requireConfigured(env, "FIREBASE_WEB_API_KEY");
  const allowlistEntries = readAllowlistEntries(env);
  const runId = randomUUID().slice(0, 8);
  const adminEmail = selectAdminEmail(allowlistEntries, runId);
  const adminPassword = `NewsPortal!${runId}`;
  const adminBaseUrl = "http://127.0.0.1:4322";
  const apiBaseUrl = "http://127.0.0.1:8000";
  const discoveryPath = "/discovery";

  let candidateId = "";
  let sourceProfileId = "";
  let recallCandidateId = "";
  let recallMissionId = "";
  let adminCreated = false;

  try {
    await ensureComposeStack();
    await ensureFirebasePasswordUser(firebaseApiKey, adminEmail, adminPassword);
    adminCreated = true;

    log("Signing in through the admin app.");
    const signIn = await postForm(`${adminBaseUrl}/bff/auth/sign-in`, {
      email: adminEmail,
      password: adminPassword,
      next: discoveryPath,
    });
    const adminCookie = signIn.cookie;
    if (!adminCookie) {
      throw new Error("Discovery admin sign-in did not return a session cookie.");
    }
    const sessionPayload = await fetchJson(`${adminBaseUrl}/bff/session`, { cookie: adminCookie });
    if (!sessionPayload?.session?.roles?.includes?.("admin")) {
      throw new Error("Discovery admin sign-in did not create an admin session.");
    }

    log("Preflighting the discovery surface.");
    await assertHtmlContains(
      `${adminBaseUrl}/discovery`,
      [
        "Adaptive Discovery Agent",
        "Dual-path discovery control plane",
        "Dashboard",
        "Missions",
        "Recall",
      ],
      { cookie: adminCookie }
    );

    const missionTitle = `Discovery mission ${runId}`;
    const createMission = await postForm(`${adminBaseUrl}/bff/admin/discovery`, {
      intent: "create_mission",
      redirectTo: `${discoveryPath}?tab=missions`,
      title: missionTitle,
      description: "Admin acceptance mission",
      seedTopics: "EU AI oversight\nBrussels",
      seedLanguages: "en",
      seedRegions: "EU",
      targetProviderTypes: "rss,website",
      maxHypotheses: "4",
      maxSources: "6",
      budgetCents: "400",
      priority: "2",
      interestGraph: '{"core_topic":"EU AI oversight","subtopics":["policy","regulation"]}',
    }, { cookie: adminCookie });
    const missionId = String(createMission.json?.mission_id ?? "");
    if (!missionId) {
      throw new Error("Discovery mission creation did not return a mission_id.");
    }

    const classKey = `acceptance_${runId}`;
    const createClass = await postForm(`${adminBaseUrl}/bff/admin/discovery`, {
      intent: "create_class",
      redirectTo: `${discoveryPath}?tab=classes`,
      classKey,
      displayName: `Acceptance class ${runId}`,
      description: "Admin acceptance class",
      status: "draft",
      generationBackend: "graph_seed_only",
      defaultProviderTypes: "rss,website",
      maxPerMission: "2",
      sortOrder: "7",
      seedRulesJson: '{"tactics":["acceptance_seed"]}',
      configJson: '{"notes":"acceptance"}',
    }, { cookie: adminCookie });
    if (String(createClass.json?.class_key ?? "") !== classKey) {
      throw new Error("Discovery class creation did not return the expected class_key.");
    }

    log("Updating the discovery class through the admin surface.");
    const updateClass = await postForm(`${adminBaseUrl}/bff/admin/discovery`, {
      intent: "update_class",
      redirectTo: `${discoveryPath}?tab=classes`,
      classKey,
      status: "active",
      sortOrder: "9",
      maxPerMission: "3",
    }, { cookie: adminCookie });
    if (String(updateClass.json?.status ?? "") !== "active") {
      throw new Error("Discovery class update did not persist the active status.");
    }

    log("Compiling the mission graph through the admin surface.");
    const compiledMission = await postForm(`${adminBaseUrl}/bff/admin/discovery`, {
      intent: "compile_graph",
      redirectTo: `${discoveryPath}?tab=missions`,
      missionId,
    }, { cookie: adminCookie });
    if (String(compiledMission.json?.interest_graph_status ?? "") !== "compiled") {
      throw new Error("Discovery graph compile did not return a compiled mission.");
    }

    log("Updating the mission through the admin surface.");
    const updatedMission = await postForm(`${adminBaseUrl}/bff/admin/discovery`, {
      intent: "update_mission",
      redirectTo: `${discoveryPath}?tab=missions`,
      missionId,
      status: "paused",
      priority: "5",
      budgetCents: "500",
    }, { cookie: adminCookie });
    if (String(updatedMission.json?.status ?? "") !== "paused") {
      throw new Error("Discovery mission update did not persist the paused status.");
    }

    log("Requesting a mission run through the admin surface.");
    const runMission = await postForm(`${adminBaseUrl}/bff/admin/discovery`, {
      intent: "run_mission",
      redirectTo: `${discoveryPath}?tab=missions`,
      missionId,
    }, { cookie: adminCookie });
    const runIdFromApi = String(runMission.json?.run_id ?? "");
    if (!runIdFromApi) {
      throw new Error("Discovery mission run did not return a run_id.");
    }
    await waitFor(
      "mission active after run request",
      async () => fetchJson(`${apiBaseUrl}/maintenance/discovery/missions/${encodeURIComponent(missionId)}`),
      (payload) => String(payload?.status ?? "") === "active"
    );

    log("Seeding a pending discovery candidate and source profile for admin review.");
    const hypothesisId = queryPostgres(
      env,
      `
        insert into discovery_hypotheses (
          mission_id,
          class_key,
          tactic_key,
          search_query,
          target_urls,
          target_provider_type,
          generation_context,
          expected_value,
          status
        )
        values (
          ${sqlLiteral(missionId)},
          ${sqlLiteral(classKey)},
          ${sqlLiteral("acceptance_review")},
          ${sqlLiteral(`site:${runId} discovery candidate`)},
          array[${sqlLiteral(`https://discovery-${runId}.example.test/feed.xml`)}]::text[],
          'rss',
          '{}'::jsonb,
          ${sqlLiteral("acceptance candidate")},
          'pending'
        )
        returning hypothesis_id::text;
      `
    );
    if (!hypothesisId) {
      throw new Error("Failed to seed a discovery hypothesis for admin review.");
    }

    candidateId = queryPostgres(
      env,
      `
        insert into discovery_candidates (
          hypothesis_id,
          mission_id,
          url,
          final_url,
          title,
          description,
          provider_type,
          is_valid,
          relevance_score,
          evaluation_json,
          llm_assessment,
          sample_data,
          status,
          rejection_reason
        )
        values (
          ${sqlLiteral(hypothesisId)},
          ${sqlLiteral(missionId)},
          ${sqlLiteral(`https://discovery-${runId}.example.test/feed.xml`)},
          ${sqlLiteral(`https://discovery-${runId}.example.test/feed.xml`)},
          ${sqlLiteral(`Discovery candidate ${runId}`)},
          ${sqlLiteral("Synthetic candidate for admin acceptance review.")},
          'rss',
          true,
          0.91,
          '{"quality_signal_source":"acceptance"}'::jsonb,
          '{}'::jsonb,
          '[]'::jsonb,
          'pending',
          null
        )
        returning candidate_id::text;
      `
    );
    if (!candidateId) {
      throw new Error("Failed to seed a pending discovery candidate.");
    }

    sourceProfileId = queryPostgres(
      env,
      `
        insert into discovery_source_profiles (
          candidate_id,
          canonical_domain,
          source_type,
          org_name,
          country,
          languages,
          ownership_transparency,
          author_accountability,
          source_linking_quality,
          historical_stability,
          technical_quality,
          spam_signals,
          trust_score,
          extraction_data
        )
        values (
          ${sqlLiteral(candidateId)},
          ${sqlLiteral(`discovery-${runId}.example.test`)},
          'news_site',
          ${sqlLiteral(`Discovery Org ${runId}`)},
          'PL',
          array['en']::text[],
          0.72,
          0.68,
          0.64,
          0.7,
          0.76,
          0.08,
          0.74,
          '{"acceptance":true}'::jsonb
        )
        returning source_profile_id::text;
      `
    );
    if (!sourceProfileId) {
      throw new Error("Failed to seed a discovery source profile.");
    }
    queryPostgres(
      env,
      `
        update discovery_candidates
        set source_profile_id = ${sqlLiteral(sourceProfileId)}
        where candidate_id = ${sqlLiteral(candidateId)};
      `
    );
    queryPostgres(
      env,
      `
        insert into discovery_source_quality_snapshots (
          source_profile_id,
          channel_id,
          snapshot_reason,
          trust_score,
          extraction_quality_score,
          stability_score,
          independence_score,
          freshness_score,
          lead_time_score,
          yield_score,
          duplication_score,
          recall_score,
          scoring_breakdown
        )
        values (
          ${sqlLiteral(sourceProfileId)},
          null,
          'acceptance_seed',
          0.74,
          0.76,
          0.7,
          0.69,
          0.66,
          0.62,
          0.71,
          0.12,
          0.73,
          '{"metricSource":"acceptance_seed"}'::jsonb
        )
        on conflict (source_profile_id)
        do update
        set
          snapshot_reason = excluded.snapshot_reason,
          trust_score = excluded.trust_score,
          extraction_quality_score = excluded.extraction_quality_score,
          stability_score = excluded.stability_score,
          independence_score = excluded.independence_score,
          freshness_score = excluded.freshness_score,
          lead_time_score = excluded.lead_time_score,
          yield_score = excluded.yield_score,
          duplication_score = excluded.duplication_score,
          recall_score = excluded.recall_score,
          scoring_breakdown = excluded.scoring_breakdown,
          scored_at = now(),
          updated_at = now();
      `
    );
    queryPostgres(
      env,
      `
        insert into discovery_source_interest_scores (
          source_profile_id,
          channel_id,
          mission_id,
          topic_coverage,
          specificity,
          audience_fit,
          evidence_depth,
          signal_to_noise,
          fit_score,
          novelty_score,
          lead_time_score,
          yield_score,
          duplication_score,
          contextual_score,
          role_labels,
          scoring_breakdown
        )
        values (
          ${sqlLiteral(sourceProfileId)},
          null,
          ${sqlLiteral(missionId)},
          0.74,
          0.68,
          0.7,
          0.66,
          0.64,
          0.75,
          0.55,
          0.62,
          0.71,
          0.12,
          0.77,
          array['regional_watch']::text[],
          '{"metricSource":"acceptance_seed"}'::jsonb
        )
        on conflict (mission_id, source_profile_id)
        do update
        set
          contextual_score = excluded.contextual_score,
          topic_coverage = excluded.topic_coverage,
          fit_score = excluded.fit_score,
          yield_score = excluded.yield_score,
          lead_time_score = excluded.lead_time_score,
          duplication_score = excluded.duplication_score,
          role_labels = excluded.role_labels,
          scoring_breakdown = excluded.scoring_breakdown,
          scored_at = now(),
          updated_at = now();
      `
    );

    await assertHtmlContains(
      `${adminBaseUrl}/discovery?tab=missions`,
      [missionTitle, "Run mission", "Compile graph"],
      { cookie: adminCookie }
    );
    await assertHtmlContains(
      `${adminBaseUrl}/discovery?tab=classes`,
      [`Acceptance class ${runId}`, "Save class"],
      { cookie: adminCookie }
    );
    await assertHtmlContains(
      `${adminBaseUrl}/discovery?tab=candidates`,
      [`Discovery candidate ${runId}`, "Approve"],
      { cookie: adminCookie }
    );

    log("Approving the seeded discovery candidate through the admin surface.");
    const reviewedCandidate = await postForm(`${adminBaseUrl}/bff/admin/discovery`, {
      intent: "review_candidate",
      redirectTo: `${discoveryPath}?tab=candidates`,
      candidateId,
      status: "approved",
    }, { cookie: adminCookie });
    const reviewedCandidateId = String(reviewedCandidate.json?.candidate_id ?? "");
    if (reviewedCandidateId !== candidateId) {
      throw new Error("Discovery candidate review did not return the expected candidate_id.");
    }
    const approvedCandidate = await waitFor(
      "approved discovery candidate",
      async () => fetchJson(`${apiBaseUrl}/maintenance/discovery/candidates/${encodeURIComponent(candidateId)}`),
      (payload) =>
        String(payload?.status ?? "") === "approved" ||
        String(payload?.status ?? "") === "duplicate"
    );
    const registeredChannelId = String(approvedCandidate?.registered_channel_id ?? "");
    if (!registeredChannelId) {
      throw new Error("Discovery candidate approval did not register or link a source channel.");
    }
    await assertHtmlContains(
      `${adminBaseUrl}/discovery?tab=candidates`,
      [`Discovery candidate ${runId}`, "Reviewed"],
      { cookie: adminCookie }
    );

    log("Submitting discovery feedback and re-evaluating the mission.");
    const feedbackNotes = `Discovery admin acceptance feedback ${runId}`;
    const feedbackResult = await postForm(`${adminBaseUrl}/bff/admin/discovery`, {
      intent: "submit_feedback",
      redirectTo: `${discoveryPath}?tab=feedback`,
      missionId,
      candidateId,
      sourceProfileId,
      feedbackType: "valuable_source",
      feedbackValue: "keep",
      notes: feedbackNotes,
    }, { cookie: adminCookie });
    if (!String(feedbackResult.json?.feedback_event_id ?? "")) {
      throw new Error("Discovery feedback submission did not return a feedback_event_id.");
    }
    await assertHtmlContains(
      `${adminBaseUrl}/discovery?tab=feedback`,
      [feedbackNotes, "valuable_source", "keep"],
      { cookie: adminCookie }
    );

    const reEvaluateResult = await postForm(`${adminBaseUrl}/bff/admin/discovery`, {
      intent: "re_evaluate",
      redirectTo: `${discoveryPath}?tab=portfolio&portfolioMissionId=${encodeURIComponent(missionId)}`,
      missionId,
    }, { cookie: adminCookie });
    if (typeof reEvaluateResult.json?.discovery_re_evaluated_count !== "number") {
      throw new Error("Discovery re-evaluation did not return a discovery_re_evaluated_count.");
    }
    await waitFor(
      "mission portfolio snapshot",
      async () => fetchJson(`${apiBaseUrl}/maintenance/discovery/missions/${encodeURIComponent(missionId)}`),
      (payload) => String(payload?.latest_portfolio_snapshot_id ?? "").trim().length > 0
    );
    await assertHtmlContains(
      `${adminBaseUrl}/discovery?tab=portfolio&portfolioMissionId=${encodeURIComponent(missionId)}`,
      [missionTitle, "Re-evaluate mission", "Ranked sources", `discovery-${runId}.example.test`],
      { cookie: adminCookie }
    );
    await assertHtmlContains(
      `${adminBaseUrl}/discovery?tab=sources&portfolioMissionId=${encodeURIComponent(missionId)}`,
      [`discovery-${runId}.example.test`, "Generic source quality", "Mission fit"],
      { cookie: adminCookie }
    );

    log("Seeding recall mission/candidate state through the maintenance API.");
    const recallMission = await postJson(`${apiBaseUrl}/maintenance/discovery/recall-missions`, {
      title: `Recall mission ${runId}`,
      description: "Admin acceptance recall mission",
      missionKind: "domain_seed",
      seedDomains: [`recall-${runId}.example.test`],
      seedQueries: [`recall ${runId}`],
      targetProviderTypes: ["rss"],
      scopeJson: { acceptance: true },
      maxCandidates: 4,
      createdBy: adminEmail,
    });
    recallMissionId = String(recallMission?.recall_mission_id ?? "");
    if (!recallMissionId) {
      throw new Error("Recall mission creation did not return a recall_mission_id.");
    }
    const recallCandidate = await postJson(`${apiBaseUrl}/maintenance/discovery/recall-candidates`, {
      recallMissionId,
      url: `https://recall-${runId}.example.test/feed.xml`,
      finalUrl: `https://recall-${runId}.example.test/feed.xml`,
      title: `Recall candidate ${runId}`,
      description: "Admin acceptance recall candidate",
      providerType: "rss",
      status: "pending",
      qualitySignalSource: "acceptance_manual",
      evaluationJson: { classification: "rss" },
      createdBy: adminEmail,
    });
    recallCandidateId = String(recallCandidate?.recall_candidate_id ?? "");
    if (!recallCandidateId) {
      throw new Error("Recall candidate creation did not return a recall_candidate_id.");
    }
    const promotedRecallCandidate = await postJson(
      `${apiBaseUrl}/maintenance/discovery/recall-candidates/${encodeURIComponent(recallCandidateId)}/promote`,
      {
        enabled: true,
        reviewedBy: adminEmail,
        tags: ["acceptance"],
      }
    );
    const recallPromotionState =
      String(promotedRecallCandidate?.status ?? "") === "duplicate" ? "linked_duplicate" : "promoted";
    await assertHtmlContains(
      `${adminBaseUrl}/discovery?tab=recall`,
      [`Recall mission ${runId}`, `Recall candidate ${runId}`, recallPromotionState],
      { cookie: adminCookie }
    );

    console.log(
      JSON.stringify(
        {
          status: "discovery-admin-ok",
          missionId,
          classKey,
          discoveryRunId: runIdFromApi,
          candidateId,
          sourceProfileId,
          registeredChannelId,
          recallMissionId,
          recallCandidateId,
          recallPromotionState,
        },
        null,
        2
      )
    );
  } finally {
    if (adminCreated) {
      try {
        await deleteFirebasePasswordUser(firebaseApiKey, adminEmail, adminPassword);
      } catch (error) {
        log(`Firebase cleanup warning: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});

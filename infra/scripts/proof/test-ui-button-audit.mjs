import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import process from "node:process";
import { createRequire } from "node:module";
import {
  deleteFirebasePasswordUser,
  ensureFirebasePasswordUser,
  fetchJson,
  firstResultLine,
  postForm,
  queryPostgres,
  queryPostgresInt,
  readAllowlistEntries,
  readCookieValue,
  readEnvFile,
  requireConfigured,
  runCompose,
  selectAdminEmail,
  createWaitFor,
  sqlLiteral,
  waitForHttpHealth,
} from "../lib/compose-proof-testkit.mjs";

const requireFromFetchers = createRequire(
  new URL("../../../runtime/node/services/fetchers/package.json", import.meta.url)
);
const { chromium } = requireFromFetchers("playwright");

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
const PRIVATE_HOST_ALLOWLIST_ENV = "FETCHERS_ACQUISITION_PRIVATE_HOST_ALLOWLIST";
const UI_AUDIT_FIXTURE_ALLOWLIST = ["web"];

function ensureFixtureAllowlist() {
  const existing = String(process.env[PRIVATE_HOST_ALLOWLIST_ENV] ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  const merged = new Set([...existing, ...UI_AUDIT_FIXTURE_ALLOWLIST]);
  process.env[PRIVATE_HOST_ALLOWLIST_ENV] = [...merged].join(",");
}

function log(message) {
  console.log(`[ui-button-audit] ${message}`);
}

function apiUrl(pathname) {
  return `http://127.0.0.1:8080/api${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
}

const waitFor = createWaitFor({ timeoutMs: 120000, intervalMs: 1500 });

async function ensureComposeStack() {
  ensureFixtureAllowlist();
  log("Ensuring compose stack is available for the UI button audit.");
  log("Rebuilding admin and fetchers so the audit uses current BFF and acquisition-guard code.");
  runCompose("build", "admin");
  runCompose("build", "fetchers");
  runCompose("up", "-d", ...STACK_SERVICES);
  const healthOptions = { timeoutMs: 120000, intervalMs: 1500 };
  await Promise.all([
    waitForHttpHealth("api", "http://127.0.0.1:8000/health", healthOptions),
    waitForHttpHealth("web", "http://127.0.0.1:4321/api/health", healthOptions),
    waitForHttpHealth("admin", "http://127.0.0.1:4322/api/health", healthOptions),
    waitForHttpHealth("nginx", "http://127.0.0.1:8080/health", healthOptions),
  ]);
}

async function clickConfirmAction(page, trigger, confirmLabel) {
  await trigger.waitFor({ state: "visible", timeout: 10000 });
  await trigger.scrollIntoViewIfNeeded();

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await trigger.click({ force: attempt === 1, timeout: 3000 });
    } catch (error) {
      if (attempt === 1) {
        throw error;
      }
      await page.waitForTimeout(300);
      continue;
    }
    try {
      await page.getByRole("alertdialog").waitFor({ state: "visible", timeout: 3000 });
      await page
        .locator('[role="alertdialog"] button')
        .filter({ hasText: new RegExp(`^\\s*${confirmLabel}\\s*$`) })
        .first()
        .click();
      await page.waitForLoadState("networkidle").catch(() => {});
      return;
    } catch (error) {
      if (attempt === 1) {
        throw error;
      }
      await page.waitForTimeout(1200);
    }
  }
}

async function waitForButtonLabel(locator, expectedPattern) {
  await waitFor(
    "button label update",
    async () => {
      const text = await locator.first().textContent();
      return String(text ?? "").trim();
    },
    (text) => expectedPattern.test(String(text))
  );
}

async function clickAndWaitForToggle(locator, labels) {
  const readLabel = async () => String((await locator.first().textContent()) ?? "").trim();
  const initial = await readLabel();
  const expected = initial === labels.on ? labels.off : labels.on;
  await locator.first().click();
  await waitForButtonLabel(locator, new RegExp(`^${expected}$`));
  return { initial, expected };
}

function isRetryablePostgresConcurrencyError(error) {
  const message = [
    error instanceof Error ? error.message : String(error),
    typeof error?.stderr === "string" ? error.stderr : "",
    typeof error?.stdout === "string" ? error.stdout : "",
  ].join("\n");
  return /deadlock detected|could not serialize access|canceling statement due to conflict/iu.test(message);
}

async function queryPostgresWithConcurrencyRetry(env, sql, label, { maxAttempts = 4 } = {}) {
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return queryPostgres(env, sql);
    } catch (error) {
      lastError = error;
      if (!isRetryablePostgresConcurrencyError(error) || attempt >= maxAttempts) {
        throw error;
      }
      log(`${label} hit a retryable Postgres concurrency error; retrying ${attempt + 1}/${maxAttempts}.`);
      await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    }
  }
  throw lastError ?? new Error(`${label} failed without a captured error.`);
}

async function markSignalCandidateAsRecentFailure(env, docId, runId) {
  await queryPostgresWithConcurrencyRetry(
    env,
    `
      update signal_candidates
      set
        enrichment_state = 'failed',
        visibility_state = 'visible',
        updated_at = now()
      where doc_id = ${sqlLiteral(docId)}::uuid;
    `,
    `mark signal_candidate ${docId} as recent failure for ${runId}`
  );
}

async function readJsonResponse(response) {
  return await response.json().catch(async () => ({
    body: await response.text().catch(() => ""),
  }));
}

async function waitForAdminAutomationPost(page, action) {
  const [response] = await Promise.all([
    page.waitForResponse(
      (candidate) =>
        candidate.url().includes("/bff/admin/automation") &&
        candidate.request().method() === "POST",
      { timeout: 30000 }
    ),
    action(),
  ]);
  const payload = await readJsonResponse(response);
  if (!response.ok()) {
    throw new Error(
      `Automation BFF returned ${response.status()}: ${JSON.stringify(payload)}`
    );
  }
  return {
    payload,
    status: response.status(),
    url: response.url(),
  };
}

async function resolveCardByText(page, text) {
  const heading = page.getByText(text, { exact: true }).first();
  await heading.waitFor({ state: "visible", timeout: 10000 });
  return heading.locator(
    'xpath=ancestor::*[self::signal_candidate or self::div or self::details][contains(@class,"border")][1]'
  );
}

async function resolveTableRowByText(page, text) {
  const cell = page.getByText(text, { exact: true }).first();
  await cell.waitFor({ state: "visible", timeout: 10000 });
  return cell.locator("xpath=ancestor::tr[1]");
}

async function openPage(page, urlOrPath) {
  const response = await page.goto(urlOrPath, { waitUntil: "domcontentloaded" });
  if (!response || !response.ok()) {
    throw new Error(
      `Expected ${urlOrPath} to load successfully, got ${response?.status() ?? "no response"}.`
    );
  }
  await page.waitForLoadState("networkidle").catch(() => {});
}

async function seedWebScenario(env, adminCookie, webCookie, userId, runId) {
  const interestDescription = `Audit interest ${runId}`;
  const digestEmail = `button-audit-user-${runId}@example.test`;

  log("Seeding web user scenario.");
  const userInterest = await postForm(
    "http://127.0.0.1:4321/bff/interests",
    {
      description: interestDescription,
      positive_texts: "EU AI policy\nBrussels guidance",
      negative_texts: "sports\ncelebrity gossip",
      places: "Brussels, Warsaw",
      languages_allowed: "en",
      must_have_terms: "policy",
      priority: "1",
    },
    { cookie: webCookie }
  );
  const userInterestId = String(userInterest.json?.interestId ?? "");
  assert.ok(userInterestId);
  log("Web seed: created user interest.");

  await postForm(
    "http://127.0.0.1:4321/bff/notification-channels",
    { channelType: "email_digest", email: digestEmail },
    { cookie: webCookie }
  );
  await postForm(
    "http://127.0.0.1:4321/bff/notification-channels",
    { channelType: "telegram", chatId: `button-audit-${runId}` },
    { cookie: webCookie }
  );
  log("Web seed: connected digest and telegram channels.");

  await waitFor(
    "compiled user interest",
    async () => fetchJson("http://127.0.0.1:4321/bff/interests", { cookie: webCookie }),
    (payload) =>
      Array.isArray(payload?.interests) &&
      payload.interests.some(
        (interest) =>
          String(interest?.interest_id ?? "") === userInterestId &&
          String(interest?.compile_status ?? "") === "compiled"
      )
  );
  log("Web seed: user interest compiled.");

  await postForm(
    "http://127.0.0.1:4322/bff/admin/templates",
    {
      kind: "interest",
      intent: "save",
      name: `UI button audit system interest ${runId}`,
      description: "Deterministic editorial selection for browser click audit.",
      positive_texts: "EU AI policy update\nBrussels AI guidance\nWarsaw AI guidance",
      negative_texts: "sports\ncelebrity gossip",
      allowed_content_kinds: "editorial",
      languages_allowed: "en",
      priority: "1",
      isActive: "true",
    },
    { cookie: adminCookie }
  );
  log("Web seed: created supporting system interest.");

  const titles = [
    `EU AI policy update reaches Brussels and Warsaw ${runId}-one`,
    `EU AI policy update reaches Brussels and Warsaw ${runId}-two`,
  ];
  const channelIds = [];
  for (const label of ["one", "two"]) {
    const channel = await postForm(
      "http://127.0.0.1:4322/bff/admin/channels",
      {
        providerType: "rss",
        name: `UI audit RSS ${label} ${runId}`,
        fetchUrl: `http://web:4321/internal-mvp-feed.xml?run=${encodeURIComponent(`${runId}-${label}`)}`,
        language: "en",
      },
      { cookie: adminCookie }
    );
    const channelId = String(channel.json?.channelId ?? "");
    assert.ok(channelId);
    channelIds.push(channelId);
    runCompose(
      "exec",
      "-T",
      "fetchers",
      "pnpm",
      "--filter",
      "@signalops/fetchers",
      "run:once",
      channelId
    );
  }
  log("Web seed: fetched two RSS channels.");

  const signalCandidateRows = [];
  for (const title of titles) {
    const row = await waitFor(
      `signal_candidate row for ${title}`,
      async () => {
        const raw = queryPostgres(
          env,
          `
            select doc_id::text, processing_state
            from signal_candidates
            where title = ${sqlLiteral(title)}
            order by ingested_at desc
            limit 1;
          `
        );
        return raw ? raw.split("|") : null;
      },
      (value) => Array.isArray(value) && value.length === 2
    );
    signalCandidateRows.push({ docId: row[0], title });
  }
  log("Web seed: resolved signal_candidate rows.");

  const primarySignalCandidate = signalCandidateRows[0];
  const primaryNotificationDocId = primarySignalCandidate.docId;
  const primaryContentItemId = `signal_candidate:${primaryNotificationDocId}`;
  await waitFor(
    "primary signal_candidate worker pipeline before deterministic selection seed",
    async () =>
      queryPostgresInt(
        env,
        `
          select count(*)::int
          from signal_candidates a
          left join final_selection_results final on final.doc_id = a.doc_id
          where a.doc_id = ${sqlLiteral(primaryNotificationDocId)}::uuid
            and (
              final.doc_id is not null
              or a.processing_state in ('matched', 'embedded')
            );
        `
      ),
    (count) => count >= 1,
    {
      timeoutMs: 180000,
      intervalMs: 2000,
      describeLastValue: (count) => `stable primary signal_candidate count=${String(count)}`,
    }
  );
  firstResultLine(queryPostgres(
    env,
    `
      with signal_candidate_cluster as (
        select
          doc_id,
          coalesce(event_cluster_id, gen_random_uuid()) as cluster_id,
          title,
          published_at
        from signal_candidates
        where doc_id = ${sqlLiteral(primaryNotificationDocId)}::uuid
      ),
      upsert_cluster as (
        insert into event_clusters (
          cluster_id,
          signal_candidate_count,
          primary_title,
          min_published_at,
          max_published_at
        )
        select
          cluster_id,
          1,
          title,
          coalesce(published_at, now()),
          coalesce(published_at, now())
        from signal_candidate_cluster
        on conflict (cluster_id) do update
        set
          signal_candidate_count = greatest(event_clusters.signal_candidate_count, 1),
          primary_title = coalesce(event_clusters.primary_title, excluded.primary_title),
          min_published_at = coalesce(event_clusters.min_published_at, excluded.min_published_at),
          max_published_at = coalesce(event_clusters.max_published_at, excluded.max_published_at),
          updated_at = now()
        returning cluster_id
      ),
      upsert_member as (
        insert into event_cluster_members (cluster_id, doc_id)
        select cluster_id, doc_id
        from signal_candidate_cluster
        on conflict (doc_id) do update
        set cluster_id = excluded.cluster_id
        returning doc_id
      )
      update signal_candidates a
      set
        processing_state = 'matched',
        visibility_state = 'visible',
        canonical_doc_id = null,
        family_id = signal_candidate_cluster.doc_id,
        is_exact_duplicate = false,
        is_near_duplicate = false,
        event_cluster_id = signal_candidate_cluster.cluster_id,
        published_at = now(),
        ingested_at = now(),
        updated_at = now()
      from signal_candidate_cluster
      where a.doc_id = signal_candidate_cluster.doc_id;

      insert into system_feed_results (
        doc_id,
        decision,
        eligible_for_feed,
        total_criteria_count,
        relevant_criteria_count,
        irrelevant_criteria_count,
        pending_llm_criteria_count,
        explain_json
      )
      values (
        ${sqlLiteral(primaryNotificationDocId)}::uuid,
        'eligible',
        true,
        1,
        1,
        0,
        0,
        jsonb_build_object('source', 'ui-button-audit-seed', 'runId', ${sqlLiteral(runId)})
      )
      on conflict (doc_id) do update
      set
        decision = excluded.decision,
        eligible_for_feed = excluded.eligible_for_feed,
        total_criteria_count = excluded.total_criteria_count,
        relevant_criteria_count = excluded.relevant_criteria_count,
        irrelevant_criteria_count = excluded.irrelevant_criteria_count,
        pending_llm_criteria_count = excluded.pending_llm_criteria_count,
        explain_json = excluded.explain_json,
        updated_at = now();

      insert into final_selection_results (
        doc_id,
        final_decision,
        is_selected,
        compat_system_feed_decision,
        total_filter_count,
        matched_filter_count,
        no_match_filter_count,
        gray_zone_filter_count,
        technical_filtered_out_count,
        explain_json
      )
      values (
        ${sqlLiteral(primaryNotificationDocId)}::uuid,
        'selected',
        true,
        'eligible',
        1,
        1,
        0,
        0,
        0,
        jsonb_build_object(
          'source',
          'ui-button-audit-seed',
          'selectionMode',
          'browser_smoke_seed',
          'selectionReason',
          'Deterministic UI button browser proof seed.',
          'runId',
          ${sqlLiteral(runId)}
        )
      )
      on conflict (doc_id) do update
      set
        final_decision = excluded.final_decision,
        is_selected = excluded.is_selected,
        compat_system_feed_decision = excluded.compat_system_feed_decision,
        total_filter_count = excluded.total_filter_count,
        matched_filter_count = excluded.matched_filter_count,
        no_match_filter_count = excluded.no_match_filter_count,
        gray_zone_filter_count = excluded.gray_zone_filter_count,
        technical_filtered_out_count = excluded.technical_filtered_out_count,
        explain_json = excluded.explain_json,
        updated_at = now();
    `
  ));
  await waitFor(
    "system-selected collection availability",
    async () => {
      const payload = await fetchJson(
        apiUrl(`/collections/system-selected?page=1&pageSize=100&q=${encodeURIComponent(primarySignalCandidate.title)}`)
      );
      const items = Array.isArray(payload?.items) ? payload.items : [];
      return items.some((item) => String(item?.content_item_id ?? "") === primaryContentItemId);
    },
    Boolean
  );
  log(`Web seed: using content item ${primaryContentItemId}.`);
  firstResultLine(await queryPostgresWithConcurrencyRetry(
    env,
    `
      insert into interest_match_results (
        doc_id,
        user_id,
        interest_id,
        event_cluster_id,
        score_pos,
        score_neg,
        score_meta,
        score_novel,
        score_interest,
        score_user,
        decision,
        explain_json
      )
      select
        a.doc_id,
        ${sqlLiteral(userId)}::uuid,
        ${sqlLiteral(userInterestId)}::uuid,
        a.event_cluster_id,
        0.97,
        0.01,
        0.88,
        0.75,
        0.96,
        0.96,
        'notify',
        jsonb_build_object(
          'source',
          'ui-button-audit-seed',
          'runId',
          ${sqlLiteral(runId)}
        )
      from signal_candidates a
      where a.doc_id = ${sqlLiteral(primaryNotificationDocId)}::uuid
      on conflict (doc_id, interest_id) do update
      set
        user_id = excluded.user_id,
        event_cluster_id = excluded.event_cluster_id,
        score_pos = excluded.score_pos,
        score_neg = excluded.score_neg,
        score_meta = excluded.score_meta,
        score_novel = excluded.score_novel,
        score_interest = excluded.score_interest,
        score_user = excluded.score_user,
        decision = excluded.decision,
        explain_json = excluded.explain_json,
        created_at = now()
      returning interest_match_id::text;
    `,
    "seeded interest match upsert"
  ));
  await waitFor(
    "seeded user match row",
    async () =>
      queryPostgresInt(
        env,
        `
          select count(*)::int
          from interest_match_results
          where user_id = ${sqlLiteral(userId)}
            and interest_id = ${sqlLiteral(userInterestId)}
            and doc_id = ${sqlLiteral(primaryNotificationDocId)}::uuid
            and decision = 'notify';
        `
      ),
    (count) => count >= 1
  );
  log("Web seed: match row visible.");

  const notificationId = firstResultLine(queryPostgres(
    env,
    `
      insert into notification_log (
        user_id,
        interest_id,
        doc_id,
        channel_type,
        status,
        title,
        body,
        decision_reason,
        delivery_payload_json
      )
      values (
        ${sqlLiteral(userId)},
        ${sqlLiteral(userInterestId)},
        ${sqlLiteral(primaryNotificationDocId)},
        'telegram',
        'sent',
        ${sqlLiteral(`UI button audit notification ${runId}`)},
        ${sqlLiteral("Deterministic notification row for browser feedback proof.")},
        ${sqlLiteral("seeded_browser_audit")},
        '{}'::jsonb
      )
      returning notification_id::text;
    `
  ));
  assert.ok(notificationId);

  await waitFor(
    "notification rows for click audit",
    async () =>
      queryPostgresInt(
        env,
        `
          select count(*)::int
          from notification_log
          where user_id = ${sqlLiteral(userId)};
        `
      ),
    (count) => count >= 1
  );
  log("Web seed: notification row visible.");

  await postForm(
    "http://127.0.0.1:4321/bff/content-state",
    { contentItemId: primaryContentItemId, action: "save" },
    { cookie: webCookie }
  );
  await postForm(
    "http://127.0.0.1:4321/bff/story-follow",
    { contentItemId: primaryContentItemId, action: "follow" },
    { cookie: webCookie }
  );
  log("Web seed: saved and followed primary content item.");

  log("Web user scenario seeded.");

  return {
    interestDescription,
    userInterestId,
    digestEmail,
    targetUserId: userId,
    webCookie,
    contentItemId: primaryContentItemId,
    signalCandidateTitles: titles,
    channelIds,
  };
}

async function seedAdminFixtures(env, adminCookie, runId) {
  log("Seeding admin fixtures for browser click coverage.");

  const llmTemplate = await postForm(
    "http://127.0.0.1:4322/bff/admin/templates",
    {
      kind: "llm",
      intent: "save",
      name: `UI audit LLM template ${runId}`,
      scope: "interests",
      language: "en",
      templateText: `Classify gray-zone item for audit ${runId}`,
      isActive: "true",
    },
    { cookie: adminCookie }
  );
  const llmTemplateId = String(llmTemplate.json?.promptTemplateId ?? "");
  assert.ok(llmTemplateId);

  const systemInterest = await postForm(
    "http://127.0.0.1:4322/bff/admin/templates",
    {
      kind: "interest",
      intent: "save",
      name: `UI audit template ${runId}`,
      description: "Button audit system interest",
      positive_texts: "audit\nbutton",
      negative_texts: "sports",
      allowed_content_kinds: "editorial",
      languages_allowed: "en",
      priority: "1",
      isActive: "true",
    },
    { cookie: adminCookie }
  );
  const systemInterestId = String(systemInterest.json?.interestTemplateId ?? "");
  assert.ok(systemInterestId);

  const deletableChannel = await postForm(
    "http://127.0.0.1:4322/bff/admin/channels",
    {
      providerType: "rss",
      name: `UI audit delete channel ${runId}`,
      fetchUrl: `http://web:4321/internal-mvp-feed.xml?run=${encodeURIComponent(`delete-${runId}`)}`,
      language: "en",
    },
    { cookie: adminCookie }
  );
  const deletableChannelId = String(deletableChannel.json?.channelId ?? "");
  assert.ok(deletableChannelId);

  const editableChannel = await postForm(
    "http://127.0.0.1:4322/bff/admin/channels",
    {
      providerType: "rss",
      name: `UI audit edit channel ${runId}`,
      fetchUrl: `http://web:4321/internal-mvp-feed.xml?run=${encodeURIComponent(`edit-${runId}`)}`,
      language: "en",
    },
    { cookie: adminCookie }
  );
  const editableChannelId = String(editableChannel.json?.channelId ?? "");
  assert.ok(editableChannelId);

  const discoveryRunId = firstResultLine(queryPostgres(
    env,
    `
      insert into discovery_vnext_runs (
        run_kind,
        trigger_kind,
        status,
        request_json,
        result_json,
        created_by
      )
      values (
        'full',
        'operator',
        'succeeded',
        ${sqlLiteral(JSON.stringify({ uiAudit: true, title: `UI audit discovery run ${runId}` }))}::jsonb,
        '{"uiAudit":true}'::jsonb,
        'ui-button-audit'
      )
      returning vnext_run_id::text;
    `
  ));
  assert.ok(discoveryRunId);

  const discoveryArtifactId = firstResultLine(queryPostgres(
    env,
    `
      insert into discovery_artifacts (
        artifact_type,
        schema_version,
        vnext_run_id,
        created_by,
        policy_version,
        status,
        payload_json,
        validation_json
      )
      values (
        'DiscoveryBrief',
        '1.0',
        ${sqlLiteral(discoveryRunId)},
        'ui-button-audit',
        'vnext-1',
        'validated',
        ${sqlLiteral(JSON.stringify({
          interestSummary: `UI audit discovery brief ${runId}`,
          neutrality: { domainSpecificRules: false },
        }))}::jsonb,
        '{"valid":true}'::jsonb
      )
      returning artifact_id::text;
    `
  ));
  assert.ok(discoveryArtifactId);

  const discoveryCandidateId = firstResultLine(queryPostgres(
    env,
    `
      insert into discovery_candidates (
        vnext_run_id,
        interest_id,
        hypothesis_artifact_id,
        canonical_url,
        canonical_domain,
        candidate_kind_guess,
        acquisition_json,
        status
      )
      values (
        ${sqlLiteral(discoveryRunId)},
        null,
        ${sqlLiteral(discoveryArtifactId)},
        ${sqlLiteral(`https://audit-${runId}.example.test/feed.xml`)},
        ${sqlLiteral(`audit-${runId}.example.test`)},
        'rss_feed',
        '{"uiAudit":true,"queryFamily":"button-audit"}'::jsonb,
        'routed'
      )
      returning candidate_id::text;
    `
  ));
  assert.ok(discoveryCandidateId);

  const discoveryInventoryId = firstResultLine(queryPostgres(
    env,
    `
      insert into source_inventory (
        canonical_domain,
        canonical_url,
        source_identity_key,
        current_state,
        current_provider_type,
        risk_json,
        tags
      )
      values (
        ${sqlLiteral(`audit-${runId}.example.test`)},
        ${sqlLiteral(`https://audit-${runId}.example.test/feed.xml`)},
        ${sqlLiteral(`ui-audit:${runId}`)},
        'manual_review',
        'rss',
        '{"uiAudit":true}'::jsonb,
        array['ui-audit']::text[]
      )
      returning source_inventory_id::text;
    `
  ));
  assert.ok(discoveryInventoryId);

  const signalCandidateDocId = firstResultLine(queryPostgres(
    env,
    `
      select doc_id::text
      from signal_candidates
      order by ingested_at desc
      limit 1;
    `
  ));
  assert.ok(signalCandidateDocId);
  queryPostgres(
    env,
    `
      update signal_candidates
      set enrichment_state = 'failed',
          updated_at = now()
      where doc_id = ${sqlLiteral(signalCandidateDocId)};
    `
  );

  const resourceId = firstResultLine(queryPostgres(
    env,
    `
      select resource_id::text
      from web_resources
      order by discovered_at desc nulls last, created_at desc
      limit 1;
    `
  ));

  return {
    llmTemplateId,
    systemInterestId,
    editableChannelId,
    deletableChannelId,
    discoveryRunId,
    discoveryArtifactId,
    discoveryCandidateId,
    discoveryInventoryId,
    signalCandidateDocId,
    resourceId,
  };
}

async function reassertWebMatchSeed(env, runId, scenario) {
  const docId = String(scenario.contentItemId ?? "").replace(/^signal_candidate:/, "");
  if (!docId || !scenario.targetUserId || !scenario.userInterestId) {
    throw new Error("Web match seed cannot be reasserted without content, user, and interest identifiers.");
  }
  firstResultLine(await queryPostgresWithConcurrencyRetry(
    env,
    `
      update signal_candidates
      set
        processing_state = 'matched',
        published_at = now(),
        ingested_at = now(),
        updated_at = now()
      where doc_id = ${sqlLiteral(docId)}::uuid;

      update system_feed_results
      set
        decision = 'eligible',
        eligible_for_feed = true,
        updated_at = now()
      where doc_id = ${sqlLiteral(docId)}::uuid;

      update final_selection_results
      set
        final_decision = 'selected',
        is_selected = true,
        compat_system_feed_decision = 'eligible',
        updated_at = now()
      where doc_id = ${sqlLiteral(docId)}::uuid;

      insert into interest_match_results (
        doc_id,
        user_id,
        interest_id,
        event_cluster_id,
        score_pos,
        score_neg,
        score_meta,
        score_novel,
        score_interest,
        score_user,
        decision,
        explain_json
      )
      select
        a.doc_id,
        ${sqlLiteral(scenario.targetUserId)}::uuid,
        ${sqlLiteral(scenario.userInterestId)}::uuid,
        a.event_cluster_id,
        0.99,
        0.01,
        0.92,
        0.78,
        0.99,
        0.99,
        'notify',
        jsonb_build_object('source', 'ui-button-audit-reassert', 'runId', ${sqlLiteral(runId)})
      from signal_candidates a
      where a.doc_id = ${sqlLiteral(docId)}::uuid
      on conflict (doc_id, interest_id) do update
      set
        user_id = excluded.user_id,
        event_cluster_id = excluded.event_cluster_id,
        score_pos = excluded.score_pos,
        score_neg = excluded.score_neg,
        score_meta = excluded.score_meta,
        score_novel = excluded.score_novel,
        score_interest = excluded.score_interest,
        score_user = excluded.score_user,
        decision = excluded.decision,
        explain_json = excluded.explain_json,
        created_at = now();
    `,
    "web match reassert"
  ));
}

async function auditWebButtons(page, env, runId, scenario, result) {
  log("Auditing web buttons.");

  log("Web: collection save/unsave.");
  await reassertWebMatchSeed(env, runId, scenario);
  await openPage(page, `/?q=${encodeURIComponent(scenario.signalCandidateTitles[0] ?? "")}`);
  await waitFor(
    "collection save toggle",
    async () => page.getByRole("button", { name: /Save|Unsave/ }).count(),
    (count) => count >= 1
  );
  await clickAndWaitForToggle(page.getByRole("button", { name: /Save|Unsave/ }).first(), {
    on: "Save",
    off: "Unsave",
  });
  result.checked.push("web:/ collection save/unsave");

  log("Web: mobile shell menu toggle.");
  const mobileContext = await page.context().browser().newContext({
    baseURL: "http://127.0.0.1:4321",
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  try {
    for (const cookie of await page.context().cookies("http://127.0.0.1:4321")) {
      await mobileContext.addCookies([cookie]);
    }
    const mobilePage = await mobileContext.newPage();
    await openPage(mobilePage, "/");
    await mobilePage.getByLabel("Toggle menu").click();
    await mobilePage.getByRole("link", { name: "Saved", exact: true }).click();
    await mobilePage.waitForURL("**/saved");
    result.checked.push("web:mobile shell menu toggle");
    await mobilePage.close();
  } finally {
    await mobileContext.close();
  }

  log("Web: content detail buttons.");
  await openPage(page, `/content/${encodeURIComponent(scenario.contentItemId)}`);
  await clickAndWaitForToggle(page.getByRole("button", { name: /Mark seen|Mark unread/ }).first(), {
    on: "Mark seen",
    off: "Mark unread",
  });
  result.checked.push("web:/content mark seen/unread");

  const contentSaveToggle = await clickAndWaitForToggle(page.getByRole("button", { name: /Save|Unsave/ }).first(), {
    on: "Save",
    off: "Unsave",
  });
  if (contentSaveToggle.expected === "Save") {
    await clickAndWaitForToggle(page.getByRole("button", { name: /Save|Unsave/ }).first(), {
      on: "Save",
      off: "Unsave",
    });
  }
  result.checked.push("web:/content save");

  await clickAndWaitForToggle(page.getByRole("button", { name: /Follow story|Following/ }).first(), {
    on: "Follow story",
    off: "Following",
  });
  result.checked.push("web:/content follow/unfollow");

  log("Web: saved digest buttons.");
  await openPage(page, "/saved");
  await page.getByRole("button", { name: /Preview/ }).first().click();
  await page.waitForURL(/\/saved\/digest/);
  result.checked.push("web:/saved preview digest");

  await page.getByRole("button", { name: "Send to email" }).click();
  await page.waitForLoadState("networkidle").catch(() => {});
  result.checked.push("web:/saved/digest send to email");

  await openPage(page, `/content/${encodeURIComponent(scenario.contentItemId)}`);
  const saveButtonBeforeArchive = page.getByRole("button", { name: /Save|Unsave/ }).first();
  if (/^Save$/.test(String((await saveButtonBeforeArchive.textContent()) ?? "").trim())) {
    await clickAndWaitForToggle(saveButtonBeforeArchive, {
      on: "Save",
      off: "Unsave",
    });
  }
  const archiveButton = page.getByRole("button", { name: /^Archive$/ }).first();
  await archiveButton.click();
  await waitForButtonLabel(page.getByRole("button", { name: /^Save$/ }).first(), /^Save$/);
  result.checked.push("web:/content archive");

  log("Web: interests CRUD buttons.");
  await openPage(page, "/interests");
  await page.getByRole("button", { name: "Add Interest" }).click();
  await page.locator('textarea[name="description"]').fill(`UI audit browser interest ${runId}`);
  await page.locator('textarea[name="positive_texts"]').fill("browser\nbuttons");
  await page.getByRole("button", { name: "Create Interest" }).click();
  await page.getByText(`UI audit browser interest ${runId}`, { exact: true }).waitFor({
    state: "visible",
    timeout: 15000,
  });
  result.checked.push("web:/interests create");

  const createdInterestDescription = `UI audit browser interest ${runId}`;
  const updatedInterestDescription = `UI audit browser interest updated ${runId}`;
  const clonedInterestDescription = `Copy of ${updatedInterestDescription}`;
  const interestCard = await resolveCardByText(page, createdInterestDescription);
  await interestCard.getByRole("button", { name: /Edit \/ Clone \/ Delete/ }).click();
  await interestCard.locator('textarea[name="description"]').fill(updatedInterestDescription);
  await interestCard.getByRole("button", { name: /^Save$/ }).click();
  await page.getByText(updatedInterestDescription, { exact: true }).first().waitFor({
    state: "visible",
    timeout: 15000,
  });
  result.checked.push("web:/interests save");

  const updatedInterestCard = await resolveCardByText(page, updatedInterestDescription);
  await updatedInterestCard.getByRole("button", { name: /^Clone$/ }).click();
  await page.getByText(clonedInterestDescription, { exact: true }).first().waitFor({
    state: "visible",
    timeout: 15000,
  });
  result.checked.push("web:/interests clone");

  const clonedCard = await resolveCardByText(page, clonedInterestDescription);
  await clonedCard.getByRole("button", { name: /Edit \/ Clone \/ Delete/ }).click();
  await clonedCard.getByRole("button", { name: /^Delete$/ }).click();
  await waitFor(
    "deleted cloned interest",
    async () => page.getByText(clonedInterestDescription, { exact: true }).count(),
    (count) => count === 0
  );
  result.checked.push("web:/interests delete");

  log("Web: settings buttons.");
  await openPage(page, "/settings");
  await page.locator("#theme-select").selectOption("dark");
  await page.getByRole("button", { name: /^Save$/ }).click();
  result.checked.push("web:/settings appearance save");

  const prefToggle = page.locator('input[name="telegramEnabled"][type="checkbox"]').first();
  const prefWasChecked = await prefToggle.isChecked();
  await prefToggle.locator('xpath=ancestor::label[1]').click();
  await waitFor(
    "telegram preference toggle",
    async () => prefToggle.isChecked(),
    (checked) => checked === !prefWasChecked
  );
  await page.getByRole("button", { name: "Save Preferences" }).click();
  result.checked.push("web:/settings preferences save");

  await page.locator("#digest-cadence").selectOption("weekly");
  await page.getByRole("button", { name: "Save Digest Settings" }).click();
  result.checked.push("web:/settings digest save");

  await page.locator('input[name="chatId"]').fill(`button-browser-${runId}`);
  await page.getByRole("button", { name: /^Connect$/ }).first().click();
  result.checked.push("web:/settings connect telegram");

  await page.locator('input[name="email"]').last().fill(`button-browser-${runId}@example.test`);
  await page.getByRole("button", { name: /^Connect$/ }).last().click();
  result.checked.push("web:/settings connect email digest");

  const webPushButton = page.getByRole("button", { name: "Connect Web Push" });
  if ((await webPushButton.count()) > 0 && (await webPushButton.isEnabled())) {
    try {
      await page.context().grantPermissions(["notifications"], {
        origin: "http://127.0.0.1:4321",
      });
      await webPushButton.click();
      await waitFor(
        "web push notification channel",
        async () =>
          fetchJson("http://127.0.0.1:4321/bff/notification-channels", {
            cookie: scenario.webCookie,
          }),
        (payload) =>
          Array.isArray(payload?.channels) &&
          payload.channels.some(
            (channel) => String(channel?.channel_type ?? channel?.channelType ?? "") === "web_push"
          ),
        { timeoutMs: 15000 }
      );
      result.checked.push("web:/settings connect web push");
    } catch (error) {
      const webPushStatus = String(
        (await webPushButton.locator("xpath=ancestor::div[contains(@class,'rounded-lg')][1]//p[last()]").textContent().catch(() => "")) ?? ""
      ).trim();
      result.skipped.push({
        route: "/settings",
        action: "Connect Web Push",
        reason: webPushStatus || (error instanceof Error ? error.message : "Headless Chromium push registration failed"),
      });
    }
  } else {
    result.notApplicable.push("web:/settings connect web push disabled");
  }

  log("Web: notification feedback buttons.");
  await openPage(page, "/notifications");
  const helpfulButton = page.locator('button[title="Helpful"]').first();
  await helpfulButton.click();
  await page.waitForLoadState("networkidle").catch(() => {});
  await openPage(page, "/notifications");
  const notHelpfulButtons = page.locator('button[title="Not helpful"]');
  if ((await notHelpfulButtons.count()) > 1) {
    await notHelpfulButtons.nth(1).click();
  } else {
    await notHelpfulButtons.first().click();
  }
  await page.waitForLoadState("networkidle").catch(() => {});
  result.checked.push("web:/notifications helpful/not helpful");

  await openPage(page, "/following");
  result.notApplicable.push("web:/following no standalone buttons rendered once story is followed");

  log("Web: matches button.");
  reassertWebMatchSeed(env, runId, scenario);
  await openPage(page, "/matches");
  await waitFor(
    "matches save toggle",
    async () => page.getByRole("button", { name: /Save|Unsave/ }).count(),
    (count) => count >= 1
  );
  await clickAndWaitForToggle(page.getByRole("button", { name: /Save|Unsave/ }).first(), {
    on: "Save",
    off: "Unsave",
  });
  result.checked.push("web:/matches save toggle");
}

async function auditAdminButtons(page, env, runId, fixtures, webScenario, result) {
  log("Auditing admin buttons.");

  log("Admin: system interest editor buttons.");
  await openPage(page, `/templates/interests/${encodeURIComponent(fixtures.systemInterestId)}/edit`);
  await page.locator('textarea[name="description"]').fill(`Updated UI audit template ${runId}`);
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.getByText(`Updated UI audit template ${runId}`).first().waitFor({ state: "visible", timeout: 15000 });
  result.checked.push("admin:/templates/interests edit save");

  await clickConfirmAction(page, page.getByRole("button", { name: /^Archive$/ }).first(), "Archive system interest");
  await page.getByText("Archived", { exact: true }).first().waitFor({ state: "visible", timeout: 10000 });
  await clickConfirmAction(page, page.getByRole("button", { name: /^Activate$/ }).first(), "Activate system interest");
  await page.getByText("Active", { exact: true }).first().waitFor({ state: "visible", timeout: 15000 });
  result.checked.push("admin:/templates/interests archive/activate");

  await clickConfirmAction(page, page.getByRole("button", { name: /^Delete$/ }).first(), "Delete system interest");
  await page.waitForLoadState("networkidle").catch(() => {});
  result.checked.push("admin:/templates/interests delete");

  log("Admin: LLM template editor buttons.");
  await openPage(page, `/templates/llm/${encodeURIComponent(fixtures.llmTemplateId)}/edit`);
  await page.locator('textarea[name="templateText"]').fill(`Updated LLM prompt ${runId} {title}`);
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.getByText(`Updated LLM prompt ${runId}`).first().waitFor({ state: "visible", timeout: 15000 });
  result.checked.push("admin:/templates/llm edit save");

  await clickConfirmAction(page, page.getByRole("button", { name: /^Archive$/ }).first(), "Archive template");
  await clickConfirmAction(page, page.getByRole("button", { name: /^Activate$/ }).first(), "Activate template");
  await page.getByText("Active", { exact: true }).first().waitFor({ state: "visible", timeout: 15000 });
  result.checked.push("admin:/templates/llm archive/activate");

  await clickConfirmAction(page, page.getByRole("button", { name: /^Delete$/ }).first(), "Delete template");
  result.checked.push("admin:/templates/llm delete");

  log("Admin: channel create/edit/import/list buttons.");
  await openPage(page, "/channels/new?providerType=rss");
  await page.locator('input[name="name"]').fill(`UI audit browser channel ${runId}`);
  await page.locator('input[name="fetchUrl"]').fill(
    `http://web:4321/internal-mvp-feed.xml?run=${encodeURIComponent(`browser-new-${runId}`)}`
  );
  const createChannelButton = page.getByRole("button", { name: /Create .* channel|Save changes/ });
  await Promise.all([
    page.waitForURL(/\/channels\/.+\/edit/, { timeout: 30000 }).catch(async (error) => {
      const currentUrl = page.url();
      const bodyText = await page.locator("body").innerText({ timeout: 3000 }).catch(() => "");
      throw new Error(
        `Timed out waiting for channel create redirect from ${currentUrl}. Visible page text: ${bodyText.slice(0, 1200)}. ${error instanceof Error ? error.message : String(error)}`
      );
    }),
    createChannelButton.click(),
  ]);
  const createdChannelUrl = page.url();
  const createdChannelId = createdChannelUrl.match(/\/channels\/([^/]+)\/edit/)?.[1] ?? "";
  assert.ok(createdChannelId);
  result.checked.push("admin:/channels/new create");

  await page.locator('input[name="language"]').fill("en");
  await page.getByRole("button", { name: "Save changes" }).click();
  result.checked.push("admin:/channels/:id/edit save");

  await openPage(page, "/channels/import");
  await page.getByRole("button", { name: "Load example" }).click();
  await page.getByRole("button", { name: "Validate" }).click();
  const jsonArea = page.locator("textarea").first();
  await jsonArea.fill(
    JSON.stringify(
      [
        {
          providerType: "rss",
          name: `Audit RSS ${runId}`,
          fetchUrl: `http://web:4321/internal-mvp-feed.xml?run=${encodeURIComponent(`audit-import-rss-${runId}`)}`,
          language: "en",
          isActive: true,
          pollIntervalSeconds: 1800,
        },
        {
          providerType: "website",
          name: `Audit Website ${runId}`,
          fetchUrl: `http://web:4321/internal-mvp-site?run=${encodeURIComponent(`audit-import-website-${runId}`)}`,
          language: "en",
          isActive: true,
          pollIntervalSeconds: 1800,
        },
      ],
      null,
      2
    )
  );
  await Promise.all([
    page.waitForURL(/\/channels\/import.*flash_status=/u, { timeout: 30000 }),
    page.getByRole("button", { name: "Import JSON" }).click(),
  ]);
  await page.waitForLoadState("networkidle").catch(() => {});
  result.checked.push("admin:/channels/import load example/validate/import rss+website");

  await openPage(page, "/channels");
  await page.getByRole("spinbutton", { name: "Base interval (seconds)" }).fill("1800");
  await clickConfirmAction(
    page,
    page.getByRole("button", { name: "Apply schedule" }),
    "Apply to RSS channels"
  );
  result.checked.push("admin:/channels apply schedule");

  await openPage(page, "/channels");
  const deleteChannelRow = await resolveTableRowByText(page, `UI audit delete channel ${runId}`);
  const deleteChannelButton = deleteChannelRow.getByRole("button", { name: /Delete|Archive/ }).first();
  const deleteChannelLabel = String((await deleteChannelButton.textContent()) ?? "").trim() || "Delete";
  await deleteChannelButton.waitFor({ state: "visible", timeout: 10000 });
  await deleteChannelButton.scrollIntoViewIfNeeded();
  await deleteChannelButton.click({ force: true, timeout: 3000 });
  await page.getByRole("alertdialog").waitFor({ state: "visible", timeout: 3000 });
  await page
    .locator('[role="alertdialog"] button')
    .filter({ hasText: new RegExp(`^\\s*${deleteChannelLabel}\\s*$`) })
    .first()
    .click();
  await page.waitForLoadState("networkidle").catch(() => {});
  result.checked.push("admin:/channels delete row");

  log("Admin: user-interests buttons.");
  await openPage(page, "/user-interests");
  await page.locator('input[name="userId"]').fill(webScenario.targetUserId);
  await Promise.all([
    page.waitForURL(/\/user-interests\?.*userId=/u, { timeout: 15000 }),
    page.getByRole("button", { name: "Find user" }).click(),
  ]);
  await page.waitForLoadState("networkidle").catch(() => {});
  await openPage(
    page,
    `/user-interests?userId=${encodeURIComponent(webScenario.targetUserId)}&mode=create`
  );
  await page.locator('textarea[name="description"]').first().fill(`Admin managed interest ${runId}`);
  await page.getByRole("button", { name: "Create user interest" }).click();
  await page.getByText(`Admin managed interest ${runId}`, { exact: true }).first().waitFor({ state: "visible", timeout: 15000 });
  result.checked.push("admin:/user-interests create");

  const createdAdminInterestDescription = `Admin managed interest ${runId}`;
  const updatedAdminInterestDescription = `Admin managed interest updated ${runId}`;
  const createdAdminInterestLink = page
    .getByText(createdAdminInterestDescription, { exact: true })
    .first()
    .locator("xpath=ancestor::a[1]");
  await Promise.all([
    page.waitForURL(/\/user-interests\?.*selected=/u, { timeout: 15000 }),
    createdAdminInterestLink.click(),
  ]);
  await page.waitForLoadState("networkidle").catch(() => {});
  const userInterestEditorForm = page.locator('form[action*="/bff/admin/user-interests/"]').first();
  await userInterestEditorForm.locator('textarea[name="description"]').fill(updatedAdminInterestDescription);
  await userInterestEditorForm.getByRole("button", { name: "Save changes" }).click();
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.getByText(updatedAdminInterestDescription, { exact: true }).first().waitFor({ state: "visible", timeout: 15000 }).catch(async (error) => {
    const currentUrl = page.url();
    const bodyText = await page.locator("body").innerText({ timeout: 3000 }).catch(() => "");
    throw new Error(
      `Timed out waiting for admin user-interest update on ${currentUrl}. Visible page text: ${bodyText.slice(0, 1200)}. ${error instanceof Error ? error.message : String(error)}`
    );
  });
  result.checked.push("admin:/user-interests save");

  await userInterestEditorForm.getByRole("button", { name: "Clone" }).click();
  await waitFor(
    "cloned admin interest",
    async () => page.getByText(updatedAdminInterestDescription, { exact: true }).count(),
    (count) => count >= 2
  );
  result.checked.push("admin:/user-interests clone");

  await clickConfirmAction(
    page,
    page.getByRole("button", { name: "Delete" }).first(),
    "Delete interest"
  );
  result.checked.push("admin:/user-interests delete");

  log("Admin: signal_candidate moderation and retry buttons.");
  await markSignalCandidateAsRecentFailure(env, fixtures.signalCandidateDocId, runId);
  await openPage(page, `/signal-candidates?view=recent-failures&selected=${encodeURIComponent(fixtures.signalCandidateDocId)}`);
  const blockButton = page.getByRole("button", { name: /Block|Unblock/ }).first();
  await blockButton.waitFor({ state: "visible", timeout: 60000 }).catch(async (error) => {
    const currentUrl = page.url();
    const bodyText = await page.locator("body").innerText({ timeout: 3000 }).catch(() => "");
    throw new Error(
      `Timed out waiting for admin block/unblock button on ${currentUrl}. Visible page text: ${bodyText.slice(0, 1200)}. ${error instanceof Error ? error.message : String(error)}`
    );
  });
  const initialBlockLabel = String((await blockButton.textContent()) ?? "").trim();
  if (/Block/.test(initialBlockLabel)) {
    await clickConfirmAction(page, blockButton, "Block signal_candidate");
    await clickConfirmAction(page, page.getByRole("button", { name: /Unblock/ }).first(), "Unblock signal_candidate");
  } else {
    await clickConfirmAction(page, blockButton, "Unblock signal_candidate");
    await clickConfirmAction(page, page.getByRole("button", { name: /Block/ }).first(), "Block signal_candidate");
    await clickConfirmAction(page, page.getByRole("button", { name: /Unblock/ }).first(), "Unblock signal_candidate");
  }
  result.checked.push("admin:/signal-candidates block/unblock");

  await openPage(page, `/signal-candidates/${encodeURIComponent(fixtures.signalCandidateDocId)}`);
  await page.getByRole("button", { name: "Retry enrichment" }).click();
  result.checked.push("admin:/signal-candidates/:id retry enrichment");

  log("Admin: resources filter button.");
  await openPage(page, "/resources");
  await page.locator('select[name="projection"]').selectOption("resource_only");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await page.waitForURL(/projection=resource_only/);
  result.checked.push("admin:/resources apply filters");
  if (fixtures.resourceId) {
    await openPage(page, `/resources/${encodeURIComponent(fixtures.resourceId)}`);
    result.notApplicable.push("admin:/resources/:id no button actions rendered");
  }

  log("Admin: reindex queue button.");
  await openPage(page, "/reindex");
  await clickConfirmAction(
    page,
    page.getByRole("button", { name: "Queue maintenance job" }),
    "Start job"
  );
  result.checked.push("admin:/reindex queue maintenance job");

  log("Admin: automation buttons.");
  await openPage(page, "/automation");
  await Promise.all([
    page.waitForURL(/\/automation\/[0-9a-f-]+$/u, { waitUntil: "domcontentloaded", timeout: 30000 }),
    waitForAdminAutomationPost(page, () =>
      page.getByRole("button", { name: "Blank Linear Workflow" }).click()
    ),
  ]);
  await page.waitForLoadState("networkidle").catch(() => {});
  const automationEditorUrl = page.url();
  result.checked.push("admin:/automation blank workflow create");

  await page.getByRole("button", { name: "Run Now" }).click();
  await Promise.all([
    page.waitForURL(/\/automation\/[0-9a-f-]+\/executions$/u, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    }),
    page.getByRole("button", { name: "Request Run" }).click(),
  ]);
  await page.waitForLoadState("networkidle").catch(() => {});
  result.checked.push("admin:/automation request run");

  await openPage(page, automationEditorUrl);
  await page.getByRole("button", { name: "Archive" }).click();
  await page.getByRole("alertdialog").waitFor({ state: "visible", timeout: 3000 });
  await Promise.all([
    page.waitForURL(/\/automation(?:\?.*)?$/u, { waitUntil: "domcontentloaded", timeout: 30000 }),
    page
      .locator('[role="alertdialog"] button')
      .filter({ hasText: /^\s*Archive\s*$/u })
      .first()
      .click(),
  ]);
  result.checked.push("admin:/automation archive workflow");

  log("Admin: discovery smoke.");
  await openPage(page, "/discovery?tab=runs");
  result.skipped.push({
    route: "/discovery",
    action: "discovery action buttons",
    reason: "covered by admin discovery workspace checks in the full local product contour",
  });

  await openPage(page, "/templates");
  result.notApplicable.push("admin:/templates no button actions rendered");
  await openPage(page, "/observability");
  result.notApplicable.push("admin:/observability no button actions rendered");
  await openPage(page, "/help");
  result.notApplicable.push("admin:/help no button actions rendered");
  await openPage(page, "/");
  result.notApplicable.push("admin:/ dashboard no standalone button actions rendered");
}

async function main() {
  const env = await readEnvFile(".env.dev");
  const firebaseApiKey = requireConfigured(env, "FIREBASE_WEB_API_KEY", {
    proofName: "the UI button audit",
  });
  const runId = randomUUID().slice(0, 8);
  log(`Run id ${runId}`);
  const allowlistEntries = readAllowlistEntries(env);
  const adminEmail = selectAdminEmail(allowlistEntries, runId, { prefix: "button-audit" });
  const adminPassword = `SignalOps!${runId}`;
  const webProofEmail = `button-audit-user-${runId}@example.test`;
  let adminCreated = false;

  process.env.SIGNALOPS_WEB_TEST_AUTH_ENABLED = "true";
  process.env.SIGNALOPS_WEB_TEST_AUTH_EMAIL = webProofEmail;
  process.env.SIGNALOPS_WEB_GOOGLE_ALLOWED_DOMAIN = "example.test";
  await ensureComposeStack();

  const browser = await chromium.launch({ headless: true });
  try {
    await ensureFirebasePasswordUser(firebaseApiKey, adminEmail, adminPassword);
    adminCreated = true;

    log("Signing in through the admin app.");
    const adminSignIn = await postForm("http://127.0.0.1:4322/bff/auth/sign-in", {
      email: adminEmail,
      password: adminPassword,
      next: "/",
    });
    const adminCookie = adminSignIn.cookie;
    if (!adminCookie) {
      throw new Error("Admin sign-in did not return a session cookie.");
    }

    log("Bootstrapping proof-only Google web session.");
    const webBootstrap = await postForm("http://127.0.0.1:4321/bff/auth/bootstrap", {});
    const webCookie = webBootstrap.cookie;
    const userId = String(webBootstrap.json?.session?.userId ?? "");
    if (!webCookie || !userId) {
      throw new Error("Web bootstrap did not return a session cookie and user id.");
    }

    const webScenario = await seedWebScenario(env, adminCookie, webCookie, userId, runId);
    const adminFixtures = await seedAdminFixtures(env, adminCookie, runId);

    const webContext = await browser.newContext({ baseURL: "http://127.0.0.1:4321" });
    const sessionCookie = readCookieValue(webCookie);
    await webContext.addCookies([
      {
        name: sessionCookie.name,
        value: sessionCookie.value,
        url: "http://127.0.0.1:4321",
        httpOnly: true,
        sameSite: "Strict",
      },
    ]);

    const adminContext = await browser.newContext({ baseURL: "http://127.0.0.1:4322" });
    const adminSessionCookie = readCookieValue(adminCookie);
    await adminContext.addCookies([
      {
        name: adminSessionCookie.name,
        value: adminSessionCookie.value,
        url: "http://127.0.0.1:4322",
        httpOnly: true,
        sameSite: "Strict",
      },
    ]);

    const webPage = await webContext.newPage();
    const adminPage = await adminContext.newPage();
    for (const page of [webPage, adminPage]) {
      page.on("console", (message) => {
        if (message.type() === "error" || message.type() === "warning") {
          log(`browser ${message.type()}: ${message.text()}`);
        }
      });
      page.on("pageerror", (error) => {
        log(`pageerror: ${error.message}`);
      });
    }

    const result = {
      status: "ui-button-audit-ok",
      runId,
      checked: [],
      notApplicable: [],
      skipped: [],
      artifacts: {
        adminEmail,
        userId,
        webInterestId: webScenario.userInterestId,
        contentItemId: webScenario.contentItemId,
        signalCandidateDocId: adminFixtures.signalCandidateDocId,
        channelIds: [...webScenario.channelIds, adminFixtures.editableChannelId, adminFixtures.deletableChannelId],
      },
    };

    await auditWebButtons(webPage, env, runId, webScenario, result);
    await auditAdminButtons(adminPage, env, runId, adminFixtures, webScenario, result);

    await webContext.close();
    await adminContext.close();

    console.log(JSON.stringify(result, null, 2));
  } finally {
    await browser.close();
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

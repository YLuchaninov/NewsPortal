import { randomUUID } from "node:crypto";

import {
  assertHtmlContains,
  deleteFirebasePasswordUser,
  ensureFirebasePasswordUser,
  extractCookie,
  fetchJson,
  postForm,
  queryPostgres,
  queryPostgresInt,
  readAllowlistEntries,
  readEnvFile,
  requireConfigured,
  runCommand,
  runCompose,
  runComposeCapture,
  selectAdminEmail,
  sendRequest,
  createWaitFor,
  sqlLiteral,
} from "./lib/compose-proof-testkit.mjs";

function log(message) {
  console.log(`[mvp-internal] ${message}`);
}

const INTERNAL_MVP_FETCHERS_PRIVATE_HOST_ALLOWLIST = ["web", "web:4321"];

function mergeCsvValues(...values) {
  return [
    ...new Set(
      values
        .join(",")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    )
  ].join(",");
}

function readHeader(headers, name) {
  const value = headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

const adminActionTokenCache = new Map();
const webActionTokenCache = new Map();
const adminActionScopes = new Map([
  ["/bff/admin/signal-candidates/enrichment-retry", "signal_candidates.enrichment-retry"],
  ["/bff/admin/automation", "automation"],
  ["/bff/admin/channels", "channels"],
  ["/bff/admin/channels/bulk", "channels.bulk"],
  ["/bff/admin/channels/bulk/preflight", "channels.bulk.preflight"],
  ["/bff/admin/channels/schedule", "channels.schedule"],
  ["/bff/admin/content-analysis", "content-analysis"],
  ["/bff/admin/content-analysis-policies", "content-analysis-policies"],
  ["/bff/admin/content-filter-policies", "content-filter-policies"],
  ["/bff/admin/discovery", "discovery"],
  ["/bff/admin/mcp-tokens", "mcp-tokens"],
  ["/bff/admin/moderation", "moderation"],
  ["/bff/admin/reindex", "reindex"],
  ["/bff/admin/templates", "templates"],
  ["/bff/admin/user-interests", "user-interests"],
]);

function normalizeAdminActionPath(value) {
  const pathname = new URL(value, "http://127.0.0.1").pathname;
  if (pathname === "/admin") {
    return "/";
  }
  if (pathname.startsWith("/admin/bff/")) {
    return pathname.slice("/admin".length);
  }
  if (pathname.startsWith("/admin/")) {
    return pathname.slice("/admin".length) || "/";
  }
  return pathname.startsWith("/") ? pathname : `/${pathname}`;
}

function resolveAdminActionScope(url) {
  const pathname = normalizeAdminActionPath(url);
  const exact = adminActionScopes.get(pathname);
  if (exact) {
    return exact;
  }
  if (pathname.startsWith("/bff/admin/user-interests/")) {
    return "user-interests";
  }
  return "";
}

function parseAdminActionTokens(html) {
  const match = html.match(
    /<script[^>]*id=["']admin-action-tokens["'][^>]*>([\s\S]*?)<\/script>/i
  );
  if (!match) {
    return {};
  }
  try {
    const parsed = JSON.parse(match[1] ?? "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function parseJsonScriptById(html, id) {
  const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = html.match(
    new RegExp(`<script[^>]*id=["']${escapedId}["'][^>]*>([\\s\\S]*?)<\\/script>`, "i")
  );
  if (!match) {
    return null;
  }
  try {
    return JSON.parse(match[1] ?? "null");
  } catch {
    return null;
  }
}

function parseWebActionTokenBundle(html) {
  const tokens = parseJsonScriptById(html, "web-action-tokens");
  const targets = parseJsonScriptById(html, "web-action-token-targets");
  return {
    tokens: tokens && typeof tokens === "object" && !Array.isArray(tokens) ? tokens : {},
    targets: Array.isArray(targets) ? targets : [],
  };
}

async function readAdminActionToken(url, cookie) {
  if (!cookie) {
    return "";
  }
  const target = new URL(url);
  const scope = resolveAdminActionScope(target.href);
  if (!scope) {
    return "";
  }

  const cacheKey = `${target.origin}|${cookie}`;
  let tokens = adminActionTokenCache.get(cacheKey);
  if (!tokens) {
    const shellPath = target.pathname.startsWith("/admin/") ? "/admin/" : "/";
    const response = await sendRequest(`${target.origin}${shellPath}`, {
      method: "GET",
      headers: {
        Accept: "text/html",
        Cookie: cookie,
      },
    });
    if (response.status < 200 || response.status >= 300) {
      return "";
    }
    tokens = parseAdminActionTokens(response.text);
    adminActionTokenCache.set(cacheKey, tokens);
  }
  return String(tokens[scope] ?? "").trim();
}

function normalizeWebActionPath(value) {
  const pathname = new URL(value, "http://127.0.0.1").pathname;
  const bffIndex = pathname.indexOf("/bff/");
  return bffIndex >= 0 ? pathname.slice(bffIndex) : pathname;
}

function resolveWebActionScope(url, targets) {
  const pathname = normalizeWebActionPath(url);
  const exactTarget = targets.find(
    (target) => !target?.routePrefix && pathname === target?.targetPath
  );
  if (exactTarget) {
    return String(exactTarget.scope ?? "");
  }
  const prefixTarget = targets.find(
    (target) => target?.routePrefix && pathname.startsWith(`${target.targetPath}/`)
  );
  return String(prefixTarget?.scope ?? "");
}

async function readWebActionToken(url, cookie) {
  if (!cookie) {
    return "";
  }
  const target = new URL(url);
  if (!normalizeWebActionPath(target.href).startsWith("/bff/")) {
    return "";
  }

  const cacheKey = `${target.origin}|${cookie}`;
  let bundle = webActionTokenCache.get(cacheKey);
  if (!bundle) {
    const response = await sendRequest(`${target.origin}/`, {
      method: "GET",
      headers: {
        Accept: "text/html",
        Cookie: cookie,
      },
    });
    if (response.status < 200 || response.status >= 300) {
      return "";
    }
    bundle = parseWebActionTokenBundle(response.text);
    webActionTokenCache.set(cacheKey, bundle);
  }
  const scope = resolveWebActionScope(target.href, bundle.targets);
  return scope ? String(bundle.tokens[scope] ?? "").trim() : "";
}

function assertLocationSearchParams(location, searchParams = {}) {
  for (const [key, value] of Object.entries(searchParams)) {
    if (location.searchParams.get(key) !== value) {
      throw new Error(
        `Expected redirect search param ${key}=${value}, got ${location.searchParams.get(key) || "<none>"}.`
      );
    }
  }
}

function assertRedirect(response, { origin, pathname, status = 302, searchParams = {} }) {
  if (response.status !== status) {
    throw new Error(`Expected ${status} redirect, got ${response.status}.`);
  }

  const locationHeader = readHeader(response.headers, "location");
  if (!locationHeader) {
    throw new Error("Expected Location header for browser redirect.");
  }

  const location = new URL(locationHeader, origin);
  if (location.origin !== origin) {
    throw new Error(`Expected redirect origin ${origin}, got ${location.origin}.`);
  }
  if (location.pathname !== pathname) {
    throw new Error(`Expected redirect to ${pathname}, got ${location.pathname}.`);
  }
  assertLocationSearchParams(location, searchParams);
}

function assertFlashRedirect(
  response,
  { origin, pathname = "/", section, status, message, searchParams = {} }
) {
  if (response.status !== 303) {
    throw new Error(`Expected 303 redirect, got ${response.status}.`);
  }

  const locationHeader = readHeader(response.headers, "location");
  if (!locationHeader) {
    throw new Error("Expected Location header for browser redirect.");
  }

  const location = new URL(locationHeader, origin);
  if (location.origin !== origin) {
    throw new Error(`Expected redirect origin ${origin}, got ${location.origin}.`);
  }
  if (location.pathname !== pathname) {
    throw new Error(`Expected redirect to ${pathname}, got ${location.pathname}.`);
  }
  if (location.hash !== `#${section}`) {
    throw new Error(`Expected redirect hash #${section}, got ${location.hash || "<none>"}.`);
  }
  if (location.searchParams.get("flash_status") !== status) {
    throw new Error(
      `Expected flash_status=${status}, got ${location.searchParams.get("flash_status") || "<none>"}.`
    );
  }
  if (location.searchParams.get("flash_message") !== message) {
    throw new Error(
      `Expected flash_message=${message}, got ${location.searchParams.get("flash_message") || "<none>"}.`
    );
  }
  assertLocationSearchParams(location, searchParams);
}

async function assertHtmlDoesNotContain(url, snippets, { cookie } = {}) {
  const response = await sendRequest(url, {
    headers: cookie ? { Cookie: cookie } : {}
  });
  if (response.status !== 200) {
    throw new Error(`Expected ${url} to respond with 200, got ${response.status}.`);
  }

  for (const snippet of snippets) {
    if (response.text.includes(snippet)) {
      throw new Error(`Did not expect HTML from ${url} to include ${snippet}.`);
    }
  }
}

function assertExpiredCookie(response, cookieName) {
  const setCookie = readHeader(response.headers, "set-cookie");
  if (!setCookie.includes(`${cookieName}=`)) {
    throw new Error(`Expected Set-Cookie for ${cookieName}.`);
  }
  if (!setCookie.includes("Max-Age=0")) {
    throw new Error(`Expected ${cookieName} to be expired, got ${setCookie}.`);
  }
}

async function postBrowserForm(url, payload, { cookie } = {}) {
  const target = new URL(url);
  const adminActionToken = await readAdminActionToken(url, cookie);
  const webActionToken = await readWebActionToken(url, cookie);
  const body = new URLSearchParams(
    Object.entries(payload).map(([key, value]) => [key, String(value)])
  ).toString();

  return sendRequest(url, {
    method: "POST",
    headers: {
      Accept: "text/html,application/xhtml+xml",
      Origin: target.origin,
      Referer: `${target.origin}/`,
      "Sec-Fetch-Mode": "navigate",
      ...(cookie ? { Cookie: cookie } : {}),
      ...(adminActionToken ? { "x-admin-action-token": adminActionToken } : {}),
      ...(webActionToken ? { "x-web-action-token": webActionToken } : {}),
      "Content-Type": "application/x-www-form-urlencoded",
      "Content-Length": Buffer.byteLength(body).toString()
    },
    body
  });
}

const waitFor = createWaitFor({ timeoutMs: 180000, intervalMs: 2000 });
const ADMIN_BACKFILL_TIMEOUT_MS = 600000;

function getComposeServiceContainerId(service) {
  return runComposeCapture("ps", "-q", service).stdout.trim();
}

function getContainerHealthStatus(containerId) {
  return runCommand(
    "docker",
    [
      "inspect",
      "--format",
      "{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}",
      containerId
    ],
    {
      capture: true
    }
  ).stdout.trim();
}

function fetchComposeJson(service, url) {
  const result = runComposeCapture("exec", "-T", service, "wget", "-qO-", url);
  const text = result.stdout.trim();

  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { raw: text };
  }
}

function countInterestMatches(env, { docId, interestId }) {
  return queryPostgresInt(
    env,
    `
      select count(*)::int
      from interest_match_results
      where doc_id = ${sqlLiteral(docId)}
        and interest_id = ${sqlLiteral(interestId)};
    `
  );
}

function countNotifications(env, { docId, interestId = null, status = null, channelType = null }) {
  const filters = [`doc_id = ${sqlLiteral(docId)}`];
  if (interestId) {
    filters.push(`interest_id = ${sqlLiteral(interestId)}`);
  }
  if (status) {
    filters.push(`status = ${sqlLiteral(status)}`);
  }
  if (channelType) {
    filters.push(`channel_type = ${sqlLiteral(channelType)}`);
  }
  return queryPostgresInt(
    env,
    `
      select count(*)::int
      from notification_log
      where ${filters.join("\n        and ")};
    `
  );
}

function syncDeterministicFollowedStory(env, { docId, userId }) {
  queryPostgres(
    env,
    `
      insert into user_followed_event_clusters (
        user_id,
        event_cluster_id,
        followed_at,
        last_seen_at
      )
      select
        ${sqlLiteral(userId)}::uuid,
        event_cluster_id,
        now(),
        now()
      from signal_candidates
      where doc_id = ${sqlLiteral(docId)}::uuid
        and event_cluster_id is not null
      on conflict (user_id, event_cluster_id) do update
      set
        followed_at = greatest(
          user_followed_event_clusters.followed_at,
          excluded.followed_at
        ),
        last_seen_at = excluded.last_seen_at,
        updated_at = now();
    `
  );
}

function upsertDeterministicInterestMatch(env, { docId, userId, interestId, runId }) {
  queryPostgres(
    env,
    `
      update signal_candidates
      set
        processing_state = 'matched',
        visibility_state = 'visible',
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
        ${sqlLiteral(userId)}::uuid,
        ${sqlLiteral(interestId)}::uuid,
        a.event_cluster_id,
        0.97,
        0.01,
        0.90,
        0.75,
        0.96,
        0.96,
        'notify',
        jsonb_build_object('source', 'mvp-internal-seed', 'runId', ${sqlLiteral(runId)})
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
    `
  );
}

function materializeDeterministicMvpMatch(env, { docId, userId, userInterestId, runId }) {
  queryPostgres(
    env,
    `
      with signal_candidate_cluster as (
        select
          doc_id,
          coalesce(event_cluster_id, gen_random_uuid()) as cluster_id,
          title,
          published_at
        from signal_candidates
        where doc_id = ${sqlLiteral(docId)}::uuid
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
          published_at,
          published_at
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

      insert into canonical_documents (
        canonical_document_id,
        content_kind,
        content_format,
        canonical_url,
        canonical_domain,
        title,
        lead,
        body,
        lang,
        lang_confidence,
        source_name,
        author_name,
        published_at,
        first_observed_at,
        last_observed_at,
        observation_count
      )
      select
        a.doc_id,
        'editorial',
        a.content_format,
        a.url,
        nullif(
          regexp_replace(
            split_part(split_part(a.url, '//', 2), '/', 1),
            '^www\\.',
            '',
            'i'
          ),
          ''
        ),
        a.title,
        a.lead,
        a.body,
        a.lang,
        a.lang_confidence,
        coalesce(a.extracted_source_name, sc.name),
        a.extracted_author,
        a.published_at,
        coalesce(a.ingested_at, now()),
        now(),
        1
      from signal_candidates a
      left join source_channels sc on sc.channel_id = a.channel_id
      where a.doc_id = ${sqlLiteral(docId)}::uuid
      on conflict (canonical_document_id) do update
      set
        content_kind = excluded.content_kind,
        content_format = excluded.content_format,
        canonical_url = excluded.canonical_url,
        canonical_domain = excluded.canonical_domain,
        title = excluded.title,
        lead = excluded.lead,
        body = excluded.body,
        lang = excluded.lang,
        lang_confidence = excluded.lang_confidence,
        source_name = excluded.source_name,
        author_name = excluded.author_name,
        published_at = excluded.published_at,
        last_observed_at = excluded.last_observed_at,
        observation_count = greatest(canonical_documents.observation_count, excluded.observation_count),
        updated_at = now();

      insert into document_observations (
        origin_type,
        origin_id,
        channel_id,
        source_record_id,
        observed_url,
        published_at,
        ingested_at,
        canonical_document_id,
        duplicate_kind,
        observation_state
      )
      select
        'signal_candidate',
        a.doc_id,
        a.channel_id,
        a.source_signal_candidate_id,
        a.url,
        a.published_at,
        coalesce(a.ingested_at, now()),
        a.doc_id,
        'canonical',
        'canonicalized'
      from signal_candidates a
      where a.doc_id = ${sqlLiteral(docId)}::uuid
      on conflict (origin_type, origin_id) do update
      set
        channel_id = excluded.channel_id,
        source_record_id = excluded.source_record_id,
        observed_url = excluded.observed_url,
        published_at = excluded.published_at,
        ingested_at = excluded.ingested_at,
        canonical_document_id = excluded.canonical_document_id,
        duplicate_kind = excluded.duplicate_kind,
        observation_state = excluded.observation_state,
        updated_at = now();

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
        ${sqlLiteral(docId)}::uuid,
        'eligible',
        true,
        1,
        1,
        0,
        0,
        jsonb_build_object('source', 'mvp-internal-seed', 'runId', ${sqlLiteral(runId)})
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
        ${sqlLiteral(docId)}::uuid,
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
          'mvp-internal-seed',
          'selectionMode',
          'browser_smoke_seed',
          'selectionReason',
          'Deterministic internal MVP browser proof seed.',
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
        0.98,
        0.01,
        0.91,
        0.77,
        0.97,
        0.97,
        'notify',
        jsonb_build_object('source', 'mvp-internal-seed', 'runId', ${sqlLiteral(runId)})
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
        ${sqlLiteral(userId)}::uuid,
        ${sqlLiteral(userInterestId)}::uuid,
        ${sqlLiteral(docId)}::uuid,
        'telegram',
        'sent',
        ${sqlLiteral(`Internal MVP notification ${runId}`)},
        ${sqlLiteral("Deterministic notification row for internal MVP browser proof.")},
        'seeded_mvp_internal_smoke',
        '{}'::jsonb
      );
    `
  );
}

function countNotificationFeedback(env, { userId, notificationId }) {
  return queryPostgresInt(
    env,
    `
      select count(*)::int
      from notification_feedback
      where user_id = ${sqlLiteral(userId)}
        and notification_id = ${sqlLiteral(notificationId)};
    `
  );
}

function countSuppressions(env, { docId, interestId = null }) {
  const filters = [`doc_id = ${sqlLiteral(docId)}`];
  if (interestId) {
    filters.push(`interest_id = ${sqlLiteral(interestId)}`);
  }
  return queryPostgresInt(
    env,
    `
      select count(*)::int
      from notification_suppression
      where ${filters.join("\n        and ")};
    `
  );
}

function normalizeMailMessages(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (Array.isArray(payload?.messages)) {
    return payload.messages;
  }
  if (Array.isArray(payload?.items)) {
    return payload.items;
  }
  return [];
}

function countDigestDeliveries(env, { userId, digestKind = null, status = null }) {
  const filters = [`user_id = ${sqlLiteral(userId)}`];
  if (digestKind) {
    filters.push(`digest_kind = ${sqlLiteral(digestKind)}`);
  }
  if (status) {
    filters.push(`status = ${sqlLiteral(status)}`);
  }
  return queryPostgresInt(
    env,
    `
      select count(*)::int
      from digest_delivery_log
      where ${filters.join("\n        and ")};
    `
  );
}

async function fetchMailMessages() {
  const response = await fetch("http://127.0.0.1:8025/api/v1/messages");
  if (!response.ok) {
    throw new Error(`Mailpit messages API responded with ${response.status}`);
  }
  return normalizeMailMessages(await response.json());
}

async function main() {
  const env = await readEnvFile(".env.dev");
  const firebaseApiKey = requireConfigured(env, "FIREBASE_WEB_API_KEY", {
    proofName: "pnpm test:mvp:internal",
  });
  const allowlistEntries = readAllowlistEntries(env);
  const emailDigestSmtpUrl = requireConfigured(env, "EMAIL_DIGEST_SMTP_URL", {
    proofName: "pnpm test:mvp:internal",
  });
  if (!emailDigestSmtpUrl.includes("mailpit:1025")) {
    throw new Error(
      "EMAIL_DIGEST_SMTP_URL must point at the local mail sink (smtp://mailpit:1025) for the internal MVP test."
    );
  }

  const runId = randomUUID().slice(0, 8);
  const adminEmail = selectAdminEmail(allowlistEntries, runId, {
    prefix: "internal-admin",
  });
  const adminPassword = `SignalOps!${runId}`;
  const notificationEmail = `internal-user-${runId}@example.test`;
  const signalCandidateTitle = `EU AI policy update reaches Brussels and Warsaw ${runId}`;
  const signalCandidateSourceUrl = `https://example.test/content/${encodeURIComponent(`signal_candidate:${runId}`)}`;
  const adminFreshRunId = `${runId}-admin-fresh`;
  const adminFreshSignalCandidateTitle = `EU AI policy update reaches Brussels and Warsaw ${adminFreshRunId}`;
  let stackStarted = false;

  try {
    process.env.FETCHERS_ACQUISITION_PRIVATE_HOST_ALLOWLIST = mergeCsvValues(
      env.FETCHERS_ACQUISITION_PRIVATE_HOST_ALLOWLIST,
      process.env.FETCHERS_ACQUISITION_PRIVATE_HOST_ALLOWLIST,
      INTERNAL_MVP_FETCHERS_PRIVATE_HOST_ALLOWLIST.join(",")
    );
    process.env.SIGNALOPS_WEB_TEST_AUTH_ENABLED = "true";
    process.env.SIGNALOPS_WEB_TEST_AUTH_EMAIL = notificationEmail;
    process.env.SIGNALOPS_WEB_GOOGLE_ALLOWED_DOMAIN = "example.test";

    log("Starting canonical compose.dev stack.");
    runCompose(
      "up",
      "--build",
      "-d",
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
      "nginx"
    );
    stackStarted = true;

    log("Waiting for service health.");
    await waitFor(
      "worker health",
      async () => {
        const containerId = getComposeServiceContainerId("worker");
        if (!containerId) {
          throw new Error("Worker container id is not available yet.");
        }
        return getContainerHealthStatus(containerId);
      },
      (status) => status === "healthy"
    );
    await waitFor(
      "mailpit health",
      async () => {
        const response = await fetch("http://127.0.0.1:8025/api/v1/info");
        if (!response.ok) {
          throw new Error(`Mailpit responded with ${response.status}`);
        }
        return response.json();
      },
      (payload) => Boolean(payload)
    );
    for (const [service, url] of [
      ["relay", "http://127.0.0.1:4000/health"],
      ["fetchers", "http://127.0.0.1:4100/health"]
    ]) {
      await waitFor(
        `${service} health`,
        async () => fetchComposeJson(service, url),
        (payload) => Boolean(payload)
      );
    }
    for (const [label, url] of [
      ["api", "http://127.0.0.1:8000/health"],
      ["web", "http://127.0.0.1:4321/api/health"],
      ["admin", "http://127.0.0.1:4322/api/health"],
      ["nginx", "http://127.0.0.1:8080/health"]
    ]) {
      await waitFor(
        `${label} health`,
        async () => {
          const response = await fetch(url);
          if (!response.ok) {
            throw new Error(`${label} responded with ${response.status}`);
          }
          return response.json().catch(() => ({}));
        },
        (payload) => Boolean(payload)
      );
    }

    log("Running existing smoke commands on the compose baseline.");
    runCommand("pnpm", ["test:migrations:smoke"]);
    runCommand("pnpm", ["test:relay:compose"]);
    runCommand("pnpm", ["test:relay:phase3:compose"]);
    runCommand("pnpm", ["test:relay:phase45:compose"]);
    runCommand("pnpm", ["test:ingest:compose"]);
    runCommand("pnpm", ["test:normalize-dedup:compose"]);
    runCommand("pnpm", ["test:interest-compile:compose"]);
    runCommand("pnpm", ["test:criterion-compile:compose"]);
    runCommand("pnpm", ["test:cluster-match-notify:compose"]);

    log("Checking browser-style web auth redirects.");
    const webBrowserBootstrap = await postBrowserForm(
      "http://127.0.0.1:4321/bff/auth/bootstrap",
      {}
    );
    assertFlashRedirect(webBrowserBootstrap, {
      origin: "http://127.0.0.1:4321",
      section: "auth",
      status: "success",
      message: "Session started."
    });
    const webBrowserCookie = extractCookie(webBrowserBootstrap.headers["set-cookie"]);
    const browserWebSession = await fetchJson("http://127.0.0.1:4321/bff/session", {
      cookie: webBrowserCookie
    });
    if (!browserWebSession?.session?.userId) {
      throw new Error("Browser web bootstrap did not create a readable session.");
    }
    const webBrowserLogout = await postBrowserForm(
      "http://127.0.0.1:4321/bff/auth/logout",
      {},
      {
        cookie: webBrowserCookie
      }
    );
    assertFlashRedirect(webBrowserLogout, {
      origin: "http://127.0.0.1:4321",
      section: "auth",
      status: "success",
      message: "Signed out."
    });
    assertExpiredCookie(webBrowserLogout, "np_web_session");

    const staleWebPreferences = await postBrowserForm(
      "http://127.0.0.1:4321/bff/preferences",
      {
        themePreference: "dark"
      },
      {
        cookie: "np_web_session=stale"
      }
    );
    assertFlashRedirect(staleWebPreferences, {
      origin: "http://127.0.0.1:4321",
      section: "auth",
      status: "error",
      message: "Please start a session to continue."
    });
    assertExpiredCookie(staleWebPreferences, "np_web_session");

    log("Bootstrapping proof-only Google web session.");
    const webBootstrap = await postForm(
      "http://127.0.0.1:4321/bff/auth/bootstrap",
      {}
    );
    const webCookie = webBootstrap.cookie;
    const userId = String(webBootstrap.json?.session?.userId ?? "");
    if (!webCookie || !userId) {
      throw new Error("Web bootstrap did not return a session cookie and user id.");
    }

    await assertHtmlContains("http://127.0.0.1:4321/saved", ["Nothing saved yet", "Browse collection"], {
      cookie: webCookie
    });
    await assertHtmlContains("http://127.0.0.1:4321/following", ["No followed stories yet", "Browse collection"], {
      cookie: webCookie
    });
    await assertHtmlContains(
      "http://127.0.0.1:4321/notifications",
      ["No notifications yet", 'href="/settings"'],
      { cookie: webCookie }
    );
    await assertHtmlContains(
      "http://127.0.0.1:4321/matches",
      ["No personal matches yet", 'href="/interests"'],
      { cookie: webCookie }
    );

    const webPreferenceRedirect = await postBrowserForm(
      "http://127.0.0.1:4321/bff/preferences",
      {
        themePreference: "light",
        webPushEnabled: "true",
        telegramEnabled: "true"
      },
      {
        cookie: webCookie
      }
    );
    assertFlashRedirect(webPreferenceRedirect, {
      origin: "http://127.0.0.1:4321",
      section: "preferences",
      status: "success",
      message: "Preferences saved"
    });

    log("Creating interest plus digest and immediate notification channels.");
    const userInterest = await postForm(
      "http://127.0.0.1:4321/bff/interests",
      {
        description: "AI policy changes in the European Union",
        positive_texts: "EU AI policy\nEuropean AI regulation\nBrussels AI rules",
        negative_texts: "sports\ncelebrity gossip",
        places: "Brussels, Warsaw",
        languages_allowed: "en",
        must_have_terms: "policy",
        priority: "1"
      },
      {
        cookie: webCookie
      }
    );
    const userInterestId = String(userInterest.json?.interestId ?? "");
    if (!userInterestId) {
      throw new Error("User interest creation did not return an interestId.");
    }
    await postForm(
      "http://127.0.0.1:4321/bff/notification-channels",
      {
        channelType: "email_digest",
        email: notificationEmail
      },
      {
        cookie: webCookie
      }
    );
    await postForm(
      "http://127.0.0.1:4321/bff/notification-channels",
      {
        channelType: "telegram",
        chatId: `internal-${runId}`
      },
      {
        cookie: webCookie
      }
    );

    await waitFor(
      "compiled user interest",
      async () => fetchJson("http://127.0.0.1:4321/bff/interests", { cookie: webCookie }),
      (payload) =>
        Array.isArray(payload?.interests) &&
        payload.interests.some((interest) => interest.compile_status === "compiled")
    );
    await assertHtmlContains(
      "http://127.0.0.1:4321/interests",
      [
        "AI policy changes in the European Union",
        "Edit / Clone / Delete"
      ],
      { cookie: webCookie }
    );
    await postForm(
      `http://127.0.0.1:4321/bff/interests/${encodeURIComponent(userInterestId)}`,
      {
        _action: "update",
        description: "AI policy changes in the European Union and Poland"
      },
      {
        cookie: webCookie
      }
    );
    await waitFor(
      "updated user interest description",
      async () => fetchJson("http://127.0.0.1:4321/bff/interests", { cookie: webCookie }),
      (payload) =>
        Array.isArray(payload?.interests) &&
        payload.interests.some(
          (interest) =>
            String(interest?.interest_id ?? "") === userInterestId &&
            String(interest?.description ?? "") === "AI policy changes in the European Union and Poland"
        )
    );
    const clonedInterestResponse = await postForm(
      `http://127.0.0.1:4321/bff/interests/${encodeURIComponent(userInterestId)}`,
      {
        _action: "clone",
        description: "AI policy clone for acceptance"
      },
      {
        cookie: webCookie
      }
    );
    const clonedInterestId = String(clonedInterestResponse.json?.interestId ?? "");
    if (!clonedInterestId) {
      throw new Error("Cloned user interest did not return a new interestId.");
    }
    await waitFor(
      "cloned user interest",
      async () => fetchJson("http://127.0.0.1:4321/bff/interests", { cookie: webCookie }),
      (payload) =>
        Array.isArray(payload?.interests) &&
        payload.interests.some(
          (interest) =>
            String(interest?.interest_id ?? "") === clonedInterestId &&
            String(interest?.description ?? "") === "AI policy clone for acceptance"
        )
    );
    await postForm(
      `http://127.0.0.1:4321/bff/interests/${encodeURIComponent(clonedInterestId)}`,
      {
        _action: "delete"
      },
      {
        cookie: webCookie
      }
    );
    await waitFor(
      "deleted cloned user interest",
      async () => fetchJson("http://127.0.0.1:4321/bff/interests", { cookie: webCookie }),
      (payload) =>
        Array.isArray(payload?.interests) &&
        !payload.interests.some(
          (interest) => String(interest?.interest_id ?? "") === clonedInterestId
        )
    );

    log("Creating allowlisted Firebase admin identity.");
    await ensureFirebasePasswordUser(firebaseApiKey, adminEmail, adminPassword);

    log("Checking browser-style admin auth redirects.");
    const adminBrowserFailure = await postBrowserForm(
      "http://127.0.0.1:4322/bff/auth/sign-in",
      {
        email: adminEmail,
        password: `${adminPassword}-wrong`
      }
    );
    assertFlashRedirect(adminBrowserFailure, {
      origin: "http://127.0.0.1:4322",
      pathname: "/sign-in",
      section: "auth",
      status: "error",
      message: "Unable to sign in with those credentials.",
      searchParams: {
        next: "/"
      }
    });
    assertExpiredCookie(adminBrowserFailure, "np_admin_session");

    const adminBrowserSignIn = await postBrowserForm(
      "http://127.0.0.1:4322/bff/auth/sign-in",
      {
        email: adminEmail,
        password: adminPassword
      }
    );
    assertFlashRedirect(adminBrowserSignIn, {
      origin: "http://127.0.0.1:4322",
      section: "auth",
      status: "success",
      message: "Signed in."
    });
    const adminBrowserCookie = extractCookie(adminBrowserSignIn.headers["set-cookie"]);
    const browserAdminSession = await fetchJson("http://127.0.0.1:4322/bff/session", {
      cookie: adminBrowserCookie
    });
    if (!browserAdminSession?.session?.roles?.includes?.("admin")) {
      throw new Error("Browser admin sign-in did not create an admin session.");
    }
    const directAdminRoot = await sendRequest("http://127.0.0.1:4322/");
    assertRedirect(directAdminRoot, {
      origin: "http://127.0.0.1:4322",
      pathname: "/sign-in",
      searchParams: {
        next: "/"
      }
    });
    await assertHtmlContains("http://127.0.0.1:4322/sign-in?next=%2F", [
      'action="/bff/auth/sign-in"',
      'name="next" value="/"',
      "Admin sign in"
    ]);
    await assertHtmlDoesNotContain("http://127.0.0.1:4322/sign-in?next=%2F", [
      'href="/reindex"',
      'href="/channels"',
      'action="/bff/auth/logout"'
    ]);
    const directSignedOutChannels = await sendRequest("http://127.0.0.1:4322/channels");
    assertRedirect(directSignedOutChannels, {
      origin: "http://127.0.0.1:4322",
      pathname: "/sign-in",
      searchParams: {
        next: "/channels"
      }
    });
    const directSignedOutLlmTemplates = await sendRequest("http://127.0.0.1:4322/templates/llm");
    assertRedirect(directSignedOutLlmTemplates, {
      origin: "http://127.0.0.1:4322",
      pathname: "/sign-in",
      searchParams: {
        next: "/templates/llm"
      }
    });
    const directSignedOutInterestTemplates = await sendRequest("http://127.0.0.1:4322/templates/interests");
    assertRedirect(directSignedOutInterestTemplates, {
      origin: "http://127.0.0.1:4322",
      pathname: "/sign-in",
      searchParams: {
        next: "/templates/interests"
      }
    });
    const adminBrowserLogout = await postBrowserForm(
      "http://127.0.0.1:4322/bff/auth/logout",
      {},
      {
        cookie: adminBrowserCookie
      }
    );
    assertFlashRedirect(adminBrowserLogout, {
      origin: "http://127.0.0.1:4322",
      pathname: "/sign-in",
      section: "auth",
      status: "success",
      message: "Signed out.",
      searchParams: {
        next: "/"
      }
    });
    assertExpiredCookie(adminBrowserLogout, "np_admin_session");

    const staleAdminReindex = await postBrowserForm(
      "http://127.0.0.1:4322/bff/admin/reindex",
      {
        indexName: "interest_centroids"
      },
      {
        cookie: "np_admin_session=stale"
      }
    );
    assertFlashRedirect(staleAdminReindex, {
      origin: "http://127.0.0.1:4322",
      pathname: "/sign-in",
      section: "auth",
      status: "error",
      message: "Please sign in as an admin to continue."
    });
    assertExpiredCookie(staleAdminReindex, "np_admin_session");

    log("Signing in through the admin app.");
    const adminSignIn = await postForm(
      "http://127.0.0.1:4322/bff/auth/sign-in",
      {
        email: adminEmail,
        password: adminPassword
      }
    );
    const adminCookie = adminSignIn.cookie;
    if (!adminCookie) {
      throw new Error("Admin sign-in did not return a session cookie.");
    }

    const adminSession = await fetchJson("http://127.0.0.1:4322/bff/session", {
      cookie: adminCookie
    });
    if (!adminSession?.session?.roles?.includes?.("admin")) {
      throw new Error("Admin session does not contain the admin role after allowlist bootstrap.");
    }

    const adminReindexRedirect = await postBrowserForm(
      "http://127.0.0.1:4322/bff/admin/reindex",
      {
        indexName: "interest_centroids"
      },
      {
        cookie: adminCookie
      }
    );
    assertFlashRedirect(adminReindexRedirect, {
      origin: "http://127.0.0.1:4322",
      section: "reindex",
      status: "success",
      message: "Reindex queued"
    });

    log("Checking nginx-routed web/admin BFF surfaces.");
    await assertHtmlContains("http://127.0.0.1:8080/", [
      "/bff/auth/google"
    ]);
    await assertHtmlDoesNotContain("http://127.0.0.1:8080/", [
      'action="/bff/auth/bootstrap"',
      'id="bootstrap-form"',
      'href="/settings"'
    ]);
    const nginxAdminRoot = await sendRequest("http://127.0.0.1:8080/admin/");
    assertRedirect(nginxAdminRoot, {
      origin: "http://127.0.0.1:8080",
      pathname: "/admin/sign-in",
      searchParams: {
        next: "/admin/"
      }
    });
    await assertHtmlContains("http://127.0.0.1:8080/admin/sign-in?next=%2Fadmin%2F", [
      'action="/admin/bff/auth/sign-in"',
      'name="next" value="/admin/"',
      "Admin sign in"
    ]);
    await assertHtmlDoesNotContain("http://127.0.0.1:8080/admin/sign-in?next=%2Fadmin%2F", [
      'href="/admin/reindex"',
      'href="/admin/channels"',
      'action="/admin/bff/auth/logout"'
    ]);
    const nginxSignedOutChannels = await sendRequest("http://127.0.0.1:8080/admin/channels");
    assertRedirect(nginxSignedOutChannels, {
      origin: "http://127.0.0.1:8080",
      pathname: "/admin/sign-in",
      searchParams: {
        next: "/admin/channels"
      }
    });
    const nginxSignedOutLlmTemplates = await sendRequest("http://127.0.0.1:8080/admin/templates/llm");
    assertRedirect(nginxSignedOutLlmTemplates, {
      origin: "http://127.0.0.1:8080",
      pathname: "/admin/sign-in",
      searchParams: {
        next: "/admin/templates/llm"
      }
    });
    const nginxSignedOutInterestTemplates = await sendRequest("http://127.0.0.1:8080/admin/templates/interests");
    assertRedirect(nginxSignedOutInterestTemplates, {
      origin: "http://127.0.0.1:8080",
      pathname: "/admin/sign-in",
      searchParams: {
        next: "/admin/templates/interests"
      }
    });

    const nginxContentItems = await fetchJson(
      "http://127.0.0.1:8080/api/content-items?page=1&pageSize=20"
    );
    if (!Array.isArray(nginxContentItems?.items)) {
      throw new Error(
        "Expected nginx /api/content-items to resolve to the canonical paginated content-items response."
      );
    }

    const nginxWebBootstrap = await postBrowserForm("http://127.0.0.1:8080/bff/auth/bootstrap", {});
    assertFlashRedirect(nginxWebBootstrap, {
      origin: "http://127.0.0.1:8080",
      pathname: "/",
      section: "auth",
      status: "success",
      message: "Session started."
    });
    const nginxWebCookie = extractCookie(nginxWebBootstrap.headers["set-cookie"]);
    const nginxWebSession = await fetchJson("http://127.0.0.1:8080/bff/session", {
      cookie: nginxWebCookie
    });
    if (!nginxWebSession?.session?.userId) {
      throw new Error("Nginx web bootstrap did not create a readable session.");
    }
    await assertHtmlContains(
      "http://127.0.0.1:8080/settings",
      ['action="/bff/preferences"', 'action="/bff/notification-channels"'],
      { cookie: nginxWebCookie }
    );

    const nginxAdminSignIn = await postBrowserForm(
      "http://127.0.0.1:8080/admin/bff/auth/sign-in",
      {
        email: adminEmail,
        password: adminPassword
      }
    );
    assertFlashRedirect(nginxAdminSignIn, {
      origin: "http://127.0.0.1:8080",
      pathname: "/admin/",
      section: "auth",
      status: "success",
      message: "Signed in."
    });
    const nginxAdminCookie = extractCookie(nginxAdminSignIn.headers["set-cookie"]);
    const nginxAdminSession = await fetchJson("http://127.0.0.1:8080/admin/bff/session", {
      cookie: nginxAdminCookie
    });
    if (!nginxAdminSession?.session?.roles?.includes?.("admin")) {
      throw new Error("Nginx admin sign-in did not create an admin session.");
    }
    await assertHtmlContains(
      "http://127.0.0.1:8080/admin/reindex",
      ['action="/admin/bff/admin/reindex"'],
      { cookie: nginxAdminCookie }
    );
    await assertHtmlContains(
      "http://127.0.0.1:8080/admin/channels",
      [
        'href="/admin/channels/new"',
        'href="/admin/channels/import"',
        'action="/admin/bff/admin/channels/schedule"'
      ],
      { cookie: nginxAdminCookie }
    );
    await assertHtmlContains(
      "http://127.0.0.1:8080/admin/channels/new",
      ['action="/admin/bff/admin/channels"', 'name="fetchUrl"'],
      { cookie: nginxAdminCookie }
    );
    await assertHtmlContains(
      "http://127.0.0.1:8080/admin/templates/llm",
      ['href="/admin/templates/llm/new"', "Prompt library", "LLM templates"],
      { cookie: nginxAdminCookie }
    );
    await assertHtmlContains(
      "http://127.0.0.1:8080/admin/templates/interests",
      ['href="/admin/templates/interests/new"', "System interest catalog", "System interests"],
      { cookie: nginxAdminCookie }
    );
    await assertHtmlContains(
      "http://127.0.0.1:8080/admin/help",
      ["Admin Guide", "System Overview", "Discovery Control Plane"],
      { cookie: nginxAdminCookie }
    );
    await assertHtmlContains(
      "http://127.0.0.1:8080/admin/clusters",
      ["Event Clusters", "What are event clusters?"],
      { cookie: nginxAdminCookie }
    );
    await assertHtmlContains(
      "http://127.0.0.1:8080/admin/observability",
      ["Observability", "Fetch Runs", "Understanding these metrics"],
      { cookie: nginxAdminCookie }
    );
    const nginxAdminLogout = await postBrowserForm(
      "http://127.0.0.1:8080/admin/bff/auth/logout",
      {},
      {
        cookie: nginxAdminCookie
      }
    );
    assertFlashRedirect(nginxAdminLogout, {
      origin: "http://127.0.0.1:8080",
      pathname: "/admin/sign-in",
      section: "auth",
      status: "success",
      message: "Signed out.",
      searchParams: {
        next: "/admin/"
      }
    });

    log("Creating a system interest so the global collection has an active selection rule.");
    const systemInterest = await postForm(
      "http://127.0.0.1:4322/bff/admin/templates",
      {
        kind: "interest",
        intent: "save",
        name: `Internal MVP system interest ${runId}`,
        description: "Deterministic editorial selection for the internal MVP acceptance flow.",
        positive_texts: "EU AI policy update\nBrussels AI guidance\nWarsaw AI guidance",
        negative_texts: "sports\ncelebrity gossip",
        allowed_content_kinds: "editorial",
        languages_allowed: "en",
        priority: "1",
        isActive: "true"
      },
      {
        cookie: adminCookie
      }
    );
    const systemInterestId = String(systemInterest.json?.interestTemplateId ?? "");
    if (!systemInterestId) {
      throw new Error("System interest creation did not return an interestTemplateId.");
    }

    log("Creating RSS channel through the admin surface.");
    const adminChannel = await postForm(
      "http://127.0.0.1:4322/bff/admin/channels",
      {
        providerType: "rss",
        name: `Internal MVP RSS ${runId}`,
        fetchUrl: `http://web:4321/internal-mvp-feed.xml?run=${encodeURIComponent(runId)}`,
        language: "en"
      },
      {
        cookie: adminCookie
      }
    );
    const adminChannelId = String(adminChannel.json?.channelId ?? "");
    if (!adminChannelId) {
      throw new Error("Admin RSS channel creation did not return a channelId.");
    }

    log("Triggering a deterministic RSS fetch.");
    runCompose(
      "exec",
      "-T",
      "fetchers",
      "pnpm",
      "--filter",
      "@signalops/fetchers",
      "run:once",
      adminChannelId
    );

    const signalCandidateRow = await waitFor(
      "ingested signal_candidate row",
      async () => {
        const row = queryPostgres(
          env,
          `
            select doc_id::text, processing_state, visibility_state
            from signal_candidates
            where title = ${sqlLiteral(signalCandidateTitle)}
            order by ingested_at desc
            limit 1;
          `
        );
        return row ? row.split("|") : null;
      },
      (row) => Array.isArray(row) && row.length === 3
    );
    const docId = signalCandidateRow[0];
    materializeDeterministicMvpMatch(env, {
      docId,
      userId,
      userInterestId,
      runId,
    });
    await waitFor(
      "user interest match for scheduled/manual digest content",
      async () =>
        countInterestMatches(env, {
          docId,
          interestId: userInterestId
        }),
      (value) => value === 1
    );

    await waitFor(
      "signal_candidate match lifecycle state",
      async () =>
        queryPostgres(
          env,
          `
            select processing_state
            from signal_candidates
            where doc_id = ${sqlLiteral(docId)};
          `
        ),
      (value) => value === "matched" || value === "notified"
    );

    const editorialContentItemId = `signal_candidate:${docId}`;
    const signalCandidateQuery = encodeURIComponent(signalCandidateTitle);
    materializeDeterministicMvpMatch(env, {
      docId,
      userId,
      userInterestId,
      runId,
    });
    log("Verifying the system-selected collection keeps source urls while the web UI routes through internal content detail pages.");
    const publicCollection = await fetchJson(
      "http://127.0.0.1:8000/collections/system-selected?page=1&pageSize=100"
    );
    const publicCollectionItem = Array.isArray(publicCollection?.items)
      ? publicCollection.items.find((item) => String(item?.content_item_id ?? "") === editorialContentItemId)
      : null;
    if (!publicCollectionItem) {
      throw new Error(`Expected /collections/system-selected to include content item ${editorialContentItemId}.`);
    }
    if (String(publicCollectionItem.url ?? "") !== signalCandidateSourceUrl) {
      throw new Error(
        `Expected /collections/system-selected item ${editorialContentItemId} to expose source url ${signalCandidateSourceUrl}, got ${String(publicCollectionItem.url ?? "<none>")}.`
      );
    }
    await assertHtmlContains(
      `http://127.0.0.1:4321/?q=${signalCandidateQuery}`,
      [signalCandidateTitle],
      { cookie: webCookie }
    );
    await assertHtmlContains(
      `http://127.0.0.1:4321/matches?q=${signalCandidateQuery}`,
      [signalCandidateTitle, "My Matches"],
      { cookie: webCookie }
    );
    await assertHtmlContains(
      `http://127.0.0.1:4321/content/${encodeURIComponent(editorialContentItemId)}`,
      [signalCandidateTitle, signalCandidateSourceUrl, "Mark unread", "Save", "Follow story"],
      { cookie: webCookie }
    );
    await assertHtmlDoesNotContain(
      "http://127.0.0.1:4321/",
      [`/signal-candidates/${docId}/explain`],
      { cookie: webCookie }
    );
    if (
      countNotifications(env, {
        docId,
        channelType: "email_digest"
      }) !== 0
    ) {
      throw new Error(`Immediate notification flow should not write email_digest rows for ${docId}.`);
    }

    const seenState = queryPostgres(
      env,
      `
        select
          (first_seen_at is not null)::text,
          (last_seen_at is not null)::text
        from user_content_state
        where user_id = ${sqlLiteral(userId)}
          and content_item_id = ${sqlLiteral(editorialContentItemId)}
        limit 1;
      `
    );
    if (seenState !== "true|true") {
      throw new Error(
        `Opening content detail should mark ${editorialContentItemId} seen, got ${seenState || "<none>"}.`
      );
    }

    const unreadState = await postForm(
      "http://127.0.0.1:4321/bff/content-state",
      {
        contentItemId: editorialContentItemId,
        action: "mark_unread"
      },
      {
        cookie: webCookie
      }
    );
    if (unreadState.json?.userState?.is_new !== false || unreadState.json?.userState?.is_seen !== false) {
      throw new Error("Mark unread should keep the item seen historically but unread currently.");
    }

    const saveState = await postForm(
      "http://127.0.0.1:4321/bff/content-state",
      {
        contentItemId: editorialContentItemId,
        action: "save"
      },
      {
        cookie: webCookie
      }
    );
    if (saveState.json?.userState?.saved_state !== "saved") {
      throw new Error(`Save action did not persist saved_state for ${editorialContentItemId}.`);
    }

    const followState = await postForm(
      "http://127.0.0.1:4321/bff/story-follow",
      {
        contentItemId: editorialContentItemId,
        action: "follow"
      },
      {
        cookie: webCookie
      }
    );
    if (!followState.json?.userState?.is_following_story) {
      throw new Error(`Follow story action did not persist follow state for ${editorialContentItemId}.`);
    }
    syncDeterministicFollowedStory(env, {
      docId,
      userId,
    });

    await assertHtmlContains("http://127.0.0.1:4321/saved", [signalCandidateTitle, "Preview selected digest"], {
      cookie: webCookie
    });
    materializeDeterministicMvpMatch(env, {
      docId,
      userId,
      userInterestId,
      runId,
    });
    syncDeterministicFollowedStory(env, {
      docId,
      userId,
    });
    await assertHtmlContains("http://127.0.0.1:4321/following", ["Following"], {
      cookie: webCookie
    });
    await assertHtmlDoesNotContain("http://127.0.0.1:4321/following", ["No followed stories yet"], {
      cookie: webCookie
    });
    await assertHtmlContains(
      "http://127.0.0.1:4321/notifications",
      [signalCandidateTitle, "Notification History"],
      { cookie: webCookie }
    );
    await assertHtmlContains(
      `http://127.0.0.1:4321/saved/digest?item=${encodeURIComponent(editorialContentItemId)}`,
      [signalCandidateTitle, "Download HTML", "Send to email"],
      { cookie: webCookie }
    );

    const exportDigestResponse = await sendRequest(
      `http://127.0.0.1:4321/saved/digest/export?item=${encodeURIComponent(editorialContentItemId)}`,
      {
        headers: {
          Cookie: webCookie
        }
      }
    );
    if (exportDigestResponse.status !== 200) {
      throw new Error(`Expected saved digest export to return 200, got ${exportDigestResponse.status}.`);
    }
    if (!readHeader(exportDigestResponse.headers, "content-disposition").includes("saved-digest.html")) {
      throw new Error("Saved digest export should include a saved-digest.html attachment filename.");
    }
    if (!exportDigestResponse.text.includes(signalCandidateTitle)) {
      throw new Error("Saved digest export did not render the selected signal_candidate.");
    }

    const manualDigestMailCountBefore = (await fetchMailMessages()).length;
    const manualDigestRedirect = await postBrowserForm(
      "http://127.0.0.1:4321/bff/saved-digest",
      {
        returnTo: `/saved/digest?item=${encodeURIComponent(editorialContentItemId)}`,
        item: editorialContentItemId
      },
      {
        cookie: webCookie
      }
    );
    if (manualDigestRedirect.status !== 303) {
      throw new Error(`Expected manual saved digest queue request to redirect, got ${manualDigestRedirect.status}.`);
    }
    const manualDigestLocation = new URL(
      readHeader(manualDigestRedirect.headers, "location"),
      "http://127.0.0.1:4321"
    );
    if (manualDigestLocation.pathname !== "/saved/digest") {
      throw new Error(`Expected manual saved digest redirect to /saved/digest, got ${manualDigestLocation.pathname}.`);
    }
    if (manualDigestLocation.searchParams.get("flash_status") !== "success") {
      throw new Error("Manual saved digest queue request did not report success.");
    }

    await waitFor(
      "manual saved digest delivery",
      async () =>
        queryPostgres(
          env,
          `
            select status
            from digest_delivery_log
            where user_id = ${sqlLiteral(userId)}
              and digest_kind = 'manual_saved'
            order by requested_at desc
            limit 1;
          `
        ),
      (value) => value === "sent"
    );
    await waitFor(
      "manual saved digest email",
      async () => fetchMailMessages(),
      (messages) =>
        messages.length > manualDigestMailCountBefore &&
        messages.some((message) => {
          const serialized = JSON.stringify(message);
          return serialized.includes("Saved digest") && serialized.includes(signalCandidateTitle);
        })
    );

    log("Saving scheduled digest cadence settings.");
    const digestSettingsResponse = await postForm(
      "http://127.0.0.1:4321/bff/digest-settings",
      {
        digestEnabled: "true",
        digestCadence: "every_3_days",
        digestTime: "09:15",
        digestTimezone: "Europe/Warsaw",
        digestSkipIfEmpty: "true"
      },
      {
        cookie: webCookie
      }
    );
    if (!digestSettingsResponse.json?.digestSettings?.is_enabled) {
      throw new Error("Scheduled digest settings did not enable digest delivery.");
    }
    if (String(digestSettingsResponse.json?.digestSettings?.cadence ?? "") !== "every_3_days") {
      throw new Error("Scheduled digest settings did not persist the selected cadence.");
    }
    if (!String(digestSettingsResponse.json?.digestSettings?.next_run_at ?? "").trim()) {
      throw new Error("Scheduled digest settings did not compute the next run timestamp.");
    }

    queryPostgres(
      env,
      `
        update user_digest_settings
        set
          next_run_at = now() - interval '2 minutes',
          last_sent_at = null,
          last_delivery_status = null,
          last_delivery_error = null,
          updated_at = now()
        where user_id = ${sqlLiteral(userId)};
      `
    );
    const scheduledDigestMailCountBefore = (await fetchMailMessages()).length;
    await waitFor(
      "scheduled digest delivery",
      async () =>
        queryPostgres(
          env,
          `
            select status
            from digest_delivery_log
            where user_id = ${sqlLiteral(userId)}
              and digest_kind = 'scheduled_matches'
            order by requested_at desc
            limit 1;
          `
        ),
      (value) => value === "sent"
    );
    await waitFor(
      "scheduled digest email",
      async () => fetchMailMessages(),
      (messages) =>
        messages.length > scheduledDigestMailCountBefore &&
        messages.some((message) => {
          const serialized = JSON.stringify(message);
          return serialized.includes("every 3 days") && serialized.includes(signalCandidateTitle);
        })
    );
    if (
      countDigestDeliveries(env, {
        userId,
        digestKind: "scheduled_matches",
        status: "sent"
      }) < 1
    ) {
      throw new Error(`Expected at least one scheduled digest delivery row for ${userId}.`);
    }

    const notificationRow = queryPostgres(
      env,
      `
        select notification_id::text
        from notification_log
        where user_id = ${sqlLiteral(userId)}
          and doc_id = ${sqlLiteral(docId)}
        order by sent_at desc nulls last, created_at desc
        limit 1;
      `
    );
    if (!notificationRow) {
      throw new Error(`Expected a notification row for ${docId} before feedback checks.`);
    }
    const helpfulFeedbackRedirect = await postBrowserForm(
      "http://127.0.0.1:4321/bff/feedback",
      {
        notificationId: notificationRow,
        docId,
        interestId: userInterestId,
        feedbackValue: "helpful"
      },
      {
        cookie: webCookie
      }
    );
    assertFlashRedirect(helpfulFeedbackRedirect, {
      origin: "http://127.0.0.1:4321",
      pathname: "/",
      section: "notifications",
      status: "success",
      message: "Feedback recorded"
    });
    if (
      countNotificationFeedback(env, {
        userId,
        notificationId: notificationRow
      }) !== 1
    ) {
      throw new Error("Helpful notification feedback did not persist exactly one row.");
    }
    let feedbackValue = queryPostgres(
      env,
      `
        select feedback_value
        from notification_feedback
        where user_id = ${sqlLiteral(userId)}
          and notification_id = ${sqlLiteral(notificationRow)}
        limit 1;
      `
    );
    if (feedbackValue !== "helpful") {
      throw new Error(`Expected helpful feedback value, got ${feedbackValue || "<none>"}.`);
    }
    const notHelpfulFeedbackRedirect = await postBrowserForm(
      "http://127.0.0.1:4321/bff/feedback",
      {
        notificationId: notificationRow,
        docId,
        interestId: userInterestId,
        feedbackValue: "not_helpful"
      },
      {
        cookie: webCookie
      }
    );
    assertFlashRedirect(notHelpfulFeedbackRedirect, {
      origin: "http://127.0.0.1:4321",
      pathname: "/",
      section: "notifications",
      status: "success",
      message: "Feedback recorded"
    });
    feedbackValue = queryPostgres(
      env,
      `
        select feedback_value
        from notification_feedback
        where user_id = ${sqlLiteral(userId)}
          and notification_id = ${sqlLiteral(notificationRow)}
        limit 1;
      `
    );
    if (feedbackValue !== "not_helpful") {
      throw new Error(`Expected feedback update to not_helpful, got ${feedbackValue || "<none>"}.`);
    }

    log("Exercising moderation block/unblock and verifying audit trail.");
    await postForm(
      "http://127.0.0.1:4322/bff/admin/moderation",
      {
        docId,
        actionType: "block",
        reason: "Internal MVP readiness acceptance"
      },
      {
        cookie: adminCookie
      }
    );
    await waitFor(
      "blocked signal_candidate visibility",
      async () => fetchJson(`http://127.0.0.1:8000/maintenance/signal-candidates/${docId}`),
      (payload) => payload?.visibility_state === "blocked"
    );

    await postForm(
      "http://127.0.0.1:4322/bff/admin/moderation",
      {
        docId,
        actionType: "unblock",
        reason: "Internal MVP readiness acceptance"
      },
      {
        cookie: adminCookie
      }
    );
    await waitFor(
      "unblocked signal_candidate visibility",
      async () => fetchJson(`http://127.0.0.1:8000/maintenance/signal-candidates/${docId}`),
      (payload) => payload?.visibility_state === "visible"
    );

    const moderationAuditCount = Number(
      queryPostgres(
        env,
        `
          select count(*)::int
          from audit_log
          where action_type = 'signal_candidate_moderation'
            and entity_type = 'signal_candidate'
            and entity_id = ${sqlLiteral(docId)};
        `
      )
    );
    if (moderationAuditCount < 2) {
      throw new Error(
        `Expected at least two moderation audit rows for ${docId}, got ${moderationAuditCount}.`
      );
    }

    log("Creating an admin-managed user interest for the selected user.");
    const adminManagedInterest = await postForm(
      "http://127.0.0.1:4322/bff/admin/user-interests",
      {
        userId,
        description: `Admin-managed EU AI policy updates in Brussels and Warsaw ${runId}`,
        positive_texts: "EU AI policy update\nBrussels AI guidance\nWarsaw AI guidance",
        negative_texts: "sports\ncelebrity gossip",
        places: "Brussels, Warsaw",
        languages_allowed: "en",
        must_have_terms: "AI, policy",
        priority: "1",
        enabled: "true"
      },
      {
        cookie: adminCookie
      }
    );
    const adminManagedInterestId = String(adminManagedInterest.json?.interestId ?? "");
    if (!adminManagedInterestId) {
      throw new Error("Admin-managed interest creation did not return an interestId.");
    }

    await waitFor(
      "compiled admin-managed interest",
      async () =>
        fetchJson(`http://127.0.0.1:4322/bff/admin/user-interests?userId=${encodeURIComponent(userId)}`, {
          cookie: adminCookie
        }),
      (payload) =>
        Array.isArray(payload?.interests) &&
        payload.interests.some(
          (interest) =>
            String(interest.interest_id ?? "") === adminManagedInterestId &&
            String(interest.compile_status ?? "") === "compiled"
        )
    );

    upsertDeterministicInterestMatch(env, {
      docId,
      userId,
      interestId: adminManagedInterestId,
      runId,
    });
    const historicalAdminMatchCountBeforeBackfill = countInterestMatches(env, {
      docId,
      interestId: adminManagedInterestId
    });
    if (historicalAdminMatchCountBeforeBackfill !== 1) {
      throw new Error(
        `Expected deterministic historical admin-managed interest match for ${docId} and ${adminManagedInterestId}, got ${historicalAdminMatchCountBeforeBackfill}.`
      );
    }
    const historicalNotificationCountBeforeBackfill = countNotifications(env, {
      docId,
      interestId: adminManagedInterestId
    });
    if (historicalNotificationCountBeforeBackfill !== 0) {
      throw new Error(
        `Expected historical auto-sync to skip retro notifications for signal_candidate ${docId} and interest ${adminManagedInterestId}, got ${historicalNotificationCountBeforeBackfill}.`
      );
    }
    const historicalSuppressionCountBeforeBackfill = countSuppressions(env, {
      docId,
      interestId: adminManagedInterestId
    });
    if (historicalSuppressionCountBeforeBackfill !== 0) {
      throw new Error(
        `Expected historical auto-sync to skip retro suppressions for signal_candidate ${docId} and interest ${adminManagedInterestId}, got ${historicalSuppressionCountBeforeBackfill}.`
      );
    }

    log("Creating a second RSS channel to prove fresh-ingest matching for the admin-managed interest.");
    const adminFreshChannel = await postForm(
      "http://127.0.0.1:4322/bff/admin/channels",
      {
        providerType: "rss",
        name: `Internal MVP RSS Fresh ${runId}`,
        fetchUrl: `http://web:4321/internal-mvp-feed.xml?run=${encodeURIComponent(adminFreshRunId)}`,
        language: "en"
      },
      {
        cookie: adminCookie
      }
    );
    const adminFreshChannelId = String(adminFreshChannel.json?.channelId ?? "");
    if (!adminFreshChannelId) {
      throw new Error("Fresh RSS channel creation did not return a channelId.");
    }

    runCompose(
      "exec",
      "-T",
      "fetchers",
      "pnpm",
      "--filter",
      "@signalops/fetchers",
      "run:once",
      adminFreshChannelId
    );

    const freshSignalCandidateRow = await waitFor(
      "fresh signal_candidate row for admin-managed interest",
      async () => {
        const row = queryPostgres(
          env,
          `
            select doc_id::text, processing_state, visibility_state
            from signal_candidates
            where title = ${sqlLiteral(adminFreshSignalCandidateTitle)}
            order by ingested_at desc
            limit 1;
          `
        );
        return row ? row.split("|") : null;
      },
      (row) => Array.isArray(row) && row.length === 3
    );
    const freshDocId = freshSignalCandidateRow[0];

    upsertDeterministicInterestMatch(env, {
      docId: freshDocId,
      userId,
      interestId: adminManagedInterestId,
      runId: adminFreshRunId,
    });
    const freshIngestAdminMatchCount = countInterestMatches(env, {
      docId: freshDocId,
      interestId: adminManagedInterestId
    });
    if (freshIngestAdminMatchCount !== 1) {
      throw new Error(
        `Expected deterministic fresh admin-managed interest match for ${freshDocId} and ${adminManagedInterestId}, got ${freshIngestAdminMatchCount}.`
      );
    }
    await waitFor(
      "fresh signal_candidate lifecycle state",
      async () =>
        queryPostgres(
          env,
          `
            select processing_state
            from signal_candidates
            where doc_id = ${sqlLiteral(freshDocId)};
          `
        ),
      (value) => value === "matched" || value === "notified"
    );
    if (
      countNotifications(env, {
        docId: freshDocId,
        channelType: "email_digest"
      }) !== 0
    ) {
      throw new Error(`Fresh signal_candidate ${freshDocId} should not create immediate email_digest notification rows.`);
    }

    const freshAdminMatchCountBeforeBackfill = countInterestMatches(env, {
      docId: freshDocId,
      interestId: adminManagedInterestId
    });
    const freshNotificationCountBeforeBackfill = countNotifications(env, {
      docId: freshDocId,
      interestId: adminManagedInterestId,
      status: "sent"
    });
    const freshSuppressionCountBeforeBackfill = countSuppressions(env, {
      docId: freshDocId,
      interestId: adminManagedInterestId
    });

    log("Queueing historical backfill after the admin-managed interest is live.");
    const backfillJob = await postForm(
      "http://127.0.0.1:4322/bff/admin/reindex",
      {
        indexName: "interest_centroids",
        jobKind: "backfill"
      },
      {
        cookie: adminCookie
      }
    );
    const backfillJobId = String(backfillJob.json?.reindexJobId ?? "");
    if (!backfillJobId) {
      throw new Error("Backfill request did not return a reindexJobId.");
    }

    await waitFor(
      "completed admin-triggered backfill job",
      async () =>
        queryPostgres(
          env,
          `
            select status
            from reindex_jobs
            where reindex_job_id = ${sqlLiteral(backfillJobId)};
          `
        ),
      (value) => value === "completed",
      {
        timeoutMs: ADMIN_BACKFILL_TIMEOUT_MS,
        describeLastValue: (value) => `status=${value || "<none>"}`,
      }
    );

    const historicalAdminMatchCountAfterBackfill = countInterestMatches(env, {
      docId,
      interestId: adminManagedInterestId
    });
    if (historicalAdminMatchCountAfterBackfill !== historicalAdminMatchCountBeforeBackfill) {
      throw new Error(
        `Expected backfill to keep historical signal_candidate ${docId} match cardinality stable for admin-managed interest ${adminManagedInterestId}; before=${historicalAdminMatchCountBeforeBackfill}, after=${historicalAdminMatchCountAfterBackfill}.`
      );
    }

    const historicalNotificationCountAfterBackfill = countNotifications(env, {
      docId,
      interestId: adminManagedInterestId
    });
    if (historicalNotificationCountAfterBackfill !== historicalNotificationCountBeforeBackfill) {
      throw new Error(
        `Expected backfill to avoid retro notifications for historical signal_candidate ${docId}; before=${historicalNotificationCountBeforeBackfill}, after=${historicalNotificationCountAfterBackfill}.`
      );
    }

    const historicalSuppressionCountAfterBackfill = countSuppressions(env, {
      docId,
      interestId: adminManagedInterestId
    });
    if (historicalSuppressionCountAfterBackfill !== historicalSuppressionCountBeforeBackfill) {
      throw new Error(
        `Expected backfill to avoid retro suppression rows for historical signal_candidate ${docId}; before=${historicalSuppressionCountBeforeBackfill}, after=${historicalSuppressionCountAfterBackfill}.`
      );
    }

    const freshAdminMatchCountAfterBackfill = countInterestMatches(env, {
      docId: freshDocId,
      interestId: adminManagedInterestId
    });
    if (freshAdminMatchCountAfterBackfill !== freshAdminMatchCountBeforeBackfill) {
      throw new Error(
        `Expected backfill to keep fresh signal_candidate ${freshDocId} match cardinality stable for admin-managed interest ${adminManagedInterestId}; before=${freshAdminMatchCountBeforeBackfill}, after=${freshAdminMatchCountAfterBackfill}.`
      );
    }

    const freshNotificationCountAfterBackfill = countNotifications(env, {
      docId: freshDocId,
      interestId: adminManagedInterestId,
      status: "sent"
    });
    if (freshNotificationCountAfterBackfill !== freshNotificationCountBeforeBackfill) {
      throw new Error(
        `Expected backfill to avoid retro notifications for fresh signal_candidate ${freshDocId}; before=${freshNotificationCountBeforeBackfill}, after=${freshNotificationCountAfterBackfill}.`
      );
    }

    const freshSuppressionCountAfterBackfill = countSuppressions(env, {
      docId: freshDocId,
      interestId: adminManagedInterestId
    });
    if (freshSuppressionCountAfterBackfill !== freshSuppressionCountBeforeBackfill) {
      throw new Error(
        `Expected backfill to keep fresh signal_candidate ${freshDocId} suppression cardinality stable for admin-managed interest ${adminManagedInterestId}; before=${freshSuppressionCountBeforeBackfill}, after=${freshSuppressionCountAfterBackfill}.`
      );
    }

    log("Verifying the admin signal_candidate detail surface and enrichment retry flow on the fresh signal_candidate.");
    await assertHtmlContains(
      `http://127.0.0.1:4322/signal-candidates/${freshDocId}`,
      [adminFreshSignalCandidateTitle, "Retry enrichment", "Raw enrichment debug"],
      { cookie: adminCookie }
    );
    const enrichmentRetryAuditBefore = countNotifications(env, {
      docId: freshDocId,
      interestId: adminManagedInterestId
    });
    const retryAuditCountBefore = queryPostgresInt(
      env,
      `
        select count(*)::int
        from audit_log
        where action_type = 'signal_candidate_enrichment_retry'
          and entity_type = 'signal_candidate'
          and entity_id = ${sqlLiteral(freshDocId)};
      `
    );
    const retryResponse = await postBrowserForm(
      "http://127.0.0.1:4322/bff/admin/signal-candidates/enrichment-retry",
      {
        docId: freshDocId,
        redirectTo: `/signal-candidates/${freshDocId}`,
      },
      {
        cookie: adminCookie
      }
    );
    assertFlashRedirect(retryResponse, {
      origin: "http://127.0.0.1:4322",
      pathname: `/signal-candidates/${freshDocId}`,
      section: "signal_candidates",
      status: "success",
      message: "Enrichment retry queued"
    });
    await waitFor(
      "fresh signal_candidate enrichment retry audit row",
      async () =>
        queryPostgresInt(
          env,
          `
            select count(*)::int
            from audit_log
            where action_type = 'signal_candidate_enrichment_retry'
              and entity_type = 'signal_candidate'
              and entity_id = ${sqlLiteral(freshDocId)};
          `
        ),
      (count) => count >= retryAuditCountBefore + 1
    );
    await waitFor(
      "fresh signal_candidate manual enrichment retry sequence run",
      async () =>
        queryPostgres(
          env,
          `
            select status
            from sequence_runs
            where trigger_type = 'manual'
              and context_json ->> 'doc_id' = ${sqlLiteral(freshDocId)}
            order by created_at desc
            limit 1;
          `
        ),
      (status) => status === "completed"
    );
    const freshNotificationCountAfterRetry = countNotifications(env, {
      docId: freshDocId,
      interestId: adminManagedInterestId
    });
    if (freshNotificationCountAfterRetry < enrichmentRetryAuditBefore) {
      throw new Error(
        `Expected fresh signal_candidate retry to avoid deleting notification history for ${freshDocId}; before=${enrichmentRetryAuditBefore}, after=${freshNotificationCountAfterRetry}.`
      );
    }

    log(
      `Internal MVP acceptance passed for user ${userId}, admin ${adminEmail}, historical signal_candidate ${docId}, fresh signal_candidate ${freshDocId}, and admin-managed interest ${adminManagedInterestId}.`
    );
  } finally {
    log("Cleaning up allowlisted Firebase admin identity.");
    try {
      const removed = await deleteFirebasePasswordUser(
        firebaseApiKey,
        adminEmail,
        adminPassword
      );
      if (!removed) {
        log("No Firebase proof-admin identity needed cleanup.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[mvp-internal] Failed to clean up Firebase proof-admin identity: ${message}`);
    }

    if (stackStarted) {
      log("Stopping compose.dev stack.");
      try {
        runCompose("down", "-v", "--remove-orphans");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[mvp-internal] Failed to stop compose stack cleanly: ${message}`);
      }
    }
  }
}

await main();

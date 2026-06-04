import { randomUUID } from "node:crypto";
import process from "node:process";
import { createRequire } from "node:module";
import {
  deleteFirebasePasswordUser,
  ensureFirebasePasswordUser,
  fetchJson,
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
  firstResultLine,
  sqlLiteral,
  waitForHttpHealth,
} from "./lib/compose-proof-testkit.mjs";

const requireFromFetchers = createRequire(
  new URL("../../services/fetchers/package.json", import.meta.url)
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
const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900, mobile: false },
  { name: "tablet", width: 820, height: 1180, mobile: false },
  { name: "mobile", width: 390, height: 844, mobile: true },
];
const PRIVATE_HOST_ALLOWLIST_ENV = "FETCHERS_ACQUISITION_PRIVATE_HOST_ALLOWLIST";
const VIEWPORT_FIXTURE_ALLOWLIST = ["web"];

function ensureFixtureAllowlist() {
  const existing = String(process.env[PRIVATE_HOST_ALLOWLIST_ENV] ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  const merged = new Set([...existing, ...VIEWPORT_FIXTURE_ALLOWLIST]);
  process.env[PRIVATE_HOST_ALLOWLIST_ENV] = [...merged].join(",");
}

function log(message) {
  console.log(`[web-viewports] ${message}`);
}

const waitFor = createWaitFor({ timeoutMs: 120000, intervalMs: 1500 });

async function ensureComposeStack() {
  ensureFixtureAllowlist();
  log("Ensuring compose stack is available for web viewport smoke.");
  runCompose("up", "-d", ...STACK_SERVICES);
  const healthOptions = { timeoutMs: 120000, intervalMs: 1500 };
  await Promise.all([
    waitForHttpHealth("api", "http://127.0.0.1:8000/health", healthOptions),
    waitForHttpHealth("web", "http://127.0.0.1:4321/api/health", healthOptions),
    waitForHttpHealth("admin", "http://127.0.0.1:4322/api/health", healthOptions),
    waitForHttpHealth("nginx", "http://127.0.0.1:8080/health", healthOptions),
  ]);
}

async function waitForVisible(locator, label) {
  await locator.first().waitFor({ state: "visible", timeout: 60000 });
  const count = await locator.count();
  if (count < 1) {
    throw new Error(`Expected visible locator for ${label}.`);
  }
}

async function assertVisibleAction(page, locator, label) {
  const target = locator.first();
  await target.scrollIntoViewIfNeeded();
  await waitForVisible(locator, label);
  const box = await target.boundingBox();
  const viewport = page.viewportSize();
  if (!box || !viewport) {
    throw new Error(`Expected ${label} to have a measurable bounding box.`);
  }
  if (box.width <= 0 || box.height <= 0) {
    throw new Error(`Expected ${label} to have positive size.`);
  }
  if (box.x + box.width > viewport.width + 2) {
    throw new Error(
      `Expected ${label} to fit within viewport width ${viewport.width}, got x=${box.x} width=${box.width}.`
    );
  }
}

async function assertNoHorizontalOverflow(page, label) {
  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    return Math.max(root.scrollWidth, body?.scrollWidth ?? 0) - window.innerWidth;
  });
  if (overflow > 32) {
    throw new Error(`Expected ${label} to avoid obvious horizontal overflow, got ${overflow}px.`);
  }
}

async function openPage(page, url, heading) {
  const response = await page.goto(url, { waitUntil: "domcontentloaded" });
  if (!response || !response.ok()) {
    throw new Error(`Expected ${url} to load successfully, got ${response?.status() ?? "no response"}.`);
  }
  await page.getByRole("heading", { name: heading }).first().waitFor({ state: "visible", timeout: 15000 });
  await assertNoHorizontalOverflow(page, url);
}

async function verifyMobileMenuNavigation(page) {
  await page.getByLabel("Toggle menu").click();
  const savedLink = page.getByRole("link", { name: "Saved" }).first();
  await assertVisibleAction(page, savedLink, "mobile saved navigation link");
  await savedLink.click();
  await page.waitForURL("**/saved");
  await page.getByRole("heading", { name: "Saved" }).waitFor({ state: "visible", timeout: 15000 });
}

async function runViewportScenario({
  viewport,
  webCookie,
  articleTitle,
  contentItemId,
  interestDescription,
}) {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      isMobile: viewport.mobile,
      hasTouch: viewport.mobile,
      userAgent: viewport.mobile
        ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
        : undefined,
    });
    const sessionCookie = readCookieValue(webCookie);
    await context.addCookies([
      {
        name: sessionCookie.name,
        value: sessionCookie.value,
        url: "http://127.0.0.1:4321",
        httpOnly: true,
        sameSite: "Strict",
      },
    ]);

    const page = await context.newPage();
    log(`Running ${viewport.name} viewport checks.`);
    const articleSearchParam = encodeURIComponent(articleTitle);

    await openPage(page, `http://127.0.0.1:4321/?q=${articleSearchParam}`, "SignalOps");
    await waitForVisible(page.getByText(articleTitle), `collection article title on ${viewport.name}`);
    await assertVisibleAction(
      page,
      page.getByRole("button", { name: /Save|Unsave/ }),
      `collection save toggle on ${viewport.name}`
    );

    if (viewport.mobile || viewport.width < 1024) {
      await verifyMobileMenuNavigation(page);
    } else {
      const matchesLink = page.getByRole("link", { name: "My Matches" }).first();
      await assertVisibleAction(page, matchesLink, `${viewport.name} matches navigation link`);
      await matchesLink.click();
      await page.waitForURL("**/matches");
    }

    await openPage(page, `http://127.0.0.1:4321/matches?q=${articleSearchParam}`, "My Matches");
    await waitForVisible(page.getByText(articleTitle), `matches article title on ${viewport.name}`);
    await assertVisibleAction(
      page,
      page.getByRole("button", { name: /Save|Unsave/ }),
      `matches save toggle on ${viewport.name}`
    );

    await openPage(
      page,
      `http://127.0.0.1:4321/content/${encodeURIComponent(contentItemId)}`,
      articleTitle
    );
    await assertVisibleAction(
      page,
      page.getByRole("button", { name: /Save|Unsave/ }),
      `content detail save toggle on ${viewport.name}`
    );
    await assertVisibleAction(
      page,
      page.getByRole("button", { name: /Follow story|Following/ }),
      `content detail follow toggle on ${viewport.name}`
    );
    await assertVisibleAction(
      page,
      page.getByRole("link", { name: "Open original source" }),
      `content detail source link on ${viewport.name}`
    );

    await openPage(page, "http://127.0.0.1:4321/saved", "Saved");
    await waitForVisible(page.getByText(articleTitle), `saved article title on ${viewport.name}`);
    await assertVisibleAction(
      page,
      page.getByRole("button", { name: /Preview/ }),
      `saved digest preview action on ${viewport.name}`
    );

    await openPage(
      page,
      `http://127.0.0.1:4321/saved/digest?item=${encodeURIComponent(contentItemId)}`,
      "Saved Digest Preview"
    );
    await waitForVisible(page.getByText(articleTitle), `saved digest article title on ${viewport.name}`);
    await assertVisibleAction(
      page,
      page.getByRole("link", { name: "Download HTML" }),
      `saved digest export link on ${viewport.name}`
    );
    await assertVisibleAction(
      page,
      page.getByRole("button", { name: "Send to email" }),
      `saved digest send action on ${viewport.name}`
    );

    await openPage(page, "http://127.0.0.1:4321/following", "Following");
    await waitForVisible(page.getByText(articleTitle), `following article title on ${viewport.name}`);

    await openPage(page, "http://127.0.0.1:4321/interests", "My Interests");
    await waitForVisible(
      page.getByText(interestDescription),
      `interest description on ${viewport.name}`
    );
    await assertVisibleAction(
      page,
      page.getByRole("button", { name: "Add Interest" }),
      `add interest action on ${viewport.name}`
    );

    await openPage(page, "http://127.0.0.1:4321/settings", "Settings");
    await waitForVisible(page.getByText("Scheduled Digest"), `scheduled digest heading on ${viewport.name}`);
    await assertVisibleAction(
      page,
      page.getByRole("button", { name: "Save Digest Settings" }),
      `save digest settings action on ${viewport.name}`
    );

    await openPage(page, "http://127.0.0.1:4321/notifications", "Notification History");
    await waitForVisible(page.getByText(articleTitle), `notification article title on ${viewport.name}`);
    await assertVisibleAction(
      page,
      page.locator('button[title="Helpful"]'),
      `helpful notification action on ${viewport.name}`
    );
    await assertVisibleAction(
      page,
      page.locator('button[title="Not helpful"]'),
      `not helpful notification action on ${viewport.name}`
    );

    await context.close();
  } finally {
    await browser.close();
  }
}

async function main() {
  const env = await readEnvFile(".env.dev");
  const firebaseApiKey = requireConfigured(env, "FIREBASE_WEB_API_KEY", {
    proofName: "web viewport smoke",
  });
  const runId = randomUUID().slice(0, 8);
  const allowlistEntries = readAllowlistEntries(env);
  const adminEmail = selectAdminEmail(allowlistEntries, runId, { prefix: "viewport-admin" });
  const adminPassword = `SignalOps!${runId}`;
  const articleTitle = `EU AI policy update reaches Brussels and Warsaw ${runId}`;
  const interestDescription = "AI policy changes in the European Union and Poland";
  const notificationEmail = `viewport-user-${runId}@example.test`;
  let adminCreated = false;

  try {
    await ensureComposeStack();
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

    log("Bootstrapping anonymous web session.");
    const webBootstrap = await postForm("http://127.0.0.1:4321/bff/auth/bootstrap", {});
    const webCookie = webBootstrap.cookie;
    const userId = String(webBootstrap.json?.session?.userId ?? "");
    if (!webCookie || !userId) {
      throw new Error("Web bootstrap did not return a session cookie and user id.");
    }

    log("Creating a user interest plus digest and immediate channels for viewport coverage.");
    const userInterest = await postForm(
      "http://127.0.0.1:4321/bff/interests",
      {
        description: "AI policy changes in the European Union",
        positive_texts: "EU AI policy\nEuropean AI regulation\nBrussels AI rules",
        negative_texts: "sports\ncelebrity gossip",
        places: "Brussels, Warsaw",
        languages_allowed: "en",
        must_have_terms: "policy",
        priority: "1",
      },
      {
        cookie: webCookie,
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
        email: notificationEmail,
      },
      {
        cookie: webCookie,
      }
    );
    await postForm(
      "http://127.0.0.1:4321/bff/notification-channels",
      {
        channelType: "telegram",
        chatId: `viewport-${runId}`,
      },
      {
        cookie: webCookie,
      }
    );

    await waitFor(
      "compiled user interest for viewport smoke",
      async () => fetchJson("http://127.0.0.1:4321/bff/interests", { cookie: webCookie }),
      (payload) =>
        Array.isArray(payload?.interests) &&
        payload.interests.some(
          (interest) =>
            String(interest?.interest_id ?? "") === userInterestId &&
            String(interest?.compile_status ?? "") === "compiled"
        )
    );
    await postForm(
      `http://127.0.0.1:4321/bff/interests/${encodeURIComponent(userInterestId)}`,
      {
        _action: "update",
        description: interestDescription,
      },
      {
        cookie: webCookie,
      }
    );
    await waitFor(
      "updated user interest description for viewport smoke",
      async () => fetchJson("http://127.0.0.1:4321/bff/interests", { cookie: webCookie }),
      (payload) =>
        Array.isArray(payload?.interests) &&
        payload.interests.some(
          (interest) =>
            String(interest?.interest_id ?? "") === userInterestId &&
            String(interest?.description ?? "") === interestDescription
        )
    );

    log("Creating the system-interest and RSS channel through the admin surface.");
    const systemInterest = await postForm(
      "http://127.0.0.1:4322/bff/admin/templates",
      {
        kind: "interest",
        intent: "save",
        name: `Viewport system interest ${runId}`,
        description: "Deterministic editorial selection for responsive viewport smoke.",
        positive_texts: "EU AI policy update\nBrussels AI guidance\nWarsaw AI guidance",
        negative_texts: "sports\ncelebrity gossip",
        allowed_content_kinds: "editorial",
        languages_allowed: "en",
        priority: "1",
        isActive: "true",
      },
      {
        cookie: adminCookie,
      }
    );
    if (!String(systemInterest.json?.interestTemplateId ?? "").trim()) {
      throw new Error("System interest creation did not return an interestTemplateId.");
    }

    const rssChannel = await postForm(
      "http://127.0.0.1:4322/bff/admin/channels",
      {
        providerType: "rss",
        name: `Viewport RSS ${runId}`,
        fetchUrl: `http://web:4321/internal-mvp-feed.xml?run=${encodeURIComponent(runId)}`,
        language: "en",
      },
      {
        cookie: adminCookie,
      }
    );
    const channelId = String(rssChannel.json?.channelId ?? "");
    if (!channelId) {
      throw new Error("Viewport RSS channel creation did not return a channelId.");
    }

    log("Running a deterministic RSS fetch for responsive coverage.");
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

    const articleRow = await waitFor(
      "viewport smoke article row",
      async () => {
        const row = queryPostgres(
          env,
          `
            select doc_id::text, processing_state
            from articles
            where title = ${sqlLiteral(articleTitle)}
            order by ingested_at desc
            limit 1;
          `
        );
        return row ? row.split("|") : null;
      },
      (row) => Array.isArray(row) && row.length === 2
    );
    const docId = articleRow[0];
    const contentItemId = `editorial:${docId}`;

    await waitFor(
      "viewport article criteria pipeline settled",
      async () =>
        queryPostgresInt(
          env,
          `
            select count(*)::int
            from inbox_processed_events processed
            join outbox_events event on event.event_id = processed.event_id
            where processed.consumer_name = 'worker.match.criteria'
              and (
                event.aggregate_id = ${sqlLiteral(docId)}::uuid
                or event.payload_json ->> 'docId' = ${sqlLiteral(docId)}
              );
          `
        ),
      (count) => count >= 1,
      {
        timeoutMs: 180000,
        intervalMs: 2000,
        describeLastValue: (count) => `processed criteria event count=${String(count)}`,
      }
    );

    firstResultLine(queryPostgres(
      env,
      `
        with article_cluster as (
          select
            doc_id,
            coalesce(event_cluster_id, gen_random_uuid()) as cluster_id,
            title,
            published_at
          from articles
          where doc_id = ${sqlLiteral(docId)}::uuid
        ),
        upsert_cluster as (
          insert into event_clusters (
            cluster_id,
            article_count,
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
          from article_cluster
          on conflict (cluster_id) do update
          set
            article_count = greatest(event_clusters.article_count, 1),
            primary_title = coalesce(event_clusters.primary_title, excluded.primary_title),
            min_published_at = coalesce(event_clusters.min_published_at, excluded.min_published_at),
            max_published_at = coalesce(event_clusters.max_published_at, excluded.max_published_at),
            updated_at = now()
          returning cluster_id
        ),
        upsert_member as (
          insert into event_cluster_members (cluster_id, doc_id)
          select cluster_id, doc_id
          from article_cluster
          on conflict (doc_id) do update
          set cluster_id = excluded.cluster_id
          returning doc_id
        )
        update articles a
        set
          processing_state = 'matched',
          visibility_state = 'visible',
          canonical_doc_id = null,
          family_id = article_cluster.doc_id,
          is_exact_duplicate = false,
          is_near_duplicate = false,
          event_cluster_id = article_cluster.cluster_id,
          published_at = now(),
          ingested_at = now(),
          updated_at = now()
        from article_cluster
        where a.doc_id = article_cluster.doc_id;

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
          jsonb_build_object('source', 'web-viewports-seed', 'runId', ${sqlLiteral(runId)})
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
            'web-viewports-seed',
            'selectionMode',
            'browser_smoke_seed',
            'selectionReason',
            'Deterministic viewport browser proof seed.',
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
          jsonb_build_object('source', 'web-viewports-seed', 'runId', ${sqlLiteral(runId)})
        from articles a
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
          ${sqlLiteral(`Viewport notification ${runId}`)},
          ${sqlLiteral("Deterministic notification row for responsive browser proof.")},
          'seeded_viewport_smoke',
          '{}'::jsonb
        );
      `
    ));

    await waitFor(
      "matched article visibility for viewport smoke",
      async () =>
        queryPostgres(
          env,
          `
            select processing_state
            from articles
            where doc_id = ${sqlLiteral(docId)};
          `
        ),
      (value) => value === "matched" || value === "notified"
    );
    await waitFor(
      "system-selected collection row for viewport smoke",
      async () =>
        fetchJson(
          `http://127.0.0.1:8000/collections/system-selected?page=1&pageSize=100&q=${encodeURIComponent(articleTitle)}`
        ),
      (payload) =>
        Array.isArray(payload?.items) &&
        payload.items.some((item) => String(item?.content_item_id ?? "") === contentItemId)
    );
    await waitFor(
      "user notification row for viewport smoke",
      async () =>
        queryPostgresInt(
          env,
          `
            select count(*)::int
            from notification_log
            where user_id = ${sqlLiteral(userId)}
              and doc_id = ${sqlLiteral(docId)};
          `
        ),
      (count) => count >= 1
    );

    log("Saving and following the content item for responsive surfaces.");
    const saveState = await postForm(
      "http://127.0.0.1:4321/bff/content-state",
      {
        contentItemId,
        action: "save",
      },
      {
        cookie: webCookie,
      }
    );
    if (String(saveState.json?.userState?.saved_state ?? "") !== "saved") {
      throw new Error("Viewport smoke save action did not persist saved state.");
    }

    const followState = await postForm(
      "http://127.0.0.1:4321/bff/story-follow",
      {
        contentItemId,
        action: "follow",
      },
      {
        cookie: webCookie,
      }
    );
    if (!followState.json?.userState?.is_following_story) {
      throw new Error("Viewport smoke follow action did not persist story follow state.");
    }

    await waitFor(
      "saved page populated for viewport smoke",
      async () => fetchJson("http://127.0.0.1:4321/bff/session", { cookie: webCookie }),
      (payload) => String(payload?.session?.userId ?? "") === userId
    );

    for (const viewport of VIEWPORTS) {
      firstResultLine(queryPostgres(
        env,
        `
          update articles
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
            explain_json = jsonb_build_object('source', 'web-viewports-seed-reassert', 'runId', ${sqlLiteral(runId)}),
            updated_at = now()
          where doc_id = ${sqlLiteral(docId)}::uuid;

          update final_selection_results
          set
            final_decision = 'selected',
            is_selected = true,
            compat_system_feed_decision = 'eligible',
            explain_json = jsonb_build_object(
              'source',
              'web-viewports-seed-reassert',
              'selectionMode',
              'browser_smoke_seed',
              'selectionReason',
              'Deterministic viewport browser proof seed.',
              'runId',
              ${sqlLiteral(runId)}
            ),
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
            ${sqlLiteral(userInterestId)}::uuid,
            a.event_cluster_id,
            0.98,
            0.01,
            0.91,
            0.77,
            0.97,
            0.97,
            'notify',
            jsonb_build_object('source', 'web-viewports-seed-reassert', 'runId', ${sqlLiteral(runId)})
          from articles a
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
      ));
      await runViewportScenario({
        viewport,
        webCookie,
        articleTitle,
        contentItemId,
        interestDescription,
      });
    }

    console.log(
      JSON.stringify(
        {
          status: "web-viewports-ok",
          userId,
          channelId,
          contentItemId,
          articleTitle,
          viewports: VIEWPORTS.map((viewport) => viewport.name),
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

import { randomUUID } from "node:crypto";
import process from "node:process";
import { createRequire } from "node:module";
import {
  composeArgs,
  deleteFirebasePasswordUser,
  ensureFirebasePasswordUser,
  fetchJson,
  postForm,
  readAllowlistEntries,
  readEnvFile,
  requireConfigured,
  runCommand,
  runCompose,
  selectAdminEmail,
  createWaitFor,
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

function log(message) {
  console.log(`[web-viewports] ${message}`);
}

const waitFor = createWaitFor({ timeoutMs: 120000, intervalMs: 1500 });

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

async function ensureComposeStack() {
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
  return result.stdout.trim();
}

function queryPostgresInt(env, sql) {
  const value = queryPostgres(env, sql);
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Expected integer query result, got ${value || "<empty>"}.`);
  }
  return parsed;
}

function readCookieValue(cookie) {
  const separatorIndex = cookie.indexOf("=");
  if (separatorIndex < 0) {
    throw new Error(`Invalid cookie format: ${cookie}`);
  }
  return {
    name: cookie.slice(0, separatorIndex),
    value: cookie.slice(separatorIndex + 1),
  };
}

async function waitForVisible(locator, label) {
  await locator.first().waitFor({ state: "visible", timeout: 15000 });
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

    await openPage(page, "http://127.0.0.1:4321/", "NewsPortal");
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

    await openPage(page, "http://127.0.0.1:4321/matches", "My Matches");
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
  const adminPassword = `NewsPortal!${runId}`;
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
      "@newsportal/fetchers",
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
      async () => fetchJson("http://127.0.0.1:8000/collections/system-selected?page=1&pageSize=20"),
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

import { randomUUID } from "node:crypto";

import {
  assertHtmlContains,
  ensureFirebasePasswordUser,
  postForm,
  readAllowlistEntries,
  readEnvFile,
  requireConfigured,
  runCompose,
  sendRequest,
  selectAdminEmail,
  waitFor,
  waitForHttpHealth,
} from "./lib/mcp-http-testkit.mjs";

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
const REBUILD_SERVICES = ["migrate", "relay", "worker", "api", "admin"];

function log(message) {
  console.log(`[automation-admin] ${message}`);
}

async function ensureComposeStack() {
  log("Ensuring compose stack is available for automation-admin acceptance.");
  log("Rebuilding the automation admin services so compose uses the current workspace code.");
  runCompose("build", ...REBUILD_SERVICES);
  runCompose("up", "-d", ...STACK_SERVICES);
  await Promise.all([
    waitForHttpHealth("api", "http://127.0.0.1:8000/health"),
    waitForHttpHealth("admin", "http://127.0.0.1:4322/api/health"),
    waitForHttpHealth("nginx", "http://127.0.0.1:8080/health"),
  ]);
}

async function signInAdmin(adminBaseUrl, email, password) {
  const signIn = await postForm(`${adminBaseUrl}/bff/auth/sign-in`, {
    email,
    password,
    next: "/automation",
  });
  const sessionCookie = signIn.cookie;
  if (!sessionCookie) {
    throw new Error("Expected admin sign-in to return a session cookie.");
  }
  return sessionCookie;
}

async function main() {
  const env = await readEnvFile(".env.dev");
  const runId = randomUUID();
  const firebaseApiKey = requireConfigured(env, "FIREBASE_WEB_API_KEY", {
    proofName: "automation admin acceptance",
  });
  const adminPassword = `Automation!${runId.slice(0, 12)}`;
  const adminEmail = selectAdminEmail(readAllowlistEntries(env), runId, {
    prefix: "automation-admin",
  });
  const adminBaseUrl = "http://127.0.0.1:4322";
  const automationUrl = `${adminBaseUrl}/automation`;

  await ensureComposeStack();
  await ensureFirebasePasswordUser(firebaseApiKey, adminEmail, adminPassword);

  log("Signing in through the admin app.");
  const adminCookie = await signInAdmin(adminBaseUrl, adminEmail, adminPassword);

  log("Preflighting the automation surface.");
  await assertHtmlContains(
    automationUrl,
    [
      "Build, run, and tune automations from one visual control room",
      "Workflow Library",
      "Recent Outbox",
    ],
    { cookie: adminCookie }
  );

  const sequenceTitle = `Admin automation acceptance ${runId}`;
  log("Creating a new sequence through the admin surface.");
  const createResult = await postForm(
    `${adminBaseUrl}/bff/admin/automation`,
    {
      intent: "create_sequence",
      title: sequenceTitle,
      description: "Stage 3 operator acceptance sequence",
      status: "draft",
      tags: "ops,acceptance",
      taskGraph: JSON.stringify(
        [
          {
            key: "normalize",
            module: "article.normalize",
            options: {},
          },
        ],
        null,
        2
      ),
    },
    { cookie: adminCookie }
  );
  const sequenceId = String(createResult.json.sequence_id ?? "");
  if (!sequenceId) {
    throw new Error("Sequence creation did not return a sequence_id.");
  }

  const updatedTitle = `${sequenceTitle} updated`;
  log("Updating the sequence through the admin surface.");
  const updateResult = await postForm(
    `${adminBaseUrl}/bff/admin/automation`,
    {
      intent: "update_sequence",
      sequenceId,
      title: updatedTitle,
      description: "Updated from admin acceptance",
      status: "active",
      triggerEvent: "",
      cron: "",
      maxRuns: "",
      tags: "ops,acceptance,updated",
      taskGraph: JSON.stringify(
        [
          {
            key: "normalize",
            module: "article.normalize",
            options: {},
          },
        ],
        null,
        2
      ),
    },
    { cookie: adminCookie }
  );
  if (String(updateResult.json.title ?? "") !== updatedTitle) {
    throw new Error("Sequence update did not persist the new title.");
  }
  await assertHtmlContains(
    `${adminBaseUrl}/automation/${sequenceId}`,
    [updatedTitle, "Visual Workflow Builder", "Run Now"],
    { cookie: adminCookie }
  );

  log("Stopping the worker so the new run remains cancellable.");
  runCompose("stop", "worker");

  log("Requesting a pending sequence run through the admin surface.");
  const runResult = await postForm(
    `${adminBaseUrl}/bff/admin/automation`,
    {
      intent: "run_sequence",
      sequenceId,
      contextJson: "{}",
      triggerMeta: '{"sourceEventId":"automation-admin-acceptance"}',
    },
    { cookie: adminCookie }
  );
  const runIdText = String(runResult.json.run_id ?? "");
  if (!runIdText) {
    throw new Error("Run request did not return a run_id.");
  }
  if (String(runResult.json.status ?? "") !== "pending") {
    throw new Error(`Expected pending run status, received ${String(runResult.json.status ?? "unknown")}.`);
  }

  const executionsUrl = `${adminBaseUrl}/automation/${sequenceId}/executions`;

  await assertHtmlContains(
    executionsUrl,
    [updatedTitle, runIdText, "Selected Run"],
    { cookie: adminCookie }
  );

  log("Cancelling the pending run through the admin surface.");
  const cancelResult = await postForm(
    `${adminBaseUrl}/bff/admin/automation`,
    {
      intent: "cancel_run",
      runId: runIdText,
      reason: "Cancelled via automation admin acceptance.",
    },
    { cookie: adminCookie }
  );
  if (String(cancelResult.json.status ?? "") !== "cancelled") {
    throw new Error("Run cancellation did not return cancelled status.");
  }

  log("Archiving the sequence through the admin surface.");
  const archiveResult = await postForm(
    `${adminBaseUrl}/bff/admin/automation`,
    {
      intent: "archive_sequence",
      sequenceId,
    },
    { cookie: adminCookie }
  );
  if (String(archiveResult.json.status ?? "") !== "archived") {
    throw new Error("Sequence archive did not return archived status.");
  }

  log("Creating a reindex job to prove outbox visibility on the automation page.");
  const reindexResult = await postForm(
    `${adminBaseUrl}/bff/admin/reindex`,
    {
      indexName: "interest_centroids",
      jobKind: "rebuild",
    },
    { cookie: adminCookie }
  );
  const reindexJobId = String(reindexResult.json.reindexJobId ?? "");
  if (!reindexJobId) {
    throw new Error("Reindex request did not return a reindexJobId.");
  }

  await waitFor(
    "automation outbox row",
    async () => {
      const response = await sendRequest(automationUrl, {
        headers: { Cookie: adminCookie },
      });
      if (response.status !== 200) {
        throw new Error(`Automation page returned ${response.status}.`);
      }
      return response.text;
    },
    (html) =>
      html.includes("reindex.requested") &&
      html.includes(reindexJobId) &&
      html.includes(runIdText) &&
      html.includes("cancelled")
  );

  log("Restarting the worker after the cancellable-run proof.");
  runCompose("up", "-d", "worker");

  console.log(
    JSON.stringify(
      {
        status: "automation-admin-ok",
        sequenceId,
        updatedTitle,
        runId: runIdText,
        reindexJobId,
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    try {
      runCompose("up", "-d", "worker");
    } catch {
      // Best effort cleanup; the main failure should stay visible.
    }
  });

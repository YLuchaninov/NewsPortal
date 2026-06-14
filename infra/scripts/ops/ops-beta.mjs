import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = process.cwd();
const envFile = ".env.prod";
const composeArgs = [
  "compose",
  "--env-file",
  envFile,
  "-f",
  "infra/docker/compose.yml",
  "-f",
  "infra/docker/compose.prod.yml",
];

function usage() {
  console.error("Usage: pnpm ops:beta <up|down|logs|status|backup|restore-dry-run> [backup-file]");
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    env: process.env,
    stdio: options.stdio ?? "inherit",
    encoding: options.encoding,
    maxBuffer: options.maxBuffer ?? 64 * 1024 * 1024,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit ${result.status ?? "unknown"}.`);
  }
  return result;
}

function readEnv() {
  const envPath = path.join(repoRoot, envFile);
  if (!fs.existsSync(envPath)) {
    throw new Error(`${envFile} is required for beta ops.`);
  }
  const values = new Map();
  for (const rawLine of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const separator = line.indexOf("=");
    if (separator > 0) {
      values.set(line.slice(0, separator), line.slice(separator + 1));
    }
  }
  return values;
}

function envValue(values, key, fallback) {
  const value = String(values.get(key) ?? "").trim();
  return value || fallback;
}

function ensureProdEnvValid() {
  run("pnpm", ["check:prod-env"]);
}

function dockerCompose(args) {
  return run("docker", [...composeArgs, ...args]);
}

function statusReport() {
  const env = readEnv();
  dockerCompose(["ps"]);
  const postgresUser = envValue(env, "POSTGRES_USER", "signalops");
  const postgresDb = envValue(env, "POSTGRES_DB", "signalops");
  const sql = [
    "select 'outbox_ready', count(*) from outbox_events where status = 'pending';",
    "select 'recent_fetch_failures', count(*) from channel_fetch_runs where started_at > now() - interval '24 hours' and outcome_kind <> 'success';",
    "select 'active_beta_ingest_channels', count(*) from source_channels where is_active = true and provider_type in ('rss','website','api','email_imap');",
  ].join(" ");
  dockerCompose([
    "exec",
    "-T",
    "postgres",
    "psql",
    "-U",
    postgresUser,
    "-d",
    postgresDb,
    "-c",
    sql,
  ]);
  dockerCompose(["exec", "-T", "redis", "redis-cli", "ping"]);
}

function backup() {
  ensureProdEnvValid();
  const env = readEnv();
  const backupsDir = path.join(repoRoot, "data/backups");
  fs.mkdirSync(backupsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outputPath = path.join(backupsDir, `signalops-beta-${stamp}.sql`);
  const fd = fs.openSync(outputPath, "w");
  try {
    run(
      "docker",
      [
        ...composeArgs,
        "exec",
        "-T",
        "postgres",
        "pg_dump",
        "-U",
        envValue(env, "POSTGRES_USER", "signalops"),
        envValue(env, "POSTGRES_DB", "signalops"),
      ],
      { stdio: ["ignore", fd, "inherit"] }
    );
  } finally {
    fs.closeSync(fd);
  }
  console.log(`[ops:beta] backup written: ${outputPath}`);
}

function restoreDryRun(backupFile) {
  if (!backupFile) {
    throw new Error("restore-dry-run requires a backup file path.");
  }
  const resolved = path.resolve(repoRoot, backupFile);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Backup file does not exist: ${resolved}`);
  }
  const header = fs.readFileSync(resolved, "utf8").slice(0, 4096);
  if (!header.includes("PostgreSQL database dump")) {
    throw new Error("Backup file does not look like a plain pg_dump SQL artifact.");
  }
  console.log(`[ops:beta] restore dry-run passed for ${resolved}`);
  console.log("[ops:beta] No database changes were made.");
}

function main() {
  const [command, backupFile] = process.argv.slice(2);
  if (!command) {
    usage();
    process.exit(1);
  }
  switch (command) {
    case "up":
      ensureProdEnvValid();
      dockerCompose(["up", "--build", "-d", "postgres", "redis", "migrate", "relay", "fetchers", "worker", "api", "web", "admin", "mcp", "nginx"]);
      break;
    case "down":
      dockerCompose(["down", "--remove-orphans"]);
      break;
    case "logs":
      dockerCompose(["logs", "--tail=200", "-f"]);
      break;
    case "status":
      statusReport();
      break;
    case "backup":
      backup();
      break;
    case "restore-dry-run":
      restoreDryRun(backupFile);
      break;
    default:
      usage();
      process.exit(1);
  }
}

try {
  main();
} catch (error) {
  console.error(`[ops:beta] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

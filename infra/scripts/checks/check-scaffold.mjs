import { stat } from "node:fs/promises";
import path from "node:path";

const repoRoot = process.cwd();

const requiredDirectories = [
  "runtime/node/apps/web",
  "runtime/node/apps/admin",
  "runtime/node/services/fetchers",
  "runtime/node/services/relay",
  "runtime/node/services/mcp",
  "runtime/python/src/signalops/api",
  "runtime/python/src/signalops/workers",
  "runtime/python/src/signalops/ml",
  "runtime/python/src/signalops/indexer",
  "runtime/node/packages/ui",
  "runtime/node/packages/contracts",
  "runtime/node/packages/sdk",
  "runtime/node/packages/config",
  "runtime/node/packages/bff-server",
  "runtime/node/packages/content-safety",
  "runtime/node/packages/control-plane",
  "database/migrations",
  "database/ddl",
  "database/seeds",
  "infra/docker",
  "infra/fixtures",
  "infra/nginx",
  "infra/systemd",
  "infra/scripts",
  "data/models",
  "data/indices",
  "data/snapshots",
  "data/logs"
];

const requiredFiles = [
  "package.json",
  "pnpm-workspace.yaml",
  "turbo.json",
  "tsconfig.base.json",
  "README.md"
];

async function assertPath(relativePath, expectedType) {
  const absolutePath = path.join(repoRoot, relativePath);

  try {
    const entry = await stat(absolutePath);

    if (expectedType === "directory" && !entry.isDirectory()) {
      throw new Error("not a directory");
    }

    if (expectedType === "file" && !entry.isFile()) {
      throw new Error("not a file");
    }
  } catch {
    console.error(`Missing or invalid ${expectedType}: ${relativePath}`);
    process.exit(1);
  }
}

for (const directory of requiredDirectories) {
  await assertPath(directory, "directory");
}

for (const file of requiredFiles) {
  await assertPath(file, "file");
}

console.log(
  `Scaffold check passed: ${requiredDirectories.length} directories and ${requiredFiles.length} root files present.`
);

import { stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..", "..");

const requiredDirectories = [
  "apps/web",
  "apps/admin",
  "services/fetchers",
  "services/relay",
  "services/api",
  "services/workers",
  "services/ml",
  "services/indexer",
  "packages/ui",
  "packages/contracts",
  "packages/sdk",
  "packages/config",
  "database/migrations",
  "database/ddl",
  "database/seeds",
  "infra/docker",
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

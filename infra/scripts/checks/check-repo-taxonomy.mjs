import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();

const productionSourcePrefixes = [
  /^runtime\/node\/apps\/[^/]+\/src\//,
  /^runtime\/node\/packages\/[^/]+\/src\//,
  /^runtime\/node\/services\/[^/]+\/src\//,
  /^runtime\/python\/src\/signalops\//,
];

const oldRuntimeRootPrefixes = [/^apps\//u, /^packages\//u, /^services\//u];

const forbiddenProductionSegments = new Set([
  "__tests__",
  "fixture",
  "fixtures",
  "mock",
  "mocks",
  "stub",
  "stubs",
  "test",
  "tests",
]);

const forbiddenProductionBasenamePatterns = [
  /(^|[-_.])test([-_.]|$)/u,
  /(^|[-_.])spec([-_.]|$)/u,
  /(^|[-_.])smoke([-_.]|$)/u,
  /(^|[-_.])fixture([-_.]|$)/u,
  /(^|[-_.])mock([-_.]|$)/u,
  /(^|[-_.])stub([-_.]|$)/u,
];

const generatedArtifactPatterns = [
  /^build\//u,
  /(?:^|\/)dist(?:\/|$)/u,
  /(?:^|\/)\.astro(?:\/|$)/u,
  /(?:^|\/)coverage(?:\/|$)/u,
  /(?:^|\/)playwright-report(?:\/|$)/u,
  /(?:^|\/)test-results(?:\/|$)/u,
  /(?:^|\/)blob-report(?:\/|$)/u,
  /(?:^|\/)\.turbo(?:\/|$)/u,
  /(?:^|\/)\.cache(?:\/|$)/u,
  /(?:^|\/)__pycache__(?:\/|$)/u,
  /^data\/(?:models|indices|snapshots|logs)\//u,
];

const allowedDerivedDataFiles = new Set([
  "data/models/.gitkeep",
  "data/models/.gitignore",
  "data/models/README.md",
  "data/indices/.gitkeep",
  "data/indices/.gitignore",
  "data/indices/README.md",
  "data/snapshots/.gitkeep",
  "data/snapshots/.gitignore",
  "data/snapshots/README.md",
  "data/logs/.gitkeep",
  "data/logs/.gitignore",
  "data/logs/README.md",
]);

const allowedInfraScriptRootFiles = new Set(["manual-rss-bundle.template.json"]);
const allowedInfraScriptDirectories = new Set([
  "checks",
  "fetchers",
  "lib",
  "ops",
  "proof",
  "relay",
  "release",
  "workers",
]);

const staleRootScriptPattern =
  /infra\/scripts\/(?:check-[\w.-]+|release-[\w.-]+|ops-beta|test-[\w.-]+|ci-smoke)\.mjs/u;
const staleRuntimePathPattern =
  /(?:^|[\s"'`(])(?:apps|packages|services)\/[^\s"'`)]+(?:src|app|dist|package\.json|tsconfig\.json|astro\.config\.mjs)(?:[\s"'`)]|$)/u;
const stalePythonImportPattern = /\bservices\.(?:api|workers|ml|indexer)(?:\.|\b)/u;
const staleReferenceScanRoots = [
  "package.json",
  "README.md",
  "docs/documentation-inventory.md",
  "docs/product",
  "tests",
  "infra/scripts",
];

function gitFiles(args) {
  const output = execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return output.split("\0").filter(Boolean);
}

function currentRepoFiles() {
  return gitFiles(["ls-files", "-co", "--exclude-standard", "-z"])
    .filter((filePath) => !filePath.startsWith(".aidp/"))
    .filter((filePath) => !filePath.startsWith("aidp-monitor/"))
    .filter((filePath) => existsSync(path.join(repoRoot, filePath)));
}

function trackedRepoFiles() {
  return gitFiles(["ls-files", "-z"])
    .filter((filePath) => !filePath.startsWith(".aidp/"))
    .filter((filePath) => !filePath.startsWith("aidp-monitor/"))
    .filter((filePath) => existsSync(path.join(repoRoot, filePath)));
}

function isProductionSourcePath(filePath) {
  return productionSourcePrefixes.some((pattern) => pattern.test(filePath));
}

function hasForbiddenProductionSegment(filePath) {
  return filePath
    .split("/")
    .slice(0, -1)
    .some((segment) => forbiddenProductionSegments.has(segment.toLowerCase()));
}

function hasForbiddenProductionBasename(filePath) {
  const basename = path.basename(filePath).toLowerCase();
  return forbiddenProductionBasenamePatterns.some((pattern) => pattern.test(basename));
}

function isGeneratedArtifactPath(filePath) {
  if (allowedDerivedDataFiles.has(filePath)) {
    return false;
  }
  return generatedArtifactPatterns.some((pattern) => pattern.test(filePath));
}

function listActiveTextFiles(scanRoot) {
  const absoluteRoot = path.join(repoRoot, scanRoot);
  if (!existsSync(absoluteRoot)) {
    return [];
  }
  if (lstatSync(absoluteRoot).isFile()) {
    return [scanRoot];
  }

  const results = [];
  const stack = [scanRoot];
  while (stack.length > 0) {
    const current = stack.pop();
    const absoluteCurrent = path.join(repoRoot, current);
    for (const entry of readdirSync(absoluteCurrent, { withFileTypes: true })) {
      const relativePath = path.join(current, entry.name).replaceAll(path.sep, "/");
      if (
        relativePath.includes("/node_modules/") ||
        relativePath.includes("/dist/") ||
        relativePath.includes("/.astro/") ||
        relativePath.startsWith("docs/archive/") ||
        relativePath.startsWith("docs/product/operator/old_examples/")
      ) {
        continue;
      }
      if (entry.isDirectory()) {
        stack.push(relativePath);
      } else {
        results.push(relativePath);
      }
    }
  }
  return results;
}

function readTextIfText(filePath) {
  const buffer = readFileSync(path.join(repoRoot, filePath));
  if (buffer.includes(0)) {
    return null;
  }
  return buffer.toString("utf8");
}

const issues = [];
const currentFiles = currentRepoFiles();
const trackedFiles = trackedRepoFiles();

for (const filePath of currentFiles) {
  if (oldRuntimeRootPrefixes.some((pattern) => pattern.test(filePath))) {
    issues.push(`${filePath} lives under an old runtime root; active runtime source must live under runtime/**.`);
  }
  if (
    isProductionSourcePath(filePath) &&
    (hasForbiddenProductionSegment(filePath) || hasForbiddenProductionBasename(filePath))
  ) {
    issues.push(
      `${filePath} is inside production source but looks like a test/proof/fixture/mock/stub file.`
    );
  }
}

for (const filePath of trackedFiles) {
  if (isGeneratedArtifactPath(filePath)) {
    issues.push(`${filePath} is a generated/build/runtime artifact tracked by git.`);
  }
}

const infraScriptsRoot = path.join(repoRoot, "infra/scripts");
if (existsSync(infraScriptsRoot)) {
  for (const entry of readdirSync(infraScriptsRoot, { withFileTypes: true })) {
    if (entry.isDirectory() && !allowedInfraScriptDirectories.has(entry.name)) {
      issues.push(`infra/scripts/${entry.name}/ is not an approved script taxonomy directory.`);
    }
    if (entry.isFile() && !allowedInfraScriptRootFiles.has(entry.name)) {
      issues.push(
        `infra/scripts/${entry.name} must move under checks/, proof/, ops/, release/ or another approved subdirectory.`
      );
    }
  }
}

const filesToScan = new Set();
for (const scanRoot of staleReferenceScanRoots) {
  for (const filePath of listActiveTextFiles(scanRoot)) {
    filesToScan.add(filePath);
  }
}

for (const filePath of filesToScan) {
  const text = readTextIfText(filePath);
  if (text === null) {
    continue;
  }
  if (staleRootScriptPattern.test(text)) {
    issues.push(`${filePath} references an old root infra/scripts entrypoint path.`);
  }
  if (staleRuntimePathPattern.test(text)) {
    issues.push(`${filePath} references an old runtime root path; active runtime paths must use runtime/**.`);
  }
  if (stalePythonImportPattern.test(text)) {
    issues.push(`${filePath} references an old services.* Python import; active imports must use signalops.*.`);
  }
}

if (issues.length > 0) {
  console.error("Repo taxonomy check failed:");
  for (const issue of issues) {
    console.error(`- ${issue}`);
  }
  process.exit(1);
}

console.log(
  "Repo taxonomy check passed: source, tests, proof/check scripts, generated artifacts and active references follow the declared structure."
);

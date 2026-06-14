import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const productionSourcePrefixes = [
  /^runtime\/node\/apps\/[^/]+\/src\//,
  /^runtime\/node\/packages\/[^/]+\/src\//,
  /^runtime\/node\/services\/[^/]+\/src\//,
  /^runtime\/python\/src\/signalops\//
];

const forbiddenDirectorySegments = new Set([
  "__tests__",
  "fixture",
  "fixtures",
  "mock",
  "mocks",
  "stub",
  "stubs",
  "test",
  "tests"
]);

const forbiddenBasenamePatterns = [
  /(^|[-_.])test([-_.]|$)/,
  /(^|[-_.])spec([-_.]|$)/,
  /(^|[-_.])smoke([-_.]|$)/,
  /(^|[-_.])fixture([-_.]|$)/,
  /(^|[-_.])mock([-_.]|$)/,
  /(^|[-_.])stub([-_.]|$)/
];

function listTrackedFiles() {
  const output = execFileSync("git", ["ls-files"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });

  return output.split("\n").filter(Boolean);
}

function isProductionSourcePath(filePath) {
  return productionSourcePrefixes.some((pattern) => pattern.test(filePath));
}

function hasForbiddenSegment(filePath) {
  return filePath
    .split("/")
    .slice(0, -1)
    .some((segment) => forbiddenDirectorySegments.has(segment.toLowerCase()));
}

function hasForbiddenBasename(filePath) {
  const basename = path.basename(filePath).toLowerCase();
  return forbiddenBasenamePatterns.some((pattern) => pattern.test(basename));
}

const violations = listTrackedFiles()
  .filter((filePath) => existsSync(filePath))
  .filter(isProductionSourcePath)
  .filter((filePath) => hasForbiddenSegment(filePath) || hasForbiddenBasename(filePath));

if (violations.length > 0) {
  console.error("Test/proof files must not live under production source directories:");
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  console.error("Move unit tests to tests/**, proof harnesses to infra/scripts/**, and fixtures to infra/fixtures/**.");
  process.exit(1);
}

console.log("Test layout check passed: production source directories are free of tracked test/proof files.");
